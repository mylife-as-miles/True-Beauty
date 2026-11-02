/**
 * Shared shopping-bag identity and immutable line handling adapted from
 * MIROIR src/lib/cart.ts, f3c0661cb0594fff07e89c80fbe129e7e5bdffa5.
 * Copyright (c) 2026 MIROIR. MIT, ../THIRD_PARTY_LICENSE.txt.
 * Modified: variant+size identity, quantity validation, per-currency sums,
 * no invented shipping charge or checkout success.
 */
import type { Currency } from "./catalog";
import { bagLineIdentity } from "../../shared-types/src/bag-identity";
export interface BagItem {
  id: string;
  name: string;
  kind: "skincare" | "makeup" | "haircare" | "apparel" | "accessory";
  price: number;
  currency: Currency;
  variantId?: string;
  sourceKey?: string;
  sample: boolean;
}
export interface BagLine {
  item: BagItem;
  size?: string;
  qty: number;
}
export function lineKey(
  id: string,
  size?: string,
  variantId?: string,
  currency: Currency = "NGN",
  sourceKey = "sample",
): string {
  return bagLineIdentity(id, size, variantId, currency, sourceKey);
}
const keyOf = (line: BagLine) =>
  lineKey(
    line.item.id,
    line.size,
    line.item.variantId,
    line.item.currency,
    line.item.sourceKey,
  );
function selectedKey(
  bag: BagLine[],
  id: string,
  size?: string,
  variantId?: string,
  currency?: Currency,
  sourceKey?: string,
) {
  const matches = bag.filter(
    (l) =>
      l.item.id === id &&
      (l.size ?? "") === (size ?? "") &&
      (l.item.variantId ?? "") === (variantId ?? "") &&
      (!currency || l.item.currency === currency) &&
      (!sourceKey || (l.item.sourceKey ?? "sample") === sourceKey),
  );
  if (matches.length > 1)
    throw new Error("Specify a currency and source for this bag variant");
  return matches[0] ? keyOf(matches[0]) : undefined;
}
function assertQty(qty: number) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 99)
    throw new Error("Quantity must be an integer from 1 to 99");
}
export function addLine(
  bag: BagLine[],
  item: BagItem,
  opts: { size?: string; qty?: number } = {},
): BagLine[] {
  const qty = opts.qty ?? 1;
  assertQty(qty);
  if (!Number.isFinite(item.price) || item.price < 0)
    throw new Error("Invalid price");
  const key = lineKey(
      item.id,
      opts.size,
      item.variantId,
      item.currency,
      item.sourceKey,
    ),
    existing = bag.find((l) => keyOf(l) === key);
  if (existing) {
    if (existing.item.currency !== item.currency)
      throw new Error(
        "Remove the existing variant before adding it in another currency",
      );
    assertQty(existing.qty + qty);
    return bag.map((l) => (keyOf(l) === key ? { ...l, qty: l.qty + qty } : l));
  }
  return [...bag, { item, size: opts.size, qty }];
}
export function removeLine(
  bag: BagLine[],
  id: string,
  size?: string,
  variantId?: string,
  currency?: Currency,
  sourceKey?: string,
): BagLine[] {
  const key = selectedKey(bag, id, size, variantId, currency, sourceKey);
  return key ? bag.filter((l) => keyOf(l) !== key) : bag;
}
export function setLineQty(
  bag: BagLine[],
  id: string,
  qty: number,
  size?: string,
  variantId?: string,
  currency?: Currency,
  sourceKey?: string,
): BagLine[] {
  if (qty === 0)
    return removeLine(bag, id, size, variantId, currency, sourceKey);
  assertQty(qty);
  const key = selectedKey(bag, id, size, variantId, currency, sourceKey);
  return bag.map((l) => (keyOf(l) === key ? { ...l, qty } : l));
}
export function bagCount(bag: BagLine[]): number {
  return bag.reduce((sum, l) => sum + l.qty, 0);
}
export function bagTotals(bag: BagLine[]): Partial<Record<Currency, number>> {
  const minor = bag.reduce<Partial<Record<Currency, number>>>((s, l) => {
    const c = l.item.currency;
    s[c] = (s[c] ?? 0) + Math.round(l.item.price * 100) * l.qty;
    return s;
  }, {});
  return Object.fromEntries(
    Object.entries(minor).map(([currency, amount]) => [currency, amount / 100]),
  );
}
