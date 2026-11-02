import { test, expect } from "@playwright/test";
const openWardrobe = async (page: import("@playwright/test").Page) => {
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i, exact: true }),
  ).toBeVisible();
  const buttons = page.getByRole("button", {
    name: "My wardrobe",
    exact: true,
  });
  if (await buttons.first().isVisible()) await buttons.first().click();
  else {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await buttons.last().click();
  }
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
};
const openCanvas = async (page: import("@playwright/test").Page) => {
  await expect(
    page.getByRole("button", { name: /True Beauty.*home/i, exact: true }),
  ).toBeVisible();
  const button = page.getByRole("button", {
    name: "Inspiration canvas",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  else {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await button.click();
  }
};
test("Dressing Room composes an uploaded garment and saves only approved parameters", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await openWardrobe(page);
  await expect(
    page.getByRole("heading", { name: "Wear the feeling." }),
  ).toBeVisible();
  await expect(
    page.getByText("Local static-photo composition · manual placement", {
      exact: true,
    }),
  ).toBeVisible();
  const garmentData = await page.evaluate(async () => {
    const modulePath = "/packages/fashion-engine/src/index.ts";
    const { sampleGarmentImage } = await import(modulePath);
    const image = new Image();
    image.src = sampleGarmentImage("#98645e");
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 650;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload garment", { exact: true }).setInputFiles({
    name: "sample-blouse.png",
    mimeType: "image/png",
    buffer: Buffer.from(garmentData, "base64"),
  });
  await page.getByRole("slider", { name: "Width", exact: true }).fill("0.65");
  await page.getByRole("slider", { name: "Rotation", exact: true }).fill("12");
  await page
    .getByLabel("Name this outfit", { exact: true })
    .fill("Wedding colour study");
  await page
    .getByRole("button", { name: "Save this outfit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Wedding colour study", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Outfit colours and placement saved. Uploaded images have not been stored.",
      { exact: true },
    ),
  ).toBeVisible();
  const stored = await page.evaluate(async () => {
    const modulePath = "/packages/local-database/src/index.ts";
    const { db } = await import(modulePath);
    return {
      photos: await db.mediaAssets.count(),
      outfits: await db.outfits.toArray(),
    };
  });
  expect(stored.photos).toBe(0);
  expect(stored.outfits[0].placement.width).toBe(0.65);
  expect(stored.outfits[0].placement.rotation).toBe(12);
  expect(stored.outfits[0].technology).toBe("static-photo-compositing");
  expect(stored.outfits[0].garmentMediaAssetId).toBeUndefined();
  await page.screenshot({
    path: `cook/stills/r01/dressing-room-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await openWardrobe(page);
  await page
    .getByRole("button", { name: "Wedding colour study", exact: true })
    .click();
  await expect(
    page.getByRole("slider", { name: "Rotation", exact: true }),
  ).toHaveValue("12");
  await expect(
    page.getByText(
      "Colours and placement restored. Upload the original images to complete this study.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete outfit Wedding colour study" })
    .click();
  await expect(
    page.getByRole("button", { name: "Wedding colour study", exact: true }),
  ).toHaveCount(0);
});
test("Visual Canvas supports keyboard composition and persists editable notes without photo data", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await openCanvas(page);
  await expect(
    page.getByRole("heading", { name: "Follow your inspiration." }),
  ).toBeVisible();
  const note = page
    .getByRole("group", {
      name: "note on style board. Use arrow keys to move, Delete to remove.",
      exact: true,
    })
    .first();
  await note.focus();
  await page.keyboard.press("ArrowRight");
  await expect(note).toHaveCSS("left", "380px");
  await note.getByRole("button", { name: "Edit note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Edit inspiration note" })
    .fill("Soft gold and a berry lip.");
  await page.getByRole("heading", { name: "Follow your inspiration." }).click();
  await expect(
    note.getByText("Soft gold and a berry lip.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `cook/stills/r01/visual-canvas-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await openCanvas(page);
  await expect(
    page.getByText("Soft gold and a berry lip.", { exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(async () => {
    const modulePath = "/packages/local-database/src/index.ts";
    const { db } = await import(modulePath);
    return await db.settings.get("visual-canvas");
  });
  expect(stored.value.find((o: { kind: string }) => o.kind === "note").x).toBe(
    380,
  );
});
