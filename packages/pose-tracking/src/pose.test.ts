import { describe, expect, it } from "vitest";
import { PoseSmoother, visiblePosePoint, type PoseFrame } from "./index";
const pose = (x = 0.5, visibility = 0.9): PoseFrame => ({
  landmarks: Array.from({ length: 33 }, () => ({
    x,
    y: 0.5,
    z: 0,
    visibility,
    presence: 0.9,
  })),
  timestamp: 100,
  source: "mediapipe-pose-lite",
});
describe("pose projection confidence and temporal boundaries", () => {
  it("requires finite, visible, in-frame coordinates and preserves observed visibility", () => {
    const frame = pose();
    expect(visiblePosePoint(frame, 15)).not.toBeNull();
    frame.landmarks[15].visibility = 0.3;
    expect(visiblePosePoint(frame, 15)).toBeNull();
    frame.landmarks[15] = { x: 1.1, y: 0.5, z: 0, visibility: 0.99 };
    expect(visiblePosePoint(frame, 15)).toBeNull();
    frame.landmarks[15] = { x: 0.5, y: 0.5, z: NaN, visibility: 0.99 };
    expect(visiblePosePoint(frame, 15)).toBeNull();
  });
  it("smooths small movement without carrying confidence over a lost detection or stale gap", () => {
    const smoother = new PoseSmoother();
    smoother.update(pose().landmarks, 100);
    const second = smoother.update(pose(0.51, 0.2).landmarks, 116);
    expect(second.landmarks[15].x).toBeGreaterThan(0.5);
    expect(second.landmarks[15].x).toBeLessThan(0.51);
    expect(visiblePosePoint(second, 15)).toBeNull();
    smoother.reset();
    expect(smoother.update(pose(0.8).landmarks, 200).landmarks[15].x).toBe(0.8);
    expect(smoother.update(pose(0.3).landmarks, 1500).landmarks[15].x).toBe(
      0.3,
    );
  });
});
