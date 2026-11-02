import { z } from "zod";

export interface Distribution {
  count: number;
  min: number | null;
  median: number | null;
  p90: number | null;
  p95: number | null;
  max: number | null;
  mean: number | null;
}
export function summarize(values: readonly number[]): Distribution {
  const v = values
    .filter(Number.isFinite)
    .filter((n) => n >= 0)
    .slice()
    .sort((a, b) => a - b);
  if (!v.length)
    return {
      count: 0,
      min: null,
      median: null,
      p90: null,
      p95: null,
      max: null,
      mean: null,
    };
  const percentile = (p: number) => {
    const x = (v.length - 1) * p,
      lo = Math.floor(x),
      hi = Math.ceil(x);
    return v[lo] + (v[hi] - v[lo]) * (x - lo);
  };
  return {
    count: v.length,
    min: v[0],
    median: percentile(0.5),
    p90: percentile(0.9),
    p95: percentile(0.95),
    max: v.at(-1)!,
    mean: v.reduce((a, b) => a + b, 0) / v.length,
  };
}

/** A real prediction/reference comparison. Empty foreground is undefined, not a perfect score. */
export function binaryMaskMetrics(
  predicted: ArrayLike<number>,
  reference: ArrayLike<number>,
  threshold = 0.5,
) {
  if (
    predicted.length !== reference.length ||
    predicted.length === 0 ||
    predicted.length > 16_000_000
  )
    throw new Error("Masks must have equal nonempty bounded dimensions.");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Threshold must be between zero and one.");
  let intersection = 0,
    union = 0,
    predictedPositive = 0,
    referencePositive = 0;
  for (let i = 0; i < predicted.length; i++) {
    const p = predicted[i],
      r = reference[i];
    if (
      !Number.isFinite(p) ||
      !Number.isFinite(r) ||
      p < 0 ||
      p > 1 ||
      r < 0 ||
      r > 1
    )
      throw new Error("Mask values must be normalized finite values.");
    const a = p >= threshold,
      b = r >= threshold;
    if (a) predictedPositive++;
    if (b) referencePositive++;
    if (a && b) intersection++;
    if (a || b) union++;
  }
  return {
    iou: union ? intersection / union : null,
    dice:
      predictedPositive + referencePositive
        ? (2 * intersection) / (predictedPositive + referencePositive)
        : null,
    intersection,
    union,
    predictedPositive,
    referencePositive,
    reason: union ? "measured" : "both-empty",
  } as const;
}
export interface Point {
  x: number;
  y: number;
}
/** Similarity-register each frame against eye corners. Residual motion is not ground-truth tracking error. */
export function registeredLandmarkMotion(
  frames: readonly (readonly Point[])[],
  indices: readonly number[] = [1, 4, 33, 133, 168, 263, 362],
) {
  const aligned: Array<Array<Point>> = [];
  for (const frame of frames) {
    const left = frame[33],
      right = frame[263];
    if (
      !left ||
      !right ||
      ![left.x, left.y, right.x, right.y].every(Number.isFinite)
    )
      continue;
    const dx = right.x - left.x,
      dy = right.y - left.y,
      distance = Math.hypot(dx, dy);
    if (distance < 0.0001) continue;
    const cos = dx / distance,
      sin = dy / distance,
      points: Point[] = [];
    for (const index of indices) {
      const p = frame[index];
      if (!p || ![p.x, p.y].every(Number.isFinite)) {
        points.length = 0;
        break;
      }
      const x = (p.x - left.x) / distance,
        y = (p.y - left.y) / distance;
      points.push({ x: x * cos + y * sin, y: -x * sin + y * cos });
    }
    if (points.length === indices.length) aligned.push(points);
  }
  const samples: number[] = [];
  for (let t = 1; t < aligned.length; t++) {
    let square = 0;
    for (let i = 0; i < indices.length; i++)
      square +=
        (aligned[t][i].x - aligned[t - 1][i].x) ** 2 +
        (aligned[t][i].y - aligned[t - 1][i].y) ** 2;
    samples.push(Math.sqrt(square / indices.length));
  }
  return {
    validFrames: aligned.length,
    pairs: samples.length,
    eyeDistanceUnits: summarize(samples),
    interpretation:
      "Residual registered landmark motion. Without known motion/annotations this is not tracking-error accuracy.",
  };
}

