import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";

async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).first().click();
}

async function hash(page: Page, selector: string) {
  return page.locator(selector).evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let value = 2166136261;
    for (const byte of pixels) value = Math.imul(value ^ byte, 16777619);
    return value >>> 0;
  });
}

test("shared face gains only missing target hair, remains live through corrections at three widths, and Dressing targets reach 44px", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const posts: string[] = [],
    errors: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  const shared = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .reverse()
      .find(
        (name) => new URL(name).pathname === "/apps/web/src/state/store.ts",
      );
    const { useApp } = await import(url!);
    const snapshot = useApp.getState().portraitVision?.snapshot;
    return {
      face: snapshot?.landmarks.length,
      hair: Boolean(snapshot?.hairMask),
    };
  });
  expect(shared.face).toBeGreaterThan(467);
  expect(shared.hair).toBe(false);
  await navigate(page, "Look Remix");
  const main = page.locator(".remix-target-stage canvas");
  await expect(main).toHaveAttribute("data-hair-ready", "true", {
    timeout: 45000,
  });
  await expect(main).toHaveAttribute("data-face-source", "shared");
  await expect(main).toHaveAttribute("data-local-inferences", "1");
  await expect(main).toHaveAttribute("data-face-inferences", "0");
  await expect(main).toHaveAttribute("data-hair-inferences", "1");
  await page
    .getByLabel("Inspiration photograph", { exact: true })
    .setInputFiles("apps/web/public/images/portrait-2.jpg");
  await page
    .getByRole("button", { name: "Interpret this reference", exact: true })
    .click();
  await expect(page.locator(".look-remix")).toHaveAttribute(
    "data-remix-phase",
    "ready",
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: /^Hair/ }).click();
  const before = await hash(page, ".remix-detail-preview canvas");
  await page
    .getByLabel("Hair colour correction", { exact: true })
    .fill("#7635ad");
  await page.getByLabel("Hair presence", { exact: true }).fill("75");
  await expect
    .poll(() => hash(page, ".remix-detail-preview canvas"))
    .not.toBe(before);
  const after = await hash(page, ".remix-detail-preview canvas");
  const reports = [];
  await mkdir("cook/stills/r07-remix", { recursive: true });
  for (const [label, width, height] of [
    ["desktop", 1440, 1000],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    const presence = page.getByRole("slider", {
      name: "Hair presence",
      exact: true,
    });
    await presence.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await presence.focus();
    const preview = page.getByRole("region", {
      name: "Persistent target preview",
      exact: true,
    });
    await expect(preview).toHaveAttribute("data-pinned", "true");
    await expect(preview).toBeVisible();
    const detail = page.locator(".remix-detail-preview canvas");
    const detailBox = (await detail.boundingBox())!;
    expect(detailBox.y).toBeGreaterThanOrEqual(0);
    expect(detailBox.y + detailBox.height).toBeLessThan(height / 2);
    await expect
      .poll(async () => (await presence.boundingBox())!.y)
      .toBeGreaterThan(
        (await preview.boundingBox())!.y +
          (await preview.boundingBox())!.height,
      );
    await expect(preview).toContainText("Aligned colour preview");
    await page.keyboard.press("ArrowLeft");
    await expect(main).toHaveAttribute("data-local-inferences", "1");
    await expect(main).toHaveAttribute("data-face-inferences", "0");
    await expect(main).toHaveAttribute("data-hair-inferences", "1");
    await page.getByLabel("Before & after", { exact: true }).check();
    await page
      .getByLabel("Detail comparison split", { exact: true })
      .fill("35");
    await expect
      .poll(() => hash(page, ".remix-detail-preview canvas"))
      .not.toBe(after);
    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
    reports.push({
      label,
      width,
      height,
      preview: await preview.boundingBox(),
      detail: await detail.boundingBox(),
      presence: await presence.boundingBox(),
      violations: axe.violations.length,
    });
    await page.screenshot({
      path: `cook/stills/r07-remix/${label}-correction-${info.project.name}.png`,
    });
    await page.getByLabel("Before & after", { exact: true }).uncheck();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await navigate(page, "The studio");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  await navigate(page, "Look Remix");
  await expect(main).toHaveAttribute("data-hair-ready", "true", {
    timeout: 30000,
  });
  await expect(main).toHaveAttribute("data-face-source", "shared");
  await expect(main).toHaveAttribute("data-local-inferences", "0");
  await navigate(page, "My wardrobe");
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
  const targets = page.locator(
    ".dressing-swatches button, .dressing-colour-heading input, .dressing-stage button",
  );
  for (const target of await targets.all()) {
    const box = (await target.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  const width = page.getByRole("slider", { name: "Width", exact: true });
  await width.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await width.fill("0.72");
  const garmentPreview = (await page
    .locator(".dressing-edit-preview canvas")
    .boundingBox())!;
  expect(garmentPreview.y).toBeGreaterThanOrEqual(0);
  expect(garmentPreview.y + garmentPreview.height).toBeLessThan(422);
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: `cook/stills/r07-remix/mobile-dressing-${info.project.name}.png`,
  });
  await writeFile(
    `cook/stills/r07-remix/report-${info.project.name}.json`,
    JSON.stringify(
      {
        shared,
        before,
        after,
        reports,
        garmentPreview,
        dressingViolations: axe.violations.length,
        posts,
        errors,
      },
      null,
      2,
    ),
  );
  expect(posts).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("target preparation lifetime and availability", () => {
  test.use({ serviceWorkers: "block" });

  test("leaving Remix disposes an in-flight hair-only target worker and retains the next portrait", async ({
    page,
    context,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held = false;
    await context.route("**/models/hair_segmenter.tflite", async (route) => {
      held = true;
      await gate;
      await route.continue().catch(() => {});
    });
    try {
      await page.goto("/");
      await expect(page.locator(".mirror-state")).toContainText(
        "Face mesh connected",
        { timeout: 45000 },
      );
      await navigate(page, "Look Remix");
      await expect.poll(() => held).toBe(true);
      const workers = [...page.workers()];
      expect(workers.length).toBeGreaterThan(0);
      await navigate(page, "The studio");
      await expect
        .poll(() => workers.every((worker) => !page.workers().includes(worker)))
        .toBe(true);
      await page.locator(".mirror-label").click();
      await page
        .getByRole("button", { name: "Editorial light", exact: true })
        .click();
      release();
      await expect(page.locator(".mirror-state")).toContainText(
        "Face mesh connected",
        { timeout: 45000 },
      );
      await expect(page.locator(".mirror-media canvas")).toHaveAttribute(
        "data-source-url",
        "/images/portrait.jpg",
      );
      const state = await page.evaluate(async () => {
        const url = performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .reverse()
          .find(
            (name) => new URL(name).pathname === "/apps/web/src/state/store.ts",
          );
        const { useApp } = await import(url!);
        const current = useApp.getState();
        return {
          portrait: current.portraitUrl,
          snapshotSource: current.portraitVision?.url,
        };
      });
      expect(state).toEqual({
        portrait: "/images/portrait.jpg",
        snapshotSource: "/images/portrait.jpg",
      });
    } finally {
      release();
    }
  });

  test("a missing target hair model preserves shared face and clearly labels the unavailable correction", async ({
    page,
    context,
  }) => {
    await context.route("**/models/hair_segmenter.tflite", (route) =>
      route.abort("failed"),
    );
    await page.goto("/");
    await expect(page.locator(".mirror-state")).toContainText(
      "Face mesh connected",
      { timeout: 45000 },
    );
    await navigate(page, "Look Remix");
    const main = page.locator(".remix-target-stage canvas");
    await expect(main).toHaveAttribute("data-rendered", "aligned", {
      timeout: 30000,
    });
    await page
      .getByRole("button", { name: "Interpret this reference", exact: true })
      .click();
    await expect(page.locator(".look-remix")).toHaveAttribute(
      "data-remix-phase",
      "ready",
      { timeout: 45000 },
    );
    await page.getByRole("button", { name: /^Hair/ }).click();
    await expect(page.locator(".remix-inspector")).toContainText(
      "Hair preview is unavailable on this portrait",
      { timeout: 30000 },
    );
    const before = await main.getAttribute("data-local-inferences");
    await page
      .getByLabel("Hair colour correction", { exact: true })
      .fill("#7635ad");
    await page.getByLabel("Hair presence", { exact: true }).fill("75");
    await expect(main).toHaveAttribute("data-face-source", "shared");
    await expect(main).toHaveAttribute("data-face-inferences", "0");
    await expect(main).toHaveAttribute("data-hair-ready", "false");
    await expect(main).toHaveAttribute("data-local-inferences", before!);
    await expect(page.locator(".remix-inspector")).toContainText(
      "the original hair is shown",
    );
  });
});
