import {
  ReasoningQuoteRequest,
  ReasoningStartRequest,
  ReasoningStepRequest,
  allowedReasoningTools,
  contextScopes,
  hashReasoningPayload,
  payloadText,
  remoteToolSpecifications,
  validateRemoteTool,
  type RemoteToolCall,
  type RemoteToolName,
  type ReasoningStepResult,
} from "../../../../packages/agent-runtime/src/reasoning-protocol";
import {
  ReasoningProviderError,
  providerFromReasoningEnvironment,
  providerResult,
  readReasoningPricing,
  reasoningUnavailableReason,
  systemInstruction,
  type ReasoningMessage,
  type ReasoningPricing,
  type ReasoningProvider,
} from "../../../api/src/reasoningProvider";
import {
  HostedError,
  hashValue,
  json,
  readJson,
  type HostedContext,
  type HostedBudget,
  type StoredRecord,
} from "../runtime/contracts";

const namespace = "reasoning";
const inputTokenCeiling = 32000;
const sessionTtl = 15 * 60000;
const leaseMs = 30000;
interface Configuration {
  provider?: ReasoningProvider;
  pricing?: ReasoningPricing;
  enabled: boolean;
  maximumMicroUsd: number;
  budgetMicroUsd: number;
  budgetUsed: number;
  fingerprint: string;
  unavailableReason: string | null;
}
interface QuoteValue {
  payloadHash: string;
  scopes: string[];
  tools: RemoteToolName[];
  allowPersistence: boolean;
  maxSteps: number;
  maxOutputTokens: number;
  inputTokenCeiling: number;
  configuration: string;
}
interface CachedStep {
  id: string;
  hash: string;
  status: number;
  body: ReasoningStepResult | { error: string; kind?: string };
}
interface SessionValue {
  quoteId: string;
  configuration: string;
  messages: ReasoningMessage[];
  tools: RemoteToolName[];
  maxSteps: number;
  maxOutputTokens: number;
  inputTokenCeiling: number;
  steps: number;
  pending: RemoteToolCall[];
  seenCalls: string[];
  completed: CachedStep[];
  done: boolean;
  dispatch?: { id: string; hash: string; leaseUntil: number };
}
const same = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");

async function configuration(ctx: HostedContext): Promise<Configuration> {
  let provider: ReasoningProvider | undefined;
  let invalidEndpoint = false;
  try {
    provider = providerFromReasoningEnvironment(ctx.env);
  } catch {
    invalidEndpoint = true;
  }
  const pricing = readReasoningPricing(ctx.env);
  const enabled = ctx.env.TB_REASONING_ENABLE_PAID === "true";
  const maxRequestUsd = Number(ctx.env.TB_REASONING_MAX_REQUEST_USD ?? 0);
  let budget: HostedBudget | undefined;
  let budgetUnavailable: string | null = null;
  try {
    budget = await ctx.store.budget();
  } catch (error) {
    budgetUnavailable =
      error instanceof HostedError && error.status === 503
        ? "The remote budget is awaiting operator initialization and reconciliation."
        : "The shared remote budget could not be verified.";
  }
  const fingerprint = await hashValue({
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
    endpoint: ctx.env.TB_REASONING_ENDPOINT ?? null,
    pricing: pricing ?? null,
    inputTokenCeiling,
    maxRequestUsd,
  });
  return {
    provider,
    pricing,
    enabled,
    maximumMicroUsd: Math.floor(maxRequestUsd * 1e6),
    budgetMicroUsd: budget?.usdMicroLimit ?? 0,
    budgetUsed: budget?.usdMicroUsed ?? 0,
    fingerprint,
    unavailableReason: invalidEndpoint
      ? "The server reasoning endpoint configuration is invalid."
      : (budgetUnavailable ??
        reasoningUnavailableReason({
          provider,
          pricing,
          enabled,
          dailyUsd: (budget?.usdMicroLimit ?? 0) / 1e6,
          maxRequestUsd,
          now: ctx.now(),
        })),
  };
}

