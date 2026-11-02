import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openCanvas(page: Page) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", { name: "Inspiration canvas", exact: true })
    .click();
  await expect(page.locator(".canvas-viewport")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}

test("board pointer and keyboard pan, fit all, and reduced motion keep the composition reachable", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openCanvas(page);
  const board = page.locator(".canvas-viewport");
  await page
    .getByRole("button", { name: "Reset canvas view", exact: true })
    .click();
  await expect(board).toHaveAttribute("data-zoom", "1.000");
  await board.scrollIntoViewIfNeeded();
  const before = await board.evaluate((node) => node.scrollLeft);
  const box = (await board.boundingBox())!;
  if (info.project.name === "mobile") {
    const touch = await page.context().newCDPSession(page);
    const x = box.x + box.width - 25,
      y = box.y + box.height - 25;
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (let step = 1; step <= 8; step++)
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - (90 * step) / 8, y: y - (30 * step) / 8 }],
      });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touch.detach();
  } else {
    await page.mouse.move(box.x + box.width - 25, box.y + box.height - 25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 115, box.y + box.height - 55, {
      steps: 8,
    });
    await page.mouse.up();
  }
  await expect
    .poll(() => board.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(before + 25);
  await board.focus();
  const afterPointer = await board.evaluate((node) => node.scrollLeft);
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() => board.evaluate((node) => node.scrollLeft))
    .toBeLessThan(afterPointer);
  await page.keyboard.press("Home");
  await expect.poll(() => board.getAttribute("data-zoom")).not.toBe("1.000");
  const fits = await board.evaluate((node) => {
    const viewport = node.getBoundingClientRect();
    return [...node.querySelectorAll(".canvas-object")].every((object) => {
      const box = object.getBoundingClientRect();
      return (
        box.left >= viewport.left - 2 &&
        box.right <= viewport.right + 2 &&
        box.top >= viewport.top - 2 &&
        box.bottom <= viewport.bottom + 2
      );
    });
  });
  expect(fits).toBe(true);
  expect(
    await page
      .locator(".canvas-object")
      .first()
      .evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
  await page.screenshot({
    path: `cook/stills/canvas-r05/overview-${info.project.name}.png`,
    fullPage: true,
  });
});

test("palette context applies real blush and returns to the same board selection", async ({
  page,
}, info) => {
  await page.goto("/");
  await openCanvas(page);
  await page
    .locator(".canvas-object-index")
    .getByRole("button", { name: "Colour palette", exact: true })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Selected object inspector",
    exact: true,
  });
  const shade = inspector.getByRole("button", {
    name: "Try palette shade #A45356",
    exact: true,
  });
  await shade.click();
  await inspector.getByRole("button", { name: "Cheeks", exact: true }).click();
  await expect(inspector.locator(".canvas-colour-result")).toContainText(
    "On your blush",
  );
  await page.screenshot({
    path: `cook/stills/canvas-r05/palette-lens-${info.project.name}.png`,
    fullPage: true,
  });
  await inspector
    .getByRole("button", { name: "See it in my mirror", exact: true })
    .click();
  await expect(
    page.getByLabel("Custom makeup colour", { exact: true }),
  ).toHaveValue("#a45356");
  await expect(
    page.getByRole("checkbox", { name: "Enable Blush", exact: true }),
  ).toBeChecked();
  await openCanvas(page);
  await expect(inspector.locator(".canvas-colour-result")).toContainText(
    "#A45356",
  );
  await expect(
    page
      .locator(".canvas-object-index")
      .getByRole("button", { name: "Colour palette", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("selected product and shade open the actual matching discovery detail", async ({
  page,
}, info) => {
  await page.goto("/");
  await openCanvas(page);
  await page
    .locator(".canvas-object-index")
    .getByRole("button", { name: "O FACE Satin Lipstick", exact: true })
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Selected object inspector",
    exact: true,
  });
  const shade = inspector
    .getByRole("group", { name: "Product shade reference", exact: true })
    .getByRole("button")
    .last();
  const label = (await shade.getAttribute("aria-label"))!.replace(
    "Choose product shade ",
    "",
  );
  await shade.click();
  await page.screenshot({
    path: `cook/stills/canvas-r05/product-lens-${info.project.name}.png`,
    fullPage: true,
  });
  await inspector
    .getByRole("button", { name: "Explore this product", exact: true })
    .click();
  const detail = page.getByRole("dialog", {
    name: "O FACE Satin Lipstick",
    exact: true,
  });
  await expect(detail).toBeVisible();
  await expect(detail.locator(".variant-picker p")).toContainText(label);
});

test("reference uploads stay out of saved records and exports", async ({
  page,
}) => {
  await page.goto("/");
  await openCanvas(page);
  await page
    .getByLabel("Upload inspiration reference", { exact: true })
    .setInputFiles("apps/web/public/images/portrait-neutral.jpg");
  await expect(page.locator(".canvas-photo")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export board", exact: true }).click();
  const file = await download;
  const contents = await readFile((await file.path())!, "utf8");
  expect(contents).not.toMatch(/blob:|data:image/);
  const backup = JSON.parse(contents);
  expect(
    backup.objects.filter(
      (object: { value: string }) => object.value === "session-photo",
    ),
  ).toHaveLength(1);
  const photos = await page.evaluate(async () => {
    const modulePath = "/packages/local-database/src/index.ts";
    return (await import(modulePath)).db.mediaAssets.count();
  });
  expect(photos).toBe(0);
});
