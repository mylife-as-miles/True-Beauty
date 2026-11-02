import { test, expect, type Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
}
async function pixels(page: Page) {
  return page
    .locator(".mirror-media canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
}
test("creative light changes real pixels, undo restores, direction has keyboard and pointer control", async ({
  page,
}, info) => {
  await ready(page);
  const original = await pixels(page);
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Golden", exact: true }).click();
  await expect.poll(() => pixels(page)).not.toBe(original);
  const golden = await pixels(page);
  const direction = page.getByRole("slider", {
    name: "Light direction",
    exact: true,
  });
  await direction.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => pixels(page)).not.toBe(golden);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect.poll(() => pixels(page)).toBe(golden);
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect.poll(() => pixels(page)).toBe(original);
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await expect.poll(() => pixels(page)).toBe(golden);
  await page.getByRole("button", { name: "Golden", exact: true }).click();
  await direction.scrollIntoViewIfNeeded();
  const box = (await direction.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.7, {
    steps: 10,
  });
  await page.mouse.up();
  expect(Number(await direction.getAttribute("aria-valuenow"))).toBeGreaterThan(
    30,
  );
  await page.screenshot({
    path: `cook/stills/r05/lighting-${info.project.name}.png`,
    fullPage: true,
  });
});
test("editor stays beside or below mirror without overlap, and focus preserves edits", async ({
  page,
}, info) => {
  await ready(page);
  const frame = (await page.locator(".mirror-frame").boundingBox())!,
    panel = (await page.locator(".atelier").boundingBox())!;
  expect(
    panel.x >= frame.x + frame.width - 1 ||
      panel.y >= frame.y + frame.height - 1,
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Apply Lip colour shade 5", exact: true })
    .click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page
    .getByRole("button", { name: "Compare before and after", exact: true })
    .click();
  const slider = page.getByRole("slider", { name: "Before and after split" });
  await slider.fill("35");
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".mirror-frame")).toHaveCSS("isolation", "isolate");
  expect(
    await page
      .locator(".compare-divider>span")
      .evaluate((e) => getComputedStyle(e).outlineStyle),
  ).toBe("solid");
  await page.getByRole("button", { name: "Focus mirror", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/mirror-focused/);
  await expect(page.getByText("#843B4B", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `cook/stills/r05/focus-${info.project.name}.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".app-shell")).not.toHaveClass(/mirror-focused/);
  await expect(page.locator(".mirror-side>span")).toHaveText("115%");
  await expect(slider).toHaveValue("36");
});
test("reset makeup keeps hair and accessories; shader mode and gallery produce actual transformed output", async ({
  page,
}, info) => {
  await ready(page);
  if (info.project.name === "mobile") {
    await page.locator("#mobile-look-preset").selectOption("berry");
  } else
    await page
      .locator(".look-object")
      .filter({ hasText: "After hours" })
      .click();
  await expect(page.getByText("#792C48", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hair", exact: true }).click();
  await page.getByRole("button", { name: "Copper", exact: true }).click();
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Preview glasses", exact: true })
    .check();
  await page.getByRole("button", { name: "Reset makeup", exact: true }).click();
  await page.getByRole("button", { name: "Makeup", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Enable Lip colour", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Hair", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Enable hair recolouring",
      exact: true,
    }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Preview glasses", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await page.locator(".studio-quality summary").click();
  await page
    .getByRole("button", { name: "Detailed materials", exact: true })
    .click();
  await expect(page.locator(".mirror-frame")).toHaveAttribute(
    "data-renderer",
    "webgl2",
  );
  await page.getByRole("button", { name: "Makeup", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Enable Lip colour", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Glitter", exact: true }).click();
  await page.screenshot({
    path: `cook/stills/r05/material-${info.project.name}.png`,
    fullPage: true,
  });
});

test("full portrait framing preserves source-aligned before/after and offers a close-up return", async ({
  page,
}, info) => {
  await ready(page);
  await page
    .getByRole("button", { name: "Show full portrait", exact: true })
    .click();
  await expect(page.locator(".mirror-media canvas")).toHaveCSS(
    "object-fit",
    "contain",
  );
  await page
    .getByRole("button", { name: "Compare before and after", exact: true })
    .click();
  await page.getByRole("slider", { name: "Before and after split" }).fill("35");
  await expect
    .poll(async () =>
      page.locator(".mirror-media canvas").evaluate(async (node) => {
        const c = node as HTMLCanvasElement,
          frame = document
            .querySelector(".mirror-frame")!
            .getBoundingClientRect();
        const scale = Math.min(frame.width / c.width, frame.height / c.height),
          cut = Math.max(
            0,
            Math.floor(
              (0.5 + (-0.15 * frame.width) / (scale * c.width)) * c.width,
            ) - 2,
          );
        const image = new Image();
        image.src = "/images/portrait-neutral.jpg";
        await image.decode();
        const original = document.createElement("canvas");
        original.width = c.width;
        original.height = c.height;
        const ctx = original.getContext("2d")!;
        ctx.drawImage(image, 0, 0, c.width, c.height);
        const a = c
            .getContext("2d")!
            .getImageData(0, 0, c.width, c.height).data,
          b = ctx.getImageData(0, 0, c.width, c.height).data;
        let beforeDiff = 0,
          afterDiff = 0;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if (
              a[i] !== b[i] ||
              a[i + 1] !== b[i + 1] ||
              a[i + 2] !== b[i + 2]
            ) {
              if (x < cut) beforeDiff++;
              else afterDiff++;
            }
          }
        return { beforeDiff, changed: afterDiff > 100, cutValid: cut > 0 };
      }),
    )
    .toEqual({ beforeDiff: 0, changed: true, cutValid: true });
  await page.screenshot({
    path: `cook/stills/r05/full-portrait-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Fill mirror", exact: true }).click();
  await expect(page.locator(".mirror-media canvas")).toHaveCSS(
    "object-fit",
    "cover",
  );
});

test("focus mode moves keyboard focus into the studio and restores its origin", async ({
  page,
}) => {
  await ready(page);
  const desktopOrigin = page
    .locator(".topnav")
    .getByRole("button", { name: "The studio", exact: true });
  if (await desktopOrigin.isVisible()) {
    await desktopOrigin.focus();
    await page.keyboard.press("f");
    await expect(page.locator(".app-shell")).not.toHaveClass(/mirror-focused/);
  }
  const origin = page.getByRole("button", {
    name: "Focus mirror",
    exact: true,
  });
  await origin.focus();
  await page.keyboard.press("f");
  await expect(
    page.getByRole("button", { name: "Leave focus", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(origin).toBeFocused();
});
