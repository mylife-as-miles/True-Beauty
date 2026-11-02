export * from "./catalog";
export * from "./bag";
import {
  SAMPLE_PRODUCTS,
  type Product,
  type ProductCategory,
  type Currency,
  type PriceSnapshot,
} from "./catalog";
export interface ProductFilter {
  category?: ProductCategory;
  skinType?: string;
  concern?: string;
  maxPrice?: number;
  currency?: Currency;
  ownedIds?: string[];
  ownedOnly?: boolean;
}
export function priceFor(
  product: Product,
  currency: Currency = "NGN",
): PriceSnapshot | undefined {
  return product.prices.find((p) => p.currency === currency);
}
export function formatPrice(
  amount: number,
  currency: Currency = "NGN",
): string {
  if (!Number.isFinite(amount) || amount < 0)
    throw new Error("Price must be nonnegative");
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "NGN" ? 0 : 2,
  }).format(amount);
}
export function getPriceState(
  price: PriceSnapshot,
  now = Date.now(),
): { label: string; fresh: boolean; verified: boolean; ageDays: number } {
  const observed = Date.parse(price.observedAt),
    validDate = Number.isFinite(observed) && observed <= now + 300000;
  const ageDays = validDate
    ? Math.max(0, (now - observed) / 86400000)
    : Infinity;
  const imported = price.imported === true || price.kind === "imported";
  return {
    label: imported
      ? "Imported price record · refresh to verify"
      : price.kind === "sample"
        ? "Sample price · not a merchant quote"
        : !validDate
          ? "Source date unavailable · refresh to verify"
          : ageDays > 7
            ? "Merchant quote · needs refresh"
            : "Merchant quote",
    fresh: !imported && validDate && price.kind === "verified" && ageDays <= 7,
    verified: !imported && validDate && price.kind === "verified",
    ageDays,
  };
}
export function searchProducts(
  query = "",
  filters: ProductFilter = {},
  catalog: Product[] = SAMPLE_PRODUCTS,
): Product[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return catalog.filter((p) => {
    const text = [
      p.name,
      p.brand,
      p.category,
      p.description,
      ...p.ingredients,
      ...p.concerns,
    ]
      .join(" ")
      .toLowerCase();
    return (
      tokens.every((t) => text.includes(t)) &&
      (!filters.category || p.category === filters.category) &&
      (!filters.skinType ||
        p.skinTypes.includes("all") ||
        p.skinTypes.includes(filters.skinType)) &&
      (!filters.concern || p.concerns.includes(filters.concern)) &&
      (!filters.ownedOnly || filters.ownedIds?.includes(p.id)) &&
      (filters.maxPrice === undefined ||
        (priceFor(p, filters.currency)?.amount ?? Infinity) <= filters.maxPrice)
    );
  });
}
export function compareProducts(a: Product, b: Product) {
  const norm = (x: string) => x.trim().toLowerCase();
  const aset = new Set(a.ingredients.map(norm)),
    bset = new Set(b.ingredients.map(norm));
  return {
    a,
    b,
    sharedIngredients: a.ingredients.filter((x) => bset.has(norm(x))),
    onlyA: a.ingredients.filter((x) => !bset.has(norm(x))),
    onlyB: b.ingredients.filter((x) => !aset.has(norm(x))),
    note: "Ingredient overlap does not establish equivalent formulation, concentration, performance or tolerance. Sample ingredient subsets must be verified on the current label.",
  };
}
export function findAlternatives(
  product: Product,
  options: { budget?: number; currency?: Currency; catalog?: Product[] } = {},
) {
  const currency = options.currency ?? "NGN";
  const original = priceFor(product, currency)?.amount ?? Infinity;
  return (options.catalog ?? SAMPLE_PRODUCTS)
    .filter((p) => p.id !== product.id && p.category === product.category)
    .map((p) => {
      const price = priceFor(p, currency);
      const common = p.concerns.filter((c) => product.concerns.includes(c));
      return {
        product: p,
        price,
        savings: price ? original - price.amount : undefined,
        reasons: [
          `Same product category: ${p.category}`,
          common.length
            ? `Shared stated purpose: ${common.join(", ")}`
            : "Compare formula and texture separately",
          "Similarity is a discovery aid, not a verified dupe.",
        ],
      };
    })
    .filter(
      (p) =>
        p.price &&
        p.price.amount <= Math.min(original, options.budget ?? Infinity),
    )
    .sort((a, b) => a.price!.amount - b.price!.amount);
}
/** Cosmetic swatch distance only; not a calibrated foundation shade match. */
export function nearestShade(product: Product, targetHex: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(targetHex)) throw new Error("Invalid colour");
  const rgb = (h: string) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const target = rgb(targetHex);
  return product.variants
    .filter((v) => v.hex)
    .map((v) => ({
      variant: v,
      distance: Math.hypot(...rgb(v.hex!).map((c, i) => c - target[i])),
    }))
    .sort((a, b) => a.distance - b.distance);
}
/** Original generic packaging illustration, never a manufacturer photograph. */
export function productIllustration(
  product: Pick<Product, "accent" | "form">,
): string {
  const fill = /^#[0-9a-fA-F]{6}$/.test(product.accent)
    ? product.accent
    : "#aa8d80";
  const body =
    product.form === "compact"
      ? '<rect x="30" y="95" width="140" height="65" rx="22"/>'
      : product.form === "jar"
        ? '<rect x="45" y="75" width="110" height="20" rx="6" fill="#c6bfb2"/><rect x="40" y="90" width="120" height="90" rx="20"/>'
        : product.form === "lipstick"
          ? '<rect x="74" y="100" width="52" height="102" rx="6" fill="#b7aaa2"/><path d="M80 100V45Q96 12 120 44V100Z"/>'
          : '<rect x="73" y="25" width="54" height="38" rx="5" fill="#b7aaa2"/><rect x="49" y="60" width="102" height="150" rx="20"/>';
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240"><g fill="${fill}">${body}</g><path d="M75 128H125M86 139H114" stroke="#fff" stroke-opacity=".65" stroke-width="3"/></svg>`)}`;
}

export * from "./merchant";
