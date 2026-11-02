import { describe, it, expect } from "vitest";
import {
  parseINCI,
  compareIngredients,
  compatibilityNotes,
} from "./ingredients";
import {
  cosineSimilarity,
  encodeFeatures,
  matchProducts,
  buildRoutine,
} from "./recommendations";
const catalogue = [
  {
    id: "cleanser",
    name: "Gentle cleanser",
    category: "cleanser",
    ingredients: ["Glycerin"],
    concerns: ["moisture"],
    skinTypes: ["dry"],
    price: 5000,
    currency: "NGN",
  },
  {
    id: "cream",
    name: "Daily cream",
    category: "moisturizer",
    ingredients: ["Glycerin", "Squalane"],
    concerns: ["moisture"],
    skinTypes: ["all"],
    price: 6000,
    currency: "NGN",
  },
  {
    id: "spf",
    name: "Daily shield",
    category: "sunscreen",
    ingredients: ["Zinc Oxide"],
    concerns: [],
    skinTypes: ["all"],
    price: 8000,
    currency: "NGN",
  },
  {
    id: "fragrance",
    name: "Perfumed cream",
    category: "moisturizer",
    ingredients: ["Parfum"],
    concerns: ["moisture"],
    skinTypes: ["dry"],
    price: 3000,
    currency: "NGN",
  },
];
describe("ingredient context", () => {
  it("retains INCI parentheses, removes duplicate tokens and compares names", () => {
    expect(parseINCI("Aqua, Glycerin, Aloe (leaf, juice), glycerin")).toEqual([
      "Aqua",
      "glycerin",
      "Aloe (leaf, juice)",
    ]);
    const result = compareIngredients(
      ["Aqua", "Glycerin"],
      ["glycerin", "Squalane"],
    );
    expect(result.shared).toEqual(["Glycerin"]);
    expect(result.onlyB).toEqual(["Squalane"]);
  });
  it("does not declare absent rules a guarantee of compatibility", () => {
    expect(compatibilityNotes([["Aqua"]])[0]).toContain("not a guarantee");
    expect(
      compatibilityNotes([["Retinol"], ["Salicylic Acid"]]).join(" "),
    ).toContain("alternate nights");
  });
});
describe("actual Skyn feature encoding and recommendation migration", () => {
  it("preserves cosine identity and empty-vector semantics", () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
    expect(encodeFeatures("dry", ["acne"])[1]).toBe(1);
  });
  it("filters declared avoidances, prioritizes owned items and explains match inputs", () => {
    const matches = matchProducts(
      { skinType: "dry", concerns: ["moisture"], avoidIngredients: ["parfum"] },
      catalogue,
      { ownedIds: ["cream"] },
    );
    expect(matches[0].product.id).toBe("cream");
    expect(matches.some((x) => x.product.id === "fragrance")).toBe(false);
    expect(matches[0].evidence[0].source).toBe("user-profile");
  });
  it("respects combined routine budget rather than per-product affordability only", () => {
    const routine = buildRoutine(
      { skinType: "dry", concerns: ["moisture"], avoidIngredients: ["parfum"] },
      catalogue,
      { budget: 15000, currency: "NGN" },
    );
    expect(routine.total).toBe(14000);
    expect(routine.total).toBeLessThanOrEqual(15000);
    expect(
      routine.am.find((s) => s.slot === "Cleanse")?.product,
    ).toBeUndefined();
  });
  it("never treats missing currency prices as free and supports owned-only routines", () => {
    const routine = buildRoutine({ concerns: [] }, catalogue, {
      budget: 20000,
      currency: "USD",
    });
    expect(routine.am.every((s) => s.product === undefined)).toBe(true);
    const owned = buildRoutine({ concerns: [] }, catalogue, {
      ownedIds: ["cream"],
      ownedOnly: true,
      budget: 0,
    });
    expect(owned.total).toBe(0);
    expect(owned.am.filter((s) => s.product).map((s) => s.product!.id)).toEqual(
      ["cream"],
    );
  });
});
