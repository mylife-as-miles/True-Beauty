import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { MERCHANT_SOURCES } from "../../packages/commerce-engine/src/merchant";

async function navigate(page: Page, name: string) {
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

test("composition stays visible while editing, preserves generated provenance and reveals restored studies once", async ({
  page,
}, info) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") uploads.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  // Controlled metadata-boundary test: already-generated receipt bytes, no
  // provider request. It must retain its provenance after downstream edits.
  const bytes = (
    await readFile("cook/evidence/r06-live-001/generated-hair.jpg")
  ).toString("base64");
  await page.evaluate(async (bytes) => {
    const resource = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .reverse()
      .find((url) => new URL(url).pathname === "/apps/web/src/state/store.ts");
    if (!resource) throw new Error("Store resource unavailable");
    const { useApp } = await import(resource);
    const data = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0));
    useApp
      .getState()
      .setGeneratedPortrait(
        URL.createObjectURL(new Blob([data], { type: "image/jpeg" })),
        {
          kind: "ai-generated",
          provider: "perfect-corp",
          feature: "hair",
          createdAt: "2026-11-02T14:10:47.553Z",
        },
      );
  }, bytes);
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toContainText("AI-generated hair preview");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  await navigate(page, "My wardrobe");
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
  const canvas = page.locator(".dressing-stage canvas");
  await expect(canvas).toHaveAttribute("data-face-source", "shared", {
    timeout: 45000,
  });
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toContainText("AI-generated hair preview");
  await expect(page.locator(".dressing-provider")).toContainText(
    "opens a separate provider workflow and requests consent before upload",
  );
  const calls = await canvas.getAttribute("data-face-inferences");
  for (const [name, value] of [
    ["Width", "0.65"],
    ["Rotation", "13"],
  ]) {
    const slider = page.getByRole("slider", { name, exact: true });
    await slider.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await slider.fill(value);
    await expect(canvas).toHaveAttribute("data-face-inferences", calls!);
    if (info.project.name === "mobile") {
      const preview = page.locator(".dressing-edit-preview canvas");
      const box = (await preview.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height / 2);
      const sliderBox = (await slider.boundingBox())!;
      expect(sliderBox.y).toBeGreaterThan(box.y + box.height);
      expect(sliderBox.y + sliderBox.height).toBeLessThan(
        page.viewportSize()!.height,
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const main = document.querySelector<HTMLCanvasElement>(
                ".dressing-stage canvas",
              )!,
              mini = document.querySelector<HTMLCanvasElement>(
                ".dressing-edit-preview canvas",
              )!;
            const scratch = document.createElement("canvas");
            scratch.width = mini.width;
            scratch.height = mini.height;
            scratch
              .getContext("2d")!
              .drawImage(main, 0, 0, mini.width, mini.height);
            const expected = scratch
                .getContext("2d")!
                .getImageData(0, 0, mini.width, mini.height).data,
              actual = mini
                .getContext("2d")!
                .getImageData(0, 0, mini.width, mini.height).data;
            return expected.every((value, i) => value === actual[i]);
          }),
        )
        .toBe(true);
      await page.screenshot({
        path: `cook/stills/r06-ux-followup/mobile-${name.toLowerCase()}.png`,
      });
    }
  }
  await page
    .getByLabel("Name this outfit", { exact: true })
    .fill("UX placement study");
  await page
    .getByRole("button", { name: "Save this outfit", exact: true })
    .click();
  const restore = page.getByRole("button", {
    name: "UX placement study",
    exact: true,
  });
  await restore.scrollIntoViewIfNeeded();
  await restore.click();
  await expect
    .poll(async () => (await canvas.boundingBox())!.y)
    .toBeGreaterThanOrEqual(0);
  await expect
    .poll(async () => (await canvas.boundingBox())!.y)
    .toBeLessThan(160);
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toContainText("AI-generated hair preview");
  await page.screenshot({
    path: `cook/stills/r06-ux-followup/restored-${info.project.name}.png`,
  });
  expect(uploads).toEqual([]);
  expect(
    await page.evaluate(async () => {
      const path = "/packages/local-database/src/index.ts";
      const record = (await (await import(path)).db.outfits.toArray())[0];
      return {
        photo: record.personMediaAssetId,
        provenance: record.personProvenance,
      };
    }),
  ).toEqual({ photo: undefined, provenance: undefined });
});

