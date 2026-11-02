import { test, expect, type Page } from "@playwright/test";
async function nav(page: Page, name: string) {
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i }),
  ).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) {
    await menu.click();
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
async function mirrorReady(page: Page) {
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
}
test("no-login mirror applies shades, presets and comparison without image requests", async ({
  page,
}, info) => {
  const outbound: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") outbound.push(r.url());
  });
  await page.goto("/");
  await mirrorReady(page);
  await expect(
    page.getByText("Create an account", { exact: true }),
  ).toHaveCount(0);
  const before = await page
    .locator(".mirror-media canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page
    .getByRole("button", { name: "Apply Lip colour shade 5", exact: true })
    .click();
  await expect
    .poll(() =>
      page
        .locator(".mirror-media canvas")
        .evaluate((c: HTMLCanvasElement) => c.toDataURL()),
    )
    .not.toBe(before);
  if (info.project.name === "mobile") {
    await page.locator("#mobile-look-preset").selectOption("berry");
  } else {
    await page
      .locator(".look-object")
      .filter({ hasText: "After hours" })
      .click();
  }
  await expect(page.getByText("#792C48", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Compare before and after", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Before and after split" }),
  ).toBeVisible();
  await page.getByRole("slider", { name: "Before and after split" }).fill("35");
  await expect(page.locator(".compare-divider")).toHaveCSS("left", /\d/);
  await expect(page.getByText("Before", { exact: true })).toBeVisible();
  expect(outbound).toEqual([]);
  await page.screenshot({
    path: `cook/stills/r02/mirror-${info.project.name}.png`,
    fullPage: true,
  });
});
test("camera denial preserves demo, face/hair/style controls recover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.goto("/");
  await mirrorReady(page);
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/declined|portrait/i);
  await expect(page.locator(".mirror-media canvas")).toBeVisible();
  await page.getByRole("button", { name: "Hair", exact: true }).click();
  await page.getByRole("checkbox", { name: "Enable hair recolouring" }).check();
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page.getByRole("checkbox", { name: "Preview glasses" }).check();
  await expect(
    page.getByRole("checkbox", { name: "Preview glasses" }),
  ).toBeChecked();
});
test("catalogue ingredient exploration comparison owned collection and bag persist", async ({
  page,
}, info) => {
  await page.goto("/");
  await nav(page, "The beauty edit");
  await page
    .getByRole("button", { name: "View O FACE Satin Lipstick", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Squalane", exact: true }).click();
  await expect(page.locator(".ingredient-lens")).toContainText(/Squalane/);
  await page.getByRole("button", { name: "I own this", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await nav(page, "My wardrobe");
  await expect(page.locator(".product-name")).toContainText([
    "O FACE Satin Lipstick",
  ]);
  await page.getByRole("button", { name: /Your bag/ }).click();
  await expect(page.locator(".bag-items")).toContainText(
    "O FACE Satin Lipstick",
  );
  await expect(page.locator(".bag-total")).toContainText("9,500");
  await page.screenshot({
    path: `cook/stills/r02/bag-${info.project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByText("Payment successful", { exact: true }),
  ).toHaveCount(0);
});
test("offline continuity preserves local saved looks and owned catalogue", async ({
  page,
  context,
}) => {
  test.skip(
    process.env.TB_E2E_PRODUCTION !== "1",
    "Offline shell is verified against production asset graph, not Vite HMR",
  );
  await page.goto("/");
  await mirrorReady(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page
    .getByRole("button", { name: "Save this look", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Name your look" })
    .fill("Offline rose");
  await page
    .getByRole("button", { name: "Save look locally", exact: true })
    .click();
  await nav(page, "The beauty edit");
  await page
    .getByRole("button", {
      name: "Add O FACE Satin Lipstick to wardrobe",
      exact: true,
    })
    .click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText("You’re offline.", { exact: false }),
  ).toBeVisible();
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", { name: "Beauty journal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Offline rose", exact: true }),
  ).toBeVisible();
  await nav(page, "My wardrobe");
  await expect(page.locator(".product-name")).toContainText(
    "O FACE Satin Lipstick",
  );
  await context.setOffline(false);
});
