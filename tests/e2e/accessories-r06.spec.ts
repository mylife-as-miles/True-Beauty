import { test, expect, type Page } from "@playwright/test";
test.use({ serviceWorkers: "block" });
async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 45000 },
  );
}
const pixels = (page: Page) =>
  page
    .locator(".mirror-media canvas")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());
async function snapshotCounts(page: Page) {
  return page.evaluate(async () => {
    const storeUrl = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .find(
        (name) => new URL(name).pathname === "/apps/web/src/state/store.ts",
      );
    if (!storeUrl)
      throw new Error("The actual application store module was not loaded");
    const { useApp } = await import(/* @vite-ignore */ storeUrl);
    const s = useApp.getState().portraitVision?.snapshot;
    return {
      body: s?.bodyMask?.labels.length ?? 0,
      pose: s?.pose?.landmarks.length ?? 0,
      hands: s?.hands.length ?? 0,
    };
  });
}
test("actual hand and pose accessories change pixels; overlap segmentation is opt-in and supplies hair without a second hair task", async ({
  page,
  context,
}, info) => {
  const models: string[] = [],
    posts: string[] = [];
  context.on("request", (r) => {
    if (r.url().includes("/models/")) models.push(new URL(r.url()).pathname);
    if (r.method() === "POST") posts.push(r.url());
  });
  await ready(page);
  await page
    .getByRole("button", { name: "Show full portrait", exact: true })
    .click();
  const original = await pixels(page);
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Preview ring", exact: true })
    .check();
  const status = page.getByRole("status", {
    name: "Accessory tracking status",
  });
  await expect(status).toContainText("Ring: hand anchor available", {
    timeout: 30000,
  });
  await expect.poll(() => pixels(page)).not.toBe(original);
  expect(models.some((m) => m.includes("selfie_multiclass"))).toBe(false);
  await page
    .getByRole("checkbox", { name: "Preview watch", exact: true })
    .check();
  await expect
    .poll(() => snapshotCounts(page), { timeout: 30000 })
    .toMatchObject({ pose: 33, hands: 1, body: 0 });
  await page
    .getByRole("checkbox", { name: "Preview hat", exact: true })
    .check();
  await expect(status).toContainText("Hat: face anchor available");
  await page
    .getByRole("checkbox", { name: "Enhanced overlap detail", exact: true })
    .check();
  await expect
    .poll(async () => (await snapshotCounts(page)).body, { timeout: 30000 })
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Hair", exact: true }).click();
  await page.getByRole("button", { name: "Copper", exact: true }).click();
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  expect(models.some((m) => m.includes("selfie_multiclass"))).toBe(true);
  expect(models.some((m) => m.includes("hair_segmenter.tflite"))).toBe(false);
  expect(posts).toEqual([]);
  expect(
    (await page.locator(".mirror-frame").boundingBox())!.height,
  ).toBeGreaterThan(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(async () => {
      const { db } = await import(
        /* @vite-ignore */ "/packages/local-database/src/" + "index.ts"
      );
      return db.mediaAssets.count();
    }),
  ).toBe(0);
  await page.screenshot({
    path: `cook/stills/r06-accessories/accessories-${info.project.name}.png`,
    fullPage: true,
  });
});
test("missing optional body model is explicit and turning overlap detail off recovers basic previews", async ({
  page,
  context,
}, info) => {
  await context.route("**/models/selfie_multiclass_256x256.tflite", (r) =>
    r.abort("failed"),
  );
  await ready(page);
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Preview hat", exact: true })
    .check();
  await expect(
    page.getByRole("status", { name: "Accessory tracking status" }),
  ).toContainText("Hat: face anchor available", { timeout: 30000 });
  await page
    .getByRole("checkbox", { name: "Enhanced overlap detail", exact: true })
    .check();
  await expect(
    page.getByRole("status", { name: "Optional vision unavailable" }),
  ).toBeVisible({ timeout: 30000 });
  await page
    .getByRole("checkbox", { name: "Enhanced overlap detail", exact: true })
    .uncheck();
  await expect(
    page.getByRole("status", { name: "Optional vision unavailable" }),
  ).toHaveCount(0);
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  await expect(
    page.getByRole("checkbox", { name: "Preview hat", exact: true }),
  ).toBeChecked();
  await page.screenshot({
    path: `cook/stills/r06-accessories/optional-model-recovery-${info.project.name}.png`,
    fullPage: true,
  });
});
test("a portrait without a detected hand retains the ring selection and truthfully reports unavailable anchors", async ({
  page,
}, info) => {
  await ready(page);
  await page.locator(".mirror-label").click();
  await page
    .getByRole("button", { name: "Editorial light", exact: true })
    .click();
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Style", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Preview ring", exact: true })
    .check();
  await expect(
    page.getByRole("status", { name: "Accessory tracking status" }),
  ).toContainText("Ring: anchor unavailable", { timeout: 30000 });
  await expect(
    page.getByRole("status", { name: "Accessory tracking status" }),
  ).toContainText("A sufficiently supported, in-frame hand is needed.");
  await page.screenshot({
    path: `cook/stills/r06-accessories/unavailable-hand-${info.project.name}.png`,
    fullPage: true,
  });
});
test("generated-photo provenance persists in the mirror, labels a real controlled camera stream Live, and restores the original", async ({
  page,
}, info) => {
  // Metadata contract fixture only: this does not claim a live provider generated the image.
  await page.addInitScript(() => {
    // WebKit can discard a per-instance MediaDevices wrapper override while
    // initializing the real models. The shared prototype retains this fixture.
    Object.defineProperty(
      Object.getPrototypeOf(navigator.mediaDevices),
      "getUserMedia",
      {
        configurable: true,
        value: async () => {
          const c = document.createElement("canvas");
          c.width = 480;
          c.height = 720;
          const ctx = c.getContext("2d")!;
          ctx.fillStyle = "#8a8a8a";
          ctx.fillRect(0, 0, 480, 720);
          const stream = c.captureStream(15);
          Object.assign(window, { __r06CameraStream: stream });
          return stream;
        },
      },
    );
  });
  await ready(page);
  await page.evaluate(async () => {
    const storeUrl = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .find(
        (name) => new URL(name).pathname === "/apps/web/src/state/store.ts",
      );
    if (!storeUrl)
      throw new Error("The actual application store module was not loaded");
    const { useApp } = await import(/* @vite-ignore */ storeUrl);
    useApp.getState().setGeneratedPortrait("/images/portrait-2.jpg", {
      kind: "ai-generated",
      provider: "perfect-corp",
      feature: "hair",
      createdAt: "2026-11-02T12:00:00Z",
    });
  });
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toContainText("AI-generated hair preview");
  await page.screenshot({
    path: `cook/stills/r06-accessories/generated-provenance-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Hair", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Explore hairstyle previews",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open camera", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop camera", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("video.vision-video")
        .evaluate(
          (video: HTMLVideoElement) =>
            video.readyState >= 2 &&
            !!video.srcObject &&
            (video.srcObject as MediaStream)
              .getTracks()
              .every((track) => track.readyState === "live"),
        ),
    )
    .toBe(true);
  await expect(page.locator(".mirror-label")).toContainText("Live mirror");
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __r06CameraStream: MediaStream }
        ).__r06CameraStream
          .getTracks()
          .every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore original photo", exact: true })
    .click();
  await expect(
    page.getByRole("note", { name: "Generated image provenance" }),
  ).toHaveCount(0);
  await expect(page.locator(".mirror-media canvas")).toHaveAttribute(
    "data-source-url",
    "/images/portrait-neutral.jpg",
  );
  await expect(page.locator(".mirror-state")).toContainText(
    "Face mesh connected",
    { timeout: 30000 },
  );
  await page.screenshot({
    path: `cook/stills/r06-accessories/provenance-restore-${info.project.name}.png`,
    fullPage: true,
  });
});
