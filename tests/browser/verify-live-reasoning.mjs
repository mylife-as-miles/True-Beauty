/** Manual operator verification. Not an automatic test: invokes a paid provider once. */
import { chromium } from "@playwright/test";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openHostedOperator } from "./hosted-operator.mjs";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i], process.argv[i + 1]);
const ceiling = Number(args.get("--authorize-usd"));
if (!Number.isFinite(ceiling) || ceiling <= 0 || ceiling > 1)
  throw new Error(
    "Explicit --authorize-usd greater than zero and at most one is required.",
  );
const site = args.get("--site");
if (site && site !== "https://true-beauty-miles.myles4miles.chatgpt.site")
  throw new Error("Use the explicitly authorized HTTPS Site origin.");
if (site && args.has("--api"))
  throw new Error("Choose hosted --site or loopback --api verification.");
const api = site ? null : new URL(args.get("--api") ?? "http://127.0.0.1:3002");
if (api && !["127.0.0.1", "localhost"].includes(api.hostname))
  throw new Error("Loopback API required.");
const output = resolve(
  args.get("--output") ??
    (site
      ? "cook/evidence/r07-claude-hosted-001"
      : "cook/evidence/r06-claude-live-001"),
);
if (existsSync(output + "/receipt.json"))
  throw new Error(
    "Existing receipt: inspect its billing state before choosing a new output. No paid automatic retry.",
  );
