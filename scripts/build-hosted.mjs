/** Build the existing Vite SPA and native API with the supported Sites adapter. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createBuilder } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile(".openai/hosting.json", "utf8"));
assert.ok(
  manifest.project_id,
  "Preserve the existing Sites project_id before building.",
);
assert.ok(
  !manifest.static,
  "Worker hosting requires removal of the source manifest's static field.",
);
assert.equal(
  manifest.d1,
  "DB",
  "The native Worker requires the logical DB binding.",
);
assert.equal(
  manifest.r2,
  null,
  "Raw inputs remain transient; this build does not use R2.",
);
await access("apps/edge/src/worker.ts");
const journal = JSON.parse(
  await readFile("drizzle/meta/_journal.json", "utf8"),
);
assert.equal(journal.dialect, "sqlite");
assert.ok(
  journal.entries.length,
  "D1 migration journal must contain the generated schema.",
);
for (const entry of journal.entries) {
  await access(`drizzle/${entry.tag}.sql`);
  await access(
    `drizzle/meta/${String(entry.idx).padStart(4, "0")}_snapshot.json`,
  );
}

// Starter plugin and Wrangler versions form one output/preview contract.
const pluginPackage = JSON.parse(
  await readFile("node_modules/@cloudflare/vite-plugin/package.json", "utf8"),
);
assert.equal(pluginPackage.version, "1.37.1");
assert.equal(require("wrangler/package.json").version, "4.92.0");

async function run(script) {
  const child = spawn(process.execPath, script, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  const code = await new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", accept);
  });
  if (code !== 0)
    throw new Error(`Build command failed (${code}): ${script.join(" ")}`);
}

await run([require.resolve("typescript/bin/tsc"), "--noEmit"]);
await run(["scripts/build-notices.mjs"]);
await rm("dist", { recursive: true, force: true });
const builder = await createBuilder({
  root,
  configFile: resolve("apps/edge/build/vite.hosted.config.mjs"),
});
await builder.buildApp();
await run(["scripts/build-offline.mjs", "dist/client"]);

const emitted = JSON.parse(await readFile("dist/server/wrangler.json", "utf8"));
assert.equal(emitted.assets?.binding, "ASSETS");
assert.equal(emitted.assets?.directory, "../client");
assert.deepEqual(emitted.assets?.run_worker_first, ["/api/*"]);
assert.ok(emitted.d1_databases?.some((database) => database.binding === "DB"));
await access(resolve("dist/server", emitted.main));
await access("dist/client/index.html");
await access("dist/client/offline-manifest.json");
assert.deepEqual(
  JSON.parse(await readFile("dist/.openai/hosting.json", "utf8")),
  manifest,
);
assert.deepEqual(
  JSON.parse(await readFile("dist/.openai/drizzle/meta/_journal.json", "utf8")),
  journal,
);
async function rejectLocalSecrets(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    assert.ok(
      !/^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)/.test(file.name),
      `Local secret file in artifact: ${file.name}`,
    );
    if (file.isDirectory())
      await rejectLocalSecrets(resolve(directory, file.name));
  }
}
await rejectLocalSecrets("dist");
console.log(
  "Sites Worker artifact verified: dist/server, dist/client, dist/.openai/hosting.json and Drizzle metadata. No deployment was performed.",
);
