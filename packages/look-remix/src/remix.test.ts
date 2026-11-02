import { describe, expect, it } from "vitest";
import { extractInspirationPixels, correctRemixRegion } from ".";
import { REGIONS, type Landmark } from "../../face-tracking/src";
import type { VisionSnapshot } from "../../vision-core/src";
import type { PixelImage } from "../../skin-engine/src/quality";

/** Synthetic geometry/pixels test masks; these are not model-accuracy or population evidence. */
function fixture() {
  const width = 400,
    height = 500,
    data = new Uint8ClampedArray(width * height * 4);
  const points: Landmark[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.45,
    z: 0,
  }));
  const ring = (
    ids: readonly number[],
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ) =>
    ids.forEach((id, i) => {
      points[id] = {
        x: cx + rx * Math.cos((i / ids.length) * Math.PI * 2),
        y: cy + ry * Math.sin((i / ids.length) * Math.PI * 2),
        z: 0,
      };
    });
  ring(REGIONS.faceOval, 0.5, 0.46, 0.25, 0.34);
  points[234] = { x: 0.25, y: 0.46, z: 0 };
  points[454] = { x: 0.75, y: 0.46, z: 0 };
  points[10] = { x: 0.5, y: 0.12, z: 0 };
  points[152] = { x: 0.5, y: 0.8, z: 0 };
  for (const [eye, brow, cx] of [
    [REGIONS.leftEye, REGIONS.leftBrow, 0.37],
    [REGIONS.rightEye, REGIONS.rightBrow, 0.63],
  ] as const) {
    eye.slice(0, 9).forEach((id, i) => {
      points[id] = {
        x: cx - 0.07 + (i * 0.14) / 8,
        y: 0.39 - Math.sin((i / 8) * Math.PI) * 0.015,
        z: 0,
      };
    });
    eye.slice(9).forEach((id, i, all) => {
      points[id] = {
        x: cx + 0.07 - (i * 0.14) / (all.length - 1),
        y: 0.4 + Math.sin((i / (all.length - 1)) * Math.PI) * 0.015,
        z: 0,
      };
    });
    brow.forEach((id, i) => {
      points[id] = {
        x: cx - 0.07 + (i * 0.14) / (brow.length - 1),
        y: 0.31,
        z: 0,
      };
    });
  }
  ring(REGIONS.outerLip, 0.5, 0.65, 0.105, 0.045);
  ring(REGIONS.innerLip, 0.5, 0.65, 0.074, 0.018);
  for (const [id, x, y] of [
    [1, 0.5, 0.5],
    [4, 0.5, 0.46],
    [151, 0.5, 0.25],
    [50, 0.34, 0.53],
    [280, 0.66, 0.53],
    [101, 0.42, 0.47],
    [330, 0.58, 0.47],
  ])
    points[id] = { x, y, z: 0 };
  const mask = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const nx = x / width,
        ny = y / height;
      let color = [15, 80, 230]; // Deliberately dominant BLUE background.
      if (((nx - 0.5) / 0.25) ** 2 + ((ny - 0.46) / 0.34) ** 2 < 1)
        color = [188, 132, 99];
      if (ny > 0.83 && nx > 0.1 && nx < 0.9) color = [70, 120, 75];
      if (ny < 0.16 && nx > 0.24 && nx < 0.76) {
        color = [55, 31, 21];
        mask[y * width + x] = 0.99;
      }
      if (((nx - 0.5) / 0.105) ** 2 + ((ny - 0.65) / 0.045) ** 2 < 1)
        color = [170, 35, 71];
      if (((nx - 0.5) / 0.074) ** 2 + ((ny - 0.65) / 0.018) ** 2 < 1)
        color = [255, 255, 255];
      if (
        ny > 0.325 &&
        ny < 0.385 &&
        ((nx > 0.3 && nx < 0.44) || (nx > 0.56 && nx < 0.7))
      )
        color = [119, 84, 153];
      const i = (y * width + x) * 4;
      data.set([...color, 255], i);
    }
  const snapshot: VisionSnapshot = {
    landmarks: points,
    hairMask: { width, height, confidence: mask, data: mask, timestamp: 0 },
    hands: [],
    blendshapes: {},
    transform: null,
    timestamp: 0,
    latencyMs: 0,
    inferenceCount: 1,
    status: {
      face: { state: "ready" },
      hair: { state: "ready" },
      hands: { state: "ready" },
    },
  };
  return { image: { width, height, data } satisfies PixelImage, snapshot };
}

