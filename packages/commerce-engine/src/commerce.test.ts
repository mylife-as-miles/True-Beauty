import { describe, it, expect } from "vitest";
import {
  SAMPLE_PRODUCTS,
  searchProducts,
  priceFor,
  getPriceState,
  compareProducts,
  nearestShade,
  formatPrice,
  productIllustration,
} from "./index";
import { addLine, setLineQty, bagTotals, type BagItem } from "./bag";
describe("honest catalog discovery", () => {
  it("never treats illustrative prices or availability as merchant data", () => {
    for (const product of SAMPLE_PRODUCTS) {
      expect(product.source).toBe("sample");
      expect(product.provenance.note).toContain("no claim");
      for (const price of product.prices) {
        expect(price.kind).toBe("sample");
        expect(price.available).toBeUndefined();
        expect(getPriceState(price).fresh).toBe(false);
        expect(getPriceState(price).verified).toBe(false);
      }
      expect(product.merchantUrl).toMatch(/^https:\/\//);
    }
  });
  it("respects currency, budget and owned-only filters together", () => {
    const result = searchProducts("", {
      currency: "NGN",
      maxPrice: 10000,
      ownedOnly: true,
      ownedIds: ["elf-lip", "ordinary-moisturizer"],
    });
    expect(result.map((p) => p.id)).toEqual(["elf-lip"]);
    expect(searchProducts("niacinamide").length).toBeGreaterThan(0);
    expect(priceFor(SAMPLE_PRODUCTS[0], "EUR")).toBeUndefined();
  });
  it("compares only known ingredient subsets with the formulation limitation", () => {
    const result = compareProducts(SAMPLE_PRODUCTS[0], SAMPLE_PRODUCTS[1]);
    expect(result.sharedIngredients).toContain("Glycerin");
    expect(result.note).toContain("does not establish equivalent formulation");
  });
  it("matches a swatch exactly but does not claim physical shade accuracy", () => {
    const product = SAMPLE_PRODUCTS.find((p) => p.category === "foundation")!;
    const shade = product.variants[2];
    expect(nearestShade(product, shade.hex!)[0]).toEqual({
      variant: shade,
      distance: 0,
    });
    expect(() => nearestShade(product, "wrong")).toThrow();
    expect(formatPrice(20000, "NGN")).toContain("20,000");
  });
  it("encodes an original generic illustration without untrusted markup injection", () => {
    const image = productIllustration({ accent: "<script>", form: "tube" });
    expect(decodeURIComponent(image)).not.toContain("<script>");
  });
});
describe("unified shopping bag adapted from MIROIR", () => {
  const item: BagItem = {
    id: "shirt::M",
    name: "Sample shirt",
    kind: "apparel",
    price: 15.45,
    currency: "USD",
    sample: true,
    variantId: "navy",
  };
  it("keeps size and colour variants distinct and sums currencies separately", () => {
    let bag = addLine([], item, { size: "M" });
    bag = addLine(bag, item, { size: "M", qty: 2 });
    bag = addLine(bag, { ...item, variantId: "sand" }, { size: "M" });
    bag = addLine(bag, { ...item, id: "lip", price: 9500, currency: "NGN" });
    expect(bag).toHaveLength(3);
    expect(bag[0].qty).toBe(3);
    expect(bagTotals(bag)).toEqual({ USD: 61.8, NGN: 9500 });
    expect(setLineQty(bag, item.id, 0, "M", "navy")).toHaveLength(2);
  });
  it("rejects negative, fractional and excessive quantities", () => {
    expect(() => addLine([], item, { qty: -1 })).toThrow();
    expect(() => addLine([], item, { qty: 1.5 })).toThrow();
    expect(() => addLine(addLine([], item, { qty: 99 }), item)).toThrow();
  });
});

describe("currency and source identity", () => {
  const item: BagItem = {
    id: "one",
    name: "One shade",
    kind: "makeup",
    price: 10,
    currency: "USD",
    variantId: "rose",
    sample: true,
  };
  it("never merges the same shade in two currencies and requires an unambiguous legacy edit", () => {
    let bag = addLine([], item);
    bag = addLine(bag, { ...item, currency: "NGN", price: 9500 });
    expect(bag).toHaveLength(2);
    expect(bagTotals(bag)).toEqual({ USD: 10, NGN: 9500 });
    expect(() => setLineQty(bag, "one", 2, undefined, "rose")).toThrow(
      /currency/,
    );
    expect(setLineQty(bag, "one", 2, undefined, "rose", "NGN")[1].qty).toBe(2);
  });
});
it("generic price freshness cannot promote imported, invalid-date or future-dated records", () => {
  const base = {
    amount: 100,
    currency: "NGN" as const,
    kind: "verified" as const,
    observedAt: "2026-11-02T12:00:00.000Z",
    sourceUrl: "https://example.test",
    merchant: "Fixture",
  };
  const now = Date.parse("2026-11-02T12:01:00Z");
  for (const record of [
    { ...base, imported: true },
    { ...base, kind: "imported" as const },
    { ...base, observedAt: "invalid" },
    { ...base, observedAt: "2030-01-01T00:00:00.000Z" },
  ])
    expect(getPriceState(record, now)).toMatchObject({
      fresh: false,
      verified: false,
    });
  expect(getPriceState({ ...base, imported: true }, now).label).toMatch(
    /Imported/,
  );
});
