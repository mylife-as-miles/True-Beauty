import { describe, it, expect } from "vitest";
import {
  faceMetrics,
  hexRgb,
  maskBounds,
  lipOpen,
  polygonArea,
  REGIONS,
  validFace,
  type Landmark,
} from "./geometry";
describe("source-space geometry", () => {
  it("rejects incomplete, missing and nonfinite tracks rather than applying a guessed mask", () => {
    expect(validFace([])).toBe(false);
    const p = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    expect(validFace(p)).toBe(true);
    p[10].x = NaN;
    expect(validFace(p)).toBe(false);
  });
  it("registers roll and source aspect from actual eye and face points", () => {
    const p: Landmark[] = Array.from({ length: 468 }, () => ({
      x: 0.5,
      y: 0.5,
    }));
    p[33] = { x: 0.3, y: 0.3 };
    p[263] = { x: 0.7, y: 0.4 };
    p[152] = { x: 0.5, y: 0.8 };
    p[10] = { x: 0.5, y: 0.1 };
    const m = faceMetrics(p, 1000, 500)!;
    expect(m.eyeDistance).toBeCloseTo(Math.hypot(400, 50));
    expect(m.rotation).toBeCloseTo(Math.atan2(50, 400));
    expect(m.center).toEqual({ x: 500, y: 175 });
    expect(m.height).toBeCloseTo(350);
  });
  it("keeps mouth interior separate from pigment and handles open mouth scale", () => {
    expect(REGIONS.lipOuter).not.toContain(13);
    expect(REGIONS.lipInner).toContain(13);
    const p = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
    p[13] = { x: 0.5, y: 0.5 };
    p[14] = { x: 0.5, y: 0.55 };
    p[61] = { x: 0.4, y: 0.5 };
    p[291] = { x: 0.6, y: 0.5 };
    expect(lipOpen(p)).toBeCloseTo(0.25);
  });
  it("anchors hair gradients to actual segmented bounds for both byte and confidence masks", () => {
    expect(
      maskBounds(
        new Float32Array([0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0]),
        4,
        4,
      ),
    ).toEqual([0.25, 0.25, 0.75, 0.75]);
    expect(maskBounds(new Uint8Array([0, 255, 0, 0]), 2, 2)).toEqual([
      0.5, 0, 1, 0.5,
    ]);
    expect(maskBounds(new Float32Array(4), 2, 2)).toEqual([0, 0, 1, 1]);
  });
  it("converts bounded color and source-space polygon area", () => {
    expect(hexRgb("#ff0080")).toEqual([1, 0, 128 / 255]);
    expect(hexRgb("red")).toEqual([0, 0, 0]);
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ]),
    ).toBe(1);
  });
});
