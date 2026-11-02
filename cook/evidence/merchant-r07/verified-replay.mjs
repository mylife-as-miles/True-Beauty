/** Actual public UI → native Worker → reviewed official sources. No mocks, paid calls or private images. */
import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const output = "cook/evidence/merchant-r07/verified-replay";
const origin = "https://true-beauty-miles.myles4miles.chatgpt.site";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce", recordVideo: { dir: `${output}/video`, size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const evidence = {
  kind: "genuine-public-browser-to-native-worker-to-official-merchant",
  startedAt: new Date().toISOString(), origin,
  scope: "Merchant lookup and local planning only. No interception/mocks, provider/paid actions, personal images, secrets, checkout, orders or merchant partnership. Source snapshots describe their recorded fetch, not lasting stock or final checkout prices.",
  browser: browser.version(), viewport: { width: 1440, height: 1000 },
  requests: [], responses: [], added: [], apiPaths: [], browserErrors: [], consoleErrors: [], failedRequests: [], checks: [], fatal: null,
};
page.on("pageerror", error => evidence.browserErrors.push(error.message));
page.on("console", message => { if (message.type() === "error") evidence.consoleErrors.push(message.text().slice(0, 700)); });
page.on("requestfailed", request => evidence.failedRequests.push({ url: request.url().split("?")[0], reason: request.failure()?.errorText }));
page.on("request", request => {
  const url = new URL(request.url());
  if (url.origin === origin && url.pathname.startsWith("/api/")) evidence.apiPaths.push({ method: request.method(), path: url.pathname });
  if (url.origin === origin && url.pathname === "/api/merchants/refresh") evidence.requests.push({ at: new Date().toISOString(), method: request.method(), path: url.pathname, body: request.postDataJSON() });
});
async function nav() {
  await expect(page.getByRole("button", { name: /True Beauty.*home/i })).toBeVisible();
  const menu = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await menu.isVisible()) {
    await menu.click();
    await page.locator(".nav-rail").getByRole("button", { name: "The beauty edit", exact: true }).click();
  } else await page.locator(".topnav").getByRole("button", { name: "The beauty edit", exact: true }).click();
}
async function closeDialog() { await page.getByRole("button", { name: "Close dialog", exact: true }).click(); }
async function lookup(referenceId, label) {
  await page.getByLabel("Official merchant product", { exact: true }).selectOption(referenceId);
  let result, status;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const received = page.waitForResponse(response => response.url() === origin + "/api/merchants/refresh" && response.request().method() === "POST", { timeout: 45000 });
    await page.getByRole("button", { name: "Check current source", exact: true }).click();
    const response = await received;
    status = response.status(); result = await response.json();
    evidence.responses.push({ referenceId, attempt, receivedAt: new Date().toISOString(), status, result });
    if (status !== 409 || attempt === 2) break;
    // A single recorded, user-equivalent retry for a genuine competing lease.
    await page.waitForTimeout(3100);
  }
  await expect(page.getByRole("button", { name: "Check current source", exact: true })).toBeEnabled();
  if (status === 200 && result.observations?.length) {
    await expect(page.locator(".merchant-observation")).toHaveCount(result.observations.length);
    const buttons = page.getByRole("button", { name: "Add planning quote", exact: true });
    for (let index = 0; index < result.observations.length; index++) {
      const observation = result.observations[index];
      if (observation.status !== "observed" || typeof observation.amount !== "number" || observation.availability === "out-of-stock") continue;
      const row = page.locator(".merchant-observation").filter({ has: page.getByText(observation.variantName ?? `Offer ${observation.variantId}`, { exact: true }) });
      await expect(row).toHaveCount(1);
      const add = row.getByRole("button", { name: "Add planning quote", exact: true });
      if (await add.count() && await add.isEnabled()) {
        await add.click();
        await expect(page.locator(".toast")).toContainText("No order");
        evidence.added.push({ referenceId, variantId: observation.variantId, variantName: observation.variantName, amount: observation.amount, currency: observation.currency, sourceUrl: observation.sourceUrl, fetchedAt: observation.fetchedAt, availability: observation.availability });
        break;
      }
    }
    evidence.checks.push({ name: `${referenceId}: visible genuine observations`, pass: true, observedPriceCount: result.observations.filter(o => o.status === "observed" && typeof o.amount === "number").length, addButtonCount: await buttons.count(), text: await page.locator(".merchant-sources").innerText() });
  } else evidence.checks.push({ name: `${referenceId}: truthful unavailable/error state`, pass: await page.locator(".merchant-error,.merchant-observation.unavailable").count() > 0, status, text: await page.locator(".merchant-sources").innerText() });
  await page.screenshot({ path: `${output}/${label}.png`, fullPage: false });
}
try {
  const initial = await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 });
  evidence.documentStatus = initial?.status();
  await nav();
  evidence.checks.push({ name: "public first visit without login", pass: true });
  await page.getByRole("button", { name: "Source checks", exact: true }).click();
  await lookup("nuban-fixing-spray", "desktop-nuban-ngn");
  await lookup("boj-glow-serum", "desktop-boj-usd");
  if (!evidence.added.some(row => row.currency === "USD")) await lookup("ordinary-nmf-30ml", "desktop-ordinary-usd-fallback");
  await closeDialog();
  await page.getByRole("button", { name: /Your bag/ }).click();
  await expect(page.locator(".bag-item")).toHaveCount(evidence.added.length);
  const bagBefore = await page.getByRole("dialog").innerText();
  evidence.bagBeforeReload = bagBefore;
  for (const selected of evidence.added) {
    const row = page.locator(".bag-item").filter({ has: page.locator(".bag-variant-label").filter({ hasText: selected.variantName }) });
    await expect(row).toHaveCount(1);
    await expect(row.locator(".bag-variant-label")).toHaveText(`${selected.variantName} · ${selected.currency}`);
    const expected = selected.currency === "NGN" ? `₦${selected.amount.toLocaleString("en-NG")}` : `US$${selected.amount.toFixed(2)}`;
    await expect(row).toContainText(`${expected} · observed source quote`);
  }
  evidence.checks.push({ name: "each clicked SKU, currency and amount matches the actual bag line", pass: true });
  evidence.checks.push({ name: "both genuine NGN and USD planning quotes available", pass: evidence.added.some(row => row.currency === "NGN") && evidence.added.some(row => row.currency === "USD"), note: "Unavailable source currencies are not replaced by sample amounts." });
  await page.screenshot({ path: `${output}/desktop-bag.png`, fullPage: false });
  await page.reload({ waitUntil: "domcontentloaded" });
  await nav();
  await page.getByRole("button", { name: /Your bag/ }).click();
  await expect(page.locator(".bag-item")).toHaveCount(evidence.added.length);
  evidence.bagAfterReload = await page.getByRole("dialog").innerText();
  evidence.checks.push({ name: "exact added source lines and separate currencies survive reload", pass: evidence.bagAfterReload === bagBefore, lineCount: evidence.added.length });
  await page.screenshot({ path: `${output}/desktop-bag-reloaded.png`, fullPage: false });
  await closeDialog();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /Your bag/ }).click();
  evidence.mobileTargets = await page.locator('.modal-header .icon-button,.bag-item > .icon-button,.bag-item input').evaluateAll(elements => elements.map(el => { const rect = el.getBoundingClientRect(); return { label: el.getAttribute("aria-label"), width: rect.width, height: rect.height }; }));
  evidence.checks.push({ name: "mobile bag controls meet 44px", pass: evidence.mobileTargets.every(target => target.width >= 44 && target.height >= 44) });
  await page.screenshot({ path: `${output}/mobile-bag.png`, fullPage: false });
  await closeDialog();
  await page.getByRole("button", { name: "Source checks", exact: true }).click();
  await page.getByLabel("Official merchant product", { exact: true }).selectOption("nuban-fixing-spray");
  evidence.reloadedSourceText = await page.locator(".merchant-sources").innerText();
  await page.locator(".merchant-observation").first().locator(".merchant-quote").scrollIntoViewIfNeeded();
  evidence.checks.push({ name: "source observation history is recalled locally without a new refresh", pass: await page.locator(".merchant-observation").count() > 0 });
  await page.screenshot({ path: `${output}/mobile-source-recalled.png`, fullPage: false });
  const unrequested = evidence.apiPaths.filter(call => call.method !== "GET" && !call.path.startsWith("/api/merchants/"));
  evidence.checks.push({ name: "no paid/provider or unrelated mutation request", pass: unrequested.length === 0, unexpected: unrequested });
} catch (error) {
  evidence.fatal = error instanceof Error ? error.message : String(error);
  await page.screenshot({ path: `${output}/unexpected-stop.png`, fullPage: false }).catch(() => {});
} finally {
  evidence.finishedAt = new Date().toISOString();
  await context.close(); await browser.close();
  await writeFile(`${output}/live-browser.json`, JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify({ documentStatus: evidence.documentStatus, responses: evidence.responses.map(r => ({ referenceId: r.referenceId, status: r.status, cached: r.result.cached, observations: r.result.observations?.map(o => ({ amount: o.amount, currency: o.currency, variantId: o.variantId, availability: o.availability, fetchedAt: o.fetchedAt, status: o.status, note: o.note })) })), checks: evidence.checks.map(({ text, ...check }) => check), errors: evidence.browserErrors, fatal: evidence.fatal }, null, 2));
}
