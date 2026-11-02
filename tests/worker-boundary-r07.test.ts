import { afterEach, describe, expect, it, vi } from "vitest";
import { handleHostedRequest } from "../apps/edge/src/worker";
import { createHostedStore } from "../apps/edge/src/runtime/store";
import type { HostedEnv } from "../apps/edge/src/runtime/contracts";
import { createEdgeD1Fixture } from "./helpers/edge-d1";
import {
  hashReasoningPayload,
  type ReasoningPayload,
} from "../packages/agent-runtime/src/reasoning-protocol";
import { pricingHash } from "../apps/api/src/provider";

// Independent Worker-entry security review. SQLite executes the real root
// migrations/triggers. All fetches are intercepted scripted fixtures; no live
// credentials, private photos, paid operations or external requests are used.
const origin = "https://security-fixture.invalid";
const serviceToken = "NON-SECRET-OPERATOR-FIXTURE-" + "s".repeat(40);
const providerKey = "NON-SECRET-PROVIDER-FIXTURE-" + "p".repeat(40);
const initialBudget = {
  creditsUsed: 51,
  creditsLimit: 100,
  usdMicroUsed: 111000,
  usdMicroLimit: 5000000,
};
const spec = { feature: "hair", hairColor: "src", templateId: "fixture-bob" };
const sku = {
  run_task_url: "https://yce-api-01.makeupar.com/s2s/v2.1/task/hair-transfer",
  amount: 2,
  description: "SCRIPTED SECURITY FIXTURE ONLY",
};
const png = new Uint8Array(120).fill(7);
png.set([137, 80, 78, 71, 13, 10, 26, 10]);
const source = {
  base64: Buffer.from(png).toString("base64"),
  contentType: "image/png",
};
const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cleanups.splice(0).forEach((close) => close());
});
interface BrowserSession {
  cookie: string;
  csrf: string;
  id: string;
}
type Json = Record<string, unknown>;
function fixture() {
  const database = createEdgeD1Fixture();
  cleanups.push(database.close);
  const env: HostedEnv = {
    DB: database.db,
    SITE_ORIGIN: origin,
    EDGE_SESSION_SECRET: "NON-SECRET-SESSION-FIXTURE-" + "a".repeat(40),
    EDGE_DATA_SECRET: "NON-SECRET-ENCRYPTION-FIXTURE-" + "b".repeat(40),
    EDGE_OPERATOR_TOKEN: serviceToken,
    OPERATOR_SITE_USER_ID: "fixture-site-operator-id",
    OPERATOR_SITE_USER_EMAIL: "operator@fixture.invalid",
    // SITES_IDENTITY_TRUSTED is deliberately absent and must fail closed.
    ANTHROPIC_API_KEY: providerKey,
    TB_REASONING_MODEL: "security-review-fixture-model",
    TB_REASONING_ENABLE_PAID: "true",
    TB_REASONING_MAX_REQUEST_USD: "1",
    TB_REASONING_PRICING_JSON: JSON.stringify({
      model: "security-review-fixture-model",
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
      reviewedAt: new Date().toISOString(),
      sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    }),
    YOUCAM_API_KEY: providerKey,
    YOUCAM_ENABLE_PAID: "true",
    YOUCAM_GENERATION_PLANS_JSON: JSON.stringify([
      {
        spec,
        credits: 2,
        skuHash: pricingHash(sku),
        reviewedAt: new Date().toISOString(),
      },
    ]),
  };
  const calls: Array<{ url: string; method: string }> = [];
  let reasoningResponse: () => Response | Promise<Response> = () =>
    Response.json({
      stop_reason: "end_turn",
      content: [
        { type: "text", text: "SCRIPTED PRIVATE RESULT — not live reasoning" },
      ],
      usage: { input_tokens: 100, output_tokens: 40 },
    });
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input));
      calls.push({ url: url.href, method: init.method ?? "GET" });
      expect(init.redirect).toBe("error");
      if (url.href === "https://api.anthropic.com/v1/messages")
        return reasoningResponse();
      if (url.origin === "https://yce-api-01.makeupar.com") {
        if (url.pathname === "/s2s/v2.0/credit/feature-cost")
          return Response.json({ result: { skus: [sku] } });
        if (url.pathname === "/s2s/v2.0/file")
          return Response.json({
            data: {
              files: [
                {
                  file_id: "fixture-file",
                  requests: [
                    {
                      method: "PUT",
                      url: "https://yce-us.s3-accelerate.amazonaws.com/fixture-upload",
                    },
                  ],
                },
              ],
            },
          });
        if (url.pathname === "/s2s/v2.1/task/hair-transfer")
          return Response.json({ data: { task_id: "fixture-upstream-id" } });
      }
      if (
        url.href === "https://yce-us.s3-accelerate.amazonaws.com/fixture-upload"
      ) {
        expect(new Headers(init.headers).has("authorization")).toBe(false);
        return new Response(null);
      }
      throw new Error(
        "UNEXPECTED FIXTURE FETCH — external network is disabled",
      );
    },
  );
  const request = async (
    path: string,
    options: {
      method?: string;
      body?: unknown;
      rawBody?: string;
      session?: BrowserSession;
      operator?: boolean;
      headers?: Record<string, string>;
      siteOrigin?: string;
      environment?: HostedEnv;
    } = {},
  ) => {
    const headers = new Headers({ origin, ...options.headers });
    if (options.session) {
      headers.set("cookie", options.session.cookie);
      headers.set("x-csrf-token", options.session.csrf);
    }
    if (options.operator)
      headers.set("authorization", `Bearer ${serviceToken}`);
    if (options.body !== undefined || options.rawBody !== undefined)
      if (!headers.has("content-type"))
        headers.set("content-type", "application/json");
    // Explicit header overrides also allow adversarial cookie/CSRF combinations.
    for (const [name, value] of Object.entries(options.headers ?? {}))
      headers.set(name, value);
    const pending: Promise<unknown>[] = [];
    const response = await handleHostedRequest(
      new Request((options.siteOrigin ?? origin) + path, {
        method:
          options.method ??
          (options.body === undefined && options.rawBody === undefined
            ? "GET"
            : "POST"),
        headers,
        ...(options.rawBody !== undefined
          ? { body: options.rawBody }
          : options.body !== undefined
            ? { body: JSON.stringify(options.body) }
            : {}),
      }),
      options.environment ?? env,
      {
        waitUntil: (promise) => {
          pending.push(promise);
        },
      },
    );
    await Promise.all(pending);
    return response;
  };
  const session = async (): Promise<BrowserSession> => {
    const response = await request("/api/session");
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain(
      "Path=/; Secure; HttpOnly; SameSite=Strict",
    );
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const body = (await response.json()) as { csrfToken: string };
    const payload = cookie.slice(cookie.indexOf("=") + 1).split(".")[0];
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as { id: string };
    return { cookie, csrf: body.csrfToken, id: decoded.id };
  };
  const initialize = async (
    operator: BrowserSession,
    budget = initialBudget,
  ) => {
    const response = await request("/api/operator/budget", {
      session: operator,
      operator: true,
      body: budget,
    });
    expect(response.status).toBe(200);
  };
  const quote = async (
    owner: BrowserSession,
    goal = "SCRIPTED PRIVATE GOAL: rose lip preview",
  ) => {
    const payload: ReasoningPayload = {
      goal,
      context: {},
      allowedTools: ["setLipColor"],
      allowPersistence: false,
    };
    const payloadHash = await hashReasoningPayload(payload);
    const response = await request("/api/reasoning/quotes", {
      session: owner,
      body: {
        payloadHash,
        scopes: [],
        allowedTools: payload.allowedTools,
        allowPersistence: false,
        maxSteps: 3,
        maxOutputTokens: 256,
      },
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      quoteId: string;
      maximumUsd: number;
    };
    return {
      quoteId: result.quoteId,
      payload,
      maxUsd: result.maximumUsd,
      consent: {
        approvedPayloadHash: payloadHash,
        scopes: [],
        textTransmission: true,
        providerRetentionAcknowledged: true,
      },
    };
  };
  const approve = async (id: string, operator: BrowserSession) => {
    const response = await request(`/api/operator/approvals/${id}/approve`, {
      method: "POST",
      session: operator,
      operator: true,
    });
    expect(response.status).toBe(200);
  };
  const budget = () => createHostedStore(env).budget();
  return {
    database,
    env,
    request,
    session,
    initialize,
    quote,
    approve,
    budget,
    calls,
    setReasoningResponse: (response: () => Response | Promise<Response>) => {
      reasoningResponse = response;
    },
  };
}

