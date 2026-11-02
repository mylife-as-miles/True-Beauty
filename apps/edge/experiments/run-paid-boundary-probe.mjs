import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const tooling = process.argv[2];
if (!tooling) throw new Error("Pass the absolute isolated tooling directory.");
const require = createRequire(resolve(tooling, "package.json")),
  { Miniflare } = require("miniflare"),
  esbuild = require("esbuild"),
  output = resolve(tooling, "paid-boundary-build.mjs");
await esbuild.build({
  entryPoints: [resolve("apps/edge/src/index.ts")],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
const code = await readFile(output, "utf8"),
  origin = "https://localhost",
  fixtureSecret =
    "fixture-session-signing-secret-not-for-production-0123456789";
const bindings = {
  DB: { type: "d1", id: "edge-paid-boundary-r06" },
  SITE_ORIGIN: { type: "text", value: origin },
  EDGE_SESSION_SECRET: { type: "text", value: fixtureSecret },
  OPERATOR_SITE_USER_ID: { type: "text", value: "fixture-site-owner" },
  EDGE_BUDGET_ID: { type: "text", value: "r06-total-test" },
};
const worker = (name, trusted) => ({
  config: {
    name,
    domains: ["localhost"],
    compatibilityDate: "2026-11-01",
    env: {
      ...bindings,
      SITES_IDENTITY_TRUSTED: { type: "text", value: String(trusted) },
    },
    manifest: {
      mainModule: "index.mjs",
      modulesRoot: "/",
      modules: { "index.mjs": { type: "esm", contents: code } },
    },
  },
});
const mf = new Miniflare({
  workers: [
    worker("edge-a", true),
    worker("edge-b", true),
    worker("untrusted-dispatch", false),
  ],
  cf: false,
});
const assertions = [],
  started = performance.now();
let schemaApplied = false;
function check(condition, label) {
  assert.ok(condition, label);
  assertions.push(label);
}
try {
  const database = await mf.getD1Database("DB", "edge-a");
  for (const sql of (
    await readFile(
      resolve("apps/edge/migrations/0001_paid_boundary.sql"),
      "utf8",
    )
  ).split("--> statement-breakpoint")) {
    if (sql.trim()) await database.prepare(sql).run();
  }
  schemaApplied = true;
  const a = await mf.getWorker("edge-a"),
    b = await mf.getWorker("edge-b"),
    untrusted = await mf.getWorker("untrusted-dispatch");
  async function makeSession(target = a) {
    const response = await target.fetch(origin + "/api/edge/session");
    assert.equal(response.status, 200);
    const value = await response.json();
    return {
      sessionId: value.sessionId,
      cookie: response.headers.get("set-cookie").split(";")[0],
      csrf: value.csrfToken,
    };
  }
  const owner = await makeSession(),
    anonymous = await makeSession();
  const headers = (user, operator = false) => ({
    "content-type": "application/json",
    Origin: origin,
    Cookie: user.cookie,
    "X-CSRF-Token": user.csrf,
    ...(operator ? { "oai-authenticated-user-id": "fixture-site-owner" } : {}),
  });
  const quoteHash = "a".repeat(64),
    voucherInput = (
      operation = "reasoning",
      usdMicro = 1000000,
      credits = 0,
    ) => ({ operation, quoteHash, usdMicro, credits });
  async function mint(value, user = owner, target = a) {
    return target.fetch(origin + "/api/edge/operator/vouchers", {
      method: "POST",
      headers: headers(user, true),
      body: JSON.stringify(value),
    });
  }
  async function voucher(value) {
    const response = await mint(value);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const reservationInput = (token, units, reservationId = randomUUID()) => ({
    ...units,
    reservationId,
    voucher: token,
    costAuthorized: true,
    providerRetentionConsent: true,
    ...(units.operation === "reasoning"
      ? { textTransmission: true }
      : { uploadConsent: true }),
  });
  async function reserve(input, target = a, user = owner) {
    return target.fetch(origin + "/api/edge/reservations", {
      method: "POST",
      headers: headers(user),
      body: JSON.stringify(input),
    });
  }
  const anonIssue = await a.fetch(origin + "/api/edge/operator/vouchers", {
    method: "POST",
    headers: headers(anonymous),
    body: JSON.stringify(voucherInput()),
  });
  check(
    anonIssue.status === 403,
    "Anonymous same-origin session cannot issue spending vouchers",
  );
  const forged = await untrusted.fetch(origin + "/api/edge/operator/vouchers", {
    method: "POST",
    headers: headers(owner, true),
    body: JSON.stringify(voucherInput()),
  });
  check(
    forged.status === 403,
    "Claimed owner header fails closed without explicit trusted-dispatch configuration",
  );
  const wrongOrigin = await a.fetch(origin + "/api/edge/operator/vouchers", {
    method: "POST",
    headers: { ...headers(owner, true), Origin: "https://127.0.0.1" },
    body: JSON.stringify(voucherInput()),
  });
  check(
    wrongOrigin.status === 403 &&
      (await wrongOrigin.json()).error ===
        "An exact same-origin request is required",
    "Actual boundary rejects a different loopback Origin, after Miniflare transport",
  );
  const directWorker = await a.fetch(
    "https://127.0.0.1/api/edge/operator/vouchers",
    {
      method: "POST",
      headers: headers(owner, true),
      body: JSON.stringify(voucherInput()),
    },
  );
  check(
    directWorker.status === 403 &&
      (await directWorker.json()).error === "Use the canonical HTTPS Site",
    "Actual boundary rejects a noncanonical HTTPS URL alias",
  );
  const noCsrf = await a.fetch(origin + "/api/edge/operator/vouchers", {
    method: "POST",
    headers: { ...headers(owner, true), "X-CSRF-Token": "bad" },
    body: JSON.stringify(voucherInput()),
  });
  check(noCsrf.status === 403, "Owner mutation without valid CSRF is denied");
  const forgedCookie = await a.fetch(origin + "/api/edge/operator/vouchers", {
    method: "POST",
    headers: {
      ...headers(owner, true),
      Cookie:
        owner.cookie.slice(0, -1) + (owner.cookie.endsWith("0") ? "1" : "0"),
    },
    body: JSON.stringify(voucherInput()),
  });
  check(
    forgedCookie.status === 403,
    "Tampered signed session cookie is denied",
  );
  const anonymousSpend = await reserve(
    reservationInput("b".repeat(64), voucherInput()),
    a,
    anonymous,
  );
  check(
    anonymousSpend.status === 403,
    "Public visitor with a valid anonymous CSRF session cannot spend without a valid voucher",
  );
  const moneyUnits = voucherInput(),
    moneyVoucher = await voucher(moneyUnits),
    moneyRequest = reservationInput(moneyVoucher.voucher, moneyUnits);
  check(
    (await reserve(moneyRequest, b, anonymous)).status === 403,
    "Voucher is bound to the exact ephemeral session across isolates",
  );
  check(
    (await reserve({ ...moneyRequest, usdMicro: 1000 }, b)).status === 403,
    "Voucher amount cannot be discounted or substituted by a caller",
  );
  check(
    (await reserve({ ...moneyRequest, quoteHash: "c".repeat(64) }, b))
      .status === 403,
    "Voucher is bound to the exact reviewed quote hash",
  );
  const duplicates = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      reserve(moneyRequest, index % 2 ? a : b),
    ),
  );
  const duplicateBodies = await Promise.all(
    duplicates.map((response) => response.json()),
  );
  check(
    duplicates.every((response) => response.status === 200) &&
      duplicateBodies.filter((body) => body.reused === false).length === 1,
    "Twelve cross-isolate duplicate reservations spend once and return one stable receipt",
  );
  check(
    (await reserve({ ...moneyRequest, reservationId: randomUUID() }, b))
      .status === 403,
    "A consumed voucher cannot authorize a second reservation identifier",
  );
  const hidden = await b.fetch(
    origin + "/api/edge/reservations/" + moneyRequest.reservationId,
    { headers: headers(anonymous) },
  );
  check(
    hidden.status === 404,
    "Reservation receipts are owned by the bound session",
  );
  const own = await b.fetch(
    origin + "/api/edge/reservations/" + moneyRequest.reservationId,
    { headers: headers(owner) },
  );
  check(
    own.status === 200,
    "A valid session and receipt remain usable on another Worker isolate",
  );
  const expired = await voucher(voucherInput()),
    expiredHash = createHash("sha256").update(expired.voucher).digest("hex");
  await database
    .prepare("UPDATE tb_edge_vouchers SET expires_ms = ? WHERE token_hash = ?")
    .bind(Date.now() - 1, expiredHash)
    .run();
  check(
    (await reserve(reservationInput(expired.voucher, voucherInput()), b))
      .status === 403,
    "Expired vouchers cannot spend",
  );
  const moneyVouchers = await Promise.all(
    Array.from({ length: 4 }, () =>
      voucher(voucherInput("reasoning", 2000000)),
    ),
  );
  const moneyRace = await Promise.all(
    moneyVouchers.map((token, index) =>
      reserve(
        reservationInput(token.voucher, voucherInput("reasoning", 2000000)),
        index % 2 ? a : b,
      ),
    ),
  );
  check(
    moneyRace.filter((response) => response.status === 200).length === 2 &&
      moneyRace.filter((response) => response.status === 402).length === 2,
    "Concurrent independent vouchers cannot exceed the shared US$5 total ceiling",
  );
  const skinUnits = voucherInput("skin", 0, 10),
    skinVoucher = await voucher(skinUnits),
    skinRequest = reservationInput(skinVoucher.voucher, skinUnits),
    noConsent = { ...skinRequest };
  delete noConsent.uploadConsent;
  check(
    (await reserve(noConsent, b)).status === 400,
    "Image-provider reservation requires explicit per-request upload consent",
  );
  check(
    (await reserve(skinRequest, b)).status === 200,
    "A valid consented credit voucher can reserve without calling a provider",
  );
  const creditUnits = voucherInput("hair", 0, 30),
    creditVouchers = await Promise.all(
      Array.from({ length: 4 }, () => voucher(creditUnits)),
    ),
    creditRace = await Promise.all(
      creditVouchers.map((token, index) =>
        reserve(
          reservationInput(token.voucher, creditUnits),
          index % 2 ? a : b,
        ),
      ),
    );
  check(
    creditRace.filter((response) => response.status === 200).length === 3 &&
      creditRace.filter((response) => response.status === 402).length === 1,
    "Concurrent credit reservations cannot exceed the shared 100-credit total ceiling",
  );
  const budget = await database
    .prepare("SELECT * FROM tb_edge_budgets WHERE budget_id = ?")
    .bind("r06-total-test")
    .first();
  check(
    budget.usd_micro_used === 5000000 && budget.credits_used === 100,
    "Durable ledger records exactly US$5 and 100 credits after both race suites",
  );
  const receipts = await database
    .prepare("SELECT COUNT(*) AS count FROM tb_edge_reservations")
    .first();
  check(
    receipts.count === 7,
    "Failed or duplicate transactions leave no extra reservation artifacts",
  );
  const report = {
    recordedAt: new Date().toISOString(),
    prototypeOnly: true,
    paidProviderCalls: 0,
    privateImagesStored: 0,
    tools: {
      wrangler: require("wrangler/package.json").version,
      miniflare: require("miniflare/package.json").version,
    },
    runtime:
      "actual workerd with two independent Worker services sharing one D1 database",
    schemaApplied,
    assertionsPassed: assertions.length,
    assertions,
    durableLedger: budget,
    reservations: receipts.count,
    elapsedMs: performance.now() - started,
  };
  await mkdir(resolve("apps/edge/evidence"), { recursive: true });
  await writeFile(
    resolve("apps/edge/evidence/paid-boundary-workerd.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mf.dispose();
}
