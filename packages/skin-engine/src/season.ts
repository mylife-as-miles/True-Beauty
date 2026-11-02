// Adapted from MIROIR/SKIN_AI, Copyright (c) 2026 MIROIR. MIT. See LICENSE.MIROIR.
// Source f3c0661cb0594fff07e89c80fbe129e7e5bdffa5.
// Twelve-tone seasonal colour analysis.
//
// This implements the dominance model used by trained personal-colour analysts
// (the Sci\ART / 12-tone lineage), rather than a lookup on skin alone.
//
// The system rests on three independent perceptual axes:
//
//   hue     warm  <-> cool     (undertone)
//   value   light <-> deep     (overall lightness)
//   chroma  bright <-> soft    (clarity / saturation, incl. feature contrast)
//
// A person's season is named for their *dominant* axis — the one on which they
// sit furthest from neutral — with the next-strongest axis breaking the tie:
//
//   dominant VALUE  + light  -> Light Spring (warm)  / Light Summer (cool)
//   dominant VALUE  + deep   -> Deep Autumn (warm)   / Deep Winter (cool)
//   dominant CHROMA + bright -> Bright Spring (warm) / Bright Winter (cool)
//   dominant CHROMA + soft   -> Soft Autumn (warm)   / Soft Summer (cool)
//   dominant HUE    + warm   -> True Spring (light)  / True Autumn (deep)
//   dominant HUE    + cool   -> True Summer (light)  / True Winter (deep)
//
// Crucially, value and chroma cannot be read from skin alone: hair drives
// perceived value more than skin does, and "bright" seasons are defined by high
// *contrast between* features, which is undefined with only one feature. When
// hair and eye colour are missing we say so and lower the reported confidence
// rather than inventing a precise answer.

import {
  hexToRgb,
  rgbToLab,
  chromaOf,
  itaOf,
  undertoneOf,
  depthOf,
  seasonDef,
  type Lab,
  type Season,
  type SkinTone,
} from "./color";

export type Axis = "hue" | "value" | "chroma";

export interface FeatureColors {
  /** Representative facial skin colour. Required. */
  skin: string;
  /** Hair colour. Strongly drives the value axis. */
  hair?: string;
  /** Iris colour. Weakest signal, but disambiguates hue. */
  eye?: string;
}

export interface AxisScore {
  /** -1 (cool / deep / soft) .. +1 (warm / light / bright). */
  score: number;
  /** How far from neutral, 0..1 — used to pick the dominant axis. */
  strength: number;
}

export interface SeasonAnalysis {
  season: Season;
  axes: Record<Axis, AxisScore>;
  /** The axis the season is named for. */
  dominant: Axis;
  /** 0..1. Falls sharply when hair/eye are missing or axes are ambiguous. */
  confidence: number;
  /** Which inputs were actually available. */
  inputs: { skin: boolean; hair: boolean; eye: boolean };
  /** Plain-language justification, one line per axis. */
  reasoning: string[];
}

// ---- feature measurement ---------------------------------------------------

interface Feature {
  lab: Lab;
  chroma: number;
  /** Hue angle in degrees, 0..360. Meaningless at very low chroma. */
  hueAngle: number;
  /**
   * How much to trust this feature's hue. Near-neutral colours (dark brown
   * hair, grey eyes) have a hue angle dominated by noise, so it is down-weighted
   * instead of being read as a confident undertone.
   */
  hueWeight: number;
}

