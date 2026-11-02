import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createApi } from "../apps/api/src/server";
import { ApprovedPlan } from "../apps/api/src/contracts";
import { pricingHash } from "../apps/api/src/provider";
import {
  AnthropicMessagesProvider,
  type ReasoningProvider,
} from "../apps/api/src/reasoning";
import {
  type GenerationInput,
  type GenerationProvider,
  YouCamGenerationProvider,
} from "../apps/api/src/generationProvider";
import { GenerationPlan } from "../apps/api/src/generationContracts";
import {
  safeYouCamMediaUrl,
  YouCamTransport,
} from "../apps/api/src/youcamTransport";
import {
  hashReasoningPayload,
  type ReasoningPayload,
} from "../packages/agent-runtime/src/reasoning-protocol";

// Independent adversarial review. All provider responses and bytes below are
// scripted fixtures. No network request, environment inspection or live call.
const origin = "http://localhost:5173";
const epoch = Date.parse("2026-11-02T00:00:00Z");
const sku = { description: "SECURITY REVIEW FIXTURE ONLY", amount: 4 };
const spec = { feature: "hair", hairColor: "src" } as const;
const png = Buffer.alloc(120, 7);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
const image = { base64: png.toString("base64"), contentType: "image/png" };
const outputUrl =
  "https://yce-us.s3-accelerate.amazonaws.com/security-review-fixture?signature=private-fixture";
