/** Official MediaPipe selfie-multiclass class order (zero-based task output). */
export const BODY_LABELS = [
  "background",
  "hair",
  "body-skin",
  "face-skin",
  "clothes",
  "other",
] as const;
export type BodyLabel = (typeof BODY_LABELS)[number];
export interface BodySegmentation {
  width: number;
  height: number;
  /** Most likely semantic class, not depth or identity. */
  labels: Uint8Array;
  /** Confidence of the winning class. Not calibrated across populations. */
  confidence: Float32Array;
  person: Float32Array;
  timestamp: number;
  source: "mediapipe-selfie-multiclass";
  /** Same-frame forehead reference for optional image-plane alignment, not identity/depth. */
  faceAnchor?: { x: number; y: number };
}
const bounded = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

/** Copies model-owned buffers; the returned arrays survive MediaPipe callback disposal. */
export function decodeBodyMasks(
  masks: readonly ArrayLike<number>[],
  width: number,
  height: number,
  timestamp: number,
): BodySegmentation {
  const length = width * height;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    masks.length !== 6 ||
    masks.some((m) => m.length !== length)
  )
    throw new Error(
      "Expected six equally sized MediaPipe body confidence masks",
    );
  const labels = new Uint8Array(length),
    confidence = new Float32Array(length),
    person = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let best = -1,
      category = 0,
      total = 0;
    for (let c = 0; c < masks.length; c++) {
      const value = bounded(masks[c][i]);
      total += value;
      if (value > best) {
        best = value;
        category = c;
      }
    }
    labels[i] = category;
    confidence[i] = best;
    person[i] =
      total > 1e-8 && Number.isFinite(masks[0][i])
        ? 1 - bounded(masks[0][i])
        : 0;
  }
  return {
    width,
    height,
    labels,
    confidence,
    person,
    timestamp,
    source: "mediapipe-selfie-multiclass",
  };
}

/** Reduce temporal label flicker only when a new class prediction is uncertain. */
export class BodyMaskSmoother {
  private previous: BodySegmentation | null = null;
  reset() {
    this.previous = null;
  }
  update(mask: BodySegmentation): BodySegmentation {
    const old = this.previous;
    if (
      old &&
      old.width === mask.width &&
      old.height === mask.height &&
      mask.timestamp > old.timestamp &&
      mask.timestamp - old.timestamp < 600
    ) {
      for (let i = 0; i < mask.labels.length; i++) {
        // Confident new boundaries always win; stale boundaries are never carried after a pause.
        if (
          mask.labels[i] !== old.labels[i] &&
          mask.confidence[i] < 0.55 &&
          old.confidence[i] > 0.7
        ) {
          mask.labels[i] = old.labels[i];
          mask.confidence[i] = old.confidence[i] * 0.7;
        }
        mask.person[i] = mask.person[i] * 0.8 + old.person[i] * 0.2;
      }
    }
    this.previous = mask;
    return mask;
  }
}

export function sampleBody(
  mask: BodySegmentation | null | undefined,
  x: number,
  y: number,
): { label: BodyLabel; confidence: number; person: number } | null {
  if (
    !mask ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  )
    return null;
  const index =
    Math.min(mask.height - 1, Math.floor(y * mask.height)) * mask.width +
    Math.min(mask.width - 1, Math.floor(x * mask.width));
  return {
    label: BODY_LABELS[mask.labels[index]] ?? "other",
    confidence: mask.confidence[index],
    person: mask.person[index],
  };
}

/** Semantic exclusion; it does not infer which object is physically in front. */
export function semanticOcclusion(
  sample: ReturnType<typeof sampleBody>,
  kind: "face-effect" | "body-accessory" | "hat-fringe",
): number {
  if (!sample || sample.confidence < 0.65) return 0;
  const strength = Math.min(1, (sample.confidence - 0.65) / 0.25);
  if (kind === "face-effect")
    return ["body-skin", "clothes", "other"].includes(sample.label)
      ? strength
      : 0;
  if (kind === "hat-fringe") return sample.label === "hair" ? strength : 0;
  return sample.label === "background" || sample.label === "hair"
    ? strength
    : 0;
}
