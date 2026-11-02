/** Native Fetch YouCam workflows. Actual MIT MIROIR-derived provider adapters are shared
 * with the Node pilot. All durable values go through the encrypted HostedStore;
 * source bytes/base64 and generated image bytes never enter D1 or R2. */
import {
  ApprovedPlan,
  QuoteRequest,
  SkinTaskRequest,
} from "../../../api/src/contracts";
import { imageBytes } from "../../../api/src/youcamImage";
import { PerfectCorpProvider } from "../../../api/src/youcamSkinProvider";
import { YouCamGenerationProvider } from "../../../api/src/generationProvider";
import {
  GenerationPlan,
  GenerationQuoteRequest,
  GenerationTaskRequest,
  PROVIDER_RETENTION_DAYS,
  PROVIDER_RETENTION_SOURCE,
  type GenerationSpec,
  type GenerationCapabilities,
} from "../../../api/src/generationContracts";
import {
  safeYouCamMediaUrl,
  type YouCamFetch,
} from "../../../api/src/youcamTransport";
import {
  skinProviderFailure,
  type SkinProviderFailure,
} from "../../../api/src/skinProviderFailure";
import {
  parseProviderSkinResult,
  type SkinAnalysisResult,
} from "../../../../packages/skin-engine/src/provider";
import {
  HostedError,
  hashValue,
  json,
  readJson,
  type HostedContext,
  type StoredRecord,
} from "../runtime/contracts";
import type { z } from "zod";
const NS = "youcam-task",
  TASK_TTL = 15 * 60_000,
  QUOTE_TTL = 5 * 60_000,
  DISPATCH_TTL = 35_000,
  POLL_TTL = 22_000;
type Operation = "skin" | "hair" | "clothing";
type SkinSettings = { feature: "skin"; actions: string[] };
type Settings = SkinSettings | GenerationSpec;
type Phase =
  | "pending"
  | "dispatching"
  | "running"
  | "success"
  | "error"
  | "cancelled"
  | "uncertain";
interface QuoteValue {
  settings: Settings;
  credits: number;
  skuHash: string;
  reviewedAt: string;
}
interface TaskValue {
  operation: Operation;
  settings: Settings;
  quoteId: string;
  phase: Phase;
  createdAt: number;
  dispatchUntil?: number;
  upstreamId?: string;
  nextPoll: number;
  pollToken?: string;
  pollUntil?: number;
  providerUrl?: string;
  skinResult?: SkinAnalysisResult;
  receivedAt?: string;
  error?: string;
  providerFailure?: SkinProviderFailure;
}
export interface YouCamRouteDependencies {
  request?: YouCamFetch;
}
const RETENTION = {
  localMinutes: 15 as const,
  providerDays: PROVIDER_RETENTION_DAYS,
  source: PROVIDER_RETENTION_SOURCE,
  upstreamCancellationSupported: false as const,
  upstreamDeletionSupported: false as const,
} as const;
const LOCAL_NOTICE =
  "This task expires after 15 minutes. Local stop/delete cannot cancel provider processing, refund credits, or delete its 30-day copy.";
const UNCERTAIN =
  "Submission could not be verified. Its spending reservation is retained. Check the provider account before any new, separately authorized request; this task will never be automatically resubmitted.";
const fresh = (date: string, now: number) => {
  const age = now - Date.parse(date);
  return age >= -60_000 && age <= 30 * 86400_000;
};
const sameActions = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");
const settingsMatch = (a: Settings, b: Settings) =>
  a.feature === "skin" && b.feature === "skin"
    ? sameActions(a.actions, b.actions)
    : JSON.stringify(a) === JSON.stringify(b);
