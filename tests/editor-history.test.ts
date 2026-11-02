import { beforeEach, describe, it, expect, vi } from "vitest";
import { useApp, DEFAULT_LIGHTING } from "../apps/web/src/state/store";
import { createDefaultLook } from "../packages/makeup-engine/src";
import type { VisionSnapshot } from "../packages/vision-core/src";
beforeEach(() => {
  useApp.setState({
    look: createDefaultLook(),
    lookName: "Your signature look",
    lighting: structuredClone(DEFAULT_LIGHTING),
    past: [],
    future: [],
    editStart: null,
    portraitVision: null,
    portraitUrl: "/images/portrait-neutral.jpg",
    portraitProvenance: null,
    originalPortraitUrl: null,
    activeOutfitId: null,
    activeProductIds: [],
  });
});
describe("editable mirror continuity", () => {
  it("retains prepared hair across a same-source face-only refresh, but clears explicit errors and rejects stale sources", () => {
    const snapshot: VisionSnapshot = {
      landmarks: [{ x: 0.4, y: 0.5, z: 0 }],
      blendshapes: {},
      transform: null,
      hairMask: {
        width: 1,
        height: 1,
        confidence: new Float32Array([0.8]),
        data: new Float32Array([0.8]),
        timestamp: 1,
      },
      hands: [],
      timestamp: 1,
      latencyMs: 1,
      inferenceCount: 1,
      status: {
        face: { state: "ready" },
        hair: { state: "ready" },
        hands: { state: "idle" },
      },
    };
    const source = useApp.getState().portraitUrl;
    useApp.getState().setPortraitVision(source, snapshot);
    const partial = structuredClone(snapshot);
    partial.hairMask = null;
    partial.status.hair = { state: "idle" };
    partial.landmarks[0].x = 0.6;
    useApp.getState().setPortraitVision(source, partial);
    expect(useApp.getState().portraitVision?.snapshot.landmarks[0].x).toBe(0.6);
    expect(
      useApp.getState().portraitVision?.snapshot.hairMask?.confidence[0],
    ).toBeCloseTo(0.8);
    partial.status.hair = { state: "error", error: "Fixture unavailable" };
    useApp.getState().setPortraitVision(source, partial);
    expect(useApp.getState().portraitVision?.snapshot.hairMask).toBeNull();
    useApp.getState().setPortraitUrl("/images/other.jpg");
    useApp.getState().setPortraitVision(source, snapshot);
    expect(useApp.getState().portraitVision).toBeNull();
  });
  it("does not associate an unrelated portrait as the original of a restored generated outfit", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    useApp.getState().setPortraitUrl("blob:unrelated");
    useApp.getState().setGeneratedPortrait(
      "blob:restored",
      {
        kind: "ai-generated",
        provider: "perfect-corp",
        feature: "clothing",
        createdAt: "2026-11-02T00:00:00.000Z",
      },
      { restored: true },
    );
    expect(useApp.getState().originalPortraitUrl).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:unrelated");
    useApp.getState().restoreOriginalPortrait();
    expect(useApp.getState().portraitUrl).toBe("/images/portrait-neutral.jpg");
    expect(useApp.getState().portraitProvenance).toBeNull();
    expect(revoke).toHaveBeenCalledWith("blob:restored");
    revoke.mockRestore();
  });
  it("reopens and undoes the complete composition atomically, without restoring a photo", () => {
    const initial = createDefaultLook();
    useApp.getState().setCompleteScene({
      activeOutfitId: "previous-outfit",
      activeProductIds: ["old-product"],
    });
    useApp.getState().clearEditHistory();
    const look = createDefaultLook();
    look.lipstick.color = "#943356";
    useApp.getState().applySavedLook({
      id: "saved",
      name: "Complete",
      look,
      createdAt: 1,
      updatedAt: 1,
      composition: {
        version: 1,
        source: "digital-twin",
        occasion: "Occasion",
        productIds: ["owned"],
        outfitId: "outfit",
        profileRevision: 1,
        lighting: {
          preset: "golden-hour",
          intensity: 0.6,
          direction: { x: 0.2, y: -0.4 },
        },
      },
    });
    expect(useApp.getState()).toMatchObject({
      activeOutfitId: "outfit",
      activeProductIds: ["owned"],
      lighting: { preset: "golden-hour" },
      look: { lipstick: { color: "#943356" } },
    });
    expect(useApp.getState().portraitUrl).toBe("/images/portrait-neutral.jpg");
    useApp.getState().undo();
    expect(useApp.getState()).toMatchObject({
      activeOutfitId: "previous-outfit",
      activeProductIds: ["old-product"],
      lighting: DEFAULT_LIGHTING,
      look: initial,
    });
    useApp.getState().redo();
    expect(useApp.getState().activeOutfitId).toBe("outfit");
  });
  it("rejects malformed composition without partially changing the scene", () => {
    useApp.getState().applySavedLook({
      id: "invalid",
      name: "Invalid",
      look: {},
      composition: {
        version: 1,
        source: "digital-twin",
        lighting: { intensity: Infinity },
      },
      createdAt: 1,
      updatedAt: 1,
    });
    expect(useApp.getState().past).toHaveLength(0);
    expect(useApp.getState().look).toEqual(createDefaultLook());
    expect(useApp.getState().toast).toMatch(/invalid composition/);
  });
  it("keeps the original photo usable across generated replacements, then releases both blobs on a new source", () => {
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const meta = {
      kind: "ai-generated" as const,
      provider: "perfect-corp" as const,
      feature: "hair" as const,
      createdAt: "2026-11-02T00:00:00.000Z",
    };
    useApp.getState().setPortraitUrl("blob:original");
    useApp.getState().setGeneratedPortrait("blob:first", meta);
    expect(revoke).not.toHaveBeenCalled();
    useApp.getState().setGeneratedPortrait("blob:first", meta);
    expect(revoke).not.toHaveBeenCalled();
    useApp.getState().setGeneratedPortrait("blob:second", meta);
    expect(revoke.mock.calls).toEqual([["blob:first"]]);
    useApp.getState().restoreOriginalPortrait();
    expect(useApp.getState()).toMatchObject({
      portraitUrl: "blob:original",
      portraitProvenance: null,
      originalPortraitUrl: null,
    });
    expect(revoke.mock.calls).toEqual([["blob:first"], ["blob:second"]]);
    useApp.getState().setGeneratedPortrait("blob:third", meta);
    useApp.getState().setPortraitUrl("/images/new.jpg");
    expect(revoke.mock.calls.slice(-2)).toEqual([
      ["blob:original"],
      ["blob:third"],
    ]);
    revoke.mockRestore();
  });
  it("undo restores a complete look and creative light, then redo reapplies it", () => {
    useApp.getState().patchLayer("lipstick", { color: "#792c48" });
    useApp.getState().setLighting({ preset: "golden-hour" });
    useApp.getState().undo();
    expect(useApp.getState().lighting.preset).toBe("neutral");
    expect(useApp.getState().look.lipstick.color).toBe("#792c48");
    useApp.getState().undo();
    expect(useApp.getState().look.lipstick.color).toBe(
      createDefaultLook().lipstick.color,
    );
    useApp.getState().redo();
    expect(useApp.getState().look.lipstick.color).toBe("#792c48");
  });
  it("groups a continuous slider gesture into one reversible edit", () => {
    const initial = useApp.getState().look.lipstick.opacity;
    useApp.getState().beginEdit();
    for (let i = 0; i < 30; i++)
      useApp.getState().patchLayer("lipstick", { opacity: i / 30 });
    useApp.getState().endEdit();
    expect(useApp.getState().past).toHaveLength(1);
    useApp.getState().undo();
    expect(useApp.getState().look.lipstick.opacity).toBe(initial);
  });
  it("reset makeup preserves hair and accessories and remains undoable", () => {
    useApp.getState().patchLayer("hair", { enabled: true, color: "#bb6633" });
    useApp.getState().patchLayer("accessories", { glasses: true });
    useApp.getState().clearMakeup();
    expect(useApp.getState().look.hair.enabled).toBe(true);
    expect(useApp.getState().look.accessories.glasses).toBe(true);
    expect(useApp.getState().look.lipstick.enabled).toBe(false);
    useApp.getState().undo();
    expect(useApp.getState().look.lipstick.enabled).toBe(true);
  });
  it("fresh edits discard redo; explicit history clearing leaves no recoverable old look", () => {
    useApp.getState().patchLayer("blush", { color: "#123456" });
    useApp.getState().undo();
    useApp.getState().patchLayer("eyeshadow", { color: "#654321" });
    expect(useApp.getState().future).toEqual([]);
    useApp.getState().clearEditHistory();
    expect(useApp.getState().past).toEqual([]);
    useApp.getState().undo();
    expect(useApp.getState().look.blush.color).not.toBe("#123456");
  });
  it("rejects snapshots for an obsolete source and keeps view state across spaces", () => {
    useApp.getState().setMirrorView({
      mirrorZoom: 1.45,
      mirrorCompare: true,
      mirrorSplit: 0.3,
    });
    useApp.getState().setSpace("discover");
    useApp.getState().setSpace("studio");
    expect(useApp.getState().mirrorZoom).toBe(1.45);
    expect(useApp.getState().mirrorCompare).toBe(true);
    useApp.getState().setPortraitVision("obsolete", {} as never);
    expect(useApp.getState().portraitVision).toBeNull();
  });
});
