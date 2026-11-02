/** Hosted approval UI contracts. All /api traffic is intercepted; no provider calls or spending. */
import { test, expect, type Page, type Locator } from "@playwright/test";
import type { GenerationCapabilities } from "../../apps/api/src/generationContracts";

test.use({ serviceWorkers: "block" });
const csrfToken = "explicit-hosted-browser-fixture";
const sessionId = "11111111-1111-4111-8111-111111111111";
const taskId = "33333333-3333-4333-8333-333333333333";
const fixtureHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head><body style="margin:0"><div id="root"></div><script type="module">import '/@vite/client';import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/tests/browser/RemoteStudioHarness.tsx');</script></body></html>`;
interface QuoteSummary {
  id: string;
  operation: string;
  credits: number;
  usdMicro: number;
  expiresAt: number;
}
async function hostedFixture(
  page: Page,
  options: { operator?: boolean; accessFailure?: boolean } = {},
) {
  let sequence = 0;
  const approved = new Set<string>();
  const pending = new Set<string>();
  const quotes = new Map<string, QuoteSummary>();
  const starts: { path: string; body: any }[] = [];
  const approvalRequests: string[] = [];
  const operatorApprovals: string[] = [];
  const quoteBodies: { path: string; body: any }[] = [];
  const nextQuote = (operation: string) => {
    const id = `${(++sequence).toString(16).padStart(8, "0")}-2222-4222-8222-222222222222`;
    const summary = {
      id,
      operation,
      credits: operation === "reasoning" ? 0 : operation === "skin" ? 9 : 4,
      usdMicro: operation === "reasoning" ? 20000 : 0,
      expiresAt: Date.now() + 300000,
    };
    quotes.set(id, summary);
    return summary;
  };
  const generation: GenerationCapabilities = {
    provider: "Perfect Corp",
    credentialConfigured: true,
    paidEnabled: true,
    budgetConfigured: true,
    liveVerified: false,
    features: {
      hair: {
        feature: "hair",
        configured: true,
        pricingPlanConfigured: true,
        readyForQuote: true,
        allowedSpecs: [{ feature: "hair", hairColor: "src" }],
        reason: "Browser contract fixture only.",
        liveVerified: false,
      },
      clothing: {
        feature: "clothing",
        configured: true,
        pricingPlanConfigured: true,
        readyForQuote: true,
        allowedSpecs: [
          {
            feature: "clothing",
            garmentCategory: "upper_body",
            changeShoes: false,
            filterMultiPerson: "strict",
          },
        ],
        reason: "Browser contract fixture only.",
        liveVerified: false,
      },
    },
    retention: {
      localMinutes: 15,
      providerDays: 30,
      source: "https://docs.perfectcorp.com/develop/file_retention_period.md",
      upstreamCancellationSupported: false,
      upstreamDeletionSupported: false,
    },
  };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (!path.startsWith("/api/")) return route.continue();
    const method = request.method();
    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, json: value });
    if (path === "/api/session") return json({ csrfToken, hosted: true });
    if (path === "/api/operator/status")
      return json({ operator: options.operator === true });
    if (path === "/api/operator/approvals" && method === "GET")
      return json({ requests: [...pending].map((id) => quotes.get(id)) });
    const operatorMatch = path.match(
      /^\/api\/operator\/approvals\/([^/]+)\/approve$/,
    );
    if (operatorMatch) {
      expect(options.operator).toBe(true);
      expect(method).toBe("POST");
      expect(request.headers()["x-csrf-token"]).toBe(csrfToken);
      expect(request.postDataJSON()).toEqual({});
      operatorApprovals.push(operatorMatch[1]);
      approved.add(operatorMatch[1]);
      pending.delete(operatorMatch[1]);
      return json({ approved: true });
    }
    const accessMatch = path.match(/^\/api\/access\/quotes\/([^/]+)$/);
    if (accessMatch) {
      if (options.accessFailure)
        return json({ error: "Approval service fixture unavailable." }, 503);
      return json({
        quoteId: accessMatch[1],
        hosted: true,
        approved: approved.has(accessMatch[1]),
        operator: false,
        reason: approved.has(accessMatch[1])
          ? "This exact quote is approved."
          : "This exact quote needs Site owner approval.",
      });
    }
    const requestMatch = path.match(/^\/api\/access\/requests\/([^/]+)$/);
    if (requestMatch) {
      expect(method).toBe("POST");
      expect(request.headers()["x-csrf-token"]).toBe(csrfToken);
      expect(request.postDataJSON()).toEqual({});
      expect(quotes.has(requestMatch[1])).toBe(true);
      approvalRequests.push(requestMatch[1]);
      pending.add(requestMatch[1]);
      return json({
        approved: approved.has(requestMatch[1]),
        requested: true,
        hosted: true,
      });
    }
    if (path === "/api/capabilities")
      return json({
        skinAnalysis: {
          configured: true,
          paidEnabled: true,
          pricingPlanConfigured: true,
          status: "requires-verified-quote",
          allowedActions: ["texture", "pore", "redness", "moisture"],
        },
      });
    if (path === "/api/reasoning/capabilities")
      return json({
        configured: true,
        paidEnabled: true,
        ready: true,
        model: "fixture-hosted-model",
        provider: "Browser fixture only",
        liveVerified: false,
        unavailableReason: null,
        maxSteps: 4,
        imagesAccepted: false,
        retention: "Browser fixture; no remote provider.",
      });
    if (path === "/api/reasoning/quotes") {
      const body = request.postDataJSON();
      quoteBodies.push({ path, body });
      const q = nextQuote("reasoning");
      return json({
        quoteId: q.id,
        maximumUsd: q.usdMicro / 1e6,
        currency: "USD",
        maxSteps: body.maxSteps,
        maxOutputTokens: body.maxOutputTokens,
        inputTokenCeiling: 32000,
        expiresAt: new Date(q.expiresAt).toISOString(),
        model: "fixture-hosted-model",
        pricingProvenance: {
          sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
          reviewedAt: new Date().toISOString(),
          kind: "operator-reviewed-upper-bound",
        },
        note: "Browser contract quote; no paid call.",
      });
    }
    if (path === "/api/reasoning/sessions" && method === "POST") {
      const body = request.postDataJSON();
      expect(approved.has(body.quoteId)).toBe(true);
      starts.push({ path, body });
      return json({ sessionId, reservedMaximumUsd: 0.02 });
    }
    if (path === `/api/reasoning/sessions/${sessionId}/step`)
      return json({
        status: "done",
        calls: [],
        guidance: "Browser fixture completed without a provider call.",
        stepsUsed: 1,
        stepsRemaining: 0,
        usage: { inputTokens: 10, outputTokens: 10 },
      });
    if (path === `/api/reasoning/sessions/${sessionId}` && method === "DELETE")
      return json({ cancelled: true });
    if (path === "/api/generation/capabilities") return json(generation);
    if (path === "/api/generation/quotes") {
      const body = request.postDataJSON();
      quoteBodies.push({ path, body });
      const q = nextQuote(body.spec.feature);
      return json({
        quoteId: q.id,
        spec: body.spec,
        credits: q.credits,
        expiresAt: new Date(q.expiresAt).toISOString(),
      });
    }
    if (path === "/api/generation/tasks" && method === "GET")
      return json({ tasks: [] });
    if (path === "/api/generation/tasks" && method === "POST") {
      const body = request.postDataJSON();
      expect(approved.has(body.quoteId)).toBe(true);
      starts.push({ path, body });
      return json(
        {
          taskId,
          feature: body.spec.feature,
          status: "running",
          expiresAt: new Date(Date.now() + 900000).toISOString(),
          pollAfterMs: 10000,
          notice: "Browser fixture only.",
        },
        202,
      );
    }
    if (path.startsWith(`/api/generation/tasks/${taskId}`))
      return json({
        taskId,
        feature: "hair",
        status: "running",
        expiresAt: new Date(Date.now() + 900000).toISOString(),
        pollAfterMs: 10000,
        notice: "Browser fixture only.",
      });
    if (path === "/api/skin/quotes") {
      const body = request.postDataJSON();
      quoteBodies.push({ path, body });
      const q = nextQuote("skin");
      return json({
        quoteId: q.id,
        credits: q.credits,
        actions: body.actions,
        expiresAt: new Date(q.expiresAt).toISOString(),
      });
    }
    if (path === "/api/skin/tasks" && method === "POST") {
      const body = request.postDataJSON();
      expect(approved.has(body.quoteId)).toBe(true);
      starts.push({ path, body });
      return json({ taskId });
    }
    return json(
      {
        error:
          "No external traffic or unhandled API route is allowed by this browser fixture.",
      },
      404,
    );
  });
  return {
    approved,
    pending,
    quotes,
    starts,
    approvalRequests,
    operatorApprovals,
    quoteBodies,
    nextQuote,
  };
}
async function openReasoning(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your beauty companion", exact: true })
    .click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  await agent.getByLabel("Assistant mode").selectOption("remote");
  await expect(agent.getByText(/fixture-hosted-model/)).toBeVisible();
  await agent
    .getByLabel("Your beauty request")
    .fill("A rose lip, with no personal context");
  await agent.getByRole("button", { name: "Send request" }).click();
  const review = agent.getByRole("region", {
    name: "Review connected reasoning request",
  });
  await review.getByRole("button", { name: "Prepare exact preview" }).click();
  await review
    .getByRole("button", { name: "Get a maximum-cost quote" })
    .click();
  await expect(
    review.getByRole("region", { name: "Sponsored cloud access" }),
  ).toContainText("Site owner approval");
  return review;
}
async function acknowledgeReasoning(review: Locator) {
  await review
    .getByRole("checkbox", { name: /Send this request, exactly/ })
    .check();
  await review
    .getByRole("checkbox", { name: /I reviewed the maximum cost/ })
    .check();
}
async function requestAndApprove(
  _page: Page,
  f: Awaited<ReturnType<typeof hostedFixture>>,
  region: Locator,
) {
  await region
    .getByRole("button", { name: "Request approval", exact: true })
    .click();
  await expect(region).toContainText(
    "No image, prompt or paid task has been sent.",
  );
  expect(f.starts).toHaveLength(0);
  const requested = f.approvalRequests.at(-1)!;
  expect(f.pending.has(requested)).toBe(true);
  f.approved.add(requested);
  await region
    .getByRole("button", { name: "Check approval", exact: true })
    .click();
  await expect(region).toContainText("Cloud credits approved");
  return requested;
}

