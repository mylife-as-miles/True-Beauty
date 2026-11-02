import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = path.join(root, "packages/vision-core/evidence/r06");
await mkdir(out, { recursive: true });
const origin = process.argv[2] ?? "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
    serviceWorkers: "block",
  });
  await page.route(origin + "/r06-stress", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body></body></html>",
    }),
  );
  await page.goto(origin + "/r06-stress");
  const result = await page.evaluate(async () => {
    const {
      VisionWorkerClient,
      maskPredictionAgreement,
      summarizeVision,
      summarizeValidationCoverage,
    } = await import("/packages/vision-core/src/index.ts");
    const { ExtendedAccessoryRenderer } =
      await import("/packages/ar-renderer/src/accessories.ts");
    const { createDefaultLook } =
      await import("/packages/makeup-engine/src/index.ts");
    const engine = new VisionWorkerClient(),
      image = new Image();
    image.src = "/images/portrait-neutral.jpg";
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 900;
    const c = canvas.getContext("2d");
    const cases = [
      ["reference", "none"],
      ["underexposed-simulation", "brightness(0.5)"],
      ["warm-light-simulation", "sepia(0.35)"],
      ["blur-simulation", "blur(3px)"],
    ];
    let baseline = null,
      reference = null;
    const stress = [];
    for (const [label, filter] of cases) {
      c.filter = filter;
      c.drawImage(image, 0, 0, 600, 900);
      c.filter = "none";
      const snapshot = await engine.analyzeImage(canvas, {
        face: true,
        body: true,
        pose: true,
        hands: true,
      });
      if (!baseline) {
        baseline = snapshot.bodyMask;
        reference = snapshot;
      }
      stress.push({
        label,
        source: "synthetic transform of one licensed evaluation portrait",
        summary: summarizeVision(snapshot),
        predictionAgreement: Object.fromEntries(
          [1, 2, 3, 4].map((category) => [
            category,
            maskPredictionAgreement(
              baseline,
              snapshot.bodyMask,
              category,
              true,
            ),
          ]),
        ),
      });
    }
    const look = createDefaultLook();
    look.accessories = {
      glasses: false,
      earrings: false,
      necklace: false,
      ring: true,
      bracelet: true,
      watch: true,
      hat: true,
    };
    const raw = document.createElement("canvas"),
      masked = document.createElement("canvas");
    raw.width = masked.width = 600;
    raw.height = masked.height = 900;
    const rawCtx = raw.getContext("2d"),
      maskedCtx = masked.getContext("2d");
    rawCtx.drawImage(image, 0, 0, 600, 900);
    maskedCtx.drawImage(image, 0, 0, 600, 900);
    const renderer = new ExtendedAccessoryRenderer(),
      frame = {
        landmarks: reference.landmarks,
        hands: reference.hands,
        pose: reference.pose,
        bodyMask: reference.bodyMask,
        look,
        compare: -1,
      };
    const compose = renderer.compose.bind(renderer);
    // Test instrumentation bypasses only semantic exclusion, preserving identical
    // geometry projected from the same real body/face/hand/pose predictions.
    renderer.compose = (context, current, ...args) =>
      compose(context, { ...current, bodyMask: null }, ...args);
    renderer.drawHat(rawCtx, frame, 600, 900);
    renderer.drawBody(rawCtx, frame, 600, 900);
    renderer.compose = compose;
    renderer.drawHat(maskedCtx, frame, 600, 900);
    renderer.drawBody(maskedCtx, frame, 600, 900);
    const original = document.createElement("canvas");
    original.width = 600;
    original.height = 900;
    original.getContext("2d").drawImage(image, 0, 0, 600, 900);
    const originalData = original
        .getContext("2d")
        .getImageData(0, 0, 600, 900).data,
      a = rawCtx.getImageData(0, 0, 600, 900).data,
      b = maskedCtx.getImageData(0, 0, 600, 900).data;
    let rawPixels = 0,
      maskedPixels = 0,
      semanticChangedPixels = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (
        Math.max(
          ...[0, 1, 2].map((k) => Math.abs(a[i + k] - originalData[i + k])),
        ) > 3
      )
        rawPixels++;
      if (
        Math.max(
          ...[0, 1, 2].map((k) => Math.abs(b[i + k] - originalData[i + k])),
        ) > 3
      )
        maskedPixels++;
      if (Math.max(...[0, 1, 2].map((k) => Math.abs(a[i + k] - b[i + k]))) > 3)
        semanticChangedPixels++;
    }
    const heading = document.createElement("h1");
    heading.textContent =
      "Real semantic exclusion — unmasked / actual body-class mask";
    document.body.append(heading);
    const caption = document.createElement("p");
    caption.textContent =
      "One evaluation portrait; real detected face/hand/pose anchors. Test instrumentation bypasses only semantic exclusion in the left panel. Semantic boundaries are model predictions, not depth. Visible pixel suppression is a compositing integration check, not mask accuracy.";
    document.body.append(caption);
    const grid = document.createElement("div");
    grid.style.cssText = "display:flex;gap:24px";
    raw.style.width = masked.style.width = "45vw";
    grid.append(raw, masked);
    document.body.append(grid);
    document.body.style.cssText =
      "background:#f5f0e9;color:#352727;font:16px sans-serif";
    renderer.dispose();
    engine.dispose();
    return {
      stress,
      occlusion: { rawPixels, maskedPixels, semanticChangedPixels },
      coverage: summarizeValidationCoverage([
        {
          fixtureId: "portrait-neutral",
          source: "public-evaluation",
          consented: false,
          deviceLabel: "Linux software Chromium server",
          faceAvailable: reference.landmarks.length > 0,
          bodyAvailable: !!reference.bodyMask,
          poseAvailable: !!reference.pose,
        },
      ]),
      limitations: [
        "Lighting and blur are simulated stressors, not new people or complexion cohorts.",
        "Prediction agreement is relative to another prediction and has no annotated ground truth.",
        "Viewport emulation is not physical mobile validation.",
        "Occlusion preserves actual face/hand/pose projections and bypasses only semantic exclusion via test instrumentation in the left panel. No metric depth or fit claim.",
      ],
    };
  });
  await page.screenshot({
    path: path.join(out, "actual-semantic-exclusion.png"),
    fullPage: true,
  });
  const evidence = {
    recordedAt: new Date().toISOString(),
    browser: browser.version(),
    cpu: os.cpus()[0]?.model,
    ...result,
  };
  await writeFile(
    path.join(out, "stress-semantic-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
  if (
    result.stress.some((s) => !s.summary.body) ||
    result.occlusion.rawPixels === 0 ||
    result.occlusion.semanticChangedPixels < 100
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
