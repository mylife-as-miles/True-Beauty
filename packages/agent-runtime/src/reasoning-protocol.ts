import { z } from "zod";
import { MAKEUP_LAYERS } from "../../makeup-engine/src";
import { TOOL_SCHEMAS, type ToolName } from "./tool-schemas";

const safeText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine(
      (value) =>
        !/(?:data:image\/|data:application\/octet-stream|blob:|;base64,)/i.test(
          value,
        ),
      "Images and binary payloads are not accepted by text reasoning",
    );
const colour = z.string().regex(/^#[0-9a-f]{6}$/i);
const layer = z
  .object({
    enabled: z.boolean(),
    color: colour,
    opacity: z.number().min(0).max(1),
    finish: z.enum(["matte", "gloss", "shimmer", "glitter"]),
  })
  .strict();
export const ReviewedLookSchema = z
  .object({
    ...Object.fromEntries(MAKEUP_LAYERS.map((name) => [name, layer])),
    hair: z
      .object({
        enabled: z.boolean(),
        color: colour,
        secondaryColor: colour,
        opacity: z.number().min(0).max(1),
        mode: z.enum(["solid", "ombre", "highlights", "balayage"]),
      })
      .strict(),
    accessories: z
      .partialRecord(
        z.enum([
          "glasses",
          "earrings",
          "necklace",
          "ring",
          "bracelet",
          "watch",
          "hat",
        ]),
        z.boolean(),
      )
      .optional(),
    reshape: z.number().min(-1).max(1),
  })
  .strict();
export const REASONING_SCOPES = [
  "currentLook",
  "profile",
  "preferences",
  "wardrobe",
  "history",
] as const;
export type ReasoningScope = (typeof REASONING_SCOPES)[number];
export const ReasoningContextSchema = z
  .object({
    currentLook: ReviewedLookSchema.optional(),
    profile: z
      .object({
        skinType: safeText(80),
        budget: z.number().nonnegative().max(1e9),
        currency: z.enum(["NGN", "USD", "GBP", "EUR"]),
        concerns: z.array(safeText(120)).max(20),
        preferences: z.array(safeText(160)).max(20),
      })
      .strict()
      .optional(),
    preferences: z
      .array(
        z
          .object({
            id: safeText(200),
            key: safeText(120),
            value: safeText(2000),
            source: safeText(200),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(12)
      .optional(),
    wardrobe: z
      .array(
        z
          .object({
            id: safeText(200),
            productId: safeText(200),
            name: safeText(200),
          })
          .strict(),
      )
      .max(50)
      .optional(),
    history: z
      .array(
        z
          .object({
            id: safeText(200),
            createdAt: z.number().nonnegative(),
            summary: safeText(2000),
          })
          .strict(),
      )
      .max(5)
      .optional(),
  })
  .strict();
export type ReasoningContextSnapshot = z.infer<typeof ReasoningContextSchema>;
export const REMOTE_TOOL_NAMES = [
  "inspectCurrentLook",
  "applyMakeup",
  "adjustMakeupLayer",
  "setLipColor",
  "setHairColor",
  "previewAccessory",
  "saveLook",
  "findProduct",
  "buildSkincareRoutine",
  "inspectBeautyWardrobe",
  "recommendOwnedProducts",
  "openRemix",
] as const;
export type RemoteToolName = (typeof REMOTE_TOOL_NAMES)[number];
export const RemoteToolNameSchema = z.enum(REMOTE_TOOL_NAMES);
export const ReasoningPayloadSchema = z
  .object({
    goal: safeText(4000).min(1),
    context: ReasoningContextSchema,
    allowedTools: z.array(RemoteToolNameSchema).min(1).max(12),
    allowPersistence: z.boolean(),
  })
  .strict();
export type ReasoningPayload = z.infer<typeof ReasoningPayloadSchema>;
export const ReasoningQuoteRequest = z
  .object({
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    scopes: z.array(z.enum(REASONING_SCOPES)).max(5),
    allowedTools: z.array(RemoteToolNameSchema).min(1).max(12),
    allowPersistence: z.boolean(),
    maxSteps: z.number().int().min(1).max(4).default(3),
    maxOutputTokens: z.number().int().min(256).max(1600).default(1000),
  })
  .strict();
export const ReasoningStartRequest = z
  .object({
    quoteId: z.string().uuid(),
    payload: ReasoningPayloadSchema,
    consent: z
      .object({
        approvedPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
        scopes: z.array(z.enum(REASONING_SCOPES)).max(5),
        textTransmission: z.literal(true),
        providerRetentionAcknowledged: z.literal(true),
      })
      .strict(),
    maxUsd: z.number().positive().max(10),
  })
  .strict();
export const ToolFeedbackSchema = z
  .object({
    callId: z.string().min(1).max(200),
    name: RemoteToolNameSchema,
    status: z.enum(["succeeded", "failed", "unavailable", "consent-required"]),
    summary: safeText(4000),
    data: safeText(6000).optional(),
  })
  .strict();
export type ToolFeedback = z.infer<typeof ToolFeedbackSchema>;
export const ReasoningStepRequest = z
  .object({
    stepId: z.string().uuid(),
    feedback: z.array(ToolFeedbackSchema).max(1),
  })
  .strict();
export const RemoteToolCallSchema = z
  .object({
    id: z.string().min(1).max(200),
    name: RemoteToolNameSchema,
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RemoteToolCall = z.infer<typeof RemoteToolCallSchema>;
export interface ReasoningQuote {
  quoteId: string;
  maximumUsd: number;
  currency: "USD";
  maxSteps: number;
  maxOutputTokens: number;
  inputTokenCeiling: number;
  expiresAt: string;
  model: string;
  pricingProvenance: {
    sourceUrl: string;
    reviewedAt: string;
    kind: "operator-reviewed-upper-bound";
  };
  note: string;
}
export interface ReasoningCapabilities {
  configured: boolean;
  paidEnabled: boolean;
  ready: boolean;
  model: string | null;
  liveVerified: false;
  unavailableReason: string | null;
  maxSteps: number;
  retention: string;
  imagesAccepted: false;
}
export const ReasoningQuoteSchema = z
  .object({
    quoteId: z.string().uuid(),
    maximumUsd: z.number().positive().max(10),
    currency: z.literal("USD"),
    maxSteps: z.number().int().min(1).max(4),
    maxOutputTokens: z.number().int().min(256).max(1600),
    inputTokenCeiling: z.number().int().min(8000).max(64000),
    expiresAt: z.string().datetime(),
    model: z.string().min(1).max(160),
    pricingProvenance: z
      .object({
        sourceUrl: z.url().refine((url) => url.startsWith("https://")),
        reviewedAt: z.string().datetime(),
        kind: z.literal("operator-reviewed-upper-bound"),
      })
      .strict(),
    note: z.string().max(4000),
  })
  .strict();
export const ReasoningCapabilitiesSchema = z
  .object({
    configured: z.boolean(),
    paidEnabled: z.boolean(),
    ready: z.boolean(),
    model: z.string().nullable(),
    provider: z.string().nullable().optional(),
    liveVerified: z.literal(false),
    unavailableReason: z.string().nullable(),
    maxSteps: z.number().int().min(1).max(4),
    retention: z.string().max(4000),
    imagesAccepted: z.literal(false),
  })
  .strict();
export interface ReasoningStepResult {
  status: "needs-tools" | "done";
  calls: RemoteToolCall[];
  guidance: string;
  stepsUsed: number;
  stepsRemaining: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}
export const ReasoningStepResultSchema = z
  .object({
    status: z.enum(["needs-tools", "done"]),
    calls: z.array(RemoteToolCallSchema).max(1),
    guidance: safeText(6000),
    stepsUsed: z.number().int().nonnegative(),
    stepsRemaining: z.number().int().nonnegative(),
    usage: z
      .object({
        inputTokens: z.number().nonnegative().nullable(),
        outputTokens: z.number().nonnegative().nullable(),
      })
      .strict(),
  })
  .strict();
export function contextScopes(
  context: ReasoningContextSnapshot,
): ReasoningScope[] {
  return REASONING_SCOPES.filter((scope) => context[scope] !== undefined);
}
const requiredScopes: Partial<Record<RemoteToolName, ReasoningScope[]>> = {
  inspectCurrentLook: ["currentLook"],
  findProduct: ["profile", "wardrobe"],
  buildSkincareRoutine: ["profile", "wardrobe"],
  inspectBeautyWardrobe: ["wardrobe"],
  recommendOwnedProducts: ["profile", "wardrobe"],
};
export function allowedReasoningTools(
  scopes: ReasoningScope[],
  allowPersistence: boolean,
): RemoteToolName[] {
  return REMOTE_TOOL_NAMES.filter(
    (name) =>
      (allowPersistence ||
        !["saveLook", "buildSkincareRoutine"].includes(name)) &&
      (requiredScopes[name] ?? []).every((scope) => scopes.includes(scope)),
  );
}
export function validateRemoteTool(
  call: RemoteToolCall,
  allowed: RemoteToolName[],
): RemoteToolCall {
  if (!allowed.includes(call.name))
    throw new Error("The model requested an action that was not approved");
  const schema = TOOL_SCHEMAS[call.name as ToolName];
  if (!schema)
    throw new Error("This tool is not available in the current application");
  return { ...call, args: schema.parse(call.args) as Record<string, unknown> };
}
export function remoteToolSpecifications(names: RemoteToolName[]) {
  return names.map((name) => ({
    type: "function" as const,
    function: {
      name,
      description: {
        inspectCurrentLook:
          "Inspect the approved editable mirror controls, not an image.",
        applyMakeup: "Apply one editable makeup preset to the local mirror.",
        adjustMakeupLayer: "Adjust one cosmetic preview layer.",
        setLipColor: "Set a digital lip preview colour.",
        setHairColor:
          "Set the local hair tint control; a segmentation mask is required to see it.",
        previewAccessory: "Toggle a supported geometric accessory preview.",
        saveLook:
          "Save editable look controls only; requires explicit persistence approval.",
        findProduct:
          "Run local evidence-labelled product matching and a combined budget allocator; no purchase.",
        buildSkincareRoutine:
          "Create an editable general cosmetic routine from approved profile/inventory; requires persistence approval.",
        inspectBeautyWardrobe:
          "Inspect the exact approved owned-product snapshot.",
        recommendOwnedProducts:
          "Use approved owned products only; never order or purchase.",
        openRemix:
          "Open the local inspiration-remix space. The user supplies a reference locally.",
      }[name],
      parameters: z.toJSONSchema(TOOL_SCHEMAS[name as ToolName]),
      strict: false,
    },
  }));
}
export function payloadText(payload: ReasoningPayload): string {
  return JSON.stringify(ReasoningPayloadSchema.parse(payload));
}
export async function hashReasoningPayload(
  payload: ReasoningPayload,
): Promise<string> {
  const bytes = new TextEncoder().encode(payloadText(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
