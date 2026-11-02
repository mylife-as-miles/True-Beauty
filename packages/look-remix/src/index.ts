/** Original local appearance extraction. No image upload, retention, identity or product recognition. */
import { REGIONS } from "../../face-tracking/src";
import {
  MAKEUP_LAYERS,
  createDefaultLook,
  cloneLook,
} from "../../makeup-engine/src";
import { clusterColors } from "../../skin-engine/src/sampling";
import {
  rgbToHex,
  rgbToLab,
  hexToRgb,
  type RGB,
} from "../../skin-engine/src/color";
import {
  assessImageQuality,
  type PixelImage,
} from "../../skin-engine/src/quality";
import type { VisionSnapshot } from "../../vision-core/src";
import type {
  InspirationOptions,
  RegionCorrection,
  RegionSample,
  RemixBounds,
  RemixRegion,
  RemixResult,
} from "./types";
export type * from "./types";

type Point = { x: number; y: number };
type Shape = Point[];
const REGION_NAMES: RemixRegion[] = [
  "lipstick",
  "eyeshadow",
  "blush",
  "skin",
  "hair",
];
const labels: Record<RemixRegion, string> = {
  lipstick: "Lips",
  eyeshadow: "Eyelids",
  blush: "Cheeks",
  skin: "Skin reference",
  hair: "Hair",
};
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const inside = (p: Point, polygon: readonly Point[]) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
};
function hull(points: readonly Point[]): Shape {
  const ordered = [...points]
    .filter((p) => Number.isFinite(p.x + p.y))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: Point[] = [],
    upper: Point[] = [];
  for (const p of ordered) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    )
      lower.pop();
    lower.push(p);
  }
  for (const p of [...ordered].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    )
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function bounds(points: readonly Point[]): RemixBounds {
  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = clamp(Math.min(...points.map((p) => p.x))),
    y = clamp(Math.min(...points.map((p) => p.y)));
  return {
    x,
    y,
    width: clamp(Math.max(...points.map((p) => p.x))) - x,
    height: clamp(Math.max(...points.map((p) => p.y))) - y,
  };
}
const rectangle = (b: RemixBounds): Shape => [
  { x: b.x, y: b.y },
  { x: b.x + b.width, y: b.y },
  { x: b.x + b.width, y: b.y + b.height },
  { x: b.x, y: b.y + b.height },
];
function ellipse(p: Point, rx: number, ry: number): Shape {
  return Array.from({ length: 24 }, (_, i) => ({
    x: p.x + rx * Math.cos((i * Math.PI) / 12),
    y: p.y + ry * Math.sin((i * Math.PI) / 12),
  }));
}
const luma = (c: RGB) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
function delta(a: string, b: string): number {
  const x = rgbToLab(hexToRgb(a)),
    y = rgbToLab(hexToRgb(b));
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b);
}
const unavailable = (region: RemixRegion, warning: string): RegionSample => ({
  region,
  label: labels[region],
  color: null,
  measuredColor: null,
  confidence: 0,
  source: "unavailable",
  bounds: [],
  pixelCount: 0,
  excludedFraction: 0,
  warnings: [warning],
  finish: "matte",
  finishConfidence: 0,
  enabled: false,
  opacity: 0,
});

