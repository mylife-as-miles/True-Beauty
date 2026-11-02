import "fake-indexeddb/auto";
import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { db } from "../../local-database/src";
import {
  addBagSelection,
  setBagQuantity,
  removeBagSelection,
  addObservedQuote,
} from "./persistent-bag";
import { parseMerchantHtml, MERCHANT_SOURCES } from "./merchant";
beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterAll(async () => db.delete());
const selection = {
  productId: "elf-lip",
  productName: "Lipstick",
  variantId: "rose",
  variantName: "Soft rose",
  currency: "NGN" as const,
  unitPrice: 9500,
  priceKind: "sample" as const,
  sourceKey: "sample",
};
describe("persistent variant/currency bag", () => {
  it("transactionally separates shades and currencies and changes/removes only the intended line", async () => {
    const rose = await addBagSelection(selection);
    const berry = await addBagSelection({
      ...selection,
      variantId: "berry",
      variantName: "Berry muse",
    });
    await addBagSelection({ ...selection, currency: "USD", unitPrice: 9 });
    await Promise.all([addBagSelection(selection), addBagSelection(selection)]);
    expect(await db.shoppingBags.count()).toBe(3);
    expect((await db.shoppingBags.get(rose.id))?.quantity).toBe(3);
    await setBagQuantity(berry.id, 2);
    expect((await db.shoppingBags.get(berry.id))?.quantity).toBe(2);
    await removeBagSelection(rose.id);
    expect(await db.shoppingBags.count()).toBe(2);
    expect(await db.shoppingBags.get(rose.id)).toBeUndefined();
  });
  it("rejects invalid quantities and does not turn an imported or expired quote into a verified bag price", async () => {
    const row = await addBagSelection(selection);
    await expect(setBagQuantity(row.id, 1.5)).rejects.toThrow();
    const source = MERCHANT_SOURCES[0],
      reference = source.references[0];
    const quote = parseMerchantHtml(
      `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: reference.title, url: reference.url, offers: { "@type": "Offer", sku: "fixture", price: "100", priceCurrency: "NGN", availability: "https://schema.org/InStock" } })}</script>`,
      source,
      reference,
    )[0];
    await expect(
      addObservedQuote({ ...quote, imported: true }),
    ).rejects.toThrow();
    await expect(
      addObservedQuote({ ...quote, fetchedAt: "2020-01-01T00:00:00.000Z" }),
    ).rejects.toThrow();
    expect(await db.products.count()).toBe(0);
  });
});
