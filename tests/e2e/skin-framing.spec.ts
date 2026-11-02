/** Local framing + mocked provider transport contracts. Never executes a paid request. */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
test.use({ serviceWorkers: "block" });
async function goSkin(page: Page) {
  await page.goto("/");
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
async function mockProvider(context: BrowserContext) {
  const tasks: Record<string, unknown>[] = [],
    quotes: Record<string, unknown>[] = [];
  await context.route("**/api/capabilities", (r) =>
    r.fulfill({
      json: {
        skinAnalysis: {
          configured: true,
          paidEnabled: true,
          pricingPlanConfigured: true,
          status: "requires-verified-quote",
          allowedActions: ["texture", "pore", "redness", "moisture"],
        },
      },
    }),
  );
  await context.route("**/api/session", (r) =>
    r.fulfill({ json: { csrfToken: "explicit-transport-fixture" } }),
  );
  await context.route("**/api/skin/**", (r) => {
    const path = new URL(r.request().url()).pathname;
    if (path === "/api/skin/quotes") {
      quotes.push(r.request().postDataJSON());
      return r.fulfill({
        json: {
          quoteId: "framing-quote-fixture",
          credits: 9,
          actions: ["texture", "pore", "redness", "moisture"],
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        },
      });
    }
    if (path === "/api/skin/tasks") {
      tasks.push(r.request().postDataJSON());
      return r.fulfill({ json: { taskId: "contract-task-fixture" } });
    }
    return r.fulfill({
      status: 404,
      json: { error: "No live provider traffic is allowed in this test" },
    });
  });
  return { tasks, quotes };
}
async function upload(
  page: Page,
  file = "apps/web/public/images/portrait-neutral.jpg",
) {
  await page.locator(".skin-source input[type=file]").setInputFiles(file);
  await expect(
    page.getByRole("img", {
      name: "Exact original image selected for provider upload",
    }),
  ).toBeVisible();
}
async function prepare(page: Page) {
  await page
    .getByRole("button", { name: "Prepare scan framing", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Exact temporary cropped image selected for provider upload",
    }),
  ).toBeVisible({ timeout: 45000 });
}
test("explicit framing shows exact encoded upload, preserves session source, and resets quote and all consent", async ({
  page,
  context,
}, info) => {
  const traffic = await mockProvider(context);
  await goSkin(page);
  await upload(page);
  const original = await page
      .getByRole("img", {
        name: "Exact original image selected for provider upload",
      })
      .getAttribute("src"),
    source = await page
      .locator(".skin-portrait canvas")
      .getAttribute("data-portrait-source");
  await page
    .getByRole("button", { name: "Get a credit quote", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /I consent to sending this portrait/ })
    .check();
  await page
    .getByRole("checkbox", { name: /I understand the provider processes/ })
    .check();
  await page
    .getByRole("spinbutton", { name: "Maximum credits I authorize" })
    .fill("9");
  await prepare(page);
  await expect(page.locator(".skin-quote")).toHaveCount(0);
  expect(traffic.tasks).toHaveLength(0);
  const preview = page.getByRole("img", {
      name: "Exact temporary cropped image selected for provider upload",
    }),
    prepared = await preview.getAttribute("src");
  expect(prepared).not.toBe(original);
  const dimensions = await preview.evaluate((img: HTMLImageElement) => ({
    width: img.naturalWidth,
    height: img.naturalHeight,
  }));
  expect(Math.min(dimensions.width, dimensions.height)).toBeGreaterThanOrEqual(
    480,
  );
  expect(Math.max(dimensions.width, dimensions.height)).toBeLessThanOrEqual(
    2560,
  );
  await expect(page.locator(".skin-portrait canvas")).toHaveAttribute(
    "data-portrait-source",
    source!,
  );
  await expect(page.locator(".skin-upload-preview")).toContainText(
    "session photograph is unchanged",
  );
  await page
    .getByRole("button", { name: "Get a credit quote", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /I consent to sending this portrait/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: /I understand the provider processes/ }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("spinbutton", { name: "Maximum credits I authorize" }),
  ).toHaveValue("");
  await page
    .getByRole("checkbox", { name: /I consent to sending this portrait/ })
    .check();
  await page
    .getByRole("checkbox", { name: /I understand the provider processes/ })
    .check();
  await page
    .getByRole("spinbutton", { name: "Maximum credits I authorize" })
    .fill("9");
  await page
    .getByRole("button", { name: "Authorize and send portrait", exact: true })
    .click();
  await expect.poll(() => traffic.tasks.length).toBe(1);
  expect(traffic.tasks[0].imageBase64).toBe(prepared!.split(",")[1]);
  expect(traffic.tasks[0].contentType).toBe("image/jpeg");
  await page
    .getByRole("button", { name: "Use original upload image", exact: true })
    .click();
  await expect(page.locator(".skin-quote")).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Exact original image selected for provider upload",
    }),
  ).toHaveAttribute("src", original!);
  expect(
    await page.evaluate(async () => {
      const url = "/packages/local-database/src/" + "index.ts";
      const { db } = await import(/* @vite-ignore */ url);
      return db.mediaAssets.count();
    }),
  ).toBe(0);
  await prepare(page);
  await page.screenshot({
    path: `cook/stills/skin-framing/prepared-${info.project.name}.png`,
    fullPage: true,
  });
});
test("delayed local JPEG and delayed quote are discarded after source changes", async ({
  page,
  context,
}) => {
  await mockProvider(context);
  await goSkin(page);
  await upload(page);
  await page.evaluate(() => {
    const native = HTMLCanvasElement.prototype.toBlob;
    Object.assign(window, { __framingNativeToBlob: native });
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (type === "image/jpeg" && this.width >= 480) {
        Object.assign(window, {
          __framingPending: true,
          __releaseFraming: () =>
            new Promise<void>((resolve) =>
              native.call(
                this,
                (blob) => {
                  callback(blob);
                  resolve();
                },
                type,
                quality,
              ),
            ),
        });
      } else native.call(this, callback, type, quality);
    };
  });
  await page
    .getByRole("button", { name: "Prepare scan framing", exact: true })
    .click();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Boolean(
            (window as unknown as { __framingPending?: boolean })
              .__framingPending,
          ),
        ),
      { timeout: 45000 },
    )
    .toBe(true);
  await upload(page, "apps/web/public/images/portrait-2.jpg");
  const next = await page
    .getByRole("img", {
      name: "Exact original image selected for provider upload",
    })
    .getAttribute("src");
  await page.evaluate(async () => {
    const state = window as unknown as {
      __releaseFraming: () => Promise<void>;
      __framingNativeToBlob: typeof HTMLCanvasElement.prototype.toBlob;
    };
    HTMLCanvasElement.prototype.toBlob = state.__framingNativeToBlob;
    await state.__releaseFraming();
  });
  await expect(
    page.getByRole("img", {
      name: "Exact temporary cropped image selected for provider upload",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("img", {
      name: "Exact original image selected for provider upload",
    }),
  ).toHaveAttribute("src", next!);
  let release!: () => void, started!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    pending = new Promise<void>((resolve) => {
      started = resolve;
    });
  await context.route("**/api/skin/quotes", async (r) => {
    started();
    await gate;
    await r.fulfill({
      json: {
        quoteId: "stale-quote",
        credits: 9,
        actions: ["texture"],
        expiresAt: new Date(Date.now() + 600000).toISOString(),
      },
    });
  });
  await page
    .getByRole("button", { name: "Get a credit quote", exact: true })
    .click();
  await pending;
  await upload(page);
  release();
  await expect(page.locator(".skin-quote")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Prepare scan framing", exact: true }),
  ).toBeEnabled();
});
test("generated source stays excluded and restoring the original clears temporary framing", async ({
  page,
  context,
}) => {
  const traffic = await mockProvider(context);
  await goSkin(page);
  await upload(page);
  await prepare(page);
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .find((n) => new URL(n).pathname === "/apps/web/src/state/store.ts");
    if (!url) throw new Error("Missing live store module");
    const { useApp } = await import(/* @vite-ignore */ url);
    useApp.getState().setGeneratedPortrait("/images/portrait-2.jpg", {
      kind: "ai-generated",
      provider: "perfect-corp",
      feature: "hair",
      createdAt: "2026-11-02T15:00:00Z",
    });
  });
  await expect(
    page.getByRole("button", { name: "Prepare scan framing", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Get a credit quote", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".skin-upload-preview")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Restore original photograph", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Exact original image selected for provider upload",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Exact temporary cropped image selected for provider upload",
    }),
  ).toHaveCount(0);
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find(
        (name) => new URL(name).pathname === "/apps/web/src/state/store.ts",
      );
    if (!url) throw new Error("Missing live store module");
    const { useApp } = await import(/* @vite-ignore */ url);
    useApp.getState().setGeneratedPortrait(
      "/images/portrait-2.jpg",
      {
        kind: "ai-generated",
        provider: "perfect-corp",
        feature: "clothing",
        createdAt: "2026-11-02T15:00:00Z",
      },
      { restored: true },
    );
  });
  await expect(
    page.getByRole("button", {
      name: "Restore original photograph",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Use studio portrait", exact: true })
    .click();
  await expect(page.locator(".skin-portrait canvas")).toHaveAttribute(
    "data-portrait-source",
    "/images/portrait-neutral.jpg",
  );
  await expect(
    page.getByRole("button", { name: "Get a credit quote", exact: true }),
  ).toBeDisabled();
  expect(traffic.tasks).toHaveLength(0);
});
test("actual no-face inference gives manual capture guidance and sends no requests", async ({
  page,
  context,
}) => {
  const traffic = await mockProvider(context);
  await goSkin(page);
  const bytes = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 1000;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#999";
    ctx.fillRect(0, 0, 800, 1000);
    return c.toDataURL("image/jpeg").split(",")[1];
  });
  await page.locator(".skin-source input[type=file]").setInputFiles({
    name: "empty-capture.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(bytes, "base64"),
  });
  await expect(
    page.getByRole("img", {
      name: "Exact original image selected for provider upload",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Prepare scan framing", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Face landmarks are not ready" }),
  ).toBeVisible({ timeout: 45000 });
  expect(traffic.quotes).toHaveLength(0);
  expect(traffic.tasks).toHaveLength(0);
});