/** Pure pixel/geometry entry point. Fixtures may inject geometry; production uses actual Vision Core output. */
export function extractInspirationPixels(
  image: PixelImage,
  snapshot: VisionSnapshot | undefined,
  sourceName = "Inspiration image",
): RemixResult {
  const { width: w, height: h, data } = image;
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 8 ||
    h < 8 ||
    w * h > 16_000_000 ||
    data.length !== w * h * 4
  )
    throw new Error("Invalid or oversized image pixel buffer.");
  const points = snapshot?.landmarks ?? [];
  const faceDetected =
    points.length >= 468 &&
    points
      .slice(0, 468)
      .every(
        (p) =>
          Number.isFinite(p.x + p.y) &&
          p.x >= 0 &&
          p.x <= 1 &&
          p.y >= 0 &&
          p.y <= 1,
      ) &&
    Math.abs(points[454].x - points[234].x) > 0.08 &&
    Math.abs(points[152].y - points[10].y) > 0.1;
  const warnings: string[] = [],
    qualityWarnings: string[] = [];
  let lum = 0,
    clipped = 0,
    count = 0;
  for (
    let i = 0;
    i < data.length;
    i += Math.max(4, Math.floor((w * h) / 12000) * 4)
  ) {
    if (data[i + 3] < 200) continue;
    const value = luma({ r: data[i], g: data[i + 1], b: data[i + 2] });
    lum += value;
    clipped += Number(value < 5 || value > 250);
    count++;
  }
  const meanLuminance = lum / Math.max(1, count),
    clippedFraction = clipped / Math.max(1, count);
  if (meanLuminance < 35)
    qualityWarnings.push(
      "The image is very dark; sampled shades may be unreliable.",
    );
  if (meanLuminance > 230 || clippedFraction > 0.25)
    qualityWarnings.push(
      "Clipped or bright lighting can hide pigment and surface detail.",
    );
  if (Math.min(w, h) < 320)
    qualityWarnings.push(
      "Small reference image: fine details and material guesses are limited.",
    );
  const sharpness = assessImageQuality(image).sharpness;
  if (sharpness < 12)
    qualityWarnings.push(
      "Fine detail is low; blur or flat lighting can hide makeup edges and highlights.",
    );
  const handHulls = (snapshot?.hands ?? [])
    .filter((hand) => hand.confidence >= 0.5)
    .map((hand) => hull(hand.landmarks));
  const face = faceDetected ? REGIONS.faceOval.map((i) => points[i]) : [];
  const hairMask = snapshot?.hairMask;
  const confidentHairPixels = hairMask
    ? Array.from(hairMask.confidence ?? hairMask.data).filter(
        (value) => value >= 0.85,
      ).length
    : 0;
  const hairCoverage = hairMask
    ? confidentHairPixels / Math.max(1, hairMask.width * hairMask.height)
    : 0;
  const usableHairMask = Boolean(
    hairMask &&
    hairMask.width > 0 &&
    hairMask.height > 0 &&
    (hairMask.confidence ?? hairMask.data).length ===
      hairMask.width * hairMask.height &&
    hairCoverage >= 0.002 &&
    hairCoverage <= 0.72,
  );
  const maskValue = (p: Point) => {
    if (!hairMask || !usableHairMask) return 0;
    const mx = Math.min(
        hairMask.width - 1,
        Math.max(0, Math.floor(p.x * hairMask.width)),
      ),
      my = Math.min(
        hairMask.height - 1,
        Math.max(0, Math.floor(p.y * hairMask.height)),
      );
    const value = (hairMask.confidence ?? hairMask.data)[
      my * hairMask.width + mx
    ];
    return Number.isFinite(value) ? value : 0;
  };
  let geometryFactor = 1;
  if (faceDetected) {
    const eyeLeft = points[33],
      eyeRight = points[263],
      nose = points[1];
    const left = Math.abs(nose.x - eyeLeft.x),
      right = Math.abs(eyeRight.x - nose.x);
    if (Math.max(left, right) / Math.max(0.001, Math.min(left, right)) > 3) {
      warnings.push("Turned face: regional samples have reduced reliability.");
      geometryFactor = 0.55;
    }
    if (Math.abs(points[454].x - points[234].x) * w < 100) {
      warnings.push(
        "The face is small; use a closer portrait for more reliable regions.",
      );
      geometryFactor *= 0.65;
    }
  } else
    warnings.push(
      "No usable face geometry. Facial colours are unavailable; the palette describes the whole image only.",
    );
  if (snapshot?.status.face.state === "error")
    warnings.push(
      "Face tracking is unavailable. No facial colours were inferred.",
    );
  if (!hairMask || !usableHairMask)
    warnings.push(
      "No confident hair segmentation was available; hair colour is not inferred from the background.",
    );
  if (handHulls.length)
    warnings.push(
      "Detected hand areas are excluded geometrically; other occlusions may remain.",
    );
  const eyePolygons = faceDetected
    ? [
        REGIONS.leftEye.map((i) => points[i]),
        REGIONS.rightEye.map((i) => points[i]),
      ]
    : [];
  const mouth = faceDetected ? REGIONS.innerLip.map((i) => points[i]) : [];
  const lip = faceDetected ? REGIONS.outerLip.map((i) => points[i]) : [];
  const faceWidth = faceDetected ? Math.abs(points[454].x - points[234].x) : 0;
  const eyeDistance = faceDetected ? Math.abs(points[263].x - points[33].x) : 0;
  const regions = Object.fromEntries(
    REGION_NAMES.map((key) => [
      key,
      unavailable(key, "A clear detected face is needed for this region."),
    ]),
  ) as Record<RemixRegion, RegionSample>;
  function collect(
    shapes: Shape[],
    region: RemixRegion | "palette",
    extra?: (p: Point) => boolean,
  ) {
    const pixels: RGB[] = [];
    let eligible = 0,
      excluded = 0;
    const b = bounds(shapes.flat());
    const step = Math.max(
      1,
      Math.ceil(Math.sqrt(Math.max(1, b.width * w * b.height * h) / 5000)),
    );
    for (
      let y = Math.max(0, Math.floor(b.y * h));
      y < Math.min(h, Math.ceil((b.y + b.height) * h));
      y += step
    )
      for (
        let x = Math.max(0, Math.floor(b.x * w));
        x < Math.min(w, Math.ceil((b.x + b.width) * w));
        x += step
      ) {
        const p = { x: (x + 0.5) / w, y: (y + 0.5) / h };
        if (!shapes.some((shape) => inside(p, shape))) continue;
        if (region === "hair" && maskValue(p) < 0.85) continue;
        eligible++;
        const index = (y * w + x) * 4,
          color = { r: data[index], g: data[index + 1], b: data[index + 2] },
          value = luma(color);
        const rejected =
          data[index + 3] < 200 ||
          value > 250 ||
          (region !== "hair" && value < 5) ||
          handHulls.some((shape) => inside(p, shape)) ||
          (extra && !extra(p));
        if (rejected) {
          excluded++;
          continue;
        }
        pixels.push(color);
      }
    return {
      pixels,
      excludedFraction: excluded / Math.max(1, eligible),
      bounds: shapes.map((shape) => bounds(shape)),
    };
  }
  function measure(
    region: RemixRegion,
    shapes: Shape[],
    extra?: (p: Point) => boolean,
  ) {
    const samples = collect(shapes, region, extra),
      group = clusterColors(samples.pixels, 3, 8)[0];
    if (
      !group ||
      samples.pixels.length < 10 ||
      samples.excludedFraction > 0.7
    ) {
      regions[region] = {
        ...unavailable(
          region,
          "Too few unobscured pixels in this region. Correct the swatch manually or choose another image.",
        ),
        bounds: samples.bounds,
        pixelCount: samples.pixels.length,
        excludedFraction: samples.excludedFraction,
      };
      return;
    }
    const color = rgbToHex(group.color),
      dominance = group.count / samples.pixels.length;
    regions[region] = {
      region,
      label: labels[region],
      color,
      measuredColor: color,
      source: "region-pixels",
      bounds: samples.bounds,
      pixelCount: samples.pixels.length,
      excludedFraction: samples.excludedFraction,
      confidence: clamp(
        (0.38 + 0.3 * dominance) *
          geometryFactor *
          (qualityWarnings.length ? 0.7 : 1) *
          (1 - samples.excludedFraction * 0.5),
        0,
        0.72,
      ),
      warnings: [],
      finish: "matte",
      finishConfidence: 0,
      enabled: region !== "skin",
      opacity: region === "lipstick" ? 0.6 : region === "hair" ? 0.4 : 0.25,
    };
    if (regions[region].confidence < 0.35) {
      regions[region].enabled = false;
      regions[region].warnings.push(
        "Sample quality is low. The layer starts off; review or correct the shade before applying.",
      );
    }
    if (samples.excludedFraction > 0.3)
      regions[region].warnings.push(
        "Part of this region was clipped, covered or outside the sampling mask.",
      );
    if (region === "lipstick") {
      const values = samples.pixels.map(luma).sort((a, b) => a - b),
        median = values[Math.floor(values.length * 0.5)],
        bright = values.filter((v) => v > median + 35).length / values.length;
      if (bright > 0.03 && bright < 0.3) {
        regions[region].finish = "gloss";
        regions[region].finishConfidence = 0.3;
        regions[region].warnings.push(
          "Gloss is a low-confidence highlight heuristic; lighting can create the same pattern.",
        );
      }
    }
  }
  if (faceDetected) {
    measure(
      "lipstick",
      [lip],
      (p) => inside(p, face) && !inside(p, mouth) && maskValue(p) < 0.75,
    );
    const shadows = [
      [REGIONS.leftEye, REGIONS.leftBrow],
      [REGIONS.rightEye, REGIONS.rightBrow],
    ].map(([eye, brow]) => {
      const upper = eye.slice(0, 9).map((i) => points[i]);
      const browY = brow.reduce((sum, i) => sum + points[i].y, 0) / brow.length;
      const lifted = upper.map((p) => ({
        x: p.x,
        y: p.y + (browY - p.y) * 0.58,
      }));
      return [...upper, ...lifted.reverse()];
    });
    measure(
      "eyeshadow",
      shadows,
      (p) =>
        inside(p, face) &&
        !eyePolygons.some((shape) => inside(p, shape)) &&
        maskValue(p) < 0.75,
    );
    measure(
      "blush",
      [50, 280].map((i) =>
        ellipse(points[i], eyeDistance * 0.21, (eyeDistance * 0.12 * w) / h),
      ),
      (p) => inside(p, face) && maskValue(p) < 0.75,
    );
    measure(
      "skin",
      [151, 4, 101, 330].map((i) =>
        ellipse(points[i], faceWidth * 0.035, (faceWidth * 0.035 * w) / h),
      ),
      (p) =>
        inside(p, face) &&
        !inside(p, lip) &&
        !eyePolygons.some((shape) => inside(p, shape)) &&
        maskValue(p) < 0.5,
    );
  }
  if (hairMask && usableHairMask && faceDetected) {
    measure(
      "hair",
      [rectangle({ x: 0, y: 0, width: 1, height: 1 })],
      (p) => maskValue(p) >= 0.85 && (!faceDetected || !inside(p, face)),
    );
    if (regions.hair.source === "region-pixels")
      regions.hair.warnings.push(
        "Segmented hair pixels; lighting and highlights affect the shade. Preview does not change hair shape.",
      );
  } else
    regions.hair = unavailable(
      "hair",
      !faceDetected
        ? "Hair segmentation alone can confuse surroundings. A usable face anchor is required; this image remains palette-only."
        : "Hair colour requires a confident segmentation mask.",
    );
  for (const region of ["eyeshadow", "blush"] as const) {
    const sample = regions[region],
      skin = regions.skin;
    if (
      sample.color &&
      skin.color &&
      delta(sample.color, skin.color) < (region === "blush" ? 6 : 9)
    ) {
      sample.enabled = false;
      sample.warnings.push(
        "Little separation from the skin reference. Layer starts off: this does not establish whether makeup is present.",
      );
    }
  }
  const paletteBounds: RemixBounds = faceDetected
    ? {
        x: clamp(points[234].x - faceWidth * 0.45),
        y: clamp(points[152].y + faceWidth * 0.08),
        width: 0,
        height: 0,
      }
    : { x: 0, y: 0, width: 1, height: 1 };
  if (faceDetected) {
    paletteBounds.width =
      clamp(points[454].x + faceWidth * 0.45) - paletteBounds.x;
    paletteBounds.height = 1 - paletteBounds.y;
  }
  const palettePixels = collect(
    [rectangle(paletteBounds)],
    "palette",
    (p) => !faceDetected || (!inside(p, face) && maskValue(p) < 0.6),
  ).pixels;
  const palette = clusterColors(palettePixels, 4, 10)
    .filter((g) => g.count > 0)
    .map((g) => ({
      color: rgbToHex(g.color),
      fraction: g.count / Math.max(1, palettePixels.length),
    }));
  const look = createDefaultLook();
  for (const key of MAKEUP_LAYERS) look[key].enabled = false;
  for (const key of ["lipstick", "eyeshadow", "blush"] as const) {
    const sample = regions[key];
    if (sample.color)
      look[key] = {
        enabled: sample.enabled,
        color: sample.color,
        opacity: sample.opacity,
        finish: sample.finish,
      };
  }
  if (regions.hair.color)
    look.hair = {
      ...look.hair,
      enabled: regions.hair.enabled,
      color: regions.hair.color,
      secondaryColor: regions.hair.color,
      opacity: regions.hair.opacity,
    };
  warnings.push(
    "Pixel colours include lighting, natural features and any makeup. This is an editable interpretation, not product identification or a validated material classifier.",
    "The outfit palette is a spatial crop, not garment segmentation or a clothing try-on.",
  );
  return {
    version: "local-remix-1",
    source: {
      name: sourceName.slice(0, 180),
      width: w,
      height: h,
      analyzedAt: new Date().toISOString(),
    },
    method: "local-landmark-pixel-heuristic",
    faceDetected,
    regions,
    palette,
    paletteBounds,
    paletteScope: faceDetected ? "lower-image-possible-outfit" : "whole-image",
    quality: {
      meanLuminance,
      clippedFraction,
      sharpness,
      warnings: qualityWarnings,
    },
    warnings,
    look,
  };
}

