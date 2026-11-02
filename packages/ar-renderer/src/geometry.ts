/** Geometry registration adapted from OpenMakeupSDK FaceMeshModelController.js.
 * Copyright (c) 2026 Ehsan Moradi. MIT; see shader-library/LICENSE.OpenMakeupSDK.
 * Uses source-normalized face points throughout to eliminate separate model UV drift. */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}
export const REGIONS = {
  face: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
  ],
  lipOuter: [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
    181, 91, 146,
  ],
  lipInner: [
    78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14,
    87, 178, 88, 95,
  ],
  leftEye: [
    33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246,
  ],
  rightEye: [
    263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388,
    466,
  ],
  leftLid: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  rightLid: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  leftBrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  rightBrow: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  leftShadow: [
    33, 247, 30, 29, 27, 28, 56, 190, 133, 173, 157, 158, 159, 160, 161, 246,
  ],
  rightShadow: [
    263, 467, 260, 259, 257, 258, 286, 414, 362, 398, 384, 385, 386, 387, 388,
    466,
  ],
} as const;
export function validFace(points: readonly Landmark[]): boolean {
  return (
    points.length >= 468 &&
    points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  );
}
export function faceMetrics(
  points: readonly Landmark[],
  width: number,
  height: number,
) {
  const right = points[33],
    left = points[263],
    chin = points[152],
    forehead = points[10];
  if (!right || !left || !chin || !forehead) return null;
  const dx = (left.x - right.x) * width,
    dy = (left.y - right.y) * height;
  return {
    eyeDistance: Math.hypot(dx, dy),
    rotation: Math.atan2(dy, dx),
    center: {
      x: ((left.x + right.x) / 2) * width,
      y: ((left.y + right.y) / 2) * height,
    },
    height: Math.hypot(
      (chin.x - forehead.x) * width,
      (chin.y - forehead.y) * height,
    ),
  };
}
export function hexRgb(hex: string): [number, number, number] {
  if (!/^#[\da-f]{6}$/i.test(hex)) return [0, 0, 0];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}
export function polygonArea(points: readonly Landmark[]): number {
  let result = 0;
  points.forEach((p, i) => {
    const n = points[(i + 1) % points.length];
    result += p.x * n.y - n.x * p.y;
  });
  return Math.abs(result) / 2;
}
export function lipOpen(points: readonly Landmark[]): number {
  const upper = points[13],
    lower = points[14],
    left = points[61],
    right = points[291];
  if (!upper || !lower || !left || !right) return 0;
  return (
    Math.hypot(upper.x - lower.x, upper.y - lower.y) /
    Math.max(0.001, Math.hypot(left.x - right.x, left.y - right.y))
  );
}
/** Confidence-space bounds let root-to-tip color follow the segmented hair, not image framing. */
export function maskBounds(
  data: Float32Array | Uint8Array,
  width: number,
  height: number,
): [number, number, number, number] {
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  const scale = data instanceof Uint8Array ? 255 : 1;
  for (let i = 0; i < Math.min(data.length, width * height); i++) {
    if (data[i] / scale < 0.5) continue;
    const x = i % width,
      y = Math.floor(i / width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (maxX < 0 || maxY < 0) return [0, 0, 1, 1];
  return [minX / width, minY / height, (maxX + 1) / width, (maxY + 1) / height];
}
