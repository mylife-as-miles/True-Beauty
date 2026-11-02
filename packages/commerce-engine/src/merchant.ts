import { z } from "zod";
export const merchantCurrencies = ["NGN", "USD", "GBP", "EUR"] as const;
export type MerchantCurrency = (typeof merchantCurrencies)[number];
export interface MerchantReference {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  catalogProductId?: string;
}
export interface MerchantSource {
  id: string;
  name: string;
  origin: string;
  region: "NG" | "US" | "global";
  enabled: boolean;
  note: string;
  references: MerchantReference[];
}
/** Fixed official product pages only. No arbitrary URL, search, cart or checkout fetch. */
export const MERCHANT_SOURCES: MerchantSource[] = [
  {
    id: "nuban",
    name: "Nuban Beauty",
    origin: "https://nubanbeauty.com",
    region: "NG",
    enabled: true,
    note: "Official Nigerian brand storefront. Prices are shown in naira only when the merchant explicitly publishes them.",
    references: [
      {
        id: "nuban-fixing-spray",
        sourceId: "nuban",
        title: "SEAL IT! MAKEUP FIXING SPRAY (105ml)",
        url: "https://nubanbeauty.com/products/seal-it-makeup-fixing-spray",
      },
      {
        id: "nuban-gloss",
        sourceId: "nuban",
        title: "PRO GLOSS MINI LIPSTICKS [Singles]",
        url: "https://nubanbeauty.com/products/pro-gloss-mini-lipsticks",
      },
    ],
  },
  {
    id: "boj",
    name: "Beauty of Joseon",
    origin: "https://beautyofjoseon.com",
    region: "global",
    enabled: true,
    note: "Official brand storefront. Price and stock are source observations, not shipping-to-Nigeria availability.",
    references: [
      {
        id: "boj-glow-serum",
        sourceId: "boj",
        title: "Glow Serum : Propolis + Niacinamide",
        url: "https://beautyofjoseon.com/products/glow-serum-propolis-niacinamide",
      },
    ],
  },
  {
    id: "ordinary",
    name: "The Ordinary",
    origin: "https://theordinary.com",
    region: "US",
    enabled: true,
    note: "Official US storefront. Its observed 30ml offer is separate from the illustrative 100ml catalogue entry.",
    references: [
      {
        id: "ordinary-nmf-30ml",
        sourceId: "ordinary",
        title: "Natural Moisturizing Factors + HA",
        url: "https://theordinary.com/en-us/natural-moisturizing-factors-ha-moisturizer-100435.html",
        catalogProductId: "ordinary-moisturizer",
      },
    ],
  },
];
export const observationSchema = z
  .object({
    id: z.string().min(1).max(250),
    sourceId: z.string().min(1).max(80),
    referenceId: z.string().min(1).max(100),
    catalogProductId: z.string().max(100).optional(),
    merchant: z.string().min(1).max(150),
    title: z.string().min(1).max(240),
    variantId: z.string().min(1).max(150),
    variantName: z.string().max(200).optional(),
    amount: z.number().finite().min(0).max(100000000).optional(),
    currency: z.enum(merchantCurrencies).optional(),
    availability: z.enum(["in-stock", "out-of-stock", "unknown"]),
    fetchedAt: z.string().datetime(),
    sourceUrl: z.string().url().max(1000),
    evidenceType: z.literal("json-ld"),
    status: z.enum(["observed", "unavailable"]),
    note: z.string().max(700),
    validUntil: z.string().max(100).optional(),
    imported: z.boolean().optional(),
  })
  .strict();
