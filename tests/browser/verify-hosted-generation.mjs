/** MANUAL GENUINE PAID UI CHECK. Never imported by the app or run by CI.
 * Only original pinned synthetic fixtures, exactly two separately approved2-credit tasks.
 * No route interception, scripted provider response, paid retry, trace or token in browser. */
import { chromium, expect } from "@playwright/test";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { openHostedOperator } from "./hosted-operator.mjs";
const SITE = "https://true-beauty-miles.myles4miles.chatgpt.site";
const root = fileURLToPath(new URL("../../", import.meta.url));
const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (
    ![
      "--help",
      "--site",
      "--output",
      "--synthetic",
      "--authorize-credits",
    ].includes(key) ||
    args.has(key)
  )
    throw new Error("Unknown or duplicate option. Use --help.");
  if (["--help", "--synthetic"].includes(key)) {
    if (process.argv[i + 1] && !process.argv[i + 1].startsWith("--"))
      throw new Error("Flags do not accept values.");
    args.set(key, true);
  } else {
    const value = process.argv[++i];
    if (!value || value.startsWith("--"))
      throw new Error("A required option value is missing.");
    args.set(key, value);
  }
}
if (args.has("--help")) {
  console.log(
    "node tests/browser/verify-hosted-generation.mjs --site " +
      SITE +
      " --synthetic --authorize-credits 4 --output cook/evidence/r07-hosted-generation-001",
  );
  console.log(
    "Then supply server-only operator JSON through hidden stdin. No automatic retry.",
  );
  process.exit(0);
}
if (
  args.get("--site") !== SITE ||
  args.get("--synthetic") !== true ||
  args.get("--authorize-credits") !== "4"
)
  throw new Error(
    "The exact public Site origin, --synthetic and --authorize-credits 4 are required.",
  );
if (typeof args.get("--output") !== "string")
  throw new Error("A new --output directory is required.");
const output = resolve(args.get("--output"));
if (!output.startsWith(join(root, "cook/evidence") + "/") || existsSync(output))
  throw new Error(
    "Choose a fresh directory under cook/evidence; existing evidence cannot be overwritten or retried.",
  );
const fixtures = {
  portrait: {
    path: join(root, "cook/evidence/r06-live-001/fixtures/portrait.png"),
    sha256: "e4200551c1cf8a2339484be572c6f9525fe375b95a60a0b4fd5a0ad42ccf93f9",
  },
  person: {
    path: join(root, "cook/evidence/r06-live-001/fixtures/person.png"),
    sha256: "a64ba3ea11481a5d53690d8c4c71bb1ac4aa1e459bbd0a64cd36012b152bce34",
  },
  garment: {
    path: join(root, "cook/evidence/r06-live-001/fixtures/garment.png"),
    sha256: "3b21837f76602871511582ef2d8bfbfbc9d36003d3815bb1dce73a70b756e555",
  },
};
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const file of Object.values(fixtures))
  if (sha(readFileSync(file.path)) !== file.sha256)
    throw new Error(
      "An original synthetic fixture is missing or changed. No verification is authorized.",
    );
mkdirSync(output, { recursive: true, mode: 0o700 });
const operations = [
  {
    feature: "hair",
    spec: {
      feature: "hair",
      hairColor: "src",
      templateId: "female_s_wave_brunette",
    },
    source: "portrait",
    submissionAttempted: false,
    paidTaskRequests: 0,
    statuses: [],
  },
  {
    feature: "clothing",
    spec: {
      feature: "clothing",
      garmentCategory: "upper_body",
      changeShoes: false,
      filterMultiPerson: "strict",
    },
    source: "person",
    reference: "garment",
    submissionAttempted: false,
    paidTaskRequests: 0,
    statuses: [],
  },
];
const receipt = {
  format: "true-beauty-genuine-hosted-generation-ui",
  version: 1,
  site: SITE,
  startedAt: new Date().toISOString(),
  syntheticFixtures: Object.fromEntries(
    Object.entries(fixtures).map(([name, file]) => [
      name,
      { sha256: file.sha256 },
    ]),
  ),
  authorizedCredits: 4,
  operations,
  paidTaskRequests: 0,
  pageErrorCount: 0,
  protocolReadFailures: 0,
  billingVerified: false,
  semanticStylingVerified: false,
  visualReviewRequired: true,
  verified: false,
};
const receiptFile = join(output, "receipt.json");
const persist = () => {
  writeFileSync(receiptFile + ".tmp", JSON.stringify(receipt, null, 2), {
    mode: 0o600,
  });
  renameSync(receiptFile + ".tmp", receiptFile);
};
persist();
let browser,
  page,
  operator,
  active,
  stage = "operator-session";
