import { describe, it, expect } from "vitest";
import { projectAccessoryAnchors, accessoryAnchorStatus } from "./accessories";
import {
  createDefaultLook,
  normalizeLook,
  accessoryVisionRequirements,
} from "../../makeup-engine/src";
import type { PoseFrame } from "../../pose-tracking/src";
const hand = () => {
  const p = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  p[0] = { x: 0.5, y: 0.7, z: 0 };
  p[5] = { x: 0.42, y: 0.55, z: 0 };
  p[17] = { x: 0.58, y: 0.55, z: 0 };
  p[9] = { x: 0.5, y: 0.5, z: 0 };
  p[13] = { x: 0.54, y: 0.49, z: 0 };
  p[14] = { x: 0.55, y: 0.4, z: 0 };
  return { landmarks: p, confidence: 0.97 };
};
const pose = (): PoseFrame => ({
  landmarks: Array.from({ length: 33 }, (_, i) => ({
    x: i % 2 ? 0.35 : 0.65,
    y: i === 15 || i === 16 ? 0.7 : 0.4,
    z: 0,
    visibility: 0.9,
  })),
  timestamp: 1,
  source: "mediapipe-pose-lite",
});
describe("confidence-aware accessory projections (synthetic geometry unit fixtures, not model accuracy)", () => {
  it("ring follows translated tracked fingers and scales with source resolution", () => {
    const h = hand();
    const a = projectAccessoryAnchors({ hands: [h] }, 600, 900);
    expect(a.rings).toHaveLength(1);
    expect(a.wrists).toHaveLength(1);
    const moved = {
      ...h,
      landmarks: h.landmarks.map((p) => ({ ...p, x: p.x + 0.1 })),
    };
    const b = projectAccessoryAnchors({ hands: [moved] }, 600, 900);
    expect(b.rings[0].x - a.rings[0].x).toBeCloseTo(60);
    const doubled = projectAccessoryAnchors({ hands: [h] }, 1200, 1800);
    expect(doubled.rings[0].width).toBeCloseTo(a.rings[0].width * 2);
  });
  it("never invents finger rings when only pose or low-support hands exist", () => {
    expect(projectAccessoryAnchors({ pose: pose() }, 600, 900).rings).toEqual(
      [],
    );
    expect(
      projectAccessoryAnchors(
        { hands: [{ ...hand(), confidence: 0.1 }] },
        600,
        900,
      ).wrists,
    ).toEqual([]);
  });
  it("rejects out-of-frame or invisible pose wrists", () => {
    const p = pose();
    p.landmarks[15].x = 1.4;
    p.landmarks[16].visibility = 0.1;
    expect(projectAccessoryAnchors({ pose: p }, 600, 900).wrists).toEqual([]);
  });
  it("exposes missing anchors truthfully and preserves legacy three-key looks", () => {
    const l = createDefaultLook();
    l.accessories.watch = true;
    const status = accessoryAnchorStatus(l.accessories, {});
    expect(status[0].available).toBe(false);
    expect(
      normalizeLook({
        accessories: { glasses: true, earrings: false, necklace: false },
      }).accessories,
    ).toEqual({ glasses: true, earrings: false, necklace: false });
    expect(
      normalizeLook({ accessories: { ring: true, watch: "true" } }).accessories
        .ring,
    ).toBe(true);
    expect(
      normalizeLook({ accessories: { ring: true, watch: "true" } }).accessories
        .watch,
    ).toBe(false);
    expect(accessoryVisionRequirements({ watch: true })).toMatchObject({
      body: true,
      pose: true,
      hands: true,
    });
  });
});