export type MerchantObservation = z.infer<typeof observationSchema>;
export interface MerchantRefreshResult {
  sourceId: string;
  referenceId: string;
  fetchedAt: string;
  observations: MerchantObservation[];
  cached: boolean;
  nextRefreshAt: string;
}
export function referenceById(
  sourceId: string,
  referenceId: string,
  sources: MerchantSource[] = MERCHANT_SOURCES,
) {
  return sources
    .find((s) => s.id === sourceId)
    ?.references.find((r) => r.id === referenceId);
}
export function allowedReferenceUrl(
  url: string,
  sources: MerchantSource[] = MERCHANT_SOURCES,
): MerchantReference | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  )
    return undefined;
  return sources
    .filter((s) => s.enabled && s.origin === parsed.origin)
    .flatMap((s) => s.references)
    .find((r) => r.url === parsed.href);
}
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function isType(value: unknown, type: string) {
  return (Array.isArray(value) ? value : [value]).some(
    (v) =>
      typeof v === "string" &&
      (v === type ||
        v === `https://schema.org/${type}` ||
        v === `http://schema.org/${type}`),
  );
}
function nodes(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 12) return [];
  if (Array.isArray(value))
    return value.slice(0, 150).flatMap((v) => nodes(v, depth + 1));
  const obj = record(value);
  if (!obj) return [];
  return [
    obj,
    ...[
      "@graph",
      "mainEntity",
      "itemListElement",
      "item",
      "hasVariant",
    ].flatMap((k) => nodes(obj[k], depth + 1)),
  ];
}
const short = (v: unknown, max = 200) =>
  typeof v === "string"
    ? v
        .replace(/\p{Cc}/gu, " ")
        .trim()
        .slice(0, max)
    : undefined;
