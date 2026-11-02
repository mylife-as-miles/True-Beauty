import Fastify from "fastify";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  ApprovedPlan,
  QuoteRequest,
  SkinTaskRequest,
  imageBytes,
} from "./contracts";
import {
  PerfectCorpProvider,
  pricingHash,
  skinProviderFailure,
  type SkinProviderFailure,
} from "./provider";
import { FileBudgetLedger, type BudgetLedger } from "./budget";
import {
  parseProviderSkinResult,
  type SkinAnalysisResult,
} from "../../../packages/skin-engine/src/provider";
import type { z } from "zod";
import {
  registerGenerationRoutes,
  type GenerationRouteOptions,
} from "./generation";
import { registerReasoningRoutes, type ReasoningOptions } from "./reasoning";
import { registerMerchantRoutes, type MerchantRouteOptions } from "./merchant";
type Plan = z.infer<typeof ApprovedPlan>;
interface Provider {
  pricing(): Promise<unknown[]>;
  create(
    bytes: Uint8Array,
    mime: "image/jpeg" | "image/png",
    actions: string[],
    overlay: boolean,
  ): Promise<string>;
  status(id: string): Promise<Record<string, unknown>>;
}
interface ApiOptions {
  provider?: Provider;
  plan?: Plan;
  dailyCredits?: number;
  ledger?: BudgetLedger;
  allowedOrigins?: string[];
  now?: () => number;
  generation?: Partial<Omit<GenerationRouteOptions, "getSessionId">>;
  reasoning?: Partial<Omit<ReasoningOptions, "sessionId">>;
  merchant?: MerchantRouteOptions;
}
interface Session {
  csrf: string;
  expires: number;
}
interface Quote {
  session: string;
  credits: number;
  actions: string[];
  expires: number;
  taskId?: string;
}
interface Task {
  session: string;
  upstreamId?: string;
  status: "creating" | "running" | "success" | "error";
  result?: SkinAnalysisResult;
  error?: string;
  providerFailure?: SkinProviderFailure;
  expires: number;
  nextPoll: number;
  polling?: Promise<void>;
}
const same = (a: string[], b: string[]) =>
  [...a].sort().join("|") === [...b].sort().join("|");
