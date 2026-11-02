/**
 * Adapted from MIROIR / SKIN_AI at f3c0661cb0594fff07e89c80fbe129e7e5bdffa5.
 * Copyright (c) 2026 MIROIR. MIT license: ../THIRD_PARTY_LICENSE.txt.
 * True Beauty modifications: shared engine imports, validated colours,
 * preference-based explanations, no medical or objective attractiveness claims.
 */
import { remapLightness } from "./lightness";
export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

export interface RecolorOptions {
  mask?: Uint8Array;
  backgroundThreshold?: number;
}
/** Static garment recolouring; mask values 0-255. Does not infer garment boundaries. */
export function recolorPixels(
  input: Uint8ClampedArray,
  targetHex: string,
  options: RecolorOptions = {},
): Uint8ClampedArray {
  if (!/^#[0-9a-fA-F]{6}$/.test(targetHex))
    throw new Error("Invalid target colour");
  if (input.length % 4 !== 0) throw new Error("Expected an RGBA buffer");
  if (options.mask && options.mask.length !== input.length / 4)
    throw new Error("Mask dimensions differ");
  const px = input.slice();
  const [th, ts, tl] = hexToHsl(targetHex);
  const threshold = options.backgroundThreshold ?? 235;
  const included = (i: number) =>
    options.mask
      ? options.mask[i / 4] > 0
      : !(px[i] > threshold && px[i + 1] > threshold && px[i + 2] > threshold);
  const hist = new Uint32Array(256);
  let count = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (!included(i) || px[i + 3] === 0) continue;
    hist[Math.round(rgbToHsl(px[i], px[i + 1], px[i + 2])[2] * 255)]++;
    count++;
  }
  let median = 0.5;
  for (let bin = 0, seen = 0; bin < 256 && count; bin++) {
    seen += hist[bin];
    if (seen >= count / 2) {
      median = bin / 255;
      break;
    }
  }
  for (let i = 0; i < px.length; i += 4) {
    if (!included(i)) continue;
    const [, , lightness] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    const color = hslToRgb(th, ts, remapLightness(lightness, median, tl));
    const alpha = options.mask ? options.mask[i / 4] / 255 : 1;
    for (let c = 0; c < 3; c++)
      px[i + c] = Math.round(px[i + c] * (1 - alpha) + color[c] * alpha);
  }
  return px;
}
export function recolorGarment(
  image: HTMLImageElement,
  targetHex: string,
  mask?: Uint8Array,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(image, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  frame.data.set(recolorPixels(frame.data, targetHex, { mask }));
  ctx.putImageData(frame, 0, 0);
  return canvas;
}
