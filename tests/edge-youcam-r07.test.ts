/** Native route + REAL SQLite encrypted-store contract fixtures.
 * Upstream is loopback HTTP only. No live provider, image transmission or paid spend. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createEdgeD1Fixture } from "./helpers/edge-d1";
import { createHostedStore } from "../apps/edge/src/runtime/store";
import {
  handleYouCam,
  youcamCapabilities,
} from "../apps/edge/src/routes/youcam";
import {
  type HostedContext,
  type HostedEnv,
} from "../apps/edge/src/runtime/contracts";
import { pricingHash } from "../apps/api/src/provider";
import {
  YOUCAM_ORIGIN,
  safeYouCamMediaUrl,
} from "../apps/api/src/youcamTransport";
import type { GenerationSpec } from "../apps/api/src/generationContracts";
const hair: GenerationSpec = {
    feature: "hair",
    hairColor: "src",
    templateId: "fixture-bob",
  },
  clothing: GenerationSpec = {
    feature: "clothing",
    garmentCategory: "upper_body",
    changeShoes: false,
    filterMultiPerson: "strict",
  };
const paths = {
  skin: "/s2s/v2.1/task/skin-analysis",
  hair: "/s2s/v2.1/task/hair-transfer",
  clothing: "/s2s/v2.0/task/cloth-v4",
};
const fixtureKey = "NON-SECRET-LOOPBACK-FIXTURE-KEY";
const owner = "a".repeat(64),
  otherOwner = "b".repeat(64);
const png = Buffer.alloc(120);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
const source = {
  base64: png.toString("base64"),
  contentType: "image/png" as const,
};
const consent = {
  uploadImages: true,
  rightsConfirmed: true,
  externalProcessing: true,
  providerRetentionAcknowledged: true,
};
const skus = Object.entries(paths).map(([feature, path]) => ({
  run_task_url: YOUCAM_ORIGIN + path,
  amount: feature === "skin" ? 9 : 2,
  description: "LOOPBACK FIXTURE; no genuine price or output",
}));
let database: ReturnType<typeof createEdgeD1Fixture>,
  server: Server | undefined,
  env: HostedEnv,
  now: number,
  port: number;
const calls: {
  path: string;
  method: string;
  authorization?: string;
  body: any;
  bytes: number;
}[] = [];
let created = 0,
  uploadCount = 0,
  priceChanged = false,
  unsafeOutput = false,
  skinError: string | undefined;
let onUpload: (() => Promise<void>) | undefined,
  onStatus: (() => Promise<void>) | undefined,
  onImage: (() => Promise<void>) | undefined;
const ctx = (operator = true, session = owner): HostedContext => ({
  env,
  store: createHostedStore(env, () => now),
  session: {
    id: session,
    csrfToken: "not-used-in-route-unit-boundary-fixture",
    expiresAt: now + 1800000,
  },
  operator,
  operatorId: operator ? "fixture-operator" : null,
  now: () => now,
  waitUntil: () => {},
});
const transport: typeof fetch = async (input, init) => {
  const url = new URL(String(input));
  if (url.origin !== YOUCAM_ORIGIN) safeYouCamMediaUrl(url.href);
  return fetch(`http://127.0.0.1:${port}` + url.pathname + url.search, init);
};
async function route(
  path: string,
  body?: unknown,
  context = ctx(),
  method = body === undefined ? "GET" : "POST",
) {
  const response = await handleYouCam(
    new Request("https://fixture.invalid" + path, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    context,
    { request: transport },
  );
  if (!response) throw new Error("Fixture path not handled");
  return response;
}
async function quoted(
  feature: "skin" | "hair" | "clothing" = "hair",
  context = ctx(),
) {
  const result = await route(
    feature === "skin" ? "/api/skin/quotes" : "/api/generation/quotes",
    feature === "skin"
      ? { actions: ["texture"] }
      : { spec: feature === "hair" ? hair : clothing },
    context,
  );
  expect(result.status).toBe(200);
  return await result.json();
}
const taskBody = (q: any, feature: "skin" | "hair" | "clothing" = "hair") =>
  feature === "skin"
    ? {
        quoteId: q.quoteId,
        imageBase64: source.base64,
        contentType: source.contentType,
        actions: ["texture"],
        maxCredits: q.credits,
        consent: {
          uploadImage: true,
          externalProcessing: true,
          providerRetentionAcknowledged: true,
        },
      }
    : {
        quoteId: q.quoteId,
        spec: feature === "hair" ? hair : clothing,
        source,
        ...(feature === "clothing" ? { reference: source } : {}),
        maxCredits: q.credits,
        consent,
      };
beforeEach(async () => {
  now = Date.now();
  calls.length = 0;
  created = 0;
  uploadCount = 0;
  priceChanged = false;
  unsafeOutput = false;
  skinError = undefined;
  onUpload = undefined;
  onStatus = undefined;
  onImage = undefined;
  database = createEdgeD1Fixture();
  env = {
    DB: database.db,
    SITE_ORIGIN: "https://fixture.invalid",
    EDGE_SESSION_SECRET: "fixture-session-secret-".repeat(3),
    EDGE_DATA_SECRET: "fixture-data-secret-".repeat(3),
    YOUCAM_API_KEY: fixtureKey,
    YOUCAM_ENABLE_PAID: "true",
    YOUCAM_SKIN_PLAN_JSON: JSON.stringify({
      actions: ["texture"],
      credits: 9,
      skuHash: pricingHash(skus[0]),
      reviewedAt: new Date(now).toISOString(),
    }),
    YOUCAM_GENERATION_PLANS_JSON: JSON.stringify([
      {
        spec: hair,
        credits: 2,
        skuHash: pricingHash(skus[1]),
        reviewedAt: new Date(now).toISOString(),
      },
      {
        spec: clothing,
        credits: 2,
        skuHash: pricingHash(skus[2]),
        reviewedAt: new Date(now).toISOString(),
      },
    ]),
  };
  await ctx().store.initializeBudget(
    {
      creditsUsed: 51,
      creditsLimit: 100,
      usdMicroUsed: 111000,
      usdMicroLimit: 5000000,
    },
    "fixture-operator",
  );
  server = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://fixture").pathname,
      chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    let body: any;
    try {
      body = JSON.parse(bytes.toString());
    } catch {
      /* Binary fixture upload. */
    }
    calls.push({
      path,
      method: req.method!,
      authorization: req.headers.authorization,
      body,
      bytes: bytes.length,
    });
    const json = (value: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    if (path.startsWith("/fixture-upload/")) {
      uploadCount++;
      await onUpload?.();
      res.end();
      return;
    }
    if (path === "/fixture-output.png") {
      await onImage?.();
      res.setHeader("Content-Type", "image/png");
      res.end(png);
      return;
    }
    if (req.headers.authorization !== `Bearer ${fixtureKey}`) {
      res.statusCode = 401;
      json({ error: "fixture bearer required" });
      return;
    }
    if (path === "/s2s/v2.0/credit/feature-cost") {
      json({
        result: {
          skus: priceChanged ? skus.map((s) => ({ ...s, amount: 99 })) : skus,
        },
      });
      return;
    }
    if (path === "/s2s/v2.0/file") {
      json({
        data: {
          files: [
            {
              file_id: "fixture-file-" + (uploadCount + 1),
              requests: [
                {
                  method: "PUT",
                  url:
                    "https://yce-us.s3-accelerate.amazonaws.com/fixture-upload/" +
                    (uploadCount + 1),
                  headers: { "Content-Type": "image/png" },
                },
              ],
            },
          ],
        },
      });
      return;
    }
    if (path === "/s2s/v2.1/task/template/hair-transfer") {
      json({
        data: {
          templates: [{ id: "fixture-bob", title: "LOOPBACK FIXTURE Bob" }],
        },
      });
      return;
    }
    if (req.method === "POST" && Object.values(paths).includes(path)) {
      created++;
      json({ data: { task_id: "private-upstream-fixture-" + created } });
      return;
    }
    if (
      req.method === "GET" &&
      path.includes("/task/") &&
      path.includes("/private-upstream-fixture-")
    ) {
      await onStatus?.();
      if (path.startsWith(paths.skin))
        json({
          data: skinError
            ? {
                task_status: "error",
                error: skinError,
                error_message:
                  "secret-untrusted-message https://private.invalid/signed-token",
              }
            : {
                task_status: "success",
                results: {
                  output: [
                    {
                      type: "texture",
                      ui_score: 72,
                      raw_score: 70,
                      mask_urls: [
                        "https://yce-us.s3-accelerate.amazonaws.com/fixture-output.png",
                        "https://untrusted.invalid/private",
                      ],
                    },
                  ],
                },
              },
        });
      else
        json({
          data: {
            task_status: "success",
            results: {
              url: unsafeOutput
                ? "http://169.254.169.254/latest/meta-data"
                : "https://yce-us.s3-accelerate.amazonaws.com/fixture-output.png",
            },
          },
        });
      return;
    }
    res.statusCode = 404;
    json({ error: "unknown loopback fixture path" });
  });
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing fixture");
  port = address.port;
});
afterEach(async () => {
  await new Promise<void>((done) =>
    server ? server.close(() => done()) : done(),
  );
  database.close();
  server = undefined;
});
describe("native hosted YouCam workflows (loopback contracts, not live verification)", () => {
  it("keeps metadata quote public but denies spending without operator or exact quote grant", async () => {
    const publicContext = ctx(false);
    const q = await quoted("hair", publicContext);
    expect(q.authorization.approved).toBe(false);
    const denied = await route(
      "/api/generation/tasks",
      taskBody(q),
      ctx(false),
    );
    expect(denied.status).toBe(403);
    expect(created).toBe(0);
    expect(uploadCount).toBe(0);
    await ctx().store.approveQuote(q.quoteId, "fixture-operator");
    const started = await route(
      "/api/generation/tasks",
      taskBody(q),
      ctx(false),
    );
    expect(started.status).toBe(202);
    expect((await started.json()).taskId).toBe(q.quoteId);
    expect(created).toBe(1);
    expect((await ctx().store.budget()).creditsUsed).toBe(53);
  });
  it("persists encrypted task identifiers, resumes across rebuilt store instances and proxies actual image bytes without leaking bearer", async () => {
    const q = await quoted();
    const start = await route("/api/generation/tasks", taskBody(q));
    expect((await start.json()).status).toBe("running");
    const row = database.sql
      .prepare("SELECT * FROM tb_hosted_records WHERE id=?")
      .get(q.quoteId);
    expect(JSON.stringify(row)).not.toContain("private-upstream-fixture");
    expect(JSON.stringify(row)).not.toContain(source.base64);
    expect(JSON.stringify(row)).not.toContain(fixtureKey);
    const plain = await ctx().store.get<any>("youcam-task", q.quoteId, owner);
    expect(plain?.value.upstreamId).toContain("private-upstream-fixture");
    expect(JSON.stringify(plain?.value)).not.toContain("base64");
    now += 5 * 60000 + 1;
    expect(await ctx().store.getQuote(q.quoteId, owner)).toBeNull();
    const status = await route(
      "/api/generation/tasks/" + q.quoteId,
      undefined,
      ctx(),
    );
    const result = await status.json();
    expect(result.status).toBe("success");
    expect(result.result.kind).toBe("ai-generated-image");
    expect(JSON.stringify(result)).not.toContain("amazonaws");
    expect(JSON.stringify(result)).not.toContain("private-upstream-fixture");
    const image = await route(result.result.imagePath);
    expect(image.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(
      new Uint8Array(png),
    );
    expect(
      calls
        .filter(
          (c) =>
            c.path.startsWith("/fixture-upload/") ||
            c.path === "/fixture-output.png",
        )
        .every((c) => c.authorization === undefined),
    ).toBe(true);
    const list = await route("/api/generation/tasks");
    expect((await list.json()).tasks).toHaveLength(1);
    expect(
      (
        await route(
          "/api/generation/tasks/" + q.quoteId,
          undefined,
          ctx(true, otherOwner),
        )
      ).status,
    ).toBe(404);
  });
  it("coalesces simultaneous replay from separate contexts into one paid dispatch and one reservation", async () => {
    const q = await quoted();
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((r) => (entered = r)),
      hold = new Promise<void>((r) => (release = r));
    onUpload = async () => {
      entered();
      await hold;
    };
    const first = route("/api/generation/tasks", taskBody(q), ctx());
    await waiting;
    const replay = await route("/api/generation/tasks", taskBody(q), ctx());
    expect((await replay.json()).status).toBe("uploading");
    release();
    expect((await first).status).toBe(202);
    const third = await route("/api/generation/tasks", taskBody(q), ctx());
    expect((await third.json()).taskId).toBe(q.quoteId);
    expect(created).toBe(1);
    expect(uploadCount).toBe(1);
    expect(
      database.sql
        .prepare("SELECT count(*) AS n FROM tb_hosted_reservations")
        .get()?.n,
    ).toBe(1);
  });
  it("rechecks exact grant after upload so revocation prevents the paid task POST even for the operator", async () => {
    const q = await quoted();
    onUpload = async () =>
      ctx().store.revokeQuote(q.quoteId, "fixture-operator");
    const result = await route("/api/generation/tasks", taskBody(q));
    expect(result.status).toBe(403);
    expect(uploadCount).toBe(1);
    expect(created).toBe(0);
    expect((await ctx().store.budget()).creditsUsed).toBe(53);
  });
  it("enforces malformed consent, exact settings, image signatures and current SKU before dispatch", async () => {
    const q = await quoted();
    for (const body of [
      { ...taskBody(q), consent: { ...consent, rightsConfirmed: false } },
      { ...taskBody(q), spec: { ...hair, hairColor: "ref" } },
      {
        ...taskBody(q),
        source: {
          base64: Buffer.alloc(120).toString("base64"),
          contentType: "image/png",
        },
      },
      { ...taskBody(q), maxCredits: 1 },
    ])
      expect(
        (await route("/api/generation/tasks", body)).status,
      ).toBeGreaterThanOrEqual(400);
    expect(created).toBe(0);
    expect(uploadCount).toBe(0);
    priceChanged = true;
    const changed = await route("/api/generation/tasks", taskBody(q));
    expect((await changed.json()).status).toBe("error");
    expect(created).toBe(0);
    expect(uploadCount).toBe(0);
  });
  it("shares atomic credit ceiling across concurrent skin and generation reservations", async () => {
    const s = await quoted("skin"),
      g = await quoted("clothing");
    // Test-only starting condition: the production initializer correctly refuses resets.
    database.sql.prepare("UPDATE tb_hosted_budgets SET credits_used=98").run();
    const responses = await Promise.all([
      route("/api/skin/tasks", taskBody(s, "skin")),
      route("/api/generation/tasks", taskBody(g, "clothing")),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([202, 429]);
    expect(created).toBe(1);
    expect((await ctx().store.budget()).creditsUsed).toBe(100);
  });
  it("treats an expired dispatch lease as uncertain and never redispatches after a simulated isolate crash", async () => {
    const q = await quoted();
    const stored = await ctx().store.getQuote<any>(q.quoteId, owner);
    expect(stored).toBeTruthy();
    await ctx().store.consumeQuoteAndCreate({
      quoteId: q.quoteId,
      owner,
      operator: true,
      operation: "hair",
      termsHash: stored!.termsHash,
      record: {
        namespace: "youcam-task",
        id: q.quoteId,
        expiresAt: now + 900000,
        value: {
          operation: "hair",
          settings: hair,
          quoteId: q.quoteId,
          phase: "dispatching",
          createdAt: now,
          nextPoll: now + 10000,
          dispatchUntil: now + 35000,
        },
      },
    });
    now += 36000;
    const retry = await route("/api/generation/tasks", taskBody(q));
    const body = await retry.json();
    expect(body.status).toBe("error");
    expect(body.uncertain).toBe(true);
    expect(created).toBe(0);
    expect(uploadCount).toBe(0);
  });
  it("returns real normalized skin fields, preserves safe mask proxy and sanitizes terminal failures", async () => {
    const q = await quoted("skin");
    await route("/api/skin/tasks", taskBody(q, "skin"));
    now += 10001;
    const body = await (await route("/api/skin/tasks/" + q.quoteId)).json();
    expect(body.status).toBe("success");
    expect(body.result.observations[0].rawScore).toBe(70);
    expect(body.result.observations[0].maskUrls).toEqual([
      `/api/skin/tasks/${q.quoteId}/masks/0/0`,
    ]);
    expect(
      (await route(body.result.observations[0].maskUrls[0])).headers.get(
        "content-type",
      ),
    ).toBe("image/png");
    skinError = "error_src_face_too_small";
    const errorQuote = await quoted("skin");
    await route("/api/skin/tasks", taskBody(errorQuote, "skin"));
    now += 10001;
    const failure = await (
      await route("/api/skin/tasks/" + errorQuote.quoteId)
    ).json();
    expect(failure.status).toBe("error");
    expect(failure.providerFailure.code).toBe(skinError);
    expect(failure.providerFailure.recovery).toContain("60%");
    expect(JSON.stringify(failure)).not.toContain("secret-untrusted-message");
    expect(failure).not.toHaveProperty("result");
  });
  it("rejects unsafe output URLs and an overlarge streamed body without exposing a result", async () => {
    const q = await quoted();
    await route("/api/generation/tasks", taskBody(q));
    unsafeOutput = true;
    now += 10001;
    const status = await (
      await route("/api/generation/tasks/" + q.quoteId)
    ).json();
    expect(status.status).toBe("running");
    expect(status).not.toHaveProperty("result");
    expect(JSON.stringify(status)).not.toContain("169.254");
    const huge = await handleYouCam(
      new Request("https://fixture.invalid/api/generation/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: " ".repeat(12 * 1024 * 1024 + 1),
      }),
      ctx(),
      { request: transport },
    );
    expect(huge?.status).toBe(413);
    expect(created).toBe(1);
  });
  it("keeps cancellation/deletion and TTL owner-scoped and prevents deleted quote replay from charging again", async () => {
    const q = await quoted();
    await route("/api/generation/tasks", taskBody(q));
    expect(
      (await route("/api/generation/tasks/" + q.quoteId + "/cancel", {}, ctx()))
        .status,
    ).toBe(200);
    now += 10001;
    expect(
      (await (await route("/api/generation/tasks/" + q.quoteId)).json()).status,
    ).toBe("cancelled");
    expect(
      (
        await route(
          "/api/generation/tasks/" + q.quoteId,
          undefined,
          ctx(),
          "DELETE",
        )
      ).status,
    ).toBe(200);
    expect(
      (await route("/api/generation/tasks", taskBody(q))).status,
    ).toBeGreaterThanOrEqual(400);
    expect(created).toBe(1);
    const q2 = await quoted("clothing");
    await route("/api/generation/tasks", taskBody(q2, "clothing"));
    now += 900001;
    expect((await route("/api/generation/tasks/" + q2.quoteId)).status).toBe(
      404,
    );
    await ctx().store.cleanup();
    expect(
      database.sql.prepare("SELECT count(*) AS n FROM tb_hosted_records").get()
        ?.n,
    ).toBe(0);
  });
  it("does not restore cancelled results when an older in-flight poll completes", async () => {
    const q = await quoted();
    await route("/api/generation/tasks", taskBody(q));
    now += 10001;
    let release!: () => void, entered!: () => void;
    const waiting = new Promise<void>((r) => (entered = r)),
      hold = new Promise<void>((r) => (release = r));
    onStatus = async () => {
      entered();
      await hold;
    };
    const polling = route("/api/generation/tasks/" + q.quoteId);
    await waiting;
    await route("/api/generation/tasks/" + q.quoteId + "/cancel", {});
    release();
    const body = await (await polling).json();
    expect(body.status).toBe("cancelled");
    expect(body).not.toHaveProperty("result");
    expect(
      (await route("/api/generation/tasks/" + q.quoteId + "/image")).status,
    ).toBe(409);
  });
  it("does not deliver image bytes after cancellation during an in-flight download", async () => {
    const q = await quoted();
    await route("/api/generation/tasks", taskBody(q));
    now += 10001;
    expect(
      (await (await route("/api/generation/tasks/" + q.quoteId)).json()).status,
    ).toBe("success");
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>((r) => (entered = r)),
      hold = new Promise<void>((r) => (release = r));
    onImage = async () => {
      entered();
      await hold;
    };
    const downloading = route("/api/generation/tasks/" + q.quoteId + "/image");
    await waiting;
    try {
      expect(
        (await route("/api/generation/tasks/" + q.quoteId + "/cancel", {}))
          .status,
      ).toBe(200);
    } finally {
      release();
    }
    const stopped = await downloading;
    expect(stopped.status).toBe(410);
    expect(stopped.headers.get("content-type")).toContain("application/json");
  });
  it("exposes honest setup/template metadata and leaves unrelated paths to the root router", async () => {
    expect((await youcamCapabilities(ctx())).skinAnalysis.status).toBe(
      "requires-verified-quote",
    );
    const template = await route("/api/generation/templates/hair");
    expect((await template.json()).templates[0].id).toBe("fixture-bob");
    expect(created).toBe(0);
    database.sql.prepare("DELETE FROM tb_hosted_budgets").run();
    expect((await youcamCapabilities(ctx())).skinAnalysis.status).toBe(
      "unavailable",
    );
    env.YOUCAM_API_KEY = undefined;
    const cap = await (await route("/api/generation/capabilities")).json();
    expect(cap.credentialConfigured).toBe(false);
    expect(cap.liveVerified).toBe(false);
    expect(cap.retention.providerDays).toBe(30);
    expect(
      await handleYouCam(
        new Request("https://fixture.invalid/api/other"),
        ctx(),
      ),
    ).toBeNull();
  });
});
