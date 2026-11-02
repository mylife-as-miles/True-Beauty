/** Actual workerd DEFAULT-fetch regression. All outbound requests terminate in this
 * Miniflare fixture; no external network, real credentials, images or provider spend. */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
const tooling = process.argv[2];
if (!tooling) throw new Error("Pass the isolated Miniflare tooling directory.");
const require = createRequire(resolve(tooling, "package.json")),
  { Miniflare } = require("miniflare"),
  esbuild = require("esbuild");
const output = resolve(tooling, "youcam-default-fetch-r07-fixture.mjs");
await esbuild.build({
  entryPoints: [
    resolve("apps/edge/experiments/youcam-default-fetch-fixture.ts"),
  ],
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
});
const code = await readFile(output, "utf8"),
  calls = [];
let registered = 0;
const png = new Uint8Array(120);
png.set([137, 80, 78, 71, 13, 10, 26, 10]);
const taskPaths = {
  skin: "/s2s/v2.1/task/skin-analysis",
  hair: "/s2s/v2.1/task/hair-transfer",
  clothing: "/s2s/v2.0/task/cloth-v4",
};
const KEY = "non-secret-default-fetch-fixture";
const outbound = async (request) => {
  const url = new URL(request.url),
    api = url.origin === "https://yce-api-01.makeupar.com",
    media = url.origin === "https://yce-us.s3-accelerate.amazonaws.com";
  assert.ok(
    api || media,
    "Only the fixed API/media hosts reach the closed fixture",
  );
  const authorization = request.headers.get("authorization");
  if (api) assert.equal(authorization, "Bearer " + KEY);
  else assert.equal(authorization, null);
  const bytes = new Uint8Array(await request.arrayBuffer());
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    /* The fixture upload is binary. */
  }
  calls.push({
    host: api ? "fixed-api" : "allowlisted-media",
    path: url.pathname,
    method: request.method,
    hasAuthorization: authorization !== null,
    body,
    bytes: bytes.length,
  });
  if (media) {
    if (request.method === "PUT" && url.pathname.startsWith("/fixture-upload/"))
      return new Response(null, { status: 200 });
    if (request.method === "GET" && url.pathname === "/fixture-output.png")
      return new Response(png, { headers: { "Content-Type": "image/png" } });
    throw new Error("Unexpected closed-fixture media request.");
  }
  if (url.pathname === "/s2s/v2.0/credit/feature-cost")
    return Response.json({
      result: {
        skus: Object.values(taskPaths).map((path) => ({
          run_task_url: "https://yce-api-01.makeupar.com" + path,
          amount: 2,
          description: "SCRIPTED WORKER FIXTURE; no real pricing",
        })),
      },
    });
  if (url.pathname === "/s2s/v2.0/redirect-fixture")
    return new Response(null, {
      status: 302,
      headers: {
        Location: "https://untrusted.invalid/should-never-be-followed",
      },
    });
  if (url.pathname === "/s2s/v2.0/file") {
    registered++;
    assert.equal(body.files[0].file_size, 120);
    return Response.json({
      data: {
        files: [
          {
            file_id: "fixture-file-" + registered,
            requests: [
              {
                method: "PUT",
                url:
                  "https://yce-us.s3-accelerate.amazonaws.com/fixture-upload/" +
                  registered,
                headers: { "Content-Type": "image/png" },
              },
            ],
          },
        ],
      },
    });
  }
  const feature = Object.keys(taskPaths).find(
    (f) => url.pathname === taskPaths[f],
  );
  if (request.method === "POST" && feature)
    return Response.json({ data: { task_id: "fixture-created-" + feature } });
  if (
    request.method === "GET" &&
    Object.values(taskPaths).some((path) => url.pathname.startsWith(path + "/"))
  ) {
    if (url.pathname.startsWith(taskPaths.skin + "/"))
      return Response.json({
        data: {
          task_status: "success",
          results: {
            output: [{ type: "texture", ui_score: 72, raw_score: 70 }],
          },
        },
      });
    return Response.json({
      data: {
        task_status: "success",
        results: {
          url: "https://yce-us.s3-accelerate.amazonaws.com/fixture-output.png",
        },
      },
    });
  }
  throw new Error("Unexpected closed-fixture API request.");
};
const mf = new Miniflare({
  workers: [
    {
      config: {
        name: "youcam-default-fetch-r07",
        domains: ["localhost"],
        compatibilityDate: "2026-11-01",
        manifest: {
          mainModule: "index.mjs",
          modulesRoot: "/",
          modules: { "index.mjs": { type: "esm", contents: code } },
        },
      },
      dev: { outboundService: { type: "fetcher", handler: outbound } },
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
  const worker = await mf.getWorker("youcam-default-fetch-r07");
  const broken = await worker.fetch("https://localhost/negative-control");
  check(
    (await broken.json()).illegalReceiverRejected,
    "actual workerd reproduces old unbound-class-fetch Illegal invocation",
  );
  check(
    calls.length === 0,
    "the receiver negative control fails before any outbound request",
  );
  const beforeRedirect = calls.length;
  const redirected = await worker.fetch("https://localhost/redirect-check");
  check(
    (await redirected.json()).redirectRejected,
    "production manual redirect mode rejects3xx in actual workerd",
  );
  check(
    calls.length === beforeRedirect + 1 &&
      calls.at(-1).path === "/s2s/v2.0/redirect-fixture",
    "rejected redirect makes no request to its Location target",
  );
  const response = await worker.fetch("https://localhost/probe");
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  check(
    result.defaultFetch && !result.injectedFetch,
    "production constructors use default global fetch without an injected fetcher",
  );
  check(
    result.transport.pricingRows === 1,
    "default transport reads current pricing schema in workerd",
  );
  check(
    result.transport.fileRegistered,
    "default transport registers and PUTs source bytes in workerd",
  );
  check(
    result.transport.taskStatus === "success",
    "default transport reads task status in workerd",
  );
  check(
    result.transport.imageType === "image/png" &&
      result.transport.imageBytes === 120,
    "default transport safely downloads bounded output bytes",
  );
  check(
    result.skin.pricingRows === 1 &&
      result.skin.taskCreated &&
      result.skin.status === "success",
    "actual PerfectCorpProvider default fetch completes registration/upload/task/status fixture",
  );
  check(
    result.hair.pricingRows === 1 &&
      result.hair.taskCreated &&
      result.hair.status === "success" &&
      result.hair.imageBytes === 120,
    "actual hairstyle adapter default fetch completes task/status/image fixture",
  );
  check(
    result.clothing.taskCreated && result.clothing.status === "success",
    "actual cloth-v4 adapter default fetch completes two uploads/task/status fixture",
  );
  const taskCalls = calls.filter(
    (c) => c.method === "POST" && Object.values(taskPaths).includes(c.path),
  );
  check(
    taskCalls.length === 3,
    "exactly three scripted task POSTs and zero real provider calls",
  );
  check(
    taskCalls
      .find((c) => c.path === taskPaths.skin)
      .body.dst_actions.join(",") === "texture",
    "skin creation retains the real documented action body",
  );
  check(
    taskCalls.find((c) => c.path === taskPaths.hair).body.template_id ===
      "fixture-bob",
    "hairstyle creation retains the actual template body",
  );
  check(
    taskCalls.find((c) => c.path === taskPaths.clothing).body
      .garment_category === "upper_body",
    "clothing creation retains the upper_body category",
  );
  check(
    calls
      .filter((c) => c.host === "allowlisted-media")
      .every((c) => !c.hasAuthorization),
    "bearer never reaches upload or image hosts",
  );
  const hashes = {};
  for (const file of [
    "apps/api/src/youcamTransport.ts",
    "apps/api/src/youcamSkinProvider.ts",
    "apps/api/src/generationProvider.ts",
  ])
    hashes[file] = createHash("sha256")
      .update(await readFile(resolve(file)))
      .digest("hex");
  const evidence = {
    executedAt: new Date().toISOString(),
    runtime:
      "actual local workerd via Miniflare " +
      require("miniflare/package.json").version,
    scope:
      "production DEFAULT-fetch runtime regression, local outboundService scripted fixtures only; not live provider or hosted deployment proof",
    externalNetworkRequests: 0,
    realProviderCalls: 0,
    paidCredits: 0,
    personalImages: 0,
    injectedProviderFetch: false,
    scriptedTaskPostRequests: taskCalls.length,
    outboundFixtureRequests: calls.length,
    sourceHashes: hashes,
    assertionsPassed: assertions.length,
    assertions,
  };
  await mkdir(resolve("apps/edge/evidence"), { recursive: true });
  await writeFile(
    resolve("apps/edge/evidence/youcam-default-fetch-workerd.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await mf.dispose();
}
