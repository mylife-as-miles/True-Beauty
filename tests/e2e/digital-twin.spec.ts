import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function navigate(page: Page, label: string) {
  const menu = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: label, exact: true }).first().click();
}
async function openTwin(page: Page) {
  await navigate(page, "Beauty profile");
  await expect(
    page.getByRole("heading", { name: "A little more you.", exact: true }),
  ).toBeVisible();
}
async function permissions(page: Page) {
  await navigate(page, "Privacy and settings");
  return page.getByRole("dialog", {
    name: "Your data, your choice",
    exact: true,
  });
}
async function exportProfile(page: Page) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export profile", exact: true })
    .click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}
async function fixtureWardrobe(page: Page) {
  return page.evaluate(async () => {
    const modulePath = "/packages/local-database/src/index.ts";
    const { db } = await import(modulePath);
    const now = Date.now();
    await db.ownedProducts.put({
      id: "twin-fixture-owned",
      productId: "cerave-cleanser",
      name: "My gentle cleanser",
      addedAt: now,
    });
    await db.outfits.put({
      id: "twin-fixture-outfit",
      name: "Midnight blue study",
      color: "#24395b",
      technology: "static-photo-compositing",
      garmentName: "Original sample blouse",
      usesSamplePerson: true,
      sampleGarment: true,
      placement: {
        x: 0.5,
        y: 0.65,
        width: 0.7,
        height: 0.55,
        rotation: 0,
        opacity: 0.9,
      },
      createdAt: now,
      updatedAt: now,
    });
  });
}

test("self-described preferences persist, export without photographs, and never auto-grant agent memory", async ({
  page,
}, info) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto("/");
  await openTwin(page);
  const remember = page.getByRole("checkbox", {
    name: "Let the beauty agent remember these preferences",
    exact: true,
  });
  await expect(remember).toBeDisabled();
  await expect(remember).not.toBeChecked();
  await page
    .getByLabel("What should we call you?", { exact: true })
    .fill("Tomi");
  await page
    .getByLabel("Skin type, as you describe it", { exact: true })
    .selectOption("Dry");
  await page.getByLabel("Your beauty budget", { exact: true }).fill("20000");
  await page.getByLabel("Currency", { exact: true }).selectOption("NGN");
  await page.getByLabel("Hair texture", { exact: true }).fill("Coily");
  await page.getByLabel("Hair length", { exact: true }).fill("Shoulder-length");
  await page.getByLabel(/^Hair goals/).fill("Retain length\nGentle styling");
  await page
    .getByLabel(/^Style goals/)
    .fill("Everyday soft glam\nWedding guest");
  await page
    .getByLabel("Preferred makeup finish", { exact: true })
    .selectOption("gloss");
  await page.getByLabel(/^Ingredients you prefer to avoid/).fill("Fragrance");
  await page.getByLabel("New favorite colour", { exact: true }).fill("#943356");
  await page.getByRole("button", { name: "Add colour", exact: true }).click();
  await page
    .getByRole("button", { name: "Save my local profile", exact: true })
    .click();
  await expect(page.locator(".digital-twin").getByRole("status")).toContainText(
    "No agent memory was added",
  );
  await page.screenshot({
    path: info.outputPath("profile-saved.png"),
    fullPage: true,
  });
  await page.reload();
  await openTwin(page);
  await expect(
    page.getByLabel("What should we call you?", { exact: true }),
  ).toHaveValue("Tomi");
  await expect(page.getByLabel("Hair texture", { exact: true })).toHaveValue(
    "Coily",
  );
  await expect(
    page.getByLabel("Preferred makeup finish", { exact: true }),
  ).toHaveValue("gloss");
  await expect(
    page.getByRole("button", {
      name: "Remove favorite colour #943356",
      exact: true,
    }),
  ).toBeVisible();
  const data = await exportProfile(page);
  expect(data.profile.displayName).toBe("Tomi");
  expect(data.preferences.hairTexture).toBe("Coily");
  expect(data.preferences.styleGoals).toContain("Wedding guest");
  expect(JSON.stringify(data)).not.toContain("data:image");
  expect(JSON.stringify(data)).not.toContain("portrait-neutral.jpg");
  expect(JSON.stringify(data)).not.toContain("blob:");
  const memory = await page.evaluate(async () => {
    const modulePath = "/packages/local-database/src/index.ts";
    const { db } = await import(modulePath);
    return {
      nodes: await db.memoryNodes.count(),
      consent: await db.consents
        .where("scope")
        .equals("memory.preferences")
        .first(),
    };
  });
  expect(memory.nodes).toBe(0);
  expect(memory.consent?.granted ?? false).toBe(false);
  expect(posts).toEqual([]);
});