describe("local image-derived Look Remix", () => {
  it("samples the actual lip ring, excludes white teeth and never substitutes the dominant blue background", () => {
    const { image, snapshot } = fixture(),
      result = extractInspirationPixels(image, snapshot);
    expect(result.faceDetected).toBe(true);
    expect(result.regions.lipstick.color).toBe("#aa2347");
    expect(result.regions.lipstick.pixelCount).toBeGreaterThan(100);
    expect(result.look.lipstick.color).toBe("#aa2347");
    expect(result.regions.eyeshadow.color).toBe("#775499");
    expect(result.regions.skin.color).toBe("#bc8463");
    expect(result.look.foundation.enabled).toBe(false);
    expect(result.look.reshape).toBe(0);
  });
  it("samples segmented hair and a bounded lower-image palette separately", () => {
    const { image, snapshot } = fixture(),
      result = extractInspirationPixels(image, snapshot);
    expect(result.regions.hair.color).toBe("#371f15");
    expect(result.paletteScope).toBe("lower-image-possible-outfit");
    expect(result.palette[0].color).toBe("#46784b");
    expect(result.paletteBounds.y).toBeGreaterThan(0.8);
    expect(result.warnings.join(" ")).toContain("not garment segmentation");
  });
  it("has no facial inference without landmarks even with a dominant red image", () => {
    const { image } = fixture(),
      result = extractInspirationPixels(image, undefined);
    expect(result.faceDetected).toBe(false);
    expect(result.paletteScope).toBe("whole-image");
    for (const key of [
      "lipstick",
      "blush",
      "eyeshadow",
      "skin",
      "hair",
    ] as const) {
      expect(result.regions[key].source).toBe("unavailable");
      expect(result.regions[key].color).toBeNull();
    }
    expect(result.look.lipstick.enabled).toBe(false);
    expect(result.look.hair.enabled).toBe(false);
    expect(result.palette.length).toBeGreaterThan(0);
  });
  it("does not infer hair from unsegmented pixels", () => {
    const { image, snapshot } = fixture();
    snapshot.hairMask = null;
    const result = extractInspirationPixels(image, snapshot);
    expect(result.regions.hair.source).toBe("unavailable");
    expect(result.look.hair.enabled).toBe(false);
  });
  it("rejects a false-positive full-image hair mask without a face and retains the global palette", () => {
    const { image, snapshot } = fixture();
    snapshot.landmarks = [];
    snapshot.hairMask!.confidence.fill(1);
    const result = extractInspirationPixels(image, snapshot);
    expect(result.regions.hair.source).toBe("unavailable");
    expect(result.look.hair.enabled).toBe(false);
    expect(result.palette.length).toBeGreaterThan(0);
    expect(result.paletteScope).toBe("whole-image");
  });
  it("rejects an implausible full-image hair mask without losing usable facial samples", () => {
    const { image, snapshot } = fixture();
    snapshot.hairMask!.confidence.fill(1);
    const result = extractInspirationPixels(image, snapshot);
    expect(result.regions.hair.source).toBe("unavailable");
    expect(result.regions.lipstick.color).toBe("#aa2347");
  });
  it.each([
    [45, 30, 25],
    [83, 52, 36],
    [123, 79, 56],
    [163, 111, 76],
    [205, 155, 123],
    [233, 196, 170],
  ])(
    "preserves lip sampling against a synthetic skin reference %i/%i/%i",
    (r, g, b) => {
      const { image, snapshot } = fixture();
      for (let i = 0; i < image.data.length; i += 4) {
        if (
          image.data[i] === 188 &&
          image.data[i + 1] === 132 &&
          image.data[i + 2] === 99
        )
          (image.data as Uint8ClampedArray).set([r, g, b], i);
      }
      const result = extractInspirationPixels(image, snapshot);
      expect(result.regions.lipstick.color).toBe("#aa2347");
      expect(result.look.foundation.enabled).toBe(false);
    },
  );
  it("rejects a hand-covered lip sample rather than copying the hand colour", () => {
    const { image, snapshot } = fixture();
    snapshot.hands = [
      {
        landmarks: [
          { x: 0.35, y: 0.58, z: 0 },
          { x: 0.65, y: 0.58, z: 0 },
          { x: 0.65, y: 0.72, z: 0 },
          { x: 0.35, y: 0.72, z: 0 },
        ],
        confidence: 0.95,
        handedness: "Right",
        gesture: { name: "none", confidence: 0 } as never,
      },
    ];
    const result = extractInspirationPixels(image, snapshot);
    expect(result.regions.lipstick.source).toBe("unavailable");
    expect(result.look.lipstick.enabled).toBe(false);
    expect(result.regions.lipstick.excludedFraction).toBeGreaterThan(0.9);
  });
  it("bounds confidence, reports lighting uncertainty and never claims a validated finish classifier", () => {
    const { image, snapshot } = fixture();
    for (let i = 0; i < image.data.length; i += 4) {
      (image.data as Uint8ClampedArray)[i] = 8;
      (image.data as Uint8ClampedArray)[i + 1] = 8;
      (image.data as Uint8ClampedArray)[i + 2] = 8;
    }
    const result = extractInspirationPixels(image, snapshot);
    expect(result.quality.warnings.join(" ")).toContain("very dark");
    expect(result.regions.lipstick.confidence).toBeLessThan(0.72);
    expect(result.warnings.join(" ")).toContain("not product identification");
    expect(result.warnings.join(" ")).toContain(
      "validated material classifier",
    );
  });
  it("records corrections separately and preserves measurement, bounds and source result", () => {
    const { image, snapshot } = fixture(),
      result = extractInspirationPixels(image, snapshot);
    const corrected = correctRemixRegion(result, "lipstick", {
      color: "#942956",
      opacity: 0.45,
      finish: "gloss",
      enabled: true,
    });
    expect(corrected.look.lipstick).toEqual({
      color: "#942956",
      opacity: 0.45,
      finish: "gloss",
      enabled: true,
    });
    expect(corrected.regions.lipstick.measuredColor).toBe("#aa2347");
    expect(corrected.regions.lipstick.source).toBe("user-correction");
    expect(result.regions.lipstick.source).toBe("region-pixels");
    expect(result.look.lipstick.color).toBe("#aa2347");
    expect(corrected.regions.lipstick.bounds).toEqual(
      result.regions.lipstick.bounds,
    );
    expect(() =>
      correctRemixRegion(result, "lipstick", { color: "red" }),
    ).toThrow();
    expect(() =>
      correctRemixRegion(result, "lipstick", { opacity: 2 }),
    ).toThrow();
  });
  it("keeps skin as a reference even after manual correction and cannot activate foundation implicitly", () => {
    const { image, snapshot } = fixture(),
      result = extractInspirationPixels(image, snapshot);
    const corrected = correctRemixRegion(result, "skin", {
      color: "#80513c",
      enabled: true,
    });
    expect(corrected.look.foundation.enabled).toBe(false);
    expect(corrected.regions.skin.measuredColor).toBe("#bc8463");
    expect(JSON.stringify(corrected)).not.toContain("data:image");
    expect("data" in corrected.source).toBe(false);
  });
  it("handles invalid/cropped geometry and malformed pixel buffers honestly", () => {
    const { image, snapshot } = fixture();
    snapshot.landmarks[33].x = NaN;
    expect(extractInspirationPixels(image, snapshot).faceDetected).toBe(false);
    expect(() =>
      extractInspirationPixels({ ...image, data: [] }, snapshot),
    ).toThrow("pixel buffer");
  });
});
