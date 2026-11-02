/** Explicit frontend contract harness. This does NOT verify live provider generation. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type {
  GenerationCapabilities,
  GenerationSpec,
  GenerationTaskView,
} from "../../apps/api/src/generationContracts";
const hair: GenerationSpec = { feature: "hair", hairColor: "src" },
  clothing: GenerationSpec = {
    feature: "clothing",
    garmentCategory: "upper_body",
    changeShoes: false,
    filterMultiPerson: "strict",
  };
const taskId = "11111111-1111-4111-8111-111111111111",
  quoteId = "22222222-2222-4222-8222-222222222222";
const fixtureHtml = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head><body style="margin:0"><div id="root"></div><script type="module">import '/@vite/client';import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;await import('/tests/browser/RemoteStudioHarness.tsx');</script></body></html>`;
async function harness(page: Page, ready = true) {
  let statusReads = 0,
    created = 0,
    deleted = 0,
    cancelled = 0,
    quoted = 0,
    current: GenerationTaskView | null = null,
    lastBody: Record<string, any> | undefined;
  const image = await readFile("apps/web/public/images/portrait-neutral.jpg");
  const capabilities: GenerationCapabilities = {
    provider: "Perfect Corp",
    credentialConfigured: ready,
    paidEnabled: ready,
    budgetConfigured: ready,
    liveVerified: false,
    features: {
      hair: {
        feature: "hair",
        configured: ready,
        pricingPlanConfigured: ready,
        readyForQuote: ready,
        allowedSpecs: ready ? [hair] : [],
        reason: ready
          ? "Contract fixture: ready to request a quote."
          : "The generation provider is not connected.",
        liveVerified: false,
      },
      clothing: {
        feature: "clothing",
        configured: ready,
        pricingPlanConfigured: ready,
        readyForQuote: ready,
        allowedSpecs: ready ? [clothing] : [],
        reason: ready
          ? "Contract fixture: ready to request a quote."
          : "The generation provider is not connected.",
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
  await page.route("**/__test/remote-studio", (r) =>
    r.fulfill({ contentType: "text/html", body: fixtureHtml }),
  );
  await page.route("**/api/session", (r) =>
    r.fulfill({ json: { csrfToken: "fixture-csrf" } }),
  );
  await page.route("**/api/generation/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (path.endsWith("/capabilities")) {
      await route.fulfill({ json: capabilities });
      return;
    }
    if (path === "/api/generation/quotes") {
      quoted++;
      const data = request.postDataJSON();
      expect(Object.keys(data)).toEqual(["spec"]);
      await route.fulfill({
        json: {
          quoteId,
          spec: data.spec,
          credits: 4,
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      });
      return;
    }
    if (path === "/api/generation/tasks" && request.method() === "GET") {
      await route.fulfill({ json: { tasks: current ? [current] : [] } });
      return;
    }
    if (path === "/api/generation/tasks" && request.method() === "POST") {
      created++;
      lastBody = request.postDataJSON();
      current = {
        taskId,
        feature: lastBody!.spec.feature,
        status: "running",
        expiresAt: new Date(Date.now() + 900000).toISOString(),
        pollAfterMs: 10000,
        notice: "Contract fixture task",
      };
      await route.fulfill({ status: 202, json: current });
      return;
    }
    if (path.endsWith("/cancel")) {
      cancelled++;
      current = {
        ...current!,
        status: "cancelled",
        notice: "Local waiting stopped. The provider may continue.",
      };
      await route.fulfill({ json: current });
      return;
    }
    if (path.endsWith("/image")) {
      await route.fulfill({ contentType: "image/jpeg", body: image });
      return;
    }
    if (
      path === `/api/generation/tasks/${taskId}` &&
      request.method() === "DELETE"
    ) {
      deleted++;
      current = null;
      await route.fulfill({
        json: { deletedLocal: true, upstreamDeletionSupported: false },
      });
      return;
    }
    if (path === `/api/generation/tasks/${taskId}`) {
      statusReads++;
      if (statusReads >= 2)
        current = {
          ...current!,
          status: "success",
          result: {
            kind: "ai-generated-image",
            provider: "perfect-corp",
            feature: current!.feature,
            imagePath: path + "/image",
            receivedAt: new Date().toISOString(),
            notice: "CONTRACT FIXTURE image: not a live generated result.",
          },
        };
      await route.fulfill({ json: current });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: "Unknown contract fixture route" },
    });
  });
  await page.goto("/__test/remote-studio");
  await expect(
    page.getByRole("heading", { name: "Imagine your next look." }),
  ).toBeVisible();
  return {
    created: () => created,
    quoted: () => quoted,
    deleted: () => deleted,
    cancelled: () => cancelled,
    lastBody: () => lastBody,
  };
}
async function prepare(page: Page) {
  await page
    .getByLabel("Upload generation portrait", { exact: true })
    .setInputFiles("apps/web/public/images/portrait-neutral.jpg");
  await page
    .getByLabel("Upload generation reference", { exact: true })
    .setInputFiles("apps/web/public/images/portrait-2.jpg");
}
async function authorize(page: Page) {
  await page
    .getByRole("button", { name: "Get a verified credit quote", exact: true })
    .click();
  await expect(page.getByText("4 credits", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Authorize and generate preview",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: /I have permission to use these images/,
    })
    .check();
  await page
    .getByRole("checkbox", { name: /I understand the provider may retain/ })
    .check();
  await page.getByLabel("Maximum provider credits I authorize").fill("4");
  await page
    .getByRole("button", {
      name: "Authorize and generate preview",
      exact: true,
    })
    .click();
}
test("unconnected generation prepares actual local image previews without paid requests", async ({
  page,
}, info) => {
  test.skip(
    process.env.TB_E2E_PRODUCTION === "1",
    "The visibly-labelled fixture harness is dev-only; production entry is tested separately.",
  );
  const f = await harness(page, false);
  await prepare(page);
  await expect(
    page.getByRole("img", { name: "Your selected generation source" }),
  ).toBeVisible();
  await expect(
    page.getByText("Generation is not connected yet", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Get a verified credit quote",
      exact: true,
    }),
  ).toBeDisabled();
  expect(f.created()).toBe(0);
  expect(f.quoted()).toBe(0);
  await page.screenshot({
    path: `cook/stills/r06/remote-unconnected-fixture-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Clear prepared photos from this panel",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("img", { name: "Your selected generation source" }),
  ).toHaveCount(0);
});
test("explicit quote and consent cause one task, genuine-status protocol and labelled result actions", async ({
  page,
}, info) => {
  test.skip(
    process.env.TB_E2E_PRODUCTION === "1",
    "The visibly-labelled fixture harness is dev-only; production entry is tested separately.",
  );
  const f = await harness(page);
  await prepare(page);
  expect(f.created()).toBe(0);
  await authorize(page);
  await expect(
    page.getByRole("button", { name: "Check existing task", exact: true }),
  ).toBeVisible();
  expect(f.created()).toBe(1);
  expect(f.lastBody()).toMatchObject({
    spec: hair,
    maxCredits: 4,
    consent: {
      uploadImages: true,
      rightsConfirmed: true,
      externalProcessing: true,
      providerRetentionAcknowledged: true,
    },
  });
  await page
    .getByRole("button", { name: "Check existing task", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Check existing task", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "AI-generated hairstyle preview from Perfect Corp",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("CONTRACT FIXTURE image: not a live generated result."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use this generated preview", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__remoteHarnessUse?.feature),
    )
    .toBe("hair");
  expect(f.created()).toBe(1);
  await page.screenshot({
    path: `cook/stills/r06/remote-result-CONTRACT-FIXTURE-${info.project.name}.png`,
    fullPage: true,
  });
  const resultUrl = await page
    .getByRole("img", {
      name: "AI-generated hairstyle preview from Perfect Corp",
    })
    .getAttribute("src");
  await page
    .getByRole("button", { name: "Delete local task and result", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "AI-generated hairstyle preview from Perfect Corp",
    }),
  ).toHaveCount(0);
  expect(f.deleted()).toBe(1);
  expect(resultUrl).toMatch(/^blob:/);
});
test("clothing generation uses its reference and can stop local waiting without a false provider cancellation", async ({
  page,
}, info) => {
  test.skip(
    process.env.TB_E2E_PRODUCTION === "1",
    "The visibly-labelled fixture harness is dev-only; production entry is tested separately.",
  );
  const f = await harness(page);
  await page
    .getByRole("button", { name: "Clothing studio", exact: true })
    .click();
  await prepare(page);
  await authorize(page);
  await expect(
    page.getByRole("button", { name: "Stop waiting", exact: true }),
  ).toBeVisible();
  expect(f.lastBody()?.spec).toEqual(clothing);
  expect(f.lastBody()?.reference.base64.length).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Stop waiting", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "You stopped waiting." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Stopping or deleting here does not cancel provider processing, refund credits or delete its copy. Provider retention terms still apply.",
    ),
  ).toBeVisible();
  expect(f.cancelled()).toBe(1);
  expect(f.created()).toBe(1);
  await page.screenshot({
    path: `cook/stills/r06/remote-clothing-stopped-fixture-${info.project.name}.png`,
    fullPage: true,
  });
});

test("the actual Dressing Room opens generation and keeps prepared photos local before authorization", async ({
  page,
}, info) => {
  const taskRequests: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/generation/tasks"))
      taskRequests.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await page
      .locator(".nav-rail")
      .getByRole("button", { name: "My wardrobe", exact: true })
      .click();
  } else
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
    page.getByRole("heading", { name: "Imagine your next look." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clothing studio", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await prepare(page);
  await expect(
    page.getByRole("img", { name: "Your selected generation source" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Selected garment reference" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: /AI-generated .* preview from Perfect Corp/,
    }),
  ).toHaveCount(0);
  expect(taskRequests).toHaveLength(0);
  await page.screenshot({
    path: `cook/stills/r06/remote-actual-app-entry-${info.project.name}.png`,
    fullPage: true,
  });
});
