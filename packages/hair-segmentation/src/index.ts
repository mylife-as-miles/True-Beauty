export interface HairMask {
  width: number;
  height: number;
  confidence: Float32Array;
  data: Float32Array;
  timestamp: number;
}

/** Temporal confidence mask, retaining source texture for later rendering. */
export class HairMaskSmoother {
  private previous: HairMask | null = null;
  reset() {
    this.previous = null;
  }
  update(
    confidence: ArrayLike<number>,
    width: number,
    height: number,
    timestamp: number,
    retention = 0.45,
  ): HairMask {
    if (confidence.length !== width * height)
      throw new Error("Hair mask dimensions do not match the data");
    const old = this.previous;
    const canBlend =
      old &&
      old.width === width &&
      old.height === height &&
      timestamp - old.timestamp < 250 &&
      timestamp > old.timestamp;
    const data = Float32Array.from(confidence, (value, i) => {
      const current = Math.max(
        0,
        Math.min(1, Number.isFinite(value) ? value : 0),
      );
      return canBlend
        ? current * (1 - retention) + old.confidence[i] * retention
        : current;
    });
    this.previous = { width, height, confidence: data, data, timestamp };
    return this.previous;
  }
}

export function featherMask(
  input: Float32Array,
  width: number,
  height: number,
): Float32Array {
  if (input.length !== width * height)
    throw new Error("Invalid mask dimensions");
  const output = new Float32Array(input.length);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weight = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          sum += input[yy * width + xx] * w;
          weight += w;
        }
      output[y * width + x] = sum / weight;
    }
  return output;
}

/** Luminance-preserving tint adapted from Virtual Makeup's segmented mask blend.
 * The original binary additive tint is replaced by confidence-weighted shading.
 */
export function recolorHairPixel(
  source: readonly number[],
  target: readonly number[],
  confidence: number,
  intensity: number,
): number[] {
  const luma =
    (source[0] * 0.2126 + source[1] * 0.7152 + source[2] * 0.0722) / 255;
  const targetLuma = Math.max(
    0.02,
    (target[0] * 0.2126 + target[1] * 0.7152 + target[2] * 0.0722) / 255,
  );
  const amount = Math.max(0, Math.min(1, confidence * intensity));
  const shade = Math.min(1.6, (0.12 + luma * 0.88) / targetLuma);
  return source
    .slice(0, 3)
    .map((value, i) =>
      Math.round(
        Math.max(
          0,
          Math.min(
            255,
            value * (1 - amount) + Math.min(255, target[i] * shade) * amount,
          ),
        ),
      ),
    );
}
