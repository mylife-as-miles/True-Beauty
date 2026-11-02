import { test, expect } from "@playwright/test";

test("selecting the current mobile space closes navigation and leaves editor controls reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  const drawer = page.getByRole("complementary", {
    name: "Beauty spaces",
    exact: true,
  });
  await drawer.getByRole("button", { name: "The studio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open navigation", exact: true }),
  ).toBeVisible();
  await expect(drawer).not.toBeVisible();
  await expect(page.locator('.nav-rail')).not.toHaveClass(/\bopen\b/);
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Golden", exact: true }),
  ).toBeVisible();
});
