/** An editable cosmetic profile and complete-look graph; never a biometric or medical reconstruction. */
import { z } from "zod";
import {
  db,
  initializeDatabase,
  localProfileId,
  newId,
  deleteMemoryNodes,
  type BeautyDatabase,
  type Profile,
  type SavedLook,
  type JsonValue,
} from "../../local-database/src";
import { rememberPreference, isCurrentMemory } from "../../beauty-memory/src";
import { normalizeLook } from "../../makeup-engine/src";
import {
  CompositionSchema,
  TwinPreferencesSchema,
  EMPTY_TWIN_PREFERENCES,
  type TwinDocument,
  type TwinSnapshot,
  type TwinPreferences,
  type CompleteLookInput,
} from "./contracts";
export * from "./contracts";
const documentId = "digital-twin-profile";
const DocumentSchema = TwinPreferencesSchema.extend({
  version: z.literal(1),
  revision: z.number().int().positive(),
  updatedAt: z.number().finite().nonnegative(),
  source: z.enum(["user-provided", "not-set"]),
});
const ProfilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    skinType: z.string().trim().min(1).max(100),
    budget: z.number().finite().nonnegative().max(1e9),
    currency: z.enum(["NGN", "USD", "GBP", "EUR"]),
    concerns: z.array(z.string().trim().min(1).max(120)).max(30),
    preferences: z.array(z.string().trim().min(1).max(160)).max(30),
  })
  .strict();
