import { z } from "zod";
import {
  db,
  hasConsent,
  localProfileId,
  newId,
  saveLook as persistLook,
  deleteSkinScan,
  type AgentToolRun,
  type BeautyDatabase,
  type JsonValue,
  type Profile,
} from "../../local-database/src";
import {
  rememberPreference,
  retrieveMemories,
  reviseMemory,
  forgetMemory,
  type RetrievedMemory,
} from "../../beauty-memory/src";
import {
  createDefaultLook,
  ACCESSORY_KEYS,
  LOOK_PRESETS,
  normalizeLook,
  type MakeupLook,
  type MakeupLayerName,
} from "../../makeup-engine/src";
import {
  buildRoutine,
  matchProducts,
  type IntelligenceProduct,
  type ProductMatch,
} from "../../beauty-intelligence/src";

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
export interface ToolCall {
  name: ToolName;
  args: unknown;
}
export interface AgentProduct {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  price?: number;
  priceNgn?: number;
  currency?: string;
  ingredients?: string[];
  concerns?: string[];
  skinTypes?: string[];
  prices?: Array<{ currency: string; amount: number }>;
  sample?: boolean;
  [key: string]: unknown;
}
export interface AgentContext {
  applyLook?: (look: MakeupLook) => void | Promise<void>;
  setLipColor?: (color: string) => void | Promise<void>;
  setHairColor?: (color: string) => void | Promise<void>;
  saveLook?: (name: string) => void | Promise<void>;
  inspectCurrentLook?: () => MakeupLook | Promise<MakeupLook>;
  products?: AgentProduct[];
  ownedProducts?: Array<{ productId: string; name?: string }>;
  openRemix?: () => void | Promise<void>;
  onlyApprovedContext?: boolean;
  approvedProfile?: Pick<
    Profile,
    "skinType" | "budget" | "currency" | "concerns" | "preferences"
  >;
  approvedPreferences?: Array<{ key: string; value: JsonValue }>;
  analyzeSkin?: () => Promise<{ summary: string }>;
  analysisAuthorization?: {
    consentId: string;
    costAuthorizationId: string;
    authorizedAt: number;
  };
  onToolRun?: (run: AgentToolRun) => void;
  database?: BeautyDatabase;
  /** Only populated by consent-filtered local retrieval; never transmitted to a provider implicitly. */
  permittedMemory?: RetrievedMemory[];
  selectedPlan?: AgentBudgetPlan;
  requestBudget?: number;
  requestCurrency?: string;
}
export interface AgentRecommendation {
  id: string;
  name: string;
  explanation: string;
  owned: boolean;
  price?: number;
  purchaseCost?: number;
  currency?: string;
  sample: boolean;
  category?: string;
  evidence?: ProductMatch["evidence"];
}
export interface AgentBudgetPlan {
  budget: number;
  currency: string;
  selected: AgentRecommendation[];
  total: number;
  remaining: number;
  unfilledSlots: string[];
  samplePricing: boolean;
  method: "shared-profile-cosine-and-category-budget";
}
export interface AgentResult {
  message: string;
  tools: AgentToolRun[];
  recommendations: AgentRecommendation[];
  budgetPlan?: AgentBudgetPlan;
  memoryUsed: Array<{
    id: string;
    key: string;
    source: string;
    explanation: string;
  }>;
  episodeId: string;
  mode: "local" | "remote";
  providerGuidance?: string;
  reasoningUsage?: {
    turns: number;
    inputTokens: number | null;
    outputTokens: number | null;
    reservedMaximumUsd: number | null;
  };
}
export interface LLMProviderAdapter {
  name: string;
  plan(input: {
    request: string;
    permittedMemory: RetrievedMemory[];
    toolNames: ToolName[];
  }): Promise<ToolCall[]>;
}
export class ToolUnavailableError extends Error {}
export class ConsentRequiredError extends Error {}

