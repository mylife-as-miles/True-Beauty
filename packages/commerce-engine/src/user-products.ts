import { z } from "zod";
import { parseINCI } from "../../beauty-intelligence/src/ingredients";
import { db, type ProductRecord } from "../../local-database/src";
export const userProductSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    brand: z.string().trim().max(100),
    category: z.enum([
      "cleanser",
      "moisturizer",
      "serum",
      "sunscreen",
      "lipstick",
      "blush",
      "foundation",
      "eyeshadow",
      "haircare",
      "other",
    ]),
    variantName: z.string().trim().max(120),
    inci: z.string().trim().max(15000),
    ingredientSource: z.enum([
      "packaging",
      "manufacturer-page",
      "not-provided",
    ]),
    sourceUrl: z.union([
      z.literal(""),
      z
        .string()
        .url()
        .max(1000)
        .refine((v) => {
          const u = new URL(v);
          return (
            u.protocol === "https:" && !u.username && !u.password && !u.port
          );
        }, "Use an HTTPS page without credentials"),
    ]),
    openedAt: z.union([
      z.literal(""),
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((v) => {
          const t = Date.parse(v + "T00:00:00Z");
          return (
            Number.isFinite(t) &&
            new Date(t).toISOString().slice(0, 10) === v &&
            t <= Date.now()
          );
        }, "Choose a valid date today or earlier"),
    ]),
    note: z.string().trim().max(1500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.ingredientSource !== "not-provided" && !value.inci)
      ctx.addIssue({
        code: "custom",
        path: ["inci"],
        message: "Paste the ingredient text or choose Not provided",
      });
    if (value.ingredientSource === "not-provided" && value.inci)
      ctx.addIssue({
        code: "custom",
        path: ["ingredientSource"],
        message: "Select the source of the pasted ingredient text",
      });
    if (value.ingredientSource === "manufacturer-page" && !value.sourceUrl)
      ctx.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "Add the manufacturer page for your ingredient text",
      });
  });
export type UserProductInput = z.infer<typeof userProductSchema>;
export interface UserProductRecord extends ProductRecord {
  kind: "user-product";
  brand: string;
  category: string;
  variantName: string;
  ingredients: string[];
  inciText?: string;
  ingredientSource: UserProductInput["ingredientSource"];
  sourceUrl: string;
  source: "user-provided";
  createdAt: number;
  updatedAt: number;
  note: string;
  openedAt?: number;
}
export function asUserProductRecord(value: unknown): UserProductRecord | null {
  const parsed = z
    .object({
      id: z.string().min(1).max(200),
      kind: z.literal("user-product"),
      name: z.string().min(1).max(180),
      brand: z.string().max(100),
      category: userProductSchema.shape.category,
      variantName: z.string().max(120),
      ingredients: z.array(z.string().max(200)).max(200),
      inciText: z.string().max(15000).optional(),
      ingredientSource: userProductSchema.shape.ingredientSource,
      sourceUrl: userProductSchema.shape.sourceUrl,
      source: z.literal("user-provided"),
      createdAt: z.number().finite(),
      updatedAt: z.number().finite(),
      note: z.string().max(1500),
      openedAt: z.number().finite().optional(),
    })
    .safeParse(value);
  return parsed.success ? parsed.data : null;
}
function validateIngredientBounds(text: string) {
  let depth = 0,
    token = "",
    count = 0;
  const accept = () => {
    if (token.trim()) {
      count++;
      if (token.trim().length > 200)
        throw new Error(
          "Each ingredient name must be no longer than 200 characters",
        );
    }
    token = "";
  };
  for (const c of text) {
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
    if ((c === "," || c === ";" || c === "\n") && depth === 0) accept();
    else token += c;
  }
  accept();
  if (count > 200) throw new Error("Use no more than 200 ingredient names");
}
export async function saveUserProduct(
  value: UserProductInput,
  id?: string,
): Promise<UserProductRecord> {
  const data = userProductSchema.parse(value);
  validateIngredientBounds(data.inci);
  const ingredients = parseINCI(data.inci);
  const now = Date.now(),
    productId = id ?? `owned:${crypto.randomUUID()}`;
  return db.transaction("rw", [db.products, db.ownedProducts], async () => {
    const previous = id ? await db.products.get(id) : undefined;
    if (id && previous?.kind !== "user-product")
      throw new Error("Only your own product records can be edited");
    const record: UserProductRecord = {
      id: productId,
      kind: "user-product",
      name: data.name,
      brand: data.brand,
      category: data.category,
      variantName: data.variantName,
      ingredients,
      inciText: data.inci,
      ingredientSource: data.ingredientSource,
      sourceUrl: data.sourceUrl,
      source: "user-provided",
      createdAt:
        typeof previous?.createdAt === "number" ? previous.createdAt : now,
      updatedAt: now,
      note: data.note,
      ...(data.openedAt
        ? { openedAt: Date.parse(data.openedAt + "T00:00:00Z") }
        : {}),
    };
    await db.products.put(record);
    const owned = await db.ownedProducts
      .where("productId")
      .equals(productId)
      .first();
    await db.ownedProducts.put({
      id: owned?.id ?? crypto.randomUUID(),
      productId,
      name: record.name,
      addedAt: owned?.addedAt ?? now,
      openedAt: record.openedAt,
      note: record.note,
    });
    return record;
  });
}
export async function removeUserProduct(id: string) {
  return db.transaction(
    "rw",
    [db.products, db.ownedProducts, db.productVariants, db.shoppingBags],
    async () => {
      const product = await db.products.get(id);
      if (product?.kind !== "user-product")
        throw new Error("This is not a user product");
      await db.ownedProducts.where("productId").equals(id).delete();
      await db.productVariants.where("productId").equals(id).delete();
      await db.shoppingBags.where("productId").equals(id).delete();
      await db.products.delete(id);
    },
  );
}
export function userProductInput(record: UserProductRecord): UserProductInput {
  return {
    name: record.name,
    brand: record.brand,
    category: record.category as UserProductInput["category"],
    variantName: record.variantName,
    inci: record.inciText ?? record.ingredients.join(", "),
    ingredientSource: record.ingredientSource,
    sourceUrl: record.sourceUrl,
    openedAt: record.openedAt
      ? new Date(record.openedAt).toISOString().slice(0, 10)
      : "",
    note: record.note,
  };
}