test("the complete-look recipe retains makeup, light, owned-product and outfit references and supports reopen/delete", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByLabel("Custom makeup colour", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Custom makeup colour", { exact: true })
    .fill("#943356");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Golden", exact: true }).click();
  await fixtureWardrobe(page);
  await openTwin(page);
  await page
    .getByLabel("Complete look name", { exact: true })
    .fill("Tomi's evening edit");
  await page
    .getByLabel("Occasion or note", { exact: true })
    .fill("Wedding guest · soft colour");
  await page
    .getByLabel("Pair with a saved outfit", { exact: true })
    .selectOption("twin-fixture-outfit");
  await page
    .getByRole("checkbox", { name: "My gentle cleanser", exact: true })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: "Add this look to agent history",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Save my complete look", exact: true })
    .click();
  await expect(
    page.locator(".twin-composition-form").getByRole("status"),
  ).toContainText("saved");
  const row = page.locator(".twin-saved-look").filter({
    has: page.getByRole("heading", {
      name: "Tomi's evening edit",
      exact: true,
    }),
  });
  await expect(row).toBeVisible();
  const data = await exportProfile(page),
    saved = data.looks.find(
      (value: { name: string }) => value.name === "Tomi's evening edit",
    );
  expect(saved.look.lipstick.color).toBe("#943356");
  expect(saved.composition.productIds).toEqual(["cerave-cleanser"]);
  expect(saved.composition.outfitId).toBe("twin-fixture-outfit");
  expect(saved.composition.lighting.preset).toBe("golden-hour");
  await page.screenshot({
    path: info.outputPath("complete-look-saved.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to the mirror", exact: true })
    .click();
  await page
    .getByLabel("Custom makeup colour", { exact: true })
    .fill("#223344");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await openTwin(page);
  await row
    .getByRole("button", { name: "Reopen in mirror", exact: true })
    .click();
  await expect(
    page.getByLabel("Custom makeup colour", { exact: true }),
  ).toHaveValue("#943356");
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Golden", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await openTwin(page);
  await page
    .getByRole("button", {
      name: "Delete complete look Tomi's evening edit",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tomi's evening edit", exact: true }),
  ).toHaveCount(0);
});

test("preference memory requires its separate permission and rejects an over-limit draft without discarding it", async ({
  page,
}) => {
  await page.goto("/");
  await openTwin(page);
  const many = Array.from(
    { length: 13 },
    (_, index) => `Goal ${index + 1}`,
  ).join("\n");
  await page.getByLabel(/^Hair goals/).fill(many);
  await expect(page.locator(".twin-draft-context")).toContainText(
    "last saved profile",
  );
  await page
    .getByRole("button", { name: "Save my local profile", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("keep up to 12 entries");
  await expect(page.getByLabel(/^Hair goals/)).toHaveValue(many);
  await page.getByLabel(/^Hair goals/).fill("Gentle styling");
  const dialog = await permissions(page);
  await dialog
    .getByRole("checkbox", { name: /^Remember my preferences/ })
    .check();
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  const remember = page.getByRole("checkbox", {
    name: "Let the beauty agent remember these preferences",
    exact: true,
  });
  await expect(remember).toBeEnabled();
  await remember.check();
  await page
    .getByRole("button", { name: "Save my local profile", exact: true })
    .click();
  await expect(page.locator(".digital-twin").getByRole("status")).toContainText(
    "permitted preference memory",
  );
  const count = await page.evaluate(async () => {
    const path = "/packages/local-database/src/index.ts";
    return (await import(path)).db.memoryNodes
      .filter((n: { source: string }) => n.source === "user:beauty-profile")
      .count();
  });
  expect(count).toBe(1);
  const again = await permissions(page);
  await again
    .getByRole("checkbox", { name: /^Remember my preferences/ })
    .uncheck();
  await again
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await expect(remember).toBeDisabled();
  await expect(remember).not.toBeChecked();
});

test("a complete look opens its actual saved outfit study without replacing the shared portrait", async ({
  page,
}) => {
  await page.goto("/");
  const original = await page
    .locator(".mirror-media canvas")
    .getAttribute("data-source-url");
  await fixtureWardrobe(page);
  await openTwin(page);
  await page
    .getByLabel("Complete look name", { exact: true })
    .fill("Midnight coordination");
  await page
    .getByLabel("Pair with a saved outfit", { exact: true })
    .selectOption("twin-fixture-outfit");
  await page
    .getByRole("button", { name: "Save my complete look", exact: true })
    .click();
  const saved = page.locator(".twin-saved-look").filter({
    has: page.getByRole("heading", {
      name: "Midnight coordination",
      exact: true,
    }),
  });
  await saved.getByRole("button", { name: "Open outfit", exact: true }).click();
  await expect(
    page.getByLabel("Name this outfit", { exact: true }),
  ).toHaveValue("Midnight blue study");
  await expect(page.getByLabel("Garment colour", { exact: true })).toHaveValue(
    "#24395b",
  );
  await expect(
    page.locator("canvas[data-active-outfit='twin-fixture-outfit']"),
  ).toHaveAttribute("data-portrait-source", original!);
});