export const EvaluationSampleSchema = z
  .object({
    id: z.string().min(1).max(100),
    sourceId: z.string().min(1).max(100).optional(),
    groupLabel: z.string().min(1).max(60).optional(),
    groupingSource: z.enum(["self-reported", "fixture-defined", "unlabelled"]),
    evidence: z.enum([
      "synthetic-ground-truth",
      "annotated-image",
      "unlabelled-benchmark",
    ]),
    rightsBasis: z.enum([
      "self-captured-with-consent",
      "public-licensed",
      "synthetic",
      "unverified",
    ]),
    metric: z.enum(["mask-iou", "landmark-error"]),
    unit: z.enum(["ratio", "eye-distance"]),
    value: z.number().finite().nonnegative().nullable(),
  })
  .strict()
  .superRefine((sample, ctx) => {
    if (sample.evidence === "annotated-image" && !sample.sourceId)
      ctx.addIssue({
        code: "custom",
        message:
          "Annotated evidence needs a sourceId so repeated metrics cannot inflate image coverage.",
        path: ["sourceId"],
      });
    if (
      sample.evidence === "annotated-image" &&
      sample.rightsBasis === "synthetic"
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Synthetic fixtures cannot claim annotated real-image coverage.",
        path: ["rightsBasis"],
      });
    if (
      (sample.metric === "mask-iou" && sample.unit !== "ratio") ||
      (sample.metric === "landmark-error" && sample.unit !== "eye-distance")
    )
      ctx.addIssue({
        code: "custom",
        message: "Metric unit must match the defined normalized measurement.",
        path: ["unit"],
      });
    if (sample.evidence === "unlabelled-benchmark" && sample.value !== null)
      ctx.addIssue({
        code: "custom",
        message:
          "An unlabelled benchmark cannot claim a ground-truth accuracy value.",
        path: ["value"],
      });
    if (sample.evidence !== "unlabelled-benchmark" && sample.value === null)
      ctx.addIssue({
        code: "custom",
        message: "Ground-truth metric evidence needs a numeric value.",
        path: ["value"],
      });
    if (
      sample.metric === "mask-iou" &&
      sample.value !== null &&
      sample.value > 1
    )
      ctx.addIssue({
        code: "custom",
        message: "IoU cannot exceed one.",
        path: ["value"],
      });
    if (sample.groupingSource === "unlabelled" && sample.groupLabel)
      ctx.addIssue({
        code: "custom",
        message: "An unlabelled sample cannot claim a group.",
        path: ["groupLabel"],
      });
  });
export type EvaluationSample = z.infer<typeof EvaluationSampleSchema>;
export function summarizeCoverage(input: unknown, minimumPerGroup = 20) {
  const samples = z.array(EvaluationSampleSchema).max(10000).parse(input);
  if (
    !Number.isInteger(minimumPerGroup) ||
    minimumPerGroup < 2 ||
    minimumPerGroup > 1000
  )
    throw new Error("Group minimum must be an integer from 2 to 1000.");
  if (new Set(samples.map((s) => s.id)).size !== samples.length)
    throw new Error("Evaluation record IDs must be unique.");
  const sourceGroups = new Map<string, string>();
  for (const sample of samples) {
    if (!sample.sourceId) continue;
    const label = sample.groupLabel ?? "Unlabelled";
    const existing = sourceGroups.get(sample.sourceId);
    if (existing && existing !== label)
      throw new Error("A source cannot be counted in contradictory groups.");
    sourceGroups.set(sample.sourceId, label);
  }
  const groups = new Map<string, EvaluationSample[]>();
  for (const sample of samples) {
    const key = sample.groupLabel ?? "Unlabelled";
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  const rows = [...groups].map(([label, items]) => ({
    label,
    total: items.length,
    annotated: new Set(
      items
        .filter(
          (x) =>
            x.evidence === "annotated-image" && x.rightsBasis !== "unverified",
        )
        .map((x) => x.sourceId),
    ).size,
    synthetic: items.filter((x) => x.evidence === "synthetic-ground-truth")
      .length,
    metrics: [...new Set(items.map((x) => x.metric))].map((metric) => ({
      metric,
      unit: metric === "mask-iou" ? "ratio" : "eye-distance",
      values: summarize(
        items
          .filter((x) => x.metric === metric)
          .map((x) => x.value)
          .filter((x): x is number => x !== null),
      ),
    })),
  }));
  const labelled = rows.filter((r) => r.label !== "Unlabelled");
  const adequatelyCovered =
    labelled.length >= 2 &&
    labelled.every((r) => r.annotated >= minimumPerGroup);
  return {
    sampleCount: samples.length,
    minimumPerGroup,
    groups: rows,
    status: adequatelyCovered
      ? "descriptive-coverage-only"
      : "insufficient-ground-truth",
    fairnessValidated: false,
    limitations: [
      ...(adequatelyCovered
        ? []
        : [
            "At least two user-labelled groups need the stated minimum of licensed/consented annotated images.",
          ]),
      ...(samples.some((s) => s.evidence === "synthetic-ground-truth")
        ? [
            "Synthetic fixture checks validate metric arithmetic, not representative-person fairness.",
          ]
        : []),
      "Group labels are user-provided, never inferred from selfie colour.",
      "Coverage and group means alone do not establish fairness, model accuracy or clinical validity.",
    ],
  };
}

/** Scheduler run deltas, rather than processed-frame counters, identify actual video predictions. */
export function predictionRunDelta(
  previous: Readonly<Record<string, number>> | undefined,
  current: Readonly<Record<string, number>>,
) {
  const runs: Record<string, number> = {};
  let reset = false;
  for (const [feature, count] of Object.entries(current)) {
    const before = previous?.[feature] ?? 0;
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      !Number.isInteger(before) ||
      before < 0
    )
      throw new Error("Prediction counters must be nonnegative integers.");
    if (count < before) reset = true;
    runs[feature] = count < before ? count : count - before;
  }
  return { runs, total: Object.values(runs).reduce((a, b) => a + b, 0), reset };
}