function measure(hex: string): Feature {
  const lab = rgbToLab(hexToRgb(hex));
  const chroma = chromaOf(lab);
  const hueAngle = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { lab, chroma, hueAngle, hueWeight: Math.min(1, chroma / 15) };
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

// ---- axis 1: hue (warm <-> cool) ------------------------------------------

/**
 * Skin undertone. Uses the b*-a* gap, which is well-behaved for skin because
 * skin occupies a narrow, yellow-dominant region of Lab space.
 * Neutral sits at ~5; the usable range is roughly -10 (cool) to +20 (warm).
 */
function skinHue(f: Feature): number {
  return clamp((f.lab.b - f.lab.a - 5) / 10);
}

/**
 * Hair and eye undertone.
 *
 * Warmth in pigment is golden/red content, which in Lab is read directly off
 * b* (the yellow-blue axis) — ash and blue pigments sit at negative b*, golden
 * and copper ones high positive. a* is subtracted lightly so a pink-cool cast
 * pulls the reading cool without letting red hair (high a* AND high b*) flip.
 *
 * Deliberately NOT hue angle: with a* near zero the angle swings wildly, which
 * made a b*=+22 golden blonde read as "cool". Same class of error as applying
 * the skin-calibrated b*-a* gap to fabric.
 *
 * ~10 is the neutral point: most brown hair carries some yellow.
 */
function pigmentHue(f: Feature): number {
  const warmth = (f.lab.b - 0.3 * f.lab.a - 10) / 15;
  return clamp(warmth) * f.hueWeight;
}

// ---- axis 2: value (light <-> deep) ---------------------------------------

/**
 * Perceived overall lightness. Hair carries the most weight: it is the largest
 * high-contrast area around the face and is what makes someone read as "deep"
 * even on light skin.
 */
function valueAxis(skin: Feature, hair?: Feature, eye?: Feature): number {
  const parts: Array<[number, number]> = [[skin.lab.L, hair ? 0.35 : 1]];
  if (hair) parts.push([hair.lab.L, 0.45]);
  if (eye) parts.push([eye.lab.L, 0.2]);
  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  const meanL = parts.reduce((s, [l, w]) => s + l * w, 0) / totalW;
  // L* ~52 is the perceptual midpoint across the population; +-33 spans light
  // to deep without pinning ordinary light or deep colouring at the clamp.
  return clamp((meanL - 56) / 38);
}

// ---- axis 3: chroma (bright <-> soft) -------------------------------------

/** Reference chroma per lightness band, so "saturated" means the same thing
 *  at every depth (deep skin carries higher baseline chroma than light skin). */
function referenceChroma(L: number): number {
  if (L > 65) return 20;
  if (L > 45) return 32;
  return 26;
}

/**
 * Clarity. Two contributions:
 *  1. relative saturation of the features themselves, and
 *  2. the *contrast between* them — a Bright Winter is defined by dark hair
 *     against light skin against clear eyes, not by any single saturated
 *     feature. With only skin available this term is unavailable.
 */
function chromaAxis(
  skin: Feature,
  hair?: Feature,
  eye?: Feature,
): {
  score: number;
  hasContrast: boolean;
} {
  // Saturation is read from skin and eyes only, and taken as the MAX rather
  // than the mean. Hair is excluded deliberately: near-black hair is
  // achromatic by nature, and averaging it in dragged every high-contrast
  // Winter toward "soft" — the exact opposite of the truth, since Bright
  // Winter is *defined* by black hair against light skin.
  const chromatic = [skin, eye].filter(Boolean) as Feature[];
  const relative = Math.max(
    ...chromatic.map((f) => f.chroma / referenceChroma(f.lab.L)),
  );
  // Wide divisor: cool colouring carries inherently lower chroma than warm, so
  // an aggressive scale here double-counts the hue axis.
  const saturation = clamp((relative - 1) / 0.35);

  const feats = [skin, hair, eye].filter(Boolean) as Feature[];
  if (feats.length < 2) return { score: saturation, hasContrast: false };

  const ls = feats.map((f) => f.lab.L);
  const spread = Math.max(...ls) - Math.min(...ls);
  // ~35 L* of spread is average; 60+ reads as high-contrast/bright.
  const contrast = clamp((spread - 30) / 25);
  // Contrast carries the axis: bright-vs-soft is a relationship between
  // features, not a property of any single one.
  return {
    score: clamp(saturation * 0.35 + contrast * 0.65),
    hasContrast: true,
  };
}

// ---- classification --------------------------------------------------------

const SEASON_BY_DOMINANCE: Record<string, Season> = {
  "value:light:warm": "light-spring",
  "value:light:cool": "light-summer",
  "value:deep:warm": "deep-autumn",
  "value:deep:cool": "deep-winter",
  "chroma:bright:warm": "bright-spring",
  "chroma:bright:cool": "bright-winter",
  "chroma:soft:warm": "soft-autumn",
  "chroma:soft:cool": "soft-summer",
  "hue:warm:light": "true-spring",
  "hue:warm:deep": "true-autumn",
  "hue:cool:light": "true-summer",
  "hue:cool:deep": "true-winter",
};

export function analyzeSeason(features: FeatureColors): SeasonAnalysis {
  const skin = measure(features.skin);
  const hair = features.hair ? measure(features.hair) : undefined;
  const eye = features.eye ? measure(features.eye) : undefined;

  // --- hue: skin dominates, hair and eye refine it.
  const hueParts: Array<[number, number]> = [[skinHue(skin), 0.5]];
  if (hair) hueParts.push([pigmentHue(hair), 0.3]);
  if (eye) hueParts.push([pigmentHue(eye), 0.2]);
  const hueW = hueParts.reduce((s, [, w]) => s + w, 0);
  const hue = clamp(hueParts.reduce((s, [v, w]) => s + v * w, 0) / hueW);

  const value = valueAxis(skin, hair, eye);
  const { score: chroma, hasContrast } = chromaAxis(skin, hair, eye);

  const axes: Record<Axis, AxisScore> = {
    hue: { score: hue, strength: Math.abs(hue) },
    value: { score: value, strength: Math.abs(value) },
    chroma: { score: chroma, strength: Math.abs(chroma) },
  };

  // The dominant axis names the season. Without hair/eye the chroma axis is
  // only half-measured, so it is not allowed to dominate — otherwise a skin-only
  // reading would confidently return "Bright Winter" on no real evidence.
  const candidates: Axis[] = hasContrast
    ? ["hue", "value", "chroma"]
    : ["hue", "value"];
  const dominant = candidates.reduce((best, a) =>
    axes[a].strength > axes[best].strength ? a : best,
  );

  const warm = hue >= 0;
  let key: string;
  if (dominant === "value") {
    key = `value:${value >= 0 ? "light" : "deep"}:${warm ? "warm" : "cool"}`;
  } else if (dominant === "chroma") {
    key = `chroma:${chroma >= 0 ? "bright" : "soft"}:${warm ? "warm" : "cool"}`;
  } else {
    key = `hue:${warm ? "warm" : "cool"}:${value >= 0 ? "light" : "deep"}`;
  }
  const season = SEASON_BY_DOMINANCE[key];

  return {
    season,
    axes,
    dominant,
    confidence: confidenceOf(axes, dominant, { hair: !!hair, eye: !!eye }),
    inputs: { skin: true, hair: !!hair, eye: !!eye },
    reasoning: explain(axes, dominant, { hair: !!hair, eye: !!eye }),
  };
}

/**
 * Confidence combines how many features we measured with how decisively one
 * axis dominates. A skin-only reading with two near-tied axes is a guess, and
 * is reported as one.
 */
function confidenceOf(
  axes: Record<Axis, AxisScore>,
  dominant: Axis,
  have: { hair: boolean; eye: boolean },
): number {
  let c = 0.4; // skin alone
  if (have.hair) c += 0.28;
  if (have.eye) c += 0.12;

  const strengths = (Object.keys(axes) as Axis[])
    .map((a) => axes[a].strength)
    .sort((x, y) => y - x);
  // Clear separation between the top two axes = a confident call.
  const margin = strengths[0] - strengths[1];
  c += Math.min(0.08, margin * 0.4);

  // A dominant axis barely off neutral is inherently uncertain.
  if (axes[dominant].strength < 0.15) c -= 0.15;

  // Never claim certainty: this is a perceptual judgement measured from one
  // photograph, and trained human analysts disagree with each other too.
  return Math.max(0, Math.min(0.88, Number(c.toFixed(2))));
}

function explain(
  axes: Record<Axis, AxisScore>,
  dominant: Axis,
  have: { hair: boolean; eye: boolean },
): string[] {
  const out: string[] = [];
  const dir = (a: Axis) => {
    const s = axes[a].score;
    if (a === "hue") return s >= 0 ? "warm" : "cool";
    if (a === "value") return s >= 0 ? "light" : "deep";
    return s >= 0 ? "bright" : "soft";
  };
  out.push(
    `Undertone reads ${dir("hue")} (hue score ${axes.hue.score.toFixed(2)}).`,
  );
  out.push(
    `Overall depth reads ${dir("value")} (value ${axes.value.score.toFixed(2)}).`,
  );
  out.push(
    `Clarity reads ${dir("chroma")} (chroma ${axes.chroma.score.toFixed(2)}).`,
  );
  out.push(
    `Your dominant characteristic is ${dominant} — that is what the season is named for.`,
  );
  if (!have.hair && !have.eye) {
    out.push(
      "Measured from skin only: hair and eye colour were not supplied, so depth and clarity are estimates and confidence is reduced.",
    );
  } else if (!have.hair) {
    out.push(
      "Hair colour was not supplied, so the depth reading is less certain.",
    );
  } else if (!have.eye) {
    out.push(
      "Eye colour was not supplied, so the undertone reading is less certain.",
    );
  }
  return out;
}

// ---- product-facing entry point -------------------------------------------

/**
 * Full appearance analysis, returning the `SkinTone` shape the product already
 * consumes so nothing downstream has to change.
 *
 * Division of labour between the two families of numbers we report:
 *   - `ita`, `undertone`, `depth`, `chroma` describe the SKIN specifically.
 *     ITA is a pixel-derived colour descriptor here, not a clinical phototype.
 *   - `season` describes the WHOLE appearance and now comes from the
 *     three-axis model over skin + hair + eye.
 *
 * With hair/eye omitted this still returns a valid result, but `analysis`
 * carries a reduced confidence and an explicit note saying why. Callers should
 * surface that rather than presenting a skin-only guess as a firm answer.
 */
export function analyzeAppearance(features: FeatureColors): SkinTone {
  const analysis = analyzeSeason(features);
  const lab = rgbToLab(hexToRgb(features.skin));
  const ita = itaOf(lab);
  const def = seasonDef(analysis.season);

  return {
    hex: features.skin,
    lab,
    ita: Math.round(ita * 10) / 10,
    chroma: Math.round(chromaOf(lab) * 10) / 10,
    undertone: undertoneOf(lab),
    depth: depthOf(ita),
    season: analysis.season,
    seasonLabel: def.label,
    palette: def.palette,
    headline: def.headline,
    description: def.description,
    analysis,
  };
}
