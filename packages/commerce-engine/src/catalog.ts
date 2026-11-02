/** Curated SAMPLE catalog. No listing, price or stock is live merchant data. */
export type Currency = "NGN" | "USD" | "GBP" | "EUR";
export type ProductCategory =
  | "cleanser"
  | "moisturizer"
  | "serum"
  | "sunscreen"
  | "lipstick"
  | "blush"
  | "foundation"
  | "eyeshadow"
  | "haircare"
  | "accessory"
  | "apparel";
export interface ProductVariant {
  id: string;
  name: string;
  hex?: string;
  size?: string;
  finish?: "matte" | "gloss" | "shimmer";
}
export interface PriceSnapshot {
  amount: number;
  currency: Currency;
  kind: "sample" | "verified";
  observedAt: string;
  sourceUrl: string;
  merchant: string;
  available?: boolean;
}
export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  description: string;
  ingredients: string[];
  ingredientsCoverage: "illustrative-subset" | "full-label";
  concerns: string[];
  skinTypes: string[];
  variants: ProductVariant[];
  prices: PriceSnapshot[];
  price: number;
  currency: Currency;
  source: "sample" | "merchant";
  merchantUrl: string;
  provenance: { label: string; url: string; checkedAt: string; note: string };
  accent: string;
  form: "bottle" | "jar" | "tube" | "compact" | "dropper" | "lipstick";
}
const CHECKED = "2026-11-02T00:00:00.000Z";
const item = (
  p: Omit<
    Product,
    "source" | "prices" | "currency" | "provenance" | "ingredientsCoverage"
  > & { usd: number },
): Product => {
  const { usd, ...rest } = p;
  return {
    ...rest,
    source: "sample",
    currency: "NGN",
    ingredientsCoverage: "illustrative-subset",
    prices: [
      {
        amount: p.price,
        currency: "NGN",
        kind: "sample",
        observedAt: CHECKED,
        sourceUrl: p.merchantUrl,
        merchant: "Illustrative NGN budget only",
      },
      {
        amount: usd,
        currency: "USD",
        kind: "sample",
        observedAt: CHECKED,
        sourceUrl: p.merchantUrl,
        merchant: "Illustrative USD budget only",
      },
    ],
    provenance: {
      label: "Sample catalog · verify manufacturer label",
      url: p.merchantUrl,
      checkedAt: CHECKED,
      note: "Brand reference only. Illustrative ingredient subset and sample budget prices; no claim of current formula, availability, merchant quotation or currency conversion.",
    },
  };
};
export const SAMPLE_PRODUCTS: Product[] = [
  item({
    id: "cerave-cleanser",
    name: "Hydrating Facial Cleanser",
    brand: "CeraVe",
    category: "cleanser",
    description: "A gentle cleanser reference for a simple routine.",
    ingredients: [
      "Aqua",
      "Glycerin",
      "Cetearyl Alcohol",
      "Ceramide NP",
      "Sodium Hyaluronate",
    ],
    concerns: ["dryness", "barrier"],
    skinTypes: ["dry", "normal"],
    variants: [{ id: "236ml", name: "236 ml" }],
    price: 12500,
    usd: 16,
    merchantUrl: "https://www.cerave.com/",
    accent: "#95a99c",
    form: "bottle",
  }),
  item({
    id: "ordinary-moisturizer",
    name: "Natural Moisturizing Factors + HA",
    brand: "The Ordinary",
    category: "moisturizer",
    description: "A moisturizer reference for an uncomplicated daily routine.",
    ingredients: [
      "Aqua",
      "Glycerin",
      "Sodium Hyaluronate",
      "Urea",
      "Allantoin",
    ],
    concerns: ["dryness", "barrier"],
    skinTypes: ["dry", "normal", "combination"],
    variants: [{ id: "100ml", name: "100 ml" }],
    price: 11500,
    usd: 14,
    merchantUrl: "https://theordinary.com/",
    accent: "#d9d1bf",
    form: "tube",
  }),
  item({
    id: "ordinary-niacinamide",
    name: "Niacinamide 10% + Zinc 1%",
    brand: "The Ordinary",
    category: "serum",
    description:
      "An ingredient-led serum reference. Introduce gradually and patch test.",
    ingredients: ["Aqua", "Niacinamide", "Pentylene Glycol", "Zinc PCA"],
    concerns: ["oiliness", "uneven-tone"],
    skinTypes: ["oily", "combination"],
    variants: [{ id: "30ml", name: "30 ml" }],
    price: 8500,
    usd: 7,
    merchantUrl: "https://theordinary.com/",
    accent: "#cfb68e",
    form: "dropper",
  }),
  item({
    id: "boj-sunscreen",
    name: "Relief Sun: Rice + Probiotics",
    brand: "Beauty of Joseon",
    category: "sunscreen",
    description:
      "A sunscreen reference. Verify local label, UV protection, directions and formula before purchase.",
    ingredients: [
      "Water",
      "Oryza Sativa Extract",
      "Dibutyl Adipate",
      "Niacinamide",
    ],
    concerns: ["sun-protection"],
    skinTypes: ["dry", "normal", "combination"],
    variants: [{ id: "50ml", name: "50 ml" }],
    price: 18000,
    usd: 18,
    merchantUrl: "https://beautyofjoseon.com/",
    accent: "#dddbce",
    form: "tube",
  }),
  item({
    id: "elf-lip",
    name: "O FACE Satin Lipstick",
    brand: "e.l.f. Cosmetics",
    category: "lipstick",
    description:
      "An expressive satin lip reference; preview colours are illustrative.",
    ingredients: ["Castor Seed Oil", "Squalane", "Jojoba Esters"],
    concerns: ["colour"],
    skinTypes: ["all"],
    variants: [
      { id: "rose", name: "Soft rose", hex: "#a95363", finish: "gloss" },
      { id: "terracotta", name: "Terracotta", hex: "#a24e3d", finish: "matte" },
      { id: "berry", name: "Berry muse", hex: "#793a59", finish: "gloss" },
      { id: "nude", name: "Warm nude", hex: "#b5786d", finish: "matte" },
    ],
    price: 9500,
    usd: 9,
    merchantUrl: "https://www.elfcosmetics.com/",
    accent: "#aa5d69",
    form: "lipstick",
  }),
  item({
    id: "elf-blush",
    name: "Camo Liquid Blush",
    brand: "e.l.f. Cosmetics",
    category: "blush",
    description: "A liquid blush reference for buildable cheek colour.",
    ingredients: ["Dimethicone", "Silica", "Iron Oxides"],
    concerns: ["colour"],
    skinTypes: ["all"],
    variants: [
      { id: "peach", name: "Peach study", hex: "#d68270" },
      { id: "rose", name: "Dusty rose", hex: "#b46573" },
      { id: "plum", name: "Soft plum", hex: "#9a4561" },
    ],
    price: 7800,
    usd: 7,
    merchantUrl: "https://www.elfcosmetics.com/",
    accent: "#d18a77",
    form: "bottle",
  }),
  item({
    id: "maybelline-foundation",
    name: "Fit Me Matte + Poreless",
    brand: "Maybelline",
    category: "foundation",
    description:
      "A complexion reference. Image shade previews cannot establish a physical shade match.",
    ingredients: ["Aqua", "Cyclopentasiloxane", "Dimethicone", "Iron Oxides"],
    concerns: ["coverage"],
    skinTypes: ["normal", "oily"],
    variants: [
      { id: "light", name: "Light study", hex: "#e7bc9b" },
      { id: "medium", name: "Medium study", hex: "#bb805c" },
      { id: "deep", name: "Deep study", hex: "#754d35" },
      { id: "rich", name: "Rich study", hex: "#4b3025" },
    ],
    price: 15500,
    usd: 11,
    merchantUrl: "https://www.maybelline.com/",
    accent: "#bc9572",
    form: "bottle",
  }),
  item({
    id: "nyx-shadow",
    name: "Ultimate Shadow Palette",
    brand: "NYX Professional Makeup",
    category: "eyeshadow",
    description: "A warm neutral palette reference for editable eye looks.",
    ingredients: ["Mica", "Talc", "Silica", "Iron Oxides"],
    concerns: ["colour"],
    skinTypes: ["all"],
    variants: [
      { id: "warm", name: "Warm neutrals", hex: "#976552" },
      { id: "rose", name: "Rose study", hex: "#a56d80" },
      { id: "bronze", name: "Bronze study", hex: "#ad8152" },
    ],
    price: 17000,
    usd: 20,
    merchantUrl: "https://www.nyxcosmetics.com/",
    accent: "#aa8068",
    form: "compact",
  }),
  item({
    id: "shea-conditioner",
    name: "Coconut & Hibiscus Conditioner",
    brand: "SheaMoisture",
    category: "haircare",
    description:
      "A textured-hair conditioner reference. Select based on your own hair preferences.",
    ingredients: [
      "Water",
      "Butyrospermum Parkii Butter",
      "Cocos Nucifera Oil",
      "Glycerin",
    ],
    concerns: ["conditioning", "dryness"],
    skinTypes: ["all"],
    variants: [{ id: "384ml", name: "384 ml" }],
    price: 14500,
    usd: 13,
    merchantUrl: "https://www.sheamoisture.com/",
    accent: "#a56a4c",
    form: "bottle",
  }),
];
