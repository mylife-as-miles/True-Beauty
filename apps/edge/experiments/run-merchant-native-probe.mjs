/** Genuine local workerd+service/D1 probe with scripted merchant data, never a live merchant receipt. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const tooling = process.argv[2];
if (!tooling) throw new Error("Pass the absolute isolated tooling directory.");
const require = createRequire(resolve(tooling, "package.json")),
  { Miniflare } = require("miniflare"),
  esbuild = require("esbuild");
const output = resolve(tooling, "merchant-native-r07-fixture.mjs");
const bundle = await esbuild.build({
  entryPoints: [resolve("apps/edge/experiments/merchant-native-fixture.ts")],
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  metafile: true,
});
const imports = Object.keys(bundle.metafile.inputs);
assert.ok(
  !imports.some((p) =>
    /dexie|local-database|apps\/api\/src\/merchant\.ts|node:http/.test(p),
  ),
  "Native merchant dependency graph must not reach Dexie or Node Fastify transport",
);
const code = await readFile(output, "utf8"),
  origin = "https://localhost";
const documents = `let reads=[];export default{async fetch(request){const url=new URL(request.url);if(url.pathname==='/_fixture/stats')return Response.json({fixture:true,reads,externalRequests:0});reads.push({url:request.url,method:request.method,credentials:request.credentials});if(url.pathname==='/robots.txt')return new Response('User-agent: *\\nAllow: /',{headers:{'content-type':'text/plain'}});await new Promise(r=>setTimeout(r,150));return new Response('<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name:'SCRIPTED FIXTURE ONLY',url:request.url,offers:{'@type':'Offer',sku:'WORKERD-FIXTURE-NOT-LIVE',price:'12345',priceCurrency:'NGN',availability:'https://schema.org/InStock'}})+'</script>',{headers:{'content-type':'text/html'}});}};`;
function worker(name) {
  return {
    config: {
      name,
      domains: [name + ".test"],
      compatibilityDate: "2026-11-01",
      env: {
        DB: { type: "d1", id: "merchant-r07-native-fixture" },
        SITE_ORIGIN: { type: "text", value: origin },
        EDGE_DATA_SECRET: {
          type: "text",
          value: "fixture-only-encryption-secret-not-production-0123456789",
        },
        MERCHANT_FIXTURE: { type: "worker", worker: "merchant-documents" },
      },
      manifest: {
        mainModule: "index.mjs",
        modulesRoot: "/",
        modules: { "index.mjs": { type: "esm", contents: code } },
      },
    },
  };
}
const mf = new Miniflare({
  workers: [
    worker("merchant-a"),
    worker("merchant-b"),
    {
      config: {
        name: "merchant-documents",
        domains: ["merchant-documents.test"],
        compatibilityDate: "2026-11-01",
        manifest: {
          mainModule: "index.mjs",
          modulesRoot: "/",
          modules: { "index.mjs": { type: "esm", contents: documents } },
        },
      },
    },
  ],
  cf: false,
});
const assertions = [];
const check = (condition, label) => {
  assert.ok(condition, label);
  assertions.push(label);
};
try {
  const db = await mf.getD1Database("DB", "merchant-a");
  for (const name of (await readdir("drizzle"))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    for (const sql of (await readFile(resolve("drizzle", name), "utf8")).split(
      "--> statement-breakpoint",
    ))
      if (sql.trim()) await db.prepare(sql).run();
  const a = await mf.getWorker("merchant-a"),
    b = await mf.getWorker("merchant-b"),
    docs = await mf.getWorker("merchant-documents");
  const clock = Date.now();
  const request = (
    target,
    reference = "nuban-fixing-spray",
    csrf = "fixture-csrf",
    time = clock,
  ) =>
    target.fetch(origin + "/api/merchants/refresh", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        "x-csrf-token": csrf,
        "x-fixture-clock": String(time),
      },
      body: JSON.stringify({ sourceId: "nuban", referenceId: reference }),
    });
  const before = await (
    await docs.fetch("https://merchant-documents.test/_fixture/stats")
  ).json();
  check(
    (await request(a, undefined, "wrong")).status === 403,
    "CSRF denial reaches zero scripted merchant subrequests",
  );
  const bad = await a.fetch(origin + "/api/merchants/resolve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "x-csrf-token": "fixture-csrf",
    },
    body: JSON.stringify({ url: "http://169.254.169.254/private" }),
  });
  check(
    bad.status === 400,
    "Native route rejects arbitrary/metadata-service URLs before subrequests",
  );
  check(
    (
      await (
        await docs.fetch("https://merchant-documents.test/_fixture/stats")
      ).json()
    ).reads.length === before.reads.length,
    "Rejected requests do not reach the fixture source service",
  );
  const firstResponse = await request(a);
  assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
  const first = await firstResponse.json();
  check(
    first.observations[0].amount === 12345 &&
      first.observations[0].currency === "NGN" &&
      first.observations[0].variantId === "WORKERD-FIXTURE-NOT-LIVE",
    "Actual native Request/Response parses scripted Offer facts without a browser/Node transport",
  );
  const secondResponse = await request(b);
  assert.equal(secondResponse.status, 200, await secondResponse.clone().text());
  const second = await secondResponse.json();
  check(
    second.cached === true && second.fetchedAt === first.fetchedAt,
    "A second actual workerd isolate reads the same encrypted local D1 cache without re-fetching",
  );
  const stats = await (
    await docs.fetch("https://merchant-documents.test/_fixture/stats")
  ).json();
  check(
    stats.reads.length === 2 &&
      stats.reads[0].url.endsWith("/robots.txt") &&
      stats.reads[1].url.endsWith("/seal-it-makeup-fixing-spray"),
    "Exactly one robots GET then one reviewed product GET across both isolates",
  );
  const pair = await Promise.all([
    request(a, "nuban-gloss"),
    request(b, "nuban-gloss"),
  ]);
  check(
    pair
      .map((r) => r.status)
      .sort()
      .join(",") === "200,409",
    "Actual D1 CAS lets only one isolate dispatch a simultaneous new-reference lookup",
  );
  const rows = await db
    .prepare(
      "SELECT namespace,owner_hash,revision,iv,ciphertext,expires_at,created_at FROM tb_hosted_records",
    )
    .all();
  check(
    rows.results.length >= 3 &&
      rows.results.every(
        (r) =>
          r.iv &&
          r.ciphertext &&
          !r.ciphertext.includes("WORKERD-FIXTURE") &&
          r.owner_hash !== "public-merchant-v1" &&
          r.expires_at - r.created_at <= 900000,
      ),
    "Actual local D1 stores bounded encrypted records and hashed public owner, not clear fixture offers",
  );
  const expiredResponse = await request(
    b,
    "nuban-fixing-spray",
    "fixture-csrf",
    clock + 900001,
  );
  assert.equal(
    expiredResponse.status,
    200,
    await expiredResponse.clone().text(),
  );
  const renewed = await expiredResponse.json();
  check(
    renewed.cached === false &&
      Date.parse(renewed.fetchedAt) === clock + 900001,
    "Expired public cache is replaced and factual fetch provenance advances only on the next explicit action",
  );
  const finalStats = await (
    await docs.fetch("https://merchant-documents.test/_fixture/stats")
  ).json();
  check(
    finalStats.externalRequests === 0,
    "All merchant documents came from the internal scripted service; zero external/paid requests or personal images",
  );
  const evidence = {
    executedAt: new Date().toISOString(),
    runtime:
      "actual local workerd via Miniflare, two route isolates plus internal scripted document worker and local D1",
    scope:
      "Native route/D1/transport compatibility with explicit SCRIPTED FIXTURE data; not live merchant HTTP or public hosting verification, not full bootstrap auth/session-registration verification",
    externalMerchantRequests: 0,
    paidRequests: 0,
    personalImages: 0,
    passingAssertions: assertions.length,
    assertions,
    scriptedDocumentRequests: finalStats.reads.length,
    bundleBytes: Buffer.byteLength(code),
    dependencyGraph: {
      nodeTransport: false,
      dexie: false,
      inputs: imports.length,
    },
  };
  await writeFile(
    resolve("apps/edge/evidence/merchant-native-workerd.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await mf.dispose();
}
