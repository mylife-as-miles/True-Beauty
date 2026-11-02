import { afterEach, describe, expect, it, vi } from "vitest";
import { handleReasoning } from "../apps/edge/src/routes/reasoning";
import {
  HostedError,
  type ConsumeQuoteInput,
  type HostedContext,
  type HostedBudget,
  type HostedEnv,
  type HostedStore,
  type QuoteInput,
  type RecordInput,
  type ReservationReceipt,
  type StoredQuote,
  type StoredRecord,
} from "../apps/edge/src/runtime/contracts";
import {
  hashReasoningPayload,
  type ReasoningPayload,
} from "../packages/agent-runtime/src/reasoning-protocol";

/** Shared durable-storage contract fixture, not D1/encryption or a live provider. */
class StoreFixture implements HostedStore {
  records = new Map<string, StoredRecord>();
  quotes = new Map<string, StoredQuote>();
  grants = new Set<string>();
  reserved = 0;
  failResultWrite = false;
  budgetReady = true;
  clock = Date.parse("2026-11-02T12:00:00Z");
  key(namespace: string, id: string, owner: string) {
    return `${namespace}:${owner}:${id}`;
  }
  async get<T>(namespace: string, id: string, owner: string) {
    const row = this.records.get(this.key(namespace, id, owner));
    return row && row.expiresAt > this.clock
      ? (structuredClone(row) as StoredRecord<T>)
      : null;
  }
  async insert<T>(input: RecordInput<T>) {
    const key = this.key(input.namespace, input.id, input.owner);
    if (this.records.has(key)) throw new Error("duplicate");
    const row = { ...structuredClone(input), revision: 1 };
    this.records.set(key, row);
    return structuredClone(row);
  }
  async compareAndSwap<T>(input: RecordInput<T> & { revision: number }) {
    const key = this.key(input.namespace, input.id, input.owner);
    const old = this.records.get(key);
    if (!old || old.revision !== input.revision) return null;
    if (
      this.failResultWrite &&
      (old.value as any).dispatch &&
      !(input.value as any).dispatch
    ) {
      this.failResultWrite = false;
      throw new Error(
        "simulated isolate failure before caching provider result",
      );
    }
    const row = { ...structuredClone(input), revision: input.revision + 1 };
    this.records.set(key, row);
    return structuredClone(row);
  }
  async delete(namespace: string, id: string, owner: string) {
    return this.records.delete(this.key(namespace, id, owner));
  }
  async list<T>(namespace: string, owner: string) {
    return [...this.records.values()]
      .filter((r) => r.namespace === namespace && r.owner === owner)
      .map((r) => structuredClone(r) as StoredRecord<T>);
  }
  async createQuote<T>(input: QuoteInput<T>) {
    const row = { ...structuredClone(input), consumedBy: null };
    this.quotes.set(input.id, row);
    return structuredClone(row);
  }
  async getQuote<T>(id: string, owner: string) {
    const row = this.quotes.get(id);
    return row?.owner === owner
      ? (structuredClone(row) as StoredQuote<T>)
      : null;
  }
  async consumeQuoteAndCreate<T>(input: ConsumeQuoteInput<T>) {
    const quote = this.quotes.get(input.quoteId);
    if (
      !quote ||
      quote.owner !== input.owner ||
      quote.termsHash !== input.termsHash ||
      quote.operation !== input.operation
    )
      throw new HostedError(400, "quote mismatch");
    if (!input.operator && !this.grants.has(quote.id))
      throw new HostedError(403, "This exact quote needs operator approval.");
    const key = this.key(input.record.namespace, input.record.id, input.owner);
    const reservation: ReservationReceipt = {
      id: quote.id,
      quoteId: quote.id,
      operation: quote.operation,
      credits: quote.credits,
      usdMicro: quote.usdMicro,
      createdAt: this.clock,
    };
    if (quote.consumedBy) {
      const prior = this.records.get(key);
      if (!prior) throw new HostedError(409, "Consumed session was removed.");
      return {
        record: structuredClone(prior) as StoredRecord<T>,
        reservation,
        created: false,
      };
    }
    if (this.reserved + quote.usdMicro > 5000000)
      throw new HostedError(429, "budget");
    this.reserved += quote.usdMicro;
    quote.consumedBy = input.record.id;
    const record = await this.insert({ ...input.record, owner: input.owner });
    return { record, reservation, created: true };
  }
  async assertContinuation(quoteId: string, _owner: string, operator: boolean) {
    if (!operator && !this.grants.has(quoteId))
      throw new HostedError(403, "This quote authorization was revoked.");
  }
  async quoteAccess(quoteId: string, _owner: string, operator: boolean) {
    return {
      approved: operator || this.grants.has(quoteId),
      reason: "Fixture permission",
    };
  }
  async approveQuote(id: string) {
    this.grants.add(id);
  }
  async revokeQuote(id: string) {
    this.grants.delete(id);
  }
  async initializeBudget(input: HostedBudget, _operatorId: string) {
    this.budgetReady = true;
    this.reserved = input.usdMicroUsed;
    return { ...input };
  }
  async listPendingQuotes() {
    return [...this.quotes.values()]
      .filter((quote) => !quote.consumedBy && quote.expiresAt > this.clock)
      .map(({ id, operation, credits, usdMicro, expiresAt }) => ({
        id,
        operation,
        credits,
        usdMicro,
        expiresAt,
      }));
  }
  async budget() {
    if (!this.budgetReady)
      throw new HostedError(
        503,
        "The operator must reconcile prior spending before paid dispatch is enabled.",
      );
    return {
      creditsUsed: 0,
      creditsLimit: 100,
      usdMicroUsed: this.reserved,
      usdMicroLimit: 5000000,
    };
  }
  async cleanup() {
    return;
  }
  async rateLimit() {
    return true;
  }
}
const payload: ReasoningPayload = {
  goal: "Set the lip preview to rose",
  context: {},
  allowedTools: ["setLipColor"],
  allowPersistence: false,
};
const stepId = () => crypto.randomUUID();
function fixture() {
  const store = new StoreFixture();
  const env = {
    TB_REASONING_MODEL: "fixture-edge-only-model",
    TB_REASONING_ENABLE_PAID: "true",
    TB_REASONING_MAX_REQUEST_USD: "1",
    ANTHROPIC_API_KEY: "fixture-not-a-live-credential",
    TB_REASONING_PRICING_JSON: JSON.stringify({
      model: "fixture-edge-only-model",
      inputUsdPerMillion: 1,
      outputUsdPerMillion: 2,
      reviewedAt: new Date(store.clock).toISOString(),
      sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
    }),
  } as HostedEnv;
  const context = (
    operator = true,
    owner = "fixture-owner",
  ): HostedContext => ({
    env,
    store,
    session: {
      id: owner,
      csrfToken: "upstream-validated",
      expiresAt: store.clock + 86400000,
    },
    operator,
    operatorId: operator ? "operator" : null,
    now: () => store.clock,
    waitUntil: () => undefined,
  });
  const call = async (
    path: string,
    body?: unknown,
    ctx = context(),
    method = "POST",
  ) => {
    const response = await handleReasoning(
      new Request(`https://fixture.invalid${path}`, {
        method,
        ...(body === undefined
          ? {}
          : {
              body: JSON.stringify(body),
              headers: { "Content-Type": "application/json" },
            }),
      }),
      ctx,
    );
    expect(response).not.toBeNull();
    return { status: response!.status, body: (await response!.json()) as any };
  };
  const prepare = async (ctx = context(), maxSteps = 3) => {
    const payloadHash = await hashReasoningPayload(payload);
    const q = await call(
      "/api/reasoning/quotes",
      {
        payloadHash,
        scopes: [],
        allowedTools: payload.allowedTools,
        allowPersistence: false,
        maxSteps,
        maxOutputTokens: 256,
      },
      ctx,
    );
    expect(q.status).toBe(200);
    const startBody = {
      quoteId: q.body.quoteId,
      payload,
      consent: {
        approvedPayloadHash: payloadHash,
        scopes: [],
        textTransmission: true,
        providerRetentionAcknowledged: true,
      },
      maxUsd: q.body.maximumUsd,
    };
    return { q, startBody };
  };
  const authorize = async (ctx = context(), maxSteps = 3) => {
    const { q, startBody } = await prepare(ctx, maxSteps);
    const result = await call("/api/reasoning/sessions", startBody, ctx);
    expect(result.status).toBe(200);
    return { id: result.body.sessionId as string, q, startBody };
  };
  return { store, context, call, prepare, authorize };
}
const native = (calls = true) =>
  Response.json({
    stop_reason: calls ? "tool_use" : "end_turn",
    content: calls
      ? [
          {
            type: "tool_use",
            id: "actual-provider-tool-17",
            name: "setLipColor",
            input: { color: "#b35b6b" },
          },
        ]
      : [
          {
            type: "text",
            text: "The callback reported the actual local outcome.",
          },
        ],
    usage: { input_tokens: 100, output_tokens: 40 },
  });