describe("R07 independent native Worker security boundary — real SQLite, scripted fetch only", () => {
  it("bootstraps read-only discovery on a first visit without spending permission", async () => {
    const f = fixture();
    for (const path of [
      "/api/capabilities",
      "/api/generation/capabilities",
      "/api/reasoning/capabilities",
      "/api/merchants/sources",
    ]) {
      const response = await f.request(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("set-cookie")).toContain(
        "Secure; HttpOnly; SameSite=Strict",
      );
    }
    const denied = await f.request("/api/operator/approvals");
    expect(denied.status).toBe(403);
    expect(f.calls).toHaveLength(0);
    expect(
      f.database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_budgets")
        .get()?.n,
    ).toBe(0);
  });
  it("starts UNINITIALIZED and denies quotes until an explicit service-operator reconciliation", async () => {
    const f = fixture();
    expect(
      f.database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_budgets")
        .get()?.n,
    ).toBe(0);
    const owner = await f.session();
    const response = await f.request("/api/reasoning/quotes", {
      session: owner,
      body: {
        payloadHash: "a".repeat(64),
        scopes: [],
        allowedTools: ["setLipColor"],
        allowPersistence: false,
        maxSteps: 3,
        maxOutputTokens: 256,
      },
    });
    expect(response.status).toBe(503);
    expect(f.calls).toHaveLength(0);
    await f.initialize(owner);
    expect(await f.budget()).toEqual(initialBudget);
  });

  it("ignores forged dispatch identity headers until the explicit trust flag is enabled", async () => {
    const f = fixture();
    const headers = {
      "oai-authenticated-user-id": "fixture-site-operator-id",
      "oai-authenticated-user-email": "operator@fixture.invalid",
    };
    const owner = await f.session();
    for (const value of [undefined, "false", "TRUE"]) {
      const response = await f.request("/api/operator/status", {
        headers,
        environment: { ...f.env, SITES_IDENTITY_TRUSTED: value },
      });
      expect(await response.json()).toMatchObject({
        operator: false,
        trustedIdentity: false,
        dispatchIdentityPresent: true,
        dispatchEmailPresent: true,
      });
      const denied = await f.request("/api/operator/budget", {
        session: owner,
        headers,
        body: initialBudget,
        environment: { ...f.env, SITES_IDENTITY_TRUSTED: value },
      });
      expect(denied.status).toBe(403);
    }
    const bearer = await f.request("/api/operator/status", { operator: true });
    expect(await bearer.json()).toMatchObject({
      operator: true,
      trustedIdentity: false,
    });
    const wrongBearer = await f.request("/api/operator/status", {
      headers: { ...headers, authorization: `Bearer ${serviceToken}extra` },
    });
    expect(await wrongBearer.json()).toMatchObject({ operator: false });
  });

  it("accepts only an exact trusted owner ID or normalized owner email with a nonempty dispatch ID", async () => {
    const f = fixture();
    const owner = await f.session();
    const environment = { ...f.env, SITES_IDENTITY_TRUSTED: "true" };
    const cases: Array<{ id?: string; email?: string; operator: boolean }> = [
      { id: "fixture-site-operator-id", operator: true },
      { id: "fixture-site-operator-id-suffix", operator: false },
      {
        id: "different-pairwise-site-id",
        email: "  OPERATOR@FIXTURE.INVALID  ",
        operator: true,
      },
      {
        id: "different-pairwise-site-id",
        email: "operator@fixture.invalid.attacker.invalid",
        operator: false,
      },
      {
        id: "different-pairwise-site-id",
        email: "other@fixture.invalid",
        operator: false,
      },
      { email: "operator@fixture.invalid", operator: false },
      { id: "", email: "operator@fixture.invalid", operator: false },
    ];
    for (const candidate of cases) {
      const headers: Record<string, string> = {};
      if (candidate.id !== undefined)
        headers["oai-authenticated-user-id"] = candidate.id;
      if (candidate.email !== undefined)
        headers["oai-authenticated-user-email"] = candidate.email;
      const response = await f.request("/api/operator/status", {
        headers,
        environment,
      });
      const text = await response.text();
      expect(JSON.parse(text)).toMatchObject({
        operator: candidate.operator,
        trustedIdentity: true,
      });
      expect(text).not.toContain("operator@fixture.invalid");
      expect(text).not.toContain("fixture-site-operator-id");
      const access = await f.request("/api/operator/approvals", {
        session: owner,
        headers,
        environment,
      });
      expect(access.status).toBe(candidate.operator ? 200 : 403);
    }
    expect(f.calls).toHaveLength(0);
  });

  it("rejects foreign/null Origin and noncanonical URL even with a valid service token", async () => {
    const f = fixture();
    const owner = await f.session();
    for (const invalid of [
      "null",
      origin + ".attacker.invalid",
      "https://attacker.invalid",
    ]) {
      const response = await f.request("/api/operator/budget", {
        session: owner,
        operator: true,
        body: initialBudget,
        headers: { origin: invalid },
      });
      expect(response.status).toBe(403);
    }
    const alias = await f.request("/api/operator/status", {
      operator: true,
      siteOrigin: "https://direct-worker-alias.invalid",
    });
    expect(alias.status).toBe(403);
    expect(
      f.database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_budgets")
        .get()?.n,
    ).toBe(0);
  });

  it("replaces invalid discovery cookies with fresh anonymous ownership while rejecting them on private paths and mutations", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const quote = await f.quote(owner);
    await f.approve(quote.quoteId, owner);
    const [name, signed] = owner.cookie.split("=");
    const [payload, signature] = signed.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as Json;
    const changed = Buffer.from(
      JSON.stringify({ ...decoded, id: "a".repeat(64) }),
    ).toString("base64url");
    for (const cookie of [
      `${name}=forged`,
      `${name}=${changed}.${signature}`,
      `${name}=${payload}.${"0".repeat(64)}`,
    ]) {
      const response = await f.request("/api/operator/budget", {
        operator: true,
        headers: { cookie },
        body: initialBudget,
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
      const privateRead = await f.request(
        `/api/access/quotes/${quote.quoteId}`,
        {
          headers: { cookie },
        },
      );
      expect(privateRead.status).toBe(403);
      expect(privateRead.headers.get("set-cookie")).toBeNull();
      const discovery = await f.request("/api/capabilities", {
        headers: { cookie },
      });
      expect(discovery.status).toBe(200);
      const replacement = discovery.headers.get("set-cookie")!.split(";")[0];
      expect(replacement).not.toBe(owner.cookie);
      const replacementPayload = replacement
        .slice(replacement.indexOf("=") + 1)
        .split(".")[0];
      const fresh = JSON.parse(
        Buffer.from(replacementPayload, "base64url").toString(),
      ) as { id: string };
      expect(fresh.id).not.toBe(owner.id);
      expect(fresh.id).not.toBe("a".repeat(64));
      const access = await f.request(`/api/access/quotes/${quote.quoteId}`, {
        headers: { cookie: replacement },
      });
      expect(access.status).toBe(200);
      expect(await access.json()).toMatchObject({
        approved: false,
        operator: false,
      });
    }
    const alternate = "https://another-fixture.invalid";
    const crossOrigin = await f.request("/api/capabilities", {
      siteOrigin: alternate,
      environment: { ...f.env, SITE_ORIGIN: alternate },
      headers: { origin: alternate, cookie: owner.cookie },
    });
    expect(crossOrigin.status).toBe(200);
    const replacement = crossOrigin.headers.get("set-cookie")!.split(";")[0];
    expect(replacement).not.toBe(owner.cookie);
    const oldPrivateRead = await f.request(
      `/api/access/quotes/${quote.quoteId}`,
      {
        siteOrigin: alternate,
        environment: { ...f.env, SITE_ORIGIN: alternate },
        headers: { origin: alternate, cookie: owner.cookie },
      },
    );
    expect(oldPrivateRead.status).toBe(403);
    const newPrivateRead = await f.request(
      `/api/access/quotes/${quote.quoteId}`,
      {
        siteOrigin: alternate,
        environment: { ...f.env, SITE_ORIGIN: alternate },
        headers: { origin: alternate, cookie: replacement },
      },
    );
    expect(await newPrivateRead.json()).toMatchObject({
      approved: false,
      operator: false,
    });
    expect(await f.budget()).toEqual(initialBudget);
    expect(f.calls).toHaveLength(0);
  });

  it("binds CSRF to the signed cookie and requires it for operator mutations", async () => {
    const f = fixture();
    const a = await f.session();
    const b = await f.session();
    for (const token of ["", b.csrf, a.csrf + "extra"]) {
      const response = await f.request("/api/operator/budget", {
        session: a,
        operator: true,
        headers: { "x-csrf-token": token },
        body: initialBudget,
      });
      expect(response.status).toBe(403);
    }
    expect(
      f.database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_budgets")
        .get()?.n,
    ).toBe(0);
  });

  it("denies anonymous initialization, budget inspection, approval listing and approval mutation", async () => {
    const f = fixture();
    const anonymous = await f.session();
    for (const request of [
      { path: "/api/operator/budget", method: "GET" },
      { path: "/api/operator/budget", body: initialBudget },
      { path: "/api/operator/approvals", method: "GET" },
      {
        path: `/api/operator/approvals/${crypto.randomUUID()}/approve`,
        method: "POST",
      },
      {
        path: `/api/operator/approvals/${crypto.randomUUID()}/revoke`,
        method: "POST",
      },
    ]) {
      const response = await f.request(request.path, {
        ...request,
        session: anonymous,
        headers: { "oai-authenticated-user-id": "fixture-site-operator-id" },
      });
      expect(response.status).toBe(403);
    }
  });

  it("rejects a reset or reduction after real reservation and preserves both cumulative totals", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    await f.approve(body.quoteId, owner);
    expect(
      (await f.request("/api/reasoning/sessions", { session: owner, body }))
        .status,
    ).toBe(200);
    const after = await f.budget();
    expect(after.usdMicroUsed).toBe(111000 + Math.round(body.maxUsd * 1e6));
    const reset = await f.request("/api/operator/budget", {
      session: owner,
      operator: true,
      body: initialBudget,
    });
    expect(reset.status).toBe(409);
    const zero = await f.request("/api/operator/budget", {
      session: owner,
      operator: true,
      body: { ...initialBudget, creditsUsed: 0, usdMicroUsed: 0 },
    });
    expect(zero.status).toBe(400);
    expect(await f.budget()).toEqual(after);
  });

  it("denies anonymous spending and does not turn an access request into an approval", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    const accessRequest = await f.request(
      `/api/access/requests/${body.quoteId}`,
      { method: "POST", session: owner },
    );
    expect(await accessRequest.json()).toMatchObject({
      requested: true,
      approved: false,
    });
    const response = await f.request("/api/reasoning/sessions", {
      session: owner,
      body,
      headers: { "oai-authenticated-user-id": "fixture-site-operator-id" },
    });
    expect(response.status).toBe(403);
    expect(await f.budget()).toEqual(initialBudget);
    expect(
      f.database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_reservations")
        .get()?.n,
    ).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  it("grants only the exact quote to its original signed session and never reveals its private payload to the operator list", async () => {
    const f = fixture();
    const owner = await f.session();
    const stranger = await f.session();
    await f.initialize(owner);
    const granted = await f.quote(owner);
    const other = await f.quote(owner, "SECOND PRIVATE GOAL");
    const pending = await f.request("/api/operator/approvals", {
      session: owner,
      operator: true,
    });
    const pendingText = await pending.text();
    expect(pendingText).toContain(granted.quoteId);
    expect(pendingText).not.toMatch(/PRIVATE|rose lip|payloadHash|cookie|csrf/);
    await f.approve(granted.quoteId, owner);
    const wrongOwner = await f.request("/api/reasoning/sessions", {
      session: stranger,
      body: granted,
    });
    expect(wrongOwner.status).toBe(400);
    const ungranted = await f.request("/api/reasoning/sessions", {
      session: owner,
      body: other,
    });
    expect(ungranted.status).toBe(403);
    const access = await f.request(`/api/access/quotes/${granted.quoteId}`, {
      session: stranger,
    });
    expect(await access.json()).toMatchObject({ approved: false });
    const altered = await f.request("/api/reasoning/sessions", {
      session: owner,
      body: {
        ...granted,
        payload: { ...granted.payload, goal: "CHANGED PRIVATE GOAL" },
      },
    });
    expect(altered.status).toBe(400);
    expect(await f.budget()).toEqual(initialBudget);
    expect(
      (
        await f.request("/api/reasoning/sessions", {
          session: owner,
          body: granted,
        })
      ).status,
    ).toBe(200);
  });

  it("consumes an approved quote and reserves budget only once under concurrent Worker requests", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    await f.approve(body.quoteId, owner);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        f.request("/api/reasoning/sessions", { session: owner, body }),
      ),
    );
    expect(results.every((response) => response.status === 200)).toBe(true);
    expect(
      f.database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_reservations")
        .get()?.n,
    ).toBe(1);
    expect(
      f.database.sql
        .prepare(
          "SELECT count(*) AS n FROM tb_hosted_records WHERE namespace='reasoning'",
        )
        .get()?.n,
    ).toBe(1);
    expect((await f.budget()).usdMicroUsed).toBe(
      111000 + Math.round(body.maxUsd * 1e6),
    );
    expect(f.calls).toHaveLength(0);
  });

  it("atomically admits only one approved quote when two requests race for the remaining USD total", async () => {
    const f = fixture();
    const owner = await f.session();
    const microUsd = 3 * (32000 + 256 * 2);
    await f.initialize(owner, {
      ...initialBudget,
      usdMicroLimit: 111000 + microUsd,
    });
    const bodies = await Promise.all([
      f.quote(owner),
      f.quote(owner, "SECOND FIXTURE GOAL"),
    ]);
    for (const body of bodies) await f.approve(body.quoteId, owner);
    const results = await Promise.all(
      bodies.map((body) =>
        f.request("/api/reasoning/sessions", { session: owner, body }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 429,
    ]);
    expect((await f.budget()).usdMicroUsed).toBe(111000 + microUsd);
    expect(
      f.database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_reservations")
        .get()?.n,
    ).toBe(1);
    expect(
      f.database.sql
        .prepare(
          "SELECT count(*) AS n FROM tb_hosted_records WHERE namespace='reasoning'",
        )
        .get()?.n,
    ).toBe(1);
  });

  it("revokes a started task's paid continuation without refunding or allowing anonymous dispatch", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    await f.approve(body.quoteId, owner);
    expect(
      (await f.request("/api/reasoning/sessions", { session: owner, body }))
        .status,
    ).toBe(200);
    const spent = await f.budget();
    expect(
      (
        await f.request(`/api/operator/approvals/${body.quoteId}/revoke`, {
          method: "POST",
          session: owner,
          operator: true,
        })
      ).status,
    ).toBe(200);
    const response = await f.request(
      `/api/reasoning/sessions/${body.quoteId}/step`,
      { session: owner, body: { stepId: crypto.randomUUID(), feedback: [] } },
    );
    expect(response.status).toBe(403);
    expect(f.calls).toHaveLength(0);
    expect(await f.budget()).toEqual(spent);
  });

  it("denies another session's reasoning steps and cancellation even after operator approval", async () => {
    const f = fixture();
    const owner = await f.session();
    const stranger = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    await f.approve(body.quoteId, owner);
    await f.request("/api/reasoning/sessions", { session: owner, body });
    const step = await f.request(
      `/api/reasoning/sessions/${body.quoteId}/step`,
      {
        session: stranger,
        body: { stepId: crypto.randomUUID(), feedback: [] },
      },
    );
    expect(step.status).toBe(404);
    const remove = await f.request(`/api/reasoning/sessions/${body.quoteId}`, {
      method: "DELETE",
      session: stranger,
    });
    expect(remove.status).toBe(404);
    expect(f.calls).toHaveLength(0);
  });

  it("bounds actual and declared JSON request bytes before state creation or provider calls", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    for (const options of [
      { body: {}, headers: { "content-length": "16385" } },
      { rawBody: JSON.stringify({ payload: "x".repeat(17000) }) },
    ]) {
      const response = await f.request("/api/reasoning/quotes", {
        session: owner,
        ...options,
      });
      expect(response.status).toBe(413);
    }
    const media = await f.request("/api/generation/tasks", {
      session: owner,
      body: {},
      headers: { "content-length": String(12 * 1024 * 1024 + 1) },
    });
    expect(media.status).toBe(413);
    const wrongType = await f.request("/api/reasoning/quotes", {
      session: owner,
      rawBody: "{}",
      headers: { "content-type": "text/plain" },
    });
    expect(wrongType.status).toBe(415);
    expect(
      f.database.sql.prepare("SELECT count(*) AS n FROM tb_hosted_quotes").get()
        ?.n,
    ).toBe(0);
    expect(f.calls).toHaveLength(0);
  });

  it("keeps source images out of D1 and enforces a single shared credit ceiling before upload", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner, { ...initialBudget, creditsLimit: 53 });
    const quotes: Array<{ quoteId: string }> = [];
    for (let index = 0; index < 2; index++) {
      const response = await f.request("/api/generation/quotes", {
        session: owner,
        body: { spec },
      });
      expect(response.status).toBe(200);
      const quote = (await response.json()) as { quoteId: string };
      quotes.push(quote);
      await f.approve(quote.quoteId, owner);
    }
    const results = await Promise.all(
      quotes.map((quote) =>
        f.request("/api/generation/tasks", {
          session: owner,
          body: {
            quoteId: quote.quoteId,
            spec,
            source,
            maxCredits: 2,
            consent: {
              uploadImages: true,
              rightsConfirmed: true,
              externalProcessing: true,
              providerRetentionAcknowledged: true,
            },
          },
        }),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      202, 429,
    ]);
    expect((await f.budget()).creditsUsed).toBe(53);
    expect(f.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
    expect(
      f.calls.filter((call) => call.url.endsWith("/task/hair-transfer")),
    ).toHaveLength(1);
    const stored = JSON.stringify(
      f.database.sql.prepare("SELECT * FROM tb_hosted_records").all(),
    );
    expect(stored).not.toContain(source.base64);
    expect(stored).not.toContain(providerKey);
    expect(stored).not.toContain("fixture-upstream-id");
  });

  it("encrypts private prompts/results, rejects ciphertext tampering and returns no private content in errors", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    await f.approve(body.quoteId, owner);
    await f.request("/api/reasoning/sessions", { session: owner, body });
    const stepId = crypto.randomUUID();
    const response = await f.request(
      `/api/reasoning/sessions/${body.quoteId}/step`,
      { session: owner, body: { stepId, feedback: [] } },
    );
    expect(response.status).toBe(200);
    const records = JSON.stringify(
      f.database.sql.prepare("SELECT * FROM tb_hosted_records").all(),
    );
    expect(records).not.toMatch(/SCRIPTED PRIVATE|rose lip|PRIVATE RESULT/);
    expect(records).not.toContain(providerKey);
    expect(records).not.toContain(owner.id);
    const record = await createHostedStore(f.env).get<{ messages: unknown[] }>(
      "reasoning",
      body.quoteId,
      owner.id,
    );
    expect(record?.value.messages).toEqual([]);
    f.database.sql
      .prepare("UPDATE tb_hosted_records SET ciphertext=? WHERE id=?")
      .run("UNAUTHENTICATED-CIPHERTEXT", body.quoteId);
    const tampered = await f.request(
      `/api/reasoning/sessions/${body.quoteId}/step`,
      { session: owner, body: { stepId, feedback: [] } },
    );
    expect(tampered.status).toBe(503);
    expect(await tampered.text()).not.toMatch(
      /SCRIPTED PRIVATE|PRIVATE RESULT|NON-SECRET|ciphertext|stack/i,
    );
  });

  it("redacts arbitrary upstream error bodies and rejects credential reflection at the actual Worker route", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    for (const reflection of [false, true]) {
      f.setReasoningResponse(() =>
        reflection
          ? Response.json({
              stop_reason: "end_turn",
              content: [{ type: "text", text: providerKey }],
              usage: { input_tokens: 100, output_tokens: 40 },
            })
          : new Response(`PRIVATE-UPSTREAM-ERROR ${providerKey}`, {
              status: 403,
            }),
      );
      const body = await f.quote(owner);
      await f.approve(body.quoteId, owner);
      await f.request("/api/reasoning/sessions", { session: owner, body });
      const response = await f.request(
        `/api/reasoning/sessions/${body.quoteId}/step`,
        { session: owner, body: { stepId: crypto.randomUUID(), feedback: [] } },
      );
      expect(response.status).toBe(502);
      const text = await response.text();
      expect(text).not.toContain(providerKey);
      expect(text).not.toContain("PRIVATE-UPSTREAM-ERROR");
      expect(text).not.toContain(body.payload.goal);
    }
  });

  it("denies expired task access and prunes on later activity without resetting cumulative usage", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    await f.approve(body.quoteId, owner);
    await f.request("/api/reasoning/sessions", { session: owner, body });
    const spent = await f.budget();
    const later = Date.now() + 16 * 60000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const response = await f.request(
      `/api/reasoning/sessions/${body.quoteId}/step`,
      { session: owner, body: { stepId: crypto.randomUUID(), feedback: [] } },
    );
    expect(response.status).toBe(404);
    expect(
      f.database.sql
        .prepare(
          "SELECT count(*) AS n FROM tb_hosted_records WHERE namespace='reasoning'",
        )
        .get()?.n,
    ).toBe(0);
    expect(await f.budget()).toEqual(spent);
    expect(f.calls).toHaveLength(0);
  });

  it("claims one durable turn across concurrent Worker entries and discards output after cancellation", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const body = await f.quote(owner);
    await f.approve(body.quoteId, owner);
    await f.request("/api/reasoning/sessions", { session: owner, body });
    let entered!: () => void;
    const began = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: (response: Response) => void;
    const deferred = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    f.setReasoningResponse(() => {
      entered();
      return deferred;
    });
    const firstStep = { stepId: crypto.randomUUID(), feedback: [] };
    const first = f.request(`/api/reasoning/sessions/${body.quoteId}/step`, {
      session: owner,
      body: firstStep,
    });
    await began;
    const parallel = await f.request(
      `/api/reasoning/sessions/${body.quoteId}/step`,
      { session: owner, body: { stepId: crypto.randomUUID(), feedback: [] } },
    );
    expect(parallel.status).toBe(409);
    const cancelled = await f.request(
      `/api/reasoning/sessions/${body.quoteId}`,
      { method: "DELETE", session: owner },
    );
    expect(cancelled.status).toBe(200);
    finish(
      Response.json({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "LATE PRIVATE TOOL PLAN" }],
        usage: { input_tokens: 100, output_tokens: 40 },
      }),
    );
    const late = await first;
    expect(late.status).toBe(409);
    expect(await late.text()).not.toContain("LATE PRIVATE");
    expect(
      f.calls.filter((call) => call.url.includes("anthropic.com")),
    ).toHaveLength(1);
    const replay = await f.request(
      `/api/reasoning/sessions/${body.quoteId}/step`,
      { session: owner, body: firstStep },
    );
    expect(replay.status).toBe(404);
    expect(
      f.database.sql
        .prepare(
          "SELECT count(*) AS n FROM tb_hosted_records WHERE namespace='reasoning'",
        )
        .get()?.n,
    ).toBe(0);
    expect((await f.budget()).usdMicroUsed).toBe(
      111000 + Math.round(body.maxUsd * 1e6),
    );
  });

  it("fails closed on expired signed cookies and missing data-encryption configuration", async () => {
    const f = fixture();
    const owner = await f.session();
    await f.initialize(owner);
    const noEncryption = { ...f.env, EDGE_DATA_SECRET: "" };
    const quote = await f.request("/api/reasoning/quotes", {
      session: owner,
      environment: noEncryption,
      body: {
        payloadHash: "a".repeat(64),
        scopes: [],
        allowedTools: ["setLipColor"],
        allowPersistence: false,
        maxSteps: 3,
        maxOutputTokens: 256,
      },
    });
    expect(quote.status).toBe(503);
    expect(
      f.database.sql.prepare("SELECT count(*) AS n FROM tb_hosted_quotes").get()
        ?.n,
    ).toBe(0);
    const later = Date.now() + 3600001;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const expired = await f.request("/api/operator/budget", {
      session: owner,
      operator: true,
    });
    expect(expired.status).toBe(403);
    expect(f.calls).toHaveLength(0);
  });
});
