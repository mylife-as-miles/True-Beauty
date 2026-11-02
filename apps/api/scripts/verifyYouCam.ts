/** Genuine local-API receipt runner. Accepts NO provider key; requires explicit synthetic-fixture/rights flags.
 * No paid retry. Quotes chosen operations and enforces their combined ceiling before any upload. */
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
} from "node:fs";
import { resolve, basename, join } from "node:path";
import { createHash } from "node:crypto";
import { imageBytes, SkinTaskRequest } from "../src/contracts";
import {
  skinProviderFailure,
  type SkinProviderFailure,
} from "../src/skinProviderFailure";
import {
  ClothingSpec,
  PROVIDER_RETENTION_DAYS,
  PROVIDER_RETENTION_SOURCE,
  type GenerationSpec,
} from "../src/generationContracts";
const args = new Map<string, string>();
const flags = new Set([
  "--help",
  "--rights-confirmed",
  "--synthetic",
  "--skin-only",
  "--clothing-only",
]);
const valuedOptions = new Set([
  "--api",
  "--portrait",
  "--person",
  "--hair-ref",
  "--hair-template",
  "--garment",
  "--garment-category",
  "--max-credits",
  "--output",
  "--origin",
  "--skin-actions",
]);
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (!flags.has(key) && !valuedOptions.has(key))
    throw new Error(
      "Unknown receipt-runner option. Use --help for accepted arguments.",
    );
  if (args.has(key)) throw new Error("Duplicate receipt-runner option.");
  const next = process.argv[i + 1];
  if (flags.has(key)) {
    if (next && !next.startsWith("--"))
      throw new Error("Consent and help flags do not accept values.");
    args.set(key, "true");
  } else if (next && !next.startsWith("--")) {
    args.set(key, next);
    i++;
  } else throw new Error("A named option is missing its required value.");
}
const required = (key: string) => {
  const value = args.get(key);
  if (!value || value === "true") throw new Error(`Required argument: ${key}`);
  return value;
};
if (args.has("--help")) {
  console.log(
    "npx tsx apps/api/scripts/verifyYouCam.ts --api http://127.0.0.1:3001 --portrait PATH --person PATH (--hair-template ID | --hair-ref PATH) --garment PATH --max-credits 13 --rights-confirmed --synthetic --output DIRECTORY",
  );
  console.log(
    "Uses the local server session. Provider keys must stay in its configured secret boundary. Quotes before upload; no automatic paid retries.",
  );
  console.log(
    "Skin only: --skin-only --portrait PATH --max-credits 9 --rights-confirmed --synthetic --output NEW_DIRECTORY (no person, garment or hairstyle options).",
  );
  console.log(
    "Clothing only: --clothing-only --person PATH --garment PATH --garment-category upper_body --max-credits 2 --rights-confirmed --synthetic --output NEW_DIRECTORY.",
  );
  process.exit(0);
}
const base = new URL(args.get("--api") ?? "http://127.0.0.1:3001");
if (
  !["http:", "https:"].includes(base.protocol) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
  base.username ||
  base.password ||
  base.search ||
  base.hash ||
  base.pathname !== "/"
)
  throw new Error(
    "The receipt runner only accepts an explicit loopback API origin.",
  );
if (!args.has("--rights-confirmed") || !args.has("--synthetic"))
  throw new Error(
    "Original synthetic fixtures with explicit permission are required. Do not use an unverified stock portrait or private image.",
  );
const skinOnly = args.has("--skin-only"),
  clothingOnly = args.has("--clothing-only");
if (skinOnly && clothingOnly)
  throw new Error("Choose one explicit single-feature mode.");
const maximum = Number(
  args.get("--max-credits") ?? (skinOnly ? 9 : clothingOnly ? 2 : 13),
);
if (!Number.isFinite(maximum) || maximum <= 0 || maximum > 100)
  throw new Error(
    "This verification runner requires a ceiling greater than zero and no more than 100 credits.",
  );
if (
  skinOnly &&
  [
    "--hair-template",
    "--hair-ref",
    "--person",
    "--garment",
    "--garment-category",
  ].some((key) => args.has(key))
)
  throw new Error(
    "Skin-only mode does not accept generation image or hairstyle options.",
  );
