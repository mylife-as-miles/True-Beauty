import { test, expect, type Page } from "@playwright/test";
async function openSkin(page: Page) {
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i, exact: true }),
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
}
async function rawPortraitHash(page: Page) {
  return page.locator(".skin-portrait canvas").evaluate(async (node) => {
    const c = node as HTMLCanvasElement;
    const bytes = c
      .getContext("2d")!
      .getImageData(0, 0, c.width, c.height).data;
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  });
}
test("real portrait region lenses focus skin hair and eyes without changing source pixels", async ({
  page,
}, info) => {
  await page.goto("/");
  await openSkin(page);
  await expect(
    page.getByRole("button", { name: "Explore eyes colour", exact: true }),
  ).toBeDisabled();
  // Capture genuine model output; the fixture never substitutes landmarks.
  await page.evaluate(async () => {
    const path = "/packages/vision-core/src/index.ts";
    const { VisionPipeline, VisionWorkerClient } = await import(path);
    for (const Engine of [VisionPipeline, VisionWorkerClient]) {
      const original = Engine.prototype.analyzeImage;
      Engine.prototype.analyzeImage = async function (
        this: unknown,
        ...args: unknown[]
      ) {
        const result = await original.apply(this, args);
        if (result.landmarks[468])
          Object.assign(window, {
            __skinIris468: {
              x: result.landmarks[468].x,
              y: result.landmarks[468].y,
            },
          });
        return result;
      };
    }
  });
  await page
    .getByRole("button", { name: "Read my colours locally", exact: true })
    .click();
  await expect(
    page.getByText("Photo-based colour suggestion", { exact: true }),
  ).toBeVisible({ timeout: 45000 });
  const original = await rawPortraitHash(page);
  await expect(page.locator(".skin-region-lens")).toHaveCount(3);
  const irisAlignment = () =>
    page.evaluate(() => {
      const iris = (
        window as unknown as { __skinIris468: { x: number; y: number } }
      ).__skinIris468;
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".skin-portrait canvas",
      )!;
      const rect = canvas.getBoundingClientRect();
      const marker = document
        .querySelector<HTMLElement>(
          '[aria-label="Focus eyes region"] .skin-lens-ring',
        )!
        .getBoundingClientRect();
      const target = {
        x: rect.left + iris.x * rect.width,
        y: rect.top + iris.y * rect.height,
      };
      const center = {
        x: marker.left + marker.width / 2,
        y: marker.top + marker.height / 2,
      };
      return {
        target,
        center,
        errorPx: Math.hypot(target.x - center.x, target.y - center.y),
      };
    });
  const fullViewAlignment = await irisAlignment();
  expect(fullViewAlignment.errorPx).toBeLessThan(1.5);

  await page
    .getByRole("button", { name: "Explore eyes colour", exact: true })
    .click();
  await expect(page.locator(".skin-portrait")).toHaveAttribute(
    "data-focused-region",
    "eye",
  );
  await expect(page.locator(".skin-portrait")).toHaveAttribute(
    "data-zoom",
    "2.4",
  );
  await expect(page.locator(".skin-region-reading")).toContainText(
    "Eyes colour",
  );
  await expect(
    page.locator('[data-colour-region="eye"] .skin-lens-ring'),
  ).toBeInViewport({ ratio: 1 });
  await expect
    .poll(async () => (await irisAlignment()).errorPx)
    .toBeLessThan(1.5);
  const focusedAlignment = await irisAlignment();
  await info.attach("genuine-iris-marker-alignment", {
    body: JSON.stringify({ fullViewAlignment, focusedAlignment }),
    contentType: "application/json",
  });
  await page.screenshot({
    path: `cook/stills/r05/skin-eyes-in-viewport-${info.project.name}.png`,
  });

  await expect(page.locator(".skin-region-reading")).toContainText(
    "away from the pupil",
  );
  await page
    .getByRole("button", { name: "Explore hair colour", exact: true })
    .click();
  await expect(page.locator(".skin-portrait")).toHaveAttribute(
    "data-focused-region",
    "hair",
  );
  await expect(page.locator(".skin-region-reading")).toContainText(
    "detected hair area",
  );
  await expect(
    page.locator('[data-colour-region="hair"] .skin-lens-ring'),
  ).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "Zoom into portrait", exact: true })
    .click();
  await expect(page.getByLabel("Portrait zoom", { exact: true })).toHaveText(
    "180%",
  );
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await expect(page.locator(".skin-portrait")).toHaveAttribute(
    "data-zoom",
    "1.0",
  );
  await expect(page.locator(".skin-portrait")).toHaveAttribute(
    "data-focused-region",
    "full",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Explore skin colour", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".skin-portrait")).toHaveAttribute(
    "data-focused-region",
    "skin",
  );
  await expect(page.locator(".skin-region-reading")).toContainText("camera");
  expect(await rawPortraitHash(page)).toBe(original);
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    page.locator('[data-colour-region="eye"] .skin-lens-ring'),
  ).toBeInViewport({ ratio: 1 });
  const stableScroll = await page.evaluate(() => window.scrollY);
  await page
    .getByRole("button", { name: "Focus eyes region", exact: true })
    .click();
  await expect(page.locator(".skin-portrait")).toHaveAttribute(
    "data-focused-region",
    "eye",
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(
    Math.abs((await page.evaluate(() => window.scrollY)) - stableScroll),
  ).toBeLessThanOrEqual(1);
  await expect(
    page.locator('[data-colour-region="eye"] .skin-lens-ring'),
  ).toBeInViewport({ ratio: 1 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `cook/stills/r05/skin-colour-${info.project.name}.png`,
    fullPage: true,
  });
  await page.locator(".skin-portrait-pane").screenshot({
    path: `cook/stills/r05/skin-lenses-${info.project.name}.png`,
  });
});
test("a palette shade applies lipstick and returns to the same session portrait in the mirror", async ({
  page,
}, info) => {
  const paid: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/skin/tasks"))
      paid.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Foundation", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Golden", exact: true }).click();
  await openSkin(page);
  await page
    .locator(".skin-source input[type=file]")
    .setInputFiles("apps/web/public/images/portrait-2.jpg");
  await expect(
    page.getByRole("button", { name: "Read my colours locally", exact: true }),
  ).toBeEnabled();
  const portrait = await page
    .locator(".skin-portrait canvas")
    .getAttribute("data-portrait-source");
  await page.getByLabel("Correct skin colour").fill("#82543a");
  const shade = page.locator(".skin-palette-colours button").first();
  const hex = await shade.locator(".skin-palette-chip").evaluate((node) => {
    const rgb = getComputedStyle(node)
      .backgroundColor.match(/\d+/g)!
      .slice(0, 3)
      .map(Number);
    return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
  });
  await shade.click();
  await expect(
    page.getByRole("heading", { name: "A little more you." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Makeup", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("checkbox", { name: "Enable Lip colour", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Enable Lip colour", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".shade-detail input[type=color]")).toHaveValue(
    hex,
  );
  await page.screenshot({
    path: `cook/stills/r05/skin-to-mirror-${info.project.name}.png`,
    fullPage: true,
  });
  await openSkin(page);
  await expect(page.locator(".skin-portrait canvas")).toHaveAttribute(
    "data-portrait-source",
    portrait!,
  );
  expect(paid).toHaveLength(0);
});
