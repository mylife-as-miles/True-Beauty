import { expect, test, type Locator, type Page } from "@playwright/test";

async function cycleModalFocus(page: Page, dialog: Locator) {
  for (const key of ["Tab", "Shift+Tab"]) {
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press(key);
      await expect
        .poll(() =>
          dialog.evaluate((node) => node.contains(document.activeElement)),
        )
        .toBe(true);
    }
  }
}

test("agent focus stays inside when Send is disabled, enabled, and disabled again", async ({
  page,
}) => {
  await page.goto("/");
  const opener = page.getByRole("button", {
    name: "Your beauty companion",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog", {
    name: "Your beauty agent",
    exact: true,
  });
  const send = dialog.getByRole("button", {
    name: "Send request",
    exact: true,
  });
  await expect(send).toBeDisabled();
  await expect(page.locator(".workspace")).toHaveAttribute("inert", "");
  await cycleModalFocus(page, dialog);
  await dialog.getByLabel("Your beauty request").fill("Make my lips berry");
  await expect(send).toBeEnabled();
  await cycleModalFocus(page, dialog);
  await send.click();
  await expect(dialog.locator(".agent-message.assistant")).toContainText(
    "Changed your lip preview",
  );
  await expect(send).toBeDisabled();
  await cycleModalFocus(page, dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.locator(".workspace")).not.toHaveAttribute("inert", "");
});

test("empty BeautyGraph traps keyboard focus despite disabled memory form", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your data, your choice", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Your data, your choice",
    exact: true,
  });
  await dialog.getByRole("tab", { name: "BeautyGraph", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Remember this", exact: true }),
  ).toBeDisabled();
  await cycleModalFocus(page, dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("look composer dialog inside a workspace view remains interactive with background inert", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Save this look", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Keep this feeling.",
    exact: true,
  });
  const name = dialog.getByRole("textbox", {
    name: "Name your look",
    exact: true,
  });
  await name.fill("Accessible workspace look");
  await expect(name).toBeFocused();
  await expect(page.locator(".workspace")).toHaveAttribute("inert", "");
  expect(
    await dialog.evaluate((node) => node.closest("[inert]") === null),
  ).toBe(true);
  await cycleModalFocus(page, dialog);
  await dialog
    .getByRole("button", { name: "Save look locally", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Look saved on this device" }),
  ).toBeVisible();
});
test("settings sections use roving arrow-key focus and expose the selected panel", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Your data, your choice", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Your data, your choice",
    exact: true,
  });
  const permissions = dialog.getByRole("tab", {
    name: "Permissions",
    exact: true,
  });
  await permissions.focus();
  await page.keyboard.press("ArrowRight");
  const profile = dialog.getByRole("tab", {
    name: "Beauty profile",
    exact: true,
  });
  await expect(profile).toBeFocused();
  await expect(profile).toHaveAttribute("aria-selected", "true");
  await expect(
    dialog.getByRole("tabpanel", { name: "Beauty profile", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    dialog.getByRole("tab", { name: "Data & backup", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(permissions).toBeFocused();
  await expect(permissions).toHaveAttribute("aria-selected", "true");
});
