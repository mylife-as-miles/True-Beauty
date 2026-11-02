import { describe, it, expect } from "vitest";
import { decodeBodyMasks } from "../../body-segmentation/src";
import {
  maskPredictionAgreement,
  summarizeValidationCoverage,
} from "./validation";
describe("validation metrics cannot silently become fairness/accuracy claims", () => {
  it("refuses unaligned mask comparisons and labels identical prediction agreement honestly", () => {
    const a = decodeBodyMasks(
      Array.from({ length: 6 }, (_, c) => new Float32Array([c === 3 ? 1 : 0])),
      1,
      1,
      0,
    );
    expect(maskPredictionAgreement(a, a, 3, false).available).toBe(false);
    expect(maskPredictionAgreement(a, a, 3, true)).toMatchObject({
      iou: 1,
      interpretation:
        "Prediction agreement, not ground-truth segmentation accuracy.",
    });
  });
  it("excludes non-consented local cases and never labels convenience groups fair", () => {
    const result = summarizeValidationCoverage([
      {
        fixtureId: "private",
        source: "consented-local",
        consented: false,
        group: "self-reported",
        deviceLabel: "phone",
        faceAvailable: true,
        poseAvailable: true,
        bodyAvailable: true,
      },
      {
        fixtureId: "public",
        source: "public-evaluation",
        consented: false,
        deviceLabel: "headless browser",
        faceAvailable: false,
        poseAvailable: true,
        bodyAvailable: true,
      },
    ]);
    expect(result.eligibleSamples).toBe(1);
    expect(result.excludedWithoutConsent).toBe(1);
    expect(result.groups).toEqual({ unlabelled: 1 });
    expect(result.fairnessStatus).toBe("unverified");
  });
});
