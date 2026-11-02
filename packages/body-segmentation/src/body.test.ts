import { describe, it, expect } from "vitest";
import {
  decodeBodyMasks,
  BodyMaskSmoother,
  sampleBody,
  semanticOcclusion,
} from "./index";
const masks = (labels: number[]) =>
  Array.from({ length: 6 }, (_, c) =>
    Float32Array.from(labels, (x) => (x === c ? 0.95 : 0.01)),
  );
describe("real six-channel body output contract", () => {
  it("decodes categories and preserves buffer independence across task callbacks", () => {
    const raw = masks([0, 1, 2, 3, 4, 5]);
    const body = decodeBodyMasks(raw, 3, 2, 100);
    expect([...body.labels]).toEqual([0, 1, 2, 3, 4, 5]);
    raw[2][2] = 0;
    expect(body.confidence[2]).toBeCloseTo(0.95);
    expect(sampleBody(body, 1, 1)?.label).toBe("other");
    expect(sampleBody(body, -0.1, 0.5)).toBeNull();
  });
  it("rejects malformed dimensions and does not invent a person from invalid outputs", () => {
    expect(() => decodeBodyMasks(masks([0]), 2, 1, 0)).toThrow();
    const empty = decodeBodyMasks(
      Array.from({ length: 6 }, () => new Float32Array([NaN])),
      1,
      1,
      0,
    );
    expect(empty.person[0]).toBe(0);
    expect(empty.confidence[0]).toBe(0);
  });
  it("gates semantic occlusion and distinguishes source classes from depth", () => {
    expect(
      semanticOcclusion(
        { label: "body-skin", confidence: 0.95, person: 1 },
        "face-effect",
      ),
    ).toBe(1);
    expect(
      semanticOcclusion(
        { label: "face-skin", confidence: 0.95, person: 1 },
        "face-effect",
      ),
    ).toBe(0);
    expect(
      semanticOcclusion(
        { label: "background", confidence: 0.5, person: 0.5 },
        "body-accessory",
      ),
    ).toBe(0);
  });
  it("accepts confident new boundaries and resets after stale gaps", () => {
    const smoother = new BodyMaskSmoother();
    smoother.update(decodeBodyMasks(masks([1]), 1, 1, 100));
    const next = smoother.update(decodeBodyMasks(masks([2]), 1, 1, 350));
    expect(next.labels[0]).toBe(2);
    const old = smoother.update(decodeBodyMasks(masks([0]), 1, 1, 1500));
    expect(old.labels[0]).toBe(0);
  });
});
