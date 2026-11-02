export interface IngredientNote {
  inci: string;
  role: string;
  evidence:
    "established-cosmetic-function" | "limited-product-specific-evidence";
  sourceUrl: string;
  note: string;
}
/** Small sourced function dictionary. Formula effects depend on concentration, vehicle and use. */
export const ingredientKnowledge: Record<
  string,
  Omit<IngredientNote, "inci">
> = {
  glycerin: {
    role: "Humectant",
    evidence: "established-cosmetic-function",
    sourceUrl: "https://ec.europa.eu/growth/tools-databases/cosing/",
    note: "Helps retain water in cosmetic formulations. The complete formula determines performance.",
  },
  "sodium hyaluronate": {
    role: "Humectant",
    evidence: "established-cosmetic-function",
    sourceUrl: "https://ec.europa.eu/growth/tools-databases/cosing/",
    note: "The sodium salt of hyaluronic acid; a moisture-binding cosmetic ingredient.",
  },
  squalane: {
    role: "Emollient",
    evidence: "established-cosmetic-function",
    sourceUrl: "https://ec.europa.eu/growth/tools-databases/cosing/",
    note: "An emollient used to soften the feel of skin.",
  },
  niacinamide: {
    role: "Skin conditioning",
    evidence: "established-cosmetic-function",
    sourceUrl: "https://ec.europa.eu/growth/tools-databases/cosing/",
    note: "Skin-conditioning ingredient. A label alone cannot establish effectiveness for an individual concern.",
  },
  "ceramide np": {
    role: "Skin conditioning",
    evidence: "established-cosmetic-function",
    sourceUrl: "https://ec.europa.eu/growth/tools-databases/cosing/",
    note: "A ceramide used in skin-conditioning formulations.",
  },
  "salicylic acid": {
    role: "Keratolytic / skin conditioning",
    evidence: "established-cosmetic-function",
    sourceUrl: "https://www.aad.org/public/diseases/acne/skin-care/treat",
    note: "Used in acne and exfoliating products. It may irritate some skin; follow the product directions.",
  },
  retinol: {
    role: "Skin conditioning",
    evidence: "established-cosmetic-function",
    sourceUrl:
      "https://www.aad.org/public/everyday-care/skin-care-secrets/anti-aging/retinoid-retinol",
    note: "Introduce gradually. Retinoids need pregnancy-specific advice and may irritate; consult a qualified professional when appropriate.",
  },
  parfum: {
    role: "Fragrance",
    evidence: "established-cosmetic-function",
    sourceUrl:
      "https://www.aad.org/public/everyday-care/skin-care-secrets/face/sensitive-skin",
    note: "Adds scent. People with a known fragrance sensitivity may prefer fragrance-free options.",
  },
  fragrance: {
    role: "Fragrance",
    evidence: "established-cosmetic-function",
    sourceUrl:
      "https://www.aad.org/public/everyday-care/skin-care-secrets/face/sensitive-skin",
    note: "Adds scent. Presence alone does not mean a product is unsafe.",
  },
};
export function normalizeIngredient(s: string) {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
export function parseINCI(input: string | string[]): string[] {
  const text = Array.isArray(input) ? input.join(",") : input;
  let depth = 0,
    token = "";
  const tokens: string[] = [];
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";" || ch === "\n") && depth === 0) {
      if (token.trim()) tokens.push(token.trim());
      token = "";
    } else token += ch;
  }
  if (token.trim()) tokens.push(token.trim());
  return [
    ...new Map(
      tokens
        .filter((t) => t.length <= 200)
        .slice(0, 200)
        .map((t) => [normalizeIngredient(t), t]),
    ).values(),
  ];
}
export function inspectIngredients(input: string | string[]): IngredientNote[] {
  return parseINCI(input).flatMap((inci) => {
    const known = ingredientKnowledge[normalizeIngredient(inci)];
    return known ? [{ inci, ...known }] : [];
  });
}
export function compareIngredients(a: string | string[], b: string | string[]) {
  const left = parseINCI(a),
    right = parseINCI(b),
    l = new Set(left.map(normalizeIngredient)),
    r = new Set(right.map(normalizeIngredient));
  return {
    shared: left.filter((i) => r.has(normalizeIngredient(i))),
    onlyA: left.filter((i) => !r.has(normalizeIngredient(i))),
    onlyB: right.filter((i) => !l.has(normalizeIngredient(i))),
    notes:
      "Ingredient overlap does not prove formula equivalence. Concentrations, delivery and individual response are unknown.",
  };
}
export function compatibilityNotes(input: (string | string[])[]) {
  const all = input.flatMap(parseINCI).map(normalizeIngredient),
    has = (p: RegExp) => all.some((i) => p.test(i));
  const notes: string[] = [];
  if (has(/retinol|retinal|tretinoin/) && has(/glycolic|lactic|salicylic/))
    notes.push(
      "Retinoids and exfoliating acids can increase irritation when introduced together. Consider alternate nights and follow product directions.",
    );
  if (has(/retinol|retinal|tretinoin/))
    notes.push(
      "Retinoids need pregnancy-specific advice; use sun protection and consult a qualified professional when appropriate.",
    );
  if (!notes.length)
    notes.push(
      "No rule in this small ingredient library was triggered. This is not a guarantee of compatibility or tolerability.",
    );
  return notes;
}
