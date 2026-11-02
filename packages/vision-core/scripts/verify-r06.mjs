import { chromium } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const out = path.join(root, "packages/vision-core/evidence/r06");
await mkdir(out, { recursive: true });
const origin = process.argv[2] ?? "http://127.0.0.1:5173";
const fixtures = [
  {
    id: "portrait-development",
    src: "/images/portrait-neutral.jpg",
    role: "development",
    credit: "Unsplash: photo-1531123897727-8f129e1688ce",
    rights:
      "See ASSET_PROVENANCE.md; evaluation only, publicity-rights audit not a marketing clearance.",
  },
  {
    id: "portrait-context",
    src: "/images/portrait-2.jpg",
    role: "existing regression",
    credit: "Unsplash: photo-1524504388940-b1c1722653e1",
    rights: "See ASSET_PROVENANCE.md; evaluation only.",
  },
  {
    id: "iss040e006091",
    src: "/evaluation/r06/iss040e006091.jpg",
    role: "application holdout",
    credit: "NASA/JSC; photographer credited in official record: Reid Wiseman",
    rights:
      "Factual nontraining evaluation only. No NASA endorsement. See evaluation/r06/rights.json.",
  },
  {
    id: "iss018e030096",
    src: "/evaluation/r06/iss018e030096.jpg",
    role: "application holdout",
    credit: "NASA/JSC; Sandra Magnus exercise record",
    rights:
      "Factual nontraining evaluation only. No NASA endorsement. See evaluation/r06/rights.json.",
  },
];
const sourceHashes = {};
for (const file of [
  "packages/ar-renderer/src/accessories.ts",
  "packages/vision-core/src/pipeline.ts",
  "packages/body-segmentation/src/index.ts",
])
  sourceHashes[file] = createHash("sha256")
    .update(await readFile(path.join(root, file)))
    .digest("hex");
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1100 },
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const modelRequests = [];
  const posts = [];
  page.on("request", (r) => {
    if (r.url().includes("/models/"))
      modelRequests.push(new URL(r.url()).pathname);
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.route(origin + "/r06-validation", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body></body></html>",
    }),
  );
  await page.goto(origin + "/r06-validation");
  const results = [];
  for (const fixture of fixtures) {
    const result = await page.evaluate(async (fixture) => {
      const { VisionWorkerClient } =
        await import("/packages/vision-core/src/index.ts");
      const { BeautyRenderer, accessoryAnchorStatus, projectAccessoryAnchors } =
        await import("/packages/ar-renderer/src/index.ts");
      const { createDefaultLook, MAKEUP_LAYERS } =
        await import("/packages/makeup-engine/src/index.ts");
      window.__r06Engine ??= new VisionWorkerClient();
      const engine = window.__r06Engine;
      const image = new Image();
      image.src = fixture.src;
      await image.decode();
      const begin = performance.now();
      const snapshot = await engine.analyzeImage(image, {
        face: true,
        hair: true,
        hands: true,
        body: true,
        pose: true,
      });
      const roundtripMs = performance.now() - begin;
      const body = snapshot.bodyMask,
        counts = [0, 0, 0, 0, 0, 0];
      let confidence = 0;
      if (body)
        for (let i = 0; i < body.labels.length; i++) {
          counts[body.labels[i]]++;
          confidence += body.confidence[i];
        }
      const look = createDefaultLook();
      for (const key of MAKEUP_LAYERS) look[key].enabled = false;
      look.hair.enabled = false;
      const canvas = document.createElement("canvas");
      const renderer = new BeautyRenderer(canvas, {
        forceCanvas: true,
        maxSide: 960,
      });
      const frame = {
        source: image,
        landmarks: snapshot.landmarks,
        hands: snapshot.hands,
        bodyMask: snapshot.bodyMask,
        pose: snapshot.pose,
        look,
      };
      renderer.render(frame);
      const ctx = canvas.getContext("2d"),
        baseline = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixels = [];
      for (const key of ["ring", "bracelet", "watch", "hat", "necklace"]) {
        const only = {
          ...look,
          accessories: {
            glasses: false,
            earrings: false,
            necklace: false,
            [key]: true,
          },
        };
        renderer.render({ ...frame, look: only });
        const actual = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let changed = 0,
          minX = canvas.width,
          minY = canvas.height,
          maxX = -1,
          maxY = -1;
        for (let i = 0; i < actual.length; i += 4)
          if (
            Math.max(
              Math.abs(actual[i] - baseline[i]),
              Math.abs(actual[i + 1] - baseline[i + 1]),
              Math.abs(actual[i + 2] - baseline[i + 2]),
            ) > 3
          ) {
            changed++;
            const p = i / 4,
              x = p % canvas.width,
              y = Math.floor(p / canvas.width);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        pixels.push({
          key,
          changedPixels: changed,
          bounds: changed ? { minX, minY, maxX, maxY } : null,
        });
      }
      const all = {
        ...look,
        accessories: {
          glasses: false,
          earrings: false,
          necklace: true,
          ring: true,
          bracelet: true,
          watch: true,
          hat: true,
        },
      };
      renderer.render({ ...frame, look: all });
      const anchors = projectAccessoryAnchors(
          frame,
          canvas.width,
          canvas.height,
        ),
        status = accessoryAnchorStatus(
          all.accessories,
          frame,
          canvas.width,
          canvas.height,
        );
      document.body.style.cssText =
        "margin:24px;background:#f5f0e9;color:#2d2525;font:16px sans-serif";
      document.body.innerHTML = "";
      const title = document.createElement("h1");
      title.textContent = fixture.id + " · " + fixture.role;
      document.body.append(title);
      const note = document.createElement("p");
      note.textContent = fixture.credit + ". " + fixture.rights;
      document.body.append(note);
      const info = document.createElement("p");
      info.textContent = `Actual local models: ${snapshot.landmarks.length} face points; ${snapshot.hands.length} hands; ${snapshot.pose?.landmarks.length ?? 0} pose points. Category masks and geometric previews, not measured depth/fit. NASA images are technical evaluation only.`;
      document.body.append(info);
      const grid = document.createElement("div");
      grid.style.cssText =
        "display:grid;grid-template-columns:repeat(3,1fr);gap:20px";
      document.body.append(grid);
      const panel = (label, element) => {
        const s = document.createElement("section"),
          h = document.createElement("h2");
        h.textContent = label;
        s.append(h, element);
        element.style.cssText =
          "width:100%;height:auto;max-height:850px;object-fit:contain";
        grid.append(s);
      };
      const original = document.createElement("img");
      original.src = image.src;
      panel("Original evaluation image", original);
      const segmented = document.createElement("canvas");
      segmented.width = canvas.width;
      segmented.height = canvas.height;
      const sc = segmented.getContext("2d");
      sc.drawImage(image, 0, 0, segmented.width, segmented.height);
      if (body) {
        const small = document.createElement("canvas");
        small.width = body.width;
        small.height = body.height;
        const c = small.getContext("2d"),
          d = c.createImageData(body.width, body.height),
          colors = [
            [0, 0, 0],
            [185, 54, 140],
            [232, 150, 63],
            [70, 198, 151],
            [69, 118, 221],
            [220, 75, 70],
          ];
        for (let i = 0; i < body.labels.length; i++) {
          const color = colors[body.labels[i]];
          for (let k = 0; k < 3; k++) d.data[i * 4 + k] = color[k];
          d.data[i * 4 + 3] =
            body.labels[i] === 0 ? 0 : Math.round(body.confidence[i] * 150);
        }
        c.putImageData(d, 0, 0);
        sc.drawImage(small, 0, 0, segmented.width, segmented.height);
      }
      if (snapshot.pose)
        for (const p of snapshot.pose.landmarks)
          if ((p.visibility ?? 0) > 0.6) {
            sc.fillStyle = "#fff";
            sc.beginPath();
            sc.arc(
              p.x * segmented.width,
              p.y * segmented.height,
              3,
              0,
              Math.PI * 2,
            );
            sc.fill();
          }
      panel("Actual semantic classes / visible pose", segmented);
      panel("Tracked geometric accessory projections", canvas);
      const legend = document.createElement("p");
      legend.textContent =
        "Mask colours: hair pink; body-skin orange; face-skin green; clothes blue; other red. No demographic/medical classes. Low-support/out-of-frame wrist anchors are suppressed.";
      document.body.append(legend);
      const out = {
        fixture,
        sourceSize: [image.naturalWidth, image.naturalHeight],
        latencyMs: snapshot.latencyMs,
        roundtripMs,
        facePoints: snapshot.landmarks.length,
        hands: snapshot.hands.length,
        posePoints: snapshot.pose?.landmarks.length ?? 0,
        poseVisiblePoints:
          snapshot.pose?.landmarks.filter((p) => (p.visibility ?? 0) > 0.6)
            .length ?? 0,
        body: body
          ? {
              width: body.width,
              height: body.height,
              pixelCounts: counts,
              meanWinningConfidence: confidence / body.labels.length,
            }
          : null,
        anchors,
        status,
        pixels,
        modelStatus: structuredClone(snapshot.status),
      };
      renderer.dispose();
      return out;
    }, fixture);
    await page.screenshot({
      path: path.join(out, fixture.id + ".png"),
      fullPage: true,
    });
    results.push(result);
  }
  const negative = await page.evaluate(async () => {
    const v = window.__r06Engine;
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 320;
    const d = c.getContext("2d");
    d.fillStyle = "#b5b3ae";
    d.fillRect(0, 0, 320, 320);
    const s = await v.analyzeImage(c, {
      face: true,
      hands: true,
      body: true,
      pose: true,
    });
    const result = {
      facePoints: s.landmarks.length,
      hands: s.hands.length,
      posePoints: s.pose?.landmarks.length ?? 0,
      personMean: s.bodyMask
        ? s.bodyMask.person.reduce((a, b) => a + b, 0) /
          s.bodyMask.person.length
        : null,
    };
    v.dispose();
    return result;
  });
  const evidence = {
    recordedAt: new Date().toISOString(),
    browser: browser.version(),
    cpu: os.cpus()[0]?.model,
    platform: os.platform(),
    mode: "Real MediaPipe CPU models inside dedicated worker; Canvas2D geometric accessory composite",
    sourceHashes,
    modelRequests,
    posts,
    results,
    negative,
    limitations: [
      "Application holdouts are not known holdouts from upstream pretraining.",
      "NASA policy basis is factual evaluation only, not beauty marketing or endorsement.",
      "No demographic cohorts are inferred or validated.",
      "Class agreement/pixel changes are integration checks, not ground-truth IoU or fit accuracy.",
      "No physical device, moving-body robustness or metric depth claim.",
    ],
  };
  await writeFile(
    path.join(out, "model-accessory-evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
  if (
    results.some(
      (r) =>
        !r.body ||
        r.posePoints !== 33 ||
        r.modelStatus.body?.state !== "ready" ||
        r.modelStatus.pose?.state !== "ready",
    ) ||
    modelRequests.some((s) => s.includes("hair_segmenter.tflite")) ||
    posts.length
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
