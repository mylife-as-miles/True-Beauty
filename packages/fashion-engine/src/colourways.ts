/**
 * Adapted from MIROIR / SKIN_AI at f3c0661cb0594fff07e89c80fbe129e7e5bdffa5.
 * Copyright (c) 2026 MIROIR. MIT license: ../THIRD_PARTY_LICENSE.txt.
 * True Beauty modifications: shared engine imports, validated colours,
 * preference-based explanations, no medical or objective attractiveness claims.
 */
// Colourway ranking — which colour of *this* garment suits the shopper.
//
// Each colourway is compared in CIELAB to a selected styling palette.
// This is an explainable aesthetic heuristic, not an objective beauty assessment.
//
// Pure and deterministic — no I/O, no DOM. Unit-tested in
// scripts/colourway.test.mjs.

import {
  hexToRgb,
  rgbToLab,
  chromaOf,
  type Lab,
  type PaletteColor,
} from "../../skin-engine/src/color";

export interface Colourway {
  id: string;
  name: string;
  hex: string;
  /** True for the colour in the product photo; others are recoloured from it. */
  original?: boolean;
}

export type ColourTemp = "warm" | "cool" | "neutral";

export type ColourwayVerdict = "best" | "good" | "workable" | "contrast";

export interface RankedColourway {
  colourway: Colourway;
  /** 0-100, higher = closer to the shopper's palette. */
  fit: number;
  /** CIE76 distance to the nearest palette colour. */
  deltaE: number;
  nearest: PaletteColor;
  temp: ColourTemp;
  verdict: ColourwayVerdict;
  /** True when a red-family colour meets a user-specified avoidance preference. */
  redFlag: boolean;
  reason: string;
}

export interface RankOptions {
  /** User explicitly prefers to avoid red-family colours near their face. */
  avoidRedNearFace?: boolean;
}

/** ΔE within this reads as "in your palette". */
export const GOOD_DELTA_E = 20;
/** ΔE at or beyond this reads as a contrast. */
export const CLASH_DELTA_E = 45;
/** Preference penalty applied only when a user explicitly avoids red-family colours. */
export const REDNESS_PENALTY = 15;

/** CIE76 colour difference. Coarse, but monotonic and explainable. */
export function deltaE(a: Lab, b: Lab): number {
  return Math.sqrt((a.L - b.L) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

function labOf(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

/** CIELAB hue angle in degrees, 0-360. */
function hueAngle(lab: Lab): number {
  const h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

/**
 * Fabric colour temperature from the Lab hue angle. Low-chroma colours (greys,
 * black, white, stone) are neutral whatever their hue. This is for fabric, not
 * skin: `undertoneOf` in lib/color.ts is calibrated for skin and mislabels dyes.
 */
export function colourTemp(hex: string): ColourTemp {
  const lab = labOf(hex);
  if (chromaOf(lab) < 12) return "neutral";
  const h = hueAngle(lab);
  if (h >= 25 && h <= 115) return "warm";
  if (h >= 140 && h <= 330) return "cool";
  return "neutral";
}

/** Broad red/orange colour family for a user-selected avoidance preference. */
function isRedFamily(hex: string): boolean {
  const lab = labOf(hex);
  if (chromaOf(lab) < 20) return false;
  const h = hueAngle(lab);
  return h <= 60 || h >= 345;
}

function fitFromDeltaE(d: number): number {
  return Math.round(100 * Math.exp(-d / 35));
}

/**
 * Ranks a garment's colourways for a selected styling palette, nearest first. Returns an
 * empty list when there is no palette (no selected palette), so callers can show
 * the colourways unranked rather than inventing a verdict.
 */
export function rankColourways(
  colourways: Colourway[],
  palette: PaletteColor[],
  options: RankOptions = {},
): RankedColourway[] {
  if (palette.length === 0 || colourways.length === 0) return [];
  for (const c of [...colourways, ...palette]) {
    if (!/^#[0-9a-fA-F]{6}$/.test(c.hex))
      throw new Error("Colours must be six-digit hex values");
  }
  const paletteLab = palette.map((p) => ({ p, lab: labOf(p.hex) }));

  const ranked = colourways.map(
    (colourway): Omit<RankedColourway, "reason"> => {
      const lab = labOf(colourway.hex);
      let nearest = paletteLab[0];
      let best = Infinity;
      for (const entry of paletteLab) {
        const d = deltaE(lab, entry.lab);
        if (d < best) {
          best = d;
          nearest = entry;
        }
      }

      const redFlag =
        Boolean(options.avoidRedNearFace) && isRedFamily(colourway.hex);
      const fit = Math.max(
        0,
        fitFromDeltaE(best) - (redFlag ? REDNESS_PENALTY : 0),
      );
      const verdict: ColourwayVerdict =
        best >= CLASH_DELTA_E
          ? "contrast"
          : best <= GOOD_DELTA_E && !redFlag
            ? "good"
            : "workable";

      return {
        colourway,
        fit,
        deltaE: Math.round(best * 10) / 10,
        nearest: nearest.p,
        temp: colourTemp(colourway.hex),
        verdict,
        redFlag,
      };
    },
  );

  ranked.sort((a, b) => b.fit - a.fit);
  if (ranked[0].verdict === "good") ranked[0].verdict = "best";

  return ranked.map((r) => ({ ...r, reason: buildReason(r) }));
}

function buildReason(r: Omit<RankedColourway, "reason">): string {
  const name = r.colourway.name;
  const near = `${r.nearest.name}, ΔE ${Math.round(r.deltaE)}`;
  const redness = r.redFlag
    ? " You asked to avoid red-family colours near your face."
    : "";
  if (r.verdict === "best" || r.verdict === "good")
    return `${cap(name)} sits in your palette (closest to your ${near}).`;
  if (r.verdict === "contrast")
    return `${cap(name)} is far from every colour in your palette (nearest is ${near}).${redness}`;
  return `${cap(name)} is workable, a more contrasting choice (nearest is your ${near}).${redness}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
