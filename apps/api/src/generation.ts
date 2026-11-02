import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { imageBytes } from "./contracts";
import { safeYouCamMediaUrl } from "./youcamTransport";
import { pricingHash } from "./provider";
import { FileBudgetLedger, type BudgetLedger } from "./budget";
import {
  YouCamGenerationProvider,
  type GenerationProvider,
  type GenerationInput,
} from "./generationProvider";
import {
  GenerationPlan,
  GenerationQuoteRequest,
  GenerationTaskRequest,
  LOCAL_GENERATION_TTL_MS,
  PROVIDER_RETENTION_DAYS,
  PROVIDER_RETENTION_SOURCE,
  type GenerationCapabilities,
  type GenerationFeature,
  type GenerationSpec,
  type GenerationStatus,
  type GenerationTaskView,
  type GeneratedImageResult,
} from "./generationContracts";
export interface GenerationRouteOptions {
  getSessionId: (request: FastifyRequest) => string | undefined;
  provider?: GenerationProvider;
  plans?: GenerationPlan[];
  paidEnabled?: boolean;
  dailyCredits?: number;
  ledger?: BudgetLedger;
  now?: () => number;
}
interface Quote {
  session: string;
  spec: GenerationSpec;
  credits: number;
  expires: number;
  taskId?: string;
}
interface Task {
  session: string;
  feature: GenerationFeature;
  status: GenerationStatus;
  expires: number;
  receivedAt?: string;
  upstreamId?: string;
  providerUrl?: string;
  result?: GeneratedImageResult;
  error?: string;
  nextPoll: number;
  controller: AbortController;
  clearInput?: () => void;
  polling?: Promise<void>;
  image?: {
    bytes: Uint8Array;
    contentType: "image/png" | "image/jpeg" | "image/webp";
  };
  imageFetch?: Promise<void>;
}
const LOCAL_NOTICE =
  "This local task and result expire after 15 minutes. Stopping or deleting here cannot cancel provider processing or delete its copy.";
const generatedNotice = (feature: GenerationFeature) =>
  feature === "hair"
    ? "AI-generated hairstyle preview, not live AR. Actual hair results may vary; consult a professional stylist for colouring."
    : "AI-generated clothing preview, not live AR or a fit measurement. Actual fit and appearance may vary.";
const sameSpec = (a: GenerationSpec, b: GenerationSpec) =>
  JSON.stringify(a) === JSON.stringify(b);
