import { describe, expect, it } from "vitest";
import {
  LandmarkSmoother,
  normalizedToPixel,
  toScreen,
} from "../../face-tracking/src";
import {
  HairMaskSmoother,
  featherMask,
  recolorHairPixel,
} from "../../hair-segmentation/src";
import { GestureTracker } from "../../hand-tracking/src";

describe("face tracking geometry and temporal stability", () => {
  it("accepts edge landmarks while rejecting invalid input", () => {
    expect(normalizedToPixel(0, 1, 640, 480)).toEqual({ x: 0, y: 479 });
    expect(normalizedToPixel(NaN, 0.4, 640, 480)).toBeNull();
    expect(normalizedToPixel(1.1, 0.4, 640, 480)).toBeNull();
    expect(toScreen({ x: 0.2, y: 0.4 }, 100, 200, true)).toEqual({
      x: 80,
      y: 80,
    });
  });
  it("smooths jitter but resets after tracking is lost", () => {
    const filter = new LandmarkSmoother();
    filter.update([{ x: 0.5, y: 0.5, z: 0 }], 100);
    const next = filter.update([{ x: 0.505, y: 0.5, z: 0 }], 116);
    expect(next[0].x).toBeGreaterThan(0.5);
    expect(next[0].x).toBeLessThan(0.505);
    const reset = filter.update([{ x: 0.8, y: 0.5, z: 0 }], 700);
    expect(reset[0].x).toBe(0.8);
  });
});

describe("hair segmentation confidence", () => {
  it("blends fresh masks and rejects stale temporal ghosting", () => {
    const filter = new HairMaskSmoother();
    filter.update([1, 0], 2, 1, 100);
    const second = filter.update([0, 1], 2, 1, 200);
    expect(second.confidence[0]).toBeCloseTo(0.45);
    expect(second.confidence[1]).toBeCloseTo(0.55);
    const stale = filter.update([0, 1], 2, 1, 1000);
    expect([...stale.confidence]).toEqual([0, 1]);
    expect(() => filter.update([0], 2, 1, 1100)).toThrow();
  });
  it("feathers mask edges while preserving uniform regions", () => {
    expect([...featherMask(new Float32Array([1, 1, 1, 1]), 2, 2)]).toEqual([
      1, 1, 1, 1,
    ]);
    const result = featherMask(new Float32Array([0, 1, 0]), 3, 1);
    expect(result[1]).toBeGreaterThan(result[0]);
    expect(result[0]).toBeGreaterThan(0);
  });
  it("leaves pixels outside hair untouched and preserves texture contrast", () => {
    expect(recolorHairPixel([30, 20, 10], [150, 40, 20], 0, 1)).toEqual([
      30, 20, 10,
    ]);
    const darker = recolorHairPixel([20, 20, 20], [140, 50, 35], 1, 0.8);
    const brighter = recolorHairPixel([100, 100, 100], [140, 50, 35], 1, 0.8);
    expect(brighter[0]).toBeGreaterThan(darker[0]);
  });
});

describe("gesture safety and debouncing", () => {
  it("requires a stable pinch and emits once until release", () => {
    const points = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    points[0] = { x: 0.5, y: 0.8, z: 0 };
    points[9] = { x: 0.5, y: 0.6, z: 0 };
    points[4] = { x: 0.49, y: 0.5, z: 0 };
    points[8] = { x: 0.51, y: 0.5, z: 0 };
    const tracker = new GestureTracker();
    expect(tracker.update(points, 100).active).toBe(false);
    expect(tracker.update(points, 250).name).toBe("pinch");
    expect(tracker.update(points, 270).active).toBe(false);
    expect(tracker.update([], 300).name).toBe("none");
    expect(tracker.update(points, 400, 0.2).name).toBe("none");
  });
});

import { InferenceScheduler } from "./scheduler";
describe("adaptive inference scheduling", () => {
  it("reduces cadence when measured model cost exceeds frame budget", () => {
    const scheduler = new InferenceScheduler({ face: 30, hair: 8, hands: 15 });
    scheduler.setActive({ face: true, hair: true, hands: true });
    expect(scheduler.due("face", 100)).toBe(true);
    scheduler.record("face", 100, 60);
    expect(scheduler.slowdown).toBeGreaterThan(1);
    expect(scheduler.due("face", 140)).toBe(false);
    expect(scheduler.due("face", 250)).toBe(true);
    expect(scheduler.due("hair", 120)).toBe(true);
    scheduler.setActive({ hair: true });
    expect(scheduler.slowdown).toBe(1);
  });
});
