import { describe, it, expect } from "vitest";
import { makeFaceSurface, surfaceNormal } from "./surface";
import type { Landmark } from "./geometry";
function face() {
  const p: Landmark[] = Array.from({ length: 478 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
  }));
  p[33] = { x: 0.3, y: 0.3, z: 0 };
  p[263] = { x: 0.7, y: 0.3, z: 0 };
  p[133] = { x: 0.42, y: 0.3 };
  p[362] = { x: 0.58, y: 0.3 };
  p[10] = { x: 0.5, y: 0.08 };
  p[152] = { x: 0.5, y: 0.85 };
  p[61] = { x: 0.4, y: 0.6 };
  p[291] = { x: 0.6, y: 0.6 };
  p[0] = { x: 0.5, y: 0.565 };
  p[17] = { x: 0.5, y: 0.65 };
  p[13] = { x: 0.5, y: 0.595 };
  p[14] = { x: 0.5, y: 0.61 };
  p[105] = { x: 0.36, y: 0.2 };
  p[159] = { x: 0.36, y: 0.29 };
  p[334] = { x: 0.64, y: 0.2 };
  p[386] = { x: 0.64, y: 0.29 };
  return p;
}
describe("registered cosmetic surfaces", () => {
  it("ignores nonfinite optional depth rather than poisoning material normals", () => {
    const p = face();
    p[33].z = NaN;
    p[263].z = Infinity;
    const surface = makeFaceSurface(p, 1000, 600)!;
    expect(surface.headTilt).toEqual([0, 0]);
    expect(
      surfaceNormal(0.1, 0.6, "face", surface).every(Number.isFinite),
    ).toBe(true);
  });
  it("rejects missing tracks and gives separate upper/lower lip surfaces", () => {
    expect(makeFaceSurface([], 1000, 600)).toBeNull();
    const s = makeFaceSurface(face(), 1000, 600)!;
    expect(s.lipBands[0]).toBeLessThan(s.lipBands[1]);
    expect(s.lipBands[2]).toBeGreaterThan(0);
    expect(s.lipBands[3]).toBeGreaterThan(0);
    expect(surfaceNormal(s.lip[0], s.lipBands[1], "lip", s)).toEqual([0, 0, 1]);
  });
  it("keeps canonical coordinates independent of output resolution and inverts source mapping", () => {
    const p = face(),
      a = makeFaceSurface(p, 1000, 600)!,
      b = makeFaceSurface(p, 2000, 1200)!,
      point = { x: 0.62, y: 0.68 };
    expect(a.toFace(point)).toEqual(b.toFace(point));
    const local = a.toFace(point),
      back = a.toSource(local.x, local.y);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });
  it("registers a rolled face so material coordinates rotate with the landmarks", () => {
    const p = face(),
      angle = 0.35,
      w = 1000,
      h = 600,
      c = Math.cos(angle),
      s = Math.sin(angle),
      cx = 0.5 * w,
      cy = 0.3 * h;
    const rotate = (p: { x: number; y: number }) => {
      const x = p.x * w - cx,
        y = p.y * h - cy;
      return { x: (cx + x * c - y * s) / w, y: (cy + x * s + y * c) / h };
    };
    const a = makeFaceSurface(p, w, h)!,
      b = makeFaceSurface(
        p.map((q) => ({ ...q, ...rotate(q) })),
        w,
        h,
      )!,
      point = { x: 0.57, y: 0.61 },
      first = a.toFace(point),
      second = b.toFace(rotate(point));
    expect(second.x).toBeCloseTo(first.x);
    expect(second.y).toBeCloseTo(first.y);
    expect(b.rotation - a.rotation).toBeCloseTo(angle);
  });
});