function absolute(v: unknown, base: string): URL | null {
  if (typeof v !== "string") return null;
  try {
    return new URL(v, base);
  } catch {
    return null;
  }
}
function sameProduct(url: unknown, reference: MerchantReference) {
  const a = absolute(url, reference.url),
    b = new URL(reference.url);
  return (
    !!a &&
    a.protocol === "https:" &&
    a.origin === b.origin &&
    a.pathname.replace(/\/$/, "") === b.pathname.replace(/\/$/, "")
  );
}
function matchesProduct(
  product: Record<string, unknown>,
  reference: MerchantReference,
) {
  const page = record(product.mainEntityOfPage);
  const urls = [product.url, product["@id"], page?.["@id"]];
  if (urls.some((u) => sameProduct(u, reference))) return true;
  const name =
    short(product.name)
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? "";
  const expected = reference.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    urls.every((u) => u === undefined) &&
    name.length > 5 &&
    (name.includes(expected) || expected.includes(name))
  );
}
function price(value: unknown): number | undefined {
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 && value <= 100000000
      ? value
      : undefined;
  if (typeof value === "string" && /^\d+(?:\.\d{1,4})?$/.test(value)) {
    const p = Number(value);
    return p <= 100000000 ? p : undefined;
  }
  return undefined;
}
export function availabilityOf(
  value: unknown,
): MerchantObservation["availability"] {
  if (typeof value !== "string") return "unknown";
  const name = value.replace(/^https?:\/\/schema\.org\//, "");
  return name === "InStock"
    ? "in-stock"
    : ["OutOfStock", "SoldOut", "Discontinued"].includes(name)
      ? "out-of-stock"
      : "unknown";
}
export function unavailableObservation(
  source: MerchantSource,
  reference: MerchantReference,
  fetchedAt: string,
  note: string,
): MerchantObservation {
  return {
    id: crypto.randomUUID(),
    sourceId: source.id,
    referenceId: reference.id,
    catalogProductId: reference.catalogProductId,
    merchant: source.name,
    title: reference.title,
    variantId: "unknown",
    availability: "unknown",
    fetchedAt,
    sourceUrl: reference.url,
    evidenceType: "json-ld",
    status: "unavailable",
    note: note.slice(0, 700),
  };
}
/** Parse factual merchant Product/Offer schema. Never evaluates scripts or infers currency, stock, variant price, shipping or an order. */
export function parseMerchantHtml(
  html: string,
  source: MerchantSource,
  reference: MerchantReference,
  fetchedAt = new Date().toISOString(),
): MerchantObservation[] {
  if (html.length > 2500000)
    throw new Error("Product page exceeds the parsing limit");
  const products: Record<string, unknown>[] = [];
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi);
  for (const match of scripts) {
    if (
      !/\btype\s*=\s*["']application\/ld\+json(?:\s*;[^"']*)?["']/i.test(
        match[1],
      )
    )
      continue;
    try {
      const data = JSON.parse(match[2]);
      products.push(
        ...nodes(data).filter(
          (n) => isType(n["@type"], "Product") && matchesProduct(n, reference),
        ),
      );
    } catch {
      /* Malformed individual schema blocks do not create a quotation. */
    }
  }
  const observations: MerchantObservation[] = [];
  for (const product of products.slice(0, 3)) {
    const offers = Array.isArray(product.offers)
      ? product.offers
      : [product.offers];
    for (const [index, raw] of offers.slice(0, 50).entries()) {
      const offer = record(raw);
      if (!offer || !isType(offer["@type"], "Offer")) continue;
      const specification = record(offer.priceSpecification);
      const amount = price(offer.price ?? specification?.price);
      const currencyRaw = offer.priceCurrency ?? specification?.priceCurrency;
      const currency = merchantCurrencies.includes(
        currencyRaw as MerchantCurrency,
      )
        ? (currencyRaw as MerchantCurrency)
        : undefined;
      const offerUrl = absolute(offer.url, reference.url);
      const sku = short(offer.sku) ?? short(product.sku);
      const variantId = (
        sku ??
        offerUrl?.searchParams.get("variant") ??
        short(offer["@id"]) ??
        `offer-${index}`
      ).slice(0, 150);
      const observation: MerchantObservation = {
        id: crypto.randomUUID(),
        sourceId: source.id,
        referenceId: reference.id,
        catalogProductId: reference.catalogProductId,
        merchant: source.name,
        title: short(product.name, 240) ?? reference.title,
        variantId,
        variantName: short(offer.name) ?? (sku ? `SKU ${sku}` : undefined),
        ...(amount !== undefined && currency ? { amount, currency } : {}),
        availability: availabilityOf(offer.availability),
        fetchedAt,
        sourceUrl: reference.url,
        evidenceType: "json-ld",
        status: "observed",
        note:
          amount !== undefined && currency
            ? "Public product-page structured data observed at this time. Recheck at merchant before purchase; shipping and taxes may differ."
            : "No explicit supported currency and exact offer price were present. No price has been inferred.",
        validUntil: short(offer.priceValidUntil, 100),
      };
      observations.push(observationSchema.parse(observation));
    }
  }
  const unique = new Map<string, MerchantObservation>();
  for (const o of observations) {
    const key = `${o.variantId}:${o.currency ?? ""}:${o.amount ?? ""}`;
    const previous = unique.get(key);
    unique.set(key, {
      ...previous,
      ...o,
      validUntil: o.validUntil ?? previous?.validUntil,
    });
  }
  return unique.size
    ? [...unique.values()]
    : [
        unavailableObservation(
          source,
          reference,
          fetchedAt,
          "No matching Product/Offer structured data was available. A product page is not proof of a current price or stock.",
        ),
      ];
}
export function trustedObservation(
  value: unknown,
  sources: MerchantSource[] = MERCHANT_SOURCES,
): MerchantObservation | null {
  const parsed = observationSchema.safeParse(value);
  if (!parsed.success) return null;
  const o = parsed.data,
    source = sources.find((s) => s.id === o.sourceId && s.enabled),
    reference = source?.references.find((r) => r.id === o.referenceId);
  return reference &&
    reference.url === o.sourceUrl &&
    source?.name === o.merchant
    ? o
    : null;
}
export function observationState(
  observation: MerchantObservation,
  now = Date.now(),
) {
  const ageMs = Math.max(0, now - Date.parse(observation.fetchedAt));
  const expiry = observation.validUntil
    ? Date.parse(observation.validUntil)
    : NaN;
  const priceExpired =
    Number.isFinite(expiry) &&
    now >
      expiry +
        (/^\d{4}-\d{2}-\d{2}$/.test(observation.validUntil ?? "")
          ? 86400000
          : 0);
  const stale = ageMs > 86400000 || priceExpired;
  return {
    ageMs,
    stale,
    priceExpired,
    hasPrice:
      observation.amount !== undefined && observation.currency !== undefined,
    imported: observation.imported === true,
    label: observation.imported
      ? "Imported record · refresh to verify"
      : observation.status === "unavailable"
        ? "Source unavailable"
        : priceExpired
          ? "Source price validity expired"
          : stale
            ? "Saved observation · needs refresh"
            : "Recent merchant observation",
  };
}
