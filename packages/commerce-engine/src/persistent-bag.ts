import { z } from "zod";
import {
  db,
  normalizeShoppingBag,
  type ShoppingBag,
} from "../../local-database/src";
import { addLine, setLineQty, removeLine, lineKey, type BagLine } from "./bag";
import {
  allowedReferenceUrl,
  trustedObservation,
  observationState,
  type MerchantObservation,
} from "./merchant";
import type { Currency } from "./catalog";
const selectionSchema = z
  .object({
    productId: z.string().min(1).max(150),
    productName: z.string().min(1).max(240),
    variantId: z.string().min(1).max(150),
    variantName: z.string().max(200).optional(),
    size: z.string().max(100).optional(),
    currency: z.enum(["NGN", "USD", "GBP", "EUR"]),
    unitPrice: z.number().finite().nonnegative().max(100000000),
    priceKind: z.enum(["sample", "verified"]),
    sourceKey: z.string().min(1).max(200).default("sample"),
    merchantSourceId: z.string().max(80).optional(),
    sourceUrl: z.string().url().optional(),
    priceObservedAt: z.string().datetime().optional(),
  })
  .strict();
export type BagSelection = z.input<typeof selectionSchema>;
function engineLine(row: ShoppingBag): BagLine {
  const r = normalizeShoppingBag(row);
  return {
    item: {
      id: r.productId,
      name: r.productName ?? r.productId,
      kind: "makeup",
      variantId: r.variantId,
      price: r.unitPrice ?? 0,
      currency: r.currency ?? "NGN",
      sourceKey: r.sourceKey,
      sample: r.priceKind !== "verified",
    },
    size: r.size,
    qty: r.quantity,
  };
}
/** The zero fallback above is used only by quantity/identity algebra. UI must preserve missing-price state, never display it as a free product. */
export async function addBagSelection(value: BagSelection) {
  const input = selectionSchema.parse(value);
  if (
    input.priceKind === "verified" &&
    (!input.sourceUrl || !allowedReferenceUrl(input.sourceUrl))
  )
    throw new Error("This quote does not have a reviewed official source");
  return db.transaction("rw", db.shoppingBags, async () => {
    const rows = (await db.shoppingBags.toArray()).map(normalizeShoppingBag);
    const desired = lineKey(
      input.productId,
      input.size,
      input.variantId,
      input.currency,
      input.sourceKey,
    );
    const existing = rows.find((r) => r.lineKey === desired);
    const next = addLine(
      rows.map(engineLine),
      {
        id: input.productId,
        name: input.productName,
        kind: "makeup",
        variantId: input.variantId,
        price: input.unitPrice,
        currency: input.currency,
        sourceKey: input.sourceKey,
        sample: input.priceKind === "sample",
      },
      { size: input.size },
    );
    const qty = next.find(
      (l) =>
        lineKey(
          l.item.id,
          l.size,
          l.item.variantId,
          l.item.currency,
          l.item.sourceKey,
        ) === desired,
    )?.qty;
    if (!qty) throw new Error("The bag line could not be created");
    const record = normalizeShoppingBag({
      id: existing?.id ?? crypto.randomUUID(),
      ...input,
      quantity: qty,
      addedAt: existing?.addedAt ?? Date.now(),
    });
    await db.shoppingBags.put(record);
    return record;
  });
}
export async function setBagQuantity(id: string, quantity: number) {
  return db.transaction("rw", db.shoppingBags, async () => {
    const rows = (await db.shoppingBags.toArray()).map(normalizeShoppingBag),
      row = rows.find((r) => r.id === id);
    if (!row) throw new Error("This bag line no longer exists");
    const updated = setLineQty(
      rows.map(engineLine),
      row.productId,
      quantity,
      row.size,
      row.variantId,
      row.currency as Currency,
      row.sourceKey,
    );
    const result = updated.find(
      (l) =>
        lineKey(
          l.item.id,
          l.size,
          l.item.variantId,
          l.item.currency,
          l.item.sourceKey,
        ) === row.lineKey,
    );
    if (!result) {
      await db.shoppingBags.delete(id);
      return;
    }
    await db.shoppingBags.update(id, { quantity: result.qty });
  });
}
export async function removeBagSelection(id: string) {
  return db.transaction("rw", db.shoppingBags, async () => {
    const rows = (await db.shoppingBags.toArray()).map(normalizeShoppingBag),
      row = rows.find((r) => r.id === id);
    if (!row) return;
    const next = removeLine(
      rows.map(engineLine),
      row.productId,
      row.size,
      row.variantId,
      row.currency as Currency,
      row.sourceKey,
    );
    if (next.length !== rows.length - 1)
      throw new Error("The bag line could not be resolved");
    await db.shoppingBags.delete(id);
  });
}
export async function addObservedQuote(quote: MerchantObservation) {
  const checked = trustedObservation(quote);
  if (
    !checked ||
    quote.status !== "observed" ||
    quote.imported ||
    quote.amount === undefined ||
    !quote.currency ||
    quote.availability === "out-of-stock"
  )
    throw new Error("Use a recent available source quote");
  if (observationState(quote).stale)
    throw new Error("Refresh this source before adding its quote");
  const productId = `merchant:${quote.sourceId}:${quote.referenceId}`;
  return db.transaction("rw", [db.products, db.shoppingBags], async () => {
    await db.products.put({
      id: productId,
      name: quote.title,
      brand: quote.merchant,
      category: "merchant-reference",
      source: "merchant-observation",
      sourceUrl: quote.sourceUrl,
    });
    return addBagSelection({
      productId,
      productName: quote.title,
      variantId: quote.variantId,
      variantName: quote.variantName,
      currency: quote.currency!,
      unitPrice: quote.amount!,
      priceKind: "verified",
      sourceKey: `merchant:${quote.sourceId}:${quote.referenceId}`,
      merchantSourceId: quote.sourceId,
      sourceUrl: quote.sourceUrl,
      priceObservedAt: quote.fetchedAt,
    });
  });
}
