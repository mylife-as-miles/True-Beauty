import { chromium, webkit, firefox } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, loadavg } from "node:os";
const origin = process.env.GRAPHICS_TEST_ORIGIN || "http://127.0.0.1:4174",
  out = process.env.TB_MATERIALS_OUT || "cook/stills/r05-materials";
await mkdir(out, { recursive: true });
const kind = process.env.TB_RENDER_BROWSER || "chromium";
const browser =
  kind === "webkit"
    ? await webkit.launch({
        headless: true,
        executablePath: process.env.TB_WEBKIT_EXECUTABLE,
        env: {
          ...process.env,
          LIBGL_ALWAYS_SOFTWARE: "1",
          GALLIUM_DRIVER: "llvmpipe",
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS: "1",
        },
      })
    : kind === "firefox"
      ? await firefox.launch({
          headless: false,
          env: {
            ...process.env,
            DISPLAY: process.env.DISPLAY || ":99",
            LIBGL_ALWAYS_SOFTWARE: "1",
            GALLIUM_DRIVER: "llvmpipe",
            MOZ_WEBRENDER: "1",
          },
          firefoxUserPrefs: {
            "webgl.force-enabled": true,
            "webgl.disabled": false,
            "gfx.webrender.software": true,
          },
        })
      : await chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
        });