const responseReads = [];
const UUID = /^[0-9a-f-]{36}$/;
const safeBudget = (budget) => ({
  creditsUsed: Number.isFinite(budget?.creditsUsed) ? budget.creditsUsed : null,
  creditsLimit: Number.isFinite(budget?.creditsLimit)
    ? budget.creditsLimit
    : null,
  usdMicroUsed: Number.isFinite(budget?.usdMicroUsed)
    ? budget.usdMicroUsed
    : null,
});
const recordStatus = (op, body, httpStatus) => {
  if (
    body.taskId !== op.quote?.quoteId ||
    ![
      "uploading",
      "creating",
      "running",
      "success",
      "error",
      "cancelled",
    ].includes(body.status)
  )
    throw new Error("Unexpected task status contract.");
  op.taskId = body.taskId;
  op.status = body.status;
  if (op.statuses.length < 30)
    op.statuses.push({
      at: new Date().toISOString(),
      status: body.status,
      httpStatus,
      resultKind:
        body.result?.kind === "ai-generated-image"
          ? "ai-generated-image"
          : null,
      errorPresent: typeof body.error === "string",
      uncertain: body.uncertain === true,
    });
  if (body.result) {
    if (
      body.result.kind !== "ai-generated-image" ||
      body.result.provider !== "perfect-corp" ||
      body.result.feature !== op.feature
    )
      throw new Error("Unexpected generated result contract.");
    op.result = {
      kind: body.result.kind,
      provider: body.result.provider,
      feature: body.result.feature,
    };
  }
  persist();
};
async function localStorageEvidence() {
  return page.evaluate(
    () =>
      new Promise((done, reject) => {
        const opened = indexedDB.open("true-beauty");
        opened.onerror = () => reject(new Error("Database unavailable"));
        opened.onsuccess = () => {
          const db = opened.result,
            names = ["mediaAssets", "savedLooks", "outfits"].filter((n) =>
              db.objectStoreNames.contains(n),
            );
          if (names.length !== 3) {
            db.close();
            reject(new Error("Expected local storage tables unavailable"));
            return;
          }
          const tx = db.transaction(names, "readonly"),
            result = { counts: {}, photoPayloads: false };
          const hasImage = (value) => {
            if (typeof value === "string")
              return /(?:^data:image|^blob:)/i.test(value);
            if (
              value instanceof Blob ||
              value instanceof ArrayBuffer ||
              ArrayBuffer.isView(value)
            )
              return true;
            if (value && typeof value === "object")
              return Object.entries(value).some(
                ([key, item]) =>
                  /^(?:imageBase64|base64)$/i.test(key) || hasImage(item),
              );
            return false;
          };
          for (const name of names) {
            const request = tx.objectStore(name).getAll();
            request.onsuccess = () => {
              result.counts[name] = request.result.length;
              result.photoPayloads ||= request.result.some(hasImage);
            };
          }
          tx.oncomplete = () => {
            db.close();
            done(result);
          };
          tx.onerror = () => {
            db.close();
            reject(new Error("Database inspection failed"));
          };
        };
      }),
  );
}
try {
  operator = await openHostedOperator(SITE);
  receipt.budgetBefore = safeBudget(await operator.budget());
  if (
    receipt.budgetBefore.creditsUsed === null ||
    receipt.budgetBefore.creditsLimit === null ||
    receipt.budgetBefore.creditsUsed + 4 > receipt.budgetBefore.creditsLimit
  )
    throw new Error("The reconciled shared budget cannot cover this batch.");
  stage = "browser-entry";
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  page = await context.newPage();
  page.setDefaultTimeout(25000);
  page.on("pageerror", () => {
    receipt.pageErrorCount++;
    persist();
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.origin !== SITE ||
      url.pathname !== "/api/generation/tasks" ||
      request.method() !== "POST"
    )
      return;
    receipt.paidTaskRequests++;
    if (active) {
      active.paidTaskRequests++;
      try {
        const body = request.postDataJSON();
        active.submitted = {
          quoteMatched: body.quoteId === active.quote?.quoteId,
          specMatched: isDeepStrictEqual(body.spec, active.spec),
          maxCredits: body.maxCredits === 2 ? 2 : null,
          consent: {
            uploadImages: body.consent?.uploadImages === true,
            rightsConfirmed: body.consent?.rightsConfirmed === true,
            externalProcessing: body.consent?.externalProcessing === true,
            providerRetentionAcknowledged:
              body.consent?.providerRetentionAcknowledged === true,
          },
          sourceSha256: sha(Buffer.from(body.source?.base64 ?? "", "base64")),
          ...(body.reference
            ? {
                referenceSha256: sha(
                  Buffer.from(body.reference.base64 ?? "", "base64"),
                ),
              }
            : {}),
        };
      } catch {
        active.requestContractUnreadable = true;
      }
    }
    persist();
  });
  page.on("response", (response) => {
    const url = new URL(response.url()),
      op = active;
    if (
      url.origin !== SITE ||
      !op?.quote ||
      url.pathname !== `/api/generation/tasks/${op.quote.quoteId}` ||
      response.request().method() !== "GET"
    )
      return;
    responseReads.push(
      (async () => {
        try {
          recordStatus(op, await response.json(), response.status());
        } catch {
          receipt.protocolReadFailures++;
          persist();
        }
      })(),
    );
  });
  await page.goto(SITE, { waitUntil: "domcontentloaded" });
  if (new URL(page.url()).origin !== SITE)
    throw new Error("Unexpected navigation origin.");
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i }),
  ).toBeVisible();
  await page
    .locator(".topnav")
    .getByRole("button", { name: "My wardrobe", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generate a clothing preview", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Imagine your next look.", exact: true }),
  ).toBeVisible();
  receipt.storageBefore = await localStorageEvidence();
  if (receipt.storageBefore.photoPayloads)
    throw new Error("Unexpected photo persistence before generation.");
  persist();
  for (const op of operations) {
    active = op;
    stage = op.feature + "-prepare";
    const prepareSelect = async (name, value) => {
      stage = op.feature + "-select-" + name.toLowerCase().replaceAll(" ", "-");
      receipt.checkpoint = {
        stage,
        action: "select and verify value",
        role: "combobox",
        accessibleNamePrefix: name,
        expectedValue: value,
      };
      persist();
      const select = page.getByRole("combobox", {
        name: new RegExp("^" + name),
      });
      await expect(select).toHaveCount(1);
      await select.selectOption(value);
      await expect(select).toHaveValue(value);
    };
    console.log(op.feature + ": preparing original synthetic fixture");
    await page
      .getByRole("button", {
        name: op.feature === "hair" ? "Hairstyle studio" : "Clothing studio",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Upload generation portrait", { exact: true })
      .setInputFiles(fixtures[op.source].path);
    if (op.feature === "hair") {
      await prepareSelect("Hairstyle source", "template");
      stage = "hair-load-provider-styles";
      receipt.checkpoint = {
        stage,
        action: "load current provider styles",
        role: "button",
        accessibleName: "Load provider styles",
      };
      persist();
      await page
        .getByRole("button", { name: "Load provider styles", exact: true })
        .click();
      await expect(
        page.getByRole("combobox", { name: /^Provider hairstyle/ }),
      ).toBeEnabled();
      await prepareSelect("Provider hairstyle", "female_s_wave_brunette");
      await prepareSelect("Hair colour source", "src");
    } else {
      await page
        .getByLabel("Upload generation reference", { exact: true })
        .setInputFiles(fixtures.garment.path);
      await prepareSelect("Garment area", "upper_body");
    }
    if (
      receipt.paidTaskRequests !==
      operations.filter((x) => x.submissionAttempted).length
    )
      throw new Error("Unexpected task before authorization.");
    stage = op.feature + "-quote";
    const [quoteResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).origin === SITE &&
          new URL(r.url()).pathname === "/api/generation/quotes" &&
          r.request().method() === "POST",
      ),
      page
        .getByRole("button", {
          name: "Get a verified credit quote",
          exact: true,
        })
        .click(),
    ]);
    const quote = await quoteResponse.json();
    if (
      !quoteResponse.ok() ||
      !UUID.test(quote.quoteId) ||
      quote.credits !== 2 ||
      !isDeepStrictEqual(quote.spec, op.spec) ||
      !(Date.parse(quote.expiresAt) > Date.now())
    )
      throw new Error(
        "Current quote does not match the exact two-credit test authorization.",
      );
    op.quote = {
      quoteId: quote.quoteId,
      credits: 2,
      spec: op.spec,
      expiresAt: quote.expiresAt,
      httpStatus: quoteResponse.status(),
    };
    persist();
    const start = page.getByRole("button", {
      name: "Authorize and generate preview",
      exact: true,
    });
    const upload = page.getByRole("checkbox", {
      name: /I have permission to use these images/,
    });
    const retention = page.getByRole("checkbox", {
      name: /I understand the provider may retain/,
    });
    await expect(upload).not.toBeChecked();
    await expect(retention).not.toBeChecked();
    await expect(start).toBeDisabled();
    stage = op.feature + "-cloud-approval";
    await page
      .getByRole("button", { name: "Request approval", exact: true })
      .click();
    await operator.approve(quote.quoteId, {
      operation: op.feature,
      credits: 2,
      usdMicro: 0,
    });
    await page
      .getByRole("button", { name: "Check approval", exact: true })
      .click();
    await expect(
      page.getByText("Cloud credits approved", { exact: true }),
    ).toBeVisible();
    op.cloudApprovalChecked = true;
    await upload.check();
    await retention.check();
    await page
      .getByLabel("Maximum provider credits I authorize", { exact: true })
      .fill("2");
    await expect(start).toBeEnabled();
    op.uploadConsent = true;
    op.retentionConsent = true;
    op.submissionAttempted = true;
    persist();
    await page.screenshot({
      path: join(output, op.feature + "-authorized.png"),
      fullPage: true,
    });
    stage = op.feature + "-submit-once";
    const imageResponse = page
      .waitForResponse(
        (r) =>
          new URL(r.url()).origin === SITE &&
          new URL(r.url()).pathname ===
            `/api/generation/tasks/${quote.quoteId}/image` &&
          r.ok(),
        { timeout: 180000 },
      )
      .then(async (r) => {
        const bytes = await r.body();
        if (
          bytes.length > 8 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(
            r.headers()["content-type"]?.split(";")[0],
          )
        )
          throw new Error("Invalid result image");
        return {
          sha256: sha(bytes),
          bytes: bytes.length,
          contentType: r.headers()["content-type"]?.split(";")[0],
          httpStatus: r.status(),
        };
      })
      .catch(() => null);
    const [createdResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).origin === SITE &&
          new URL(r.url()).pathname === "/api/generation/tasks" &&
          r.request().method() === "POST",
        { timeout: 60000 },
      ),
      start.click(),
    ]);
    if (!createdResponse.ok())
      throw new Error(
        "The single task submission was not accepted; no retry is authorized.",
      );
    recordStatus(op, await createdResponse.json(), createdResponse.status());
    stage = op.feature + "-poll-existing-task";
    const image = page.getByRole("img", {
      name:
        op.feature === "hair"
          ? "AI-generated hairstyle preview from Perfect Corp"
          : "AI-generated clothing preview from Perfect Corp",
      exact: true,
    });
    const deadline = Date.now() + 180000;
    while (!(await image.isVisible()) && Date.now() < deadline) {
      if (["error", "cancelled"].includes(op.status))
        throw new Error("Provider task did not complete.");
      await page.waitForTimeout(1000);
    }
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty("complete", true);
    op.pixels = await image.evaluate((img) => {
      if (!img.naturalWidth || !img.naturalHeight)
        throw new Error("Image decode failed");
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const c = canvas.getContext("2d");
      c.drawImage(img, 0, 0, 64, 64);
      const data = c.getImageData(0, 0, 64, 64).data,
        colours = new Set();
      let sum = 0,
        squared = 0,
        opaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
        sum += l;
        squared += l * l;
        opaque += data[i + 3] === 255 ? 1 : 0;
        colours.add((data[i] << 16) + (data[i + 1] << 8) + data[i + 2]);
      }
      const n = data.length / 4,
        mean = sum / n;
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        uniqueColours: colours.size,
        meanLuma: mean,
        lumaVariance: squared / n - mean * mean,
        opaqueFraction: opaque / n,
      };
    });
    op.image = await imageResponse;
    // CDP may omit an already-consumed fetch body. Check the displayed Blob
    // locally; this makes no HTTP or provider request.
    op.displayedImage = await image.evaluate(async (img) => {
      if (!img.src.startsWith("blob:"))
        throw new Error("Expected local result Blob.");
      const response = await fetch(img.src);
      const bytes = await response.arrayBuffer();
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", bytes),
      );
      return {
        bytes: bytes.byteLength,
        sha256: [...digest]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join(""),
        contentType: response.headers.get("content-type"),
      };
    });
    op.httpBodyCaptured = !!op.image && op.image.bytes > 100;
    await Promise.all(responseReads);
    if (
      op.status !== "success" ||
      !op.image ||
      op.displayedImage.bytes <= 100 ||
      op.displayedImage.sha256 === fixtures[op.source].sha256 ||
      op.pixels.uniqueColours < 32 ||
      op.pixels.lumaVariance < 10 ||
      op.paidTaskRequests !== 1 ||
      !op.submitted?.quoteMatched ||
      !op.submitted.specMatched ||
      op.submitted.maxCredits !== 2 ||
      Object.values(op.submitted.consent).some((v) => v !== true) ||
      op.submitted.sourceSha256 !== fixtures[op.source].sha256 ||
      (op.reference
        ? op.submitted.referenceSha256 !== fixtures[op.reference].sha256
        : op.submitted.referenceSha256 !== undefined)
    )
      throw new Error("Genuine UI/result/request evidence did not pass.");
    await page.screenshot({
      path: join(output, op.feature + "-genuine-result.png"),
      fullPage: true,
    });
    op.storage = await localStorageEvidence();
    if (!isDeepStrictEqual(op.storage, receipt.storageBefore))
      throw new Error(
        "Generation persisted an image or saved look without storage consent.",
      );
    op.verified = true;
    persist();
    console.log(op.feature + ": genuine result decoded; no paid retry");
  }
  receipt.budgetAfter = safeBudget(await operator.budget());
  receipt.observedReservationDelta =
    receipt.budgetAfter.creditsUsed - receipt.budgetBefore.creditsUsed;
  receipt.concurrentAccountUseNotExcluded = true;
  receipt.storageAfter = await localStorageEvidence();
  receipt.verified =
    operations.every((op) => op.verified) &&
    receipt.paidTaskRequests === 2 &&
    receipt.pageErrorCount === 0 &&
    receipt.protocolReadFailures === 0;
  if (!receipt.verified) throw new Error("Final verification gate failed.");
} catch (error) {
  receipt.error = {
    stage,
    kind: error?.name === "TimeoutError" ? "timeout" : "assertion-or-runtime",
    // Static authored selector metadata only. Never serialize arbitrary exception
    // text, HTTP bodies, credentials, image data or signed request URLs.
    checkpoint:
      receipt.checkpoint?.stage === stage ? receipt.checkpoint : { stage },
    detail: JSON.stringify(
      receipt.checkpoint?.stage === stage ? receipt.checkpoint : { stage },
    ).slice(0, 1000),
    message:
      "Verification stopped. Review this receipt, existing hosted tasks and screenshots before any separately authorized paid attempt.",
  };
  process.exitCode = 1;
  if (page)
    await page
      .screenshot({ path: join(output, "failure.png"), fullPage: true })
      .catch(() => {});
} finally {
  receipt.finishedAt = new Date().toISOString();
  persist();
  if (browser) await browser.close();
  console.log(
    JSON.stringify({
      verified: receipt.verified,
      paidTaskRequests: receipt.paidTaskRequests,
      stage,
      error: receipt.error?.message,
      output,
    }),
  );
}
