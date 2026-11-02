import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tooling = process.argv[2];
if (!tooling) throw new Error("Pass the absolute isolated tooling directory.");
const require = createRequire(resolve(tooling, "package.json"));
const { Miniflare } = require("miniflare");
const esbuild = require("esbuild");
const output = resolve(tooling, "reasoning-provider-r07-fixture.mjs");
await esbuild.build({
  entryPoints: [resolve("apps/edge/experiments/reasoning-provider-fixture.ts")],
  outfile: output,
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
});
const code = await readFile(output, "utf8");
const mf = new Miniflare({
  workers: [
    {
      config: {
        name: "reasoning-provider-r07-fixture",
        domains: ["localhost"],
        compatibilityDate: "2026-11-01",
        manifest: {
          mainModule: "index.mjs",
          modulesRoot: "/",
          modules: { "index.mjs": { type: "esm", contents: code } },
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
  const worker = await mf.getWorker("reasoning-provider-r07-fixture");
  async function probe(body) {
    const response = await worker.fetch("https://localhost/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const native = await probe({});
  check(
    native.result.calls[0].id === "actual-fixture-call-31",
    "native Messages tool-use is parsed in actual workerd",
  );
  check(
    native.sent.tools[0].input_schema.properties.color.pattern ===
      "^#[0-9a-f]{6}$",
    "the actual shared tool schema converts to native input_schema in workerd",
  );
  check(
    native.calls === 1 && native.externalProviderCalls === 0,
    "one fixture dispatch and zero external provider requests",
  );
  const feedback = await probe({ feedback: true });
  check(
    feedback.sent.messages.at(-1).content[0].tool_use_id ===
      "actual-fixture-call-31" &&
      feedback.sent.messages.at(-1).content[0].is_error === true,
    "actual native tool-result ID and failed callback survive serialization",
  );
  check(
    feedback.result.calls.length === 0 &&
      feedback.result.guidance.includes("failure"),
    "failed feedback returns bounded fixture guidance without invented action success",
  );
  const compatible = await probe({ compatible: true, feedback: true });
  check(
    compatible.sent.messages.at(-1).tool_call_id === "actual-fixture-call-31" &&
      compatible.sent.store === false &&
      compatible.sent.parallel_tool_calls === false,
    "compatible feedback retains tool-call ID and disables storage/parallel calls",
  );
  const evidence = {
    executedAt: new Date().toISOString(),
    runtime: "actual local workerd via Miniflare",
    scope:
      "pure provider protocol runtime compatibility; local scripted fixture, not D1/durable-workflow/hosted/live-provider verification",
    externalProviderCalls: 0,
    personalImages: 0,
    assertions,
    passingAssertions: assertions.length,
    bundleBytes: Buffer.byteLength(code),
  };
  await writeFile(
    resolve("apps/edge/evidence/reasoning-provider-workerd.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await mf.dispose();
}