try {
  const page = await browser.newPage({
      viewport: { width: 1520, height: 1120 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/materials-test", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: `<html><head><style>body{margin:24px;background:#f9f5f0;color:#3b2b30;font:14px system-ui}h1{font:36px Georgia;margin:0 0 10px}h2{font:24px Georgia;margin:30px 0 12px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}figure{margin:0;background:#f0e8df}figure>canvas{display:block;width:100%;height:380px;object-fit:cover;object-position:center 28%}figure>.macro{height:110px;object-fit:fill}figcaption{padding:10px 12px;font-size:13px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px;max-width:850px}.pair canvas{width:100%;height:auto}.note{max-width:1000px;line-height:1.5;color:#7c6663}</style></head><body><h1>Light, pigment, texture.</h1><p class="note">Actual local render captures. Creative lighting is an image interpretation. Canvas uses geometric finish approximations; Shader studio uses per-pixel materials. No analysis or physical relighting claim.</p><h2>Light approximation · Canvas</h2><div class="grid" id="canvas"></div><h2>Shader studio · WebGL2</h2><div class="grid" id="webgl"></div><h2>Original and golden-hour gloss</h2><div class="pair" id="pair"></div><h2>Creative light studies</h2><div class="grid" id="lights"></div></body></html>`,
    }),
  );
  await page.goto(origin + "/materials-test");
  const result = await page.evaluate(async () => {
    const { BeautyRenderer } =
        await import("/packages/ar-renderer/src/index.ts"),
      { createVision } = await import("/packages/vision-core/src/index.ts"),
      { createDefaultLook, MAKEUP_LAYERS } =
        await import("/packages/makeup-engine/src/index.ts");
    const { FaceMaskAtlas } =
      await import("/packages/ar-renderer/src/masks.ts");
    const image = new Image();
    image.src = "/images/portrait-neutral.jpg";
    await image.decode();
    const engine = createVision();
    const snap = await engine.analyzeImage(image, { face: true });
    const points = snap.landmarks;
    const look = createDefaultLook();
    look.lipstick.color = "#AE4C8B";
    look.lipstick.opacity = 0.9;
    look.eyeshadow.color = "#956C8E";
    look.eyeshadow.opacity = 0.48;
    look.blush.opacity = 0.2;
    const bare = createDefaultLook();
    for (const name of MAKEUP_LAYERS) bare[name].enabled = false;
    const settings = (preset = "neutral", x = -0.55, y = -0.55) => ({
      preset,
      intensity: 0.85,
      direction: { x, y },
    });
    const result = {
      landmarks: points.length,
      backends: [],
      quality: [],
      checks: {},
      benchmarks: [],
      notes: [
        "Static portrait repeat timings with pixel-read flush; not camera FPS.",
        "Managed browser with software graphics where configured; hardware realism/performance not validated.",
      ],
    };
    const captures = new Map();
    const pixels = (c) =>
      c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const diff = (a, b, startX = 0, endX = Infinity, width = 1) => {
      let changed = 0,
        delta = 0;
      for (let i = 0; i < a.length; i += 4) {
        const x = (i / 4) % width;
        if (x < startX || x >= endX) continue;
        const d =
          Math.abs(a[i] - b[i]) +
          Math.abs(a[i + 1] - b[i + 1]) +
          Math.abs(a[i + 2] - b[i + 2]);
        delta += d;
        if (d > 6) changed++;
      }
      return { changed, delta };
    };
    const copy = (source) => {
      const c = document.createElement("canvas");
      c.width = source.width;
      c.height = source.height;
      c.getContext("2d").drawImage(source, 0, 0);
      return c;
    };
    const show = (source, label, target, macro = true) => {
      const figure = document.createElement("figure"),
        c = copy(source),
        caption = document.createElement("figcaption");
      caption.textContent = label;
      figure.append(c);
      if (macro) {
        const m = document.createElement("canvas");
        m.width = 460;
        m.height = 150;
        m.className = "macro";
        const left = points[61],
          right = points[291],
          top = points[0],
          bottom = points[17],
          sx = Math.max(0, left.x * source.width - 0.04 * source.width),
          sy = Math.max(0, top.y * source.height - 0.018 * source.height),
          sw = (right.x - left.x + 0.08) * source.width,
          sh = (bottom.y - top.y + 0.036) * source.height;
        m.getContext("2d").drawImage(
          source,
          sx,
          sy,
          sw,
          sh,
          0,
          0,
          m.width,
          m.height,
        );
        figure.append(m);
      }
      figure.append(caption);
      document.querySelector(target).append(figure);
    };
    for (const backend of ["canvas", "webgl"]) {
      const canvas = document.createElement("canvas"),
        renderer = new BeautyRenderer(canvas, {
          forceCanvas: backend === "canvas",
          forceWebGL: backend === "webgl",
          maxSide: 720,
        });
      const frame = {
        source: image,
        landmarks: points,
        look,
        lighting: settings(),
      };
      renderer.render({ ...frame, look: bare });
      const original = copy(canvas),
        originalPixels = pixels(original);
      if (backend === "webgl")
        show(original, "Original photograph", "#pair", false);
      const finishes = [];
      for (const finish of ["matte", "gloss", "shimmer", "glitter"]) {
        look.lipstick.finish = finish;
        look.eyeshadow.finish = finish;
        renderer.render(frame);
        const c = copy(canvas);
        captures.set(backend + finish, c);
        finishes.push({
          finish,
          pixelDifferenceFromOriginal: diff(
            originalPixels,
            pixels(c),
            0,
            Infinity,
            c.width,
          ).changed,
        });
        show(
          c,
          finish[0].toUpperCase() +
            finish.slice(1) +
            (backend === "webgl" ? " · actual GLSL" : " · geometric finish"),
          "#" + backend,
        );
      }
      const matte = pixels(captures.get(backend + "matte"));
      const a = new FaceMaskAtlas();
      a.update(
        points,
        image.naturalWidth,
        image.naturalHeight,
        new Set(
          MAKEUP_LAYERS.filter(
            (name) => look[name].enabled && look[name].opacity > 0,
          ),
        ),
      );
      const footprint = document.createElement("canvas");
      footprint.width = canvas.width;
      footprint.height = canvas.height;
      const fd = footprint.getContext("2d");
      fd.fillStyle = "black";
      fd.fillRect(0, 0, footprint.width, footprint.height);
      fd.globalCompositeOperation = "lighter";
      for (const atlas of a.atlases)
        fd.drawImage(atlas, 0, 0, footprint.width, footprint.height);
      const occupied = fd.getImageData(
        0,
        0,
        footprint.width,
        footprint.height,
      ).data;
      let outside = 0,
        outsideVisible = 0,
        outsideMaxDelta = 0;
      const outsideExamples = [];
      // A one-pixel footprint guard accommodates bilinear mask interpolation.
      for (let i = 0; i < matte.length; i += 4) {
        const x = (i / 4) % canvas.width,
          y = Math.floor(i / 4 / canvas.width);
        let inside = false;
        for (let oy = -1; oy <= 1 && !inside; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const px = x + ox,
              py = y + oy;
            if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height)
              continue;
            const p = (py * canvas.width + px) * 4;
            if (occupied[p] + occupied[p + 1] + occupied[p + 2] > 0) {
              inside = true;
              break;
            }
          }
        if (inside) continue;
        const delta =
          Math.abs(matte[i] - originalPixels[i]) +
          Math.abs(matte[i + 1] - originalPixels[i + 1]) +
          Math.abs(matte[i + 2] - originalPixels[i + 2]);
        if (delta) {
          outside++;
          outsideMaxDelta = Math.max(outsideMaxDelta, delta);
          if (delta > 6) outsideVisible++;
          if (outsideExamples.length < 10)
            outsideExamples.push({
              x,
              y,
              before: [
                originalPixels[i],
                originalPixels[i + 1],
                originalPixels[i + 2],
              ],
              after: [matte[i], matte[i + 1], matte[i + 2]],
            });
        }
      }
      result.checks[backend + "OutsideMaskPixelsChanged"] = outside;
      result[backend + "OutsideMaskFootprint"] = {
        guardPixels: 1,
        outsideAnyDifferencePixels: outside,
        outsideVisibleDifferencePixels: outsideVisible,
        maxRgbSumDelta: outsideMaxDelta,
        examples: outsideExamples,
      };
      result.checks[backend + "FinishDifferences"] = Object.fromEntries(
        ["gloss", "shimmer", "glitter"].map((f) => [
          f,
          diff(
            matte,
            pixels(captures.get(backend + f)),
            0,
            Infinity,
            canvas.width,
          ).changed,
        ]),
      );
      look.lipstick.finish = "glitter";
      look.eyeshadow.finish = "shimmer";
      renderer.render({ ...frame, time: 0 });
      const t0 = new Uint8ClampedArray(pixels(canvas));
      renderer.render({ ...frame, time: 98765 });
      result.checks[backend + "StableAcrossTime"] =
        diff(t0, pixels(canvas), 0, Infinity, canvas.width).changed === 0;
      look.lipstick.finish = "gloss";
      look.eyeshadow.finish = "shimmer";
      renderer.render({ ...frame, lighting: settings("neutral", -0.85, -0.4) });
      const left = new Uint8ClampedArray(pixels(canvas));
      renderer.render({ ...frame, lighting: settings("neutral", 0.85, -0.4) });
      result.checks[backend + "DirectionalFinishPixels"] = diff(
        left,
        pixels(canvas),
        0,
        Infinity,
        canvas.width,
      ).changed;
      renderer.render({
        ...frame,
        lighting: settings("golden-hour"),
        compare: 0.5,
      });
      result.checks[backend + "BeforeSidePixelsChanged"] = diff(
        originalPixels,
        pixels(canvas),
        0,
        canvas.width * 0.5,
        canvas.width,
      ).changed;
      renderer.render({ ...frame, lighting: settings("golden-hour") });
      if (backend === "webgl")
        show(
          canvas,
          "Golden-hour gloss · creative image light",
          "#pair",
          false,
        );
      const gradeResults = [];
      for (const preset of [
        "neutral",
        "daylight",
        "golden-hour",
        "moonlight",
      ]) {
        renderer.render({ ...frame, look: bare, lighting: settings(preset) });
        const d = diff(
          originalPixels,
          pixels(canvas),
          0,
          Infinity,
          canvas.width,
        );
        gradeResults.push({ preset, changed: d.changed });
        if (backend === "webgl")
          show(
            canvas,
            preset === "neutral" ? "Original light" : preset.replace("-", " "),
            "#lights",
            false,
          );
      }
      result.checks[backend + "Lighting"] = gradeResults;
      const cached = [],
        dynamic = [];
      for (let i = 0; i < 12; i++) {
        const start = performance.now();
        renderer.render(frame);
        canvas.getContext("2d").getImageData(0, 0, 1, 1);
        cached.push(performance.now() - start);
      }
      for (let i = 0; i < 6; i++) {
        const p = points.map((q) => ({ ...q, x: q.x + Math.sin(i) * 0.00005 })),
          start = performance.now();
        renderer.render({ ...frame, landmarks: p });
        canvas.getContext("2d").getImageData(0, 0, 1, 1);
        dynamic.push(performance.now() - start);
      }
      cached.sort((a, b) => a - b);
      dynamic.sort((a, b) => a - b);
      const mutable = copy(original),
        mutableTimes = [];
      for (let i = 0; i < 6; i++) {
        mutable
          .getContext("2d")
          .drawImage(image, 0, 0, mutable.width, mutable.height);
        const start = performance.now();
        renderer.render({
          ...frame,
          source: mutable,
          lighting: settings("golden-hour"),
        });
        canvas.getContext("2d").getImageData(0, 0, 1, 1);
        mutableTimes.push(performance.now() - start);
      }
      mutableTimes.sort((a, b) => a - b);
      result.benchmarks.push({
        mutableSourceGoldenMedianMs: mutableTimes[3],
        mutableSourceGoldenP90Ms: mutableTimes[5],
        backend,
        resolution: [canvas.width, canvas.height],
        cachedMedianMs: cached[6],
        cachedP90Ms: cached[10],
        newGeometryMedianMs: dynamic[3],
        newGeometryP90Ms: dynamic[5],
      });
      result.backends.push({
        requested: backend,
        actual: renderer.activeMode,
        gpu: renderer.gpuRenderer,
        fallbackReason: renderer.fallbackReason,
        resolution: renderer.renderResolution,
        finishes,
      });
      const swatch = document.createElement("canvas");
      swatch.width = 32;
      swatch.height = 32;
      const brush = swatch.getContext("2d"),
        fixture = new Image();
      brush.fillStyle = "#cc2211";
      brush.fillRect(0, 0, 32, 32);
      fixture.src = swatch.toDataURL();
      await fixture.decode();
      renderer.render({
        source: fixture,
        look: bare,
        lighting: settings("golden-hour"),
      });
      const red = Array.from(pixels(canvas).slice(0, 3));
      brush.fillStyle = "#1122cc";
      brush.fillRect(0, 0, 32, 32);
      fixture.src = swatch.toDataURL();
      await fixture.decode();
      renderer.render({
        source: fixture,
        look: bare,
        lighting: settings("golden-hour"),
      });
      const blue = Array.from(pixels(canvas).slice(0, 3));
      result.checks[backend + "ImageCacheInvalidated"] =
        red[0] > red[2] && blue[2] > blue[0];
      renderer.render({
        source: fixture,
        look: bare,
        lighting: settings("neutral"),
      });
      result.checks[backend + "NeutralCacheCleared"] =
        renderer.gradedSource === null;
      renderer.dispose();
    }
    const sampleLip = (canvas) => {
      const d = pixels(canvas),
        cx = (points[61].x + points[291].x) / 2,
        cy = (points[14].y + points[17].y) / 2,
        rx = (points[291].x - points[61].x) * 0.16,
        ry = (points[17].y - points[14].y) * 0.16;
      const sums = [0, 0, 0];
      let count = 0;
      for (
        let y = Math.floor((cy - ry) * canvas.height);
        y <= Math.ceil((cy + ry) * canvas.height);
        y++
      )
        for (
          let x = Math.floor((cx - rx) * canvas.width);
          x <= Math.ceil((cx + rx) * canvas.width);
          x++
        ) {
          const i = (y * canvas.width + x) * 4;
          for (let c = 0; c < 3; c++) sums[c] += d[i + c];
          count++;
        }
      return sums.map((n) => n / count);
    };
    const canvasRgb = sampleLip(captures.get("canvasmatte")),
      shaderRgb = sampleLip(captures.get("webglmatte"));
    result.pigmentParity = {
      hex: "#AE4C8B",
      opacity: 0.9,
      finish: "matte",
      canvasRgb,
      shaderRgb,
    };
    result.checks.pigmentRgbMaxDelta = Math.max(
      ...canvasRgb.map((n, i) => Math.abs(n - shaderRgb[i])),
    );
    const target = document.createElement("canvas"),
      adaptive = new BeautyRenderer(target, { maxSide: 960 });
    adaptive.render({ source: image, landmarks: points, look });
    result.quality.push({
      quality: "adaptive",
      backend: adaptive.activeMode,
      resolution: adaptive.renderResolution,
    });
    adaptive.setQuality("high");
    adaptive.render({ source: image, landmarks: points, look });
    const highTimings = [];
    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      adaptive.render({
        source: image,
        landmarks: points,
        look,
        lighting: settings("golden-hour"),
      });
      target.getContext("2d").getImageData(0, 0, 1, 1);
      highTimings.push(performance.now() - start);
    }
    highTimings.sort((a, b) => a - b);
    result.quality.push({
      quality: "high",
      backend: adaptive.activeMode,
      resolution: adaptive.renderResolution,
      cachedMedianMs: highTimings[5],
      cachedP90Ms: highTimings[8],
    });
    adaptive.setQuality("adaptive");
    adaptive.render({ source: image, landmarks: points, look });
    result.quality.push({
      quality: "adaptive-restored",
      backend: adaptive.activeMode,
      resolution: adaptive.renderResolution,
    });
    adaptive.dispose();
    engine.dispose();
    return result;
  });
  const report = {
    ...result,
    runtime: {
      engine: kind,
      version: await browser.version(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      viewport: page.viewportSize(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
      loadAverage: loadavg(),
    },
  };
  await page.screenshot({
    path: out + "/materials-and-lights.png",
    fullPage: true,
  });
  await page.locator("#pair").screenshot({ path: out + "/before-after.png" });
  await page
    .locator("#canvas")
    .screenshot({ path: out + "/canvas-finishes.png" });
  await page
    .locator("#webgl")
    .screenshot({ path: out + "/shader-finishes.png" });
  await page
    .locator("#lights")
    .screenshot({ path: out + "/lighting-presets.png" });
  await writeFile(
    out + "/report.json",
    JSON.stringify({ ...report, errors }, null, 2),
  );
  console.log(JSON.stringify({ ...report, errors }, null, 2));
  if (
    report.landmarks < 468 ||
    errors.length ||
    report.backends.find((b) => b.requested === "webgl").actual !== "webgl2" ||
    report.quality.find((q) => q.quality === "high").backend !== "webgl2" ||
    Object.entries(report.checks).some(([k, v]) =>
      k === "pigmentRgbMaxDelta"
        ? v > 5
        : k.endsWith("FinishDifferences")
          ? Object.values(v).some((n) => n < 25)
          : k.endsWith("StableAcrossTime") ||
              k.endsWith("CacheInvalidated") ||
              k.endsWith("CacheCleared")
            ? !v
            : k.endsWith("DirectionalFinishPixels")
              ? v < 25
              : k.endsWith("BeforeSidePixelsChanged") ||
                  k.endsWith("OutsideMaskPixelsChanged")
                ? v !== 0
                : k.endsWith("Lighting")
                  ? v.some((p) =>
                      p.preset === "neutral"
                        ? p.changed !== 0
                        : p.changed < 100,
                    )
                  : false,
    )
  )
    process.exitCode = 1;
} finally {
  await browser.close();
}
