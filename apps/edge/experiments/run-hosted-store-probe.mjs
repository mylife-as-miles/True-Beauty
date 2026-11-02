import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const tooling = process.argv[2];
if (!tooling)
  throw new Error(
    "Pass isolated Wrangler/Miniflare/esbuild tooling directory.",
  );
const require = createRequire(resolve(tooling, "package.json")),
  { Miniflare } = require("miniflare"),
  esbuild = require("esbuild"),
  outfile = resolve(tooling, "r07-hosted-store-fixture.mjs");
await esbuild.build({
  entryPoints: [resolve("apps/edge/experiments/hosted-store-worker.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const code = await readFile(outfile, "utf8"),
  env = {
    DB: { type: "d1", id: "r07-hosted-store-fixture" },
    SITE_ORIGIN: { type: "text", value: "https://localhost" },
    EDGE_SESSION_SECRET: {
      type: "text",
      value: "fixture-only-session-secret-0123456789",
    },
    EDGE_DATA_SECRET: {
      type: "text",
      value: "fixture-only-data-secret-never-a-production-key-0123456789",
    },
  };
const worker = (name) => ({
  config: {
    name,
    compatibilityDate: "2026-11-01",
    manifest: {
      mainModule: "index.mjs",
      modulesRoot: "/",
      modules: { "index.mjs": { type: "esm", contents: code } },
    },
    env,
  },
});
const mf = new Miniflare({
  workers: [worker("store-a"), worker("store-b")],
  cf: false,
});
let time = Date.now();
const checks = [],
  check = (condition, message) => {
    assert.ok(condition, message);
    checks.push(message);
  };
const baseline = {
  creditsUsed: 51,
  creditsLimit: 100,
  usdMicroUsed: 111000,
  usdMicroLimit: 5000000,
};
try {
  const db = await mf.getD1Database("DB", "store-a");
  for (const name of (await readdir("drizzle"))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    for (const statement of (
      await readFile(resolve("drizzle", name), "utf8")
    ).split("--> statement-breakpoint"))
      if (statement.trim()) await db.prepare(statement).run();
  const a = await mf.getWorker("store-a"),
    b = await mf.getWorker("store-b");
  async function call(target, method, ...args) {
    const response = await target.fetch("https://localhost/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method, args, now: time }),
    });
    return { status: response.status, ...(await response.json()) };
  }
  check(
    (await call(a, "budget")).status === 503,
    "A fresh hosted database has no automatic spending seed",
  );
  check(
    (await call(a, "initialize", baseline, "fixture-operator")).status === 200,
    "Explicit reconciliation carries prior51credits and111000microUSD",
  );
  check(
    (
      await call(
        b,
        "initialize",
        { ...baseline, creditsUsed: 0 },
        "fixture-operator",
      )
    ).status === 400,
    "The prior-spend baseline cannot be reset to zero",
  );
  const original = {
      namespace: "records",
      id: "fixture-record",
      owner: "private-fixture-owner",
      expiresAt: time + 60000,
      value: { note: "private-fixture-data" },
    },
    record = (await call(a, "insert", original)).value;
  const raw = await db
    .prepare("SELECT * FROM tb_hosted_records WHERE id=?")
    .bind(original.id)
    .first();
  check(
    !JSON.stringify(raw).includes("private-fixture-data") &&
      !JSON.stringify(raw).includes("private-fixture-owner"),
    "Actual D1 stores ciphertext and owner hashes, not original value/identity",
  );
  check(
    (await call(b, "get", "records", original.id, original.owner)).value.value
      .note === "private-fixture-data",
    "Another Worker isolate can authenticate and decrypt the same owned record",
  );
  check(
    (await call(b, "get", "records", original.id, "wrong-owner")).value ===
      null,
    "An unrelated owner cannot read the encrypted record",
  );
  const cas = await Promise.all([
    call(a, "cas", { ...record, value: "first" }),
    call(b, "cas", { ...record, value: "second" }),
  ]);
  check(
    cas.filter((value) => value.value !== null).length === 1,
    "Cross-isolate compare-and-swap has exactly one winner",
  );
  time += 60001;
  await call(a, "cleanup");
  const replacement = (
    await call(b, "insert", {
      ...original,
      expiresAt: time + 60000,
      value: "replacement",
    })
  ).value;
  check(
    replacement.revision > record.revision &&
      (
        await call(a, "cas", {
          ...record,
          expiresAt: time + 60000,
          value: "stale",
        })
      ).value === null,
    "A deleted/expired key cannot be overwritten by an old lease (monotonic CAS epoch)",
  );
  function quote(credits, usdMicro = 0) {
    const id = randomUUID();
    return {
      id,
      owner: "task-owner",
      operation: usdMicro ? "reasoning" : "skin",
      termsHash: createHash("sha256").update(id).digest("hex"),
      credits,
      usdMicro,
      expiresAt: time + 5 * 60000,
      value: { private: "quote-fixture-data" },
    };
  }
  const q = quote(4);
  await call(a, "quote", q);
  const input = {
    quoteId: q.id,
    owner: q.owner,
    operator: false,
    operation: q.operation,
    termsHash: q.termsHash,
    record: {
      namespace: "task",
      id: q.id,
      expiresAt: time + 15 * 60000,
      value: { status: "pending" },
    },
  };
  check(
    (await call(b, "consume", input)).status === 403,
    "Anonymous exact-quote owner cannot dispatch before operator approval",
  );
  await call(a, "approve", q.id, "fixture-operator");
  const duplicates = await Promise.all(
    Array.from({ length: 16 }, (_, i) => call(i % 2 ? a : b, "consume", input)),
  );
  check(
    duplicates.every((value) => value.status === 200) &&
      duplicates.filter((value) => value.value.created).length === 1,
    "Sixteen concurrent starts consume one quote and create exactly one encrypted task",
  );
  check(
    (await call(b, "budget")).value.creditsUsed === 55,
    "Duplicate quote starts reserve provider credits exactly once",
  );
  const q1 = quote(30),
    q2 = quote(30);
  for (const candidate of [q1, q2]) await call(a, "quote", candidate);
  const spending = await Promise.all(
    [q1, q2].map((candidate, i) =>
      call(i ? a : b, "consume", {
        ...input,
        quoteId: candidate.id,
        operation: candidate.operation,
        termsHash: candidate.termsHash,
        operator: true,
        record: { ...input.record, id: candidate.id },
      }),
    ),
  );
  check(
    spending.filter((value) => value.status === 200).length === 1 &&
      spending.filter((value) => value.status === 429).length === 1,
    "Independent cross-isolate spending races respect the remaining shared credit ceiling",
  );
  const money1 = quote(0, 3000000),
    money2 = quote(0, 3000000);
  for (const candidate of [money1, money2]) await call(a, "quote", candidate);
  const dollars = await Promise.all(
    [money1, money2].map((candidate, i) =>
      call(i ? a : b, "consume", {
        ...input,
        quoteId: candidate.id,
        operation: candidate.operation,
        termsHash: candidate.termsHash,
        operator: true,
        record: { ...input.record, id: candidate.id },
      }),
    ),
  );
  check(
    dollars.filter((value) => value.status === 200).length === 1 &&
      dollars.filter((value) => value.status === 429).length === 1,
    "Independent cross-isolate reasoning races respect the remaining shared USD ceiling",
  );
  time += 6 * 60000;
  check(
    (await call(b, "continue", q.id, q.owner, false)).status === 200,
    "A reserved task continues after original quote expiry without a second budget reservation",
  );
  await call(a, "revoke", q.id, "fixture-operator");
  check(
    (await call(b, "continue", q.id, q.owner, true)).status === 403,
    "Revocation blocks continuation even for a current operator",
  );
  const rates = await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      call(i % 2 ? a : b, "rate", "private-fixture-ip", 4, 60000),
    ),
  );
  check(
    rates.filter((value) => value.value === true).length === 4,
    "Shared D1 rate-limit counters are atomic across isolates",
  );
  time = input.record.expiresAt + 1;
  await call(a, "cleanup");
  check(
    (await db.prepare("SELECT COUNT(*) AS n FROM tb_hosted_records").first())
      .n === 0 &&
      (await db.prepare("SELECT COUNT(*) AS n FROM tb_hosted_quotes").first())
        .n === 0,
    "Cleanup physically removes expired record/quote ciphertext",
  );
  const budget = (await call(b, "budget")).value;
  check(
    budget.creditsUsed === 85 && budget.usdMicroUsed === 3111000,
    "Cleanup and isolate reconstruction never reset conservative budget reservations",
  );
  const report = {
    recordedAt: new Date().toISOString(),
    runtime:
      "actual workerd; two independent Worker services, one production D1 schema",
    assertionsPassed: checks.length,
    checks,
    budget,
    providerCalls: 0,
    realUserData: false,
    tools: {
      wrangler: require("wrangler/package.json").version,
      miniflare: require("miniflare/package.json").version,
    },
  };
  await mkdir("apps/edge/evidence", { recursive: true });
  await writeFile(
    "apps/edge/evidence/hosted-store-r07.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mf.dispose();
}
