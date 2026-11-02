import { z } from "zod";
export const PROVIDER_RETENTION_DAYS = 30;
export const PROVIDER_RETENTION_SOURCE =
  "https://docs.perfectcorp.com/develop/file_retention_period.md";
export const LOCAL_GENERATION_TTL_MS = 15 * 60_000;
export const GENERATION_TASK_PATHS = {
  hair: "/s2s/v2.1/task/hair-transfer",
  clothing: "/s2s/v2.0/task/cloth-v4",
} as const;
export const HairSpec = z
  .object({
    feature: z.literal("hair"),
    hairColor: z.enum(["src", "ref"]).default("src"),
    templateId: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[\w.:-]+$/)
      .optional(),
  })
  .strict();
export const ClothingSpec = z
  .object({
    feature: z.literal("clothing"),
    garmentCategory: z.enum([
      "full_body",
      "lower_body",
      "upper_body",
      "shoes",
      "auto",
      "outer",
    ]),
    changeShoes: z.boolean().default(false),
    filterMultiPerson: z.enum(["normal", "strict"]).default("strict"),
  })
  .strict();
export const GenerationSpec = z.discriminatedUnion("feature", [
  HairSpec,
  ClothingSpec,
]);
export type GenerationSpec = z.infer<typeof GenerationSpec>;
export type GenerationFeature = GenerationSpec["feature"];
export const GenerationPlan = z
  .object({
    spec: GenerationSpec,
    credits: z.number().positive().max(10000),
    skuHash: z.string().regex(/^[0-9a-f]{64}$/),
    reviewedAt: z.iso.datetime(),
  })
  .strict();
export type GenerationPlan = z.infer<typeof GenerationPlan>;
export const GenerationImage = z
  .object({
    base64: z.string().min(1).max(5_600_000),
    contentType: z.enum(["image/jpeg", "image/png"]),
  })
  .strict();
export type GenerationImage = z.infer<typeof GenerationImage>;
export const GenerationQuoteRequest = z
  .object({ spec: GenerationSpec })
  .strict();
export const GenerationTaskRequest = z
  .object({
    quoteId: z.string().uuid(),
    spec: GenerationSpec,
    source: GenerationImage,
    reference: GenerationImage.optional(),
    maxCredits: z.number().positive().max(10000),
    consent: z
      .object({
        uploadImages: z.literal(true),
        rightsConfirmed: z.literal(true),
        externalProcessing: z.literal(true),
        providerRetentionAcknowledged: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const template = data.spec.feature === "hair" && !!data.spec.templateId;
    if (!template && !data.reference)
      ctx.addIssue({
        code: "custom",
        message: "A reference image is required.",
        path: ["reference"],
      });
    if (template && data.reference)
      ctx.addIssue({
        code: "custom",
        message: "Choose one style reference: template or image.",
        path: ["reference"],
      });
  });
export const GenerationStatus = z.enum([
  "uploading",
  "running",
  "success",
  "error",
  "cancelled",
]);
export type GenerationStatus = z.infer<typeof GenerationStatus>;
export interface GeneratedImageResult {
  kind: "ai-generated-image";
  provider: "perfect-corp";
  feature: GenerationFeature;
  imagePath: string;
  receivedAt: string;
  notice: string;
}
export interface GenerationTaskView {
  taskId: string;
  feature: GenerationFeature;
  status: GenerationStatus;
  result?: GeneratedImageResult;
  error?: string;
  pollAfterMs: number;
  expiresAt: string;
  notice: string;
}
export interface GenerationCapability {
  feature: GenerationFeature;
  configured: boolean;
  pricingPlanConfigured: boolean;
  readyForQuote: boolean;
  allowedSpecs: GenerationSpec[];
  reason: string;
  liveVerified: false;
}
export interface GenerationCapabilities {
  provider: "Perfect Corp";
  credentialConfigured: boolean;
  paidEnabled: boolean;
  budgetConfigured: boolean;
  liveVerified: false;
  features: Record<GenerationFeature, GenerationCapability>;
  retention: {
    localMinutes: 15;
    providerDays: 30;
    source: string;
    upstreamCancellationSupported: false;
    upstreamDeletionSupported: false;
  };
}
