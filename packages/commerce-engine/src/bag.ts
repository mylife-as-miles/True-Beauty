/**
 * Shared shopping-bag identity and immutable line handling adapted from
 * MIROIR src/lib/cart.ts, f3c0661cb0594fff07e89c80fbe129e7e5bdffa5.
 * Copyright (c) 2026 MIROIR. MIT, ../THIRD_PARTY_LICENSE.txt.
 * Modified: variant+size identity, quantity validation, per-currency sums,
 * no invented shipping charge or checkout success.
 */
import type { Currency } from "./catalog";
export interface BagItem {
  id: string;
  name: string;
  kind: "skincare" | "makeup" | "haircare" | "apparel" | "accessory";
  price: number;
  currency: Currency;
  variantId?: string;
  sample: boolean;
}
export interface BagLine {
  item: BagItem;
  size?: string;
  qty: number;
}
export function lineKey(id: string, size?: string, variantId?: string): string {
  return JSON.stringify([id, size ?? "", variantId ?? ""]);
}
const keyOf = (l: BagLine) => lineKey(l.item.id, l.size, l.item.variantId);
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
  const key = lineKey(item.id, opts.size, item.variantId),
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
): BagLine[] {
  const key = lineKey(id, size, variantId);
  return bag.filter((l) => keyOf(l) !== key);
}
export function setLineQty(
  bag: BagLine[],
  id: string,
  qty: number,
  size?: string,
  variantId?: string,
): BagLine[] {
  if (qty === 0) return removeLine(bag, id, size, variantId);
  assertQty(qty);
  const key = lineKey(id, size, variantId);
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
