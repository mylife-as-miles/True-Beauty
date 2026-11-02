import type { MakeupFinish, MakeupLook } from "../../makeup-engine/src";
import type { VisionSnapshot } from "../../vision-core/src";

export type RemixRegion = "lipstick" | "eyeshadow" | "blush" | "skin" | "hair";
export interface RemixBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface RegionSample {
  region: RemixRegion;
  label: string;
  color: string | null;
  measuredColor: string | null;
  /** Bounded heuristic quality indicator, not a calibrated probability. */
  confidence: number;
  source: "region-pixels" | "user-correction" | "unavailable";
  bounds: RemixBounds[];
  pixelCount: number;
  excludedFraction: number;
  warnings: string[];
  finish: MakeupFinish;
  finishConfidence: number;
  enabled: boolean;
  opacity: number;
}
export interface PaletteSample {
  color: string;
  fraction: number;
}
export interface RemixResult {
  version: "local-remix-1";
  source: { name: string; width: number; height: number; analyzedAt: string };
  method: "local-landmark-pixel-heuristic";
  faceDetected: boolean;
  regions: Record<RemixRegion, RegionSample>;
  palette: PaletteSample[];
  paletteScope: "lower-image-possible-outfit" | "whole-image";
  paletteBounds: RemixBounds;
  quality: {
    meanLuminance: number;
    clippedFraction: number;
    sharpness: number;
    warnings: string[];
  };
  warnings: string[];
  /** Image-derived, editable preview; never an identification of cosmetic products. */
  look: MakeupLook;
}
export interface InspirationOptions {
  snapshot?: VisionSnapshot;
  sourceName?: string;
  signal?: AbortSignal;
  maxSide?: number;
}
export interface RegionCorrection {
  color?: string;
  enabled?: boolean;
  opacity?: number;
  finish?: MakeupFinish;
}
