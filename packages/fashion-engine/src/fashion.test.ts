import { describe, it, expect } from "vitest";
import { rankColourways, colourTemp, deltaE } from "./colourways";
import { seasonDef, rgbToLab, hexToRgb } from "../../skin-engine/src/color";
import { remapLightness } from "./lightness";
import { recolorPixels } from "./recolor";
import { accessoryAnchor, coordinateOutfit, sampleGarmentImage } from "./index";
describe("MIROIR fabric colour matching adaptation", () => {
  it("preserves source colourway regression examples and transparent empty results", () => {
    expect(colourTemp("#c4a27a")).toBe("warm");
    expect(colourTemp("#1f2a4a")).toBe("cool");
    expect(colourTemp("#808080")).toBe("neutral");
    expect(
      deltaE(rgbToLab(hexToRgb("#000000")), rgbToLab(hexToRgb("#ffffff"))),
    ).toBeCloseTo(100, 0);
    const result = rankColourways(
      [
        { id: "icy", name: "icy lilac", hex: "#d8d0f0" },
        { id: "choc", name: "chocolate", hex: "#5c3b2b" },
      ],
      seasonDef("deep-autumn").palette,
    );
    expect(result[0].colourway.id).toBe("choc");
    expect(result[0].reason).toContain("ΔE");
    expect(rankColourways([], [])).toEqual([]);
  });
  it("only applies colour avoidance by explicit preference, not skin inference", () => {
    const ways = [{ id: "rust", name: "rust", hex: "#9a4a2a" }],
      palette = seasonDef("deep-autumn").palette;
    expect(rankColourways(ways, palette)[0].redFlag).toBe(false);
    expect(
      rankColourways(ways, palette, { avoidRedNearFace: true })[0].reason,
    ).toContain("You asked");
    expect(() => coordinateOutfit(["not a colour"], "true-winter")).toThrow();
  });
  it("remaps garment brightness while retaining folds instead of flattening shadows", () => {
    expect(remapLightness(0.6, 0.6, 0.2)).toBeCloseTo(0.2);
    expect(remapLightness(0.3, 0.3, 0.8)).toBeCloseTo(0.8);
    expect(remapLightness(0.3, 0.6, 0.2)).toBeGreaterThan(0.05);
    expect(remapLightness(0.4, 0.6, 0.2)).toBeLessThan(
      remapLightness(0.8, 0.6, 0.2),
    );
  });
  it("recolours only a supplied mask and preserves alpha/background and source buffer", () => {
    const input = new Uint8ClampedArray([
      80, 80, 80, 255, 180, 180, 180, 255, 255, 255, 255, 255,
    ]);
    const output = recolorPixels(input, "#8a3434", {
      mask: new Uint8Array([255, 255, 0]),
    });
    expect(output[0]).toBeGreaterThan(output[1]);
    expect(output[4]).toBeGreaterThan(output[0]);
    expect([...output.slice(8)]).toEqual([255, 255, 255, 255]);
    expect([...input.slice(0, 4)]).toEqual([80, 80, 80, 255]);
    expect(() =>
      recolorPixels(input, "#ffffff", { mask: new Uint8Array(1) }),
    ).toThrow();
  });
  it("does not fabricate missing body or hand anchors", () => {
    expect(accessoryAnchor([], "glasses")).toBeNull();
    const face = Array.from({ length: 468 }, (_, i) => ({
      x: (i % 20) / 20,
      y: Math.floor(i / 20) / 25,
    }));
    expect(accessoryAnchor(face, "shoes")).toBeNull();
    expect(accessoryAnchor(face, "glasses")?.tracking).toBe("face");
    expect(accessoryAnchor(face.slice(0, 21), "ring", "hand")?.tracking).toBe(
      "hand",
    );
    expect(decodeURIComponent(sampleGarmentImage())).toContain("<svg");
  });
});