test("generated photo consent preserves closed provenance through reload and visibly labels PNG without changing ordinary exports", async ({
  page,
}, info) => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
  await navigate(page, "My wardrobe");
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
  const canvas = page.locator(".dressing-stage canvas");
  await expect(canvas).toHaveAttribute(
    "data-portrait-source",
    "/images/portrait-neutral.jpg",
  );
  const original = await canvas.evaluate(
    (el: HTMLCanvasElement) => el.toDataURL("image/png").split(",")[1],
  );
  const ordinaryPending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export composition", exact: true })
    .click();
  const ordinary = await ordinaryPending;
  const ordinaryBytes = await readFile((await ordinary.path())!);
  expect(createHash("sha256").update(ordinaryBytes).digest("hex")).toBe(
    createHash("sha256").update(Buffer.from(original, "base64")).digest("hex"),
  );

  const bytes = (
    await readFile("cook/evidence/r06-live-001/generated-hair.jpg")
  ).toString("base64");
  const provenance = {
    kind: "ai-generated",
    provider: "perfect-corp",
    feature: "hair",
    createdAt: "2026-11-02T14:10:47.553Z",
  };
  await page.evaluate(
    async ({ bytes, provenance }) => {
      const resource = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .reverse()
        .find(
          (url) => new URL(url).pathname === "/apps/web/src/state/store.ts",
        );
      if (!resource) throw new Error("Store unavailable");
      const { useApp } = await import(resource);
      const data = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0));
      useApp
        .getState()
        .setGeneratedPortrait(
          URL.createObjectURL(new Blob([data], { type: "image/jpeg" })),
          provenance,
        );
    },
    { bytes, provenance },
  );
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toContainText("AI-generated hair preview");
  await expect(canvas).toHaveAttribute("data-portrait-source", /^blob:/);
  await expect(canvas).toHaveAttribute("data-face-source", /shared|local/, {
    timeout: 45000,
  });
  const dimensions = await canvas.evaluate((el: HTMLCanvasElement) => ({
    width: el.width,
    height: el.height,
  }));
  const generatedPending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export composition", exact: true })
    .click();
  const generated = await generatedPending;
  const exportPath = `cook/stills/r06-ux-followup/generated-composition-export-${info.project.name}.png`;
  await generated.saveAs(exportPath);
  const exported = await readFile(exportPath);
  expect(exported.readUInt32BE(16)).toBe(dimensions.width);
  expect(exported.readUInt32BE(20)).toBe(dimensions.height + 56);
  expect(
    await page.evaluate(
      async ({ png, y }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const scratch = document.createElement("canvas");
        scratch.width = image.width;
        scratch.height = image.height;
        const context = scratch.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, y, image.width, 56).data;
        let ink = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 150)
            ink++;
        return ink;
      },
      { png: exported.toString("base64"), y: dimensions.height },
    ),
  ).toBeGreaterThan(100);
  await page
    .getByLabel("Name this outfit", { exact: true })
    .fill("Generated retained study");
  await page
    .getByRole("checkbox", {
      name: "Also store my uploaded photos locally",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save this outfit", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Generated retained study", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(async () => {
    const path = "/packages/local-database/src/index.ts";
    const { db } = await import(path);
    const record = (await db.outfits.toArray())[0];
    return {
      id: record.id,
      provenance: record.personProvenance,
      photos: await db.mediaAssets.count(),
    };
  });
  expect(stored.provenance).toEqual(provenance);
  expect(stored.photos).toBe(1);
  await page.reload();
  await navigate(page, "My wardrobe");
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generated retained study", exact: true })
    .click();
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toContainText("AI-generated hair preview");
  expect(
    await page.evaluate(async () => {
      const resource = performance
        .getEntriesByType("resource")
        .map((e) => e.name)
        .reverse()
        .find(
          (url) => new URL(url).pathname === "/apps/web/src/state/store.ts",
        );
      return (await import(resource!)).useApp.getState().originalPortraitUrl;
    }),
  ).toBeNull();
  await navigate(page, "Skin & rituals");
  await expect(page.locator(".skin-generated-notice")).toContainText(
    "cannot describe your skin",
  );
  await page.getByRole("button", { name: "Skin & care", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Prepare scan framing", exact: true }),
  ).toBeDisabled();
  await navigate(page, "The studio");
  await page
    .getByRole("button", { name: "Use studio portrait", exact: true })
    .click();
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toHaveCount(0);
  await expect(page.locator(".mirror-media canvas")).toHaveAttribute(
    "data-source-url",
    "/images/portrait-neutral.jpg",
  );
  // A backup can carry arbitrary GenericRecord fields. Closed parsing must
  // reject expanded provenance rather than reopen that image as an original.
  await page.evaluate(
    async ({ id, provenance }) => {
      const path = "/packages/local-database/src/index.ts";
      await (
        await import(path)
      ).db.outfits.update(id, {
        personProvenance: { ...provenance, secret: "untrusted extra field" },
      });
    },
    { id: stored.id, provenance },
  );
  await navigate(page, "My wardrobe");
  await page
    .getByRole("button", { name: "Dressing room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Generated retained study", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText(
    "invalid source provenance",
  );
  await expect(canvas).toHaveAttribute(
    "data-portrait-source",
    "/images/portrait-neutral.jpg",
  );
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toHaveCount(0);
  expect(posts).toEqual([]);
});

test("bag touch targets are usable and merchant receipt never covers its source action", async ({
  page,
}, info) => {
  const source = MERCHANT_SOURCES[0],
    reference = source.references[0];
  await page.route("**/api/session", (route) =>
    route.fulfill({ json: { csrfToken: "fixture" } }),
  );
  await page.route("**/api/merchants/refresh", (route) =>
    route.fulfill({
      json: {
        sourceId: source.id,
        referenceId: reference.id,
        fetchedAt: new Date().toISOString(),
        cached: false,
        nextRefreshAt: new Date(Date.now() + 900000).toISOString(),
        observations: [
          {
            id: crypto.randomUUID(),
            sourceId: source.id,
            referenceId: reference.id,
            merchant: source.name,
            title: reference.title,
            variantId: "ux-fixture",
            variantName: "SKU UX FIXTURE",
            amount: 11950,
            currency: "NGN",
            availability: "in-stock",
            fetchedAt: new Date().toISOString(),
            sourceUrl: reference.url,
            evidenceType: "json-ld",
            status: "observed",
            note: "TEST FIXTURE: simulated merchant response for touch-layout testing.",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await navigate(page, "The beauty edit");
  await page
    .getByRole("button", { name: "Source checks", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Check current source", exact: true })
    .click();
  const action = page.getByRole("button", {
    name: "Add planning quote",
    exact: true,
  });
  await action.click();
  await expect(page.locator(".toast")).toContainText("No order");
  const hit = await action.evaluate((button) => {
    const b = button.getBoundingClientRect(),
      t = document.querySelector(".toast")!.getBoundingClientRect();
    return {
      unobscured: button.contains(
        document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
      ),
      below: t.top >= b.bottom,
    };
  });
  expect(hit).toEqual({ unobscured: true, below: true });
  await page.screenshot({
    path: `cook/stills/r06-ux-followup/merchant-action-${info.project.name}.png`,
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: /Your bag/ }).click();
  if (info.project.name === "mobile") {
    for (const target of [
      page.getByRole("button", { name: "Close dialog", exact: true }),
      page.getByRole("button", { name: /^Remove .* from bag$/ }),
      page.getByRole("spinbutton"),
    ]) {
      const box = (await target.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({
    path: `cook/stills/r06-ux-followup/bag-${info.project.name}.png`,
  });
  const sourceAction = page.getByRole("button", {
    name: "Check reviewed merchant sources",
    exact: true,
  });
  await sourceAction.scrollIntoViewIfNeeded();
  const bagHit = await sourceAction.evaluate((button) => {
    const b = button.getBoundingClientRect(),
      t = document.querySelector(".toast")!.getBoundingClientRect();
    return {
      unobscured: button.contains(
        document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
      ),
      below: t.top >= b.bottom,
    };
  });
  expect(bagHit).toEqual({ unobscured: true, below: true });
  await page.screenshot({
    path: `cook/stills/r06-ux-followup/bag-source-action-${info.project.name}.png`,
  });
});
