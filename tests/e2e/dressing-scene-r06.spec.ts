import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
async function nav(page: Page, name: string) {
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
      .getByRole("button", { name, exact: true })
      .click();
  } else
    await page
      .locator(".topnav")
      .getByRole("button", { name, exact: true })
      .click();
}
async function dressing(page: Page) {
  await nav(page, "My wardrobe");
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Wear the feeling.", exact: true }),
  ).toBeVisible();
}
test("shared mirror cosmetics, hair, accessories and light alter garment composition without re-inference or altering Skin input", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  await page
    .getByRole("button", { name: "Apply Lip colour shade 5", exact: true })
    .click();
  await page.getByRole("slider", { name: "Intensity", exact: true }).fill("90");
  await page.getByRole("button", { name: "Hair", exact: true }).click();
  await page.getByRole("button", { name: "Copper", exact: true }).click();
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Preview glasses", exact: true })
    .check();
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Golden", exact: true }).click();
  const source = await page
    .locator(".mirror-media canvas")
    .getAttribute("data-source-url");
  await dressing(page);
  const canvas = page.locator(".dressing-stage canvas");
  await expect(canvas).toHaveAttribute("data-portrait-source", source!);
  await expect(canvas).toHaveAttribute("data-face-source", "shared", {
    timeout: 45000,
  });
  await expect(canvas).toHaveAttribute("data-face-inferences", "0");
  const calls = await canvas.getAttribute("data-local-inferences");
  await canvas.evaluate((c: HTMLCanvasElement) => {
    (c as HTMLCanvasElement & { __reference?: Uint8ClampedArray }).__reference =
      c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
  });
  await page
    .getByRole("checkbox", { name: "Include current mirror look", exact: true })
    .uncheck();
  await expect(canvas).toHaveAttribute("data-mirror-look", "false");
  const change = await canvas.evaluate((c: HTMLCanvasElement) => {
    const ref = c as HTMLCanvasElement & { __reference?: Uint8ClampedArray };
    const previous = ref.__reference!;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let pixels = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        Math.abs(data[i] - previous[i]) +
          Math.abs(data[i + 1] - previous[i + 1]) +
          Math.abs(data[i + 2] - previous[i + 2]) >
        3
      )
        pixels++;
    delete ref.__reference;
    return pixels;
  });
  expect(change).toBeGreaterThan(1000);
  await page
    .getByRole("checkbox", { name: "Include current mirror look", exact: true })
    .check();
  await page.getByRole("slider", { name: "Width", exact: true }).fill("0.65");
  await page
    .getByRole("button", { name: "Choose garment colour #d2bc9c", exact: true })
    .click();
  await expect(canvas).toHaveAttribute("data-local-inferences", calls!);
  await expect(canvas).toHaveAttribute("data-face-inferences", "0");
  await page.screenshot({
    path: `cook/stills/r06-fashion/shared-scene-${info.project.name}.png`,
    fullPage: true,
  });
  await nav(page, "Skin & rituals");
  const skin = page.locator(".skin-portrait canvas");
  await expect(page.locator(".skin-status")).toContainText("Portrait ready.");
  await expect(skin).toHaveAttribute("data-portrait-source", source!);
  await expect
    .poll(() => skin.evaluate((c: HTMLCanvasElement) => c.width * c.height))
    .toBeGreaterThan(0);
  const originalDifference = await skin.evaluate(
    async (c: HTMLCanvasElement, src: string) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const scratch = document.createElement("canvas");
      scratch.width = c.width;
      scratch.height = c.height;
      const context = scratch.getContext("2d")!;
      context.drawImage(image, 0, 0, c.width, c.height);
      const original = context.getImageData(0, 0, c.width, c.height).data,
        current = c
          .getContext("2d")!
          .getImageData(0, 0, c.width, c.height).data;
      let differences = 0;
      for (let i = 0; i < original.length; i++)
        if (original[i] !== current[i]) differences++;
      return differences;
    },
    source!,
  );
  expect(originalDifference).toBe(0);
  await page.screenshot({
    path: `cook/stills/r06-fashion/original-skin-${info.project.name}.png`,
    fullPage: true,
  });
});
test("a separately uploaded portrait is inferred once and remains usable when returning to the mirror", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  await dressing(page);
  await page
    .getByLabel("Upload dressing room portrait", { exact: true })
    .setInputFiles(path.resolve("apps/web/public/images/portrait-2.jpg"));
  const canvas = page.locator(".dressing-stage canvas");
  await expect(canvas).toHaveAttribute("data-portrait-source", /^blob:/);
  await expect(canvas).toHaveAttribute("data-face-inferences", "1", {
    timeout: 45000,
  });
  const source = await canvas.getAttribute("data-portrait-source");
  await page.getByRole("slider", { name: "Width", exact: true }).fill("0.7");
  await page.getByRole("slider", { name: "Rotation", exact: true }).fill("8");
  await expect(canvas).toHaveAttribute("data-face-inferences", "1");
  await page.screenshot({
    path: `cook/stills/r06-fashion/upload-once-${info.project.name}.png`,
    fullPage: true,
  });
  await nav(page, "The studio");
  await expect(page.locator(".mirror-media canvas")).toHaveAttribute(
    "data-source-url",
    source!,
  );
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
});
