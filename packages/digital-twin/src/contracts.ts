import { z } from "zod";
import type {
  Profile,
  OwnedProduct,
  GenericRecord,
  SavedLook,
  MemoryNode,
} from "../../local-database/src";
import type { MakeupLook } from "../../makeup-engine/src";
export const TwinPreferencesSchema = z
  .object({
    hairTexture: z.string().max(80),
    hairLength: z.string().max(80),
    hairGoals: z.array(z.string().max(120)).max(12),
    styleGoals: z.array(z.string().max(160)).max(12),
    favoriteColors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(12),
    avoidIngredients: z.array(z.string().max(120)).max(40),
    preferredFinish: z.enum([
      "unspecified",
      "matte",
      "gloss",
      "shimmer",
      "glitter",
    ]),
  })
  .strict();
export type TwinPreferences = z.infer<typeof TwinPreferencesSchema>;
export interface TwinDocument extends TwinPreferences {
  version: 1;
  revision: number;
  updatedAt: number;
  source: "user-provided" | "not-set";
}
export interface TwinSnapshot {
  profile: Profile;
  document: TwinDocument;
  ownedProducts: OwnedProduct[];
  outfits: GenericRecord[];
  looks: SavedLook[];
  memories: MemoryNode[];
  canRememberPreferences: boolean;
  canRememberHistory: boolean;
}
export interface SceneLighting {
  preset: "neutral" | "daylight" | "golden-hour" | "moonlight";
  intensity: number;
  direction: { x: number; y: number };
}
export interface CompleteLookInput {
  name: string;
  look: MakeupLook;
  lighting: SceneLighting;
  occasion: string;
  productIds: string[];
  outfitId?: string;
  remember: boolean;
}
export const CompositionSchema = z
  .object({
    version: z.literal(1),
    source: z.literal("digital-twin"),
    occasion: z.string().max(160),
    productIds: z.array(z.string().min(1)).max(100),
    outfitId: z.string().min(1).optional(),
    profileRevision: z.number().int().positive(),
    lighting: z.object({
      preset: z.enum(["neutral", "daylight", "golden-hour", "moonlight"]),
      intensity: z.number().min(0).max(1),
      direction: z.object({
        x: z.number().min(-1).max(1),
        y: z.number().min(-1).max(1),
      }),
    }),
  })
  .strict();
export type CompleteLookComposition = z.infer<typeof CompositionSchema>;
export const EMPTY_TWIN_PREFERENCES: TwinPreferences = {
  hairTexture: "Not specified",
  hairLength: "Not specified",
  hairGoals: [],
  styleGoals: [],
  favoriteColors: [],
  avoidIngredients: [],
  preferredFinish: "unspecified",
};
