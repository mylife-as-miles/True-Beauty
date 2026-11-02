import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEdgeD1Fixture } from "./helpers/edge-d1";
import {
  createHostedStore,
  INITIAL_HOSTED_SPEND,
  MAX_HOSTED_TTL,
} from "../apps/edge/src/runtime/store";
import {
  hashValue,
  type HostedEnv,
  type HostedStore,
  type QuoteInput,
  type ConsumeQuoteInput,
} from "../apps/edge/src/runtime/contracts";
let fixture: ReturnType<typeof createEdgeD1Fixture>,
  env: HostedEnv,
  store: HostedStore,
  time: number;
beforeEach(() => {
  fixture = createEdgeD1Fixture();
  time = Date.now();
  env = {
    DB: fixture.db,
    SITE_ORIGIN: "https://fixture.test",
    EDGE_SESSION_SECRET: "fixture-only-session-secret-0123456789",
    EDGE_DATA_SECRET: "fixture-only-data-encryption-secret-0123456789",
  };
  store = createHostedStore(env, () => time);
});
afterEach(() => fixture.close());
async function quote(
  credits = 4,
  usdMicro = 0,
  owner = "owner-a",
  operation: QuoteInput["operation"] = "skin",
) {
  const id = crypto.randomUUID(),
    input = {
      id,
      owner,
      operation,
      termsHash: await hashValue({ fixture: id }),
      credits,
      usdMicro,
      expiresAt: time + 5 * 60000,
      value: { fixture: true, privateText: "private fixture context" },
    };
  await store.createQuote(input);
  return input;
}
function consume(
  q: Awaited<ReturnType<typeof quote>>,
  operator = true,
  id: string = q.id,
): ConsumeQuoteInput<{ status: string }> {
  return {
    quoteId: q.id,
    owner: q.owner,
    operator,
    operation: q.operation,
    termsHash: q.termsHash,
    record: {
      namespace: "fixture-task",
      id,
      expiresAt: time + MAX_HOSTED_TTL,
      value: { status: "pending" },
    },
  };
}

