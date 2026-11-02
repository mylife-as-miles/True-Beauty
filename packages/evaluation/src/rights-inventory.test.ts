import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "true-beauty-rights-test-"));
  temporary.push(dir);
  const put = async (file: string, content: string) => {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), content);
  };
  const files = [
    "packages/shader-library/LICENSE.OpenMakeupSDK",
    "packages/skin-engine/LICENSE.MIROIR",
    "packages/skin-engine/LICENSE.SKYN",
    "packages/vision-core/THIRD_PARTY_NOTICE.md",
    "docs/rights/Apache-2.0.txt",
    "docs/rights/MEDIAPIPE_MODELS_NOTICE.md",
    "apps/web/public/models/LICENSE",
    "apps/web/public/models/NOTICE.md",
    "apps/web/public/fonts/dmsans-OFL.txt",
    "apps/web/public/fonts/dmserifdisplay-OFL.txt",
  ];
  for (const file of files) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await copyFile(path.join(root, file), path.join(dir, file));
  }
  const artifact =
    "Synthetic test bytes. This is not a model or model-license receipt.";
  await put("apps/web/public/models/fixture.task", artifact);
  await put(
    "apps/web/public/models/manifest.json",
    JSON.stringify([
      {
        name: "fixture.task",
        url: "https://storage.googleapis.com/mediapipe-models/fixture/fixture/float16/1/fixture.task",
        sha256: createHash("sha256").update(artifact).digest("hex"),
      },
    ]),
  );
  await put(
    "cook/evidence/rights-r06/public-source-evidence.json",
    JSON.stringify({
      sources: [
        {
          id: "synthetic-card",
          status: 200,
          sha256: "a".repeat(64),
          url: "https://example.invalid/synthetic-card",
          modelLicenceQuote: "Synthetic fixture: Apache License, Version 2.0",
        },
      ],
      modelCardMappings: { "fixture.task": ["synthetic-card"] },
    }),
  );
  await put("package.json", JSON.stringify({ dependencies: {} }));
  const run = async () => {
    const result = spawnSync(
      process.execPath,
      [path.join(root, "scripts/audit-distribution.mjs"), "report.json"],
      {
        env: { ...process.env, TRUE_BEAUTY_AUDIT_ROOT: dir },
        encoding: "utf8",
      },
    );
    if (result.error) throw result.error;
    return {
      code: result.status,
      report: JSON.parse(await readFile(path.join(dir, "report.json"), "utf8")),
    };
  };
  return { dir, put, run };
}
describe("distribution inventory failure modes", () => {
  it("never converts a technically passing inventory into legal clearance", async () => {
    const { run } = await fixture();
    const result = await run();
    expect(result.code).toBe(0);
    expect(result.report.distributionClearance).toBe("blocked-with-evidence");
    expect(
      result.report.retainedNotices.every(
        (n: { contentValid: boolean }) => n.contentValid,
      ),
    ).toBe(true);
  });
  it("rejects missing or hash-mismatched artifacts instead of awarding documented status", async () => {
    const { dir, put, run } = await fixture();
    await put("apps/web/public/models/fixture.task", "corrupted");
    expect((await run()).code).toBe(1);
    await rm(path.join(dir, "apps/web/public/models/fixture.task"));
    const missing = await run();
    expect(missing.code).toBe(1);
    expect(missing.report.models[0]).toMatchObject({
      present: false,
      status: "needs-review",
    });
  });
  it("rejects an empty named license file rather than testing its filename only", async () => {
    const { put, run } = await fixture();
    await put("packages/shader-library/LICENSE.OpenMakeupSDK", "MIT");
    const result = await run();
    expect(result.code).toBe(1);
    expect(result.report.retainedNotices[0]).toMatchObject({
      present: true,
      contentValid: false,
    });
  });
});
