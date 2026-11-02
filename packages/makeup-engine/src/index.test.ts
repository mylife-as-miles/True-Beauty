import { describe, it, expect } from "vitest";
import {
  normalizeLook,
  createDefaultLook,
  LOOK_PRESETS,
  MAKEUP_LAYERS,
} from "./index";
describe("Look Composer contract", () => {
  it("preserves every cosmetic layer as a separately editable value", () => {
    const look = createDefaultLook();
    expect(MAKEUP_LAYERS).toHaveLength(12);
    for (const name of MAKEUP_LAYERS) {
      expect(look[name].opacity).toBeGreaterThanOrEqual(0);
      expect(look[name].opacity).toBeLessThanOrEqual(1);
      expect(look[name].color).toMatch(/^#[\da-f]{6}$/i);
    }
    expect(look.reshape).toBe(0);
    expect(look.hair.enabled).toBe(false);
  });
  it("rejects malformed imported colors, nonfinite opacity, executable fields and excessive warp", () => {
    const look = normalizeLook({
      lipstick: {
        color: "url(javascript:evil())",
        opacity: NaN,
        enabled: true,
        finish: "x",
      },
      reshape: 200,
      hair: { opacity: -5, color: "#123456", mode: "ombre" },
      accessories: { glasses: true, earrings: "true" },
    });
    expect(look.lipstick.color).toBe("#A45356");
    expect(look.lipstick.opacity).toBe(0.55);
    expect(look.reshape).toBe(1);
    expect(look.hair.opacity).toBe(0);
    expect(look.accessories.earrings).toBe(false);
  });
  it("presets are independent structures and survive normalization", () => {
    expect(new Set(LOOK_PRESETS.map((p) => p.id)).size).toBe(
      LOOK_PRESETS.length,
    );
    for (const preset of LOOK_PRESETS)
      expect(normalizeLook(preset.look)).toEqual(preset.look);
    const look = createDefaultLook();
    look.lipstick.color = "#000000";
    expect(createDefaultLook().lipstick.color).toBe("#A45356");
    expect(LOOK_PRESETS[0].look.lipstick.color).toBe("#A45356");
  });
});
