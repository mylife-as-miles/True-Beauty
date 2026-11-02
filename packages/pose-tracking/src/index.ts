import { LandmarkSmoother, type Landmark } from "../../face-tracking/src";
export interface PoseLandmark extends Landmark {
  visibility?: number;
  presence?: number;
}
export interface PoseFrame {
  landmarks: PoseLandmark[];
  timestamp: number;
  source: "mediapipe-pose-lite";
}
export const POSE_POINTS = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
} as const;
export function visiblePosePoint(
  pose: PoseFrame | null | undefined,
  index: number,
  minimum = 0.6,
): PoseLandmark | null {
  const p = pose?.landmarks[index];
  if (
    !p ||
    ![p.x, p.y, p.z].every(Number.isFinite) ||
    p.x < 0 ||
    p.x > 1 ||
    p.y < 0 ||
    p.y > 1 ||
    (p.visibility ?? 0) < minimum ||
    (p.presence !== undefined && p.presence < minimum)
  )
    return null;
  return p;
}
export class PoseSmoother {
  private readonly filter = new LandmarkSmoother();
  reset() {
    this.filter.reset();
  }
  update(points: readonly PoseLandmark[], timestamp: number): PoseFrame {
    const smoothed = this.filter.update(points, timestamp);
    return {
      landmarks: smoothed.map((p, i) => ({
        ...p,
        visibility: points[i].visibility,
        presence: points[i].presence,
      })),
      timestamp,
      source: "mediapipe-pose-lite",
    };
  }
}
