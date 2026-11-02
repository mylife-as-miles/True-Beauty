import { test, expect, type Page } from "@playwright/test";
async function journal(page: Page) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("button", { name: "Beauty journal", exact: true })
    .click();
}
test("saved recipes replay as a real two-look comparison and name typing keeps focus", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  for (const [name, preset] of [
    ["Daylight", "soft-glow"],
    ["Evening", "berry"],
  ]) {
    if (info.project.name === "mobile")
      await page.locator("#mobile-look-preset").selectOption(preset);
    else
      await page
        .locator(".preset-item")
        .filter({ hasText: preset === "berry" ? "After hours" : "Soft glow" })
        .click();
    await page
      .getByRole("button", { name: "Save this look", exact: true })
      .click();
    const field = page.getByRole("textbox", { name: "Name your look" });
    await field.fill("");
    await field.pressSequentially(name, { delay: 20 });
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(name);
    await page
      .getByRole("button", { name: "Save look locally", exact: true })
      .click();
  }
  await journal(page);
  await page
    .getByRole("button", { name: "Compare this look", exact: true })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: "Compare this look", exact: true })
    .nth(0)
    .click();
  await page
    .getByRole("button", { name: "Compare looks (2/2)", exact: true })
    .click();
  await expect(page.locator(".comparison-note")).toContainText(
    "Replayed on the same demo portrait",
    { timeout: 30000 },
  );
  const previews = await page
    .locator(".saved-compare-grid canvas")
    .evaluateAll((canvases) =>
      canvases.map((c) => (c as HTMLCanvasElement).toDataURL()),
    );
  expect(previews).toHaveLength(2);
  expect(previews[0] === previews[1], "Saved recipes must render different pixels").toBe(false);
  await page.screenshot({
    path: `cook/stills/r03/look-comparison-${info.project.name}.png`,
  });
});
test("3D product study rotates with keyboard and returns to illustration", async ({
  page,
}, info) => {
  await page.goto("/");
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  await expect(
    page.getByRole("button", { name: "True Beauty home", exact: true }),
  ).toBeVisible();
  if (await menu.isVisible()) {
    await menu.click();
    await page
      .locator(".nav-rail")
      .getByRole("button", { name: "The beauty edit", exact: true })
      .click();
  } else
    await page
      .locator(".topnav")
      .getByRole("button", { name: "The beauty edit", exact: true })
      .click();
  await page
    .getByRole("button", { name: "View O FACE Satin Lipstick", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Explore a 3D packaging study", exact: true })
    .click();
  const stage = page.getByRole("group", {
    name: "Rotate generic lipstick model",
    exact: true,
  });
  await expect(stage.locator("canvas")).toBeVisible({ timeout: 30000 });
  const yaw = await stage.getAttribute("data-yaw");
  await stage.focus();
  await page.keyboard.press("ArrowRight");
  await expect(stage).not.toHaveAttribute("data-yaw", yaw!);
  await expect(
    page.getByText(
      "This is not the selected product’s packaging, size, or finish.",
      { exact: false },
    ),
  ).toBeVisible();
  await page.screenshot({
    path: `cook/stills/r03/product-3d-${info.project.name}.png`,
  });
  await page
    .getByRole("button", { name: "Back to illustration", exact: true })
    .click();
  await expect(
    page.getByAltText("Original generic packaging illustration", {
      exact: true,
    }),
  ).toBeVisible();
});
test("routine steps and names remain editable after saving and reloading", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Your beauty companion", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Your beauty companion", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Your beauty agent",
    exact: true,
  });
  await dialog
    .getByRole("textbox", { name: "Your beauty request" })
    .fill("Build a simple PM routine");
  await dialog
    .getByRole("button", { name: "Send request", exact: true })
    .click();
  await expect(dialog.locator(".agent-message.assistant")).toContainText(
    "routine",
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await journal(page);
  await page
    .getByRole("button", { name: "Daily rituals", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit routine", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Routine name", exact: true })
    .fill("My evening pause");
  await page
    .getByRole("textbox", { name: "Step 1 name", exact: true })
    .fill("A gentle cleanse");
  await page
    .getByRole("button", { name: "Save routine changes", exact: true })
    .click();
  await expect(
    page.getByText("Your ritual has been updated.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "True Beauty home", exact: true }),
  ).toBeVisible();
  await journal(page);
  await page
    .getByRole("button", { name: "Daily rituals", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My evening pause", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A gentle cleanse", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `cook/stills/r03/routine-edit-${info.project.name}.png`,
  });
});
