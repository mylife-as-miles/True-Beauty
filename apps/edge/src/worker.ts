import { z } from "zod";
import {
  HostedError,
  hashValue,
  json,
  readJson,
  type HostedContext,
  type HostedEnv,
} from "./runtime/contracts";
import {
  assertHostedCsrf,
  assertHostedOrigin,
  hostedOperator,
  hostedSession,
} from "./runtime/auth";
import { createHostedStore } from "./runtime/store";
import { handleReasoning, reasoningCapabilities } from "./routes/reasoning";
import { handleYouCam, youcamCapabilities } from "./routes/youcam";
import { handleMerchant } from "./routes/merchant";

interface Execution {
  waitUntil(promise: Promise<unknown>): void;
}
const budgetSchema = z
  .object({
    creditsUsed: z.number().int().min(51).max(100),
    creditsLimit: z.number().int().min(51).max(100),
    usdMicroUsed: z.number().int().min(111000).max(5000000),
    usdMicroLimit: z.number().int().min(111000).max(5000000),
  })
  .strict();

async function accessRoutes(
  request: Request,
  ctx: HostedContext,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === "/api/operator/budget") {
    if (!ctx.operator)
      throw new HostedError(
        403,
        "Only the Site operator can manage sponsored cloud usage.",
      );
    if (request.method === "GET") return json(await ctx.store.budget());
    if (request.method === "POST") {
      const input = budgetSchema.safeParse(await readJson(request, 2048));
      if (!input.success)
        throw new HostedError(
          400,
          "Provide the reviewed cumulative usage and bounded spending limits.",
        );
      return json(
        await ctx.store.initializeBudget(input.data, ctx.operatorId!),
      );
    }
    throw new HostedError(405, "Method not allowed.");
  }
  if (path === "/api/operator/approvals") {
    if (!ctx.operator)
      throw new HostedError(
        403,
        "Only the Site operator can review sponsored cloud requests.",
      );
    if (request.method !== "GET")
      throw new HostedError(405, "Method not allowed.");
    return json({ requests: await ctx.store.listPendingQuotes() });
  }
  const action = path.match(
    /^\/api\/operator\/approvals\/([0-9a-f-]{36})\/(approve|revoke)$/i,
  );
  if (action) {
    if (!ctx.operator)
      throw new HostedError(
        403,
        "Only the Site operator can authorize sponsored cloud usage.",
      );
    if (request.method !== "POST")
      throw new HostedError(405, "Method not allowed.");
    if (action[2] === "approve")
      await ctx.store.approveQuote(action[1], ctx.operatorId!);
    else await ctx.store.revokeQuote(action[1], ctx.operatorId!);
    return json({ approved: action[2] === "approve" });
  }
  const quote = path.match(/^\/api\/access\/quotes\/([0-9a-f-]{36})$/i);
  if (quote) {
    if (request.method !== "GET")
      throw new HostedError(405, "Method not allowed.");
    return json({
      hosted: true,
      operator: ctx.operator,
      ...(await ctx.store.quoteAccess(quote[1], ctx.session.id, ctx.operator)),
    });
  }
  const ask = path.match(/^\/api\/access\/requests\/([0-9a-f-]{36})$/i);
  if (ask) {
    if (request.method !== "POST")
      throw new HostedError(405, "Method not allowed.");
    if (!(await ctx.store.getQuote(ask[1], ctx.session.id)))
      throw new HostedError(
        404,
        "This quote has expired or belongs to another session.",
      );
    return json({
      requested: true,
      ...(await ctx.store.quoteAccess(ask[1], ctx.session.id, ctx.operator)),
    });
  }
  return null;
}

export async function handleHostedRequest(
  request: Request,
  env: HostedEnv,
  execution: Execution,
): Promise<Response> {
  const url = new URL(request.url);
  let sessionCookie: string | undefined;
  const finish = (response: Response) => {
    if (!sessionCookie) return response;
    const headers = new Headers(response.headers);
    headers.set("Set-Cookie", sessionCookie);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
  if (!url.pathname.startsWith("/api/"))
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("The application assets are unavailable.", {
          status: 503,
        });
  try {
    assertHostedOrigin(request, env);
    const identity = await hostedOperator(request, env);
    if (url.pathname === "/api/health" && request.method === "GET")
      return json({
        ok: true,
        service: "true-beauty-cloud",
        version: "r07",
        durable: true,
      });
    if (url.pathname === "/api/operator/status" && request.method === "GET")
      return json({
        hosted: true,
        operator: identity.operator,
        trustedIdentity: env.SITES_IDENTITY_TRUSTED === "true",
        dispatchIdentityPresent: !!request.headers.get(
          "oai-authenticated-user-id",
        ),
        dispatchEmailPresent: !!request.headers.get(
          "oai-authenticated-user-email",
        ),
      });
    // Read-only discovery must work on a first visit. This establishes anonymous
    // ownership only; it grants neither upload consent nor sponsored spending.
    const discovery =
      request.method === "GET" &&
      [
        "/api/capabilities",
        "/api/generation/capabilities",
        "/api/reasoning/capabilities",
        "/api/merchants/sources",
      ].includes(url.pathname);
    const opened = await hostedSession(request, env, Date.now(), discovery);
    sessionCookie = opened.setCookie;
    if (url.pathname === "/api/session" && request.method === "GET")
      return json(
        {
          csrfToken: opened.session!.csrfToken,
          expiresAt: opened.session!.expiresAt,
          hosted: true,
          operator: identity.operator,
        },
        200,
        opened.setCookie ? { "Set-Cookie": opened.setCookie } : undefined,
      );
    if (!opened.session)
      throw new HostedError(403, "Open a cloud session before continuing.");
    assertHostedCsrf(request, opened.session);
    const store = createHostedStore(env);
    const ip = await hashValue([
      env.EDGE_SESSION_SECRET,
      request.headers.get("cf-connecting-ip") ?? "unknown",
    ]);
    if (
      !(await store.rateLimit(
        "ip:" + ip,
        identity.operator ? 600 : 120,
        60000,
      )) ||
      !(await store.rateLimit(
        "session:" + opened.session.id,
        identity.operator ? 300 : 90,
        60000,
      ))
    )
      throw new HostedError(
        429,
        "Too many cloud requests. Wait a moment before trying again.",
      );
    const ctx: HostedContext = {
      env,
      store,
      session: opened.session,
      ...identity,
      now: Date.now,
      waitUntil: (promise) => execution.waitUntil(promise),
    };
    execution.waitUntil(store.cleanup().catch(() => {}));
    if (url.pathname === "/api/capabilities" && request.method === "GET")
      return finish(
        json({
          ...(await youcamCapabilities(ctx)),
          languageModel: await reasoningCapabilities(ctx),
        }),
      );
    for (const route of [
      accessRoutes,
      handleYouCam,
      handleReasoning,
      handleMerchant,
    ]) {
      const response = await route(request, ctx);
      if (response) return finish(response);
    }
    return finish(json({ error: "This cloud endpoint does not exist." }, 404));
  } catch (error) {
    if (error instanceof HostedError)
      return finish(json({ error: error.message }, error.status));
    // Provider payloads, prompts, credentials and stack traces are never echoed.
    return finish(
      json(
        {
          error:
            "The cloud service could not complete this request. No successful result is being claimed.",
        },
        500,
      ),
    );
  }
}
export default { fetch: handleHostedRequest };