/** Corrections preserve the original measurement and attribution; no raw image enters the result. */
export function correctRemixRegion(
  result: RemixResult,
  region: RemixRegion,
  patch: RegionCorrection,
): RemixResult {
  if (patch.color !== undefined && !/^#[\da-f]{6}$/i.test(patch.color))
    throw new Error("Use a six-digit hex colour.");
  if (
    patch.opacity !== undefined &&
    (!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1)
  )
    throw new Error("Opacity must be between zero and one.");
  if (
    patch.finish !== undefined &&
    !["matte", "gloss", "shimmer", "glitter"].includes(patch.finish)
  )
    throw new Error("Unsupported cosmetic finish.");
  const next = {
      ...result,
      look: cloneLook(result.look),
      regions: { ...result.regions },
    },
    old = result.regions[region];
  const sample = {
    ...old,
    ...patch,
    source: "user-correction" as const,
    warnings: [...old.warnings],
  };
  if (patch.color !== undefined) {
    sample.confidence = 1;
    sample.finishConfidence = patch.finish ? 1 : sample.finishConfidence;
  }
  if (patch.finish !== undefined) sample.finishConfidence = 1;
  next.regions[region] = sample;
  if (region === "skin") return next; // skin reference is never silently converted into foundation.
  if (region === "hair") {
    if (sample.color)
      next.look.hair = {
        ...next.look.hair,
        color: sample.color,
        secondaryColor: sample.color,
        enabled: sample.enabled,
        opacity: sample.opacity,
      };
  } else if (sample.color)
    next.look[region] = {
      ...next.look[region],
      color: sample.color,
      enabled: sample.enabled,
      opacity: sample.opacity,
      finish: sample.finish,
    };
  return next;
}

/** Local decoding and one coordinated source-image analysis. Caller retains ownership of its image/URL. */
export async function analyzeInspiration(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  options: InspirationOptions = {},
): Promise<RemixResult> {
  const abort = () => {
    if (options.signal?.aborted)
      throw new DOMException("Analysis cancelled", "AbortError");
  };
  abort();
  if (
    options.maxSide !== undefined &&
    (!Number.isInteger(options.maxSide) ||
      options.maxSide < 128 ||
      options.maxSide > 2048)
  )
    throw new Error(
      "Analysis resolution must be an integer between 128 and 2048 pixels.",
    );
  const width = "naturalWidth" in source ? source.naturalWidth : source.width,
    height = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (!width || !height || width * height > 80_000_000)
    throw new Error("Choose a supported image under 80 megapixels.");
  const canvas = document.createElement("canvas"),
    scale = Math.min(1, (options.maxSide ?? 1024) / Math.max(width, height));
  canvas.width = Math.max(8, Math.round(width * scale));
  canvas.height = Math.max(8, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context)
    throw new Error("Image pixel reading is unavailable in this browser.");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  let snapshot = options.snapshot,
    modelWarning: string | undefined;
  if (!snapshot) {
    const { createVision } = await import("../../vision-core/src");
    const engine = createVision({ inferenceMaxSide: 640, hairMaxSide: 256 });
    try {
      snapshot = await engine.analyzeImage(canvas, {
        face: true,
        hair: true,
        hands: true,
      });
    } catch (error) {
      modelWarning =
        error instanceof Error
          ? error.message
          : "Local vision models could not run.";
    } finally {
      engine.dispose();
    }
  }
  abort();
  const result = extractInspirationPixels(
    context.getImageData(0, 0, canvas.width, canvas.height),
    snapshot,
    options.sourceName,
  );
  if (modelWarning)
    result.warnings.unshift(
      `Local tracking unavailable: ${modelWarning}. Palette-only interpretation.`,
    );
  return result;
}
