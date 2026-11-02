/** Normalized MediaPipe coordinates; z is relative depth, not a metric distance. */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}
export interface Point {
  x: number;
  y: number;
}

/**
 * Normalized-coordinate conversion adapted from Virtual Makeup, landmarks.ts.
 * Copyright otdnnc. Upstream README declares MIT; see THIRD_PARTY_NOTICE.md.
 * Unlike upstream, edge coordinates (0 and 1) are valid and NaN is rejected.
 */
export function normalizedToPixel(
  x: number,
  y: number,
  width: number,
  height: number,
): Point | null {
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    x < 0 ||
    y < 0 ||
    x > 1 ||
    y > 1
  )
    return null;
  return {
    x: Math.min(Math.floor(x * width), width - 1),
    y: Math.min(Math.floor(y * height), height - 1),
  };
}

export function toScreen(
  point: Point,
  width: number,
  height: number,
  mirrored = false,
): Point {
  return { x: (mirrored ? 1 - point.x : point.x) * width, y: point.y * height };
}

/** Time-aware low-pass with faster response during deliberate motion. */
export class LandmarkSmoother {
  private previous: Landmark[] = [];
  private timestamp = 0;
  reset() {
    this.previous = [];
    this.timestamp = 0;
  }
  update(points: readonly Landmark[], timestamp: number): Landmark[] {
    if (
      points.length !== this.previous.length ||
      timestamp - this.timestamp > 350 ||
      timestamp <= this.timestamp
    ) {
      this.previous = points.map((p) => ({ ...p }));
      this.timestamp = timestamp;
      return this.previous;
    }
    const dt = Math.max(1, timestamp - this.timestamp);
    this.previous = points.map((point, index) => {
      const previous = this.previous[index];
      const speed = Math.hypot(point.x - previous.x, point.y - previous.y) / dt;
      const cutoff = Math.min(30, 3 + 6000 * speed);
      const alpha = 1 - Math.exp((-2 * Math.PI * cutoff * dt) / 1000);
      return {
        x: previous.x + alpha * (point.x - previous.x),
        y: previous.y + alpha * (point.y - previous.y),
        z: previous.z + alpha * (point.z - previous.z),
      };
    });
    this.timestamp = timestamp;
    return this.previous;
  }
}

/** MediaPipe canonical face mesh topology, not biometric identity features. */
export const REGIONS = {
  outerLip: [
    61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84,
    181, 91, 146,
  ],
  innerLip: [
    78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14,
    87, 178, 88, 95,
  ],
  leftEye: [
    33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7,
  ],
  rightEye: [
    263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390,
    249,
  ],
  leftBrow: [70, 63, 105, 66, 107, 55, 65, 52, 53, 46],
  rightBrow: [300, 293, 334, 296, 336, 285, 295, 282, 283, 276],
  faceOval: [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
    378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
    162, 21, 54, 103, 67, 109,
  ],
} as const;
