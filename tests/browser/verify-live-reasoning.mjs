/** Manual operator verification. Not an automatic test: invokes a paid provider once. */
import { chromium } from "@playwright/test";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i], process.argv[i + 1]);
const ceiling = Number(args.get("--authorize-usd"));
if (!Number.isFinite(ceiling) || ceiling <= 0 || ceiling > 1)
  throw new Error(
    "Explicit --authorize-usd greater than zero and at most one is required.",
  );
const output = resolve(
  args.get("--output") ?? "cook/evidence/r06-claude-live-001",
);
if (existsSync(output + "/receipt.json"))
  throw new Error(
    "Existing receipt: inspect its billing state before choosing a new output. No paid automatic retry.",
  );
const api = new URL(args.get("--api") ?? "http://127.0.0.1:3002");
if (!["127.0.0.1", "localhost"].includes(api.hostname))
  throw new Error("Loopback API required.");
mkdirSync(output, { recursive: true });
const receipt = {
  format: "true-beauty-live-reasoning-receipt",
  version: 1,
  startedAt: new Date().toISOString(),
  fixture:
    "Nonpersonal explicit colour request; no images or personal context.",
  authorizeUsd: ceiling,
  paidStarts: 0,
  steps: [],
  billingVerified: false,
};
const persist = () =>
  writeFileSync(output + "/receipt.json", JSON.stringify(receipt, null, 2));
persist();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  serviceWorkers: "block",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  // Transparent forwarding to the actual local server; no scripted provider responses.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      !["/api/health", "/api/capabilities", "/api/session"].includes(path) &&
      !path.startsWith("/api/reasoning/")
    )
      throw new Error("Unexpected remote API path");
    const response = await route.fetch({
      url: api.origin + path,
      timeout: 35000,
    });
    if (path.startsWith("/api/reasoning/")) {
      const raw = await response.json();
      if (path === "/api/reasoning/capabilities")
        receipt.capabilities = {
          ready: raw.ready,
          provider: raw.provider,
          model: raw.model,
        };
      if (path === "/api/reasoning/quotes") receipt.quote = raw;
      if (
        path === "/api/reasoning/sessions" &&
        route.request().method() === "POST"
      )
        receipt.paidStarts++;
      if (path.endsWith("/step"))
        receipt.steps.push({ httpStatus: response.status(), ...raw });
      persist();
    }
    await route.fulfill({ response });
  });
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: "Your beauty companion", exact: true })
    .click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  await agent.getByLabel("Assistant mode").selectOption("remote");
  await agent.getByText(/claude-haiku-4-5-20251001/).waitFor();
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
  if (Object.keys(approved.context).length !== 0)
    throw new Error("Unexpected personal context");
  receipt.contextCategories = [];
  receipt.goal = approved.goal;
  persist();
  await review
    .getByRole("button", { name: "Get a maximum-cost quote" })
    .click();
  await page.waitForFunction(() => document.querySelector(".reasoning-quote"));
  if (!receipt.quote || receipt.quote.maximumUsd > ceiling)
    throw new Error("Quote exceeds explicit verification ceiling");
  await review
    .getByRole("checkbox", { name: /Send this request, exactly/ })
    .check();
  await review
    .getByRole("checkbox", { name: /I reviewed the maximum cost/ })
    .check();
  await page.screenshot({ path: output + "/review.png" });
  await review.getByRole("button", { name: /Authorize up to US\$/ }).click();
  await agent.locator(".reasoning-usage").waitFor({ timeout: 105000 });
  receipt.usage = await agent.locator(".reasoning-usage").innerText();
  receipt.actions = await agent
    .locator(".agent-message.assistant .agent-message-text")
    .allTextContents();
  await page.screenshot({ path: output + "/actions.png" });
  await agent.getByRole("button", { name: "Close dialog" }).click();
  receipt.actualLipColor = await page
    .getByLabel("Custom makeup colour")
    .inputValue();
  // Observe the actual mounted store instance used by this application.
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
  receipt.verified =
    receipt.actualLipColor.toLowerCase() === "#b35b6b" &&
    receipt.actualHairColor.toLowerCase() === "#a35c36" &&
    receipt.paidStarts === 1;
  if (!receipt.verified)
    throw new Error(
      "Live local tool outcome did not match both requested colours",
    );
} catch (error) {
  receipt.error =
    error instanceof Error ? error.message : "Verification failed";
  process.exitCode = 1;
  await page.screenshot({ path: output + "/failure.png" }).catch(() => {});
} finally {
  receipt.pageErrors = errors;
  receipt.finishedAt = new Date().toISOString();
  persist();
  await browser.close();
  console.log(
    JSON.stringify({
      verified: receipt.verified ?? false,
      paidStarts: receipt.paidStarts,
      steps: receipt.steps.length,
      error: receipt.error,
      output,
    }),
  );
}
