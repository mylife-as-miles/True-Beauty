import { test, expect, type Page } from "@playwright/test";
import { MERCHANT_SOURCES } from "../../packages/commerce-engine/src/merchant";
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
test("bag keeps exact shades and currencies through reload, quantity and removal", async ({
  page,
}, info) => {
  await page.goto("/");
  await nav(page, "The beauty edit");
  await page
    .getByRole("button", { name: "View O FACE Satin Lipstick", exact: true })
    .click();
  await page.getByRole("button", { name: "Soft rose", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("button", { name: "Berry muse", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByLabel("Currency", { exact: true }).selectOption("USD");
  await page
    .getByRole("button", { name: "View O FACE Satin Lipstick", exact: true })
    .click();
  await page.getByRole("button", { name: "Soft rose", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await nav(page, "The beauty edit");
  await page.getByRole("button", { name: /Your bag/ }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.locator(".bag-item")).toHaveCount(3);
  await expect(
    page.getByLabel("O FACE Satin Lipstick Berry muse NGN quantity", {
      exact: true,
    }),
  ).toHaveValue("1");
  await page
    .getByLabel("O FACE Satin Lipstick Berry muse NGN quantity", {
      exact: true,
    })
    .fill("2");
  await expect(
    page.getByLabel("O FACE Satin Lipstick Soft rose NGN quantity", {
      exact: true,
    }),
  ).toHaveValue("1");
  await expect(modal.getByText("₦28,500", { exact: true })).toBeVisible();
  await expect(modal.getByText("US$9.00", { exact: true })).toBeVisible();
  await page.screenshot({
    path: `cook/stills/r06-commerce/variant-bag-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", {
      name: "Remove O FACE Satin Lipstick Soft rose NGN from bag",
      exact: true,
    })
    .click();
  await expect(modal.locator(".bag-item")).toHaveCount(2);
  await expect(
    page.getByLabel("O FACE Satin Lipstick Soft rose USD quantity", {
      exact: true,
    }),
  ).toHaveValue("1");
});
test("user product intake preserves INCI provenance, edits and deletes without an account or photo", async ({
  page,
}, info) => {
  await page.goto("/");
  await nav(page, "My wardrobe");
  await page
    .getByRole("button", { name: "Add my product", exact: true })
    .click();
  await page
    .getByLabel("Owned product name", { exact: true })
    .fill("My evening cream");
  await page.getByLabel("Brand", { exact: true }).fill("User label");
  await page
    .getByRole("combobox", { name: "Ingredient text source", exact: true })
    .selectOption("packaging");
  await page
    .getByLabel("Owned product INCI", { exact: true })
    .fill("Aqua, Glycerin, Squalane");
  await page
    .getByRole("button", { name: "Save my product locally", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My evening cream", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect ingredients", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "has not been independently verified",
  );
  await expect(
    page.getByRole("dialog").getByText("Glycerin", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `cook/stills/r06-commerce/user-inci-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await nav(page, "My wardrobe");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Owned product name", { exact: true })
    .fill("My updated cream");
  await page
    .getByRole("button", { name: "Save my product locally", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "My updated cream", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Delete owned product My updated cream",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "My updated cream", exact: true }),
  ).toHaveCount(0);
});
test("source UI validates and persists explicitly labelled test-fixture facts and does not send personal data", async ({
  page,
}) => {
  const source = MERCHANT_SOURCES[0],
    reference = source.references[0];
  const requests: unknown[] = [];
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { csrfToken: "fixture" } }),
  );
  await page.route("**/api/merchants/refresh", async (route) => {
    requests.push(route.request().postDataJSON());
    const fetchedAt = new Date().toISOString();
    await route.fulfill({
      json: {
        sourceId: source.id,
        referenceId: reference.id,
        fetchedAt,
        cached: false,
        nextRefreshAt: new Date(Date.now() + 900000).toISOString(),
        observations: [
          {
            id: crypto.randomUUID(),
            sourceId: source.id,
            referenceId: reference.id,
            merchant: source.name,
            title: reference.title,
            variantId: "fixture",
            variantName: "SKU fixture",
            amount: 11950,
            currency: "NGN",
            availability: "in-stock",
            fetchedAt,
            sourceUrl: reference.url,
            evidenceType: "json-ld",
            status: "observed",
            note: "TEST FIXTURE: simulated merchant response for contract testing.",
          },
        ],
      },
    });
  });
  await page.goto("/");
  await nav(page, "The beauty edit");
  await page
    .getByRole("button", { name: "Source checks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Check current source", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByText("₦11,950", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "TEST FIXTURE: simulated merchant response for contract testing.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests).toEqual([
    { sourceId: source.id, referenceId: reference.id },
  ]);
  await page
    .getByRole("button", { name: "Add planning quote", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("No order");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /Your bag/ }).click();
  await expect(page.getByRole("dialog")).toContainText("observed source quote");
  await expect(page.getByRole("dialog")).toContainText("SKU");
});
