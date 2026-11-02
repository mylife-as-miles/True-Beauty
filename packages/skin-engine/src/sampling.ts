// K-means/segmentation adaptation of Skyn/backend/models/skin_tone/skin_detection.py.
// Copyright (c) 2025 RANDON, MIT. See LICENSE.SKYN. Original SHA f4e1ffe5c1e6542cea8e18e5b50a54717f4b41d1.
// Improvement: use landmark-defined skin ROIs, not complexion-excluding fixed YCrCb thresholds.
import { rgbToHex, type RGB } from "./color";
import type { PixelImage } from "./quality";
export interface SampleLandmark {
  x: number;
  y: number;
}
export interface AppearanceSample {
  skin?: string;
  eye?: string;
  hair?: string;
  confidence: number;
  source: "local-pixel-sample";
  notes: string[];
}

/** Deterministic bounded k-means replacing Python/scikit-learn dependency. */
export function clusterColors(
  pixels: RGB[],
  k = 3,
  iterations = 12,
): { color: RGB; count: number }[] {
  if (!pixels.length) return [];
  k = Math.max(1, Math.min(k, pixels.length));
  const ordered = [...pixels].sort((a, b) => a.r + a.g + a.b - b.r - b.g - b.b);
  let centers = Array.from({ length: k }, (_, i) => ({
    ...ordered[
      Math.min(ordered.length - 1, Math.floor(((i + 0.5) * ordered.length) / k))
    ],
  }));
  let counts = new Array<number>(k).fill(0);
  for (let iteration = 0; iteration < iterations; iteration++) {
    const totals = Array.from({ length: k }, () => ({
      r: 0,
      g: 0,
      b: 0,
      count: 0,
    }));
    for (const p of pixels) {
      let best = 0,
        distance = Infinity;
      centers.forEach((c, i) => {
        const d = (p.r - c.r) ** 2 + (p.g - c.g) ** 2 + (p.b - c.b) ** 2;
        if (d < distance) {
          distance = d;
          best = i;
        }
      });
      const t = totals[best];
      t.r += p.r;
      t.g += p.g;
      t.b += p.b;
      t.count++;
    }
    counts = totals.map((t) => t.count);
    centers = centers.map((c, i) =>
      totals[i].count
        ? {
            r: totals[i].r / totals[i].count,
            g: totals[i].g / totals[i].count,
            b: totals[i].b / totals[i].count,
          }
        : c,
    );
  }
  return centers
    .map((color, i) => ({ color, count: counts[i] }))
    .sort((a, b) => b.count - a.count);
}
function disc(image: PixelImage, x: number, y: number, radius: number): RGB[] {
  const values: RGB[] = [];
  const { width: w, height: h, data } = image;
  for (
    let py = Math.max(0, Math.floor(y - radius));
    py <= Math.min(h - 1, Math.ceil(y + radius));
    py += 2
  )
    for (
      let px = Math.max(0, Math.floor(x - radius));
      px <= Math.min(w - 1, Math.ceil(x + radius));
      px += 2
    ) {
      if ((px - x) ** 2 + (py - y) ** 2 > radius ** 2) continue;
      const i = (py * w + px) * 4;
      if (data[i + 3] < 200) continue;
      const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      if (l < 5 || l > 250) continue;
      values.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  return values;
}
export function sampleAppearance(
  image: PixelImage,
  landmarks: SampleLandmark[],
  hairMask?: { data: ArrayLike<number>; width: number; height: number },
): AppearanceSample {
  const result: AppearanceSample = {
    confidence: 0,
    source: "local-pixel-sample",
    notes: [],
  };
  if (landmarks.length < 468) {
    result.notes.push(
      "A detected face is needed for reliable region sampling.",
    );
    return result;
  }
  const w = image.width,
    h = image.height;
  const faceWidth = Math.abs(landmarks[454].x - landmarks[234].x) * w;
  const radius = Math.max(2, faceWidth * 0.035);
  const pixels = [50, 101, 205, 280, 330, 425, 151].flatMap((i) =>
    disc(image, landmarks[i].x * w, landmarks[i].y * h, radius),
  );
  const dominant = clusterColors(pixels)[0];
  if (dominant) {
    result.skin = rgbToHex(dominant.color);
    result.confidence = Math.min(
      0.65,
      (dominant.count / Math.max(1, pixels.length)) * 0.6 + 0.15,
    );
  }
  if (landmarks.length >= 478) {
    const irisPixels: RGB[] = [];
    for (const [center, ring] of [
      [468, [469, 470, 471, 472]],
      [473, [474, 475, 476, 477]],
    ] as const)
      for (const index of ring) {
        const a = landmarks[center],
          b = landmarks[index];
        irisPixels.push(
          ...disc(
            image,
            (a.x + (b.x - a.x) * 0.6) * w,
            (a.y + (b.y - a.y) * 0.6) * h,
            Math.max(1, radius * 0.14),
          ),
        );
      }
    const eye = clusterColors(irisPixels, 2)[0];
    if (eye) result.eye = rgbToHex(eye.color);
  }
  if (hairMask) {
    const hp: RGB[] = [];
    for (let y = 0; y < h; y += 4)
      for (let x = 0; x < w; x += 4) {
        const mask =
          hairMask.data[
            Math.min(
              hairMask.height - 1,
              Math.floor((y / h) * hairMask.height),
            ) *
              hairMask.width +
              Math.min(hairMask.width - 1, Math.floor((x / w) * hairMask.width))
          ];
        if (mask < 0.8) continue;
        const i = (y * w + x) * 4;
        hp.push({
          r: image.data[i],
          g: image.data[i + 1],
          b: image.data[i + 2],
        });
      }
    const hair = clusterColors(hp, 3)[0];
    if (hair) result.hair = rgbToHex(hair.color);
  }
  result.notes.push(
    "Colour describes these photo pixels; lighting, camera processing and makeup affect it. You can correct each swatch.",
  );
  if (!result.hair)
    result.notes.push(
      "Hair colour was not sampled without a confident hair mask.",
    );
  return result;
}
