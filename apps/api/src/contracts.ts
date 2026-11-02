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
export function imageBytes(
  base64: string,
  mime: "image/png" | "image/jpeg",
): Uint8Array {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64,
    )
  )
    throw new Error("Malformed image encoding.");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength < 100 || bytes.byteLength > 4 * 1024 * 1024)
    throw new Error("Images must be between 100 bytes and 4 MB.");
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if ((mime === "image/png" && !png) || (mime === "image/jpeg" && !jpeg))
    throw new Error("Image file signature does not match its declared type.");
  return bytes;
}