mkdirSync(output, { recursive: true });
const receipt = {
  format: "true-beauty-live-reasoning-receipt",
  version: 2,
  mode: site ? "genuine-public-hosted" : "genuine-loopback-forwarded",
  origin: site ?? "http://127.0.0.1:5173",
  startedAt: new Date().toISOString(),
  fixture:
    "Nonpersonal explicit colour request; no images or personal context.",
  authorizeUsd: ceiling,
  paidStarts: 0,
  steps: [],
  feedback: [],
  billingVerified: false,
};
const persist = () =>
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2), {
  flag: "wx",
});
let browser, page;
const errors = [];
const captures = new Set();
async function flushCaptures() {
  while (captures.size) await Promise.all([...captures]);
}
function observeResponse(response) {
  const path = new URL(response.url()).pathname;
  if (!path.startsWith("/api/reasoning/")) return;
  const capture = (async () => {
    try {
      const raw = await response.json();
      if (path === "/api/reasoning/capabilities")
        receipt.capabilities = {
          ready: raw.ready,
          provider: raw.provider,
          model: raw.model,
        };
      if (path === "/api/reasoning/quotes") receipt.quote = raw;
      if (path === "/api/reasoning/sessions")
        receipt.sessionHttpStatus = response.status();
      if (path.endsWith("/step"))
        receipt.steps.push({ httpStatus: response.status(), ...raw });
      persist();
    } catch {
      errors.push("A reasoning response could not be captured: " + path);
    }
  })();
  captures.add(capture);
  void capture.finally(() => captures.delete(capture));
}
try {
  // The helper reads hidden stdin in Node. Its token, cookie and CSRF
  // capability are never passed to Playwright or written to the receipt.
  const operator = site ? await openHostedOperator(site) : null;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  page.setDefaultTimeout(20000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", observeResponse);
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() !== "POST") return;
    if (path === "/api/reasoning/sessions") {
      receipt.paidStarts++;
      persist();
    }
    if (path.startsWith("/api/reasoning/sessions/") && path.endsWith("/step")) {
      const body = request.postDataJSON();
      receipt.feedback.push({ stepId: body.stepId, feedback: body.feedback });
      persist();
    }
  });
  if (!site) {
    // Local mode transparently forwards to the actual server. Hosted mode
    // installs no interception, forwarding or response substitution.
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith("/api/")) return route.continue();
      if (
        !["/api/health", "/api/capabilities", "/api/session"].includes(path) &&
        !path.startsWith("/api/reasoning/")
      )
        throw new Error("Unexpected remote API path");
      const response = await route.fetch({
        url: api.origin + path,
        timeout: 35000,
      });
      await route.fulfill({ response });
    });
  }
  await page.goto(receipt.origin);
  await page
    .getByRole("button", { name: "Your beauty companion", exact: true })
    .click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  const capabilitiesResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/reasoning/capabilities",
  );
  await agent.getByLabel("Assistant mode").selectOption("remote");
  const capabilities = await (await capabilitiesResponse).json();
  if (!capabilities.ready || typeof capabilities.model !== "string")
    throw new Error("The actual reasoning backend is not ready.");
  await agent.getByText(capabilities.model).first().waitFor();
  await agent
    .getByLabel("Your beauty request")
    .fill(
      "Set the lipstick color to #B35B6B and the hair color to #A35C36. Use one tool for each change and report the actual results.",
    );
  await agent.getByRole("button", { name: "Send request" }).click();
  const review = agent.getByRole("region", {
    name: "Review connected reasoning request",
  });
  await review.getByRole("button", { name: "Prepare exact preview" }).click();
  const approved = JSON.parse(await review.locator("pre").innerText());
  if (
    Object.keys(approved.context).length !== 0 ||
    approved.allowPersistence !== false
  )
    throw new Error("Unexpected personal context or persistence permission");
  receipt.contextCategories = [];
  receipt.goal = approved.goal;
  persist();
  const quoteResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/reasoning/quotes" &&
      response.request().method() === "POST",
  );
  await review
    .getByRole("button", { name: "Get a maximum-cost quote" })
    .click();
  const actualQuoteResponse = await quoteResponse;
  const quote = await actualQuoteResponse.json();
  receipt.quote = quote;
  persist();
  if (
    !actualQuoteResponse.ok() ||
    !Number.isFinite(quote.maximumUsd) ||
    quote.maximumUsd <= 0 ||
    quote.maximumUsd > ceiling
  )
    throw new Error(
      "Quote is unavailable or exceeds explicit verification ceiling",
    );
  await review.locator(".reasoning-quote").waitFor();
  if (site) {
    const access = review.getByRole("region", {
      name: "Sponsored cloud access",
    });
    await access.waitFor();
    const requestResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/access/requests/" + encodeURIComponent(quote.quoteId) &&
        response.request().method() === "POST",
    );
    await access
      .getByRole("button", { name: "Request approval", exact: true })
      .click();
    if (!(await requestResponse).ok())
      throw new Error(
        "The exact hosted quote could not enter the approval queue.",
      );
    if (receipt.paidStarts !== 0)
      throw new Error("A paid session started before hosted quote approval.");
    await operator.approve(quote.quoteId, {
      operation: "reasoning",
      credits: 0,
      usdMicro: ceiling * 1e6,
    });
    receipt.operatorApproval = {
      quoteId: quote.quoteId,
      operation: "reasoning",
      maximumAuthorizedMicroUsd: ceiling * 1e6,
      quoteMicroUsd: Math.round(quote.maximumUsd * 1e6),
      approvedAt: new Date().toISOString(),
    };
    persist();
    await access
      .getByRole("button", { name: "Check approval", exact: true })
      .click();
    await access.getByText("Cloud credits approved", { exact: true }).waitFor();
  }
  // Operator sponsorship never substitutes for the separate text/cost and
  // provider-retention acknowledgements in the actual review UI.
  await review
    .getByRole("checkbox", { name: /Send this request, exactly/ })
    .check();
  await review
    .getByRole("checkbox", { name: /I reviewed the maximum cost/ })
    .check();
  await page.screenshot({ path: output + "/review.png" });
  await review.getByRole("button", { name: /Authorize up to US\$/ }).click();
  await agent.locator(".reasoning-usage").waitFor({ timeout: 105000 });
  await flushCaptures();
  receipt.usage = await agent.locator(".reasoning-usage").innerText();
  receipt.actions = await agent
    .locator(".agent-message.assistant .agent-message-text")
    .allTextContents();
  await page.screenshot({ path: output + "/actions.png" });
  await agent.getByRole("button", { name: "Close dialog" }).click();
  receipt.actualLipColor = await page
    .getByLabel("Custom makeup colour")
    .inputValue();
  if (site) {
    // The production bundle has no development module URL. Read the actual
    // shared mirror recipe through the mounted Digital Twin instead.
    await page
      .getByRole("button", { name: "Beauty profile", exact: true })
      .click();
    const hair = page.locator(".twin-recipe-details li").filter({
      has: page.getByText("Hair", { exact: true }),
    });
    await hair.waitFor();
    await hair.scrollIntoViewIfNeeded();
    receipt.hairRecipe = await hair.innerText();
    receipt.actualHairColor = receipt.hairRecipe.match(/#[0-9a-f]{6}/i)?.[0];
    receipt.hairEvidence = "Mounted Digital Twin current mirror recipe";
    await page.screenshot({ path: output + "/actual-controls.png" });
  } else {
    // Preserve loopback verification of the actual mounted store instance.
    receipt.actualHairColor = await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .map((x) => x.name)
        .filter((x) => /\/src\/state\/store\.ts/.test(x))
        .at(-1);
      if (!url) throw new Error("Mounted scene store was not found");
      const { useApp } = await import(url);
      return useApp.getState().look.hair.color;
    });
  }
  const calls = receipt.steps.flatMap((step) => step.calls ?? []);
  const feedback = receipt.feedback.flatMap((step) => step.feedback ?? []);
  receipt.actualToolResults = feedback.filter((result) =>
    calls.some(
      (call) => call.id === result.callId && call.name === result.name,
    ),
  );
  const succeededColour = (name, colour) =>
    calls.some(
      (call) =>
        call.name === name &&
        call.args?.color?.toLowerCase() === colour &&
        feedback.some(
          (result) =>
            result.callId === call.id &&
            result.name === call.name &&
            result.status === "succeeded",
        ),
    );
  receipt.completed =
    receipt.steps.at(-1)?.status === "done" &&
    receipt.steps.every(
      (step) => step.httpStatus >= 200 && step.httpStatus < 300,
    );
  receipt.verified =
    receipt.completed &&
    receipt.actualLipColor?.toLowerCase() === "#b35b6b" &&
    receipt.actualHairColor?.toLowerCase() === "#a35c36" &&
    receipt.paidStarts === 1 &&
    succeededColour("setLipColor", "#b35b6b") &&
    succeededColour("setHairColor", "#a35c36");
  if (!receipt.verified)
    throw new Error(
      "Live tool feedback and mounted controls did not verify both requested colours.",
    );
} catch (error) {
  receipt.error =
    error instanceof Error ? error.message : "Verification failed";
  process.exitCode = 1;
  await page?.screenshot({ path: output + "/failure.png" }).catch(() => {});
} finally {
  await flushCaptures();
  receipt.pageErrors = errors;
  receipt.finishedAt = new Date().toISOString();
  persist();
  await browser?.close();
  console.log(
    JSON.stringify({
      verified: receipt.verified ?? false,
      mode: receipt.mode,
      authorizeUsd: receipt.authorizeUsd,
      paidStarts: receipt.paidStarts,
      steps: receipt.steps.length,
      successfulToolResults:
        receipt.actualToolResults?.filter(
          (result) => result.status === "succeeded",
        ).length ?? 0,
      actualLipColor: receipt.actualLipColor,
      actualHairColor: receipt.actualHairColor,
      billingVerified: false,
      error: receipt.error,
      output,
    }),
  );
}
