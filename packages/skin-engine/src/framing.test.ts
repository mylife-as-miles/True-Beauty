import { describe, it, expect } from "vitest";
import { planScanFraming } from "./framing";
import { REGIONS } from "../../face-tracking/src";
function mesh(cx = 0.5, cy = 0.45, rx = 0.16, ry = 0.22) {
  const points = Array.from({ length: 478 }, () => ({ x: cx, y: cy }));
  REGIONS.faceOval.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i / REGIONS.faceOval.length) * Math.PI * 2;
    points[id] = { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
  return points;
}
describe("explicit scan crop planning from observed landmarks", () => {
  it("frames face near72% width while retaining forehead/chin and valid output dimensions", () => {
    const result = planScanFraming({
      width: 1600,
      height: 2000,
      landmarks: mesh(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.face.widthFraction).toBeGreaterThan(0.71);
    expect(result.face.widthFraction).toBeLessThanOrEqual(0.72);
    expect(result.crop.x).toBeGreaterThanOrEqual(0);
    expect(result.crop.y).toBeLessThan(result.face.top);
    expect(result.crop.y + result.crop.height).toBeGreaterThan(
      result.face.bottom,
    );
    expect(Math.min(...Object.values(result.output))).toBeGreaterThanOrEqual(
      480,
    );
    expect(Math.max(...Object.values(result.output))).toBeLessThanOrEqual(2560);
  });
  it("clamps an off-centre crop to actual pixels without removing observed face edges", () => {
    const result = planScanFraming({
      width: 2000,
      height: 1800,
      landmarks: mesh(0.17, 0.45, 0.15, 0.22),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.crop.x).toBe(0);
    expect(result.crop.x + result.crop.width).toBeGreaterThan(
      result.face.right,
    );
    expect(result.face.widthFraction).toBeGreaterThan(0.6);
  });
  it("rejects missing/nonfinite landmarks, clipped forehead/chin and implausibly small source detail", () => {
    expect(
      planScanFraming({
        width: 1000,
        height: 1200,
        landmarks: mesh(),
        targetFaceWidthRatio: NaN,
      }),
    ).toMatchObject({ ok: false, code: "invalid-image" });
    expect(
      planScanFraming({ width: 1000, height: 1200, landmarks: [] }),
    ).toMatchObject({ ok: false, code: "landmarks-unavailable" });
    const invalid = mesh();
    invalid[10].x = NaN;
    expect(
      planScanFraming({ width: 1000, height: 1200, landmarks: invalid }).ok,
    ).toBe(false);
    expect(
      planScanFraming({
        width: 1000,
        height: 1200,
        landmarks: mesh(0.5, 0.2, 0.16, 0.22),
      }),
    ).toMatchObject({ ok: false, code: "clipped-face" });
    expect(
      planScanFraming({
        width: 1000,
        height: 1200,
        landmarks: mesh(0.5, 0.5, 0.04, 0.05),
      }),
    ).toMatchObject({ ok: false, code: "insufficient-detail" });
  });
  it("scales large crops down, exposes small-crop enlargement and leaves input landmarks untouched", () => {
    const points = mesh(),
      copy = structuredClone(points);
    const huge = planScanFraming({
      width: 12000,
      height: 16000,
      landmarks: points,
    });
    expect(huge.ok).toBe(true);
    if (huge.ok)
      expect(Math.max(...Object.values(huge.output))).toBeLessThanOrEqual(2560);
    const small = planScanFraming({
      width: 900,
      height: 1000,
      landmarks: points,
    });
    expect(small.ok).toBe(true);
    if (small.ok) {
      expect(small.upscaled).toBe(true);
      expect(small.warnings.join(" ")).toContain("adds no skin detail");
    }
    expect(points).toEqual(copy);
  });
});
