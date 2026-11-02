// Adapted from Skyn/backend/models/recommender/rec.py (MIT, Copyright (c) 2025 RANDON)
// and MIROIR/src/lib/matching.ts (MIT, Copyright (c) 2026 MIROIR). See LICENSE.*.
// Replaces pandas/sklearn and unproven scraped datasets with typed catalogue input.
import { normalizeIngredient, parseINCI } from "./ingredients";
export const FEATURE_KEYS = [
  "normal",
  "dry",
  "oily",
  "combination",
  "sensitive",
  "acne",
  "fine lines",
  "wrinkles",
  "redness",
  "dull",
  "pore",
  "pigmentation",
  "blackheads",
  "whiteheads",
  "blemishes",
  "dark circles",
  "eye bags",
  "dark spots",
  "moisture",
  "texture",
  "radiance",
] as const;
export interface BeautyProfile {
  skinType?: string;
  concerns: string[];
  avoidIngredients?: string[];
  budget?: number;
  currency?: string;
}
export interface IntelligenceProduct {
  id: string;
  name: string;
  category: string;
  ingredients: string[] | string;
  concerns: string[];
  skinTypes?: string[];
  price?: number;
  currency?: string;
  prices?: { currency: string; amount: number }[];
}
export interface MatchOptions {
  ownedIds?: string[];
  ownedOnly?: boolean;
  budget?: number;
  currency?: string;
}
export interface ProductMatch<P = IntelligenceProduct> {
  product: P;
  score: number;
  reasons: string[];
  evidence: {
    source: "user-profile" | "catalogue";
    field: string;
    value: string;
  }[];
  owned: boolean;
  inBudget: boolean;
  price?: number;
  currency: string;
}
const aliases: Record<string, string> = {
  dryness: "moisture",
  hydration: "moisture",
  dehydration: "moisture",
  pores: "pore",
  breakouts: "acne",
  wrinkle: "wrinkles",
  dark_circle: "dark circles",
  age_spot: "dark spots",
  dullness: "dull",
  sensitivity: "sensitive",
};
const normalized = (s: string) =>
  aliases[s.toLowerCase().trim()] ?? s.toLowerCase().trim();
