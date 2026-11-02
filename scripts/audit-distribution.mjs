import { readFile, access, mkdir, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const project =
    process.env.TRUE_BEAUTY_AUDIT_ROOT ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  output = process.argv[2] ?? "cook/evidence/rights-r06/local-inventory.json";
const read = async (name) => readFile(path.join(project, name));
const sha = (data) => createHash("sha256").update(data).digest("hex");
const exists = async (name) =>
  access(path.join(project, name)).then(
    () => true,
    () => false,
  );
const manifest = JSON.parse(await read("apps/web/public/models/manifest.json")),
  proof = JSON.parse(
    await read("cook/evidence/rights-r06/public-source-evidence.json"),
  );
const receipts = new Map(proof.sources.map((s) => [s.id, s]));
const models = await Promise.all(
  manifest.map(async (item) => {
    const local = `apps/web/public/models/${item.name}`,
      present = await exists(local),
      actual = present ? sha(await read(local)) : null,
      cards = (proof.modelCardMappings[item.name] ?? []).map((id) =>
        receipts.get(id),
      );
    const officialSource =
      new URL(item.url).hostname === "storage.googleapis.com" &&
      item.url.includes("/mediapipe-models/") &&
      /\/(float16|float32)\/\d+\//.test(item.url);
    const explicitLicense =
      cards.length > 0 &&
      cards.every(
        (c) =>
          c?.status === 200 &&
          c.modelLicenceQuote?.includes("Apache License, Version 2.0") &&
          /^[a-f0-9]{64}$/.test(c.sha256),
      );
    return {
      name: item.name,
      url: item.url,
      present,
      expectedSha256: item.sha256,
      actualSha256: actual,
      hashMatches: present ? actual === item.sha256 : null,
      officialSource,
      modelCardLicense: explicitLicense
        ? "Apache-2.0-documented"
        : "unverified",
      cards: cards.filter(Boolean).map((c) => ({
        url: c.url,
        sha256: c.sha256,
        quote: c.modelLicenceQuote,
      })),
      status:
        !present ||
        !officialSource ||
        !explicitLicense ||
        (present && actual !== item.sha256)
          ? "needs-review"
          : "documented-license-and-source",
    };
  }),
);
const notices = [
  ["OpenMakeupSDK", "packages/shader-library/LICENSE.OpenMakeupSDK", "MIT"],
  ["SKIN_AI", "packages/skin-engine/LICENSE.MIROIR", "MIT"],
  ["Skyn", "packages/skin-engine/LICENSE.SKYN", "MIT"],
  [
    "Virtual Makeup declaration",
    "packages/vision-core/THIRD_PARTY_NOTICE.md",
    "MIT declaration only",
  ],
  ["Model Apache2 text", "docs/rights/Apache-2.0.txt", "Apache-2.0"],
  [
    "Model attribution",
    "docs/rights/MEDIAPIPE_MODELS_NOTICE.md",
    "Attribution",
  ],
  [
    "Distributed model Apache2 text",
    "apps/web/public/models/LICENSE",
    "Apache-2.0",
  ],
  [
    "Distributed model attribution",
    "apps/web/public/models/NOTICE.md",
    "Attribution",
  ],
  ["DM Sans", "apps/web/public/fonts/dmsans-OFL.txt", "OFL-1.1"],
  [
    "DM Serif Display",
    "apps/web/public/fonts/dmserifdisplay-OFL.txt",
    "OFL-1.1",
  ],
];
const retainedNotices = await Promise.all(
  notices.map(async ([component, file, declaredLicense]) => {
    const present = await exists(file),
      bytes = present ? await read(file) : null;
    const content = bytes?.toString("utf8") ?? "";
    const required = {
      MIT: [
        /Copyright/i,
        /Permission is hereby granted/,
        /THE SOFTWARE IS PROVIDED "AS IS"/,
      ],
      "OFL-1.1": [
        /Copyright/i,
        /SIL OPEN FONT LICENSE Version 1\.1/,
        /DISCLAIMER/,
      ],
      "Apache-2.0": [
        /Apache License/,
        /Version 2\.0/,
        /END OF TERMS AND CONDITIONS/,
      ],
      Attribution: [
        /Google/,
        /Apache License, Version 2\.0/,
        /BlazeFace/,
        /Hair Segmenter|hair_segmenter/,
        /BlazePose/,
      ],
      "MIT declaration only": [
        /otdnnc\/virtual-makeup/,
        /1d6ed5ef2b1c947dcbc144fa9fde2a26b6745fc1/,
        /standalone LICENSE file is absent/,
      ],
    }[declaredLicense];
    const contentValid =
      present && required.every((pattern) => pattern.test(content));
    return {
      component,
      file,
      declaredLicense,
      present,
      contentValid,
      sha256: bytes ? sha(bytes) : null,
    };
  }),
);
const pkg = JSON.parse(await read("package.json")),
  directDependencies = await Promise.all(
    Object.keys(pkg.dependencies ?? {}).map(async (name) => {
      const metadata = JSON.parse(
        await read(`node_modules/${name}/package.json`),
      );
      return {
        name,
        version: metadata.version,
        declaredSpdx: metadata.license ?? "unreported",
        scope:
          "package metadata only; bundled/transitive/model/assets rights separate",
      };
    }),
  );
const fonts = await Promise.all(
  (await readdir(path.join(project, "apps/web/public/fonts")))
    .filter((name) => /\.(ttf|woff2)$/.test(name))
    .map(async (name) => ({
      name,
      sha256: sha(await read(`apps/web/public/fonts/${name}`)),
    })),
);
const issues = [
  ...models
    .filter((m) => m.status === "needs-review")
    .map((m) => `Model evidence/hash needs review: ${m.name}`),
  ...retainedNotices
    .filter((n) => !n.contentValid)
    .map((n) => `Missing or incomplete retained notice: ${n.component}`),
  "Virtual Makeup: full MIT copyright/permission notice not recovered; README declaration and attribution remain the available evidence.",
  "Demo portraits: photographer/model-release/personality-right review remains incomplete; no commercial endorsement or release is asserted.",
  "Direct dependency SPDX metadata is not a complete transitive/bundled dependency legal audit.",
];
const report = {
  generatedAt: new Date().toISOString(),
  kind: "technical-rights-inventory-not-legal-clearance",
  distributionClearance: "blocked-with-evidence",
  models,
  retainedNotices,
  fonts,
  directDependencies,
  issues,
};
await mkdir(path.dirname(path.join(project, output)), { recursive: true });
await writeFile(path.join(project, output), JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      models: models.length,
      documentedModelLicenses: models.filter(
        (m) => m.status === "documented-license-and-source",
      ).length,
      retainedNotices: retainedNotices.length,
      missingNotices: retainedNotices
        .filter((n) => !n.contentValid)
        .map((n) => n.file),
      distributionClearance: report.distributionClearance,
      output,
    },
    null,
    2,
  ),
);
if (
  models.some((m) => m.status === "needs-review") ||
  retainedNotices.some((n) => !n.contentValid)
)
  process.exitCode = 1;