function configuration(ctx: HostedContext) {
  let skin: z.infer<typeof ApprovedPlan> | undefined;
  let generation: GenerationPlan[] = [];
  try {
    const parsed = ApprovedPlan.parse(
      JSON.parse(ctx.env.YOUCAM_SKIN_PLAN_JSON ?? ""),
    );
    if (fresh(parsed.reviewedAt, ctx.now())) skin = parsed;
  } catch {
    /* Missing or invalid configuration fails closed. */
  }
  try {
    const rows = JSON.parse(ctx.env.YOUCAM_GENERATION_PLANS_JSON ?? "[]");
    if (Array.isArray(rows) && rows.length <= 64)
      generation = rows
        .map((p) => GenerationPlan.parse(p))
        .filter((p) => fresh(p.reviewedAt, ctx.now()));
  } catch {
    /* No partially valid plan set. */
  }
  return {
    skin,
    generation,
    key: ctx.env.YOUCAM_API_KEY,
    enabled: ctx.env.YOUCAM_ENABLE_PAID === "true",
  };
}
async function generationCapabilities(
  ctx: HostedContext,
): Promise<GenerationCapabilities> {
  const config = configuration(ctx);
  let budgetAvailable = true,
    creditsLimit = 0;
  try {
    creditsLimit = (await ctx.store.budget()).creditsLimit;
  } catch (error) {
    if (error instanceof HostedError && error.status === 503)
      budgetAvailable = false;
    else throw error;
  }
  const feature = (name: "hair" | "clothing") => {
    const plans = config.generation.filter((p) => p.spec.feature === name),
      ready =
        !!config.key && config.enabled && creditsLimit > 0 && plans.length > 0;
    return {
      feature: name,
      configured: !!config.key,
      pricingPlanConfigured: plans.length > 0,
      readyForQuote: ready,
      allowedSpecs: plans.map((p) => p.spec),
      reason: !config.key
        ? "The generation provider is not connected."
        : !config.enabled
          ? "Paid generation is disabled by the operator."
          : !budgetAvailable || creditsLimit <= 0
            ? "The operator must reconcile prior spending and initialize the shared credit ceiling."
            : !plans.length
              ? "A current, reviewed pricing plan is required."
              : "Ready to request a current verified credit quote. Owner authorization is required before generation.",
      liveVerified: false as const,
    };
  };
  return {
    provider: "Perfect Corp",
    credentialConfigured: !!config.key,
    paidEnabled: config.enabled,
    budgetConfigured: budgetAvailable && creditsLimit > 0,
    liveVerified: false,
    features: { hair: feature("hair"), clothing: feature("clothing") },
    retention: RETENTION,
  };
}
/** Root /api/capabilities composes these fields with reasoning/merchant capabilities. */
export async function youcamCapabilities(ctx: HostedContext) {
  const config = configuration(ctx),
    generation = await generationCapabilities(ctx);
  return {
    skinAnalysis: {
      configured: !!config.key,
      paidEnabled: config.enabled,
      pricingPlanConfigured: !!config.skin,
      status:
        config.key &&
        config.enabled &&
        config.skin &&
        generation.budgetConfigured
          ? "requires-verified-quote"
          : "unavailable",
      allowedActions: config.skin?.actions ?? [],
      liveVerified: false,
      requiresOperatorApproval: !ctx.operator,
    },
    hairGeneration: generation.features.hair,
    fashionGeneration: generation.features.clothing,
    retention: {
      localServer:
        "Source images stay in request memory. Encrypted task metadata/results expire after 15 minutes.",
      provider:
        "Perfect Corp publishes media/file retention of up to 30 days. Local deletion cannot delete its copy.",
    },
    authorization: {
      operator: ctx.operator,
      requiresExactQuoteApproval: !ctx.operator,
    },
  };
}
async function skuHash(sku: unknown) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(sku)),
  );
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function resultView(task: StoredRecord<TaskValue>) {
  const t = task.value,
    id = task.id;
  const status =
    t.phase === "pending" || t.phase === "dispatching"
      ? t.operation === "skin"
        ? "creating"
        : "uploading"
      : t.phase === "uncertain"
        ? "error"
        : t.phase;
  const result =
    t.phase === "success"
      ? t.operation === "skin" && t.skinResult
        ? {
            ...t.skinResult,
            observations: t.skinResult.observations.map((o, i) => ({
              ...o,
              maskUrls: o.maskUrls.map(
                (_url, j) => `/api/skin/tasks/${id}/masks/${i}/${j}`,
              ),
            })),
          }
        : t.operation !== "skin"
          ? {
              kind: "ai-generated-image",
              provider: "perfect-corp",
              feature: t.operation,
              imagePath: `/api/generation/tasks/${id}/image`,
              receivedAt: t.receivedAt,
              notice:
                t.operation === "hair"
                  ? "AI-generated hairstyle preview, not live AR. Actual hair results may vary."
                  : "AI-generated clothing preview, not live AR or a fit measurement. Actual fit and appearance may vary.",
            }
          : undefined
      : undefined;
  return {
    taskId: id,
    ...(t.operation !== "skin" ? { feature: t.operation } : {}),
    status,
    result,
    error: t.error,
    providerFailure: t.providerFailure,
    uncertain: t.phase === "uncertain",
    pollAfterMs: 10000,
    expiresAt: new Date(task.expiresAt).toISOString(),
    notice: LOCAL_NOTICE,
  };
}
async function update(
  ctx: HostedContext,
  task: StoredRecord<TaskValue>,
  value: TaskValue,
) {
  return ctx.store.compareAndSwap({ ...task, value });
}
async function owned(
  ctx: HostedContext,
  id: string,
  kind: "skin" | "generation",
) {
  const task = await ctx.store.get<TaskValue>(NS, id, ctx.session.id);
  if (
    !task ||
    (kind === "skin"
      ? task.value.operation !== "skin"
      : task.value.operation === "skin")
  )
    throw new HostedError(404, "This task does not exist or has expired.");
  if (
    task.value.phase === "dispatching" &&
    (task.value.dispatchUntil ?? 0) <= ctx.now()
  ) {
    const changed = await update(ctx, task, {
      ...task.value,
      phase: "uncertain",
      error: UNCERTAIN,
    });
    return (
      changed ??
      (await ctx.store.get<TaskValue>(NS, id, ctx.session.id)) ??
      task
    );
  }
  return task;
}
async function allowed(ctx: HostedContext, task: StoredRecord<TaskValue>) {
  await ctx.store.assertContinuation(
    task.value.quoteId,
    ctx.session.id,
    ctx.operator,
  );
}
async function limited(ctx: HostedContext, action: string, maximum: number) {
  if (
    !(await ctx.store.rateLimit(
      `youcam:${action}:${ctx.session.id}`,
      maximum,
      60_000,
    ))
  )
    throw new HostedError(429, "Too many provider requests. Try again later.");
}
function providers(ctx: HostedContext, deps: YouCamRouteDependencies) {
  const key = configuration(ctx).key;
  if (!key)
    throw new HostedError(
      503,
      "The provider is not connected. No image has been sent.",
    );
  return {
    skin: new PerfectCorpProvider(key, deps.request),
    generation: new YouCamGenerationProvider(key, deps.request),
  };
}
async function quote(
  request: Request,
  ctx: HostedContext,
  kind: "skin" | "generation",
  deps: YouCamRouteDependencies,
) {
  await limited(ctx, "quote", 12);
  const raw = await readJson(request, 32 * 1024),
    config = configuration(ctx),
    budget = await ctx.store.budget();
  if (!config.key || !config.enabled || budget.creditsLimit <= 0)
    throw new HostedError(
      503,
      "Live provider processing is not enabled. Local exploration remains available.",
    );
  let value: QuoteValue;
  if (kind === "skin") {
    const parsed = QuoteRequest.safeParse(raw);
    if (!parsed.success)
      throw new HostedError(400, "Select a valid set of skin concerns.");
    const plan = config.skin;
    if (!plan || !sameActions(plan.actions, parsed.data.actions))
      throw new HostedError(
        503,
        "This exact concern set has no current reviewed pricing plan.",
      );
    value = {
      settings: { feature: "skin", actions: plan.actions },
      credits: plan.credits,
      skuHash: plan.skuHash,
      reviewedAt: plan.reviewedAt,
    };
  } else {
    const parsed = GenerationQuoteRequest.safeParse(raw);
    if (!parsed.success)
      throw new HostedError(400, "Choose supported generation settings.");
    const plan = config.generation.find((p) =>
      settingsMatch(p.spec, parsed.data.spec),
    );
    if (!plan)
      throw new HostedError(
        503,
        "This exact generation setting has no current reviewed pricing plan.",
      );
    value = {
      settings: plan.spec,
      credits: plan.credits,
      skuHash: plan.skuHash,
      reviewedAt: plan.reviewedAt,
    };
  }
  const provider = providers(ctx, deps),
    signal = AbortSignal.timeout(20_000);
  let rows: unknown[];
  try {
    rows =
      value.settings.feature === "skin"
        ? await provider.skin.pricing(signal)
        : await provider.generation.pricing(value.settings.feature, signal);
  } catch {
    throw new HostedError(
      502,
      "Current provider pricing could not be verified. No image has been sent.",
    );
  }
  const hashes = await Promise.all(rows.map(skuHash));
  if (!hashes.includes(value.skuHash))
    throw new HostedError(
      503,
      "The current provider price differs from the reviewed plan. No image has been sent.",
    );
  if (budget.creditsUsed + value.credits > budget.creditsLimit)
    throw new HostedError(429, "The shared credit ceiling has been reached.");
  const id = crypto.randomUUID(),
    expiresAt = ctx.now() + QUOTE_TTL;
  const stored = await ctx.store.createQuote({
    id,
    owner: ctx.session.id,
    operation: value.settings.feature,
    termsHash: await hashValue(value),
    credits: value.credits,
    usdMicro: 0,
    expiresAt,
    value,
  });
  const access = await ctx.store.quoteAccess(id, ctx.session.id, ctx.operator);
  return json({
    quoteId: id,
    credits: value.credits,
    unit: "provider credits",
    expiresAt: new Date(expiresAt).toISOString(),
    ...(value.settings.feature === "skin"
      ? {
          actions: value.settings.actions,
          pricingProvenance: {
            skuHash: value.skuHash,
            reviewedAt: value.reviewedAt,
            source: "current-provider-feature-cost",
          },
        }
      : {
          spec: value.settings,
          pricing: {
            skuHash: value.skuHash,
            reviewedAt: value.reviewedAt,
            source: "current-provider-feature-cost",
          },
        }),
    retention: RETENTION,
    authorization: access,
    termsHash: stored.termsHash,
    notice:
      "One exact quoted operation only. Owner authorization and explicit upload/retention/credit consent are required. No automatic paid retry.",
  });
}
async function submit(
  request: Request,
  ctx: HostedContext,
  kind: "skin" | "generation",
  deps: YouCamRouteDependencies,
) {
  await limited(ctx, "submit", 8);
  const raw = await readJson(
    request,
    kind === "generation" ? 12 * 1024 * 1024 : 6 * 1024 * 1024,
  );
  const skin = kind === "skin" ? SkinTaskRequest.safeParse(raw) : null,
    gen = kind === "generation" ? GenerationTaskRequest.safeParse(raw) : null;
  if ((skin && !skin.success) || (gen && !gen.success))
    throw new HostedError(
      400,
      "Valid images, exact quoted settings, explicit consent and authorized credits are required.",
    );
  const skinBody = skin?.success ? skin.data : undefined,
    genBody = gen?.success ? gen.data : undefined;
  const body = skinBody ?? genBody!;
  const settings: Settings = skinBody
    ? { feature: "skin", actions: skinBody.actions }
    : genBody!.spec;
  const existing = await ctx.store.get<TaskValue>(
    NS,
    body.quoteId,
    ctx.session.id,
  );
  if (existing) {
    if (!settingsMatch(existing.value.settings, settings))
      throw new HostedError(400, "This quote belongs to different settings.");
    await allowed(ctx, existing);
    if (existing.value.phase !== "pending")
      return json(resultView(await owned(ctx, body.quoteId, kind)));
  }
  const q = await ctx.store.getQuote<QuoteValue>(body.quoteId, ctx.session.id);
  if (
    !q ||
    q.expiresAt <= ctx.now() ||
    !settingsMatch(q.value.settings, settings)
  )
    throw new HostedError(
      400,
      "The quote expired or does not match this request.",
    );
  if (body.maxCredits < q.credits)
    throw new HostedError(
      402,
      "The authorized credits do not cover this quote. No image has been sent.",
    );
  const config = configuration(ctx);
  if (!config.key || !config.enabled)
    throw new HostedError(503, "Provider processing is disabled.");
  const access = await ctx.store.quoteAccess(
    q.id,
    ctx.session.id,
    ctx.operator,
  );
  if (!access.approved)
    throw new HostedError(
      403,
      "This exact quote requires the Site owner’s authorization before an image can be sent.",
    );
  let source: Uint8Array | undefined, reference: Uint8Array | undefined;
  try {
    try {
      source = skinBody
        ? imageBytes(skinBody.imageBase64, skinBody.contentType)
        : imageBytes(genBody!.source.base64, genBody!.source.contentType);
      if (genBody?.reference)
        reference = imageBytes(
          genBody.reference.base64,
          genBody.reference.contentType,
        );
    } catch {
      throw new HostedError(
        400,
        "Use valid JPEG/PNG source images between 100 bytes and 4MB each.",
      );
    }
    const reserved = await ctx.store.consumeQuoteAndCreate<TaskValue>({
      quoteId: q.id,
      owner: ctx.session.id,
      operator: ctx.operator,
      operation: settings.feature,
      termsHash: q.termsHash,
      record: {
        namespace: NS,
        id: q.id,
        expiresAt: ctx.now() + TASK_TTL,
        value: {
          operation: settings.feature,
          settings,
          quoteId: q.id,
          phase: "pending" as const,
          createdAt: ctx.now(),
          nextPoll: ctx.now() + 10000,
        },
      },
    });
    let task = reserved.record;
    if (task.value.phase !== "pending")
      return json(resultView(await owned(ctx, q.id, kind)));
    const claimed = await update(ctx, task, {
      ...task.value,
      phase: "dispatching",
      dispatchUntil: ctx.now() + DISPATCH_TTL,
    });
    if (!claimed) return json(resultView(await owned(ctx, q.id, kind)), 202);
    task = claimed;
    const provider = providers(ctx, deps),
      signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(DISPATCH_TTL),
      ]);
    const guard = async (checkPrice = false) => {
      if (checkPrice) {
        const configNow = configuration(ctx);
        const planNow =
          settings.feature === "skin"
            ? configNow.skin
            : configNow.generation.find((p) => settingsMatch(p.spec, settings));
        if (
          !planNow ||
          planNow.skuHash !== q.value.skuHash ||
          planNow.credits !== q.credits
        )
          throw new HostedError(
            503,
            "The reviewed pricing plan changed. No new task is authorized.",
          );
        const rows =
          settings.feature === "skin"
            ? await provider.skin.pricing(signal)
            : await provider.generation.pricing(settings.feature, signal);
        if (!(await Promise.all(rows.map(skuHash))).includes(q.value.skuHash))
          throw new HostedError(
            503,
            "The provider price changed after this quote. No new task is authorized.",
          );
      }
      await ctx.store.assertContinuation(q.id, ctx.session.id, ctx.operator);
      const current = await ctx.store.get<TaskValue>(NS, q.id, ctx.session.id);
      if (
        !current ||
        current.value.phase !== "dispatching" ||
        (current.value.dispatchUntil ?? 0) <= ctx.now()
      )
        throw new HostedError(
          409,
          "This local task was stopped, expired or superseded before dispatch.",
        );
      if (!configuration(ctx).enabled)
        throw new HostedError(503, "Paid processing is disabled.");
    };
    try {
      await guard(true);
      const beforePaidCreate = () => guard(true);
      const upstreamId = skinBody
        ? await provider.skin.create(
            source,
            skinBody.contentType,
            skinBody.actions,
            skinBody.overlay,
            signal,
            beforePaidCreate,
          )
        : await provider.generation.create(
            {
              spec: genBody!.spec,
              source: {
                bytes: source,
                contentType: genBody!.source.contentType,
              },
              ...(reference && genBody!.reference
                ? {
                    reference: {
                      bytes: reference,
                      contentType: genBody!.reference.contentType,
                    },
                  }
                : {}),
            },
            signal,
            beforePaidCreate,
          );
      // Persist the known upstream ID, preserving concurrent cancellation. CAS retries
      // repeat metadata writes only; the paid task POST above is never repeated.
      let savedId = false;
      for (let attempt = 0; attempt < 4; attempt++) {
        const current = await ctx.store.get<TaskValue>(
          NS,
          q.id,
          ctx.session.id,
        );
        if (!current)
          throw new HostedError(
            410,
            "This local task was deleted. The provider may already be processing it.",
          );
        if (current.value.upstreamId === upstreamId) {
          task = current;
          savedId = true;
          break;
        }
        const saved = await update(ctx, current, {
          ...current.value,
          upstreamId,
          phase: current.value.phase === "cancelled" ? "cancelled" : "running",
          error: undefined,
          nextPoll: ctx.now() + 10000,
        });
        if (saved) {
          task = saved;
          savedId = true;
          break;
        }
      }
      if (!savedId)
        throw new HostedError(
          503,
          "The provider task identifier could not be saved reliably. Do not submit again without operator review.",
        );
    } catch (error) {
      const current = await ctx.store.get<TaskValue>(NS, q.id, ctx.session.id);
      if (current && current.value.phase === "dispatching") {
        const saved = await update(ctx, current, {
          ...current.value,
          phase: "uncertain",
          error: UNCERTAIN,
        });
        if (saved) task = saved;
      } else if (current) task = current;
      if (
        error instanceof HostedError &&
        [403, 409, 410].includes(error.status)
      )
        throw error;
    }
    return json(resultView(task), 202);
  } finally {
    source?.fill(0);
    reference?.fill(0);
  }
}
async function poll(
  ctx: HostedContext,
  task: StoredRecord<TaskValue>,
  deps: YouCamRouteDependencies,
) {
  await allowed(ctx, task);
  const t = task.value;
  if (
    t.phase !== "running" ||
    !t.upstreamId ||
    t.nextPoll > ctx.now() ||
    (t.pollUntil ?? 0) > ctx.now()
  )
    return task;
  const token = crypto.randomUUID(),
    claimed = await update(ctx, task, {
      ...t,
      nextPoll: ctx.now() + 10000,
      pollToken: token,
      pollUntil: ctx.now() + POLL_TTL,
    });
  if (!claimed)
    return (
      (await ctx.store.get<TaskValue>(NS, task.id, ctx.session.id)) ?? task
    );
  const provider = providers(ctx, deps),
    signal = AbortSignal.timeout(20_000);
  let value: TaskValue = {
    ...claimed.value,
    error: undefined,
    pollUntil: undefined,
  };
  try {
    await allowed(ctx, claimed);
    if (t.operation === "skin") {
      const status = await provider.skin.status(t.upstreamId, signal);
      if (status.task_status === "success") {
        const result = parseProviderSkinResult(
          status,
          new Date(ctx.now()).toISOString(),
        );
        for (const o of result.observations)
          o.maskUrls = o.maskUrls.filter((url) => {
            try {
              safeYouCamMediaUrl(url);
              return true;
            } catch {
              return false;
            }
          });
        value = { ...value, phase: "success", skinResult: result };
      } else if (status.task_status === "error") {
        const failure = skinProviderFailure(status);
        value = {
          ...value,
          phase: "error",
          providerFailure: failure,
          error: `${failure.summary} ${failure.recovery}`,
        };
      } else if (status.task_status !== "running")
        throw new Error("Unknown status");
    } else {
      const status = await provider.generation.status(
        t.operation,
        t.upstreamId,
        signal,
      );
      if (status.status === "success" && status.url) {
        safeYouCamMediaUrl(status.url);
        value = {
          ...value,
          phase: "success",
          providerUrl: status.url,
          receivedAt: new Date(ctx.now()).toISOString(),
        };
      } else if (status.status === "error")
        value = {
          ...value,
          phase: "error",
          error: status.error ?? "The provider could not generate this image.",
        };
    }
  } catch {
    value = {
      ...value,
      error:
        "Status could not be verified. Checking this existing task does not create another paid request.",
    };
  }
  const current = await ctx.store.get<TaskValue>(NS, task.id, ctx.session.id);
  if (
    !current ||
    current.value.phase !== "running" ||
    current.value.pollToken !== token
  )
    return current ?? task;
  return (
    (await update(ctx, current, value)) ??
    (await ctx.store.get<TaskValue>(NS, task.id, ctx.session.id)) ??
    current
  );
}
async function image(
  ctx: HostedContext,
  task: StoredRecord<TaskValue>,
  deps: YouCamRouteDependencies,
  mask?: [number, number],
) {
  await allowed(ctx, task);
  if (task.value.phase !== "success")
    throw new HostedError(
      409,
      "A genuine completed provider image is not available.",
    );
  const url = mask
    ? task.value.skinResult?.observations[mask[0]]?.maskUrls[mask[1]]
    : task.value.providerUrl;
  if (!url) throw new HostedError(404, "This image does not exist.");
  safeYouCamMediaUrl(url);
  const result = await providers(ctx, deps).generation.image(
    url,
    AbortSignal.timeout(30_000),
  );
  await allowed(ctx, task);
  const current = await ctx.store.get<TaskValue>(NS, task.id, ctx.session.id);
  if (!current || current.value.phase !== "success") {
    result.bytes.fill(0);
    throw new HostedError(410, "This local result was removed.");
  }
  return new Response(result.bytes as BodyInit, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Disposition": 'inline; filename="true-beauty-generated-image"',
    },
  });
}
export async function handleYouCam(
  request: Request,
  ctx: HostedContext,
  deps: YouCamRouteDependencies = {},
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (!path.startsWith("/api/skin/") && !path.startsWith("/api/generation/"))
    return null;
  try {
    if (path === "/api/generation/capabilities" && request.method === "GET")
      return json(await generationCapabilities(ctx));
    if (path === "/api/generation/templates/hair" && request.method === "GET") {
      await limited(ctx, "template", 6);
      const token = url.searchParams.get("startingToken") ?? undefined;
      if (token && token.length > 512)
        throw new HostedError(400, "Invalid template page token.");
      return json({
        provider: "perfect-corp",
        source: "current-provider-template-list",
        ...(await providers(ctx, deps).generation.templates(
          token,
          AbortSignal.timeout(20_000),
        )),
      });
    }
    if (
      (path === "/api/skin/quotes" || path === "/api/generation/quotes") &&
      request.method === "POST"
    )
      return await quote(
        request,
        ctx,
        path.includes("/skin/") ? "skin" : "generation",
        deps,
      );
    if (
      (path === "/api/skin/tasks" || path === "/api/generation/tasks") &&
      request.method === "POST"
    )
      return await submit(
        request,
        ctx,
        path.includes("/skin/") ? "skin" : "generation",
        deps,
      );
    if (path === "/api/generation/tasks" && request.method === "GET") {
      const tasks = await ctx.store.list<TaskValue>(NS, ctx.session.id, 20);
      return json({
        tasks: tasks
          .filter((t) => t.value.operation !== "skin")
          .map(resultView),
      });
    }
    const matched = path.match(
      /^\/api\/(skin|generation)\/tasks\/([0-9a-f-]{36})(?:\/(image|cancel)|\/masks\/(\d{1,3})\/(\d{1,3}))?$/,
    );
    if (!matched) throw new HostedError(404, "Unknown provider route.");
    const kind = matched[1] as "skin" | "generation",
      id = matched[2],
      action = matched[3],
      mask =
        matched[4] === undefined
          ? undefined
          : ([Number(matched[4]), Number(matched[5])] as [number, number]);
    const task = await owned(ctx, id, kind);
    if (request.method === "DELETE" && !action && !mask) {
      await ctx.store.delete(NS, id, ctx.session.id);
      return json({ deleted: true, notice: LOCAL_NOTICE });
    }
    if (
      request.method === "POST" &&
      action === "cancel" &&
      kind === "generation"
    ) {
      await update(ctx, task, {
        ...task.value,
        phase: "cancelled",
        providerUrl: undefined,
        skinResult: undefined,
        error: undefined,
      });
      return json(resultView(await owned(ctx, id, kind)));
    }
    if (request.method !== "GET")
      throw new HostedError(405, "Unsupported provider operation.");
    await limited(ctx, "read", 60);
    if (action === "image" || mask) {
      if (
        (action === "image" && kind !== "generation") ||
        (mask && kind !== "skin")
      )
        throw new HostedError(404, "This result image does not exist.");
      return await image(ctx, task, deps, mask);
    }
    if (action) throw new HostedError(404, "Unknown provider route.");
    return json(resultView(await poll(ctx, task, deps)));
  } catch (error) {
    if (error instanceof HostedError)
      return json({ error: error.message }, error.status);
    return json(
      {
        error:
          "The provider service could not complete this operation safely. No new result was created; no automatic paid retry will run.",
      },
      502,
    );
  }
}
