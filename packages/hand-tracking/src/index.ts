import type { Landmark, Point } from "../../face-tracking/src";
export type GestureName =
  "pinch" | "open-palm" | "point" | "swipe-left" | "swipe-right" | "none";
export interface Gesture {
  name: GestureName;
  active: boolean;
  confidence: number;
  position: Point;
  timestamp: number;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Geometric gestures only; these can control local visual previews, never commerce. */
export class GestureTracker {
  private pending: GestureName = "none";
  private pendingSince = 0;
  private active: GestureName = "none";
  private previous: { position: Point; timestamp: number } | null = null;
  private cooldownUntil = 0;
  private pinchThreshold = 0.3;
  calibratePinch(ratio: number) {
    this.pinchThreshold = Math.max(0.15, Math.min(0.6, ratio));
  }
  reset() {
    this.pending = "none";
    this.active = "none";
    this.previous = null;
    this.pendingSince = 0;
  }
  update(
    points: readonly Landmark[],
    timestamp: number,
    confidence = 1,
  ): Gesture {
    if (points.length < 21 || confidence < 0.55) {
      this.reset();
      return {
        name: "none",
        active: false,
        confidence: 0,
        position: { x: 0, y: 0 },
        timestamp,
      };
    }
    const position = {
      x: (points[4].x + points[8].x) / 2,
      y: (points[4].y + points[8].y) / 2,
    };
    const scale = Math.max(0.01, distance(points[0], points[9]));
    const extended = [8, 12, 16, 20].map(
      (tip) =>
        distance(points[tip], points[0]) >
        distance(points[tip - 2], points[0]) * 1.12,
    );
    const pinch = distance(points[4], points[8]) / scale < this.pinchThreshold;
    let candidate: GestureName = pinch
      ? "pinch"
      : extended.every(Boolean)
        ? "open-palm"
        : extended[0] && !extended[1] && !extended[2] && !extended[3]
          ? "point"
          : "none";
    if (
      candidate === "open-palm" &&
      this.previous &&
      timestamp > this.cooldownUntil
    ) {
      const elapsed = timestamp - this.previous.timestamp;
      const movement = position.x - this.previous.position.x;
      if (elapsed > 50 && elapsed < 450 && Math.abs(movement) > 0.19) {
        candidate = movement > 0 ? "swipe-right" : "swipe-left";
        this.cooldownUntil = timestamp + 900;
      }
    }
    if (!this.previous || timestamp - this.previous.timestamp > 350)
      this.previous = { position, timestamp };
    const swipe = candidate.startsWith("swipe");
    if (candidate !== this.pending) {
      this.pending = candidate;
      this.pendingSince = timestamp;
    }
    const ready = swipe || timestamp - this.pendingSince >= 140;
    const event = ready && this.active !== candidate && candidate !== "none";
    if (ready) this.active = candidate;
    return {
      name: ready ? candidate : this.active,
      active: event,
      confidence,
      position,
      timestamp,
    };
  }
}
