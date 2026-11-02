/** Image suitability checks, not measurements of skin health. */
export interface PixelImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}
export interface ImageQuality {
  suitable: boolean;
  meanLuminance: number;
  clippedFraction: number;
  sharpness: number;
  issues: string[];
  source: "local-pixel-check";
}
export function assessImageQuality(image: PixelImage): ImageQuality {
  const { width: w, height: h, data } = image;
  if (w < 2 || h < 2 || data.length < w * h * 4)
    throw new Error("Invalid image pixels.");
  const gray = new Float32Array(w * h);
  let sum = 0,
    clipped = 0;
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    const v = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
    gray[i] = v;
    sum += v;
    if (v < 5 || v > 250) clipped++;
  }
  let lapSum = 0,
    lapSquare = 0,
    n = 0;
  for (let y = 1; y < h - 1; y += 2)
    for (let x = 1; x < w - 1; x += 2) {
      const i = y * w + x;
      const l =
        gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      lapSum += l;
      lapSquare += l * l;
      n++;
    }
  const sharpness = n ? Math.max(0, lapSquare / n - (lapSum / n) ** 2) : 0;
  const meanLuminance = sum / gray.length;
  const clippedFraction = clipped / gray.length;
  const issues: string[] = [];
  if (Math.min(w, h) < 480)
    issues.push(
      "Use an image with a short side of at least 480 pixels for standard provider analysis.",
    );
  if (meanLuminance < 35)
    issues.push("The image is dark. Try even, indirect daylight.");
  if (meanLuminance > 230)
    issues.push(
      "The image is very bright. Avoid direct light or overexposure.",
    );
  if (clippedFraction > 0.2)
    issues.push("Large regions lose detail in very bright or dark pixels.");
  if (sharpness < 12)
    issues.push(
      "The image may be blurred or lack detail. Hold the camera steady.",
    );
  return {
    suitable: issues.length === 0,
    meanLuminance,
    clippedFraction,
    sharpness,
    issues,
    source: "local-pixel-check",
  };
}
