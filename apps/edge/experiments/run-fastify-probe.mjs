import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const tooling = process.argv[2];
if (!tooling)
  throw new Error(
    "Pass the absolute isolated tooling directory, containing wrangler/miniflare/esbuild.",
  );
const require = createRequire(resolve(tooling, "package.json")),
  { Miniflare } = require("miniflare"),
  esbuild = require("esbuild");
const output = resolve(tooling, "probe-build");
await mkdir(output, { recursive: true });
const results = [],
  runtimeWarnings = [];
process.on("unhandledRejection", (error) =>
  runtimeWarnings.push(String(error)),
);
for (const kind of ["node-http", "fastify-inject", "fastify-http"]) {
  const outfile = resolve(output, kind + ".mjs");
  let mf;
  try {
    const build = await esbuild.build({
      entryPoints: [resolve("apps/edge/experiments/" + kind + ".mjs")],
      outfile,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "es2022",
      external: ["node:*", "cloudflare:*"],
      banner: {
        js: "import { createRequire as __edgeCreateRequire } from 'node:module';const require=__edgeCreateRequire('/index.mjs');",
      },
      metafile: true,
    });
    mf = new Miniflare({
      workers: [
        {
          config: {
            name: kind,
            compatibilityDate: "2026-11-01",
            compatibilityFlags: ["nodejs_compat"],
            manifest: {
              mainModule: "index.mjs",
              modulesRoot: "/",
              modules: {
                "index.mjs": {
                  type: "esm",
                  contents: await readFile(outfile, "utf8"),
                },
              },
            },
          },
        },
      ],
      cf: false,
    });
    const started = performance.now(),
      health = await mf.dispatchFetch("http://example.test/health"),
      body = await health.text(),
      coldMs = performance.now() - started;
    const echo = await mf.dispatchFetch("http://example.test/echo", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-probe": "fixture-header",
      },
      body: JSON.stringify({ fixture: "actual-worker-http", number: 7 }),
    });
    const timings = [];
    for (let i = 0; health.status === 200 && i < 20; i++) {
      const t = performance.now(),
        r = await mf.dispatchFetch("http://example.test/health");
      await r.text();
      timings.push(performance.now() - t);
    }
    results.push({
      kind,
      status: health.status,
      body,
      echoStatus: echo.status,
      echoBody: await echo.text(),
      coldMs,
      warmMedianMs: timings.length ? timings.sort((a, b) => a - b)[10] : null,
      bundleBytes:
        build.metafile.outputs[outfile]?.bytes ??
        Object.values(build.metafile.outputs)[0]?.bytes,
    });
  } catch (error) {
    results.push({
      kind,
      error: String(error),
      stack: error.stack?.split("\n").slice(0, 8),
    });
  } finally {
    await mf?.dispose().catch((error) => runtimeWarnings.push(String(error)));
  }
}
await mkdir(resolve("apps/edge/evidence"), { recursive: true });
await writeFile(
  resolve("apps/edge/evidence/fastify-workerd.json"),
  JSON.stringify(
    {
      recordedAt: new Date().toISOString(),
      node: process.version,
      actualFastify: createRequire(resolve("package.json"))(
        "fastify/package.json",
      ).version,
      actualRouter: createRequire(resolve("package.json"))(
        "find-my-way/package.json",
      ).version,
      wrangler: require("wrangler/package.json").version,
      miniflare: require("miniflare/package.json").version,
      results,
      runtimeWarnings,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
