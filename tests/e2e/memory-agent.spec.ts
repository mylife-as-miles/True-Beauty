import { test, expect } from "@playwright/test";

async function openSettings(page: import("@playwright/test").Page) {
  const profile = page.getByRole("button", {
    name: "Your profile and privacy",
  });
  if (await profile.isVisible()) await profile.click();
  else
    await page.getByRole("button", { name: /Your data, your choice/ }).click();
}

test("agent changes real mirror controls and saves a persistent editable look", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Your beauty companion" }).click();
  const dialog = page.getByRole("dialog", { name: "Your beauty agent" });
  await expect(
    dialog.getByText("Local assistant", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("Your beauty request").fill("Make my lips berry");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(
    dialog.getByText("Changed your lip preview to #792C48.", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.getByLabel("Custom makeup colour")).toHaveValue("#792c48");
  await page.getByRole("button", { name: "Your beauty companion" }).click();
  await dialog
    .getByLabel("Your beauty request")
    .fill("Save this look as Berry memory");
  await dialog.getByRole("button", { name: "Send request" }).click();
  await expect(dialog.getByText(/Saved “Berry memory” locally/)).toBeVisible();
  await page.screenshot({
    path: `cook/stills/r01/agent-tools-${testInfo.project.name === "mobile" ? "mobile" : "desktop"}.png`,
  });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Beauty journal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Berry memory" }),
  ).toBeVisible();
  await page.reload();
  if (await page.getByRole("button", { name: "Open navigation" }).isVisible())
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("button", { name: "Beauty journal", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Berry memory" }),
  ).toBeVisible();
});

test("wedding plan allocates one combined NGN budget with source-labelled relevant products", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Your beauty companion" }).click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  await agent
    .getByRole("button", { name: "Soft glam for a wedding, dry skin, ₦20,000" })
    .click();
  await expect(agent.locator(".agent-budget-plan strong").first()).toHaveText(
    "NGN 19,300",
  );
  await expect(agent.locator(".agent-budget-plan strong").nth(1)).toHaveText(
    "NGN 700",
  );
  await expect(agent.locator(".agent-budget-plan")).toContainText(
    "sample catalogue prices",
  );
  await expect(agent.locator(".agent-recommendations")).toContainText(
    "Natural Moisturizing Factors + HA",
  );
  await expect(agent.locator(".agent-recommendations")).toContainText(
    "Camo Liquid Blush",
  );
  await expect(agent.locator(".agent-recommendations")).not.toContainText(
    "Conditioner",
  );
  await expect(agent.locator(".agent-budget-plan")).toContainText(
    "Still to cover: lipstick, eyeshadow",
  );
  await page.screenshot({
    path: `cook/stills/r01/agent-budget-${testInfo.project.name === "mobile" ? "mobile" : "desktop"}.png`,
  });
});

test("consented BeautyGraph preference can be corrected, used, and completely forgotten", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await openSettings(page);
  const settings = page.getByRole("dialog", { name: "Your data, your choice" });
  await settings
    .getByRole("checkbox", { name: /Remember my preferences/ })
    .check();
  await settings.getByRole("tab", { name: "BeautyGraph" }).click();
  await settings.getByLabel("Preference name").fill("lip finish");
  await settings.getByLabel("Your preference", { exact: true }).fill("gloss");
  await settings
    .getByRole("button", { name: "Remember this", exact: true })
    .click();
  const record = settings
    .locator(".memory-record")
    .filter({ hasText: "lip finish" });
  await expect(record).toContainText("gloss");
  await record.getByRole("button", { name: "Correct", exact: true }).click();
  await record.getByLabel("Corrected value").fill("matte");
  await record.getByRole("button", { name: "Save correction" }).click();
  await expect(record).toContainText("revision 2");
  await expect(record).toContainText("matte");
  await page.screenshot({
    path: `cook/stills/r01/beautygraph-${testInfo.project.name === "mobile" ? "mobile" : "desktop"}.png`,
  });
  await settings.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Your beauty companion" }).click();
  const agent = page.getByRole("dialog", { name: "Your beauty agent" });
  await agent.getByLabel("Your beauty request").fill("Apply soft glam");
  await agent.getByRole("button", { name: "Send request" }).click();
  await expect(
    agent.getByText(/Used your saved matte lip-finish preference/),
  ).toBeVisible();
  await agent.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".finish-control button.active")).toHaveText(
    /Matte|Natural/,
  );
  await openSettings(page);
  await settings.getByRole("tab", { name: "BeautyGraph" }).click();
  await settings
    .locator(".memory-record")
    .filter({ hasText: "lip finish" })
    .getByRole("button", { name: "Forget", exact: true })
    .click();
  await expect(
    settings.getByText("No personal memories have been saved."),
  ).toBeVisible();
  await settings.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await openSettings(page);
  await settings.getByRole("tab", { name: "BeautyGraph" }).click();
  await expect(
    settings.getByText("No personal memories have been saved."),
  ).toBeVisible();
});

test("profile edits export a portable backup without photos or consent grants on import", async ({
  page,
}) => {
  await page.goto("/");
  await openSettings(page);
  const settings = page.getByRole("dialog", { name: "Your data, your choice" });
  await settings.getByRole("tab", { name: "Beauty profile" }).click();
  await settings.getByLabel("Display name").fill("Miles");
  await settings.getByLabel("Product budget").fill("18000");
  await settings
    .getByRole("button", { name: "Save profile", exact: true })
    .click();
  await settings.getByRole("tab", { name: "Data & backup" }).click();
  const downloadPromise = page.waitForEvent("download");
  await settings
    .getByRole("button", { name: "Export backup", exact: true })
    .click();
  const download = await downloadPromise,
    path = await download.path();
  expect(path).toBeTruthy();
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(path!, "utf8"));
  expect(backup.format).toBe("true-beauty-backup");
  expect(backup.tables.profiles[0].displayName).toBe("Miles");
  expect(backup.tables.profiles[0].budget).toBe(18000);
  expect(backup.tables.mediaAssets).toEqual([]);
  expect(backup.tables.consents).toEqual([]);
  await settings
    .getByRole("button", { name: "Delete all local data", exact: true })
    .click();
  await settings.getByLabel("Type DELETE to confirm").fill("DELETE");
  await settings
    .getByRole("button", { name: "Delete everything", exact: true })
    .click();
  await expect(
    settings.getByRole("button", {
      name: "Delete all local data",
      exact: true,
    }),
  ).toBeVisible();
  await settings.getByLabel("Choose a True Beauty backup").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Local backup imported" }),
  ).toBeVisible();
  await settings.getByRole("tab", { name: "Beauty profile" }).click();
  await expect(settings.getByLabel("Display name")).toHaveValue("Miles");
});