if (
  clothingOnly &&
  ["--portrait", "--hair-template", "--hair-ref", "--skin-actions"].some(
    (key) => args.has(key),
  )
)
  throw new Error(
    "Clothing-only mode does not accept skin or hairstyle options.",
  );
if (
  !skinOnly &&
  !clothingOnly &&
  args.has("--hair-template") === args.has("--hair-ref")
)
  throw new Error("Choose exactly one --hair-template or --hair-ref.");
const hairTemplate = args.get("--hair-template");
if (hairTemplate && !/^[\w.:-]{1,200}$/.test(hairTemplate))
  throw new Error("Invalid hairstyle template identifier.");
const categoryResult = ClothingSpec.shape.garmentCategory.safeParse(
  args.get("--garment-category") ?? "upper_body",
);
if (!categoryResult.success)
  throw new Error(
    "Invalid --garment-category; use upper_body, lower_body, full_body, shoes, auto or outer.",
  );
const output = resolve(required("--output")),
  receiptPath = join(output, "receipt.json");
if (existsSync(receiptPath))
  throw new Error(
    "A receipt already exists here. Review its charge state before explicitly choosing a new output directory.",
  );
const inputs = Object.fromEntries(
  (skinOnly
    ? ["portrait"]
    : clothingOnly
      ? ["person", "garment"]
      : ["portrait", "person", "garment", ...(hairTemplate ? [] : ["hair-ref"])]
  ).map((name) => {
    const path = resolve(required("--" + name)),
      bytes = readFileSync(path),
      mime = bytes[0] === 137 ? "image/png" : "image/jpeg";
    imageBytes(bytes.toString("base64"), mime);
    return [
      name,
      {
        name: basename(path),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        base64: bytes.toString("base64"),
        contentType: mime as "image/png" | "image/jpeg",
      },
    ];
  }),
);
mkdirSync(output, { recursive: true, mode: 0o700 });
interface Operation {
  feature: "skin" | "hair" | "clothing";
  quoteId?: string;
  quotedCredits?: number;
  taskId?: string;
  status: string;
  result?: unknown;
  error?: string;
  outputFile?: string;
  providerFailure?: SkinProviderFailure;
}
const features: Operation["feature"][] = skinOnly
  ? ["skin"]
  : clothingOnly
    ? ["clothing"]
    : ["skin", "hair", "clothing"];
const operations: Operation[] = features.map((feature) => ({
  feature,
  status: "not-started",
}));
const receipt: Record<string, unknown> = {
  format: "true-beauty-live-provider-receipt",
  version: 1,
  mode: skinOnly
    ? "skin-only"
    : clothingOnly
      ? "clothing-only"
      : "complete-synthetic-batch",
  startedAt: new Date().toISOString(),
  fixtureDeclaration:
    "Operator-declared original synthetic fixtures; not patient data or a clinical validation dataset.",
  sourceFiles: Object.fromEntries(
    Object.entries(inputs).map(([name, file]) => [
      name,
      { name: file.name, sha256: file.sha256 },
    ]),
  ),
  spendAuthorizationCeiling: maximum,
  quotedTotal: null,
  actualBilledCredits: null,
  billingVerified: false,
  providerRetentionDays: PROVIDER_RETENTION_DAYS,
  retentionSource: PROVIDER_RETENTION_SOURCE,
  operations,
};
const persist = () => {
  writeFileSync(receiptPath + ".tmp", JSON.stringify(receipt, null, 2), {
    mode: 0o600,
  });
  renameSync(receiptPath + ".tmp", receiptPath);
};
persist();
const origin = args.get("--origin") ?? "http://localhost:5173";
let cookie = "",
  csrf = "";
async function request(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method === "GET"
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let value: Record<string, any>;
  try {
    value = await response.json();
  } catch {
    throw new Error(
      `Local API response was not JSON (HTTP ${response.status}).`,
    );
  }
  if (!response.ok) {
    const message =
      typeof value.error === "string"
        ? value.error
        : "Local API request rejected";
    throw new Error(
      `${path.split("/").slice(0, 4).join("/")} HTTP ${response.status}: ${message.replace(/https?:\/\/\S+/g, "[URL redacted]")}`,
    );
  }
  return value;
}
const image = (key: string) => ({
  base64: inputs[key].base64,
  contentType: inputs[key].contentType,
});
const hairSpec: GenerationSpec = {
    feature: "hair",
    hairColor: "src",
    ...(hairTemplate ? { templateId: hairTemplate } : {}),
  },
  clothingSpec: GenerationSpec = {
    feature: "clothing",
    garmentCategory: categoryResult.data,
    changeShoes: false,
    filterMultiPerson: "strict",
  };
