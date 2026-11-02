/** CONTRACT FIXTURES ONLY: upstream HTTP server is loopback; no live YouCam call or credit spend. */
import { afterEach, describe, it, expect } from "vitest";
import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { registerGenerationRoutes } from "../apps/api/src/generation";
import { createApi } from "../apps/api/src/server";
import {
  YouCamGenerationProvider,
  type GenerationProvider,
  type GenerationInput,
} from "../apps/api/src/generationProvider";
import {
  GenerationPlan,
  GenerationTaskRequest,
  GENERATION_TASK_PATHS,
  type GenerationSpec,
} from "../apps/api/src/generationContracts";
import { pricingHash } from "../apps/api/src/provider";
import {
  safeYouCamMediaUrl,
  readBounded,
  YOUCAM_ORIGIN,
} from "../apps/api/src/youcamTransport";
const fixtureKey = "non-secret-contract-fixture-key";
const hair: GenerationSpec = { feature: "hair", hairColor: "src" };
const clothing: GenerationSpec = {
  feature: "clothing",
  garmentCategory: "outer",
  changeShoes: false,
  filterMultiPerson: "strict",
};
const calls: {
  path: string;
  method: string;
  authorization?: string;
  body: unknown;
  bytes: number;
}[] = [];
let upstream: Server | undefined, api: ReturnType<typeof Fastify> | undefined;
const fixtureSku = (feature: "hair" | "clothing", amount = 4) => ({
  run_task_url: YOUCAM_ORIGIN + GENERATION_TASK_PATHS[feature],
  description: "LOOPBACK FIXTURE: not a real price",
  amount,
  unit: "fixture credits",
  proc_unit: "image",
});
async function fixture() {
  calls.length = 0;
  let files = 0,
    tasks = 0,
    amount = 4;
  const statusCount = new Map<string, number>();
  const picture = await readFile("apps/web/public/images/portrait-neutral.jpg");
  upstream = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://fixture").pathname;
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const bytes = Buffer.concat(chunks);
    let body: unknown;
    try {
      body = JSON.parse(bytes.toString());
    } catch {
      body = undefined;
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
      res.end();
      return;
    }
    if (path === "/fixture-output/image.jpg") {
      res.setHeader("Content-Type", "image/jpeg");
      res.end(picture);
      return;
    }
    if (req.headers.authorization !== `Bearer ${fixtureKey}`) {
      res.statusCode = 401;
      json({ error: "fixture authentication failed" });
      return;
    }
    if (path === "/s2s/v2.0/credit/feature-cost") {
      json({
        result: {
          skus: [fixtureSku("hair", amount), fixtureSku("clothing", amount)],
        },
      });
      return;
    }
    if (path === "/s2s/v2.0/file") {
      files++;
      json({
        data: {
          files: [
            {
              file_id: `fixture-file-${files}`,
              requests: [
                {
                  method: "PUT",
                  url: `https://yce-us.s3-accelerate.amazonaws.com/fixture-upload/${files}`,
                  headers: {
                    "Content-Type": "image/jpeg",
                    "Content-Length": String(picture.length),
                  },
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
          templates: [{ id: "fixture-bob", title: "Contract fixture style" }],
        },
      });
      return;
    }
    if (
      Object.values(GENERATION_TASK_PATHS).includes(
        path as typeof GENERATION_TASK_PATHS.hair,
      ) &&
      req.method === "POST"
    ) {
      tasks++;
      json({ data: { task_id: `fixture-task-${tasks}` } });
      return;
    }
    if (
      req.method === "GET" &&
      path.includes("/task/") &&
      path.includes("fixture-task-")
    ) {
      const n = (statusCount.get(path) ?? 0) + 1;
      statusCount.set(path, n);
      json({
        data:
          n < 2
            ? { task_status: "running" }
            : {
                task_status: "success",
                results: {
                  url: "https://yce-us.s3-accelerate.amazonaws.com/fixture-output/image.jpg",
                },
              },
      });
      return;
    }
    res.statusCode = 404;
    json({ error: "Unknown fixture path" });
  });
  await new Promise<void>((resolve) =>
    upstream!.listen(0, "127.0.0.1", resolve),
  );
  const address = upstream.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture did not start");
  const local = `http://127.0.0.1:${address.port}`;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== YOUCAM_ORIGIN) safeYouCamMediaUrl(url.href);
    // Test-only network rewrite; no browser route can supply this transport.
    return fetch(local + url.pathname + url.search, init);
  };
  const provider = new YouCamGenerationProvider(fixtureKey, transport);
  return {
    provider,
    picture,
    changePrice: () => {
      amount = 40;
    },
    created: () => tasks,
  };
}
async function setup(
  provider: GenerationProvider,
  specs: GenerationSpec[] = [hair, clothing],
  maximum = 100,
) {
  let now = Date.now(),
    spent = 0;
  api = Fastify({ logger: false });
  const headers = {
    origin: "http://localhost:5173",
    "x-csrf-token": "fixture-csrf",
    "x-fixture-session": "session-a",
  };
  api.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (
      ["POST", "DELETE"].includes(req.method) &&
      (req.headers.origin !== headers.origin ||
        req.headers["x-csrf-token"] !== "fixture-csrf")
    )
      reply.code(403).send({ error: "fixture CSRF boundary" });
  });
  const plans = specs.map((spec) =>
    GenerationPlan.parse({
      spec,
      credits: 4,
      skuHash: pricingHash(fixtureSku(spec.feature)),
      reviewedAt: new Date(now).toISOString(),
    }),
  );
  registerGenerationRoutes(api, {
    provider,
    plans,
    paidEnabled: true,
    dailyCredits: maximum,
    now: () => now,
    getSessionId: (req) =>
      typeof req.headers["x-fixture-session"] === "string"
        ? req.headers["x-fixture-session"]
        : undefined,
    ledger: {
      used: () => spent,
      reserve: (credits, max) => {
        if (spent + credits > max) throw new Error("budget");
        spent += credits;
      },
    },
  });
  await api.ready();
  const quote = async (spec: GenerationSpec) =>
    api!.inject({
      method: "POST",
      url: "/api/generation/quotes",
      headers,
      payload: { spec },
    });
  return {
    headers,
    quote,
    advance: (ms: number) => {
      now += ms;
    },
    spent: () => spent,
  };
}
function payload(quoteId: string, spec: GenerationSpec, picture: Buffer) {
  const image = {
    base64: picture.toString("base64"),
    contentType: "image/jpeg",
  };
  return {
    quoteId,
    spec,
    source: image,
    ...(spec.feature === "hair" && spec.templateId ? {} : { reference: image }),
    maxCredits: 4,
    consent: {
      uploadImages: true,
      rightsConfirmed: true,
      externalProcessing: true,
      providerRetentionAcknowledged: true,
    },
  };
}
async function waitRunning(id: string, headers: Record<string, string>) {
  for (let i = 0; i < 100; i++) {
    const res = await api!.inject({
      method: "GET",
      url: `/api/generation/tasks/${id}`,
      headers,
    });
    if (res.json().status !== "uploading") return res;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error("Fixture generation did not begin");
}
afterEach(async () => {
  await api?.close();
  api = undefined;
  if (upstream) {
    upstream.closeAllConnections();
    await new Promise<void>((r) => upstream!.close(() => r()));
    upstream = undefined;
  }
});
describe("generation provider network contracts — loopback fixtures, NOT live verification", () => {
  it("runs real HTTP hair register/upload/create/poll/image flow, idempotently and without forwarding credentials", async () => {
    const f = await fixture(),
      s = await setup(f.provider);
    const quote = await s.quote(hair);
    expect(quote.statusCode).toBe(200);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
    const body = payload(quote.json().quoteId, hair, f.picture),
      started = await api!.inject({
        method: "POST",
        url: "/api/generation/tasks",
        headers: s.headers,
        payload: body,
      });
    expect(started.statusCode).toBe(202);
    const id = started.json().taskId;
    await waitRunning(id, s.headers);
    s.advance(10001);
    expect(
      (
        await api!.inject({
          method: "GET",
          url: `/api/generation/tasks/${id}`,
          headers: s.headers,
        })
      ).json().status,
    ).toBe("running");
    s.advance(10001);
    const done = await api!.inject({
      method: "GET",
      url: `/api/generation/tasks/${id}`,
      headers: s.headers,
    });
    expect(done.json().result.kind).toBe("ai-generated-image");
    expect(JSON.stringify(done.json())).not.toContain("amazonaws");
    const result = await api!.inject({
      method: "GET",
      url: `/api/generation/tasks/${id}/image`,
      headers: s.headers,
    });
    expect(result.statusCode).toBe(200);
    expect(result.headers["content-type"]).toContain("image/jpeg");
    expect(result.rawPayload).toEqual(f.picture);
    const again = await api!.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers: s.headers,
      payload: body,
    });
    expect(again.json().taskId).toBe(id);
    expect(f.created()).toBe(1);
    expect(s.spent()).toBe(4);
    const request = calls.find(
      (c) => c.path === GENERATION_TASK_PATHS.hair && c.method === "POST",
    );
    expect(request?.body).toEqual({
      src_file_id: "fixture-file-1",
      ref_file_id: "fixture-file-2",
      hair_color: "src",
    });
    expect(
      calls
        .filter((c) => c.path.startsWith("/fixture-"))
        .every((c) => c.authorization === undefined),
    ).toBe(true);
    expect(
      calls
        .filter((c) => c.path.startsWith("/s2s/"))
        .every((c) => c.authorization === `Bearer ${fixtureKey}`),
    ).toBe(true);
  });
  it("uses cloth-v4 exact current garment tokens and rejects a changed spec before spend", async () => {
    const f = await fixture(),
      s = await setup(f.provider);
    const q = (await s.quote(clothing)).json();
    const rejected = await api!.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers: s.headers,
      payload: {
        ...payload(q.quoteId, clothing, f.picture),
        spec: { ...clothing, garmentCategory: "full_body" },
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(s.spent()).toBe(0);
    const created = await api!.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers: s.headers,
      payload: payload(q.quoteId, clothing, f.picture),
    });
    await waitRunning(created.json().taskId, s.headers);
    expect(
      calls.find(
        (c) => c.path === GENERATION_TASK_PATHS.clothing && c.method === "POST",
      )?.body,
    ).toEqual({
      src_file_id: "fixture-file-1",
      ref_file_id: "fixture-file-2",
      garment_category: "outer",
      change_shoes: false,
      filter_multi_person: "strict",
    });
  });
  it("supports actual hair template-list and template input shape without an extra reference upload", async () => {
    const f = await fixture(),
      spec: GenerationSpec = {
        feature: "hair",
        hairColor: "ref",
        templateId: "fixture-bob",
      },
      s = await setup(f.provider, [spec]);
    const styles = await api!.inject({
      method: "GET",
      url: "/api/generation/templates/hair",
      headers: s.headers,
    });
    expect(styles.json().templates).toEqual([
      { id: "fixture-bob", title: "Contract fixture style" },
    ]);
    const q = (await s.quote(spec)).json(),
      created = await api!.inject({
        method: "POST",
        url: "/api/generation/tasks",
        headers: s.headers,
        payload: payload(q.quoteId, spec, f.picture),
      });
    await waitRunning(created.json().taskId, s.headers);
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(
      calls.find(
        (c) => c.path === GENERATION_TASK_PATHS.hair && c.method === "POST",
      )?.body,
    ).toEqual({
      src_file_id: "fixture-file-1",
      hair_color: "ref",
      template_id: "fixture-bob",
    });
  });
  it("fails closed on missing consent, insufficient authorization, bad bytes and changed current price", async () => {
    const f = await fixture(),
      s = await setup(f.provider);
    const q = (await s.quote(hair)).json(),
      good = payload(q.quoteId, hair, f.picture);
    for (const body of [
      { ...good, consent: { ...good.consent, uploadImages: false } },
      { ...good, maxCredits: 3 },
      {
        ...good,
        source: { base64: "not-an-image", contentType: "image/jpeg" },
      },
    ])
      expect(
        (
          await api!.inject({
            method: "POST",
            url: "/api/generation/tasks",
            headers: s.headers,
            payload: body,
          })
        ).statusCode,
      ).toBeGreaterThanOrEqual(400);
    expect(s.spent()).toBe(0);
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    f.changePrice();
    expect((await s.quote(hair)).statusCode).toBe(503);
  });
  it("enforces owner isolation, task expiry, local deletion and the one-use quote after deletion", async () => {
    const f = await fixture(),
      s = await setup(f.provider);
    const q = (await s.quote(hair)).json(),
      body = payload(q.quoteId, hair, f.picture),
      started = await api!.inject({
        method: "POST",
        url: "/api/generation/tasks",
        headers: s.headers,
        payload: body,
      }),
      id = started.json().taskId;
    const other = { ...s.headers, "x-fixture-session": "session-b" };
    expect(
      (
        await api!.inject({
          method: "GET",
          url: `/api/generation/tasks/${id}`,
          headers: other,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await api!.inject({
          method: "GET",
          url: "/api/generation/tasks",
          headers: other,
        })
      ).json().tasks,
    ).toEqual([]);
    expect(
      (
        await api!.inject({
          method: "DELETE",
          url: `/api/generation/tasks/${id}`,
          headers: other,
        })
      ).statusCode,
    ).toBe(404);
    const deletion = await api!.inject({
      method: "DELETE",
      url: `/api/generation/tasks/${id}`,
      headers: s.headers,
    });
    expect(deletion.json()).toMatchObject({
      deletedLocal: true,
      upstreamDeletionSupported: false,
    });
    expect(deletion.json().notice).toContain("30 days");
    expect(
      (
        await api!.inject({
          method: "POST",
          url: "/api/generation/tasks",
          headers: s.headers,
          payload: body,
        })
      ).statusCode,
    ).toBe(410);
    const q2 = (await s.quote(hair)).json(),
      second = await api!.inject({
        method: "POST",
        url: "/api/generation/tasks",
        headers: s.headers,
        payload: payload(q2.quoteId, hair, f.picture),
      });
    s.advance(15 * 60000 + 1);
    expect(
      (
        await api!.inject({
          method: "GET",
          url: `/api/generation/tasks/${second.json().taskId}`,
          headers: s.headers,
        })
      ).statusCode,
    ).toBe(404);
  });
  it("reserves the shared daily ceiling before an upload and does not invent a refund", async () => {
    const f = await fixture(),
      s = await setup(f.provider, [hair], 4);
    const q1 = (await s.quote(hair)).json(),
      q2 = (await s.quote(hair)).json();
    const first = await api!.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers: s.headers,
      payload: payload(q1.quoteId, hair, f.picture),
    });
    expect(first.statusCode).toBe(202);
    const second = await api!.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers: s.headers,
      payload: payload(q2.quoteId, hair, f.picture),
    });
    expect(second.statusCode).toBe(429);
    expect(s.spent()).toBe(4);
    const stopped = await api!.inject({
      method: "POST",
      url: `/api/generation/tasks/${first.json().taskId}/cancel`,
      headers: s.headers,
      payload: {},
    });
    expect(stopped.json().status).toBe("cancelled");
    expect(stopped.json().upstreamCancellationSupported).toBe(false);
    expect(s.spent()).toBe(4);
  });
  it("validates allowed output/upload destinations and never treats malformed provider status as a result", async () => {
    for (const url of [
      "http://127.0.0.1/private",
      "https://attacker.s3-accelerate.amazonaws.com/x",
      "https://yce-us.s3-accelerate.amazonaws.com.evil.example/x",
      "https://yce-us.s3-accelerate.amazonaws.com:444/x",
      "https://user:pass@yce-us.s3-accelerate.amazonaws.com/x",
    ])
      expect(() => safeYouCamMediaUrl(url)).toThrow();
    expect(
      safeYouCamMediaUrl(
        "https://yce-us.s3-accelerate.amazonaws.com/result?signature=fixture",
      ).hostname,
    ).toBe("yce-us.s3-accelerate.amazonaws.com");
    const provider = new YouCamGenerationProvider(fixtureKey, async () =>
      Response.json({
        data: {
          task_status: "success",
          results: { url: "https://evil.example/image.png" },
        },
      }),
    );
    await expect(provider.status("hair", "fixture")).rejects.toThrow();
    const missing = new YouCamGenerationProvider(fixtureKey, async () =>
      Response.json({ data: { task_status: "success", results: {} } }),
    );
    await expect(missing.status("hair", "fixture")).rejects.toThrow(
      "without a generated image",
    );
  });
  it("bounds streamed response bytes and validates reference alternatives", async () => {
    await expect(
      readBounded(new Response(new Uint8Array(200)), 100),
    ).rejects.toThrow("size limit");
    const image = { base64: "a".repeat(120), contentType: "image/jpeg" };
    expect(
      GenerationTaskRequest.safeParse({
        quoteId: crypto.randomUUID(),
        spec: hair,
        source: image,
        maxCredits: 4,
        consent: {
          uploadImages: true,
          rightsConfirmed: true,
          externalProcessing: true,
          providerRetentionAcknowledged: true,
        },
      }).success,
    ).toBe(false);
    expect(
      GenerationTaskRequest.safeParse({
        quoteId: crypto.randomUUID(),
        spec: { feature: "hair", hairColor: "src", templateId: "fixture" },
        source: image,
        reference: image,
        maxCredits: 4,
        consent: {
          uploadImages: true,
          rightsConfirmed: true,
          externalProcessing: true,
          providerRetentionAcknowledged: true,
        },
      }).success,
    ).toBe(false);
  });
  it("is explicitly unavailable when provider/paid plan is missing and never reports a live verified task", async () => {
    api = Fastify({ logger: false });
    registerGenerationRoutes(api, {
      getSessionId: () => undefined,
      paidEnabled: false,
      dailyCredits: 0,
      plans: [],
    });
    const capability = (
      await api.inject({ method: "GET", url: "/api/generation/capabilities" })
    ).json();
    expect(capability.liveVerified).toBe(false);
    expect(capability.features.hair.readyForQuote).toBe(false);
    expect(capability.retention.providerDays).toBe(30);
    expect(
      (
        await api.inject({
          method: "POST",
          url: "/api/generation/quotes",
          payload: { spec: hair },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("aborts and zeroes input buffers when local waiting is cancelled during upload", async () => {
    let captured: GenerationInput | undefined,
      aborted = false;
    const provider: GenerationProvider = {
      pricing: async () => [fixtureSku("hair")],
      create: async (input, signal) => {
        captured = input;
        return await new Promise<string>((_, reject) =>
          signal!.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("fixture aborted"));
            },
            { once: true },
          ),
        );
      },
      status: async () => ({ status: "running" }),
      image: async () => {
        throw new Error("not requested");
      },
    };
    const s = await setup(provider, [hair]),
      picture = await readFile("apps/web/public/images/portrait-neutral.jpg"),
      q = (await s.quote(hair)).json();
    const started = await api!.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers: s.headers,
      payload: payload(q.quoteId, hair, picture),
    });
    await api!.inject({
      method: "POST",
      url: `/api/generation/tasks/${started.json().taskId}/cancel`,
      headers: s.headers,
      payload: {},
    });
    expect(aborted).toBe(true);
    expect(captured!.source.bytes.every((v) => v === 0)).toBe(true);
    expect(captured!.reference!.bytes.every((v) => v === 0)).toBe(true);
  });
  it("uses the actual root server session and CSRF boundary when the generation plugin is mounted", async () => {
    const f = await fixture();
    let used = 0;
    const reviewedAt = new Date().toISOString();
    const ledger = {
      used: () => used,
      reserve: (credits: number, maximum: number) => {
        if (used + credits > maximum) throw new Error("fixture ceiling");
        used += credits;
      },
    };
    api = createApi({
      ledger,
      dailyCredits: 100,
      generation: {
        provider: f.provider,
        paidEnabled: true,
        dailyCredits: 100,
        plans: [
          GenerationPlan.parse({
            spec: hair,
            credits: 4,
            skuHash: pricingHash(fixtureSku("hair")),
            reviewedAt,
          }),
        ],
      },
    });
    const opened = await api.inject({ method: "GET", url: "/api/session" });
    const cookie = opened.headers["set-cookie"]!.toString().split(";")[0];
    const headers = {
      origin: "http://localhost:5173",
      cookie,
      "x-csrf-token": opened.json().csrfToken,
    };
    expect(
      (
        await api.inject({
          method: "POST",
          url: "/api/generation/quotes",
          headers: { origin: headers.origin, cookie },
          payload: { spec: hair },
        })
      ).statusCode,
    ).toBe(403);
    const quote = await api.inject({
      method: "POST",
      url: "/api/generation/quotes",
      headers,
      payload: { spec: hair },
    });
    expect(quote.statusCode).toBe(200);
    const start = await api.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers,
      payload: payload(quote.json().quoteId, hair, f.picture),
    });
    expect(start.statusCode).toBe(202);
    expect(used).toBe(4);
    const stranger = await api.inject({ method: "GET", url: "/api/session" });
    const strangerCookie =
      stranger.headers["set-cookie"]!.toString().split(";")[0];
    expect(
      (
        await api.inject({
          method: "GET",
          url: `/api/generation/tasks/${start.json().taskId}`,
          headers: { cookie: strangerCookie },
        })
      ).statusCode,
    ).toBe(404);
    const capability = (
      await api.inject({ method: "GET", url: "/api/capabilities" })
    ).json();
    expect(capability.hairGeneration.readyForQuote).toBe(true);
    expect(capability.hairGeneration.liveVerified).toBe(false);
  });
});
