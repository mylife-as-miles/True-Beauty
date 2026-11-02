import { beforeEach, describe, it, expect } from "vitest";
import { useApp, DEFAULT_LIGHTING } from "../apps/web/src/state/store";
import { createDefaultLook } from "../packages/makeup-engine/src";
beforeEach(() => {
  useApp.setState({
    look: createDefaultLook(),
    lookName: "Your signature look",
    lighting: structuredClone(DEFAULT_LIGHTING),
    past: [],
    future: [],
    editStart: null,
    portraitVision: null,
  });
});
describe("editable mirror continuity", () => {
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
    useApp
      .getState()
      .setMirrorView({
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