const currentDocument = (value: unknown, now: number): TwinDocument => {
  if (value === undefined)
    return {
      ...structuredClone(EMPTY_TWIN_PREFERENCES),
      version: 1,
      revision: 1,
      updatedAt: now,
      source: "not-set",
    };
  const result = DocumentSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      "The saved beauty profile is malformed. Export your data or reset this profile before editing.",
    );
  return result.data;
};
export function readComposition(saved: SavedLook) {
  const result = CompositionSchema.safeParse(saved.composition);
  return result.success ? result.data : null;
}
export async function loadDigitalTwin(
  database: BeautyDatabase = db,
): Promise<TwinSnapshot> {
  let profile = await database.profiles.get(localProfileId);
  if (!profile) profile = await initializeDatabase(database);
  return database.transaction(
    "r",
    [
      database.profiles,
      database.settings,
      database.ownedProducts,
      database.outfits,
      database.savedLooks,
      database.memoryNodes,
      database.consents,
    ],
    async () => {
      const [
        currentProfile,
        setting,
        ownedProducts,
        outfits,
        looks,
        allMemories,
        consents,
      ] = await Promise.all([
        database.profiles.get(localProfileId),
        database.settings.get(documentId),
        database.ownedProducts.toArray(),
        database.outfits.toArray(),
        database.savedLooks.toArray(),
        database.memoryNodes
          .where("subjectId")
          .equals(localProfileId)
          .toArray(),
        database.consents.toArray(),
      ]);
      if (!currentProfile)
        throw new Error(
          "Your local profile was cleared. Reopen the beauty profile to start a new one.",
        );
      const permits = new Set(
          consents.filter((c) => c.granted).map((c) => c.scope),
        ),
        now = Date.now();
      return {
        profile: currentProfile,
        document: currentDocument(setting?.value, now),
        ownedProducts,
        outfits,
        looks: looks
          .filter(readComposition)
          .sort((a, b) => b.updatedAt - a.updatedAt),
        memories: allMemories
          .filter(
            (n) =>
              permits.has(n.consentScope) &&
              isCurrentMemory(n, now) &&
              n.confidence >= 0.3,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 40),
        canRememberPreferences: permits.has("memory.preferences"),
        canRememberHistory: permits.has("memory.history"),
      };
    },
  );
}
export async function saveTwinProfile(
  profilePatch: Pick<
    Profile,
    | "displayName"
    | "skinType"
    | "budget"
    | "currency"
    | "concerns"
    | "preferences"
  >,
  preferences: TwinPreferences,
  options: { rememberPreferences: boolean },
  database: BeautyDatabase = db,
): Promise<void> {
  const profile = ProfilePatchSchema.parse(profilePatch),
    prefs = TwinPreferencesSchema.parse(preferences);
  await initializeDatabase(database);
  await database.transaction("rw", database.tables, async () => {
    const current = await database.profiles.get(localProfileId);
    if (!current) throw new Error("Local profile is unavailable");
    const old = await database.settings.get(documentId),
      previous = currentDocument(old?.value, Date.now());
    const next: TwinDocument = {
      ...prefs,
      version: 1,
      revision: old ? previous.revision + 1 : 1,
      updatedAt: Date.now(),
      source: "user-provided",
    };
    if (options.rememberPreferences) {
      await rememberPreference(
        "digital-twin-style",
        prefs as unknown as JsonValue,
        {
          consented: true,
          type: "BeautyProfile",
          scope: "memory.preferences",
          source: "user:beauty-profile",
          confidence: 1,
        },
        database,
      );
    }
    await database.profiles.put({
      ...current,
      ...profile,
      updatedAt: next.updatedAt,
    });
    await database.settings.put({
      id: documentId,
      value: next as unknown as JsonValue,
      updatedAt: next.updatedAt,
    });
  });
}
export async function saveCompleteLook(
  input: CompleteLookInput,
  database: BeautyDatabase = db,
): Promise<SavedLook> {
  const name = z.string().trim().min(1).max(100).parse(input.name),
    occasion = z.string().trim().max(160).parse(input.occasion);
  const products = z
    .array(z.string().min(1).max(200))
    .max(100)
    .parse(input.productIds);
  if (new Set(products).size !== products.length)
    throw new Error("Choose each product once");
  await initializeDatabase(database);
  return database.transaction("rw", database.tables, async () => {
    const owned = await database.ownedProducts.toArray(),
      byProduct = new Map(owned.map((p) => [p.productId, p]));
    if (products.some((id) => !byProduct.has(id)))
      throw new Error(
        "Only products currently in your owned wardrobe can be attached",
      );
    if (input.outfitId && !(await database.outfits.get(input.outfitId)))
      throw new Error("This outfit no longer exists");
    const documentRecord = await database.settings.get(documentId);
    const current = currentDocument(documentRecord?.value, Date.now());
    // Preserve the original revision even when a look is composed before the
    // first profile edit. Subsequent edits must advance beyond that evidence.
    if (!documentRecord)
      await database.settings.put({
        id: documentId,
        value: current as unknown as JsonValue,
        updatedAt: current.updatedAt,
      });
    const composition = CompositionSchema.parse({
      version: 1,
      source: "digital-twin",
      occasion,
      productIds: products,
      ...(input.outfitId ? { outfitId: input.outfitId } : {}),
      profileRevision: current.revision,
      lighting: input.lighting,
    });
    const stamp = Date.now(),
      saved: SavedLook = {
        id: newId(),
        name,
        look: normalizeLook(input.look),
        composition: composition as unknown as JsonValue,
        createdAt: stamp,
        updatedAt: stamp,
      };
    if (input.remember) {
      const lookNode = await rememberPreference(
        "complete-look:" + saved.id,
        {
          savedLookId: saved.id,
          name,
          occasion,
          profileRevision: current.revision,
        },
        {
          consented: true,
          type: "Look",
          scope: "memory.history",
          source: "user:complete-look",
          confidence: 1,
          evidenceRefs: [saved.id],
        },
        database,
      );
      for (const id of products) {
        const product = byProduct.get(id)!;
        const node = await rememberPreference(
          "complete-product:" + product.id,
          { productId: id, name: product.name ?? id },
          {
            consented: true,
            type: "Product",
            scope: "memory.history",
            source: "user:owned-wardrobe",
            confidence: 1,
            evidenceRefs: [product.id],
          },
          database,
        );
        await database.memoryEdges.add({
          id: newId(),
          fromId: node.id,
          toId: lookNode.id,
          type: "BELONGS_TO_LOOK",
          createdAt: stamp,
          evidenceRefs: [saved.id, product.id],
        });
      }
      if (input.outfitId) {
        const node = await rememberPreference(
          "complete-outfit:" + input.outfitId,
          { outfitId: input.outfitId },
          {
            consented: true,
            type: "Outfit",
            scope: "memory.history",
            source: "user:outfit-study",
            confidence: 1,
            evidenceRefs: [input.outfitId],
          },
          database,
        );
        await database.memoryEdges.add({
          id: newId(),
          fromId: node.id,
          toId: lookNode.id,
          type: "BELONGS_TO_LOOK",
          createdAt: stamp,
          evidenceRefs: [saved.id, input.outfitId],
        });
      }
    }
    await database.savedLooks.add(saved);
    return saved;
  });
}
export async function deleteCompleteLook(
  id: string,
  database: BeautyDatabase = db,
): Promise<void> {
  await database.transaction("rw", database.tables, async () => {
    const saved = await database.savedLooks.get(id);
    if (!saved || !readComposition(saved))
      throw new Error("This complete look no longer exists");
    const nodes = await database.memoryNodes
      .filter((n) => n.type === "Look" && n.evidenceRefs.includes(id))
      .primaryKeys();
    await deleteMemoryNodes(nodes as string[], database);
    await database.savedLooks.delete(id);
  });
}
export async function exportDigitalTwin(
  database: BeautyDatabase = db,
): Promise<string> {
  const snapshot = await loadDigitalTwin(database);
  return JSON.stringify(
    {
      format: "true-beauty-cosmetic-profile",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: {
        id: snapshot.profile.id,
        ...ProfilePatchSchema.parse({
          displayName: snapshot.profile.displayName,
          skinType: snapshot.profile.skinType,
          budget: snapshot.profile.budget,
          currency: snapshot.profile.currency,
          concerns: snapshot.profile.concerns,
          preferences: snapshot.profile.preferences,
        }),
        createdAt: snapshot.profile.createdAt,
        updatedAt: snapshot.profile.updatedAt,
      },
      preferences: snapshot.document,
      ownedProducts: snapshot.ownedProducts.map((p) => ({
        id: p.id,
        productId: p.productId,
        name: typeof p.name === "string" ? p.name : undefined,
        addedAt: p.addedAt,
        openedAt:
          typeof p.openedAt === "number" && Number.isFinite(p.openedAt)
            ? p.openedAt
            : undefined,
        note: typeof p.note === "string" ? p.note : undefined,
      })),
      outfits: snapshot.outfits.map((o) => ({
        id: o.id,
        name: typeof o.name === "string" ? o.name : "Outfit study",
        color:
          typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color)
            ? o.color
            : null,
        technology: [
          "static-photo-compositing",
          "live-ar-preview",
          "generative-virtual-try-on",
        ].includes(String(o.technology))
          ? o.technology
          : "static-photo-compositing",
      })),
      looks: snapshot.looks.map((s) => ({
        id: s.id,
        name: s.name,
        look: normalizeLook(s.look),
        composition: readComposition(s),
      })),
      notice:
        "User-provided cosmetic preferences and styling choices. No photograph, face geometry, clinical profile, chat history or identity reconstruction is included.",
    },
    (_key, value) =>
      typeof value === "string" &&
      /(?:data:image\/|data:application\/octet-stream|;base64,|blob:)/i.test(
        value,
      )
        ? "[Image reference excluded from this metadata export]"
        : value,
    2,
  );
}