export async function reasoningCapabilities(ctx: HostedContext) {
  const config = await configuration(ctx);
  return {
    configured: !!config.provider,
    paidEnabled: config.enabled,
    ready: !config.unavailableReason,
    model: config.provider?.model ?? null,
    provider: config.provider?.name ?? null,
    liveVerified: false as const,
    unavailableReason: config.unavailableReason,
    maxSteps: 4,
    imagesAccepted: false as const,
    retention:
      "With your explicit text/context consent, this API stores encrypted temporary task state with a 15-minute access limit. The full transcript is cleared when finished or cancelled. Bounded encrypted step responses remain accessible until cancellation or access expiry for retry safety. Expired state is pruned during later activity; physical deletion at exactly 15 minutes is not guaranteed. Prompts are not logged. The external provider has its own retention terms; no zero-retention guarantee is made.",
  };
}

async function quote(request: Request, ctx: HostedContext) {
  const parsed = ReasoningQuoteRequest.safeParse(
    await readJson(request, 16384),
  );
  if (!parsed.success)
    return json(
      {
        error:
          "A reviewed text-payload hash, tool permissions and bounded reasoning limits are required.",
      },
      400,
    );
  const value = parsed.data;
  if (
    !same(value.allowedTools, [...new Set(value.allowedTools)]) ||
    !value.allowedTools.every((tool) =>
      allowedReasoningTools(value.scopes, value.allowPersistence).includes(
        tool,
      ),
    )
  )
    return json(
      {
        error:
          "The selected tools exceed the approved context or persistence permissions.",
      },
      400,
    );
  const config = await configuration(ctx);
  if (config.unavailableReason)
    return json({ error: config.unavailableReason }, 503);
  const microUsd = Math.ceil(
    value.maxSteps *
      (inputTokenCeiling * config.pricing!.inputUsdPerMillion +
        value.maxOutputTokens * config.pricing!.outputUsdPerMillion),
  );
  if (!Number.isSafeInteger(microUsd) || microUsd > config.maximumMicroUsd)
    return json(
      {
        error:
          "The maximum token quote exceeds the operator per-request USD ceiling. Choose fewer steps or tokens.",
      },
      402,
    );
  if (config.budgetUsed + microUsd > config.budgetMicroUsd)
    return json(
      { error: "The shared reasoning budget ceiling has been reached." },
      429,
    );
  const id = crypto.randomUUID();
  const expires = ctx.now() + 5 * 60000;
  const terms: QuoteValue = {
    payloadHash: value.payloadHash,
    scopes: value.scopes,
    tools: value.allowedTools,
    allowPersistence: value.allowPersistence,
    maxSteps: value.maxSteps,
    maxOutputTokens: value.maxOutputTokens,
    inputTokenCeiling,
    configuration: config.fingerprint,
  };
  await ctx.store.createQuote({
    id,
    owner: ctx.session.id,
    operation: "reasoning",
    termsHash: await hashValue(terms),
    credits: 0,
    usdMicro: microUsd,
    expiresAt: expires,
    value: terms,
  });
  return json({
    quoteId: id,
    maximumUsd: microUsd / 1e6,
    currency: "USD",
    maxSteps: value.maxSteps,
    maxOutputTokens: value.maxOutputTokens,
    inputTokenCeiling,
    expiresAt: new Date(expires).toISOString(),
    model: config.provider!.model,
    pricingProvenance: {
      sourceUrl: config.pricing!.sourceUrl,
      reviewedAt: config.pricing!.reviewedAt,
      kind: "operator-reviewed-upper-bound",
    },
    note: "Conservative maximum for all authorized turns. Rates are operator-reviewed, not a live provider-price lookup. The full ceiling is reserved once against the shared operator budget and not refunded automatically, including uncertain failures/cancellation.",
  });
}

