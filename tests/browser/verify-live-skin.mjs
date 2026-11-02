/** Manual paid end-to-end test. Synthetic fixture only; never part of automatic CI. */
import { chromium, expect } from "@playwright/test";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { openHostedOperator } from "./hosted-operator.mjs";
const tokens = process.argv.slice(2);
if (!tokens.includes("--synthetic"))
  throw new Error("Explicit synthetic fixture authorization required.");
const read = (key) => tokens[tokens.indexOf(key) + 1];
const site = tokens.includes("--site") ? read("--site") : null;
const ceiling = Number(read("--authorize-credits"));
if (!tokens.includes("--authorize-credits") || ceiling !== 9)
  throw new Error("Explicit nine-credit maximum required.");
const output = resolve(
  tokens.includes("--output")
    ? read("--output")
    : "cook/evidence/r06-skin-ui-001",
);
if (existsSync(output + "/receipt.json"))
  throw new Error("Existing receipt: no automatic paid retry.");
mkdirSync(output, { recursive: true });
const receipt = {
  format: "true-beauty-live-skin-ui-receipt",
  version: 1,
  startedAt: new Date().toISOString(),
  fixture:
    "Original synthetic portrait, explicit local framing, genuine provider, no private photograph.",
  authorizationCredits: ceiling,
  paidTaskRequests: 0,
  observations: [],
  pageErrors: [],
  billingVerified: false,
};
const persist = () =>
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
persist();
const operator = site ? await openHostedOperator(site) : null;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
});
page.setDefaultTimeout(20000);
page.on("pageerror", (e) => receipt.pageErrors.push(e.message));
page.on("request", (r) => {
  if (
    r.method() === "POST" &&
    new URL(r.url()).pathname === "/api/skin/tasks"
  ) {
    receipt.paidTaskRequests++;
    persist();
  }
});
page.on("response", async (response) => {
  try {
    const path = new URL(response.url()).pathname;
    if (path === "/api/skin/quotes") {
      const body = await response.json();
      receipt.quote = {
        quoteId: body.quoteId,
        credits: body.credits,
        actions: body.actions,
        expiresAt: body.expiresAt,
      };
      persist();
    } else if (path.startsWith("/api/skin/tasks")) {
      const body = await response.json();
      if (body.taskId) receipt.taskId = body.taskId;
      if (body.result) {
        receipt.observations = body.result.observations.map((o) => ({
          concern: o.concern,
          label: o.label,
          uiScore: o.uiScore,
          rawScore: o.rawScore,
          confidence: o.confidence,
          kind: o.kind,
        }));
        receipt.limitations = body.result.limitations;
      }
      persist();
    }
  } catch {
    /* Non-JSON errors are checked by the visible UI. */
  }
});
async function storageCounts() {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("true-beauty");
        open.onerror = () => reject(new Error("Local database unavailable"));
        open.onsuccess = () => {
          const d = open.result;
          const names = [
            "skinScans",
            "skinObservations",
            "mediaAssets",
            "memoryNodes",
          ];
          const tx = d.transaction(names, "readonly");
          const counts = {};
          for (const name of names) {
            const r = tx.objectStore(name).count();
            r.onsuccess = () => {
              counts[name] = r.result;
            };
          }
          const records = tx.objectStore("skinScans").getAll();
          records.onsuccess = () => {
            counts.scanObservationCount = records.result.reduce(
              (total, scan) =>
                total +
                (Array.isArray(scan.observations)
                  ? scan.observations.length
                  : 0),
              0,
            );
            counts.savedImageReferences =
              /(?:data:image|blob:|imageBase64)/i.test(
                JSON.stringify(records.result),
              );
          };
          tx.oncomplete = () => {
            d.close();
            resolve(counts);
          };
          tx.onerror = () => {
            d.close();
            reject(new Error("Database count failed"));
          };
        };
      }),
  );
}
try {
  await page.goto(site ?? "http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: "Skin & rituals", exact: true })
    .first()
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles("cook/evidence/r06-live-001/fixtures/portrait.png");
  await page.getByRole("button", { name: "Skin & care", exact: true }).click();
  await page
    .getByRole("button", { name: "Prepare scan framing", exact: true })
    .click();
  const preview = page.getByRole("img", {
    name: "Exact temporary cropped image selected for provider upload",
    exact: true,
  });
  await expect(preview).toBeVisible({ timeout: 45000 });
  const encoded = await preview.getAttribute("src");
  if (!encoded?.startsWith("data:image/jpeg;base64,"))
    throw new Error("Prepared JPEG is not visible");
  receipt.preparedSha256 = createHash("sha256")
    .update(Buffer.from(encoded.split(",")[1], "base64"))
    .digest("hex");
  receipt.before = await storageCounts();
  await page.screenshot({ path: output + "/framing.png", fullPage: true });
  await page
    .getByRole("button", { name: "Get a credit quote", exact: true })
    .click();
  await expect(page.locator(".skin-quote")).toBeVisible();
  if (receipt.quote?.credits !== ceiling)
    throw new Error(
      "Quote differs from explicit maximum; no upload authorized",
    );
  if (operator) {
    await operator.approve(receipt.quote.quoteId, {
      operation: "skin",
      credits: ceiling,
      usdMicro: 0,
    });
    await page
      .getByRole("button", { name: "Check approval", exact: true })
      .click();
    await expect(
      page.getByText("Cloud credits approved", { exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("checkbox", { name: /I consent to sending this portrait/ })
    .check();
  await page
    .getByRole("checkbox", { name: /I understand the provider processes/ })
    .check();
  await page
    .getByLabel("Maximum credits I authorize", { exact: true })
    .fill(String(ceiling));
  await page
    .getByRole("button", { name: "Authorize and send portrait", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Check existing task status",
      exact: true,
    }),
  ).toBeVisible();
  const deadline = Date.now() + 90000;
  while (
    !(await page
      .getByRole("heading", {
        name: "Genuine provider observations",
        exact: true,
      })
      .isVisible()) &&
    Date.now() < deadline
  ) {
    await page.waitForTimeout(10000);
    await page
      .getByRole("button", { name: "Check existing task status", exact: true })
      .click();
    await page.waitForTimeout(300);
  }
  await expect(
    page.getByRole("heading", {
      name: "Genuine provider observations",
      exact: true,
    }),
  ).toBeVisible();
  if (receipt.paidTaskRequests !== 1 || receipt.observations.length !== 4)
    throw new Error(
      "Expected exactly one genuine task and four dynamic observations",
    );
  await page.screenshot({
    path: output + "/genuine-results.png",
    fullPage: true,
  });
  await page
    .getByRole("checkbox", {
      name: "Save this observation to my local history. No photograph.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save observation", exact: true })
    .click();
  await page.getByRole("button", { name: "Your history", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Provider cosmetic observations",
      exact: true,
    }),
  ).toBeVisible();
  receipt.saved = await storageCounts();
  if (
    receipt.saved.mediaAssets !== 0 ||
    receipt.saved.skinScans !== 1 ||
    receipt.saved.scanObservationCount !== 4 ||
    receipt.saved.savedImageReferences
  )
    throw new Error("Unexpected photo/history retention");
  await page.reload();
  await page
    .getByRole("button", { name: "Skin & rituals", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Your history", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Provider cosmetic observations",
      exact: true,
    }),
  ).toBeVisible();
  receipt.reloadRetained = true;
  await page.screenshot({
    path: output + "/consented-history.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Delete observation from/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your history starts with your choice.",
      exact: true,
    }),
  ).toBeVisible();
  receipt.deleted = await storageCounts();
  receipt.verified =
    receipt.deleted.skinScans === 0 &&
    receipt.deleted.skinObservations === 0 &&
    receipt.deleted.scanObservationCount === 0 &&
    !receipt.deleted.savedImageReferences &&
    receipt.deleted.mediaAssets === 0 &&
    receipt.pageErrors.length === 0;
  if (!receipt.verified)
    throw new Error("Deletion or runtime verification failed");
} catch (error) {
  receipt.error =
    error instanceof Error ? error.message : "Verification failed";
  process.exitCode = 1;
  await page
    .screenshot({ path: output + "/failure.png", fullPage: true })
    .catch(() => {});
} finally {
  receipt.finishedAt = new Date().toISOString();
  persist();
  await browser.close();
  console.log(
    JSON.stringify({
      verified: receipt.verified ?? false,
      paidTaskRequests: receipt.paidTaskRequests,
      observations: receipt.observations.length,
      error: receipt.error,
      output,
    }),
  );
}
