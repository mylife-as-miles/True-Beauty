import {
  ReasoningProviderError,
  readReasoningPricing,
  providerFromReasoningEnvironment,
  reasoningUnavailableReason,
  providerResult,
  systemInstruction,
  type ReasoningMessage,
  type ReasoningPricing,
  type ReasoningProvider,
} from "./reasoningProvider";
export {
  AnthropicMessagesProvider,
  OpenAICompatibleReasoningProvider,
  ReasoningPricingSchema,
  ReasoningProviderError,
  type ReasoningMessage,
  type ReasoningPricing,
  type ReasoningProvider,
} from "./reasoningProvider";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  ReasoningQuoteRequest,
  ReasoningStartRequest,
  ReasoningStepRequest,
  allowedReasoningTools,
  contextScopes,
  payloadText,
  remoteToolSpecifications,
  validateRemoteTool,
  type RemoteToolCall,
  type RemoteToolName,
  type ReasoningStepResult,
} from "../../../packages/agent-runtime/src/reasoning-protocol";

export interface ReasoningLedger {
  usedMicroUsd(): number;
  reserveMicroUsd(amount: number, maximum: number): void;
}
export class FileReasoningLedger implements ReasoningLedger {
  constructor(
    private readonly path = resolve(".runtime/reasoning-usage.json"),
    private readonly now = Date.now,
  ) {}
  private read() {
    const date = new Date(this.now()).toISOString().slice(0, 10);
    try {
      const row = JSON.parse(readFileSync(this.path, "utf8"));
      if (
        typeof row.date !== "string" ||
        !Number.isSafeInteger(row.microUsd) ||
        row.microUsd < 0
      )
        throw new Error("Invalid reasoning usage ledger");
      return row.date === date ? row : { date, microUsd: 0 };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { date, microUsd: 0 };
      throw error;
    }
  }
  usedMicroUsd() {
    return this.read().microUsd as number;
  }
  reserveMicroUsd(amount: number, maximum: number) {
    const current = this.read();
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !Number.isSafeInteger(maximum) ||
      current.microUsd + amount > maximum
    )
      throw new Error("The reasoning daily ceiling has been reached");
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(
      this.path + ".tmp",
      JSON.stringify({
        date: current.date,
        microUsd: current.microUsd + amount,
      }),
      { mode: 0o600 },
    );
    renameSync(this.path + ".tmp", this.path);
  }
}
interface QuoteRecord {
  owner: string;
  hash: string;
  scopes: string[];
  tools: RemoteToolName[];
  allowPersistence: boolean;
  maxSteps: number;
  maxOutputTokens: number;
  microUsd: number;
  expires: number;
  sessionId?: string;
}
interface ReasoningSession {
  owner: string;
  messages: ReasoningMessage[];
  tools: RemoteToolName[];
  maxSteps: number;
  maxOutputTokens: number;
  steps: number;
  expires: number;
  pending: RemoteToolCall[];
  seenCalls: Set<string>;
  busy: boolean;
  controller?: AbortController;
  done: boolean;
  last?: { stepId: string; hash: string; result: ReasoningStepResult };
}
export interface ReasoningOptions {
  sessionId: (request: FastifyRequest) => string | undefined;
  now?: () => number;
  provider?: ReasoningProvider;
  pricing?: ReasoningPricing;
  ledger?: ReasoningLedger;
  enabled?: boolean;
  dailyUsd?: number;
  maxRequestUsd?: number;
  inputTokenCeiling?: number;
}
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const same = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");
export function registerReasoningRoutes(
  app: FastifyInstance,
  options: ReasoningOptions,
) {
  const now = options.now ?? Date.now,
    provider =
      options.provider ?? providerFromReasoningEnvironment(process.env),
    pricing = options.pricing ?? readReasoningPricing(process.env),
    enabled =
      options.enabled ?? process.env.TB_REASONING_ENABLE_PAID === "true",
    dailyUsd =
      options.dailyUsd ?? Number(process.env.TB_REASONING_DAILY_USD ?? 0),
    maxRequestUsd =
      options.maxRequestUsd ??
      Number(process.env.TB_REASONING_MAX_REQUEST_USD ?? 0),
    inputTokenCeiling = options.inputTokenCeiling ?? 32000,
    ledger =
      options.ledger ??
      new FileReasoningLedger(
        resolve(
          process.env.TB_REASONING_USAGE_PATH ??
            ".runtime/reasoning-usage.json",
        ),
        now,
      );
  if (
    !Number.isInteger(inputTokenCeiling) ||
    inputTokenCeiling < 8000 ||
    inputTokenCeiling > 64000
  )
    throw new Error("Invalid reasoning input-token ceiling");
  const quotes = new Map<string, QuoteRecord>(),
    sessions = new Map<string, ReasoningSession>();
  const unavailableReason = () =>
    reasoningUnavailableReason({
      provider,
      pricing,
      enabled,
      dailyUsd,
      maxRequestUsd,
      now: now(),
    });
  const sweep = () => {
    for (const [id, quote] of quotes)
      if (quote.expires < now()) quotes.delete(id);
    for (const [id, session] of sessions)
      if (session.expires < now()) {
        session.controller?.abort();
        session.messages = [];
        sessions.delete(id);
      }
  };
  const timer = setInterval(sweep, 60000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    for (const session of sessions.values()) session.controller?.abort();
    sessions.clear();
    quotes.clear();
  });
  const getCapabilities = () => ({
    configured: !!provider,
    paidEnabled: enabled,
    ready: !unavailableReason(),
    model: provider?.model ?? null,
    provider: provider?.name ?? null,
    liveVerified: false,
    unavailableReason: unavailableReason(),
    maxSteps: 4,
    imagesAccepted: false,
    retention:
      "This API holds approved text and tool feedback in volatile memory for at most 15 minutes, clears the full transcript when finished, retains only its last bounded response for retry safety until cancellation/expiry, and does not log prompts. The external provider has its own retention terms; no zero-retention guarantee is made.",
  });
  app.get("/api/reasoning/capabilities", async () => getCapabilities());
  app.post("/api/reasoning/quotes", async (req, reply) => {
    const owner = options.sessionId(req);
    if (!owner) {
      reply.code(403);
      return { error: "A current local API session is required." };
    }
    const body = ReasoningQuoteRequest.safeParse(req.body);
    if (!body.success) {
      reply.code(400);
      return {
        error:
          "A reviewed text-payload hash, tool permissions and bounded reasoning limits are required.",
      };
    }
    const reason = unavailableReason();
    if (reason) {
      reply.code(503);
      return { error: reason };
    }
    const value = body.data;
    if (
      !same(value.allowedTools, [...new Set(value.allowedTools)]) ||
      !value.allowedTools.every((tool) =>
        allowedReasoningTools(value.scopes, value.allowPersistence).includes(
          tool,
        ),
      )
    ) {
      reply.code(400);
      return {
        error:
          "The selected tools exceed the approved context or persistence permissions.",
      };
    }
    const microUsd = Math.ceil(
      value.maxSteps *
        (inputTokenCeiling * pricing!.inputUsdPerMillion +
          value.maxOutputTokens * pricing!.outputUsdPerMillion),
    );
    if (microUsd > Math.floor(maxRequestUsd * 1e6)) {
      reply.code(402);
      return {
        error:
          "The maximum token quote exceeds the operator per-request USD ceiling. Choose fewer steps or tokens.",
      };
    }
    try {
      if (ledger.usedMicroUsd() + microUsd > Math.floor(dailyUsd * 1e6)) {
        reply.code(429);
        return { error: "The daily reasoning ceiling has been reached." };
      }
    } catch {
      reply.code(503);
      return {
        error:
          "The spending ledger could not be verified; reasoning is disabled.",
      };
    }
    sweep();
    if (quotes.size >= 100) {
      reply.code(503);
      return { error: "The reasoning quote service is at capacity." };
    }
    const id = randomUUID(),
      expires = now() + 5 * 60000;
    quotes.set(id, {
      owner,
      hash: value.payloadHash,
      scopes: value.scopes,
      tools: value.allowedTools,
      allowPersistence: value.allowPersistence,
      maxSteps: value.maxSteps,
      maxOutputTokens: value.maxOutputTokens,
      microUsd,
      expires,
    });
    return {
      quoteId: id,
      maximumUsd: microUsd / 1e6,
      currency: "USD",
      maxSteps: value.maxSteps,
      maxOutputTokens: value.maxOutputTokens,
      inputTokenCeiling,
      expiresAt: new Date(expires).toISOString(),
      model: provider!.model,
      pricingProvenance: {
        sourceUrl: pricing!.sourceUrl,
        reviewedAt: pricing!.reviewedAt,
        kind: "operator-reviewed-upper-bound",
      },
      note: "Conservative maximum for all authorized turns. Rates are operator-reviewed, not a live provider-price lookup. The full ceiling is reserved once and not refunded automatically, including uncertain failures/cancellation.",
    };
  });
  app.post("/api/reasoning/sessions", async (req, reply) => {
    const owner = options.sessionId(req);
    if (!owner) {
      reply.code(403);
      return { error: "A current local API session is required." };
    }
    const parsed = ReasoningStartRequest.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error:
          "Exact text/context consent and an authorized USD quote are required. Images are not accepted.",
      };
    }
    const body = parsed.data,
      quote = quotes.get(body.quoteId),
      text = payloadText(body.payload);
    if (new TextEncoder().encode(text).length > 12000) {
      reply.code(413);
      return {
        error:
          "The reviewed reasoning payload exceeds 12 KB. Select less context.",
      };
    }
    if (
      !quote ||
      quote.owner !== owner ||
      quote.expires < now() ||
      quote.hash !== hash(text) ||
      body.consent.approvedPayloadHash !== quote.hash ||
      !same(quote.scopes, contextScopes(body.payload.context)) ||
      !same(quote.scopes, body.consent.scopes) ||
      !same(quote.tools, body.payload.allowedTools) ||
      quote.allowPersistence !== body.payload.allowPersistence
    ) {
      reply.code(400);
      return {
        error:
          "The quote, reviewed payload or scope permissions changed. Review and quote this exact request again.",
      };
    }
    if (body.maxUsd + 1e-9 < quote.microUsd / 1e6) {
      reply.code(402);
      return { error: "The approved USD ceiling is below the quote." };
    }
    if (quote.sessionId)
      return {
        sessionId: quote.sessionId,
        expiresAt: new Date(
          sessions.get(quote.sessionId)?.expires ?? now(),
        ).toISOString(),
        reservedMaximumUsd: quote.microUsd / 1e6,
      };
    if (unavailableReason()) {
      reply.code(503);
      return { error: "Reasoning configuration is unavailable." };
    }
    sweep();
    if (sessions.size >= 100) {
      reply.code(503);
      return { error: "The reasoning service is at capacity." };
    }
    try {
      ledger.reserveMicroUsd(quote.microUsd, Math.floor(dailyUsd * 1e6));
    } catch {
      reply.code(429);
      return {
        error:
          "The daily reasoning ceiling was reached. No model request was sent.",
      };
    }
    const id = randomUUID(),
      expires = now() + 15 * 60000;
    sessions.set(id, {
      owner,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            goal: body.payload.goal,
            approvedContext: body.payload.context,
          }),
        },
      ],
      tools: quote.tools,
      maxSteps: quote.maxSteps,
      maxOutputTokens: quote.maxOutputTokens,
      steps: 0,
      expires,
      pending: [],
      seenCalls: new Set(),
      busy: false,
      done: false,
    });
    quote.sessionId = id;
    return {
      sessionId: id,
      expiresAt: new Date(expires).toISOString(),
      reservedMaximumUsd: quote.microUsd / 1e6,
    };
  });
  app.post<{ Params: { id: string } }>(
    "/api/reasoning/sessions/:id/step",
    async (req, reply) => {
      const owner = options.sessionId(req),
        session = sessions.get(req.params.id);
      if (
        !owner ||
        !session ||
        session.owner !== owner ||
        session.expires < now()
      ) {
        reply.code(404);
        return {
          error: "This reasoning session does not exist or has expired.",
        };
      }
      const parsed = ReasoningStepRequest.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return {
          error:
            "A unique step identifier and bounded actual tool feedback are required.",
        };
      }
      const body = parsed.data,
        requestHash = hash(JSON.stringify(body));
      if (session.last?.stepId === body.stepId) {
        if (session.last.hash !== requestHash) {
          reply.code(409);
          return {
            error:
              "This step identifier was already used for different feedback.",
          };
        }
        return session.last.result;
      }
      if (session.busy) {
        reply.code(409);
        return {
          error:
            "A reasoning turn is already running. No second model call was started.",
        };
      }
      if (session.done || session.steps >= session.maxSteps) {
        reply.code(409);
        return {
          error:
            "This reasoning session has ended. Review a new quote to continue.",
        };
      }
      if (
        session.pending.length !== body.feedback.length ||
        !session.pending.every((call) =>
          body.feedback.some(
            (feedback) =>
              feedback.callId === call.id && feedback.name === call.name,
          ),
        )
      ) {
        reply.code(400);
        return {
          error: "Feedback must match the exact pending local tool call.",
        };
      }
      if (unavailableReason()) {
        reply.code(503);
        return { error: "Reasoning configuration is unavailable." };
      }
      for (const feedback of body.feedback)
        session.messages.push({
          role: "tool",
          content: JSON.stringify(feedback),
          callId: feedback.callId,
          isError: feedback.status !== "succeeded",
        });
      session.pending = [];
      const tools = remoteToolSpecifications(session.tools),
        serialized = JSON.stringify({
          system: systemInstruction,
          messages: session.messages,
          tools,
        });
      if (Buffer.byteLength(serialized, "utf8") > inputTokenCeiling - 2048) {
        session.done = true;
        session.messages = [];
        reply.code(413);
        return {
          error:
            "The conversation reached its conservative input-token ceiling. Review a shorter request; no additional call was sent.",
        };
      }
      session.busy = true;
      session.controller = new AbortController();
      const timeout = setTimeout(() => session.controller?.abort(), 25000);
      timeout.unref();
      try {
        session.steps++;
        const raw = await provider!.complete({
          system: systemInstruction,
          messages: session.messages,
          tools,
          maxOutputTokens: session.maxOutputTokens,
          signal: session.controller.signal,
        });
        if (session.controller.signal.aborted || !sessions.has(req.params.id))
          throw new ReasoningProviderError(
            "cancelled",
            "Reasoning was cancelled. Already dispatched provider work may still be billed.",
          );
        const parsedResult = providerResult.parse(raw),
          calls = parsedResult.calls.map((call) =>
            validateRemoteTool(call, session.tools),
          );
        if (calls.some((call) => session.seenCalls.has(call.id)))
          throw new ReasoningProviderError(
            "invalid-output",
            "The provider repeated a tool-call identifier; the action was not repeated.",
          );
        for (const call of calls) session.seenCalls.add(call.id);
        if (
          parsedResult.inputTokens !== null &&
          parsedResult.inputTokens > inputTokenCeiling
        )
          throw new ReasoningProviderError(
            "invalid-output",
            "The provider reported input usage beyond the configured token bound. Review operator pricing and token settings before retrying.",
          );
        if (
          parsedResult.outputTokens !== null &&
          parsedResult.outputTokens > session.maxOutputTokens
        )
          throw new ReasoningProviderError(
            "invalid-output",
            "The provider reported output usage beyond the authorized limit.",
          );
        session.messages.push({
          role: "assistant",
          content: parsedResult.guidance,
          calls,
        });
        session.pending = calls;
        const result: ReasoningStepResult = {
          status: calls.length ? "needs-tools" : "done",
          calls,
          guidance: parsedResult.guidance,
          stepsUsed: session.steps,
          stepsRemaining: session.maxSteps - session.steps,
          usage: {
            inputTokens: parsedResult.inputTokens,
            outputTokens: parsedResult.outputTokens,
          },
        };
        if (!calls.length) {
          session.done = true;
          session.messages = [];
        }
        session.last = { stepId: body.stepId, hash: requestHash, result };
        return result;
      } catch (error) {
        const failure = session.controller?.signal.aborted
          ? new ReasoningProviderError(
              "cancelled",
              "Reasoning was cancelled or reached the 25-second provider timeout. Dispatched provider work may still be billed.",
            )
          : error;
        session.done = true;
        session.messages = [];
        reply.code(
          failure instanceof ReasoningProviderError &&
            failure.kind === "cancelled"
            ? 409
            : 502,
        );
        return {
          error:
            failure instanceof ReasoningProviderError
              ? failure.message
              : "The provider returned an invalid or unapproved tool plan. No unvalidated action was executed.",
          kind:
            failure instanceof ReasoningProviderError
              ? failure.kind
              : "invalid-output",
        };
      } finally {
        clearTimeout(timeout);
        session.busy = false;
        session.controller = undefined;
      }
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/reasoning/sessions/:id",
    async (req, reply) => {
      const session = sessions.get(req.params.id);
      if (!session || session.owner !== options.sessionId(req)) {
        reply.code(404);
        return { error: "This reasoning session does not exist." };
      }
      session.controller?.abort();
      session.messages = [];
      sessions.delete(req.params.id);
      return {
        cancelled: true,
        note: "Conversation content was removed from this API. A dispatched provider request may still be billed or retained under the provider terms.",
      };
    },
  );
  return { capabilities: getCapabilities };
}