const apps: ReturnType<typeof createApi>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(
  options: {
    credits?: number;
    generation?: Partial<GenerationProvider>;
    reasoning?: Partial<ReasoningProvider>;
    reasoningUsd?: number;
  } = {},
) {
  let now = epoch;
  let creditsUsed = 0;
  let microUsdUsed = 0;
  let uploads = 0;
  let generations = 0;
  let completions = 0;
  const generation: GenerationProvider = {
    pricing: async () => [sku],
    create: async () => {
      generations++;
      return "fixture-upstream-generation";
    },
    status: async () => ({ status: "success", url: outputUrl }),
    image: async () => ({ bytes: png.slice(), contentType: "image/png" }),
    ...options.generation,
  };
  const reasoning: ReasoningProvider = {
    name: "SCRIPTED SECURITY FIXTURE — NOT LIVE",
    model: "security-fixture-model",
    complete: async () => {
      completions++;
      return {
        guidance: "Scripted security fixture guidance, not model evidence.",
        calls: [],
        inputTokens: 100,
        outputTokens: 40,
      };
    },
    ...options.reasoning,
  };
  const app = createApi({
    allowedOrigins: [origin],
    now: () => now,
    dailyCredits: options.credits ?? 100,
    plan: ApprovedPlan.parse({
      actions: ["texture"],
      credits: 4,
      skuHash: pricingHash(sku),
      reviewedAt: new Date(epoch).toISOString(),
    }),
    provider: {
      pricing: async () => [sku],
      create: async () => {
        uploads++;
        return "fixture-upstream-skin";
      },
      status: async () => ({ task_status: "running" }),
    },
    ledger: {
      used: () => creditsUsed,
      reserve: (amount, maximum) => {
        if (creditsUsed + amount > maximum) throw new Error("fixture ceiling");
        creditsUsed += amount;
      },
    },
    generation: {
      provider: generation,
      paidEnabled: true,
      plans: [
        GenerationPlan.parse({
          spec,
          credits: 4,
          skuHash: pricingHash(sku),
          reviewedAt: new Date(epoch).toISOString(),
        }),
      ],
    },
    reasoning: {
      provider: reasoning,
      pricing: {
        model: reasoning.model,
        inputUsdPerMillion: 1,
        outputUsdPerMillion: 2,
        reviewedAt: new Date(epoch).toISOString(),
        sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
      },
      enabled: true,
      dailyUsd: options.reasoningUsd ?? 5,
      maxRequestUsd: 1,
      ledger: {
        usedMicroUsd: () => microUsdUsed,
        reserveMicroUsd: (amount, maximum) => {
          if (microUsdUsed + amount > maximum)
            throw new Error("fixture USD ceiling");
          microUsdUsed += amount;
        },
      },
    },
    merchant: {
      fetcher: async () => {
        throw new Error(
          "No merchant network calls are allowed by this fixture",
        );
      },
    },
  });
  apps.push(app);
  return {
    app,
    advance: (ms: number) => {
      now += ms;
    },
    creditsUsed: () => creditsUsed,
    microUsdUsed: () => microUsdUsed,
    uploads: () => uploads,
    generations: () => generations,
    completions: () => completions,
  };
}
async function session(app: ReturnType<typeof createApi>) {
  const response = await app.inject({ method: "GET", url: "/api/session" });
  expect(response.statusCode).toBe(200);
  expect(response.headers["set-cookie"]).toContain("HttpOnly; SameSite=Strict");
  return {
    origin,
    cookie: response.headers["set-cookie"]!.toString().split(";")[0],
    "x-csrf-token": response.json().csrfToken as string,
  };
}
type Headers = Awaited<ReturnType<typeof session>>;
async function generationQuote(app: ReturnType<typeof createApi>, h: Headers) {
  const quote = await app.inject({
    method: "POST",
    url: "/api/generation/quotes",
    headers: h,
    payload: { spec },
  });
  expect(quote.statusCode).toBe(200);
  return quote.json().quoteId as string;
}
function generationBody(quoteId: string) {
  return {
    quoteId,
    spec,
    source: image,
    reference: image,
    maxCredits: 4,
    consent: {
      uploadImages: true,
      rightsConfirmed: true,
      externalProcessing: true,
      providerRetentionAcknowledged: true,
    },
  };
}
async function generationStart(app: ReturnType<typeof createApi>, h: Headers) {
  const body = generationBody(await generationQuote(app, h));
  const response = await app.inject({
    method: "POST",
    url: "/api/generation/tasks",
    headers: h,
    payload: body,
  });
  expect(response.statusCode).toBe(202);
  return { id: response.json().taskId as string, body };
}
async function reasoningQuote(app: ReturnType<typeof createApi>, h: Headers) {
  const payload: ReasoningPayload = {
    goal: "SCRIPTED FIXTURE: make the local lip preview rose",
    context: {},
    allowedTools: ["setLipColor"],
    allowPersistence: false,
  };
  const payloadHash = await hashReasoningPayload(payload);
  const quote = await app.inject({
    method: "POST",
    url: "/api/reasoning/quotes",
    headers: h,
    payload: {
      payloadHash,
      scopes: [],
      allowedTools: payload.allowedTools,
      allowPersistence: false,
      maxSteps: 3,
      maxOutputTokens: 256,
    },
  });
  expect(quote.statusCode).toBe(200);
  return {
    quoteId: quote.json().quoteId as string,
    payload,
    consent: {
      approvedPayloadHash: payloadHash,
      scopes: [],
      textTransmission: true,
      providerRetentionAcknowledged: true,
    },
    maxUsd: quote.json().maximumUsd as number,
  };
}
async function reasoningStart(app: ReturnType<typeof createApi>, h: Headers) {
  const body = await reasoningQuote(app, h);
  const response = await app.inject({
    method: "POST",
    url: "/api/reasoning/sessions",
    headers: h,
    payload: body,
  });
  expect(response.statusCode).toBe(200);
  return { id: response.json().sessionId as string, body };
}

