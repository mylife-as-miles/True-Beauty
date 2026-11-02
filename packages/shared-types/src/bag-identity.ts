/** Stable identity shared by persistence and commerce; currencies/merchant quotes never merge. */
export function bagLineIdentity(
  productId: string,
  size?: string,
  variantId?: string,
  currency = "NGN",
  sourceKey = "sample",
): string {
  return JSON.stringify([
    productId,
    size ?? "",
    variantId ?? "default",
    currency,
    sourceKey,
  ]);
}