afterEach(() => vi.restoreAllMocks());

describe("native edge reasoning durable workflow (fixtures only)", () => {
  it("reports an uninitialized budget without breaking capabilities and blocks quotes until reconciliation", async () => {
    const f = fixture();
    f.store.budgetReady = false;
    const fetch = vi.spyOn(globalThis, "fetch");
    const capabilities = await f.call(
      "/api/reasoning/capabilities",
      undefined,
      f.context(),
      "GET",
    );
    expect(capabilities.status).toBe(200);
    expect(capabilities.body).toMatchObject({ configured: true, ready: false });
    expect(capabilities.body.unavailableReason).toContain(
      "awaiting operator initialization",
    );
    expect(capabilities.body.retention).toContain(
      "encrypted temporary task state",
    );
    expect(capabilities.body.retention).toContain("15-minute access limit");
    expect(capabilities.body.retention).toContain(
      "pruned during later activity",
    );
    const payloadHash = await hashReasoningPayload(payload);
    const quote = await f.call("/api/reasoning/quotes", {
      payloadHash,
      scopes: [],
      allowedTools: payload.allowedTools,
      allowPersistence: false,
      maxSteps: 1,
      maxOutputTokens: 256,
    });
    expect(quote.status).toBe(503);
    expect(f.store.quotes.size).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    await f.store.initializeBudget(
      {
        creditsUsed: 51,
        creditsLimit: 100,
        usdMicroUsed: 111000,
        usdMicroLimit: 5000000,
      },
      "fixture-operator",
    );
    expect(
      (
        await f.call(
          "/api/reasoning/capabilities",
          undefined,
          f.context(),
          "GET",
        )
      ).body.ready,
    ).toBe(true);
  });

  it("blocks anonymous spending until exact quote approval and reserves once across start retries", async () => {
    const f = fixture();
    const ctx = f.context(false);
    const { q, startBody } = await f.prepare(ctx);
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(
      (await f.call("/api/reasoning/sessions", startBody, ctx)).status,
    ).toBe(403);
    expect(f.store.reserved).toBe(0);
    await f.store.approveQuote(q.body.quoteId);
    const first = await f.call("/api/reasoning/sessions", startBody, ctx);
    const again = await f.call(
      "/api/reasoning/sessions",
      startBody,
      f.context(false),
    );
    expect(first.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(f.store.reserved).toBe(Math.round(q.body.maximumUsd * 1e6));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("persists native tool IDs and cached results across contexts, validates feedback, and clears completed transcript", async () => {
    const f = fixture();
    const { id } = await f.authorize();
    const requests: any[] = [];
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        requests.push(JSON.parse(init!.body as string));
        return native(requests.length === 1);
      });
    const firstBody = { stepId: stepId(), feedback: [] };
    const first = await f.call(`/api/reasoning/sessions/${id}/step`, firstBody);
    expect(first.status).toBe(200);
    expect(first.body.calls[0].id).toBe("actual-provider-tool-17");
    expect(
      (
        await f.call(
          `/api/reasoning/sessions/${id}/step`,
          firstBody,
          f.context(),
        )
      ).body,
    ).toEqual(first.body);
    const wrong = await f.call(`/api/reasoning/sessions/${id}/step`, {
      stepId: stepId(),
      feedback: [
        {
          callId: "invented-id",
          name: "setLipColor",
          status: "succeeded",
          summary: "Wrong callback ID",
        },
      ],
    });
    expect(wrong.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
    const done = await f.call(`/api/reasoning/sessions/${id}/step`, {
      stepId: stepId(),
      feedback: [
        {
          callId: "actual-provider-tool-17",
          name: "setLipColor",
          status: "failed",
          summary: "The mounted local callback failed.",
        },
      ],
    });
    expect(done.body.status).toBe("done");
    expect(requests[1].messages.at(-1).content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "actual-provider-tool-17",
      is_error: true,
    });
    expect(
      (await f.store.get<any>("reasoning", id, "fixture-owner"))!.value
        .messages,
    ).toEqual([]);
    expect(
      (await f.call(`/api/reasoning/sessions/${id}/step`, firstBody)).body,
    ).toEqual(first.body);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("claims the durable dispatch lease before concurrent contexts can call the provider", async () => {
    const f = fixture();
    const { id } = await f.authorize();
    let release!: (response: Response) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      const row = await f.store.get<any>("reasoning", id, "fixture-owner");
      expect(row!.value.dispatch).toBeDefined();
      expect(f.store.reserved).toBeGreaterThan(0);
      started();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const body = { stepId: stepId(), feedback: [] };
    const running = f.call(`/api/reasoning/sessions/${id}/step`, body);
    await startedPromise;
    expect(
      (await f.call(`/api/reasoning/sessions/${id}/step`, body, f.context()))
        .status,
    ).toBe(409);
    release(native(false));
    expect((await running).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never retries a dispatched provider call after an isolate loses the result write", async () => {
    const f = fixture();
    const { id } = await f.authorize();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => native());
    f.store.failResultWrite = true;
    const body = { stepId: stepId(), feedback: [] };
    expect(
      (await f.call(`/api/reasoning/sessions/${id}/step`, body)).status,
    ).toBe(503);
    expect(
      (await f.call(`/api/reasoning/sessions/${id}/step`, body)).status,
    ).toBe(409);
    f.store.clock += 31000;
    const recovered = await f.call(
      `/api/reasoning/sessions/${id}/step`,
      body,
      f.context(),
    );
    expect(recovered.status).toBe(409);
    expect(recovered.body.error).toContain("could not be confirmed");
    expect(
      (await f.store.get<any>("reasoning", id, "fixture-owner"))!.value
        .messages,
    ).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("respects revoked continuation grants and ownership, expiry, and cancellation", async () => {
    const f = fixture();
    const ctx = f.context(false);
    const { q, startBody } = await f.prepare(ctx);
    await f.store.approveQuote(q.body.quoteId);
    const start = await f.call("/api/reasoning/sessions", startBody, ctx);
    const id = start.body.sessionId;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => native(false));
    expect(
      (
        await f.call(
          `/api/reasoning/sessions/${id}/step`,
          { stepId: stepId(), feedback: [] },
          f.context(false, "intruder"),
        )
      ).status,
    ).toBe(404);
    await f.store.revokeQuote(q.body.quoteId);
    expect(
      (
        await f.call(
          `/api/reasoning/sessions/${id}/step`,
          { stepId: stepId(), feedback: [] },
          ctx,
        )
      ).status,
    ).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
    expect(
      (await f.call(`/api/reasoning/sessions/${id}`, undefined, ctx, "DELETE"))
        .status,
    ).toBe(200);
    expect(
      (await f.call("/api/reasoning/sessions", startBody, f.context())).status,
    ).toBe(409);
    expect(await f.store.get("reasoning", id, "fixture-owner")).toBeNull();
    const fresh = await f.authorize();
    f.store.clock += 15 * 60000 + 1;
    expect(
      (
        await f.call(`/api/reasoning/sessions/${fresh.id}/step`, {
          stepId: stepId(),
          feedback: [],
        })
      ).status,
    ).toBe(404);
  });

  it("continues against an existing reservation when the shared budget is exhausted and clears the final-turn transcript", async () => {
    const f = fixture();
    const { id } = await f.authorize(f.context(), 1);
    f.store.reserved = 5000000;
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => native());
    const response = await f.call(`/api/reasoning/sessions/${id}/step`, {
      stepId: stepId(),
      feedback: [],
    });
    expect(response.status).toBe(200);
    expect(response.body.stepsRemaining).toBe(0);
    expect(response.body.calls[0].id).toBe("actual-provider-tool-17");
    const saved = await f.store.get<any>("reasoning", id, "fixture-owner");
    expect(saved!.value.done).toBe(true);
    expect(saved!.value.messages).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("cannot resurrect or expose a tool plan after cancellation in another context", async () => {
    const f = fixture();
    const { id } = await f.authorize();
    let release!: (response: Response) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      started();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const running = f.call(`/api/reasoning/sessions/${id}/step`, {
      stepId: stepId(),
      feedback: [],
    });
    await ready;
    expect(
      (
        await f.call(
          `/api/reasoning/sessions/${id}`,
          undefined,
          f.context(),
          "DELETE",
        )
      ).status,
    ).toBe(200);
    release(native());
    const result = await running;
    expect(result.status).toBe(409);
    expect(result.body.calls).toBeUndefined();
    expect(await f.store.get("reasoning", id, "fixture-owner")).toBeNull();
  });
});