function configuredPlan(): Plan | undefined {
  try {
    return ApprovedPlan.parse(
      JSON.parse(process.env.YOUCAM_SKIN_PLAN_JSON ?? ""),
    );
  } catch {
    return undefined;
  }
}
export function createApi(options: ApiOptions = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 6 * 1024 * 1024,
    requestTimeout: 35000,
  });
  const now = options.now ?? Date.now;
  const provider =
    options.provider ??
    (process.env.YOUCAM_API_KEY
      ? new PerfectCorpProvider(process.env.YOUCAM_API_KEY)
      : undefined);
  const plan = options.plan ?? configuredPlan();
  const dailyCredits =
    options.dailyCredits ?? Number(process.env.YOUCAM_MAX_DAILY_CREDITS ?? 0);
  const paidEnabled =
    !!options.provider || process.env.YOUCAM_ENABLE_PAID === "true";
  const origins =
    options.allowedOrigins ??
    (
      process.env.API_ALLOWED_ORIGINS ??
      "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",");
  const ledger =
    options.ledger ??
    new FileBudgetLedger(
      resolve(process.env.YOUCAM_USAGE_PATH ?? ".runtime/usage.json"),
      now,
    );
  const sessions = new Map<string, Session>(),
    quotes = new Map<string, Quote>(),
    tasks = new Map<string, Task>(),
    limits = new Map<string, { start: number; count: number }>();
  const sweep = () => {
    for (const [key, value] of sessions)
      if (value.expires < now()) sessions.delete(key);
    for (const [key, value] of quotes)
      if (value.expires < now()) quotes.delete(key);
    for (const [key, value] of tasks)
      if (value.expires < now()) tasks.delete(key);
    for (const [key, value] of limits)
      if (now() - value.start > 60000) limits.delete(key);
  };
  const clean = setInterval(sweep, 60000);
  clean.unref();
  app.addHook("onClose", async () => clearInterval(clean));
  const sessionId = (cookie: string | undefined) =>
    cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("tb_session="))
      ?.slice("tb_session=".length);
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer");
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      reply.code(403).send({ error: "This origin is not allowed." });
      return;
    }
    // Browser mutations require exact Origin + same-site session + CSRF token.
    if (req.method === "POST" || req.method === "DELETE") {
      if (!origin || !origins.includes(origin)) {
        reply
          .code(403)
          .send({ error: "An allowed browser origin is required." });
        return;
      }
      const id = sessionId(req.headers.cookie),
        session = id ? sessions.get(id) : undefined,
        token = req.headers["x-csrf-token"];
      if (
        !session ||
        session.expires < now() ||
        typeof token !== "string" ||
        token.length !== session.csrf.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(session.csrf))
      ) {
        reply
          .code(403)
          .send({ error: "Refresh your local API session before continuing." });
        return;
      }
    }
    const rate = limits.get(req.ip) ?? { start: now(), count: 0 };
    if (now() - rate.start > 60000) {
      rate.start = now();
      rate.count = 0;
    }
    rate.count++;
    limits.set(req.ip, rate);
    if (rate.count > 60) {
      reply
        .header("Retry-After", "60")
        .code(429)
        .send({ error: "Too many requests. Try again in a minute." });
      return;
    }
  });
  app.setErrorHandler((err, _req, reply) => {
    const known = err as { statusCode?: number; validation?: unknown };
    if (known.statusCode === 413) {
      reply.code(413).send({ error: "The image request is too large." });
      return;
    }
    reply.code(500).send({
      error:
        "The service could not complete this request. No analysis result was created.",
    });
  });
  app.get("/api/health", async () => ({
    ok: true,
    service: "true-beauty-api",
  }));
  app.get("/api/capabilities", async () => ({
    skinAnalysis: {
      configured: !!provider,
      paidEnabled,
      pricingPlanConfigured: !!plan,
      status:
        provider && plan && paidEnabled && dailyCredits > 0
          ? "requires-verified-quote"
          : "unavailable",
      allowedActions: plan?.actions ?? [],
      liveVerified: false,
    },
    hairGeneration: generationRoutes.capabilities().features.hair,
    fashionGeneration: generationRoutes.capabilities().features.clothing,
    languageModel: reasoningRoutes.capabilities(),
    retention: {
      localServer:
        "Image bytes are held only during upload, then released. Task results expire after 15 minutes.",
      provider:
        "Perfect Corp publishes media/file retention of up to 30 days. Some task documentation still says 24 hours; assume the longer period.",
    },
  }));
  app.get("/api/session", async (req, reply) => {
    sweep();
    let id = sessionId(req.headers.cookie),
      session = id ? sessions.get(id) : undefined;
    if (!session || session.expires < now()) {
      if (sessions.size >= 100) {
        reply.code(503);
        return { error: "The service is at capacity. Try again later." };
      }
      id = randomBytes(32).toString("base64url");
      session = {
        csrf: randomBytes(32).toString("base64url"),
        expires: now() + 30 * 60000,
      };
      sessions.set(id, session);
      const secure =
        req.protocol === "https" || process.env.NODE_ENV === "production";
      reply.header(
        "Set-Cookie",
        `tb_session=${id}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=1800${secure ? "; Secure" : ""}`,
      );
    }
    return {
      csrfToken: session.csrf,
      expiresAt: new Date(session.expires).toISOString(),
    };
  });
  app.post("/api/skin/quotes", async (req, reply) => {
    const parsed = QuoteRequest.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "Select a valid set of skin concerns." };
    }
    if (
      !provider ||
      !plan ||
      !paidEnabled ||
      !Number.isFinite(dailyCredits) ||
      dailyCredits <= 0
    ) {
      reply.code(503);
      return {
        error:
          "Live skin analysis is not configured. Local colour exploration remains available.",
      };
    }
    if (
      now() - Date.parse(plan.reviewedAt) > 30 * 86400000 ||
      Date.parse(plan.reviewedAt) > now() + 60000
    ) {
      reply.code(503);
      return { error: "The provider pricing plan needs operator review." };
    }
    if (!same(parsed.data.actions, plan.actions)) {
      reply.code(400);
      return {
        error:
          "The selected actions do not match the reviewed provider pricing plan.",
        allowedActions: plan.actions,
      };
    }
    try {
      const pricing = await provider.pricing();
      const sku = pricing.find((s) => pricingHash(s) === plan.skuHash);
      if (!sku) {
        reply.code(503);
        return {
          error:
            "Provider pricing changed or could not be verified. Paid analysis is disabled.",
        };
      }
      if (plan.credits + ledger.used() > dailyCredits) {
        reply.code(429);
        return { error: "The daily credit ceiling has been reached." };
      }
      sweep();
      if (quotes.size >= 100) {
        reply.code(503);
        return { error: "The quote service is at capacity." };
      }
      const id = randomUUID(),
        expires = now() + 5 * 60000;
      quotes.set(id, {
        session: sessionId(req.headers.cookie)!,
        credits: plan.credits,
        actions: plan.actions,
        expires,
      });
      return {
        quoteId: id,
        credits: plan.credits,
        unit: "provider credits",
        actions: plan.actions,
        expiresAt: new Date(expires).toISOString(),
        pricingProvenance: {
          source:
            "https://yce-api-01.makeupar.com/s2s/v2.0/credit/feature-cost",
          skuHash: plan.skuHash,
          reviewedAt: plan.reviewedAt,
        },
        note: "Credit ceiling is an operator-reviewed exact-action pricing plan checked against the current provider SKU. Confirm the amount before sending your image.",
      };
    } catch {
      reply.code(502);
      return {
        error:
          "Current provider pricing could not be verified. No image was uploaded.",
      };
    }
  });
  app.post("/api/skin/tasks", async (req, reply) => {
    const parsed = SkinTaskRequest.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return {
        error:
          "Image upload, provider retention consent and a valid credit authorization are required.",
      };
    }
    const body = parsed.data,
      id = sessionId(req.headers.cookie)!,
      quote = quotes.get(body.quoteId);
    if (
      !quote ||
      quote.session !== id ||
      quote.expires < now() ||
      !same(body.actions, quote.actions)
    ) {
      reply.code(400);
      return { error: "The quote expired or does not match this request." };
    }
    if (body.maxCredits < quote.credits) {
      reply.code(402);
      return {
        error:
          "The authorized credit amount is below the quote. No image was uploaded.",
      };
    }
    if (quote.taskId)
      return {
        taskId: quote.taskId,
        status: tasks.get(quote.taskId)?.status ?? "expired",
      };
    if (!provider || !paidEnabled) {
      reply.code(503);
      return { error: "Live analysis is unavailable." };
    }
    let bytes: Uint8Array;
    try {
      bytes = imageBytes(body.imageBase64, body.contentType);
    } catch (error) {
      reply.code(400);
      return { error: (error as Error).message };
    }
    sweep();
    if (tasks.size >= 100) {
      reply.code(503);
      return { error: "The analysis service is at capacity." };
    }
    try {
      ledger.reserve(quote.credits, dailyCredits);
    } catch {
      reply.code(429);
      return {
        error: "The daily spending ceiling was reached. No image was uploaded.",
      };
    }
    const taskId = randomUUID(),
      task: Task = {
        session: id,
        status: "creating",
        expires: now() + 15 * 60000,
        nextPoll: now() + 10000,
      };
    tasks.set(taskId, task);
    quote.taskId = taskId;
    try {
      task.upstreamId = await provider.create(
        bytes,
        body.contentType,
        body.actions,
        body.overlay,
      );
      task.status = "running";
      return { taskId, status: task.status, pollAfterMs: 10000 };
    } catch {
      task.status = "error";
      task.error =
        "The provider could not create this analysis. Retry only with a new quote; check your provider account if the charge status is uncertain.";
      reply.code(502);
      return { taskId, status: "error", error: task.error };
    } finally {
      bytes.fill(0);
    }
  });
  app.get<{ Params: { id: string } }>(
    "/api/skin/tasks/:id",
    async (req, reply) => {
      const id = sessionId(req.headers.cookie),
        task = tasks.get(req.params.id);
      if (!id || !task || task.session !== id || task.expires < now()) {
        reply.code(404);
        return { error: "This task does not exist or has expired." };
      }
      if (
        task.status === "running" &&
        provider &&
        task.upstreamId &&
        now() >= task.nextPoll
      ) {
        if (!task.polling)
          task.polling = (async () => {
            task.nextPoll = now() + 10000;
            try {
              const response = await provider.status(task.upstreamId!);
              if (response.task_status === "success") {
                task.result = parseProviderSkinResult(response);
                task.status = "success";
              } else if (response.task_status === "error") {
                task.status = "error";
                task.providerFailure = skinProviderFailure(response);
                task.error = `${task.providerFailure.summary} ${task.providerFailure.recovery}`;
              }
            } catch {
              task.error =
                "Status could not be checked. This does not start a new paid task; try checking again.";
            }
          })().finally(() => {
            task.polling = undefined;
          });
        await task.polling;
      }
      return {
        taskId: req.params.id,
        status: task.status,
        result: task.result,
        error: task.error,
        providerFailure: task.providerFailure,
        pollAfterMs: 10000,
        expiresAt: new Date(task.expires).toISOString(),
      };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/skin/tasks/:id",
    async (req, reply) => {
      const task = tasks.get(req.params.id);
      if (!task || task.session !== sessionId(req.headers.cookie)) {
        reply.code(404);
        return { error: "Task not found." };
      }
      tasks.delete(req.params.id);
      return {
        deleted: true,
        note: "Deleted from this server. This does not claim deletion from the provider; provider retention terms still apply.",
      };
    },
  );
  const currentSession = (request: import("fastify").FastifyRequest) => {
    const id = sessionId(request.headers.cookie),
      value = id ? sessions.get(id) : undefined;
    return id && value && value.expires > now() ? id : undefined;
  };
  const generationRoutes = registerGenerationRoutes(app, {
    getSessionId: currentSession,
    ledger,
    dailyCredits,
    now,
    ...options.generation,
  });
  const reasoningRoutes = registerReasoningRoutes(app, {
    sessionId: currentSession,
    now,
    ...options.reasoning,
  });
  registerMerchantRoutes(app, { now, ...options.merchant });
  return app;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = createApi();
  await app.listen({
    host: process.env.API_HOST ?? "127.0.0.1",
    port: Number(process.env.API_PORT ?? 3001),
  });
  console.log(
    "True Beauty API listening. Paid features require configuration and explicit consent.",
  );
}