export function encodeFeatures(
  skinType: string | undefined,
  concerns: string[],
): number[] {
  const type = normalized(skinType ?? ""),
    values = new Set(concerns.map(normalized));
  return FEATURE_KEYS.map((f, i) =>
    i < 4
      ? type === "all" || type === f
        ? 1
        : 0
      : values.has(f) || type === f
        ? 1
        : 0,
  );
}
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length)
    throw new Error("Feature vector dimensions differ.");
  if ([...a, ...b].some((v) => !Number.isFinite(v)))
    throw new Error("Feature vectors must be finite.");
  const dot = a.reduce((s, x, i) => s + x * b[i], 0),
    aa = Math.sqrt(a.reduce((s, x) => s + x * x, 0)),
    bb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return aa && bb ? dot / (aa * bb) : 0;
}
export function productPrice(
  product: IntelligenceProduct,
  currency = "NGN",
): number | undefined {
  const variant = product.prices?.find((p) => p.currency === currency);
  const price =
    variant?.amount ??
    ((product.currency ?? "NGN") === currency ? product.price : undefined);
  return typeof price === "number" && Number.isFinite(price) && price >= 0
    ? price
    : undefined;
}
export function matchProducts<P extends IntelligenceProduct>(
  profile: BeautyProfile,
  catalog: P[],
  options: MatchOptions = {},
): ProductMatch<P>[] {
  const currency = options.currency ?? profile.currency ?? "NGN",
    budget = options.budget ?? profile.budget;
  const owned = new Set(options.ownedIds ?? []),
    avoid = (profile.avoidIngredients ?? []).map(normalizeIngredient);
  const vector = encodeFeatures(profile.skinType, profile.concerns);
  const userConcerns = profile.concerns.map(normalized);
  return catalog
    .filter((p) => !options.ownedOnly || owned.has(p.id))
    .filter((p) => {
      const ingredients = parseINCI(p.ingredients).map(normalizeIngredient);
      return !avoid.some((a) => ingredients.includes(a));
    })
    .map((product) => {
      const isOwned = owned.has(product.id),
        price = productPrice(product, currency);
      const concerns = product.concerns.map(normalized),
        matches = userConcerns.filter((c) => concerns.includes(c));
      const skins = product.skinTypes ?? ["all"];
      const typeMatch =
        !!profile.skinType &&
        skins.some(
          (s) => normalized(s) === normalized(profile.skinType!) || s === "all",
        );
      const encoded = encodeFeatures(
        skins.includes("all") ? "all" : skins.join(" "),
        product.concerns,
      );
      // All explicitly declared types occupy their own source one-hot positions.
      skins.forEach((s) => {
        const index = FEATURE_KEYS.indexOf(
          normalized(s) as (typeof FEATURE_KEYS)[number],
        );
        if (index >= 0) encoded[index] = 1;
      });
      const similarity = cosineSimilarity(vector, encoded);
      const inBudget =
        isOwned ||
        budget === undefined ||
        (price !== undefined && price <= budget);
      const score = Math.round(
        Math.min(
          100,
          similarity * 75 +
            (typeMatch ? 10 : 0) +
            Math.min(10, matches.length * 5) +
            (isOwned ? 5 : 0),
        ),
      );
      const reasons: string[] = [];
      if (matches.length)
        reasons.push(
          `Catalogue tags overlap your stated interests: ${matches.join(", ")}.`,
        );
      if (typeMatch)
        reasons.push(
          `The catalogue lists this for ${profile.skinType?.toLowerCase()} skin or all skin types.`,
        );
      if (isOwned)
        reasons.push(
          "Already in your beauty wardrobe; no new purchase needed.",
        );
      if (!inBudget)
        reasons.push(
          price === undefined
            ? `No verified ${currency} price; excluded from a budgeted routine.`
            : `Over the selected ${currency} budget.`,
        );
      if (!reasons.length)
        reasons.push(
          "General catalogue option; no specific match to your stated concerns.",
        );
      return {
        product,
        score,
        reasons,
        evidence: matches.flatMap((c) => [
          { source: "user-profile" as const, field: "concern", value: c },
          { source: "catalogue" as const, field: "concern-tag", value: c },
        ]),
        owned: isOwned,
        inBudget,
        price,
        currency,
      };
    })
    .sort(
      (a, b) =>
        Number(b.owned) - Number(a.owned) ||
        Number(b.inBudget) - Number(a.inBudget) ||
        b.score - a.score ||
        a.product.id.localeCompare(b.product.id),
    );
}
export interface RoutineStep<P> {
  slot: string;
  product?: P;
  why: string;
  usage: string;
}
export interface IntelligenceRoutine<P> {
  am: RoutineStep<P>[];
  pm: RoutineStep<P>[];
  total: number;
  currency: string;
  unpricedProductIds: string[];
  notes: string[];
}
/** MIROIR AM/PM ordering retained; budget charged once per unique, unowned product. */
export function buildRoutine<P extends IntelligenceProduct>(
  profile: BeautyProfile,
  catalog: P[],
  options: MatchOptions = {},
): IntelligenceRoutine<P> {
  const ranked = matchProducts(profile, catalog, options),
    currency = options.currency ?? profile.currency ?? "NGN",
    budget = options.budget ?? profile.budget ?? Infinity;
  const chosen = new Map<string, ProductMatch<P>>();
  let total = 0;
  const choose = (pattern: RegExp) =>
    ranked.find((r) => {
      if (!pattern.test(r.product.category.toLowerCase()) || !r.inBudget)
        return false;
      if (chosen.has(r.product.id) || r.owned) return true;
      if (r.price === undefined) return budget === Infinity;
      return total + r.price <= budget;
    });
  const pick = (
    slot: string,
    pattern: RegExp,
    usage: string,
  ): RoutineStep<P> => {
    const r = choose(pattern);
    if (r && !chosen.has(r.product.id)) {
      chosen.set(r.product.id, r);
      if (!r.owned && r.price !== undefined) total += r.price;
    }
    return {
      slot,
      product: r?.product,
      why: r
        ? r.reasons.join(" ")
        : `No suitable ${slot.toLowerCase()} selected within your inventory and budget.`,
      usage,
    };
  };
  // Prioritize core moisturize/protect needs before optional steps.
  const moisturizer = pick(
    "Moisturize",
    /moisturi|cream|lotion/,
    "Apply as directed; adjust the amount for comfort.",
  );
  const protect = pick(
    "Protect",
    /spf|sunscreen|sun protection/,
    "Use broad-spectrum SPF 30 or higher as directed; reapply according to the label.",
  );
  const cleanse = pick(
    "Cleanse",
    /cleanser|cleansing|face wash/,
    "Use a gentle cleanser; avoid scrubbing irritated skin.",
  );
  const note =
    "Suggestions use your stated preferences and catalogue tags. Ingredient presence and tag similarity do not establish clinical benefit.";
  return {
    am: [cleanse, moisturizer, protect],
    pm: [cleanse, moisturizer],
    total,
    currency,
    unpricedProductIds: [...chosen.values()]
      .filter((r) => !r.owned && r.price === undefined)
      .map((r) => r.product.id),
    notes: [
      note,
      "Introduce one new product at a time and patch test according to the product instructions.",
      "Prices may be sample data. Confirm current merchant prices before buying.",
    ],
  };
}
