import { describe, it, expect } from "vitest";
import { rgbToLab, hexToRgb, analyzeSkinTone, rgbToHex } from "./color";
import { analyzeSeason } from "./season";
import { assessImageQuality } from "./quality";
import { clusterColors, sampleAppearance } from "./sampling";
import { parseProviderSkinResult, compareSkinResults } from "./provider";
describe("adapted MIROIR colour engine", () => {
  it("converts D65 reference white and black with known colorimetry", () => {
    const w = rgbToLab({ r: 255, g: 255, b: 255 });
    expect(w.L).toBeCloseTo(100, 1);
    expect(w.a).toBeCloseTo(0, 1);
    expect(w.b).toBeCloseTo(0, 1);
    expect(rgbToLab({ r: 0, g: 0, b: 0 }).L).toBe(0);
  });
  it("rejects malformed swatches rather than interpreting them as black", () => {
    expect(() => hexToRgb("invalid")).toThrow();
    expect(hexToRgb("#abc")).toEqual({ r: 170, g: 187, b: 204 });
  });
  it("returns finite descriptors across varied input complexions without inferring clinical phototype", () => {
    for (const hex of ["#f3d6c0", "#c99573", "#9b6951", "#5f3829", "#2e1b16"]) {
      const tone = analyzeSkinTone(hex);
      expect(tone.lab.L).toBeGreaterThan(0);
      expect(tone.ita).toBeTypeOf("number");
      expect(tone).not.toHaveProperty("fitzpatrick");
      expect(tone.palette.length).toBeGreaterThan(0);
    }
  });
  it("discloses exposure sensitivity across synthetic deep/light warm/cool colour fixtures", () => {
    for (const hex of ["#f3d6c0", "#ebc7d0", "#71462c", "#654252"]) {
      const base = hexToRgb(hex),
        lab = rgbToLab(base);
      for (const exposure of [0.5, 1.3]) {
        const changed = {
            r: Math.min(255, base.r * exposure),
            g: Math.min(255, base.g * exposure),
            b: Math.min(255, base.b * exposure),
          },
          adjusted = analyzeSkinTone(rgbToHex(changed));
        expect(Number.isFinite(adjusted.lab.L)).toBe(true);
        expect(Math.abs(adjusted.lab.L - lab.L)).toBeGreaterThan(2);
        if (exposure < 1) expect(adjusted.lab.L).toBeLessThan(lab.L);
        else expect(adjusted.lab.L).toBeGreaterThan(lab.L);
      }
    }
  });
  it("lowers season confidence when hair/eyes are not provided", () => {
    const a = analyzeSeason({ skin: "#c99573" }),
      b = analyzeSeason({ skin: "#c99573", hair: "#31221b", eye: "#624333" });
    expect(a.confidence).toBeLessThan(b.confidence);
    expect(a.inputs.hair).toBe(false);
    expect(a.reasoning.join(" ")).toContain("skin only");
  });
});
describe("Skyn clustering migration and local suitability", () => {
  it("clusters dominant ROI colours deterministically without fixed complexion cutoff", () => {
    for (const p of [
      { r: 37, g: 24, b: 19 },
      { r: 230, g: 194, b: 170 },
    ]) {
      const result = clusterColors(
        [...Array.from({ length: 12 }, () => p), { r: 255, g: 255, b: 255 }],
        2,
      );
      expect(result[0].color).toEqual(p);
      expect(result[0].count).toBe(12);
    }
  });
  it("does not invent appearance sampling without a face", () => {
    expect(
      sampleAppearance({ width: 2, height: 2, data: new Uint8Array(16) }, [])
        .skin,
    ).toBeUndefined();
  });
  it("flags darkness, inadequate size and blur rather than assigning health scores", () => {
    const quality = assessImageQuality({
      width: 20,
      height: 20,
      data: new Uint8ClampedArray(1600),
    });
    expect(quality.suitable).toBe(false);
    expect(quality.issues.length).toBeGreaterThan(2);
    expect(quality).not.toHaveProperty("skinType");
  });
});
describe("genuine provider result interpretation", () => {
  it("retains dynamic, region-specific and unknown concerns without missing defaults", () => {
    const result = parseProviderSkinResult({
      data: {
        results: {
          output: [
            {
              type: "hd_pore",
              region: "nose",
              ui_score: 58,
              raw_score: 29.139,
              mask_urls: [
                "https://example.com/mask.png",
                "javascript:alert(1)",
              ],
            },
            { type: "new_concern", ui_score: 85 },
            { type: "skin_type", region: "whole", skin_type: "Dry" },
          ],
        },
      },
    });
    expect(result.observations).toHaveLength(3);
    expect(result.observations[0].uiScore).toBe(58);
    expect(result.observations[0].rawScore).toBe(29.139);
    expect(result.observations[0].maskUrls).toHaveLength(1);
    expect(result.observations[1].label).toBe("new concern");
    expect(result.overall).toBeUndefined();
  });
  it("parses nested HD score_info fixtures but never invents skin age", () => {
    const result = parseProviderSkinResult({
      hd_pore: {
        nose: { raw_score: 32, ui_score: 56 },
        whole: { raw_score: 50, ui_score: 68 },
      },
      all: 75,
      skin_age: 40,
    });
    expect(result.observations).toHaveLength(2);
    expect(result.observations.map((o) => o.region)).toEqual(["nose", "whole"]);
    expect(result.overall).toBe(75);
    expect(result).not.toHaveProperty("skinAge");
  });
  it("fails empty or malformed results explicitly", () => {
    expect(() => parseProviderSkinResult({ data: { results: [] } })).toThrow();
    expect(() =>
      parseProviderSkinResult({ output: [{ type: "pore", ui_score: 999 }] }),
    ).toThrow();
  });
  it("compares only like-for-like raw model fields and preserves uncertainty", () => {
    const a = parseProviderSkinResult({
      output: [{ type: "pore", raw_score: 30, ui_score: 60 }],
    });
    const b = parseProviderSkinResult({
      output: [
        { type: "pore", raw_score: 40, ui_score: 65 },
        { type: "texture", raw_score: 90, ui_score: 90 },
      ],
    });
    expect(compareSkinResults(a, b)).toHaveLength(1);
    expect(compareSkinResults(a, b)[0].change).toBe(10);
  });
});