async function start(request: Request, ctx: HostedContext) {
  const parsed = ReasoningStartRequest.safeParse(
    await readJson(request, 24576),
  );
  if (!parsed.success)
    return json(
      {
        error:
          "Exact text/context consent and an authorized USD quote are required. Images are not accepted.",
      },
      400,
    );
  const body = parsed.data;
  const text = payloadText(body.payload);
  if (new TextEncoder().encode(text).length > 12000)
    return json(
      {
        error:
          "The reviewed reasoning payload exceeds 12 KB. Select less context.",
      },
      413,
    );
  const approved = await ctx.store.getQuote<QuoteValue>(
    body.quoteId,
    ctx.session.id,
  );
  if (
    !approved ||
    approved.operation !== "reasoning" ||
    approved.expiresAt <= ctx.now()
  )
    return json(
      {
        error:
          "The quote, reviewed payload or scope permissions changed. Review and quote this exact request again.",
      },
      400,
    );
  const terms = approved.value;
  const payloadHash = await hashReasoningPayload(body.payload);
  if (
    terms.payloadHash !== payloadHash ||
    body.consent.approvedPayloadHash !== payloadHash ||
    !same(terms.scopes, contextScopes(body.payload.context)) ||
    !same(terms.scopes, body.consent.scopes) ||
    !same(terms.tools, body.payload.allowedTools) ||
    terms.allowPersistence !== body.payload.allowPersistence ||
    (await hashValue(terms)) !== approved.termsHash
  )
    return json(
      {
        error:
          "The quote, reviewed payload or scope permissions changed. Review and quote this exact request again.",
      },
      400,
    );
  if (body.maxUsd + 1e-9 < approved.usdMicro / 1e6)
    return json({ error: "The approved USD ceiling is below the quote." }, 402);
  const config = await configuration(ctx);
  if (config.unavailableReason || terms.configuration !== config.fingerprint)
    return json(
      {
        error:
          "Reasoning configuration changed or is unavailable. Review a new quote.",
      },
      503,
    );
  const expiresAt = ctx.now() + sessionTtl;
  const value: SessionValue = {
    quoteId: approved.id,
    configuration: terms.configuration,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          goal: body.payload.goal,
          approvedContext: body.payload.context,
        }),
      },
    ],
    tools: terms.tools,
    maxSteps: terms.maxSteps,
    maxOutputTokens: terms.maxOutputTokens,
    inputTokenCeiling: terms.inputTokenCeiling,
    steps: 0,
    pending: [],
    seenCalls: [],
    completed: [],
    done: false,
  };
  // The awaited store transaction validates the exact operator grant, consumes
  // the quote, reserves both budget units and creates the encrypted session.
  const consumed = await ctx.store.consumeQuoteAndCreate({
    quoteId: approved.id,
    owner: ctx.session.id,
    operator: ctx.operator,
    operation: "reasoning",
    termsHash: approved.termsHash,
    record: { namespace, id: approved.id, expiresAt, value },
  });
  return json({
    sessionId: consumed.record.id,
    expiresAt: new Date(consumed.record.expiresAt).toISOString(),
    reservedMaximumUsd: consumed.reservation.usdMicro / 1e6,
  });
}

const update = (
  ctx: HostedContext,
  record: StoredRecord<SessionValue>,
  value: SessionValue,
) => ctx.store.compareAndSwap({ ...record, value });

async function terminateUncertain(
  ctx: HostedContext,
  record: StoredRecord<SessionValue>,
) {
  const dispatch = record.value.dispatch!;
  const body = {
    error:
      "The outcome of the earlier provider request could not be confirmed. No automatic retry was sent. Review a new quote to continue; the earlier dispatch may still be billed.",
    kind: "upstream",
  };
  const saved = await update(ctx, record, {
    ...record.value,
    done: true,
    messages: [],
    pending: [],
    dispatch: undefined,
    completed: [
      ...record.value.completed,
      { id: dispatch.id, hash: dispatch.hash, status: 409, body },
    ],
  });
  return saved
    ? json(body, 409)
    : json(
        {
          error:
            "The reasoning session changed. No additional model request was sent.",
        },
        409,
      );
}

