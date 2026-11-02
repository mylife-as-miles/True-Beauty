import { faceMetrics, validFace, type Landmark } from "./geometry";
export interface FaceSurface {
  center: [number, number];
  basis: [number, number, number, number];
  rotation: number;
  eyeDistance: number;
  lip: [number, number, number, number];
  lipBands: [number, number, number, number];
  eyes: [number, number, number, number];
  headTilt: [number, number];
  toFace(point: { x: number; y: number }): { x: number; y: number };
  toSource(x: number, y: number): { x: number; y: number };
}
/** Approximate regional cosmetic surfaces registered to shared landmarks, not physical reconstruction. */
export function makeFaceSurface(
  points: readonly Landmark[],
  width: number,
  height: number,
): FaceSurface | null {
  if (!validFace(points)) return null;
  const m = faceMetrics(points, width, height)!;
  const e = Math.max(1, m.eyeDistance),
    c = Math.cos(m.rotation),
    s = Math.sin(m.rotation),
    center: [number, number] = [m.center.x / width, m.center.y / height];
  const basis: [number, number, number, number] = [
    (c * width) / e,
    (-s * width) / e,
    (s * height) / e,
    (c * height) / e,
  ];
  const toFace = (p: { x: number; y: number }) => ({
    x: basis[0] * (p.x - center[0]) + basis[2] * (p.y - center[1]),
    y: basis[1] * (p.x - center[0]) + basis[3] * (p.y - center[1]),
  });
  const toSource = (x: number, y: number) => ({
    x: center[0] + ((x * c - y * s) * e) / width,
    y: center[1] + ((x * s + y * c) * e) / height,
  });
  const upper = toFace(points[0]),
    lower = toFace(points[17]),
    left = toFace(points[61]),
    right = toFace(points[291]),
    lc = toFace({
      x: (points[33].x + points[133].x) / 2,
      y: (points[159].y + points[105].y) / 2,
    }),
    rc = toFace({
      x: (points[263].x + points[362].x) / 2,
      y: (points[386].y + points[334].y) / 2,
    });
  const innerUpper = toFace(points[13]),
    innerLower = toFace(points[14]);
  const eyeNorm = e / width,
    yaw = Math.max(
      -0.45,
      Math.min(
        0.45,
        (((Number.isFinite(points[263].z) ? points[263].z! : 0) -
          (Number.isFinite(points[33].z) ? points[33].z! : 0)) /
          Math.max(0.01, eyeNorm)) *
          0.5,
      ),
    );
  return {
    center,
    basis,
    rotation: m.rotation,
    eyeDistance: e,
    lip: [
      (left.x + right.x) / 2,
      (upper.y + lower.y) / 2,
      Math.max(0.08, Math.hypot(right.x - left.x, right.y - left.y) / 2),
      Math.max(0.035, Math.hypot(lower.x - upper.x, lower.y - upper.y) / 2),
    ],
    lipBands: [
      (upper.y + innerUpper.y) / 2,
      (lower.y + innerLower.y) / 2,
      Math.max(0.012, Math.abs(innerUpper.y - upper.y) / 2),
      Math.max(0.015, Math.abs(lower.y - innerLower.y) / 2),
    ],
    eyes: [lc.x, lc.y, rc.x, rc.y],
    headTilt: [yaw, 0],
    toFace,
    toSource,
  };
}
export function surfaceNormal(
  x: number,
  y: number,
  kind: "lip" | "eye" | "face",
  surface: FaceSurface,
): [number, number, number] {
  let nx: number, ny: number;
  if (kind === "lip") {
    const upper = y < surface.lip[1],
      center = surface.lipBands[upper ? 0 : 1],
      radius = surface.lipBands[upper ? 2 : 3];
    nx = ((x - surface.lip[0]) / surface.lip[2]) * 0.25;
    ny = ((y - center) / radius) * 0.52;
  } else if (kind === "eye") {
    const side =
      Math.abs(x - surface.eyes[0]) < Math.abs(x - surface.eyes[2]) ? 0 : 2;
    nx = ((x - surface.eyes[side]) / 0.28) * 0.3;
    ny = ((y - surface.eyes[side + 1]) / 0.12) * 0.48;
  } else {
    nx = x * 0.6;
    ny = (y - 0.24) * 0.38;
  }
  nx += surface.headTilt[0];
  ny += surface.headTilt[1];
  const length = Math.hypot(nx, ny, 1);
  return [nx / length, ny / length, 1 / length];
}
