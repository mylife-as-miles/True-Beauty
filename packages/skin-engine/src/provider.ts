// Adapted parser from MIROIR src/lib/skin.ts (MIT, Copyright (c) 2026 MIROIR).
// Improvements: preserve missing/unknown metrics, retain raw vs UI distinction, never invent scores or skin age.
export interface SkinObservation {
  id: string;
  concern: string;
  label: string;
  region?: string;
  uiScore?: number;
  rawScore?: number;
  skinType?: string;
  maskUrls: string[];
  kind: "provider-prediction";
  confidence: null;
}
export interface SkinAnalysisResult {
  provider: "perfect-corp";
  observations: SkinObservation[];
  overall?: number;
  capturedAt: string;
  warnings: string[];
  limitations: string[];
}
const labels: Record<string, string> = {
  moisture: "Apparent hydration",
  redness: "Redness appearance",
  oiliness: "Oiliness appearance",
  pore: "Pore appearance",
  texture: "Texture appearance",
  acne: "Blemish appearance",
  wrinkle: "Line appearance",
  firmness: "Firmness appearance",
  radiance: "Radiance appearance",
  dark_circle: "Dark-circle appearance",
  age_spot: "Pigmentation appearance",
  eye_bag: "Eye-bag appearance",
  tear_trough: "Tear-trough appearance",
  skin_type: "Predicted skin type",
};
const finiteScore = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100
    ? v
    : undefined;
const cleanType = (v: string) => v.replace(/^hd_/, "").replace(/_v2$/, "");
const safeMask = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 4096 && /^https:\/\//.test(v);
export function parseProviderSkinResult(
  raw: unknown,
  capturedAt = new Date().toISOString(),
): SkinAnalysisResult {
  const observations: SkinObservation[] = [];
  const warnings: string[] = [];
  let overall: number | undefined;
  let visited = 0;
  const seen = new Set<object>();
  const read = (
    input: unknown,
    depth = 0,
    inheritedType?: string,
    inheritedRegion?: string,
  ): void => {
    if (depth > 10 || ++visited > 5000 || !input || typeof input !== "object")
      return;
    if (seen.has(input)) return;
    seen.add(input);
    if (Array.isArray(input)) {
      input
        .slice(0, 256)
        .forEach((v) => read(v, depth + 1, inheritedType, inheritedRegion));
      return;
    }
    const item = input as Record<string, unknown>;
    const type = typeof item.type === "string" ? item.type : inheritedType;
    const region =
      typeof item.region === "string" ? item.region : inheritedRegion;
    if (type === "all") {
      overall = finiteScore(item.score ?? item.ui_score);
      return;
    }
    if (
      type === "skin_age" ||
      type === "resize_image" ||
      type === "llm_results"
    )
      return;
    const rawScore = finiteScore(item.raw_score),
      uiScore = finiteScore(item.ui_score);
    const skinType =
      typeof item.skin_type === "string" ? item.skin_type : undefined;
    if (type && (rawScore !== undefined || uiScore !== undefined || skinType)) {
      const concern = cleanType(type);
      observations.push({
        id: `${type}:${region ?? "whole"}`,
        concern,
        label: labels[concern] ?? concern.replaceAll("_", " "),
        region,
        rawScore,
        uiScore,
        skinType,
        maskUrls: Array.isArray(item.mask_urls)
          ? item.mask_urls.filter(safeMask)
          : [],
        kind: "provider-prediction",
        confidence: null,
      });
      if (uiScore === undefined && item.ui_score !== undefined)
        warnings.push(`Invalid display score omitted for ${type}.`);
      return;
    }
    for (const [key, value] of Object.entries(item)) {
      if (key === "all" && typeof value === "number") {
        overall = finiteScore(value);
        continue;
      }
      if (value && typeof value === "object") {
        const isMetric =
          /^(hd_)?(redness|oiliness|age_spot|radiance|moisture|dark_circle|dark_circle_v2|eye_bag|droopy_upper_eyelid|droopy_lower_eyelid|firmness|texture|acne|pore|wrinkle|tear_trough|skin_type)$/.test(
            key,
          );
        const isRegion =
          !!inheritedType &&
          !isMetric &&
          !["data", "results", "output", "result"].includes(key);
        read(
          value,
          depth + 1,
          isMetric ? key : inheritedType,
          isRegion ? key : inheritedRegion,
        );
      }
    }
  };
  read(raw);
  const deduped = [...new Map(observations.map((o) => [o.id, o])).values()];
  if (!deduped.length)
    throw new Error(
      "The provider response contains no supported cosmetic observations. No result was created.",
    );
  return {
    provider: "perfect-corp",
    observations: deduped,
    overall,
    capturedAt,
    warnings,
    limitations: [
      "Cosmetic predictions from a photograph are not a medical diagnosis or direct measurements of hydration, sebum or skin physiology.",
      "Provider UI scores are adjusted display scores; raw model scores are kept separate. Neither field is a probability or confidence estimate.",
      "Lighting, complexion, camera processing, makeup and pose can affect the result. You can correct your profile.",
    ],
  };
}
export function compareSkinResults(
  before: SkinAnalysisResult,
  after: SkinAnalysisResult,
) {
  const old = new Map(before.observations.map((o) => [o.id, o]));
  return after.observations.flatMap((o) => {
    const previous = old.get(o.id);
    if (previous?.rawScore === undefined || o.rawScore === undefined) return [];
    return [
      {
        concern: o.concern,
        region: o.region,
        before: previous.rawScore,
        after: o.rawScore,
        change: o.rawScore - previous.rawScore,
        note: "A difference between model predictions; it does not establish a product effect or clinical change.",
      },
    ];
  });
}
