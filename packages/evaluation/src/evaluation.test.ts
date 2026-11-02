import { describe, it, expect } from "vitest";
import {
  binaryMaskMetrics,
  registeredLandmarkMotion,
  summarize,
  summarizeCoverage,
  predictionRunDelta,
} from "./index";
describe("honest model evaluation", () => {
  it("computes foreground overlap and does not award perfect empty scores", () => {
    expect(binaryMaskMetrics([1, 1, 0, 0], [1, 0, 1, 0])).toMatchObject({
      iou: 1 / 3,
      dice: 0.5,
      intersection: 1,
      union: 3,
    });
    expect(binaryMaskMetrics([0, 0], [0, 0])).toMatchObject({
      iou: null,
      dice: null,
      reason: "both-empty",
    });
    expect(() => binaryMaskMetrics([NaN], [1])).toThrow();
    expect(() => binaryMaskMetrics([1, 0], [1])).toThrow();
  });
  it("reports real sample percentiles with empty/null and filters invalid timings", () => {
    expect(summarize([]).median).toBeNull();
    expect(summarize([3, 1, 2, NaN, -1])).toMatchObject({
      count: 3,
      median: 2,
      mean: 2,
      p95: 2.9,
    });
  });
  it("registers translation rotation and scale while retaining genuine point displacement", () => {
    const frame = Array.from({ length: 478 }, (_, i) => ({
      x: 0.1 + (i % 19) / 30,
      y: 0.2 + Math.floor(i / 19) / 35,
    }));
    frame[33] = { x: 0.2, y: 0.3 };
    frame[263] = { x: 0.7, y: 0.3 };
    const moved = frame.map((p) => ({ x: 1.2 * -p.y + 2, y: 1.2 * p.x + 3 }));
    expect(
      registeredLandmarkMotion([frame, moved]).eyeDistanceUnits.max,
    ).toBeLessThan(1e-12);
    moved[1].x += 0.04;
    expect(
      registeredLandmarkMotion([frame, moved]).eyeDistanceUnits.mean,
    ).toBeGreaterThan(0.01);
  });
  it("refuses fairness completion from synthetic or unlabelled benchmark samples", () => {
    const result = summarizeCoverage(
      Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        groupLabel: i < 25 ? "Group A" : "Group B",
        groupingSource: "fixture-defined",
        evidence: "synthetic-ground-truth",
        rightsBasis: "synthetic",
        metric: "mask-iou",
        unit: "ratio",
        value: 1,
      })),
    );
    expect(result.status).toBe("insufficient-ground-truth");
    expect(result.fairnessValidated).toBe(false);
  });
  it("describes genuine annotated coverage without converting it into a fairness pass", () => {
    const samples = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      groupLabel: i < 20 ? "Self-described A" : "Self-described B",
      groupingSource: "self-reported",
      evidence: "annotated-image",
      sourceId: `annotation-${i}`,
      rightsBasis: "self-captured-with-consent",
      metric: "mask-iou",
      unit: "ratio",
      value: i < 20 ? 0.9 : 0.7,
    }));
    const result = summarizeCoverage(samples);
    expect(result.status).toBe("descriptive-coverage-only");
    expect(result.fairnessValidated).toBe(false);
    expect(result.groups[0].annotated).toBe(20);
    expect(() => summarizeCoverage([{ ...samples[0], value: 1.5 }])).toThrow();
  });
  it("does not count repeated metric records as additional annotated people or images", () => {
    const records = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      sourceId: i < 20 ? "only-A" : "only-B",
      groupLabel: i < 20 ? "A" : "B",
      groupingSource: "self-reported",
      evidence: "annotated-image",
      rightsBasis: "self-captured-with-consent",
      metric: "mask-iou",
      unit: "ratio",
      value: 0.9,
    }));
    const result = summarizeCoverage(records);
    expect(result.groups.map((g) => g.annotated)).toEqual([1, 1]);
    expect(result.status).toBe("insufficient-ground-truth");
    expect(() => summarizeCoverage([records[0], records[0]])).toThrow(/unique/);
  });
  it("requires comparable units and refuses accuracy values without ground truth", () => {
    const sample = {
      id: "one",
      groupingSource: "unlabelled",
      evidence: "unlabelled-benchmark",
      rightsBasis: "unverified",
      metric: "landmark-error",
      unit: "eye-distance",
      value: null,
    };
    expect(summarizeCoverage([sample]).groups[0].metrics[0].values.count).toBe(
      0,
    );
    expect(() => summarizeCoverage([{ ...sample, value: 0.1 }])).toThrow();
    expect(() => summarizeCoverage([{ ...sample, unit: "ratio" }])).toThrow();
  });
  it("counts actual scheduled predictions instead of merely processed video snapshots", () => {
    expect(
      predictionRunDelta({ face: 3, hair: 1 }, { face: 3, hair: 1 }).total,
    ).toBe(0);
    expect(
      predictionRunDelta({ face: 3, hair: 1 }, { face: 4, hair: 1 }),
    ).toMatchObject({ runs: { face: 1, hair: 0 }, total: 1, reset: false });
    expect(predictionRunDelta({ face: 9 }, { face: 2 })).toMatchObject({
      runs: { face: 2 },
      total: 2,
      reset: true,
    });
    expect(() => predictionRunDelta(undefined, { face: NaN })).toThrow();
  });
});
