import { afterEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import { createServer } from "node:http";
import { createApi } from "../apps/api/src/server";
import {
  AnthropicMessagesProvider,
  registerReasoningRoutes,
  ReasoningProviderError,
  type ReasoningProvider,
  type ReasoningMessage,
} from "../apps/api/src/reasoning";
import {
  hashReasoningPayload,
  remoteToolSpecifications,
  type ReasoningPayload,
} from "../packages/agent-runtime/src/reasoning-protocol";

const fixtureKey = "fixture-not-a-real-provider-credential";
const pricing = {
  model: "fixture-model",
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 2,
  reviewedAt: new Date().toISOString(),
  sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
};
const apps: ReturnType<typeof Fastify>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function fixture(
  provider: ReasoningProvider,
  options: {
    dailyUsd?: number;
    maxRequestUsd?: number;
    enabled?: boolean;
  } = {},
) {
  const app = Fastify();
  apps.push(app);
  let used = 0;
  registerReasoningRoutes(app, {
    sessionId: (req) =>
      typeof req.headers["x-test-owner"] === "string"
        ? req.headers["x-test-owner"]
        : undefined,
    provider,
    pricing,
    enabled: options.enabled ?? true,
    dailyUsd: options.dailyUsd ?? 5,
    maxRequestUsd: options.maxRequestUsd ?? 1,
    ledger: {
      usedMicroUsd: () => used,
      reserveMicroUsd: (amount, maximum) => {
        if (used + amount > maximum) throw new Error("ceiling");
        used += amount;
      },
    },
  });
  return { app, used: () => used };
}
const headers = { "x-test-owner": "fixture-session" };
function provider(
  calls: { name: string; args: Record<string, unknown> }[] = [],
): ReasoningProvider {
  let index = 0;
  return {
    name: "Fixture only",
    model: pricing.model,
    complete: async () => ({
      guidance: "Fixture guidance, not a live model result.",
      calls:
        index < calls.length
          ? ([
              {
                id: "tool-" + index,
                name: calls[index].name,
                args: calls[index++].args,
              },
            ] as never)
          : [],
      inputTokens: 100,
      outputTokens: 40,
    }),
  };
}
async function authorized(
  app: ReturnType<typeof Fastify>,
  payload: ReasoningPayload = {
    goal: "Make my lip preview rose",
    context: {},
    allowedTools: ["setLipColor"],
    allowPersistence: false,
  },
) {
  const payloadHash = await hashReasoningPayload(payload);
  const quoteResponse = await app.inject({
    method: "POST",
    url: "/api/reasoning/quotes",
    headers,
    payload: {
      payloadHash,
      scopes: Object.keys(payload.context),
      allowedTools: payload.allowedTools,
      allowPersistence: payload.allowPersistence,
      maxSteps: 3,
      maxOutputTokens: 256,
    },
  });
  expect(quoteResponse.statusCode).toBe(200);
  const quote = quoteResponse.json();
  const start = await app.inject({
    method: "POST",
    url: "/api/reasoning/sessions",
    headers,
    payload: {
      quoteId: quote.quoteId,
      payload,
      consent: {
        approvedPayloadHash: payloadHash,
        scopes: Object.keys(payload.context),
        textTransmission: true,
        providerRetentionAcknowledged: true,
      },
      maxUsd: quote.maximumUsd,
    },
  });
  expect(start.statusCode).toBe(200);
  return { quote, start, payload, payloadHash, id: start.json().sessionId };
}

describe("reasoning security and bounded tool planning — contract fixtures, not live Claude proof", () => {
  it("inherits the actual API Origin/session/CSRF protection when mounted into createApi", async () => {
    let used = 0;
    const app = createApi({
      reasoning: {
        provider: provider(),
        pricing,
        enabled: true,
        dailyUsd: 5,
        maxRequestUsd: 1,
        ledger: {
          usedMicroUsd: () => used,
          reserveMicroUsd: (value, maximum) => {
            if (used + value > maximum) throw new Error("ceiling");
            used += value;
          },
        },
      },
    });
    apps.push(app);
    const payload = {
      payloadHash: "a".repeat(64),
      scopes: [],
      allowedTools: ["setLipColor"],
      allowPersistence: false,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reasoning/quotes",
          payload,
        })
      ).statusCode,
    ).toBe(403);
    const session = await app.inject("/api/session");
    const actualHeaders = {
      origin: "http://localhost:5173",
      cookie: session.headers["set-cookie"]!.toString().split(";")[0],
      "x-csrf-token": session.json().csrfToken,
    };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reasoning/quotes",
          headers: { ...actualHeaders, origin: "https://hostile.example" },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reasoning/quotes",
          headers: { ...actualHeaders, "x-csrf-token": "wrong" },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reasoning/quotes",
          headers: actualHeaders,
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(used).toBe(0);
  });
  it("reports configuration unavailable without a key/model and never sends a model request", async () => {
    const app = Fastify();
    apps.push(app);
    registerReasoningRoutes(app, { sessionId: () => undefined });
    const cap = await app.inject("/api/reasoning/capabilities");
    expect(cap.json().ready).toBe(false);
    expect(cap.json().liveVerified).toBe(false);
    expect(cap.json().imagesAccepted).toBe(false);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/reasoning/quotes",
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
  });
  it("binds a reviewed payload to one exact owner and reserves the full ceiling once", async () => {
    const f = fixture(provider()),
      auth = await authorized(f.app);
    const reserved = f.used();
    expect(reserved).toBeGreaterThan(0);
    const wrong = await f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${auth.id}/step`,
      headers: { "x-test-owner": "other-session" },
      payload: { stepId: crypto.randomUUID(), feedback: [] },
    });
    expect(wrong.statusCode).toBe(404);
    const changed = await f.app.inject({
      method: "POST",
      url: "/api/reasoning/sessions",
      headers,
      payload: {
        quoteId: auth.quote.quoteId,
        payload: { ...auth.payload, goal: "A changed request" },
        consent: {
          approvedPayloadHash: auth.payloadHash,
          scopes: [],
          textTransmission: true,
          providerRetentionAcknowledged: true,
        },
        maxUsd: 1,
      },
    });
    expect(changed.statusCode).toBe(400);
    const repeated = await f.app.inject({
      method: "POST",
      url: "/api/reasoning/sessions",
      headers,
      payload: {
        quoteId: auth.quote.quoteId,
        payload: auth.payload,
        consent: {
          approvedPayloadHash: auth.payloadHash,
          scopes: [],
          textTransmission: true,
          providerRetentionAcknowledged: true,
        },
        maxUsd: 1,
      },
    });
    expect(repeated.json().sessionId).toBe(auth.id);
    expect(f.used()).toBe(reserved);
  });
  it("rejects tools beyond context/persistence permissions and rejects image payloads", async () => {
    const f = fixture(provider());
    const quote = await f.app.inject({
      method: "POST",
      url: "/api/reasoning/quotes",
      headers,
      payload: {
        payloadHash: "a".repeat(64),
        scopes: [],
        allowedTools: ["saveLook"],
        allowPersistence: false,
      },
    });
    expect(quote.statusCode).toBe(400);
    const image = await f.app.inject({
      method: "POST",
      url: "/api/reasoning/sessions",
      headers,
      payload: {
        quoteId: crypto.randomUUID(),
        payload: {
          goal: "look",
          context: { imageBase64: "private image" },
          allowedTools: ["setLipColor"],
          allowPersistence: false,
        },
        consent: {
          approvedPayloadHash: "a".repeat(64),
          scopes: [],
          textTransmission: true,
          providerRetentionAcknowledged: true,
        },
        maxUsd: 1,
      },
    });
    expect(image.statusCode).toBe(400);
    expect(f.used()).toBe(0);
  });
  it("requires exact tool feedback and makes duplicate steps idempotent", async () => {
    let calls = 0;
    const fake = provider([
      { name: "setLipColor", args: { color: "#B35B6B" } },
    ]);
    const f = fixture({
        ...fake,
        complete: async (input) => {
          calls++;
          return fake.complete(input);
        },
      }),
      auth = await authorized(f.app);
    const stepId = crypto.randomUUID(),
      first = await f.app.inject({
        method: "POST",
        url: `/api/reasoning/sessions/${auth.id}/step`,
        headers,
        payload: { stepId, feedback: [] },
      });
    expect(first.json().calls[0].name).toBe("setLipColor");
    const retry = await f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${auth.id}/step`,
      headers,
      payload: { stepId, feedback: [] },
    });
    expect(retry.json()).toEqual(first.json());
    expect(calls).toBe(1);
    const bad = await f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${auth.id}/step`,
      headers,
      payload: {
        stepId: crypto.randomUUID(),
        feedback: [
          {
            callId: "invented",
            name: "setLipColor",
            status: "succeeded",
            summary: "not real",
          },
        ],
      },
    });
    expect(bad.statusCode).toBe(400);
    const done = await f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${auth.id}/step`,
      headers,
      payload: {
        stepId: crypto.randomUUID(),
        feedback: [
          {
            callId: first.json().calls[0].id,
            name: "setLipColor",
            status: "failed",
            summary: "Actual renderer callback failed",
          },
        ],
      },
    });
    expect(done.json().status).toBe("done");
    expect(calls).toBe(2);
  });
  it("blocks prompt-injected tool names and malformed colour parameters before any local action", async () => {
    for (const call of [
      { name: "forgetMemory", args: { id: "private" } },
      { name: "setLipColor", args: { color: "javascript:injected" } },
    ]) {
      const f = fixture(provider([call])),
        auth = await authorized(f.app);
      const step = await f.app.inject({
        method: "POST",
        url: `/api/reasoning/sessions/${auth.id}/step`,
        headers,
        payload: { stepId: crypto.randomUUID(), feedback: [] },
      });
      expect(step.statusCode).toBe(502);
      expect(step.json()).not.toHaveProperty("calls");
    }
  });
  it("enforces spending ceilings before dispatch and cancels in-flight work with owner isolation", async () => {
    let dispatched = 0;
    const f = fixture({
        name: "fixture",
        model: pricing.model,
        complete: async (input) => {
          dispatched++;
          return new Promise((_resolve, reject) =>
            input.signal.addEventListener(
              "abort",
              () => reject(new Error("aborted")),
              { once: true },
            ),
          );
        },
      }),
      auth = await authorized(f.app);
    const running = f.app.inject({
      method: "POST",
      url: `/api/reasoning/sessions/${auth.id}/step`,
      headers,
      payload: { stepId: crypto.randomUUID(), feedback: [] },
    });
    await new Promise<void>((resolve) => {
      const timer = setInterval(() => {
        if (dispatched) {
          clearInterval(timer);
          resolve();
        }
      }, 1);
    });
    const cancel = await f.app.inject({
      method: "DELETE",
      url: `/api/reasoning/sessions/${auth.id}`,
      headers,
    });
    expect(cancel.json().cancelled).toBe(true);
    const finished = await running;
    expect(finished.statusCode).toBe(409);
    expect(finished.json().kind).toBe("cancelled");
    expect(dispatched).toBe(1);
    expect(f.used()).toBeGreaterThan(0);
    const limited = fixture(provider(), { maxRequestUsd: 0.000001 });
    const response = await limited.app.inject({
      method: "POST",
      url: "/api/reasoning/quotes",
      headers,
      payload: {
        payloadHash: "a".repeat(64),
        scopes: [],
        allowedTools: ["setLipColor"],
        allowPersistence: false,
      },
    });
    expect(response.statusCode).toBe(402);
    expect(limited.used()).toBe(0);
  });
});