async function step(request: Request, ctx: HostedContext, id: string) {
  const record = await ctx.store.get<SessionValue>(
    namespace,
    id,
    ctx.session.id,
  );
  if (!record || record.expiresAt <= ctx.now())
    return json(
      { error: "This reasoning session does not exist or has expired." },
      404,
    );
  const parsed = ReasoningStepRequest.safeParse(await readJson(request, 16384));
  if (!parsed.success)
    return json(
      {
        error:
          "A unique step identifier and bounded actual tool feedback are required.",
      },
      400,
    );
  const body = parsed.data;
  const requestHash = await hashValue(body);
  const session = record.value;
  const cached = session.completed.find((entry) => entry.id === body.stepId);
  if (cached)
    return cached.hash === requestHash
      ? json(cached.body, cached.status)
      : json(
          {
            error:
              "This step identifier was already used for different feedback.",
          },
          409,
        );
  if (session.dispatch) {
    if (
      session.dispatch.id === body.stepId &&
      session.dispatch.hash !== requestHash
    )
      return json(
        {
          error:
            "This step identifier was already used for different feedback.",
        },
        409,
      );
    if (session.dispatch.leaseUntil <= ctx.now())
      return terminateUncertain(ctx, record);
    return json(
      {
        error:
          "A reasoning turn is already running. No second model call was started.",
      },
      409,
    );
  }
  if (session.done || session.steps >= session.maxSteps)
    return json(
      {
        error:
          "This reasoning session has ended. Review a new quote to continue.",
      },
      409,
    );
  if (
    session.pending.length !== body.feedback.length ||
    !session.pending.every((call) =>
      body.feedback.some(
        (feedback) =>
          feedback.callId === call.id && feedback.name === call.name,
      ),
    )
  )
    return json(
      { error: "Feedback must match the exact pending local tool call." },
      400,
    );
  const config = await configuration(ctx);
  if (config.unavailableReason || config.fingerprint !== session.configuration)
    return json(
      {
        error:
          "Reasoning configuration changed or is unavailable. Review a new quote.",
      },
      503,
    );
  // Authorization is rechecked on every paid continuation, independently of
  // the already-reserved balance. Revoked grants cannot dispatch more turns.
  await ctx.store.assertContinuation(
    session.quoteId,
    ctx.session.id,
    ctx.operator,
  );
  const messages: ReasoningMessage[] = [
    ...session.messages,
    ...body.feedback.map((feedback) => ({
      role: "tool" as const,
      content: JSON.stringify(feedback),
      callId: feedback.callId,
      isError: feedback.status !== "succeeded",
    })),
  ];
  const tools = remoteToolSpecifications(session.tools);
  if (
    new TextEncoder().encode(
      JSON.stringify({ system: systemInstruction, messages, tools }),
    ).length >
    session.inputTokenCeiling - 2048
  ) {
    await update(ctx, record, {
      ...session,
      done: true,
      messages: [],
      pending: [],
    });
    return json(
      {
        error:
          "The conversation reached its conservative input-token ceiling. Review a shorter request; no additional call was sent.",
      },
      413,
    );
  }
  const claimed = await update(ctx, record, {
    ...session,
    messages,
    pending: [],
    steps: session.steps + 1,
    dispatch: {
      id: body.stepId,
      hash: requestHash,
      leaseUntil: ctx.now() + leaseMs,
    },
  });
  if (!claimed)
    return json(
      {
        error:
          "The reasoning session changed. No second model call was started.",
      },
      409,
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 25000);
  let response: CachedStep;
  let next: SessionValue;
  try {
    const raw = await config.provider!.complete({
      system: systemInstruction,
      messages,
      tools,
      maxOutputTokens: session.maxOutputTokens,
      signal: controller.signal,
    });
    if (controller.signal.aborted)
      throw new ReasoningProviderError(
        "cancelled",
        "Reasoning was cancelled or reached the 25-second provider timeout. Dispatched provider work may still be billed.",
      );
    const result = providerResult.parse(raw);
    const calls = result.calls.map((call) =>
      validateRemoteTool(call, session.tools),
    );
    if (calls.some((call) => session.seenCalls.includes(call.id)))
      throw new ReasoningProviderError(
        "invalid-output",
        "The provider repeated a tool-call identifier; the action was not repeated.",
      );
    if (
      result.inputTokens !== null &&
      result.inputTokens > session.inputTokenCeiling
    )
      throw new ReasoningProviderError(
        "invalid-output",
        "The provider reported input usage beyond the configured token bound. Review operator pricing and token settings before retrying.",
      );
    if (
      result.outputTokens !== null &&
      result.outputTokens > session.maxOutputTokens
    )
      throw new ReasoningProviderError(
        "invalid-output",
        "The provider reported output usage beyond the authorized limit.",
      );
    const stepResult: ReasoningStepResult = {
      status: calls.length ? "needs-tools" : "done",
      calls,
      guidance: result.guidance,
      stepsUsed: claimed.value.steps,
      stepsRemaining: session.maxSteps - claimed.value.steps,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    };
    response = {
      id: body.stepId,
      hash: requestHash,
      status: 200,
      body: stepResult,
    };
    const done = !calls.length || claimed.value.steps >= session.maxSteps;
    next = {
      ...claimed.value,
      messages: done
        ? []
        : [...messages, { role: "assistant", content: result.guidance, calls }],
      pending: calls,
      seenCalls: [...session.seenCalls, ...calls.map((call) => call.id)],
      done,
      dispatch: undefined,
      completed: [...session.completed, response],
    };
  } catch (error) {
    const failure = controller.signal.aborted
      ? new ReasoningProviderError(
          "cancelled",
          "Reasoning was cancelled or reached the 25-second provider timeout. Dispatched provider work may still be billed.",
        )
      : error;
    response = {
      id: body.stepId,
      hash: requestHash,
      status:
        failure instanceof ReasoningProviderError &&
        failure.kind === "cancelled"
          ? 409
          : 502,
      body: {
        error:
          failure instanceof ReasoningProviderError
            ? failure.message
            : "The provider returned an invalid or unapproved tool plan. No unvalidated action was executed.",
        kind:
          failure instanceof ReasoningProviderError
            ? failure.kind
            : "invalid-output",
      },
    };
    next = {
      ...claimed.value,
      done: true,
      messages: [],
      pending: [],
      dispatch: undefined,
      completed: [...session.completed, response],
    };
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
  // Never expose an actionable result before it is durably cached. If this
  // write fails, the dispatch marker survives and prevents a paid retry.
  const saved = await update(ctx, claimed, next);
  if (!saved)
    return json(
      {
        error:
          "Reasoning was cancelled or changed. The provider request may still be billed; no tool plan was returned.",
      },
      409,
    );
  return json(response.body, response.status);
}

export async function handleReasoning(
  request: Request,
  ctx: HostedContext,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/reasoning/")) return null;
  try {
    if (request.method === "GET" && path === "/api/reasoning/capabilities")
      return json(await reasoningCapabilities(ctx));
    if (request.method === "POST" && path === "/api/reasoning/quotes")
      return await quote(request, ctx);
    if (request.method === "POST" && path === "/api/reasoning/sessions")
      return await start(request, ctx);
    const match = path.match(
      /^\/api\/reasoning\/sessions\/([0-9a-f-]{36})(\/step)?$/i,
    );
    if (!match) return null;
    if (request.method === "POST" && match[2])
      return await step(request, ctx, match[1]);
    if (request.method === "DELETE" && !match[2]) {
      const removed = await ctx.store.delete(
        namespace,
        match[1],
        ctx.session.id,
      );
      return removed
        ? json({
            cancelled: true,
            note: "Conversation content was removed from this API. A dispatched provider request may still be billed or retained under the provider terms.",
          })
        : json({ error: "This reasoning session does not exist." }, 404);
    }
    return null;
  } catch (error) {
    if (error instanceof HostedError)
      return json({ error: error.message }, error.status);
    return json(
      {
        error:
          "The durable reasoning workflow could not be verified. No automatic provider retry was sent.",
      },
      503,
    );
  }
}