describe("R06 independent security review — scripted fixtures, no live providers", () => {
  it("denies missing, null and lookalike Origins and missing CSRF at the actual root mount", async () => {
    const f = fixture();
    const h = await session(f.app);
    for (const url of [
      "/api/skin/quotes",
      "/api/generation/tasks",
      "/api/reasoning/sessions",
      "/api/merchants/refresh",
    ]) {
      for (const candidate of [undefined, "null", origin + ".evil.example"]) {
        const headers: Record<string, string> = { ...h };
        if (candidate === undefined) delete headers.origin;
        else headers.origin = candidate;
        const response = await f.app.inject({
          method: "POST",
          url,
          headers,
          payload: {},
        });
        expect(response.statusCode).toBe(403);
        expect(response.headers["cache-control"]).toBe("no-store");
      }
      const response = await f.app.inject({
        method: "POST",
        url,
        headers: { origin, cookie: h.cookie },
        payload: {},
      });
      expect(response.statusCode).toBe(403);
    }
    expect(f.creditsUsed()).toBe(0);
    expect(f.microUsdUsed()).toBe(0);
  });

  it("binds CSRF to the cookie session and rejects forged cookies", async () => {
    const f = fixture();
    const a = await session(f.app);
    const b = await session(f.app);
    for (const cookie of [b.cookie, "tb_session=attacker-chosen"]) {
      const response = await f.app.inject({
        method: "POST",
        url: "/api/generation/quotes",
        headers: { ...a, cookie },
        payload: { spec },
      });
      expect(response.statusCode).toBe(403);
    }
    expect(f.creditsUsed()).toBe(0);
  });

  it("binds generation and reasoning quotes to their original session", async () => {
    const f = fixture();
    const a = await session(f.app);
    const b = await session(f.app);
    const generation = generationBody(await generationQuote(f.app, a));
    const reasoning = await reasoningQuote(f.app, a);
    const results = await Promise.all([
      f.app.inject({
        method: "POST",
        url: "/api/generation/tasks",
        headers: b,
        payload: generation,
      }),
      f.app.inject({
        method: "POST",
        url: "/api/reasoning/sessions",
        headers: b,
        payload: reasoning,
      }),
    ]);
    expect(results.map((response) => response.statusCode)).toEqual([400, 400]);
    expect(f.creditsUsed()).toBe(0);
    expect(f.microUsdUsed()).toBe(0);
  });

  it("denies another session task reads, images, cancellation and deletion", async () => {
    const f = fixture();
    const a = await session(f.app);
    const b = await session(f.app);
    const generation = await generationStart(f.app, a);
    const reasoning = await reasoningStart(f.app, a);
    const cases = [
      { method: "GET", url: `/api/generation/tasks/${generation.id}` },
      { method: "GET", url: `/api/generation/tasks/${generation.id}/image` },
      { method: "POST", url: `/api/generation/tasks/${generation.id}/cancel` },
      { method: "DELETE", url: `/api/generation/tasks/${generation.id}` },
      { method: "DELETE", url: `/api/reasoning/sessions/${reasoning.id}` },
    ] as const;
    for (const request of cases) {
      const response = await f.app.inject({ ...request, headers: b });
      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain("fixture-upstream");
    }
    const list = await f.app.inject({
      method: "GET",
      url: "/api/generation/tasks",
      headers: b,
    });
    expect(list.json().tasks).toEqual([]);
  });

  it("creates and reserves once for ten concurrent replays of one generation quote", async () => {
    const f = fixture();
    const h = await session(f.app);
    const body = generationBody(await generationQuote(f.app, h));
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        f.app.inject({
          method: "POST",
          url: "/api/generation/tasks",
          headers: h,
          payload: body,
        }),
      ),
    );
    expect(
      responses.every((response) => [200, 202].includes(response.statusCode)),
    ).toBe(true);
    expect(
      new Set(responses.map((response) => response.json().taskId)).size,
    ).toBe(1);
    expect(f.generations()).toBe(1);
    expect(f.creditsUsed()).toBe(4);
  });

  it("atomically shares the final credit reservation between skin and generation dispatch", async () => {
    const f = fixture({ credits: 4 });
    const h = await session(f.app);
    const generation = generationBody(await generationQuote(f.app, h));
    const quote = await f.app.inject({
      method: "POST",
      url: "/api/skin/quotes",
      headers: h,
      payload: { actions: ["texture"] },
    });
    expect(quote.statusCode).toBe(200);
    const skin = {
      quoteId: quote.json().quoteId,
      imageBase64: image.base64,
      contentType: image.contentType,
      actions: ["texture"],
      maxCredits: 4,
      consent: {
        uploadImage: true,
        externalProcessing: true,
        providerRetentionAcknowledged: true,
      },
    };
    const responses = await Promise.all([
      f.app.inject({
        method: "POST",
        url: "/api/skin/tasks",
        headers: h,
        payload: skin,
      }),
      f.app.inject({
        method: "POST",
        url: "/api/generation/tasks",
        headers: h,
        payload: generation,
      }),
    ]);
    expect(
      responses.filter((response) => response.statusCode === 429),
    ).toHaveLength(1);
    expect(f.uploads() + f.generations()).toBe(1);
    expect(f.creditsUsed()).toBe(4);
  });

  it("reserves a reasoning quote once under concurrent session starts", async () => {
    const f = fixture();
    const h = await session(f.app);
    const body = await reasoningQuote(f.app, h);
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        f.app.inject({
          method: "POST",
          url: "/api/reasoning/sessions",
          headers: h,
          payload: body,
        }),
      ),
    );
    expect(responses.every((response) => response.statusCode === 200)).toBe(
      true,
    );
    expect(
      new Set(responses.map((response) => response.json().sessionId)).size,
    ).toBe(1);
    expect(f.microUsdUsed()).toBe(Math.round(body.maxUsd * 1e6));
    expect(f.completions()).toBe(0);
  });

  it("rejects exact-payload and permission tampering before a reasoning reservation", async () => {
    const f = fixture();
    const h = await session(f.app);
    const body = await reasoningQuote(f.app, h);
    for (const change of [
      {
        payload: {
          ...body.payload,
          goal: body.payload.goal + " and extra context",
        },
      },
      { payload: { ...body.payload, allowPersistence: true } },
      { consent: { ...body.consent, scopes: ["history"] } },
    ]) {
      const response = await f.app.inject({
        method: "POST",
        url: "/api/reasoning/sessions",
        headers: h,
        payload: { ...body, ...change },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(f.microUsdUsed()).toBe(0);
  });

  it("cancels an in-flight reasoning turn, denies a parallel turn and discards late output", async () => {
    const entered = deferred<AbortSignal>();
    const result =
      deferred<Awaited<ReturnType<ReasoningProvider["complete"]>>>();
    let calls = 0;
    const f = fixture({
      reasoning: {
        complete: async ({ signal }) => {
          calls++;
          entered.resolve(signal);
          return result.promise;
        },
      },
    });
    const h = await session(f.app);
    const reasoning = await reasoningStart(f.app, h);
    const pending = f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${reasoning.id}/step`,
      headers: h,
      payload: { stepId: randomUUID(), feedback: [] },
    });
    const signal = await entered.promise;
    const parallel = await f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${reasoning.id}/step`,
      headers: h,
      payload: { stepId: randomUUID(), feedback: [] },
    });
    expect(parallel.statusCode).toBe(409);
    const cancelled = await f.app.inject({
      method: "DELETE",
      url: `/api/reasoning/sessions/${reasoning.id}`,
      headers: h,
    });
    expect(cancelled.json().cancelled).toBe(true);
    expect(signal.aborted).toBe(true);
    result.resolve({
      guidance: "LATE PRIVATE FIXTURE TEXT",
      calls: [],
      inputTokens: 100,
      outputTokens: 40,
    });
    const late = await pending;
    expect(late.statusCode).toBe(409);
    expect(late.body).not.toContain("LATE PRIVATE FIXTURE TEXT");
    expect(calls).toBe(1);
    expect(f.microUsdUsed()).toBe(Math.round(reasoning.body.maxUsd * 1e6));
  });

  it("zeroes source/reference immediately on local generation stop and ignores late creation", async () => {
    const entered = deferred<{
      input: GenerationInput;
      signal?: AbortSignal;
    }>();
    const result = deferred<string>();
    const f = fixture({
      generation: {
        create: async (input, signal) => {
          entered.resolve({ input, signal });
          return result.promise;
        },
      },
    });
    const h = await session(f.app);
    const generation = await generationStart(f.app, h);
    const held = await entered.promise;
    expect(held.input.source.bytes.some((byte) => byte !== 0)).toBe(true);
    const stop = await f.app.inject({
      method: "POST",
      url: `/api/generation/tasks/${generation.id}/cancel`,
      headers: h,
    });
    expect(stop.json().status).toBe("cancelled");
    expect(stop.json().upstreamCancellationSupported).toBe(false);
    expect(held.signal?.aborted).toBe(true);
    expect(held.input.source.bytes.every((byte) => byte === 0)).toBe(true);
    expect(held.input.reference!.bytes.every((byte) => byte === 0)).toBe(true);
    result.resolve("late-fixture-upstream-id");
    const view = await f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}`,
      headers: h,
    });
    expect(view.json().status).toBe("cancelled");
    expect(view.body).not.toContain("late-fixture");
    expect(f.creditsUsed()).toBe(4);
  });

  it("zeroes a late image after deletion and cannot recreate the consumed task", async () => {
    const entered = deferred<AbortSignal | undefined>();
    const result = deferred<{ bytes: Uint8Array; contentType: "image/png" }>();
    const f = fixture({
      generation: {
        image: async (_url, signal) => {
          entered.resolve(signal);
          return result.promise;
        },
      },
    });
    const h = await session(f.app);
    const generation = await generationStart(f.app, h);
    f.advance(10001);
    const status = await f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}`,
      headers: h,
    });
    expect(status.json().status).toBe("success");
    expect(status.body).not.toContain("amazonaws.com");
    const pending = f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}/image`,
      headers: h,
    });
    const signal = await entered.promise;
    const deleted = await f.app.inject({
      method: "DELETE",
      url: `/api/generation/tasks/${generation.id}`,
      headers: h,
    });
    expect(deleted.json().deletedLocal).toBe(true);
    expect(signal?.aborted).toBe(true);
    const bytes = new Uint8Array(png);
    result.resolve({ bytes, contentType: "image/png" });
    expect((await pending).statusCode).toBe(410);
    expect(bytes.every((byte) => byte === 0)).toBe(true);
    const replay = await f.app.inject({
      method: "POST",
      url: "/api/generation/tasks",
      headers: h,
      payload: generation.body,
    });
    expect(replay.statusCode).toBe(410);
    expect(f.generations()).toBe(1);
    expect(f.creditsUsed()).toBe(4);
  });

  it("zeroes cached image bytes at expiry and returns no expired result", async () => {
    const bytes = new Uint8Array(png);
    const f = fixture({
      generation: { image: async () => ({ bytes, contentType: "image/png" }) },
    });
    const h = await session(f.app);
    const generation = await generationStart(f.app, h);
    f.advance(10001);
    await f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}`,
      headers: h,
    });
    const imageResponse = await f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}/image`,
      headers: h,
    });
    expect(imageResponse.statusCode).toBe(200);
    expect(imageResponse.headers["cache-control"]).toBe("no-store");
    f.advance(15 * 60000);
    const expired = await f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}/image`,
      headers: h,
    });
    expect(expired.statusCode).toBe(404);
    expect(bytes.every((byte) => byte === 0)).toBe(true);
  });

  it("refuses provider result SSRF destinations before image fetch", async () => {
    let imageFetches = 0;
    const f = fixture({
      generation: {
        status: async () => ({
          status: "success",
          url: "http://169.254.169.254/latest/meta-data/",
        }),
        image: async () => {
          imageFetches++;
          return { bytes: png.slice(), contentType: "image/png" };
        },
      },
    });
    const h = await session(f.app);
    const generation = await generationStart(f.app, h);
    f.advance(10001);
    const status = await f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}`,
      headers: h,
    });
    expect(status.json().status).toBe("running");
    expect(status.body).not.toContain("169.254");
    const response = await f.app.inject({
      method: "GET",
      url: `/api/generation/tasks/${generation.id}/image?url=https://attacker.example`,
      headers: h,
    });
    expect(response.statusCode).toBe(409);
    expect(imageFetches).toBe(0);
  });

  it("rejects media URL confusion and cross-host credential forwarding", async () => {
    for (const url of [
      "https://127.0.0.1/image",
      "https://[::1]/image",
      "https://yce-us.s3-accelerate.amazonaws.com.evil.example/image",
      "https://evil-yce-us.s3-accelerate.amazonaws.com/image",
      "https://yce-us.s3-accelerate.amazonaws.com@evil.example/image",
      "https://attacker:secret@yce-us.s3-accelerate.amazonaws.com/image",
      "https://yce-us.s3-accelerate.amazonaws.com:8443/image",
      "http://yce-us.s3-accelerate.amazonaws.com/image",
      "https://unrelated.s3.amazonaws.com/image",
    ])
      expect(() => safeYouCamMediaUrl(url)).toThrow();
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const transport = new YouCamTransport(
      "fixture-secret-not-a-credential",
      async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return new Response(png, { headers: { "Content-Type": "image/png" } });
      },
    );
    await transport.image(outputUrl);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.redirect).toBe("manual");
    expect(calls[0].init.headers).toBeUndefined();
    await expect(
      transport.json("https://attacker.example/s2s/private"),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("redacts arbitrary upstream generation error text through the real adapter", async () => {
    const adapter = new YouCamGenerationProvider(
      "fixture-secret-not-a-credential",
      async () =>
        Response.json({
          data: {
            task_status: "error",
            error_message:
              "PRIVATE PORTRAIT TEXT https://signed.example/?token=fixture-secret-not-a-credential",
          },
        }),
    );
    const result = await adapter.status("hair", "fixture-upstream-id");
    expect(result.status).toBe("error");
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|signed\.example|fixture-secret/,
    );
  });

  it("redacts provider error bodies and rejects credential reflection in native reasoning", async () => {
    const key = "fixture-secret-not-a-credential";
    const input = {
      system: "SCRIPTED FIXTURE",
      messages: [],
      tools: [],
      maxOutputTokens: 256,
      signal: new AbortController().signal,
    };
    const upstreamError = new AnthropicMessagesProvider({
      apiKey: key,
      model: "fixture-model",
      fetchImpl: async () => new Response(`PRIVATE ${key}`, { status: 403 }),
    });
    await expect(upstreamError.complete(input)).rejects.toThrow(
      "The configured reasoning credential was rejected.",
    );
    const reflection = new AnthropicMessagesProvider({
      apiKey: key,
      model: "fixture-model",
      fetchImpl: async (_url, init) => {
        expect(init?.redirect).toBe("manual");
        return Response.json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: key }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });
      },
    });
    await expect(reflection.complete(input)).rejects.toThrow(
      "protected configuration",
    );
  });

  it("documents that a valid anonymous local session has paid capability when the operator enables it", async () => {
    // This is the demonstrated reason the local API must not be published as-is.
    // Origin/CSRF prove browser capability; they do not prove an operator identity.
    const f = fixture();
    const anonymous = await session(f.app);
    const reasoning = await reasoningStart(f.app, anonymous);
    const response = await f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${reasoning.id}/step`,
      headers: anonymous,
      payload: { stepId: randomUUID(), feedback: [] },
    });
    expect(response.statusCode).toBe(200);
    expect(f.completions()).toBe(1);
    expect(f.microUsdUsed()).toBeGreaterThan(0);
  });
});
