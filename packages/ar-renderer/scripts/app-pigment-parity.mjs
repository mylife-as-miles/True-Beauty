import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = "cook/stills/r05-materials/app-parity";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1480, height: 1040 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TB_APP_ORIGIN || "http://127.0.0.1:5173");
  await page.waitForFunction(
    () =>
      document
        .querySelector(".mirror-state")
        ?.textContent.includes("Face mesh connected"),
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Matte", exact: true }).click();
  await page
    .locator('input[aria-label="Custom makeup colour"]')
    .fill("#ae4c8b");
  const slider = page.getByRole("slider", { name: "Intensity", exact: true });
  await slider.focus();
  await slider.press("End");
  for (let i = 0; i < 10; i++) await slider.press("ArrowLeft");
  await page.locator(".studio-quality summary").click();
  const records = [];
  for (const [label, button, mode] of [
    ["balanced", "Balanced", "canvas2d"],
    ["detailed", "Detailed materials", "webgl2"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.waitForFunction(
      (m) =>
        document
          .querySelector(".mirror-frame")
          ?.getAttribute("data-renderer") === m,
      mode,
    );
    await page.waitForTimeout(350);
    const record = await page.evaluate(() => {
      const c = document.querySelector(".mirror-media canvas"),
        data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      return {
        width: c.width,
        height: c.height,
        backend: document
          .querySelector(".mirror-frame")
          .getAttribute("data-renderer"),
        colour: document.querySelector(
          'input[aria-label="Custom makeup colour"]',
        ).value,
        intensity: document.querySelector("#intensity").value,
        pixelCount: data.length / 4,
      };
    });
    records.push({ label, ...record });
    await page.screenshot({
      path: out + "/" + label + "-matte.png",
      fullPage: true,
    });
  }
  // Compare the same normalized lower-lip region on actual app output in each mode.
  const sample = await page.evaluate(async () => {
    const { createVision } = await import("/packages/vision-core/src/index.ts");
    const image = new Image();
    image.src = "/images/portrait-neutral.jpg";
    await image.decode();
    const engine = createVision();
    const snap = await engine.analyzeImage(image, { face: true });
    engine.dispose();
    return {
      cx: (snap.landmarks[61].x + snap.landmarks[291].x) / 2,
      cy: (snap.landmarks[14].y + snap.landmarks[17].y) / 2,
      rx: (snap.landmarks[291].x - snap.landmarks[61].x) * 0.16,
      ry: (snap.landmarks[17].y - snap.landmarks[14].y) * 0.16,
    };
  });
  const samples = [];
  for (const [label, button, mode] of [
    ["balanced", "Balanced", "canvas2d"],
    ["detailed", "Detailed materials", "webgl2"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await page.waitForFunction(
      (m) =>
        document
          .querySelector(".mirror-frame")
          ?.getAttribute("data-renderer") === m,
      mode,
    );
    await page.waitForTimeout(300);
    samples.push({
      label,
      rgb: await page.evaluate((s) => {
        const c = document.querySelector(".mirror-media canvas"),
          d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data,
          sums = [0, 0, 0];
        let count = 0;
        for (
          let y = Math.floor((s.cy - s.ry) * c.height);
          y <= Math.ceil((s.cy + s.ry) * c.height);
          y++
        )
          for (
            let x = Math.floor((s.cx - s.rx) * c.width);
            x <= Math.ceil((s.cx + s.rx) * c.width);
            x++
          ) {
            const i = (y * c.width + x) * 4;
            for (let k = 0; k < 3; k++) sums[k] += d[i + k];
            count++;
          }
        return sums.map((n) => n / count);
      }, sample),
    });
  }
  const maxDelta = Math.max(
    ...samples[0].rgb.map((n, i) => Math.abs(n - samples[1].rgb[i])),
  );
  const report = {
    records,
    samples,
    maxRgbDelta: maxDelta,
    errors,
    note: "Actual app controls, same #AE4C8B at90% matte on the supplied demo. Digital pixel parity, not calibrated physical shade accuracy.",
  };
  await writeFile(out + "/report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (
    maxDelta > 8 ||
    records.some((r) => r.colour !== "#ae4c8b" || r.intensity !== "90") ||
    errors.length
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
