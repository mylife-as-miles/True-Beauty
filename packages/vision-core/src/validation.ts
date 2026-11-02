import type { VisionSnapshot } from "./pipeline";
import {
  BODY_LABELS,
  type BodySegmentation,
} from "../../body-segmentation/src";
/** Metadata only: intentionally excludes photos, landmark coordinates and masks. */
export function summarizeVision(snapshot: VisionSnapshot) {
  const body = snapshot.bodyMask,
    counts = Object.fromEntries(
      BODY_LABELS.map((label) => [label, 0]),
    ) as Record<(typeof BODY_LABELS)[number], number>;
  let sum = 0;
  if (body)
    for (let i = 0; i < body.labels.length; i++) {
      counts[BODY_LABELS[body.labels[i]] ?? "other"]++;
      sum += body.confidence[i];
    }
  return {
    timestamp: snapshot.timestamp,
    latencyMs: snapshot.latencyMs,
    status: structuredClone(snapshot.status),
    facePoints: snapshot.landmarks.length,
    handCount: snapshot.hands.length,
    posePoints: snapshot.pose?.landmarks.length ?? 0,
    visiblePosePoints:
      snapshot.pose?.landmarks.filter((p) => (p.visibility ?? 0) >= 0.6)
        .length ?? 0,
    body: body
      ? {
          width: body.width,
          height: body.height,
          pixels: body.labels.length,
          classCounts: counts,
          meanWinningConfidence: sum / body.labels.length,
        }
      : null,
    scheduler: snapshot.scheduler ? structuredClone(snapshot.scheduler) : null,
    disclosure:
      "Technical model availability and prediction confidence only. No medical, identity, fit, depth or fairness conclusion.",
  };
}
/** Agreement between two predictions under identical framing; never labelled accuracy. */
export function maskPredictionAgreement(
  reference: BodySegmentation,
  current: BodySegmentation,
  category: number,
  identicalFraming: boolean,
) {
  if (
    !identicalFraming ||
    reference.width !== current.width ||
    reference.height !== current.height
  )
    return {
      available: false,
      reason: "Identical source framing and mask dimensions are required.",
    };
  let intersection = 0,
    union = 0;
  for (let i = 0; i < reference.labels.length; i++) {
    const a = reference.labels[i] === category,
      b = current.labels[i] === category;
    if (a && b) intersection++;
    if (a || b) union++;
  }
  return {
    available: true,
    intersection,
    union,
    iou: union ? intersection / union : null,
    interpretation:
      "Prediction agreement, not ground-truth segmentation accuracy.",
  };
}
export interface ValidationObservation {
  fixtureId: string;
  source: "consented-local" | "public-evaluation";
  consented: boolean;
  /** Supplied by a consenting participant/reviewer; never inferred from pixels. */
  group?: string;
  deviceLabel: string;
  faceAvailable: boolean;
  poseAvailable: boolean;
  bodyAvailable: boolean;
}
export function summarizeValidationCoverage(
  observations: readonly ValidationObservation[],
) {
  const eligible = observations.filter(
      (o) => o.source === "public-evaluation" || o.consented,
    ),
    groups: Record<string, number> = {},
    devices: Record<string, number> = {};
  for (const o of eligible) {
    groups[o.group?.trim() || "unlabelled"] =
      (groups[o.group?.trim() || "unlabelled"] ?? 0) + 1;
    devices[o.deviceLabel] = (devices[o.deviceLabel] ?? 0) + 1;
  }
  return {
    eligibleSamples: eligible.length,
    excludedWithoutConsent: observations.length - eligible.length,
    groups,
    devices,
    availability: {
      face: eligible.filter((o) => o.faceAvailable).length,
      pose: eligible.filter((o) => o.poseAvailable).length,
      body: eligible.filter((o) => o.bodyAvailable).length,
    },
    fairnessStatus: "unverified" as const,
    limitations:
      "Small convenience fixtures and availability counts do not establish demographic parity, population accuracy or physical-device performance. Group labels are user/reviewer supplied; none are inferred.",
  };
}