export function configuredGenerationPlans(): GenerationPlan[] {
  try {
    const value = JSON.parse(process.env.YOUCAM_GENERATION_PLANS_JSON ?? "[]");
    if (!Array.isArray(value) || value.length > 64) return [];
    return value.map((p) => GenerationPlan.parse(p));
  } catch {
    return [];
  }
}
export function registerGenerationRoutes(
  app: FastifyInstance,
  options: GenerationRouteOptions,
) {
  const now = options.now ?? Date.now;
  const provider =
    options.provider ??
    (process.env.YOUCAM_API_KEY
      ? new YouCamGenerationProvider(process.env.YOUCAM_API_KEY)
      : undefined);
  const plans = options.plans ?? configuredGenerationPlans();
  const paidEnabled =
    options.paidEnabled ?? process.env.YOUCAM_ENABLE_PAID === "true";
  const dailyCredits =
    options.dailyCredits ?? Number(process.env.YOUCAM_MAX_DAILY_CREDITS ?? 0);
  const ledger =
    options.ledger ??
    new FileBudgetLedger(
      resolve(process.env.YOUCAM_USAGE_PATH ?? ".runtime/usage.json"),
      now,
    );
  const quotes = new Map<string, Quote>(),
    tasks = new Map<string, Task>();
  let creating = 0;
  const validPlan = (plan: GenerationPlan) => {
    const age = now() - Date.parse(plan.reviewedAt);
    return age >= -60000 && age <= 30 * 86400000;
  };
  const capabilities = (): GenerationCapabilities => {
    const feature = (name: GenerationFeature) => {
      const available = plans.filter(
        (p) => p.spec.feature === name && validPlan(p),
      );
      const ready =
        !!provider &&
        paidEnabled &&
        Number.isFinite(dailyCredits) &&
        dailyCredits > 0 &&
        available.length > 0;
      return {
        feature: name,
        configured: !!provider,
        pricingPlanConfigured: available.length > 0,
        readyForQuote: ready,
        allowedSpecs: available.map((p) => p.spec),
        reason: !provider
          ? "The generation provider is not connected."
          : !paidEnabled
            ? "Paid generation is disabled by the operator."
            : !Number.isFinite(dailyCredits) || dailyCredits <= 0
              ? "A daily credit ceiling has not been set."
              : !available.length
                ? "A current, reviewed pricing plan is required."
                : "Ready to request a current verified credit quote.",
        liveVerified: false as const,
      };
    };
    return {
      provider: "Perfect Corp",
      credentialConfigured: !!provider,
      paidEnabled,
      budgetConfigured: Number.isFinite(dailyCredits) && dailyCredits > 0,
      liveVerified: false,
      features: { hair: feature("hair"), clothing: feature("clothing") },
      retention: {
        localMinutes: 15,
        providerDays: PROVIDER_RETENTION_DAYS,
        source: PROVIDER_RETENTION_SOURCE,
        upstreamCancellationSupported: false,
        upstreamDeletionSupported: false,
      },
    };
  };
  const forget = (id: string) => {
    const task = tasks.get(id);
    if (!task) return;
    task.controller.abort();
    task.clearInput?.();
    task.clearInput = undefined;
    task.image?.bytes.fill(0);
    task.image = undefined;
    task.providerUrl = undefined;
    task.result = undefined;
    tasks.delete(id);
  };
  const sweep = () => {
    for (const [id, q] of quotes) if (q.expires <= now()) quotes.delete(id);
    for (const [id, t] of tasks) if (t.expires <= now()) forget(id);
  };
  const timer = setInterval(sweep, 30000);
  timer.unref();
  app.addHook("onClose", async () => {
    clearInterval(timer);
    for (const id of tasks.keys()) forget(id);
    quotes.clear();
  });
  const session = (request: FastifyRequest) => options.getSessionId(request);
  const view = (id: string, t: Task): GenerationTaskView => ({
    taskId: id,
    feature: t.feature,
    status: t.status,
    result: t.result,
    error: t.error,
    pollAfterMs: 10000,
    expiresAt: new Date(t.expires).toISOString(),
    notice: LOCAL_NOTICE,
  });
  app.get("/api/generation/capabilities", async () => capabilities());
  app.get<{ Querystring: { startingToken?: string } }>(
    "/api/generation/templates/hair",
    async (req, reply) => {
      if (!session(req)) {
        reply.code(401);
        return { error: "Open a local API session first." };
      }
      if (!provider?.templates) {
        reply.code(503);
        return {
          error:
            "Hairstyle templates need a connected provider. No image has been sent.",
        };
      }
      const token = req.query.startingToken;
      if (token && (typeof token !== "string" || token.length > 512)) {
        reply.code(400);
        return { error: "Invalid template page token." };
      }
      try {
        return {
          provider: "perfect-corp",
          source: "current-provider-template-list",
          ...(await provider.templates(token)),
        };
      } catch {
        reply.code(502);
        return { error: "The provider template list could not be read." };
      }
    },
  );
  app.get("/api/generation/tasks", async (req, reply) => {
    sweep();
    const sid = session(req);
    if (!sid) {
      reply.code(401);
      return { error: "Open a local API session first." };
    }
    return {
      tasks: [...tasks.entries()]
        .filter(([, task]) => task.session === sid)
        .map(([id, task]) => view(id, task)),
    };
  });
  app.post("/api/generation/quotes", async (req, reply) => {
    const sid = session(req);
    if (!sid) {
      reply.code(401);
      return { error: "Open a local API session first." };
    }
    const parsed = GenerationQuoteRequest.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Choose supported generation settings." };
    }
    const { spec } = parsed.data,
      plan = plans.find((p) => validPlan(p) && sameSpec(p.spec, spec));
    if (
      !provider ||
      !paidEnabled ||
      !Number.isFinite(dailyCredits) ||
      dailyCredits <= 0 ||
      !plan
    ) {
      reply.code(503);
      return {
        error:
          "This exact generation setting has no enabled, reviewed pricing plan. No image has been sent.",
        capabilities: capabilities(),
      };
    }
    sweep();
    if (quotes.size >= 60) {
      reply.code(503);
      return { error: "The quote service is at capacity. Try again later." };
    }
    try {
      const pricing = await provider.pricing(spec.feature);
      if (!pricing.some((row) => pricingHash(row) === plan.skuHash)) {
        reply.code(503);
        return {
          error:
            "The current provider price differs from the reviewed plan. Generation is disabled until it is reviewed.",
        };
      }
      if (ledger.used() + plan.credits > dailyCredits) {
        reply.code(429);
        return { error: "The shared daily credit ceiling has been reached." };
      }
      const quoteId = randomUUID(),
        expires = now() + 5 * 60000;
      quotes.set(quoteId, {
        session: sid,
        spec,
        credits: plan.credits,
        expires,
      });
      return {
        quoteId,
        spec,
        credits: plan.credits,
        unit: "provider credits",
        expiresAt: new Date(expires).toISOString(),
        pricing: {
          skuHash: plan.skuHash,
          reviewedAt: plan.reviewedAt,
          source:
            "https://yce-api-01.makeupar.com/s2s/v2.0/credit/feature-cost",
        },
        retention: capabilities().retention,
        notice:
          "This quote authorizes one generated image only. No automatic follow-up generation or retry is performed.",
      };
    } catch {
      reply.code(502);
      return {
        error:
          "Current provider pricing could not be verified. No image has been sent.",
      };
    }
  });
  app.post(
    "/api/generation/tasks",
    { bodyLimit: 12 * 1024 * 1024 },
    async (req, reply) => {
      const sid = session(req);
      if (!sid) {
        reply.code(401);
        return { error: "Open a local API session first." };
      }
      const parsed = GenerationTaskRequest.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return {
          error:
            "Valid source/reference images, exact quoted settings, image-use permission, upload consent, provider retention acknowledgement and a credit authorization are required.",
        };
      }
      const body = parsed.data;
      const q = quotes.get(body.quoteId);
      if (
        !q ||
        q.session !== sid ||
        q.expires <= now() ||
        !sameSpec(q.spec, body.spec)
      ) {
        reply.code(400);
        return { error: "The quote expired or does not match this request." };
      }
      if (body.maxCredits < q.credits) {
        reply.code(402);
        return {
          error:
            "The authorized credits do not cover this quote. No image has been sent.",
        };
      }
      if (q.taskId) {
        const existing = tasks.get(q.taskId);
        if (!existing) {
          reply.code(410);
          return {
            error:
              "This one-use quote was already consumed. Its local task has expired or been deleted.",
          };
        }
        return view(q.taskId, existing);
      }
      if (!provider || !paidEnabled) {
        reply.code(503);
        return { error: "Generation is not enabled." };
      }
      sweep();
      if (tasks.size >= 20 || creating >= 4) {
        reply.code(503);
        return {
          error:
            "The generation service is at capacity. No image has been sent.",
        };
      }
      let input: GenerationInput;
      let decodedSource: Uint8Array | undefined;
      try {
        decodedSource = imageBytes(body.source.base64, body.source.contentType);
        input = {
          spec: body.spec,
          source: {
            bytes: decodedSource,
            contentType: body.source.contentType,
          },
          ...(body.reference
            ? {
                reference: {
                  bytes: imageBytes(
                    body.reference.base64,
                    body.reference.contentType,
                  ),
                  contentType: body.reference.contentType,
                },
              }
            : {}),
        };
      } catch (error) {
        decodedSource?.fill(0);
        reply.code(400);
        return {
          error:
            error instanceof Error
              ? error.message
              : "The image could not be validated.",
        };
      }
      try {
        ledger.reserve(q.credits, dailyCredits);
      } catch {
        input.source.bytes.fill(0);
        input.reference?.bytes.fill(0);
        reply.code(429);
        return {
          error:
            "The shared daily credit ceiling was reached. No image has been sent.",
        };
      }
      const id = randomUUID(),
        task: Task = {
          session: sid,
          feature: body.spec.feature,
          status: "uploading",
          expires: now() + LOCAL_GENERATION_TTL_MS,
          nextPoll: now() + 10000,
          controller: new AbortController(),
          clearInput: () => {
            input.source.bytes.fill(0);
            input.reference?.bytes.fill(0);
          },
        };
      q.taskId = id;
      tasks.set(id, task);
      creating++;
      void (async () => {
        try {
          const upstream = await provider.create(input, task.controller.signal);
          if (tasks.get(id) !== task || task.controller.signal.aborted) return;
          task.upstreamId = upstream;
          task.status = "running";
        } catch {
          if (tasks.get(id) === task && !task.controller.signal.aborted) {
            task.status = "error";
            task.error =
              "The provider could not start this generation. A spending reservation was kept because the charge status may be uncertain. Check the provider account before a separately authorized retry.";
          }
        } finally {
          task.clearInput?.();
          task.clearInput = undefined;
          creating--;
        }
      })();
      reply.code(202);
      return view(id, task);
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/generation/tasks/:id",
    async (req, reply) => {
      sweep();
      const task = tasks.get(req.params.id);
      if (!task || task.session !== session(req)) {
        reply.code(404);
        return {
          error: "This local generation task does not exist or has expired.",
        };
      }
      if (
        task.status === "running" &&
        task.upstreamId &&
        provider &&
        now() >= task.nextPoll
      ) {
        if (!task.polling) {
          task.nextPoll = now() + 10000;
          task.polling = (async () => {
            try {
              const status = await provider.status(
                task.feature,
                task.upstreamId!,
                task.controller.signal,
              );
              if (
                tasks.get(req.params.id) !== task ||
                task.controller.signal.aborted
              )
                return;
              if (status.status === "error") {
                task.status = "error";
                task.error =
                  status.error ?? "The provider could not generate this image.";
              } else if (status.status === "success") {
                if (!status.url) throw new Error("Missing generation URL");
                safeYouCamMediaUrl(status.url);
                task.providerUrl = status.url;
                task.status = "success";
                task.receivedAt = new Date(now()).toISOString();
                task.error = undefined;
                task.result = {
                  kind: "ai-generated-image",
                  provider: "perfect-corp",
                  feature: task.feature,
                  imagePath: `/api/generation/tasks/${req.params.id}/image`,
                  receivedAt: task.receivedAt,
                  notice: generatedNotice(task.feature),
                };
              } else task.error = undefined;
            } catch {
              if (
                tasks.get(req.params.id) === task &&
                !task.controller.signal.aborted
              )
                task.error =
                  "Status could not be verified. Checking this existing task does not create another paid request.";
            }
          })().finally(() => {
            task.polling = undefined;
          });
        }
        await task.polling;
      }
      return view(req.params.id, task);
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/generation/tasks/:id/image",
    async (req, reply) => {
      sweep();
      const task = tasks.get(req.params.id);
      if (!task || task.session !== session(req)) {
        reply.code(404);
        return {
          error: "This generated result does not exist or has expired.",
        };
      }
      if (task.status !== "success" || !task.providerUrl || !provider) {
        reply.code(409);
        return {
          error: "A genuine completed provider image is not available.",
        };
      }
      if (!task.image) {
        if (!task.imageFetch)
          task.imageFetch = (async () => {
            const image = await provider.image(
              task.providerUrl!,
              task.controller.signal,
            );
            if (
              tasks.get(req.params.id) !== task ||
              task.controller.signal.aborted
            ) {
              image.bytes.fill(0);
              return;
            }
            const cached = [...tasks.values()].reduce(
              (n, t) => n + (t.image?.bytes.byteLength ?? 0),
              0,
            );
            if (cached + image.bytes.byteLength > 32 * 1024 * 1024) {
              image.bytes.fill(0);
              throw new Error("The transient result cache is full.");
            }
            task.image = image;
          })().finally(() => {
            task.imageFetch = undefined;
          });
        try {
          await task.imageFetch;
        } catch {
          reply.code(502);
          return {
            error:
              "The generated image could not be downloaded safely. You may check the existing task again.",
          };
        }
      }
      if (!task.image || tasks.get(req.params.id) !== task) {
        reply.code(410);
        return { error: "The local result was removed." };
      }
      reply
        .header("Content-Type", task.image.contentType)
        .header("Cache-Control", "no-store")
        .header(
          "Content-Disposition",
          `inline; filename="true-beauty-${task.feature}.${task.image.contentType === "image/jpeg" ? "jpg" : task.image.contentType === "image/png" ? "png" : "webp"}"`,
        );
      return reply.send(Buffer.from(task.image.bytes));
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/generation/tasks/:id/cancel",
    async (req, reply) => {
      const task = tasks.get(req.params.id);
      if (!task || task.session !== session(req)) {
        reply.code(404);
        return { error: "This local generation task was not found." };
      }
      task.controller.abort();
      task.clearInput?.();
      task.clearInput = undefined;
      task.status = "cancelled";
      task.providerUrl = undefined;
      task.result = undefined;
      task.error = undefined;
      task.image?.bytes.fill(0);
      task.image = undefined;
      return {
        ...view(req.params.id, task),
        upstreamCancellationSupported: false,
        notice:
          "Local uploading, waiting and polling stopped. The provider may still process an already-submitted task and charge for it; no refund or provider deletion is claimed.",
      };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/generation/tasks/:id",
    async (req, reply) => {
      const task = tasks.get(req.params.id);
      if (!task || task.session !== session(req)) {
        reply.code(404);
        return { error: "This local generation task was not found." };
      }
      forget(req.params.id);
      return {
        deletedLocal: true,
        upstreamDeletionSupported: false,
        notice: `Deleted from this server. The provider may retain its uploaded/generated media for up to ${PROVIDER_RETENTION_DAYS} days under its own terms.`,
      };
    },
  );
  return { capabilities };
}
