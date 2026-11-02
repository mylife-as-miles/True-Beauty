import { z } from "zod";
export const SD_ACTIONS = [
  "wrinkle",
  "pore",
  "texture",
  "acne",
  "oiliness",
  "radiance",
  "eye_bag",
  "age_spot",
  "dark_circle_v2",
  "droopy_upper_eyelid",
  "droopy_lower_eyelid",
  "firmness",
  "moisture",
  "redness",
  "tear_trough",
  "skin_type",
] as const;
export const Action = z.enum([
  ...SD_ACTIONS,
  ...SD_ACTIONS.map((a) => `hd_${a === "dark_circle_v2" ? "dark_circle" : a}`),
]);
export const ApprovedPlan = z
  .object({
    actions: z.array(Action).min(1).max(16),
    credits: z.number().positive().max(10000),
    skuHash: z.string().regex(/^[0-9a-f]{64}$/),
    reviewedAt: z.iso.datetime(),
  })
  .strict()
  .refine(
    (p) =>
      p.actions.every((a) => a.startsWith("hd_")) ||
      p.actions.every((a) => !a.startsWith("hd_")),
    "SD and HD actions cannot be mixed.",
  )
  .refine(
    (p) => new Set(p.actions).size === p.actions.length,
    "Actions must be unique.",
  );
export const QuoteRequest = z
  .object({ actions: z.array(Action).min(1).max(16) })
  .strict();
export const SkinTaskRequest = z
  .object({
    quoteId: z.string().uuid(),
    imageBase64: z.string().max(5600000),
    contentType: z.enum(["image/jpeg", "image/png"]),
    actions: z.array(Action).min(1).max(16),
    overlay: z.boolean().default(false),
    consent: z
      .object({
        uploadImage: z.literal(true),
        externalProcessing: z.literal(true),
        providerRetentionAcknowledged: z.literal(true),
      })
      .strict(),
    maxCredits: z.number().positive().max(10000),
  })
  .strict();
export { imageBytes } from "./youcamImage";