test("hosted reasoning requires exact approval and new quote limits invalidate an earlier approval", async ({
  page,
}) => {
  const f = await hostedFixture(page);
  const review = await openReasoning(page);
  const run = review.getByRole("button", {
    name: "Authorize up to US$0.020000 and run",
    exact: true,
  });
  await acknowledgeReasoning(review);
  await expect(run).toBeDisabled();
  expect(f.starts).toHaveLength(0);
  expect(f.quoteBodies[0].body).not.toHaveProperty("goal");
  expect(f.quoteBodies[0].body).not.toHaveProperty("context");
  const oldQuote = await requestAndApprove(
    page,
    f,
    review.getByRole("region", { name: "Sponsored cloud access" }),
  );
  await expect(run).toBeEnabled();
  await review.getByLabel("Maximum model turns").selectOption("1");
  await expect(run).toHaveCount(0);
  await review
    .getByRole("button", { name: "Get a maximum-cost quote" })
    .click();
  await expect(
    review.getByRole("region", { name: "Sponsored cloud access" }),
  ).toContainText("Site owner approval");
  await acknowledgeReasoning(review);
  await expect(run).toBeDisabled();
  expect(f.starts).toHaveLength(0);
  const nextQuote = await requestAndApprove(
    page,
    f,
    review.getByRole("region", { name: "Sponsored cloud access" }),
  );
  expect(nextQuote).not.toBe(oldQuote);
  await expect(run).toBeEnabled();
  expect(f.starts).toHaveLength(0);
  await run.click();
  await expect.poll(() => f.starts.length).toBe(1);
  expect(f.starts[0].body.quoteId).toBe(nextQuote);
  expect(f.starts[0].body.payload.context).toEqual({});
  expect(f.starts[0].body.consent.textTransmission).toBe(true);
});

