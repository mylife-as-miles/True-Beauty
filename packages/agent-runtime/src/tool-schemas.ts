import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const TOOL_SCHEMAS = {
  inspectCurrentLook: z.object({}).strict(),
  applyMakeup: z
    .object({
      preset: z.enum([
        "soft-glow",
        "rose-hour",
        "golden",
        "berry",
        "bare",
        "editorial",
      ]),
    })
    .strict(),
  adjustMakeupLayer: z
    .object({
      layer: z.enum([
        "lipstick",
        "blush",
        "eyeshadow",
        "foundation",
        "eyeliner",
        "mascara",
        "brows",
        "contour",
        "bronzer",
        "highlighter",
        "lipliner",
        "lipgloss",
      ]),
      color: hex.optional(),
      opacity: z.number().min(0).max(1).optional(),
      enabled: z.boolean().optional(),
    })
    .strict(),
  setLipColor: z.object({ color: hex }).strict(),
  setHairColor: z.object({ color: hex }).strict(),
  previewAccessory: z
    .object({
      accessory: z.enum([
        "glasses",
        "earrings",
        "necklace",
        "ring",
        "bracelet",
        "watch",
        "hat",
      ]),
      enabled: z.boolean(),
    })
    .strict(),
  saveLook: z.object({ name: z.string().trim().min(1).max(120) }).strict(),
  findProduct: z
    .object({
      query: z.string().max(300),
      budget: z.number().nonnegative().optional(),
      ownedOnly: z.boolean().optional(),
    })
    .strict(),
  buildSkincareRoutine: z
    .object({ period: z.enum(["AM", "PM"]), dry: z.boolean().optional() })
    .strict(),
  trackRoutine: z.object({ routineId: z.string().min(1) }).strict(),
  inspectBeautyWardrobe: z.object({}).strict(),
  recommendOwnedProducts: z.object({ query: z.string().max(300) }).strict(),
  rememberPreference: z
    .object({
      key: z.string().min(1).max(120),
      value: z.union([z.string().max(2000), z.number().finite(), z.boolean()]),
    })
    .strict(),
  reviseMemory: z
    .object({ id: z.string().min(1), value: z.string().max(2000) })
    .strict(),
  forgetMemory: z.object({ id: z.string().min(1) }).strict(),
  compareSkinHistory: z.object({}).strict(),
  forgetLastSkinScan: z.object({}).strict(),
  analyzeSkin: z
    .object({ consent: z.boolean(), costAuthorized: z.boolean() })
    .strict(),
  explainRecommendation: z.object({}).strict(),
  openRemix: z.object({}).strict(),
};
export type ToolName = keyof typeof TOOL_SCHEMAS;
