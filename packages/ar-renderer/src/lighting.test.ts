import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIGHTING,
  normalizeLighting,
  lightingVector,
  gradePixel,
} from "./lighting";
describe("creative-light preview boundary", () => {
  it("keeps omitted and neutral lighting an exact image identity", () => {
    const p: [number, number, number] = [0.13, 0.42, 0.88];
    expect(gradePixel(p, 0.1, 0.8, normalizeLighting())).toEqual(p);
    expect(
      gradePixel(p, 0.9, 0.1, { ...DEFAULT_LIGHTING, intensity: 1 }),
    ).toEqual(p);
    expect(
      gradePixel(p, 0.3, 0.7, {
        ...DEFAULT_LIGHTING,
        preset: "moonlight",
        intensity: 0,
      }),
    ).toEqual(p);
  });
  it("validates and bounds external controls without changing the caller", () => {
    const input = {
      preset: "golden-hour" as const,
      intensity: 4,
      direction: { x: -8, y: NaN },
    };
    const normalized = normalizeLighting(input);
    expect(normalized).toEqual({
      preset: "golden-hour",
      intensity: 1,
      direction: { x: -1, y: -0.55 },
    });
    expect(input.intensity).toBe(4);
    expect(
      normalizeLighting({ preset: "invalid" as never, intensity: NaN }).preset,
    ).toBe("neutral");
  });
  it("provides bounded, directional grading while preserving local contrast", () => {
    const settings = {
      ...DEFAULT_LIGHTING,
      preset: "golden-hour" as const,
      intensity: 0.8,
    };
    const dark = gradePixel([0.1, 0.1, 0.1], 0.2, 0.2, settings),
      light = gradePixel([0.6, 0.6, 0.6], 0.2, 0.2, settings);
    expect(light[0] / dark[0]).toBeCloseTo(6);
    expect(light[0]).toBeGreaterThan(light[2]);
    expect(
      gradePixel([1, 1, 1], 0, 0, settings).every((n) => n >= 0 && n <= 1),
    ).toBe(true);
    expect(Math.hypot(...lightingVector(settings))).toBeCloseTo(1);
  });
});
