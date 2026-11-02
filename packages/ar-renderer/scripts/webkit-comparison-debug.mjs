import { webkit } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await webkit.launch({
  headless: true,
  executablePath:
    process.env.TB_WEBKIT_EXECUTABLE ||
    "/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh",
  env: {
    ...process.env,
    LIBGL_ALWAYS_SOFTWARE: "1",
    GALLIUM_DRIVER: "llvmpipe",
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: "1",
  },
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(m.text().slice(0, 200));
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForSelector(".mirror-state");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".mirror-state")
        ?.textContent.includes("Face mesh connected"),
    { timeout: 30000 },
  );
  for (const [name, preset] of [
    ["Daylight", "Soft glow"],
    ["Evening", "After hours"],
  ]) {
    await page.locator(".preset-item").filter({ hasText: preset }).click();
    await page
      .getByRole("button", { name: "Save this look", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Name your look" }).fill(name);
    await page
      .getByRole("button", { name: "Save look locally", exact: true })
      .click();
  }
  const recipes = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("true-beauty");
        req.onsuccess = () => {
          const db = req.result;
          const read = db
            .transaction("savedLooks")
            .objectStore("savedLooks")
            .getAll();
          read.onsuccess = () => resolve(read.result);
          read.onerror = () => reject(read.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
  console.log(
    "recipes",
    recipes.map((r) => ({
      name: r.name,
      lipstick: r.look.lipstick,
      blush: r.look.blush,
    })),
  );
  await page
    .getByRole("button", { name: "Beauty journal", exact: true })
    .click();
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
  await page.waitForFunction(
    () =>
      document
        .querySelector(".comparison-note")
        ?.textContent.includes("Replayed on the same demo portrait"),
    { timeout: 30000 },
  );
  const appStats = await page
    .locator(".saved-compare-grid canvas")
    .evaluateAll((cs) =>
      cs.map((c) => {
        const p = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
        let sum = 0,
          nonBlack = 0;
        for (let i = 0; i < p.length; i += 4) {
          sum += p[i] + p[i + 1] + p[i + 2];
          if (p[i] + p[i + 1] + p[i + 2] > 20) nonBlack++;
        }
        return { width: c.width, height: c.height, sum, nonBlack };
      }),
    );
  console.log("appStats", appStats);
  const isolated = await page.evaluate(async () => {
    const { BeautyRenderer } =
      await import("/packages/ar-renderer/src/index.ts");
    const { createVision } = await import("/packages/vision-core/src/index.ts");
    const { LOOK_PRESETS } =
      await import("/packages/makeup-engine/src/index.ts");
    const { validFace } = await import("/packages/ar-renderer/src/geometry.ts");
    const { FaceMaskAtlas } =
      await import("/packages/ar-renderer/src/masks.ts");
    const image = new Image();
    image.src = "/images/portrait-neutral.jpg";
    await image.decode();
    const engine = createVision();
    const snap = await engine.analyzeImage(image, { face: true });
    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    source.getContext("2d").drawImage(image, 0, 0);
    const points = snap.landmarks;
    const atlas = new FaceMaskAtlas();
    atlas.update(
      points,
      source.width,
      source.height,
      new Set(["lipstick", "blush", "eyeshadow"]),
    );
    const maskStats = atlas.layerMasks.slice(0, 3).map((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let alpha = 0;
      for (let i = 3; i < d.length; i += 4) alpha += d[i];
      return alpha;
    });
    const results = [];
    for (const forceCanvas of [true, false])
      for (const id of ["soft-glow", "berry"]) {
        const canvas = document.createElement("canvas");
        const renderer = new BeautyRenderer(canvas, { forceCanvas });
        const look = LOOK_PRESETS.find((p) => p.id === id).look;
        renderer.render({ source: image, landmarks: points, look });
        const d = canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        results.push({
          forceCanvas,
          id,
          mode: renderer.mode,
          activeMode: renderer.activeMode,
          gpuRenderer: renderer.gpuRenderer,
          fallbackReason: renderer.fallbackReason,
          sum,
          width: canvas.width,
          height: canvas.height,
          landmarks: points.length,
          valid: validFace(points),
          maskStats,
        });
        renderer.dispose();
      }
    engine.dispose();
    return results;
  });
  console.log("isolated", JSON.stringify(isolated, null, 2));
  await mkdir("cook/stills/webkit-debug", { recursive: true });
  await page.screenshot({
    path: "cook/stills/webkit-debug/after-resize-fix.png",
    fullPage: true,
  });
  await writeFile(
    "cook/stills/webkit-debug/report-after-resize-fix.json",
    JSON.stringify({ recipes, appStats, isolated, errors }, null, 2),
  );
} finally {
  await browser.close();
}