const skinActions = (
  args.get("--skin-actions") ?? "texture,pore,redness,moisture"
).split(",");
receipt.requestedSpecs = {
  ...(!clothingOnly ? { skinActions } : {}),
  ...(!skinOnly && !clothingOnly ? { hair: hairSpec } : {}),
  ...(!skinOnly ? { clothing: clothingSpec } : {}),
};
persist();
async function run() {
  const opened = await request("/api/session");
  if (typeof opened.csrfToken !== "string" || !cookie)
    throw new Error("The local API session did not open.");
  csrf = opened.csrfToken;
  // Metadata only: nothing is uploaded and no analysis/generation is created here.
  const quotes = await Promise.all(
    operations.map((op) =>
      op.feature === "skin"
        ? request("/api/skin/quotes", { actions: skinActions })
        : request("/api/generation/quotes", {
            spec: op.feature === "hair" ? hairSpec : clothingSpec,
          }),
    ),
  );
  const costs = quotes.map((q) => q.credits);
  if (costs.some((n) => typeof n !== "number" || !Number.isFinite(n) || n <= 0))
    throw new Error(
      "An actual provider quote did not contain a valid credit amount.",
    );
  const total = costs.reduce((a, b) => a + b, 0);
  receipt.quotedTotal = total;
  operations.forEach((op, i) => {
    op.quoteId = quotes[i].quoteId;
    op.quotedCredits = costs[i];
    op.status = "quoted";
  });
  persist();
  if (total > maximum)
    throw new Error(
      `Combined current quotes require ${total} credits, above the authorized ${maximum}. No image was uploaded.`,
    );
  console.log(
    `Verified quotes: ${operations.map((op, i) => op.feature + " " + costs[i]).join(", ")}; combined ${total} <= ${maximum}.`,
  );
  const skinConsent: Record<string, true> = {
    uploadImage: true,
    externalProcessing: true,
    providerRetentionAcknowledged: true,
  };
  if ("rightsConfirmed" in SkinTaskRequest.shape.consent.shape)
    skinConsent.rightsConfirmed = true;
  const bodies = operations.map((op, i) =>
    op.feature === "skin"
      ? {
          quoteId: quotes[i].quoteId,
          imageBase64: inputs.portrait.base64,
          contentType: inputs.portrait.contentType,
          actions: skinActions,
          maxCredits: costs[i],
          consent: skinConsent,
        }
      : {
          quoteId: quotes[i].quoteId,
          spec: op.feature === "hair" ? hairSpec : clothingSpec,
          source: image(op.feature === "hair" ? "portrait" : "person"),
          ...(op.feature === "clothing"
            ? { reference: image("garment") }
            : hairTemplate
              ? {}
              : { reference: image("hair-ref") }),
          maxCredits: costs[i],
          consent: {
            uploadImages: true,
            rightsConfirmed: true,
            externalProcessing: true,
            providerRetentionAcknowledged: true,
          },
        },
  );
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    op.status = "submitting-once";
    persist();
    try {
      const response = await request(
        op.feature === "skin" ? "/api/skin/tasks" : "/api/generation/tasks",
        bodies[i],
      );
      if (typeof response.taskId !== "string")
        throw new Error("The task response did not contain a task identifier.");
      op.taskId = response.taskId;
      op.status = response.status;
      if (typeof response.error === "string")
        op.error = response.error.replace(/https?:\/\/\S+/g, "[URL redacted]");
      if (op.feature === "skin" && response.providerFailure)
        op.providerFailure = skinProviderFailure({
          error: response.providerFailure.code,
        });
      persist();
      console.log(`${op.feature}: ${op.status}`);
    } catch (error) {
      op.status = "submission-uncertain";
      op.error = error instanceof Error ? error.message : "Submission failed";
      persist();
      throw new Error(
        "A submission did not complete unambiguously. No automatic charged retry will run; inspect the receipt and provider account.",
      );
    }
  }
  const deadline = Date.now() + 10 * 60000;
  while (
    operations.some((op) =>
      ["uploading", "creating", "running"].includes(op.status),
    ) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    for (const op of operations) {
      if (
        !op.taskId ||
        !["uploading", "creating", "running"].includes(op.status)
      )
        continue;
      try {
        const response = await request(
          `/api/${op.feature === "skin" ? "skin" : "generation"}/tasks/${encodeURIComponent(op.taskId)}`,
        );
        const previous = op.status;
        op.status = response.status;
        if (op.feature === "skin" && response.providerFailure)
          op.providerFailure = skinProviderFailure({
            error: response.providerFailure.code,
          });
        if (response.error)
          op.error = String(response.error).replace(
            /https?:\/\/\S+/g,
            "[URL redacted]",
          );
        if (op.status === "success") {
          if (op.feature === "skin") {
            const result = response.result;
            if (
              !result ||
              !Array.isArray(result.observations) ||
              result.observations.length === 0
            )
              throw new Error("No genuine skin observations were returned.");
            op.result = {
              provider: result.provider,
              capturedAt: result.capturedAt,
              overall: result.overall,
              observations: result.observations.map(
                (o: Record<string, unknown>) => ({
                  id: o.id,
                  concern: o.concern,
                  label: o.label,
                  region: o.region,
                  uiScore: o.uiScore,
                  rawScore: o.rawScore,
                  skinType: o.skinType,
                  kind: o.kind,
                  confidence: o.confidence,
                }),
              ),
              limitations: result.limitations,
            };
          } else {
            if (response.result?.kind !== "ai-generated-image")
              throw new Error(
                "The response did not contain a typed generated image result.",
              );
            const rendered = await fetch(
              new URL(
                `/api/generation/tasks/${encodeURIComponent(op.taskId)}/image`,
                base,
              ),
              {
                headers: { Origin: origin, Cookie: cookie },
                signal: AbortSignal.timeout(45000),
                redirect: "error",
              },
            );
            if (!rendered.ok)
              throw new Error(
                `Generated image retrieval failed (HTTP ${rendered.status}).`,
              );
            const mime = rendered.headers.get("content-type")?.split(";")[0];
            if (!["image/png", "image/jpeg", "image/webp"].includes(mime ?? ""))
              throw new Error("The generated response was not an image.");
            const bytes = new Uint8Array(await rendered.arrayBuffer());
            if (bytes.length > 8 * 1024 * 1024)
              throw new Error(
                "The generated output exceeded the evidence limit.",
              );
            const filename = `generated-${op.feature}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
            writeFileSync(join(output, filename), bytes, { mode: 0o600 });
            op.outputFile = filename;
            op.result = {
              kind: response.result.kind,
              provider: response.result.provider,
              feature: response.result.feature,
              receivedAt: response.result.receivedAt,
              notice: response.result.notice,
              bytes: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
            };
          }
        }
        if (previous !== op.status) console.log(`${op.feature}: ${op.status}`);
      } catch (error) {
        op.error =
          error instanceof Error
            ? error.message
            : "Status or result could not be verified";
        if (op.status === "success") op.status = "result-unverified";
        console.log(`${op.feature}: result/status not verified; no paid retry`);
      }
      persist();
    }
  }
  for (const op of operations)
    if (["uploading", "creating", "running"].includes(op.status))
      op.status = "pending-timeout";
  receipt.finishedAt = new Date().toISOString();
  receipt.allProviderTasksVerified = operations.every(
    (op) => op.status === "success",
  );
  persist();
  console.log(
    `Receipt saved. ${operations.map((op) => op.feature + ": " + op.status).join("; ")}. Actual billed credits remain unverified until checked against the provider account.`,
  );
  if (!receipt.allProviderTasksVerified) process.exitCode = 1;
}
try {
  await run();
} catch (error) {
  receipt.error =
    error instanceof Error ? error.message : "Verification stopped";
  receipt.finishedAt = new Date().toISOString();
  persist();
  console.error(String(receipt.error));
  process.exitCode = 1;
}
