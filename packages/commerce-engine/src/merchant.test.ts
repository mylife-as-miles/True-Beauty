import { describe, it, expect } from "vitest";
import {
  parseMerchantHtml,
  availabilityOf,
  allowedReferenceUrl,
  observationState,
  trustedObservation,
  MERCHANT_SOURCES,
  type MerchantSource,
} from "./merchant";
const source: MerchantSource = {
  id: "fixture",
  name: "Fixture Official",
  origin: "https://official.example",
  region: "NG",
  enabled: true,
  note: "Test fixture only",
  references: [
    {
      id: "cream",
      sourceId: "fixture",
      title: "Cream",
      url: "https://official.example/products/cream",
    },
  ],
};
const ref = source.references[0];
const html = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
const product = (offers: unknown) => ({
  "@type": "Product",
  url: ref.url,
  name: "Cream",
  offers,
});
const offer = (extra: Record<string, unknown> = {}) => ({
  "@type": "Offer",
  price: "12500.00",
  priceCurrency: "NGN",
  availability: "https://schema.org/InStock",
  sku: "50ml",
  ...extra,
});
describe("merchant structured-data facts", () => {
  it("uses only explicit exact price, currency and stock from the matching Product/Offer", () => {
    const rows = parseMerchantHtml(
      html({
        "@graph": [
          product([
            offer(),
            offer({
              sku: "100ml",
              price: "20000",
              availability: "https://schema.org/OutOfStock",
            }),
          ]),
          {
            "@type": "Product",
            url: "https://official.example/products/other",
            name: "Other",
            offers: offer({ price: "1" }),
          },
        ],
      }),
      source,
      ref,
      "2026-11-02T12:00:00.000Z",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      amount: 12500,
      currency: "NGN",
      availability: "in-stock",
      variantId: "50ml",
    });
    expect(rows[1]).toMatchObject({
      amount: 20000,
      availability: "out-of-stock",
    });
  });
  it("does not guess currency, stock, aggregate ranges or malformed numeric prices", () => {
    for (const extra of [
      { priceCurrency: undefined },
      { price: "from 20" },
      { price: "1,200" },
      { price: -1 },
      { priceCurrency: "XYZ" },
    ]) {
      const row = parseMerchantHtml(
        html(product(offer(extra))),
        source,
        ref,
      )[0];
      expect(row.amount).toBeUndefined();
      expect(row.currency).toBeUndefined();
    }
    expect(availabilityOf(undefined)).toBe("unknown");
    expect(availabilityOf("https://schema.org/PreOrder")).toBe("unknown");
    expect(
      parseMerchantHtml(
        html(
          product({
            "@type": "AggregateOffer",
            lowPrice: "10",
            highPrice: "50",
            priceCurrency: "USD",
          }),
        ),
        source,
        ref,
      )[0].status,
    ).toBe("unavailable");
  });
  it("rejects malformed scripts safely and ignores untrusted names/URLs outside a matching product", () => {
    expect(
      parseMerchantHtml(
        '<script type="application/ld+json">bad()</script>',
        source,
        ref,
      )[0],
    ).toMatchObject({ status: "unavailable", availability: "unknown" });
    expect(() => parseMerchantHtml("x".repeat(2500001), source, ref)).toThrow();
  });
  it("only resolves exact allowlisted HTTPS product URLs, without query, credentials or alternate hosts", () => {
    expect(allowedReferenceUrl(ref.url, [source])).toEqual(ref);
    for (const url of [
      "http://official.example/products/cream",
      "https://official.example.evil.test/products/cream",
      "https://127.0.0.1/products/cream",
      "https://official.example/products/cream?target=http://localhost",
      "https://user@official.example/products/cream",
      "https://official.example/products/unknown",
    ])
      expect(allowedReferenceUrl(url, [source])).toBeUndefined();
  });
  it("marks old and imported observations honestly and revalidates stored source identity", () => {
    const row = parseMerchantHtml(
      html(product(offer())),
      source,
      ref,
      "2026-11-02T12:00:00.000Z",
    )[0];
    expect(
      observationState(row, Date.parse("2026-11-04T12:00:00Z")).stale,
    ).toBe(true);
    expect(observationState({ ...row, imported: true }).label).toContain(
      "Imported",
    );
    expect(
      trustedObservation({ ...row, sourceUrl: "https://evil.test" }, [source]),
    ).toBeNull();
    expect(trustedObservation(row, [source])).toBeTruthy();
    expect(MERCHANT_SOURCES.some((s) => s.region === "NG" && s.enabled)).toBe(
      true,
    );
  });
});
it("expires a source quote when the source validity date ends, even if fetched recently", () => {
  const observation = parseMerchantHtml(
    html(product(offer({ priceValidUntil: "2026-11-01" }))),
    source,
    ref,
    "2026-11-02T12:00:00.000Z",
  )[0];
  expect(
    observationState(observation, Date.parse("2026-11-02T12:01:00Z")),
  ).toMatchObject({
    stale: true,
    priceExpired: true,
    label: "Source price validity expired",
  });
});
