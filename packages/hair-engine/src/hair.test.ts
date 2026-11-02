import { describe, it, expect } from "vitest";
import {
  HAIR_PALETTES,
  resolveHairGradient,
  recolorHairPixel,
  buildHairRoutine,
} from "./index";
describe("hair preference and colour engine", () => {
  it("smoothly moves from roots to tips for an ombre and preserves solid colour", () => {
    const ombre = HAIR_PALETTES.find((p) => p.mode === "ombre")!;
    expect(resolveHairGradient(ombre, 0).weight).toBe(0);
    expect(resolveHairGradient(ombre, 1).weight).toBe(1);
    expect(resolveHairGradient(HAIR_PALETTES[0], 1).weight).toBe(0);
  });
  it("does not alter pixels outside the hair mask and keeps outputs bounded", () => {
    const rgb: [number, number, number] = [0.1, 0.2, 0.3];
    expect(recolorHairPixel(rgb, 0, HAIR_PALETTES[2], 0.5)).toEqual(rgb);
    expect(
      recolorHairPixel(rgb, 1, HAIR_PALETTES[2], 0.5).every(
        (v) => v >= 0 && v <= 1,
      ),
    ).toBe(true);
  });
  it("builds user-reported hair care without a diagnosis or a compulsory wash frequency", () => {
    const result = buildHairRoutine({
      texture: "coily",
      colorTreated: true,
      goals: ["definition"],
    });
    expect(result.steps.map((s) => s.id)).toEqual([
      "cleanse",
      "condition",
      "style",
      "color-care",
    ]);
    expect(result.steps[0].frequency).toBe("Your preferred wash day");
    expect(result.notes[0]).toContain("has not diagnosed");
  });
});