test("hosted approval lookup failures keep reasoning closed even with separate text and cost consent", async ({
  page,
}) => {
  await hostedFixture(page, { accessFailure: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your beauty companion", exact: true })
    .click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  await agent.getByLabel("Assistant mode").selectOption("remote");
  await agent.getByLabel("Your beauty request").fill("A rose lip");
  await agent.getByRole("button", { name: "Send request" }).click();
  const review = agent.getByRole("region", {
    name: "Review connected reasoning request",
  });
  await review.getByRole("button", { name: "Prepare exact preview" }).click();
  await review
    .getByRole("button", { name: "Get a maximum-cost quote" })
    .click();
  const access = review.getByRole("region", { name: "Sponsored cloud access" });
  await expect(access.getByRole("alert")).toContainText(
    "Approval service fixture unavailable.",
  );
  await acknowledgeReasoning(review);
  await expect(
    review.getByRole("button", {
      name: "Authorize up to US$0.020000 and run",
      exact: true,
    }),
  ).toBeDisabled();
});

test("hosted image generation sends prepared images only after approval and separate upload consent", async ({
  page,
}) => {
  const f = await hostedFixture(page);
  await page.route("**/__test/cloud-generation", (route) =>
    route.fulfill({ contentType: "text/html", body: fixtureHtml }),
  );
  await page.goto("/__test/cloud-generation");
  await expect(
    page.getByRole("heading", { name: "Imagine your next look." }),
  ).toBeVisible();
  await page
    .getByLabel("Upload generation portrait", { exact: true })
    .setInputFiles("apps/web/public/images/portrait-neutral.jpg");
  await page
    .getByLabel("Upload generation reference", { exact: true })
    .setInputFiles("apps/web/public/images/portrait-2.jpg");
  await page
    .getByRole("button", { name: "Get a verified credit quote", exact: true })
    .click();
  const access = page.getByRole("region", { name: "Sponsored cloud access" });
  await expect(access).toContainText("Site owner approval");
  await page
    .getByRole("checkbox", { name: /I have permission to use these images/ })
    .check();
  await page
    .getByRole("checkbox", { name: /I understand the provider may retain/ })
    .check();
  await page.getByLabel("Maximum provider credits I authorize").fill("4");
  const run = page.getByRole("button", {
    name: "Authorize and generate preview",
    exact: true,
  });
  await expect(run).toBeDisabled();
  expect(f.starts).toHaveLength(0);
  expect(f.quoteBodies[0].body).toEqual({
    spec: { feature: "hair", hairColor: "src" },
  });
  const approvedQuote = await requestAndApprove(page, f, access);
  await expect(run).toBeEnabled();
  expect(f.starts).toHaveLength(0);
  await run.click();
  await expect.poll(() => f.starts.length).toBe(1);
  expect(f.starts[0]).toMatchObject({
    path: "/api/generation/tasks",
    body: {
      quoteId: approvedQuote,
      consent: {
        uploadImages: true,
        rightsConfirmed: true,
        externalProcessing: true,
        providerRetentionAcknowledged: true,
      },
    },
  });
  expect(f.starts[0].body.source.base64.length).toBeGreaterThan(100);
  expect(f.starts[0].body.reference.base64.length).toBeGreaterThan(100);
});

async function goSkin(page: Page) {
  await page.goto("/");
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) {
    await menu.click();
    await page
      .locator(".nav-rail")
      .getByRole("button", { name: "Skin & rituals", exact: true })
      .click();
  } else
    await page
      .locator(".topnav")
      .getByRole("button", { name: "Skin & rituals", exact: true })
      .click();
  await expect(
    page.getByRole("heading", { name: "Skin, understood." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skin & care", exact: true }).click();
}
async function skinConsent(page: Page) {
  await page
    .getByRole("checkbox", { name: /I consent to sending this portrait/ })
    .check();
  await page
    .getByRole("checkbox", { name: /I understand the provider processes/ })
    .check();
  await page
    .getByRole("spinbutton", { name: "Maximum credits I authorize" })
    .fill("9");
}
test("hosted skin upload waits for approval and replacing the photograph invalidates the approved quote", async ({
  page,
}) => {
  const f = await hostedFixture(page);
  await goSkin(page);
  await page
    .locator(".skin-source input[type=file]")
    .setInputFiles("apps/web/public/images/portrait-neutral.jpg");
  await expect(
    page.getByRole("img", {
      name: "Exact original image selected for provider upload",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Get a credit quote", exact: true })
    .click();
  const access = page.getByRole("region", { name: "Sponsored cloud access" });
  await expect(access).toContainText("Site owner approval");
  await skinConsent(page);
  const run = page.getByRole("button", {
    name: "Authorize and send portrait",
    exact: true,
  });
  await expect(run).toBeDisabled();
  expect(f.starts).toHaveLength(0);
  const oldQuote = await requestAndApprove(page, f, access);
  await expect(run).toBeEnabled();
  await page
    .locator(".skin-source input[type=file]")
    .setInputFiles("apps/web/public/images/portrait-2.jpg");
  await expect(page.locator(".skin-quote")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Get a credit quote", exact: true })
    .click();
  await expect(access).toContainText("Site owner approval");
  await skinConsent(page);
  await expect(run).toBeDisabled();
  expect(f.starts).toHaveLength(0);
  const newQuote = await requestAndApprove(page, f, access);
  expect(newQuote).not.toBe(oldQuote);
  await run.click();
  await expect.poll(() => f.starts.length).toBe(1);
  expect(f.starts[0]).toMatchObject({
    path: "/api/skin/tasks",
    body: {
      quoteId: newQuote,
      contentType: "image/jpeg",
      maxCredits: 9,
      consent: {
        uploadImage: true,
        externalProcessing: true,
        providerRetentionAcknowledged: true,
      },
    },
  });
  expect(f.starts[0].body.imageBase64.length).toBeGreaterThan(100);
});

test("operator pending queue approves only the chosen quote without starting a paid task", async ({
  page,
}) => {
  const f = await hostedFixture(page, { operator: true });
  const skin = f.nextQuote("skin"),
    reasoning = f.nextQuote("reasoning");
  f.pending.add(skin.id);
  f.pending.add(reasoning.id);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your data, your choice", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Cloud access", exact: true });
  await expect(panel.getByText("Skin analysis", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("Beauty reasoning", { exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText("9 provider credits");
  await expect(panel).toContainText("Up to US$0.020000");
  expect(f.starts).toHaveLength(0);
  const skinRow = panel.locator("li").filter({ hasText: skin.id });
  await skinRow
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect(skinRow).toHaveCount(0);
  await expect(panel.locator("li")).toHaveCount(1);
  expect(f.operatorApprovals).toEqual([skin.id]);
  expect(f.approved.has(reasoning.id)).toBe(false);
  expect(f.starts).toHaveLength(0);
  await panel
    .locator("li")
    .getByRole("button", { name: "Approve request", exact: true })
    .click();
  await expect(
    panel.getByText("No cloud requests are waiting.", { exact: true }),
  ).toBeVisible();
  expect(f.operatorApprovals).toEqual([skin.id, reasoning.id]);
  expect(f.starts).toHaveLength(0);
});
