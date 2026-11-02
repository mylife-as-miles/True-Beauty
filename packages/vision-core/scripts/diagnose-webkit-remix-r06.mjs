import { webkit } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const fast = process.argv[2] === "fast";
const out = "packages/vision-core/evidence/r06";
await mkdir(out, { recursive: true });
const browser = await webkit.launch({
  headless: true,
  executablePath: "/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh",
});
try {
  const page = await browser.newPage();
  await page.route("**/api/**", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "No service calls allowed in read-only Remix diagnostic" },
    }),
  );
  await page.goto("http://127.0.0.1:5173/");
  if (!fast)
    await page
      .locator(".mirror-state")
      .filter({ hasText: "Face mesh connected" })
      .waitFor({ timeout: 45000 });
  const setup = await page.evaluate(async () => {
    const resources = performance
        .getEntriesByType("resource")
        .map((e) => e.name),
      records = [];
    Object.assign(window, { __remixVisionRecords: records });
    for (const [suffix, name] of [
      ["/packages/vision-core/src/workerClient.ts", "VisionWorkerClient"],
      ["/packages/vision-core/src/pipeline.ts", "VisionPipeline"],
    ]) {
      const url = resources.find((url) => new URL(url).pathname === suffix);
      if (!url) continue;
      const exports = await import(/* @vite-ignore */ url),
        Engine = exports[name],
        native = Engine.prototype.analyzeImage;
      Engine.prototype.analyzeImage = async function (source, features) {
        const record = {
          engine: name,
          sourceType: source.constructor.name,
          sourceSize: [
            source.naturalWidth ?? source.width,
            source.naturalHeight ?? source.height,
          ],
          features,
        };
        records.push(record);
        try {
          const snapshot = await native.call(this, source, features);
          record.face = snapshot.landmarks.length;
          record.hands = snapshot.hands.length;
          record.hairMean = snapshot.hairMask
            ? snapshot.hairMask.data.reduce((a, b) => a + b, 0) /
              snapshot.hairMask.data.length
            : null;
          record.status = snapshot.status;
          if (source instanceof HTMLCanvasElement)
            Object.assign(window, { __actualRemixCanvas: source });
          return snapshot;
        } catch (error) {
          record.error = String(error);
          throw error;
        }
      };
    }
    return resources.filter((url) => url.includes("/vision-core/src/"));
  });
  await page
    .getByRole("button", { name: "Look Remix", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Interpret this reference", exact: true })
    .click();
  await page
    .locator('.look-remix[data-remix-phase="ready"]')
    .waitFor({ timeout: 45000 });
  const result = await page.evaluate(async () => {
    const records = window.__remixVisionRecords,
      canvas = window.__actualRemixCanvas;
    let actualCanvas = null;
    if (canvas) {
      const bytes = canvas
          .getContext("2d")
          .getImageData(0, 0, canvas.width, canvas.height).data,
        hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
      actualCanvas = { width: canvas.width, height: canvas.height, hash };
    }
    const { createVision } = await import("/packages/vision-core/src/index.ts");
    const engine = createVision(),
      image = new Image();
    image.src = "/images/portrait-2.jpg";
    await image.decode();
    let retry = [];
    try {
      for (const [name, source] of [
        ["image", image],
        ["sameCanvasAfterReadback", canvas],
      ])
        if (source) {
          const s = await engine.analyzeImage(source, {
            face: true,
            hair: true,
            hands: true,
          });
          retry.push({
            name,
            face: s.landmarks.length,
            hairMean: s.hairMask
              ? s.hairMask.data.reduce((a, b) => a + b, 0) /
                s.hairMask.data.length
              : null,
            status: s.status,
          });
        }
    } finally {
      engine.dispose();
    }
    return {
      records,
      actualCanvas,
      retry,
      heading: document.querySelector(".remix-result h2")?.textContent,
      notices: [
        ...document.querySelectorAll(".remix-notice,.remix-warning"),
      ].map((n) => n.textContent),
    };
  });
  const evidence = {
    recordedAt: new Date().toISOString(),
    browser: browser.version(),
    fastNavigation: fast,
    setup,
    ...result,
    limits:
      "Runtime instrumentation records actual model results without replacing any geometry; all service API calls blocked. Canvas readback is after the initial Remix inference, to distinguish readback effects.",
  };
  await writeFile(
    out + `/webkit-remix-${fast ? "fast" : "ready"}-diagnostic.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
  await page.screenshot({
    path: out + `/webkit-remix-${fast ? "fast" : "ready"}-diagnostic.png`,
    fullPage: true,
  });
} finally {
  await browser.close();
}
