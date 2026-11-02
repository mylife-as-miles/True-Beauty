import { describe, it, expect } from "vitest";
import { applyPigments, type PreparedPigmentLayer } from "./pigment";
function layer(
  hex: string,
  opacity: number,
  mask: Uint8ClampedArray,
  index = 0,
): PreparedPigmentLayer {
  const rgb = [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16) / 255),
    p = Math.max(0.12, rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722);
  return {
    index,
    rgb,
    opacity,
    matte: false,
    mask,
    channel: 0,
    pigmentScale: 1 / Math.sqrt(p + 0.08),
  };
}
describe("backend-consistent pigment stage", () => {
  it("preserves all unmasked source pixels, including mouth-hole pixels", () => {
    const pixels = new Uint8ClampedArray([
      124, 90, 62, 255, 240, 235, 230, 255,
    ]);
    const before = pixels.slice();
    applyPigments(pixels, [layer("#AE4C8B", 0.9, new Uint8ClampedArray(8))]);
    expect(pixels).toEqual(before);
  });
  it("retains purple chroma instead of multiplying it into the original brick-red lip", () => {
    const pixels = new Uint8ClampedArray([124, 67, 51, 255]);
    applyPigments(pixels, [
      layer("#AE4C8B", 0.9, new Uint8ClampedArray([255, 0, 0, 255])),
    ]);
    expect(pixels[2]).toBeGreaterThan(pixels[1] * 1.4);
    expect(pixels[0]).toBeGreaterThan(pixels[2]);
    expect(pixels[3]).toBe(255);
  });
  it("preserves local photographic texture and deterministic output", () => {
    const pixels = new Uint8ClampedArray([100, 70, 55, 255, 130, 100, 85, 255]),
      mask = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255]),
      original = pixels.slice();
    const l = layer("#AE4C8B", 0.65, mask);
    applyPigments(pixels, [l]);
    expect(pixels[4]).toBeGreaterThan(pixels[0]);
    expect(pixels[5]).toBeGreaterThan(pixels[1]);
    expect(pixels[6]).toBeGreaterThan(pixels[2]);
    const repeated = original.slice();
    applyPigments(repeated, [l]);
    expect(repeated).toEqual(pixels);
  });
});
