import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = process.env.VALIDATION_ORIGIN ?? "http://127.0.0.1:5173",
  out = new URL("../../../cook/stills/validation-r06/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];
for (const [name, width, height] of [
  ["desktop", 1440, 1000],
  ["mobile", 390, 844],
]) {
  const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
      reducedMotion: "reduce",
    }),
    page = await context.newPage(),
    errors = [],
    posts = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.goto(`${origin}/cook/stills/validation-r06/harness.html`);
  await page.getByRole("heading", { name: "Your mirror, measured." }).waitFor();
  await page
    .getByLabel("Evidence source", { exact: true })
    .selectOption("automated-fixture");
  await page.getByLabel("Measured cycles", { exact: true }).selectOption("8");
  await page
    .getByRole("button", { name: "Run local benchmark", exact: true })
    .click();
  await page
    .getByText("Measurement complete", { exact: true })
    .waitFor({ timeout: 60000 });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export numeric report", exact: true })
    .click();
  const file = await download;
  const path = new URL(`benchmark-${name}.json`, out).pathname;
  await file.saveAs(path);
  const report = JSON.parse(await readFile(path, "utf8"));
  assert.equal(report.status, "completed");
  assert.equal(report.execution.iterations, 8);
  assert.equal(report.execution.uniqueInferenceUpdates, 8);
  assert.equal(report.execution.faceDetections, 8);
  assert.equal(report.execution.hairMasks, 8);
  assert.equal(report.execution.featureInferenceRuns.face, 8);
  assert.equal(report.execution.featureInferenceRuns.hair, 8);
  assert.equal(report.timings.inferenceCallMs.count, 8);
  assert.equal(report.accuracy.fairnessValidated, false);
  assert.equal(report.evidenceKind, "automated-fixture");
  const forbidden = new Set([
    "landmarks",
    "pixels",
    "imageBase64",
    "frameData",
    "imageData",
    "confidence",
  ]);
  const inspect = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      assert(!forbidden.has(key), `Raw export field ${key}`);
      inspect(entry);
    }
  };
  inspect(report);
  const examples = [
    {
      id: "synthetic-A",
      groupLabel: "Synthetic A",
      groupingSource: "fixture-defined",
      evidence: "synthetic-ground-truth",
      rightsBasis: "synthetic",
      metric: "mask-iou",
      unit: "ratio",
      value: 1,
    },
    {
      id: "synthetic-B",
      groupLabel: "Synthetic B",
      groupingSource: "fixture-defined",
      evidence: "synthetic-ground-truth",
      rightsBasis: "synthetic",
      metric: "mask-iou",
      unit: "ratio",
      value: 0.5,
    },
  ];
  await page
    .getByLabel("Import numeric evaluation samples", { exact: true })
    .setInputFiles({
      name: "synthetic-arithmetic-only.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(examples)),
    });
  await page.getByText("Insufficient ground truth", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByText("2 samples. Fairness remains unverified.", { exact: true })
      .count(),
    1,
  );
  await page.screenshot({
    path: new URL(`results-${name}.png`, out).pathname,
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.equal(
    axe.violations.length,
    0,
    "The result screen must have no automated accessibility violations.",
  );
  // A synthetic empty PNG only tests pairing consent; it is never exported as accuracy evidence.
  const emptyPng = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 60;
    c.height = 90;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 60, 90);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByText("Compare an annotated hair mask", { exact: true })
    .click();
  const annotationInput = page.getByLabel("Reference binary mask", {
    exact: true,
  });
  await annotationInput.setInputFiles({
    name: "synthetic-pairing-only.png",
    mimeType: "image/png",
    buffer: Buffer.from(emptyPng, "base64"),
  });
  const confirm = page.getByRole("checkbox", {
    name: "I confirm this annotation corresponds to the benchmark source.",
    exact: true,
  });
  await confirm.check();
  assert(
    await page
      .getByRole("button", { name: "Measure hair-mask overlap", exact: true })
      .isEnabled(),
  );
  await annotationInput.setInputFiles({
    name: "different-pairing-only.png",
    mimeType: "image/png",
    buffer: Buffer.from(emptyPng, "base64"),
  });
  assert(!(await confirm.isChecked()));
  assert(
    await page
      .getByRole("button", { name: "Measure hair-mask overlap", exact: true })
      .isDisabled(),
  );
  const databases = await page.evaluate(() => indexedDB.databases());
  assert.equal(databases.length, 0);
  assert.equal(posts.length, 0);
  assert.equal(errors.length, 0);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  records.push({
    name,
    width,
    height,
    browser: browser.version(),
    errors,
    posts,
    databases,
    axe: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target),
    })),
    incomplete: axe.incomplete.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
    reportPath: `benchmark-${name}.json`,
    annotationPairingResetVerified: true,
  });
  await context.close();
}
// Cancellation is an actual held model request, not a timer pretending inference succeeded.
{
  const context = await browser.newContext({
      viewport: { width: 1000, height: 800 },
      serviceWorkers: "block",
    }),
    page = await context.newPage();
  let release;
  const held = new Promise((r) => (release = r));
  let seen = false;
  await page.route("**/models/face_landmarker.task", async (route) => {
    seen = true;
    await held;
    await route.continue().catch(() => {});
  });
  await page.goto(`${origin}/cook/stills/validation-r06/harness.html`);
  await page
    .getByRole("button", { name: "Run local benchmark", exact: true })
    .click();
  for (let i = 0; i < 100 && !seen; i++) await page.waitForTimeout(25);
  assert(seen, "Actual model request was intercepted");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByText("Measurement cancelled", { exact: true })
    .waitFor({ timeout: 5000 });
  release();
  await page.screenshot({ path: new URL("cancelled.png", out).pathname });
  records.push({ name: "cancel-model-load", cancelled: true });
  await context.close();
}
// A canvas-backed MediaStream exercises actual VIDEO inference/lifecycle, not physical hardware.
{
  const context = await browser.newContext({
      viewport: { width: 1000, height: 900 },
      acceptDownloads: true,
    }),
    page = await context.newPage();
  await page.goto(`${origin}/cook/stills/validation-r06/harness.html`);
  await page.evaluate(() => {
    globalThis.__validationStopped = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const image = new Image();
      image.src = "/images/portrait-neutral.jpg";
      await image.decode();
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 900;
      const ctx = c.getContext("2d");
      const draw = () => ctx.drawImage(image, 0, 0, c.width, c.height);
      draw();
      const stream = c.captureStream(20),
        track = stream.getVideoTracks()[0],
        timer = setInterval(draw, 45),
        original = track.stop.bind(track);
      track.stop = () => {
        globalThis.__validationStopped++;
        clearInterval(timer);
        original();
      };
      return stream;
    };
  });
  await page
    .getByLabel("Evidence source", { exact: true })
    .selectOption("automated-fixture");
  await page.getByLabel("Measured cycles", { exact: true }).selectOption("8");
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".validation-preview video")?.readyState >= 2,
  );
  await page
    .getByRole("button", { name: "Run local benchmark", exact: true })
    .click();
  await page
    .getByText("Measurement complete", { exact: true })
    .waitFor({ timeout: 60000 });
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export numeric report", exact: true })
    .click();
  const file = await pending,
    path = new URL("benchmark-camera-fixture.json", out).pathname;
  await file.saveAs(path);
  const report = JSON.parse(await readFile(path, "utf8"));
  assert.equal(report.sourceKind, "camera");
  assert.equal(report.execution.iterations, 8);
  assert(
    report.execution.uniqueInferenceUpdates > 0 &&
      report.execution.uniqueInferenceUpdates <= 8,
  );
  assert.equal(report.evidenceKind, "automated-fixture");
  const stopped = await page.evaluate(() => globalThis.__validationStopped);
  assert.equal(stopped, 1);
  records.push({
    name: "actual-video-stream-fixture",
    stopped,
    uniqueUpdates: report.execution.uniqueInferenceUpdates,
    physicalDeviceVerified: false,
  });
  await context.close();
}
{
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  await page.goto(`${origin}/cook/stills/validation-r06/harness.html`);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "Demo image", exact: true }).click();
  assert.equal(await page.getByRole("alert").count(), 0);
  assert(
    await page
      .getByRole("button", { name: "Run local benchmark", exact: true })
      .isEnabled(),
  );
  records.push({ name: "camera-denial-recovery", recovered: true });
  await context.close();
}
await writeFile(
  new URL("browser-report.json", out),
  JSON.stringify(records, null, 2),
);
await browser.close();
console.log(
  JSON.stringify(
    records.map((r) => ({
      name: r.name,
      axe: r.axe?.length,
      errors: r.errors?.length,
      posts: r.posts?.length,
      cancelled: r.cancelled,
    })),
    null,
    2,
  ),
);