describe("production encrypted D1 store — real SQLite schema/trigger tests, not live provider evidence", () => {
  it("requires explicit operator reconciliation and cannot seed or reset provider budgets", async () => {
    await expect(store.budget()).rejects.toMatchObject({ status: 503 });
    const q = await quote();
    await expect(store.consumeQuoteAndCreate(consume(q))).rejects.toMatchObject(
      { status: 503 },
    );
    expect(
      fixture.sql.prepare("SELECT COUNT(*) AS n FROM tb_hosted_records").get()
        ?.n,
    ).toBe(0);
    await expect(
      store.initializeBudget(
        { ...INITIAL_HOSTED_SPEND, creditsUsed: 0 },
        "operator",
      ),
    ).rejects.toMatchObject({ status: 400 });
    await store.initializeBudget(INITIAL_HOSTED_SPEND, "operator");
    expect(await createHostedStore(env, () => time).budget()).toEqual(
      INITIAL_HOSTED_SPEND,
    );
    await store.initializeBudget(INITIAL_HOSTED_SPEND, "operator");
    await expect(
      store.initializeBudget(
        { ...INITIAL_HOSTED_SPEND, usdMicroUsed: 111001 },
        "operator",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await store.budget()).toEqual(INITIAL_HOSTED_SPEND);
  });
  it("encrypts values and hashes owners with fresh authenticated IVs", async () => {
    await store.insert({
      namespace: "records",
      id: "a",
      owner: "private-owner-a",
      expiresAt: time + 60000,
      value: { note: "private record fixture" },
    });
    await store.insert({
      namespace: "records",
      id: "b",
      owner: "private-owner-a",
      expiresAt: time + 60000,
      value: { note: "private record fixture" },
    });
    const rows = fixture.sql
      .prepare("SELECT * FROM tb_hosted_records ORDER BY id")
      .all();
    expect(JSON.stringify(rows)).not.toContain("private-owner-a");
    expect(JSON.stringify(rows)).not.toContain("private record fixture");
    expect(rows[0].iv).not.toBe(rows[1].iv);
    expect(
      (await store.get<{ note: string }>("records", "a", "private-owner-a"))
        ?.value.note,
    ).toBe("private record fixture");
    fixture.sql
      .prepare("UPDATE tb_hosted_records SET ciphertext=? WHERE id=?")
      .run(rows[1].ciphertext as string, "a");
    await expect(
      store.get("records", "a", "private-owner-a"),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("enforces owner boundaries, bounded listing, JSON limits and wrong-key failure", async () => {
    await store.insert({
      namespace: "records",
      id: "a",
      owner: "owner-a",
      expiresAt: time + 60000,
      value: { note: "fixture" },
    });
    expect(await store.get("records", "a", "owner-b")).toBeNull();
    expect(await store.delete("records", "a", "owner-b")).toBe(false);
    expect(await store.list("records", "owner-b")).toEqual([]);
    await expect(store.list("records", "owner-a", 101)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      createHostedStore(
        {
          ...env,
          EDGE_DATA_SECRET: "a completely different fixture encryption secret",
        },
        () => time,
      ).get("records", "a", "owner-a"),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      store.insert({
        namespace: "records",
        id: "huge",
        owner: "owner-a",
        expiresAt: time + 60000,
        value: "x".repeat(256 * 1024),
      }),
    ).rejects.toMatchObject({ status: 413 });
    await expect(
      store.insert({
        namespace: "records",
        id: "binary",
        owner: "owner-a",
        expiresAt: time + 60000,
        value: new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("provides compare-and-swap across independent store instances and prevents expired-ID ABA", async () => {
    const first = await store.insert({
        namespace: "lease",
        id: "shared",
        owner: "owner-a",
        expiresAt: time + 1000,
        value: "old",
      }),
      other = createHostedStore(env, () => time);
    const attempts = await Promise.all([
      store.compareAndSwap({ ...first, value: "a" }),
      other.compareAndSwap({ ...first, value: "b" }),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    const current = (await store.get<string>("lease", "shared", "owner-a"))!;
    expect(current.revision).toBeGreaterThan(first.revision);
    time += 1001;
    await store.cleanup();
    const replacement = await other.insert({
      namespace: "lease",
      id: "shared",
      owner: "owner-a",
      expiresAt: time + 1000,
      value: "replacement",
    });
    expect(replacement.revision).toBeGreaterThan(current.revision);
    expect(
      await store.compareAndSwap({
        ...first,
        expiresAt: time + 1000,
        value: "stale overwrite",
      }),
    ).toBeNull();
    expect((await store.get<string>("lease", "shared", "owner-a"))?.value).toBe(
      "replacement",
    );
  });
  it("rejects expired reads/CAS and physically deletes ciphertext on cleanup", async () => {
    const row = await store.insert({
      namespace: "records",
      id: "a",
      owner: "owner-a",
      expiresAt: time + 1000,
      value: { private: "fixture" },
    });
    await expect(
      store.compareAndSwap({
        ...row,
        expiresAt: time + MAX_HOSTED_TTL + 1,
        value: "extend",
      }),
    ).rejects.toMatchObject({ status: 400 });
    time += 1001;
    expect(await store.get("records", "a", "owner-a")).toBeNull();
    expect(
      await store.compareAndSwap({
        ...row,
        expiresAt: time + 1000,
        value: "revive",
      }),
    ).toBeNull();
    await store.cleanup();
    expect(
      fixture.sql.prepare("SELECT COUNT(*) AS n FROM tb_hosted_records").get()
        ?.n,
    ).toBe(0);
  });
  it("does not return a decrypted value after its record is concurrently deleted", async () => {
    await store.insert({
      namespace: "records",
      id: "a",
      owner: "owner-a",
      expiresAt: time + 60000,
      value: "private fixture",
    });
    let release!: () => void, started!: () => void;
    const held = new Promise<void>((resolve) => {
        release = resolve;
      }),
      began = new Promise<void>((resolve) => {
        started = resolve;
      }),
      original = crypto.subtle.decrypt.bind(crypto.subtle),
      spy = vi
        .spyOn(crypto.subtle, "decrypt")
        .mockImplementation(async (...args) => {
          started();
          await held;
          return original(...args);
        });
    try {
      const reading = store.get("records", "a", "owner-a");
      await began;
      await store.delete("records", "a", "owner-a");
      release();
      expect(await reading).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
  it("keeps quotes encrypted and exposes only pending nonprivate approval metadata", async () => {
    const q = await quote();
    const raw = fixture.sql.prepare("SELECT * FROM tb_hosted_quotes").get()!;
    expect(JSON.stringify(raw)).not.toContain("private fixture context");
    expect(JSON.stringify(raw)).not.toContain("owner-a");
    expect(await store.getQuote(q.id, "owner-b")).toBeNull();
    expect(
      (await store.getQuote<typeof q.value>(q.id, q.owner))?.value,
    ).toEqual(q.value);
    expect(await store.listPendingQuotes()).toEqual([
      {
        id: q.id,
        operation: "skin",
        credits: 4,
        usdMicro: 0,
        expiresAt: q.expiresAt,
      },
    ]);
    await store.approveQuote(q.id, "operator");
    expect(await store.listPendingQuotes()).toEqual([]);
  });
  it("requires current operator or exact approval and rejects owner/terms/operation substitutions", async () => {
    await store.initializeBudget(INITIAL_HOSTED_SPEND, "operator");
    const q = await quote();
    await expect(
      store.consumeQuoteAndCreate(consume(q, false)),
    ).rejects.toMatchObject({ status: 403 });
    await store.approveQuote(q.id, "operator");
    for (const change of [
      { owner: "owner-b" },
      { termsHash: "a".repeat(64) },
      { operation: "hair" as const },
    ])
      await expect(
        store.consumeQuoteAndCreate({ ...consume(q, false), ...change }),
      ).rejects.toMatchObject({ status: 403 });
    const result = await store.consumeQuoteAndCreate(consume(q, false));
    expect(result.created).toBe(true);
    expect((await store.budget()).creditsUsed).toBe(55);
  });
  it("atomically consumes one quote once under concurrent starts across store instances", async () => {
    await store.initializeBudget(INITIAL_HOSTED_SPEND, "operator");
    const q = await quote(),
      other = createHostedStore(env, () => time),
      starts = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          (index % 2 ? store : other).consumeQuoteAndCreate(consume(q)),
        ),
      );
    expect(starts.filter((start) => start.created)).toHaveLength(1);
    expect(new Set(starts.map((start) => start.record.revision)).size).toBe(1);
    expect((await store.budget()).creditsUsed).toBe(55);
    expect(
      fixture.sql
        .prepare("SELECT COUNT(*) AS n FROM tb_hosted_reservations")
        .get()?.n,
    ).toBe(1);
    await expect(
      store.consumeQuoteAndCreate(consume(q, true, "another-record")),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back record, quote and budget on quota failure or task-ID collision", async () => {
    await store.initializeBudget(
      { ...INITIAL_HOSTED_SPEND, creditsUsed: 99 },
      "operator",
    );
    const q = await quote(4);
    await expect(store.consumeQuoteAndCreate(consume(q))).rejects.toMatchObject(
      { status: 429 },
    );
    expect(await store.get("fixture-task", q.id, q.owner)).toBeNull();
    expect((await store.getQuote(q.id, q.owner))?.consumedBy).toBeNull();
    expect((await store.budget()).creditsUsed).toBe(99);
    const q2 = await quote(1);
    await store.insert({
      namespace: "fixture-task",
      id: q2.id,
      owner: q2.owner,
      expiresAt: time + 60000,
      value: "existing",
    });
    await expect(
      store.consumeQuoteAndCreate(consume(q2)),
    ).rejects.toMatchObject({ status: 409 });
    expect((await store.budget()).creditsUsed).toBe(99);
    expect(
      fixture.sql
        .prepare("SELECT COUNT(*) AS n FROM tb_hosted_reservations")
        .get()?.n,
    ).toBe(0);
  });
  it("checks revocation inside the final transaction, not only the earlier JS permission read", async () => {
    await store.initializeBudget(INITIAL_HOSTED_SPEND, "operator");
    const q = await quote();
    await store.approveQuote(q.id, "operator");
    let first = true;
    const guarded = createHostedStore(
      {
        ...env,
        DB: {
          ...fixture.db,
          batch: async (statements) => {
            if (first) {
              first = false;
              await store.revokeQuote(q.id, "operator");
            }
            return fixture.db.batch(statements);
          },
        },
      },
      () => time,
    );
    await expect(
      guarded.consumeQuoteAndCreate(consume(q, false)),
    ).rejects.toMatchObject({ status: 403 });
    expect((await store.budget()).creditsUsed).toBe(51);
    expect(await store.get("fixture-task", q.id, q.owner)).toBeNull();
  });
  it("continues an approved fully reserved task after quote expiry but always honors revocation and absolute TTL", async () => {
    await store.initializeBudget(INITIAL_HOSTED_SPEND, "operator");
    const q = await quote(49);
    const started = await store.consumeQuoteAndCreate(consume(q));
    expect((await store.budget()).creditsUsed).toBe(100);
    time += 6 * 60000;
    expect(await store.getQuote(q.id, q.owner)).toBeNull();
    await store.assertContinuation(q.id, q.owner, false);
    await store.revokeQuote(q.id, "operator");
    await expect(
      store.assertContinuation(q.id, q.owner, true),
    ).rejects.toMatchObject({ status: 403 });
    await store.approveQuote(q.id, "operator");
    await store.assertContinuation(q.id, q.owner, false);
    time = started.record.expiresAt + 1;
    await expect(
      store.assertContinuation(q.id, q.owner, true),
    ).rejects.toMatchObject({ status: 403 });
    expect(await store.get("fixture-task", q.id, q.owner)).toBeNull();
    await store.cleanup();
    expect(
      fixture.sql.prepare("SELECT COUNT(*) AS n FROM tb_hosted_quotes").get()
        ?.n,
    ).toBe(0);
    expect((await store.budget()).creditsUsed).toBe(100);
  });
  it("shares atomic rate limits without storing raw owner/IP keys", async () => {
    const other = createHostedStore(env, () => time),
      results = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          (index % 2 ? store : other).rateLimit("private-ip-key", 3, 60000),
        ),
      );
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(
      JSON.stringify(
        fixture.sql.prepare("SELECT * FROM tb_hosted_rate_limits").all(),
      ),
    ).not.toContain("private-ip-key");
    time += 60001;
    expect(await store.rateLimit("private-ip-key", 3, 60000)).toBe(true);
  });
});
