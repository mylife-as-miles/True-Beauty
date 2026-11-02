/** Numeric pigment stage shared in behavior with GLSL; reflective finishes follow it. */
export interface PreparedPigmentLayer {
  index: number;
  opacity: number;
  matte: boolean;
  rgb: readonly number[];
  pigmentScale: number;
  mask: Uint8ClampedArray;
  channel: number;
}
export function applyPigments(
  data: Uint8ClampedArray,
  layers: readonly PreparedPigmentLayer[],
): void {
  for (let j = 0; j < data.length; j += 4) {
    let r = data[j] / 255,
      g = data[j + 1] / 255,
      b = data[j + 2] / 255;
    for (const l of layers) {
      let alpha = Math.min(
        1,
        Math.max(0, (l.mask[j + l.channel] / 255) * l.opacity),
      );
      if (alpha < 0.001) continue;
      const light = r * 0.2126 + g * 0.7152 + b * 0.0722,
        gain = (0.35 + 0.65 * light) * l.pigmentScale;
      let tr = Math.min(1, l.rgb[0] * gain),
        tg = Math.min(1, l.rgb[1] * gain),
        tb = Math.min(1, l.rgb[2] * gain);
      if (l.index === 3) {
        alpha *= 0.9;
        tr = r * 0.76 + l.rgb[0] * 0.24;
        tg = g * 0.76 + l.rgb[1] * 0.24;
        tb = b * 0.76 + l.rgb[2] * 0.24;
      }
      if (l.index === 4 || l.index === 5 || l.index === 6 || l.index === 10) {
        tr = r * l.rgb[0];
        tg = g * l.rgb[1];
        tb = b * l.rgb[2];
      }
      if (l.index === 11) alpha *= 0.2;
      r += (tr - r) * alpha;
      g += (tg - g) * alpha;
      b += (tb - b) * alpha;
      if (l.matte && (l.index === 0 || l.index === 3)) {
        const t = Math.max(0, Math.min(1, (light - 0.35) / 0.45)),
          scale = 1 - t * t * (3 - 2 * t) * alpha * 0.075;
        r *= scale;
        g *= scale;
        b *= scale;
      }
    }
    data[j] = r * 255;
    data[j + 1] = g * 255;
    data[j + 2] = b * 255;
  }
}