it("speaks native Anthropic HTTP tool_use/tool_result and surfaces output truncation (local HTTP fixture only)", async () => {
  const seen: Array<{
    headers: Record<string, unknown>;
    body: Record<string, unknown>;
  }> = [];
  let truncated = false;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({
        headers: req.headers,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      });
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          id: "fixture-response",
          type: "message",
          role: "assistant",
          stop_reason: truncated
            ? "max_tokens"
            : seen.length === 1
              ? "tool_use"
              : "end_turn",
          content:
            seen.length === 1
              ? [
                  {
                    type: "tool_use",
                    id: "fixture-tool",
                    name: "setLipColor",
                    input: { color: "#B35B6B" },
                  },
                ]
              : [
                  {
                    type: "text",
                    text: "The fixture tool result was received.",
                  },
                ],
          usage: { input_tokens: 123, output_tokens: 45 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  try {
    const native = new AnthropicMessagesProvider({
      apiKey: fixtureKey,
      model: "fixture-model",
      endpoint: `http://127.0.0.1:${address.port}/v1/messages`,
      allowLocalHttpForTests: true,
    });
    const base = {
      system: "Fixture system only",
      tools: remoteToolSpecifications(["setLipColor"]),
      maxOutputTokens: 256,
      signal: new AbortController().signal,
    };
    const first = await native.complete({
      ...base,
      messages: [{ role: "user", content: "Fixture user request" }],
    });
    expect(first.calls[0].args.color).toBe("#B35B6B");
    const messages: ReasoningMessage[] = [
      { role: "user", content: "Fixture request" },
      { role: "assistant", content: "", calls: first.calls },
      {
        role: "tool",
        callId: "fixture-tool",
        content: "Actual fixture callback succeeded",
        isError: false,
      },
    ];
    await native.complete({ ...base, messages });
    expect(seen[0].headers["x-api-key"]).toBe(fixtureKey);
    expect(seen[0].headers["anthropic-version"]).toBe("2026-10-21");
    expect(seen[0].body).not.toHaveProperty("apiKey");
    expect(
      (seen[1].body.messages as Array<{ content: unknown }>)[2].content,
    ).toEqual([
      {
        type: "tool_result",
        tool_use_id: "fixture-tool",
        content: "Actual fixture callback succeeded",
        is_error: false,
      },
    ]);
    truncated = true;
    await expect(native.complete({ ...base, messages })).rejects.toBeInstanceOf(
      ReasoningProviderError,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
