import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const tooling = process.argv[2];
if (!tooling) throw new Error("Pass an absolute isolated tooling directory.");
const root = process.cwd();
const requireTool = createRequire(resolve(tooling, "package.json"));
const requirePlugin = createRequire(
  resolve(tooling, "node_modules/@cloudflare/vite-plugin/dist/index.mjs"),
);
const fixture = resolve(tooling, "hosting-r07-fixture");
const { createBuilder } = await import(
  pathToFileURL(requireTool.resolve("vite"))
);
const { cloudflare } = await import(
  pathToFileURL(
    resolve(tooling, "node_modules/@cloudflare/vite-plugin/dist/index.mjs"),
  )
);
const { build: esbuild } = requireTool("esbuild");

async function command(args, cwd = fixture) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_CF_FETCH_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const exitCode = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", accept);
  });
  if (exitCode) throw new Error(`Command exited ${exitCode}: ${output}`);
  return output;
}

await rm(fixture, { recursive: true, force: true });
await mkdir(resolve(fixture, ".openai"), { recursive: true });
await mkdir(resolve(fixture, "public"), { recursive: true });
await writeFile(
  resolve(fixture, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
await writeFile(
  resolve(fixture, ".openai/hosting.json"),
  JSON.stringify(
    {
      project_id: "fixture-local-only-not-a-site",
      d1: "DB",
      r2: null,
    },
    null,
    2,
  ),
);
await writeFile(
  resolve(fixture, "index.html"),
  '<!doctype html><html><head><title>Actual Worker SPA fixture</title></head><body><main id="fixture">True Beauty local hosting fixture</main><script type="module" src="/client.js"></script></body></html>',
);
await writeFile(
  resolve(fixture, "client.js"),
  'document.querySelector("main").dataset.loaded="yes";',
);
await writeFile(
  resolve(fixture, "public/representative.svg"),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#b05b6c" d="M0 0h10v10H0z"/></svg>',
);
await writeFile(
  resolve(fixture, "worker.js"),
  `export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/fixture") {
    const record = await env.DB.prepare("SELECT name FROM fixture_records WHERE id = ?").bind("one").first();
    return Response.json({ runtime: "workerd", record: record?.name ?? null });
  }
  if (url.pathname.startsWith("/api/")) return Response.json({ error: "Unknown API route" }, { status: 404 });
  return env.ASSETS.fetch(request);
} };`,
);
await writeFile(
  resolve(fixture, "schema.ts"),
  `import { sqliteTable, text } from "drizzle-orm/sqlite-core";
export const fixtureRecords = sqliteTable("fixture_records", {
  id: text("id").primaryKey(), name: text("name").notNull(),
});`,
);
await writeFile(
  resolve(fixture, "drizzle.config.ts"),
  'export default { out: "./drizzle", schema: "./schema.ts", dialect: "sqlite" };',
);
await command([
  resolve(tooling, "node_modules/drizzle-kit/bin.cjs"),
  "generate",
  "--config",
  "drizzle.config.ts",
]);
const pluginFile = resolve(fixture, "sites-vite-plugin.mjs");
await esbuild({
  entryPoints: [resolve(root, "apps/edge/build/sites-vite-plugin.ts")],
  outfile: pluginFile,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const { sites } = await import(pathToFileURL(pluginFile));
const builder = await createBuilder({
  configFile: false,
  root: fixture,
  plugins: [
    sites({ mockAuth: false }),
    cloudflare({
      viteEnvironment: { name: "server" },
      inspectorPort: false,
      config: {
        name: "true-beauty-r07-local-fixture",
        main: "./worker.js",
        compatibility_date: "2026-05-15",
        compatibility_flags: ["nodejs_compat"],
        assets: {
          binding: "ASSETS",
          not_found_handling: "single-page-application",
          run_worker_first: ["/api/*"],
        },
        d1_databases: [
          {
            binding: "DB",
            database_name: "fixture",
            database_id: "00000000-0000-4000-8000-000000000000",
          },
        ],
      },
    }),
  ],
});
await builder.buildApp();
const workerConfigPath = resolve(fixture, "dist/server/wrangler.json");
const workerConfig = JSON.parse(await readFile(workerConfigPath, "utf8"));
assert.equal(workerConfig.assets.binding, "ASSETS");
assert.equal(workerConfig.assets.directory, "../client");
assert.equal(workerConfig.d1_databases[0].binding, "DB");
const journal = JSON.parse(
  await readFile(
    resolve(fixture, "dist/.openai/drizzle/meta/_journal.json"),
    "utf8",
  ),
);
assert.equal(journal.entries.length, 1);
await readFile(
  resolve(fixture, "dist/.openai/drizzle/meta/0000_snapshot.json"),
  "utf8",
);
const migrationPath = resolve(
  fixture,
  "dist/.openai/drizzle",
  journal.entries[0].tag + ".sql",
);
// Use the build integration's pinned Wrangler; newer unrelated tooling can
// reject configuration fields emitted by an older integration.
const wrangler = resolve(
  requirePlugin.resolve("wrangler/package.json"),
  "../bin/wrangler.js",
);
await command([
  wrangler,
  "d1",
  "execute",
  "DB",
  "--local",
  "--config",
  workerConfigPath,
  "--persist-to",
  resolve(fixture, ".wrangler/state"),
  "--file",
  migrationPath,
]);
await command([
  wrangler,
  "d1",
  "execute",
  "DB",
  "--local",
  "--config",
  workerConfigPath,
  "--persist-to",
  resolve(fixture, ".wrangler/state"),
  "--command",
  "INSERT INTO fixture_records(id, name) VALUES ('one', 'durable-fixture');",
]);
const port = 43971;
const child = spawn(
  process.execPath,
  [
    wrangler,
    "dev",
    "--local",
    "--config",
    workerConfigPath,
    "--persist-to",
    resolve(fixture, ".wrangler/state"),
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--inspector-port",
    "0",
    "--no-show-interactive-dev-session",
  ],
  {
    cwd: fixture,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_CF_FETCH_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let runtimeOutput = "";
child.stdout.on("data", (data) => {
  runtimeOutput += data;
});
child.stderr.on("data", (data) => {
  runtimeOutput += data;
});
try {
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  let api;
  while (Date.now() < deadline) {
    try {
      api = await fetch(origin + "/api/fixture");
      if (api.ok) break;
    } catch {
      /* wait for workerd startup */
    }
    if (child.exitCode !== null) throw new Error(runtimeOutput);
    await new Promise((accept) => setTimeout(accept, 100));
  }
  assert.ok(api?.ok, runtimeOutput);
  assert.deepEqual(await api.json(), {
    runtime: "workerd",
    record: "durable-fixture",
  });
  const asset = await fetch(origin + "/representative.svg");
  assert.equal(asset.status, 200);
  const assetText = await asset.text();
  assert.match(assetText, /#b05b6c/);
  const deepLink = await fetch(origin + "/mirror/saved-look", {
    headers: { Accept: "text/html", "Sec-Fetch-Mode": "navigate" },
  });
  assert.equal(deepLink.status, 200);
  assert.match(await deepLink.text(), /True Beauty local hosting fixture/);
  const missingApi = await fetch(origin + "/api/unknown", {
    headers: { Accept: "text/html" },
  });
  assert.equal(missingApi.status, 404);
  assert.match(missingApi.headers.get("content-type"), /application\/json/);
  const report = {
    recordedAt: new Date().toISOString(),
    runtime: "Wrangler local actual workerd",
    paidProviderCalls: 0,
    tools: {
      vite: requireTool("vite/package.json").version,
      cloudflareVitePlugin: JSON.parse(
        await readFile(
          resolve(tooling, "node_modules/@cloudflare/vite-plugin/package.json"),
          "utf8",
        ),
      ).version,
      wrangler: requirePlugin("wrangler/package.json").version,
      drizzleKit: JSON.parse(
        await readFile(
          resolve(tooling, "node_modules/drizzle-kit/package.json"),
          "utf8",
        ),
      ).version,
    },
    assertionsPassed: 10,
    assertions: [
      "Generated ASSETS binding",
      "Generated ../client assets directory",
      "Generated DB binding",
      "Schema journal and snapshot copied by sites()",
      "Schema migration executed through Wrangler local D1",
      "Worker API reads migrated D1",
      "Representative SVG served by assets",
      "SPA deep link returns index",
      "Unknown API returns 404",
      "Unknown API remains JSON",
    ],
    artifact: {
      workerEntry: `dist/server/${workerConfig.main}`,
      workerConfig: "dist/server/wrangler.json",
      assets: "dist/client",
      hosting: "dist/.openai/hosting.json",
      migrations: "dist/.openai/drizzle",
      assetsConfig: workerConfig.assets,
      d1: workerConfig.d1_databases,
    },
    schemaJournal: journal,
    representativeAssetSHA256: createHash("sha256")
      .update(assetText)
      .digest("hex"),
  };
  await writeFile(
    resolve(root, "apps/edge/build/hosting-workerd-evidence.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  child.kill("SIGTERM");
  await new Promise((accept) => {
    if (child.exitCode !== null) accept();
    else child.once("exit", accept);
  });
}
