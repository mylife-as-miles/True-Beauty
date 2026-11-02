/**
 * Adapted from MIROIR / SKIN_AI at f3c0661cb0594fff07e89c80fbe129e7e5bdffa5.
 * Copyright (c) 2026 MIROIR. MIT license: ../THIRD_PARTY_LICENSE.txt.
 * True Beauty modifications: shared engine imports, validated colours,
 * preference-based explanations, no medical or objective attractiveness claims.
 */
// Lightness remapping for garment recolouring (pure, unit-tested).
//
// A hue/saturation swap alone keeps the photo's lightness, so a khaki jacket
// "recoloured" to navy comes out powder blue. Instead each pixel's lightness is
// remapped so the garment's average lands on the target colour's lightness,
// while folds and highlights keep their relative depth:
//
//   darkening  -> scale toward black:  l' = l * (target / mean)
//   lightening -> scale toward white:  l' = 1 - (1 - l) * ((1 - target) / (1 - mean))
//
// Scaling (rather than adding a constant offset) is what stops shadows from
// clipping to flat black on a dark target, or highlights to flat white on a
// light one.

const MIN_L = 0.02;
const MAX_L = 0.97;

export function remapLightness(
  l: number,
  mean: number,
  target: number,
): number {
  let out: number;
  if (target <= mean) {
    out = mean <= 0 ? target : l * (target / mean);
  } else {
    out = mean >= 1 ? target : 1 - (1 - l) * ((1 - target) / (1 - mean));
  }
  return Math.min(MAX_L, Math.max(MIN_L, out));
}