async function currentLook(context: AgentContext) {
  return normalizeLook(
    context.inspectCurrentLook
      ? await context.inspectCurrentLook()
      : createDefaultLook(),
  );
}
async function readAgentProfile(
  context: AgentContext,
  database: BeautyDatabase,
) {
  return context.onlyApprovedContext
    ? context.approvedProfile
    : database.profiles.get(localProfileId);
}
function readAgentMemory(context: AgentContext) {
  return context.onlyApprovedContext
    ? (context.approvedPreferences ?? []).map((node) => ({ node }))
    : (context.permittedMemory ?? []);
}
async function updateLook(
  context: AgentContext,
  change: (look: MakeupLook) => void,
) {
  if (!context.applyLook)
    throw new ToolUnavailableError(
      "The mirror is not connected in this view. Open the Living Mirror and retry.",
    );
  const look = await currentLook(context);
  change(look);
  await context.applyLook(look);
}
const colourNames: Record<string, string> = {
  rose: "#B35B6B",
  pink: "#D57B8E",
  red: "#B52E43",
  berry: "#792C48",
  plum: "#874666",
  nude: "#A97262",
  peach: "#CB8A76",
  coral: "#D77965",
  brown: "#704737",
  copper: "#A35C36",
  auburn: "#783D31",
  black: "#292222",
  blonde: "#B89B64",
  gold: "#B99A5F",
  blue: "#5B799D",
  violet: "#735C99",
  purple: "#735C99",
  silver: "#ABA8AA",
};
const namedColour = (text: string) =>
  text.match(/#[0-9a-f]{6}/i)?.[0] ??
  Object.entries(colourNames).find(([name]) =>
    new RegExp(`\\b${name}\\b`, "i").test(text),
  )?.[1];

/** Deterministic planner. Its scope is explicit; it never impersonates an unavailable remote model. */
export function planLocalRequest(text: string): ToolCall[] {
  const request = text.trim(),
    lower = request.toLowerCase(),
    tools: ToolCall[] = [];
  if (/\b(?:open|show|go to)\b.*\b(?:remix|inspiration)\b/.test(lower))
    return [{ name: "openRemix", args: {} }];
  if (/forget.*(?:last|latest).*skin.*scan/.test(lower))
    return [{ name: "forgetLastSkinScan", args: {} }];
  if (/\b(?:why|explain|evidence)\b/.test(lower))
    return [{ name: "explainRecommendation", args: {} }];
  if (/\bremember\b/.test(lower)) {
    const value = request
      .replace(/^.*?\bremember\b(?:\s+that)?\s*/i, "")
      .trim();
    const finish = lower.match(/\b(matte|gloss|glossy|shimmer|glitter)\b/)?.[1];
    const budget = lower.match(/(?:₦|ngn|naira)\s*([\d,]+)/)?.[1];
    if (finish && /\blip|finish/.test(lower))
      tools.push({
        name: "rememberPreference",
        args: {
          key: "lip-finish",
          value: finish === "glossy" ? "gloss" : finish,
        },
      });
    else if (/only.*\bown/.test(lower))
      tools.push({
        name: "rememberPreference",
        args: { key: "owned-only", value: true },
      });
    else if (budget)
      tools.push({
        name: "rememberPreference",
        args: { key: "budget-ngn", value: Number(budget.replaceAll(",", "")) },
      });
    else if (value)
      tools.push({
        name: "rememberPreference",
        args: {
          key: /\b(?:like|love|prefer|avoid|hate)\b/.test(lower)
            ? value
                .replace(/\b(?:i|like|love|prefer|avoid|hate|please)\b/gi, "")
                .trim()
                .split(/\s+/)
                .slice(0, 6)
                .join(" ") || "preference"
            : "personal-preference",
          value,
        },
      });
    return tools;
  }
  if (
    /\b(?:wardrobe|owned|own)\b/.test(lower) &&
    !/\b(?:makeup|look|routine|lip|hair)\b/.test(lower)
  )
    tools.push({ name: "inspectBeautyWardrobe", args: {} });
  if (/\b(?:wedding|soft.?glam|soft.?glow|natural|barely)\b/.test(lower))
    tools.push({
      name: "applyMakeup",
      args: { preset: /natural|barely/.test(lower) ? "bare" : "soft-glow" },
    });
  else if (/\b(?:rose hour|rosy|romantic)\b/.test(lower))
    tools.push({ name: "applyMakeup", args: { preset: "rose-hour" } });
  else if (/\b(?:bold|smoky|evening|after hours|berry look)\b/.test(lower))
    tools.push({ name: "applyMakeup", args: { preset: "berry" } });
  else if (/\b(?:golden|bronze|sunlit)\b/.test(lower))
    tools.push({ name: "applyMakeup", args: { preset: "golden" } });
  const colour = namedColour(lower);
  const clauses = lower.split(/\b(?:and|then|with)\b|[,;]/),
    lipColour = namedColour(
      clauses.find((clause) => /\b(?:lip|lips|lipstick)\b/.test(clause)) ??
        lower,
    ),
    hairColour = namedColour(
      clauses.find((clause) => /\bhair\b/.test(clause)) ?? lower,
    );
  if (lipColour && /\b(?:lip|lips|lipstick)\b/.test(lower))
    tools.push({ name: "setLipColor", args: { color: lipColour } });
  if (hairColour && /\bhair\b/.test(lower))
    tools.push({ name: "setHairColor", args: { color: hairColour } });
  if (
    /\b(?:blush|eyeshadow|foundation|eyeliner|mascara|bronzer|highlighter|contour|brows)\b/.test(
      lower,
    )
  ) {
    const layer = lower.match(
      /\b(blush|eyeshadow|foundation|eyeliner|mascara|bronzer|highlighter|contour|brows)\b/,
    )?.[1] as MakeupLayerName;
    if (
      layer &&
      (colour || /\b(?:remove|off|disable|add|enable|less|more)\b/.test(lower))
    )
      tools.push({
        name: "adjustMakeupLayer",
        args: {
          layer,
          ...(colour ? { color: colour } : {}),
          enabled: !/\b(?:remove|off|disable)\b/.test(lower),
          ...(/\bless\b/.test(lower)
            ? { opacity: 0.2 }
            : /\bmore\b/.test(lower)
              ? { opacity: 0.65 }
              : {}),
        },
      });
  }
  const accessory = lower.match(
    /\b(glasses|earrings|necklace|ring|bracelet|watch|hat)\b/,
  )?.[1];
  if (accessory)
    tools.push({
      name: "previewAccessory",
      args: { accessory, enabled: !/\b(?:remove|off|disable)\b/.test(lower) },
    });
  if (/\b(?:dry|routine|skincare|skin care)\b/.test(lower))
    tools.push({
      name: "buildSkincareRoutine",
      args: {
        period: /\b(?:pm|night|evening)\b/.test(lower) ? "PM" : "AM",
        dry: /\bdry\b/.test(lower),
      },
    });
  const budget =
    lower.match(/(?:₦|ngn|naira)\s*([\d,]+)/)?.[1] ??
    lower.match(/([\d,]+)\s*(?:naira|ngn)/)?.[1];
  if (
    /\b(?:product|buy|budget|affordable|recommend|dupe)\b/.test(lower) ||
    budget
  )
    tools.push({
      name: "findProduct",
      args: {
        query: request,
        ...(budget ? { budget: Number(budget.replaceAll(",", "")) } : {}),
        ownedOnly: /\bonly\b.*\b(?:own|owned)\b/.test(lower),
      },
    });
  if (/\b(?:save|keep)\b.*\b(?:look|this)\b/.test(lower))
    tools.push({
      name: "saveLook",
      args: {
        name:
          request.match(/(?:called|as|named)\s+["“]?(.+?)["”]?$/i)?.[1] ??
          (/wedding/.test(lower) ? "Wedding soft glam" : "My beauty look"),
      },
    });
  if (/\b(?:skin|scan)\b.*\b(?:history|progress|compare)\b/.test(lower))
    tools.push({ name: "compareSkinHistory", args: {} });
  if (/\b(?:inspect|current|wearing)\b.*\blook\b/.test(lower))
    tools.push({ name: "inspectCurrentLook", args: {} });
  if (/\b(?:analyze|analyse|scan)\b.*\bskin\b/.test(lower))
    tools.push({
      name: "analyzeSkin",
      args: { consent: false, costAuthorized: false },
    });
  return tools;
}

type MatchableAgentProduct = AgentProduct & IntelligenceProduct;
function normalizedCatalog(products: AgentProduct[]): MatchableAgentProduct[] {
  return products.map((product) => ({
    ...product,
    category: product.category ?? "unknown",
    ingredients: product.ingredients ?? [],
    concerns: product.concerns ?? [],
    price: product.priceNgn ?? product.price,
    currency:
      product.currency ?? (product.priceNgn !== undefined ? "NGN" : undefined),
  }));
}
function requestedSlots(query: string, skinType: string | undefined): string[] {
  const lower = query.toLowerCase(),
    slots: string[] = [];
  const dry = /\bdry|hydration|moisturi/.test(lower) || skinType === "dry";
  if (dry) slots.push("moisturizer");
  const makeup =
    /\b(?:wedding|glam|makeup|look|lip|blush|eyeshadow|foundation|beauty)\b/.test(
      lower,
    );
  const explicit = (
    [
      "lipstick",
      "blush",
      "eyeshadow",
      "foundation",
      "cleanser",
      "moisturizer",
      "serum",
      "sunscreen",
      "haircare",
      "accessory",
      "apparel",
    ] as const
  ).filter((category) => new RegExp(`\\b${category}\\b`).test(lower));
  if (/\blip\b|\blips\b/.test(lower) && !explicit.includes("lipstick"))
    slots.push("lipstick");
  slots.push(...explicit);
  if (
    makeup &&
    !explicit.some((category) =>
      ["lipstick", "blush", "eyeshadow", "foundation"].includes(category),
    )
  )
    slots.push("lipstick", "blush", "eyeshadow");
  if (/\b(?:routine|skincare|skin care)\b/.test(lower))
    slots.push("moisturizer", "sunscreen", "cleanser");
  if (
    /\bhair\b/.test(lower) &&
    /\b(?:care|condition|shampoo|product)\b/.test(lower)
  )
    slots.push("haircare");
  if (!slots.length) slots.push("moisturizer", "sunscreen", "cleanser");
  return [...new Set(slots)];
}
/** Combined spend allocator: a unique unowned product is charged once, owned products cost zero. */
export function allocateBeautyBudget(
  ranked: ProductMatch<MatchableAgentProduct>[],
  slots: string[],
  budget: number,
  currency = "NGN",
): AgentBudgetPlan {
  if (!Number.isFinite(budget) || budget < 0)
    throw new Error("A combined budget must be a nonnegative finite amount");
  const chosen = new Map<string, AgentRecommendation>(),
    unfilledSlots: string[] = [];
  let total = 0;
  for (const slot of slots) {
    const options = ranked
      .filter((match) => match.product.category === slot && match.inBudget)
      .sort(
        (a, b) =>
          Number(b.owned) - Number(a.owned) ||
          b.score - a.score ||
          (a.price ?? Infinity) - (b.price ?? Infinity),
      );
    const match = options.find(
      (option) =>
        option.owned ||
        (option.price !== undefined &&
          option.currency === currency &&
          Math.round((total + option.price) * 100) <= Math.round(budget * 100)),
    );
    if (!match) {
      unfilledSlots.push(slot);
      continue;
    }
    if (chosen.has(match.product.id)) continue;
    const purchaseCost = match.owned ? 0 : match.price!;
    total = Math.round((total + purchaseCost) * 100) / 100;
    const sample = match.product.sample !== false;
    chosen.set(match.product.id, {
      id: match.product.id,
      name: match.product.name,
      category: match.product.category,
      owned: match.owned,
      price: match.price,
      purchaseCost,
      currency,
      sample,
      evidence: match.evidence,
      explanation: [
        ...match.reasons,
        match.owned
          ? "Owned item: allocated purchase cost is zero."
          : `Allocated ${currency} ${purchaseCost.toLocaleString()} from the combined budget.`,
        sample
          ? "Sample catalogue price, not a verified merchant quote."
          : "Verify current merchant price and availability.",
      ].join(" "),
    });
  }
  return {
    budget,
    currency,
    selected: [...chosen.values()],
    total,
    remaining: Math.round((budget - total) * 100) / 100,
    unfilledSlots,
    samplePricing: [...chosen.values()].some(
      (product) => product.sample && !product.owned,
    ),
    method: "shared-profile-cosine-and-category-budget",
  };
}

export async function executeTool(
  call: ToolCall,
  context: AgentContext,
  episodeId = newId(),
): Promise<{
  run: AgentToolRun;
  recommendations: AgentRecommendation[];
  budgetPlan?: AgentBudgetPlan;
}> {
  const started = performance.now(),
    database = context.database ?? db;
  const run: AgentToolRun = {
    id: newId(),
    episodeId,
    name: call.name,
    status: "succeeded",
    summary: "",
    createdAt: Date.now(),
    durationMs: 0,
  };
  let recommendations: AgentRecommendation[] = [],
    budgetPlan: AgentBudgetPlan | undefined;
  try {
    if (!Object.hasOwn(TOOL_SCHEMAS, call.name))
      throw new Error("Unknown beauty tool");
    const args = TOOL_SCHEMAS[call.name].parse(call.args) as Record<
      string,
      unknown
    >;
    run.args = args;
    switch (call.name) {
      case "inspectCurrentLook": {
        if (!context.inspectCurrentLook)
          throw new ToolUnavailableError("No mirror scene is connected.");
        const look = await currentLook(context);
        run.summary = `Your lip colour is ${look.lipstick.color}, ${Math.round(look.lipstick.opacity * 100)}% coverage, ${look.lipstick.finish}. Hair tint is ${look.hair.enabled ? "enabled" : "off"}.`;
        break;
      }
      case "applyMakeup": {
        const preset = LOOK_PRESETS.find((p) => p.id === args.preset)!;
        if (!context.applyLook)
          throw new ToolUnavailableError(
            "Open the Living Mirror to apply this look.",
          );
        const look = structuredClone(preset.look);
        const finish = readAgentMemory(context).find(
          (m) =>
            m.node.key.includes("finish") &&
            typeof m.node.value === "string" &&
            ["matte", "gloss", "shimmer", "glitter"].includes(
              m.node.value.toLowerCase(),
            ),
        );
        if (finish)
          look.lipstick.finish = String(
            finish.node.value,
          ).toLowerCase() as MakeupLook["lipstick"]["finish"];
        await context.applyLook(look);
        run.summary = `Applied ${preset.name} to the mirror.${finish ? ` Used your saved ${look.lipstick.finish} lip-finish preference.` : ""}`;
        break;
      }
      case "setLipColor": {
        if (context.setLipColor)
          await context.setLipColor(args.color as string);
        else
          await updateLook(context, (look) => {
            look.lipstick.color = args.color as string;
            look.lipstick.enabled = true;
          });
        run.summary = `Changed your lip preview to ${args.color}.`;
        break;
      }
      case "setHairColor": {
        if (context.setHairColor)
          await context.setHairColor(args.color as string);
        else
          await updateLook(context, (look) => {
            look.hair.color = args.color as string;
            look.hair.enabled = true;
          });
        run.summary = `Set the hair tint control to ${args.color}. It appears only when a hair mask is available.`;
        break;
      }
      case "adjustMakeupLayer": {
        const layer = args.layer as MakeupLayerName;
        await updateLook(context, (look) => {
          look[layer] = {
            ...look[layer],
            ...(typeof args.color === "string" ? { color: args.color } : {}),
            ...(typeof args.opacity === "number"
              ? { opacity: args.opacity }
              : {}),
            ...(typeof args.enabled === "boolean"
              ? { enabled: args.enabled }
              : {}),
          };
        });
        run.summary = `Updated ${layer} in the mirror.`;
        break;
      }
      case "previewAccessory": {
        if (!ACCESSORY_KEYS.some((key) => key === args.accessory))
          throw new ToolUnavailableError(
            "This accessory preview is not implemented by the current renderer.",
          );
        await updateLook(context, (look) => {
          look.accessories[args.accessory as keyof MakeupLook["accessories"]] =
            args.enabled as boolean;
        });
        run.summary = `${args.enabled ? "Enabled" : "Removed"} the ${args.accessory} AR preview.`;
        break;
      }
      case "saveLook": {
        if (context.saveLook) await context.saveLook(args.name as string);
        else {
          if (!context.inspectCurrentLook)
            throw new ToolUnavailableError(
              "There is no current scene to save.",
            );
          await persistLook(
            args.name as string,
            await currentLook(context),
            database,
          );
        }
        run.summary = `Saved “${args.name}” locally as editable controls. No camera image was stored.`;
        break;
      }
      case "inspectBeautyWardrobe": {
        const owned =
          context.ownedProducts ??
          (context.onlyApprovedContext
            ? []
            : await database.ownedProducts.toArray());
        run.summary = owned.length
          ? `Your local wardrobe contains ${owned.length} product${owned.length === 1 ? "" : "s"}: ${owned.map((p) => p.name ?? context.products?.find((v) => v.id === p.productId)?.name ?? p.productId).join(", ")}.`
          : "Your beauty wardrobe is empty. Add products you own from the shop.";
        break;
      }
      case "recommendOwnedProducts":
      case "findProduct": {
        const products =
          context.products ??
          (context.onlyApprovedContext
            ? []
            : ((await database.products.toArray()) as AgentProduct[]));
        const owned = new Set(
          (
            context.ownedProducts ??
            (context.onlyApprovedContext
              ? []
              : await database.ownedProducts.toArray())
          ).map((p) => p.productId),
        );
        const profile = await readAgentProfile(context, database);
        const memory = readAgentMemory(context);
        const ownedPreference = memory.find(
          (m) =>
            /owned.only|only.owned|use.owned/.test(m.node.key) &&
            (m.node.value === true ||
              /only|true|yes/i.test(String(m.node.value))),
        );
        const ownedOnly =
          call.name === "recommendOwnedProducts" ||
          args.ownedOnly === true ||
          !!ownedPreference;
        const budgetPreference = memory.find(
          (m) =>
            m.node.key.includes("budget") &&
            typeof m.node.value === "number" &&
            m.node.value >= 0,
        );
        const budget =
          typeof args.budget === "number"
            ? args.budget
            : typeof budgetPreference?.node.value === "number"
              ? budgetPreference.node.value
              : profile?.budget;
        const currency =
          typeof args.budget === "number" ||
          budgetPreference?.node.key.includes("ngn")
            ? "NGN"
            : (profile?.currency ?? "NGN");
        const query = String(args.query),
          skinType = /\bdry\b/i.test(query)
            ? "dry"
            : profile?.skinType === "Not specified"
              ? undefined
              : profile?.skinType;
        const concerns = [
          ...new Set([
            ...(profile?.concerns ?? []),
            ...(/\bdry\b/i.test(query) ? ["dryness"] : []),
            ...(/\bmakeup|glam|look|lip/i.test(query) ? ["colour"] : []),
          ]),
        ];
        const avoidIngredients = memory
          .filter((m) => /avoid.*ingredient/.test(m.node.key))
          .flatMap((m) =>
            typeof m.node.value === "string" ? m.node.value.split(",") : [],
          );
        const ranked = matchProducts(
          { skinType, concerns, avoidIngredients, budget, currency },
          normalizedCatalog(products),
          { ownedIds: [...owned], ownedOnly, budget, currency },
        );
        const slots =
          ownedOnly &&
          !/\b(?:makeup|look|glam|wedding|skin|skincare|routine|lip|blush|hair)\b/i.test(
            query,
          )
            ? [
                ...new Set(
                  ranked.filter((r) => r.owned).map((r) => r.product.category),
                ),
              ]
            : requestedSlots(query, skinType);
        budgetPlan = allocateBeautyBudget(ranked, slots, budget ?? 0, currency);
        recommendations = budgetPlan.selected;
        run.summary = recommendations.length
          ? `Built a ${currency} ${budgetPlan.total.toLocaleString()} combined product plan from your ${currency} ${budgetPlan.budget.toLocaleString()} budget; ${currency} ${budgetPlan.remaining.toLocaleString()} remains. ${ownedOnly ? "Only owned products are included." : "Owned products are prioritized at zero new cost."}${budgetPlan.unfilledSlots.length ? ` Not funded: ${budgetPlan.unfilledSlots.join(", ")}. Use an already-owned option or adjust the plan.` : ""} ${budgetPlan.samplePricing ? "Prices are sample catalogue estimates, not current merchant quotes." : ""} No purchase was made.`
          : "No suitable relevant products fit the combined budget and inventory constraints. No purchase was made.";
        break;
      }
      case "buildSkincareRoutine": {
        const period = args.period as "AM" | "PM",
          now = Date.now(),
          profile = await readAgentProfile(context, database),
          owned =
            context.ownedProducts ??
            (context.onlyApprovedContext
              ? []
              : await database.ownedProducts.toArray());
        let catalog = normalizedCatalog(
          context.products ??
            (context.onlyApprovedContext
              ? []
              : await database.products.toArray()),
        );
        if (context.selectedPlan) {
          const selected = new Set([
            ...context.selectedPlan.selected.map((p) => p.id),
            ...owned.map((p) => p.productId),
          ]);
          catalog = catalog.filter((product) => selected.has(product.id));
        }
        const routineBudget = context.requestBudget ?? profile?.budget,
          routineCurrency =
            context.requestCurrency ?? profile?.currency ?? "NGN";
        const sharedRoutine = buildRoutine(
          {
            skinType: args.dry ? "dry" : profile?.skinType,
            concerns: args.dry ? ["dryness"] : (profile?.concerns ?? []),
            budget: routineBudget,
            currency: routineCurrency,
          },
          catalog,
          {
            ownedIds: owned.map((p) => p.productId),
            budget: routineBudget,
            currency: routineCurrency,
          },
        );
        const steps = (
          period === "AM" ? sharedRoutine.am : sharedRoutine.pm
        ).map((step) => ({
          id: step.slot.toLowerCase(),
          name: step.product?.name ?? step.slot,
          productId: step.product?.id,
          reason: [step.why, step.usage].join(" "),
        }));
        const routine = {
          id: newId(),
          name: `${period} ${args.dry ? "comfort" : "essentials"}`,
          period,
          steps,
          createdAt: now,
          updatedAt: now,
        };
        await database.routines.add(routine);
        run.summary = `Created an editable ${period} routine locally: ${steps.map((s) => s.name).join(" → ")}. General cosmetic guidance, based on your description; no scan or diagnosis was performed.`;
        break;
      }
      case "trackRoutine": {
        const routine = await database.routines.get(args.routineId as string);
        if (!routine) throw new Error("Routine not found");
        await database.routineEvents.add({
          id: newId(),
          routineId: routine.id,
          completedAt: Date.now(),
          stepIds: routine.steps.map((s) => s.id),
        });
        run.summary = `Logged completion of ${routine.name}.`;
        break;
      }
      case "rememberPreference": {
        const node = await rememberPreference(
          args.key as string,
          args.value as JsonValue,
          { consented: true },
          database,
        );
        run.memoryRefs = [node.id];
        run.summary = `Remembered your preference locally: ${String(node.value)}. You can inspect, edit, or delete it in BeautyGraph.`;
        break;
      }
      case "reviseMemory":
        await reviseMemory(
          args.id as string,
          args.value as JsonValue,
          database,
        );
        run.memoryRefs = [args.id as string];
        run.summary = "Updated that memory with your correction.";
        break;
      case "forgetMemory":
        await forgetMemory(args.id as string, database);
        run.summary = "Deleted that memory and its revision chain.";
        break;
      case "forgetLastSkinScan": {
        const scan = await database.skinScans.orderBy("createdAt").last();
        if (!scan) {
          run.summary = "There are no saved skin scans to delete.";
          break;
        }
        await deleteSkinScan(scan.id, database);
        run.summary =
          "Deleted your latest saved scan, its observations, associated saved photo, and linked memories.";
        break;
      }
      case "compareSkinHistory": {
        const scans = await database.skinScans
          .orderBy("createdAt")
          .reverse()
          .limit(2)
          .toArray();
        run.summary =
          scans.length < 2
            ? "Save at least two real, consented skin analyses to compare history. No trend can be inferred yet."
            : `Your latest saved analyses were ${new Date(scans[0].createdAt).toLocaleDateString()} and ${new Date(scans[1].createdAt).toLocaleDateString()}. Compare only matching provider metrics under similar lighting; this does not establish a clinical change.`;
        break;
      }
      case "analyzeSkin": {
        if (
          !args.consent ||
          !args.costAuthorized ||
          !context.analysisAuthorization ||
          Date.now() - context.analysisAuthorization.authorizedAt > 300000
        )
          throw new ConsentRequiredError(
            "Open Skin Lab to review image-upload consent and authorize any provider cost before analysis. A model-generated boolean cannot authorize a paid request.",
          );
        if (!context.analyzeSkin)
          throw new ToolUnavailableError(
            "Skin analysis provider is not configured. No image was uploaded.",
          );
        run.summary = (await context.analyzeSkin()).summary;
        break;
      }
      case "openRemix":
        if (!context.openRemix)
          throw new ToolUnavailableError(
            "The local inspiration-remix controller is not connected here.",
          );
        await context.openRemix();
        run.summary =
          "Opened the local inspiration-remix space. No image was uploaded or analysed by this command.";
        break;
      case "explainRecommendation": {
        const memory = await retrieveMemories("", { limit: 4 }, database);
        run.summary = memory.length
          ? `Recommendations can use your permitted preferences: ${memory.map((m) => `${m.node.key.replaceAll("-", " ")} = ${JSON.stringify(m.node.value)} (${m.node.source})`).join("; ")}. Catalogue matches prioritize owned products, category terms, and the stated per-product budget. No medical evidence or product efficacy is inferred.`
          : "There are no permitted saved preferences to use. Local catalogue matches use your request, owned products, and the stated per-product budget; they do not infer product efficacy.";
        break;
      }
    }
  } catch (error) {
    run.status =
      error instanceof ToolUnavailableError
        ? "unavailable"
        : error instanceof ConsentRequiredError ||
            (error instanceof Error &&
              /enable this memory|consent|category is disabled/i.test(
                error.message,
              ))
          ? "consent-required"
          : "failed";
    run.error = error instanceof Error ? error.message : "The tool failed";
    run.summary = run.error;
  }
  run.durationMs = Math.round((performance.now() - started) * 100) / 100;
  context.onToolRun?.(run);
  return { run, recommendations, budgetPlan };
}

export async function executeBeautyRequest(
  text: string,
  context: AgentContext = {},
): Promise<AgentResult> {
  if (!text.trim() || text.length > 4000)
    throw new Error("Use a request between 1 and 4,000 characters");
  const database = context.database ?? db,
    episodeId = newId();
  // Current appearance/style preferences are relevant context even if the request omits their words.
  const memories = await retrieveMemories("", { limit: 12 }, database);
  const calls = planLocalRequest(text),
    tools: AgentToolRun[] = [],
    recommendations: AgentRecommendation[] = [];
  let budgetPlan: AgentBudgetPlan | undefined;
  // Allocate the full purchase budget before linking products into a routine.
  const searchIndex = calls.findIndex((call) => call.name === "findProduct"),
    routineIndex = calls.findIndex(
      (call) => call.name === "buildSkincareRoutine",
    );
  if (searchIndex >= 0 && routineIndex >= 0 && searchIndex > routineIndex) {
    const [search] = calls.splice(searchIndex, 1);
    calls.splice(routineIndex, 0, search);
  }
  const budgetArgs = calls.find((call) => call.name === "findProduct")?.args as
    { budget?: number } | undefined;
  for (const call of calls.slice(0, 8)) {
    const result = await executeTool(
      call,
      {
        ...context,
        permittedMemory: memories,
        selectedPlan: budgetPlan,
        requestBudget: budgetArgs?.budget,
        requestCurrency: budgetArgs?.budget !== undefined ? "NGN" : undefined,
      },
      episodeId,
    );
    tools.push(result.run);
    recommendations.push(...result.recommendations);
    if (result.budgetPlan) budgetPlan = result.budgetPlan;
  }
  const message = tools.length
    ? tools.map((t) => t.summary).join("\n\n")
    : "I can apply a soft-glam look, change lip or hair colour, preview glasses, build an AM or PM routine, find catalogue products, inspect owned products, or save your current look. Try “Soft glam for a wedding, my skin feels dry, budget ₦20,000”. I am running locally with a limited command planner.";
  const result: AgentResult = {
    message,
    tools,
    recommendations,
    budgetPlan,
    memoryUsed: memories.map((m) => ({
      id: m.node.id,
      key: m.node.key,
      source: m.node.source,
      explanation: m.explanation,
    })),
    episodeId,
    mode: "local",
  };
  const memoryRefs = [
    ...new Set([
      ...memories.map((memory) => memory.node.id),
      ...tools.flatMap((tool) => tool.memoryRefs ?? []),
    ]),
  ];
  await database.transaction(
    "rw",
    [
      database.consents,
      database.memoryNodes,
      database.agentEpisodes,
      database.agentMessages,
      database.agentToolRuns,
    ],
    async () => {
      // Consent and all referenced evidence are checked under the write lock. A revocation
      // or a forget operation cannot race this write and leave a prose copy behind.
      if (!(await hasConsent("memory.history", database))) return;
      for (const memory of memories) {
        const current = await database.memoryNodes.get(memory.node.id);
        if (
          !current ||
          !(await hasConsent(current.consentScope, database)) ||
          current.revision !== memory.node.revision
        )
          return;
      }
      for (const id of memoryRefs) {
        const node = await database.memoryNodes.get(id);
        if (!node || !(await hasConsent(node.consentScope, database))) return;
      }
      await database.agentEpisodes.add({
        id: episodeId,
        createdAt: Date.now(),
        request: text,
        summary: message,
        memoryRefs,
      });
      await database.agentMessages.bulkAdd([
        {
          id: newId(),
          episodeId,
          role: "user",
          content: text,
          createdAt: Date.now(),
        },
        {
          id: newId(),
          episodeId,
          role: "assistant",
          content: message,
          createdAt: Date.now(),
        },
      ]);
      if (tools.length) await database.agentToolRuns.bulkAdd(tools);
    },
  );
  return result;
}
