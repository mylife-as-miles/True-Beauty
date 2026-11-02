import "fake-indexeddb/auto";
import { beforeEach, afterAll, describe, it, expect } from "vitest";
import { db } from "../../local-database/src";
import {
  saveUserProduct,
  removeUserProduct,
  asUserProductRecord,
  type UserProductInput,
} from "./user-products";
beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterAll(async () => db.delete());
const input: UserProductInput = {
  name: "My actual cream",
  brand: "A user-entered brand",
  category: "moisturizer",
  variantName: "50 ml",
  inci: "Aqua, Glycerin, Aloe (leaf, juice), glycerin",
  ingredientSource: "packaging",
  sourceUrl: "",
  openedAt: "",
  note: "I prefer its texture.",
};
describe("user-owned product records", () => {
  it("stores source-attributed ingredient text and an actual owned relationship, allows edit and explicit deletion", async () => {
    const product = await saveUserProduct(input);
    expect(product.ingredients).toEqual([
      "Aqua",
      "glycerin",
      "Aloe (leaf, juice)",
    ]);
    expect(product.source).toBe("user-provided");
    expect((await db.ownedProducts.toArray())[0].productId).toBe(product.id);
    const updated = await saveUserProduct(
      { ...input, name: "My revised cream" },
      product.id,
    );
    expect(updated.createdAt).toBe(product.createdAt);
    expect(await db.products.count()).toBe(1);
    await removeUserProduct(product.id);
    expect(await db.products.count()).toBe(0);
    expect(await db.ownedProducts.count()).toBe(0);
  });
  it("does not silently truncate long labels or turn an unprovided source into verified INCI", async () => {
    await expect(
      saveUserProduct({
        ...input,
        inci: Array.from({ length: 201 }, (_, i) => `Ingredient${i}`).join(","),
      }),
    ).rejects.toThrow(/200/);
    await expect(
      saveUserProduct({ ...input, ingredientSource: "not-provided" }),
    ).rejects.toThrow();
    await expect(
      saveUserProduct({
        ...input,
        ingredientSource: "manufacturer-page",
        sourceUrl: "",
      }),
    ).rejects.toThrow();
    await expect(
      saveUserProduct({ ...input, sourceUrl: "javascript:alert(1)" }),
    ).rejects.toThrow();
    expect(await db.products.count()).toBe(0);
  });
  it("ignores malformed imported user-product shapes before UI rendering", () => {
    expect(
      asUserProductRecord({
        kind: "user-product",
        id: "bad",
        ingredients: "not an array",
      }),
    ).toBeNull();
  });
});
