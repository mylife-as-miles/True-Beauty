import Dexie, { type Table } from "dexie";
import { z } from "zod";
import { bagLineIdentity } from "../../shared-types/src/bag-identity";

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Currency = "NGN" | "USD" | "GBP" | "EUR";
export const localProfileId = "local-profile";
export const CONSENT_SCOPES = [
  "memory.preferences",
  "memory.history",
  "analysis.history",
  "media.photos",
  "remote.images",
  "remote.history",
] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];
export interface Profile {
  id: string;
  displayName: string;
  skinType: string;
  budget: number;
  currency: Currency;
  concerns: string[];
  preferences: string[];
  createdAt: number;
  updatedAt: number;
}
export interface Consent {
  id: string;
  scope: ConsentScope;
  granted: boolean;
  updatedAt: number;
  source: string;
}
export interface SavedLook {
  id: string;
  name: string;
  look: unknown;
  createdAt: number;
  updatedAt: number;
  thumbnail?: string;
  note?: string;
  composition?: JsonValue;
}
export interface ProductRecord {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  ingredients?: string[];
  [key: string]: unknown;
}
export interface OwnedProduct {
  id: string;
  productId: string;
  name?: string;
  addedAt: number;
  openedAt?: number;
  note?: string;
}
export interface CollectionRecord {
  id: string;
  name: string;
  productIds: string[];
  createdAt: number;
  updatedAt: number;
}
export interface ShoppingBag {
  id: string;
  productId: string;
  quantity: number;
  addedAt: number;
  lineKey?: string;
  variantId?: string;
  variantName?: string;
  productName?: string;
  size?: string;
  currency?: Currency;
  unitPrice?: number;
  priceKind?: "sample" | "verified" | "imported";
  sourceKey?: string;
  merchantSourceId?: string;
  sourceUrl?: string;
  priceObservedAt?: string;
  imported?: boolean;
}
/** Canonicalize legacy and current bag identities; stored prices never imply current availability. */
export function normalizeShoppingBag(record: ShoppingBag): ShoppingBag & {
  lineKey: string;
  variantId: string;
  currency: Currency;
  sourceKey: string;
} {
  const parsed = shoppingBagRecordSchema.parse(record) as ShoppingBag;
  const variantId = parsed.variantId ?? "default",
    currency = parsed.currency ?? "NGN",
    sourceKey = parsed.sourceKey ?? "sample";
  return {
    ...parsed,
    variantId,
    currency,
    sourceKey,
    lineKey: bagLineIdentity(
      parsed.productId,
      parsed.size,
      variantId,
      currency,
      sourceKey,
    ),
  };
}
export interface Routine {
  id: string;
  name: string;
  period: "AM" | "PM";
  steps: Array<{
    id: string;
    name: string;
    productId?: string;
    reason?: string;
  }>;
  createdAt: number;
  updatedAt: number;
}
export interface RoutineEvent {
  id: string;
  routineId: string;
  completedAt: number;
  stepIds: string[];
  note?: string;
}
export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  mood?: string;
}
export interface SkinScan {
  id: string;
  createdAt: number;
  provider: string;
  observations: unknown[];
  mediaAssetId?: string;
  note?: string;
  [key: string]: unknown;
}
export interface GenericRecord {
  id: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
}
export const MEMORY_TYPES = [
  "BeautyProfile",
  "SkinObservation",
  "UserPreference",
  "Product",
  "Ingredient",
  "Look",
  "Outfit",
  "Routine",
  "Experiment",
  "Outcome",
  "Feedback",
  "Goal",
  "AgentEpisode",
  "Evidence",
  "Consent",
] as const;
export type MemoryType = (typeof MEMORY_TYPES)[number];
export interface MemoryNode {
  id: string;
  type: MemoryType;
  subjectId: string;
  key: string;
  value: JsonValue;
  createdAt: number;
  updatedAt: number;
  source: string;
  confidence: number;
  evidenceRefs: string[];
  consentScope: ConsentScope;
  retentionPolicy: "until-deleted" | "session" | "30-days" | "90-days";
  lastUsedAt: number;
  validFrom: number;
  validUntil?: number;
  revision: number;
  supersedes?: string;
}
export interface MemoryEdge {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  createdAt: number;
  evidenceRefs: string[];
}
export interface MemoryRevision {
  id: string;
  nodeId: string;
  revision: number;
  value: JsonValue;
  source: string;
  createdAt: number;
}
export interface AgentEpisode {
  id: string;
  createdAt: number;
  request: string;
  summary: string;
  memoryRefs: string[];
}
export interface AgentMessage {
  id: string;
  episodeId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}
export interface AgentToolRun {
  id: string;
  episodeId: string;
  name: string;
  status: "succeeded" | "failed" | "unavailable" | "consent-required";
  summary: string;
  createdAt: number;
  durationMs: number;
  args?: unknown;
  error?: string;
  memoryRefs?: string[];
}
export interface MediaAsset {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
  consentScope: "media.photos";
  name: string;
}
export interface Setting {
  id: string;
  value: JsonValue;
  updatedAt: number;
}

export const tableNames = [
  "profiles",
  "consents",
  "skinScans",
  "skinObservations",
  "savedLooks",
  "makeupPresets",
  "hairPresets",
  "outfits",
  "products",
  "productVariants",
  "ownedProducts",
  "wishlists",
  "shoppingBags",
  "routines",
  "routineEvents",
  "journalEntries",
  "goals",
  "beautyExperiments",
  "userFeedback",
  "memoryNodes",
  "memoryEdges",
  "memoryRevisions",
  "agentEpisodes",
  "agentMessages",
  "agentToolRuns",
  "recommendations",
  "priceSnapshots",
  "mediaAssets",
  "settings",
] as const;
export type TableName = (typeof tableNames)[number];
const storesV1: Record<string, string> = {
  profiles: "id,updatedAt",
  consents: "id,&scope,updatedAt",
  skinScans: "id,createdAt,provider",
  skinObservations: "id,scanId,createdAt",
  savedLooks: "id,createdAt,name",
  makeupPresets: "id,name",
  hairPresets: "id,name",
  outfits: "id,createdAt",
  products: "id,name,brand,category",
  productVariants: "id,productId",
  ownedProducts: "id,&productId,addedAt",
  wishlists: "id,name",
  shoppingBags: "id,&productId,addedAt",
  routines: "id,period,updatedAt",
  routineEvents: "id,routineId,completedAt",
  journalEntries: "id,createdAt,*tags",
  goals: "id,createdAt",
  beautyExperiments: "id,createdAt",
  userFeedback: "id,subjectId,createdAt",
  memoryNodes:
    "id,type,subjectId,key,consentScope,updatedAt,[subjectId+type+key]",
  memoryEdges: "id,fromId,toId,type",
  agentEpisodes: "id,createdAt",
  agentMessages: "id,episodeId,createdAt",
  agentToolRuns: "id,episodeId,name,createdAt",
  recommendations: "id,createdAt",
  priceSnapshots: "id,productId,observedAt",
  mediaAssets: "id,createdAt",
  settings: "id",
};
export class BeautyDatabase extends Dexie {
  profiles!: Table<Profile>;
  consents!: Table<Consent>;
  skinScans!: Table<SkinScan>;
  skinObservations!: Table<GenericRecord>;
  savedLooks!: Table<SavedLook>;
  makeupPresets!: Table<GenericRecord>;
  hairPresets!: Table<GenericRecord>;
  outfits!: Table<GenericRecord>;
  products!: Table<ProductRecord>;
  productVariants!: Table<GenericRecord>;
  ownedProducts!: Table<OwnedProduct>;
  wishlists!: Table<CollectionRecord>;
  shoppingBags!: Table<ShoppingBag>;
  routines!: Table<Routine>;
  routineEvents!: Table<RoutineEvent>;
  journalEntries!: Table<JournalEntry>;
  goals!: Table<GenericRecord>;
  beautyExperiments!: Table<GenericRecord>;
  userFeedback!: Table<GenericRecord>;
  memoryNodes!: Table<MemoryNode>;
  memoryEdges!: Table<MemoryEdge>;
  memoryRevisions!: Table<MemoryRevision>;
  agentEpisodes!: Table<AgentEpisode>;
  agentMessages!: Table<AgentMessage>;
  agentToolRuns!: Table<AgentToolRun>;
  recommendations!: Table<GenericRecord>;
  priceSnapshots!: Table<GenericRecord>;
  mediaAssets!: Table<MediaAsset>;
  settings!: Table<Setting>;
  constructor(name = "true-beauty") {
    super(name);
    this.version(1).stores(storesV1);
    this.version(2)
      .stores({
        ...storesV1,
        memoryRevisions: "id,nodeId,createdAt",
        memoryNodes: storesV1.memoryNodes + ",validUntil,lastUsedAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("memoryNodes")
          .toCollection()
          .modify((node) => {
            node.revision ??= 1;
            node.validFrom ??= node.createdAt;
            node.retentionPolicy ??= "until-deleted";
            node.evidenceRefs ??= [];
          });
      });
    this.version(3)
      .stores({
        ...storesV1,
        memoryRevisions: "id,nodeId,createdAt",
        memoryNodes: storesV1.memoryNodes + ",validUntil,lastUsedAt",
        shoppingBags:
          "id,&lineKey,productId,variantId,currency,sourceKey,addedAt",
      })
      .upgrade(async (tx) => {
        await tx
          .table("shoppingBags")
          .toCollection()
          .modify((row) => Object.assign(row, normalizeShoppingBag(row)));
      });
  }
}
export const db = new BeautyDatabase();
export const newId = () => crypto.randomUUID();

export async function initializeDatabase(database = db): Promise<Profile> {
  await database.open();
  const profile = await database.transaction(
    "rw",
    database.profiles,
    async () => {
      let profile = await database.profiles.get(localProfileId);
      if (!profile) {
        const now = Date.now();
        profile = {
          id: localProfileId,
          displayName: "Beauty explorer",
          skinType: "Not specified",
          budget: 20000,
          currency: "NGN",
          concerns: [],
          preferences: [],
          createdAt: now,
          updatedAt: now,
        };
        await database.profiles.add(profile);
      }
      return profile;
    },
  );
  await database.transaction(
    "rw",
    [
      database.memoryNodes,
      database.memoryEdges,
      database.memoryRevisions,
      database.agentEpisodes,
      database.agentMessages,
      database.agentToolRuns,
    ],
    async () => {
      const now = Date.now(),
        expired = (await database.memoryNodes.toArray()).filter(
          (node) =>
            node.retentionPolicy === "session" ||
            (node.retentionPolicy === "30-days" &&
              node.updatedAt <= now - 30 * 86400000) ||
            (node.retentionPolicy === "90-days" &&
              node.updatedAt <= now - 90 * 86400000),
        );
      if (expired.length)
        await deleteMemoryNodes(
          expired.map((node) => node.id),
          database,
        );
    },
  );
  return profile;
}
export async function hasConsent(scope: ConsentScope, database = db) {
  return (
    (await database.consents.where("scope").equals(scope).first())?.granted ===
    true
  );
}
export async function setConsent(
  scope: ConsentScope,
  granted: boolean,
  database = db,
) {
  if (!CONSENT_SCOPES.includes(scope)) throw new Error("Unknown consent scope");
  await database.transaction(
    "rw",
    [
      database.consents,
      database.memoryNodes,
      database.memoryEdges,
      database.memoryRevisions,
      database.agentEpisodes,
      database.agentMessages,
      database.agentToolRuns,
      database.mediaAssets,
      database.skinScans,
      database.skinObservations,
      database.savedLooks,
      database.outfits,
    ],
    async () => {
      await database.consents.put({
        id: scope,
        scope,
        granted,
        updatedAt: Date.now(),
        source: "user",
      });
      if (!granted) {
        const nodes = await database.memoryNodes
          .where("consentScope")
          .equals(scope)
          .primaryKeys();
        await deleteMemoryNodes(nodes as string[], database);
        if (scope === "memory.history") {
          await database.agentEpisodes.clear();
          await database.agentMessages.clear();
          await database.agentToolRuns.clear();
        }
        if (scope === "media.photos") {
          await database.mediaAssets.clear();
          await database.savedLooks.toCollection().modify((look) => {
            delete look.thumbnail;
          });
          await database.outfits.toCollection().modify((outfit) => {
            delete outfit.personMediaAssetId;
            delete outfit.garmentMediaAssetId;
          });
        }
        if (scope === "analysis.history") {
          const mediaIds = (await database.skinScans.toArray()).flatMap(
            (scan) => (scan.mediaAssetId ? [scan.mediaAssetId] : []),
          );
          if (mediaIds.length) await database.mediaAssets.bulkDelete(mediaIds);
          await database.skinScans.clear();
          await database.skinObservations.clear();
        }
      }
    },
  );
}
export async function deleteMemoryNodes(ids: string[], database = db) {
  if (!ids.length) return;
  const idSet = new Set(ids);
  await database.memoryEdges
    .filter((edge) => idSet.has(edge.fromId) || idSet.has(edge.toId))
    .delete();
  await database.memoryRevisions.where("nodeId").anyOf(ids).delete();
  await database.memoryNodes.bulkDelete(ids);
  const episodes = await database.agentEpisodes
    .filter((e) => e.memoryRefs.some((ref) => idSet.has(ref)))
    .primaryKeys();
  if (episodes.length) {
    await database.agentMessages
      .where("episodeId")
      .anyOf(episodes as string[])
      .delete();
    await database.agentToolRuns
      .where("episodeId")
      .anyOf(episodes as string[])
      .delete();
    await database.agentEpisodes.bulkDelete(episodes);
  }
}
export async function deleteSkinScan(id: string, database = db) {
  await database.transaction(
    "rw",
    [
      database.skinScans,
      database.skinObservations,
      database.mediaAssets,
      database.memoryNodes,
      database.memoryEdges,
      database.memoryRevisions,
      database.agentEpisodes,
      database.agentMessages,
      database.agentToolRuns,
    ],
    async () => {
      const scan = await database.skinScans.get(id);
      await database.skinScans.delete(id);
      await database.skinObservations.where("scanId").equals(id).delete();
      if (scan?.mediaAssetId)
        await database.mediaAssets.delete(scan.mediaAssetId);
      const nodes = await database.memoryNodes
        .filter((n) => n.evidenceRefs.includes(id) || n.subjectId === id)
        .primaryKeys();
      await deleteMemoryNodes(nodes as string[], database);
    },
  );
}
export async function clearLocalData(database = db) {
  await database.transaction("rw", database.tables, async () => {
    for (const table of database.tables) await table.clear();
  });
}
export async function saveMedia(blob: Blob, name: string, database = db) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(blob.type) ||
    blob.size > 12 * 1024 * 1024
  )
    throw new Error("Use a JPEG, PNG or WebP under 12 MB");
  const id = newId();
  try {
    await database.transaction(
      "rw",
      database.consents,
      database.mediaAssets,
      async () => {
        if (!(await hasConsent("media.photos", database)))
          throw new Error("Photo storage consent is required");
        await database.mediaAssets.add({
          id,
          blob,
          mimeType: blob.type,
          createdAt: Date.now(),
          consentScope: "media.photos",
          name: name.slice(0, 200),
        });
      },
    );
  } catch (error) {
    if (error instanceof Error && /quota/i.test(error.name + error.message))
      throw new Error(
        "Browser storage is full. Export or remove saved photos before trying again.",
      );
    throw error;
  }
  return id;
}
export async function saveSkinScan(scan: SkinScan, database = db) {
  await database.transaction(
    "rw",
    database.consents,
    database.skinScans,
    database.mediaAssets,
    async () => {
      if (!(await hasConsent("analysis.history", database)))
        throw new Error("Skin-history storage consent is required");
      if (
        scan.mediaAssetId &&
        (!(await hasConsent("media.photos", database)) ||
          !(await database.mediaAssets.get(scan.mediaAssetId)))
      )
        throw new Error("A saved photograph requires separate photo consent");
      await database.skinScans.add(scan);
    },
  );
  return scan.id;
}
export async function saveLook(
  name: string,
  look: unknown,
  database = db,
): Promise<SavedLook> {
  // A look stores controls only. Images require their own separate consent path.
  const value = {
    id: newId(),
    name: name.trim().slice(0, 120) || "Untitled look",
    look: JSON.parse(JSON.stringify(look)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await database.savedLooks.add(value);
  return value;
}

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);
const recordSchema = z
  .record(z.string(), jsonSchema)
  .refine(
    (record) =>
      typeof record.id === "string" &&
      record.id.length > 0 &&
      record.id.length <= 200,
    "Every record needs an id",
  );
const backupSchema = z
  .object({
    format: z.literal("true-beauty-backup"),
    version: z.literal(2),
    exportedAt: z.number(),
    tables: z.record(z.enum(tableNames), z.array(recordSchema).max(100000)),
  })
  .strict();
const stamp = z.number().nonnegative().finite();
const baseRecord = z
  .object({
    id: z.string().min(1).max(200),
    createdAt: stamp.optional(),
    updatedAt: stamp.optional(),
  })
  .passthrough();
const memoryNodeSchema = baseRecord.extend({
  type: z.enum(MEMORY_TYPES),
  subjectId: z.string().min(1),
  key: z.string().min(1).max(120),
  value: jsonSchema,
  createdAt: stamp,
  updatedAt: stamp,
  source: z.string(),
  confidence: z.number().min(0).max(1),
  evidenceRefs: z.array(z.string()),
  consentScope: z.enum(CONSENT_SCOPES),
  retentionPolicy: z.enum(["until-deleted", "session", "30-days", "90-days"]),
  lastUsedAt: stamp,
  validFrom: stamp,
  validUntil: stamp.optional(),
  revision: z.number().int().positive(),
  supersedes: z.string().optional(),
});
const httpsSource = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Expected a public HTTPS source URL");
const shoppingBagRecordSchema = baseRecord.extend({
  productId: z.string().min(1).max(200),
  quantity: z.number().int().min(1).max(99),
  addedAt: stamp,
  lineKey: z.string().max(1600).optional(),
  variantId: z.string().min(1).max(200).optional(),
  size: z.string().max(80).optional(),
  variantName: z.string().max(200).optional(),
  productName: z.string().max(240).optional(),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).optional(),
  unitPrice: z.number().nonnegative().max(1e9).finite().optional(),
  priceKind: z.enum(["sample", "verified", "imported"]).optional(),
  sourceKey: z.string().min(1).max(200).optional(),
  merchantSourceId: z.string().max(200).optional(),
  sourceUrl: httpsSource.optional(),
  priceObservedAt: z.iso.datetime().optional(),
  imported: z.boolean().optional(),
});
const tableRecordSchemas: Partial<Record<TableName, z.ZodType>> = {
  profiles: baseRecord.extend({
    displayName: z.string().max(80),
    skinType: z.string(),
    budget: z.number().nonnegative().max(1e9),
    currency: z.enum(["NGN", "USD", "GBP", "EUR"]),
    concerns: z.array(z.string()),
    preferences: z.array(z.string()),
    createdAt: stamp,
    updatedAt: stamp,
  }),
  consents: baseRecord.extend({
    scope: z.enum(CONSENT_SCOPES),
    granted: z.boolean(),
    updatedAt: stamp,
    source: z.string(),
  }),
  memoryNodes: memoryNodeSchema,
  memoryEdges: baseRecord.extend({
    fromId: z.string().min(1),
    toId: z.string().min(1),
    type: z.string().min(1),
    createdAt: stamp,
    evidenceRefs: z.array(z.string()),
  }),
  memoryRevisions: baseRecord.extend({
    nodeId: z.string().min(1),
    revision: z.number().int().positive(),
    value: jsonSchema,
    source: z.string(),
    createdAt: stamp,
  }),
  agentEpisodes: baseRecord.extend({
    createdAt: stamp,
    request: z.string(),
    summary: z.string(),
    memoryRefs: z.array(z.string()),
  }),
  agentMessages: baseRecord.extend({
    episodeId: z.string().min(1),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    createdAt: stamp,
  }),
  agentToolRuns: baseRecord.extend({
    episodeId: z.string().min(1),
    name: z.string(),
    status: z.enum(["succeeded", "failed", "unavailable", "consent-required"]),
    summary: z.string(),
    createdAt: stamp,
    durationMs: z.number().nonnegative(),
    memoryRefs: z.array(z.string()).optional(),
  }),
  savedLooks: baseRecord.extend({
    name: z.string().min(1).max(120),
    look: jsonSchema,
    createdAt: stamp,
    updatedAt: stamp,
  }),
  ownedProducts: baseRecord.extend({
    productId: z.string().min(1),
    addedAt: stamp,
    name: z.string().optional(),
  }),
  shoppingBags: shoppingBagRecordSchema,
  wishlists: baseRecord.extend({
    name: z.string(),
    productIds: z.array(z.string()),
    createdAt: stamp,
    updatedAt: stamp,
  }),
  routines: baseRecord.extend({
    name: z.string().min(1),
    period: z.enum(["AM", "PM"]),
    steps: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          productId: z.string().optional(),
          reason: z.string().optional(),
        })
        .passthrough(),
    ),
    createdAt: stamp,
    updatedAt: stamp,
  }),
  routineEvents: baseRecord.extend({
    routineId: z.string(),
    completedAt: stamp,
    stepIds: z.array(z.string()),
  }),
  journalEntries: baseRecord.extend({
    title: z.string(),
    body: z.string(),
    createdAt: stamp,
    updatedAt: stamp,
    tags: z.array(z.string()),
  }),
  skinScans: baseRecord.extend({
    provider: z.string(),
    createdAt: stamp,
    observations: z.array(jsonSchema),
  }),
  products: baseRecord.extend({ name: z.string() }),
  settings: baseRecord.extend({ value: jsonSchema, updatedAt: stamp }),
};
export type BeautyBackup = z.infer<typeof backupSchema>;
export async function exportLocalData(database = db): Promise<string> {
  const tables: Record<string, unknown[]> = {};
  await database.transaction("r", database.tables, async () => {
    for (const table of database.tables) {
      // Photos are deliberately excluded: a portable backup never silently shares a face image.
      if (table.name === "mediaAssets") {
        tables[table.name] = [];
        continue;
      }
      tables[table.name] = (await table.toArray()).map((row) => {
        const result = { ...row };
        delete result.thumbnail;
        delete result.mediaAssetId;
        delete result.personMediaAssetId;
        delete result.garmentMediaAssetId;
        return result;
      });
    }
  });
  return JSON.stringify(
    {
      format: "true-beauty-backup",
      version: 2,
      exportedAt: Date.now(),
      tables,
    },
    null,
    2,
  );
}
export async function importLocalData(
  json: string,
  database = db,
): Promise<number> {
  if (json.length > 25 * 1024 * 1024) throw new Error("Backup exceeds 25 MB");
  const parsed = backupSchema.parse(JSON.parse(json));
  // Credentials and executable markup have no place in a personal data backup.
  const forbidden =
    /^(?:.*api[_-]?key.*|.*secret.*|password|authorization|access[_-]?token|__proto__|constructor|prototype)$/i;
  const checkFields = (value: JsonValue): void => {
    if (value && typeof value === "object")
      for (const [key, nested] of Object.entries(value)) {
        if (forbidden.test(key))
          throw new Error("Backup contains a credential field");
        checkFields(nested);
      }
  };
  let count = 0;
  for (const [name, rows] of Object.entries(parsed.tables)) {
    if (name === "mediaAssets" && rows.length)
      throw new Error("Photo imports are not supported");
    for (const row of rows) {
      checkFields(row);
      if (typeof row.id !== "string") throw new Error("Malformed record");
      const validation = (
        tableRecordSchemas[name as TableName] ?? baseRecord
      ).safeParse(row);
      if (!validation.success)
        throw new Error(
          `Malformed ${name} record: ${validation.error.issues.map((issue) => issue.path.join(".") || "record").join(", ")}`,
        );
      if (name === "memoryNodes") {
        if (
          !MEMORY_TYPES.includes(row.type as MemoryType) ||
          !CONSENT_SCOPES.includes(row.consentScope as ConsentScope) ||
          typeof row.key !== "string" ||
          typeof row.confidence !== "number" ||
          row.confidence < 0 ||
          row.confidence > 1
        )
          throw new Error("Malformed memory");
      }
      if (
        name === "consents" &&
        (!CONSENT_SCOPES.includes(row.scope as ConsentScope) ||
          typeof row.granted !== "boolean")
      )
        throw new Error("Malformed consent");
      if (
        name === "shoppingBags" &&
        (typeof row.quantity !== "number" ||
          row.quantity < 1 ||
          row.quantity > 99)
      )
        throw new Error("Malformed bag quantity");
      if (
        "thumbnail" in row ||
        "mediaAssetId" in row ||
        "personMediaAssetId" in row ||
        "garmentMediaAssetId" in row
      )
        throw new Error("Photo references are excluded from portable backups");
      count++;
    }
  }
  // Import does not grant new permission. Existing local consent gates imported history.
  await database.transaction("rw", database.tables, async () => {
    const permits = new Set(
      (await database.consents.toArray())
        .filter((c) => c.granted)
        .map((c) => c.scope),
    );
    // Restore graph dependencies before prose: an old backup must never resurrect a
    // revoked preference through its attributed consultation, message or tool output.
    const nodeIds = new Set(
      (await database.memoryNodes.toArray())
        .filter((node) => permits.has(node.consentScope))
        .map((node) => node.id),
    );
    for (const node of parsed.tables.memoryNodes)
      if (permits.has(node.consentScope as ConsentScope))
        nodeIds.add(node.id as string);
    const existingEpisodes = await database.agentEpisodes.toArray();
    const episodeIds = new Set<string>();
    if (permits.has("memory.history")) {
      for (const episode of existingEpisodes)
        if (episode.memoryRefs.every((ref) => nodeIds.has(ref)))
          episodeIds.add(episode.id);
      for (const episode of parsed.tables.agentEpisodes)
        if ((episode.memoryRefs as string[]).every((ref) => nodeIds.has(ref)))
          episodeIds.add(episode.id as string);
    }
    for (const [name, rows] of Object.entries(parsed.tables)) {
      if (name === "consents") continue;
      const allowed = rows.filter((row) => {
        if (name === "memoryNodes")
          return permits.has(row.consentScope as ConsentScope);
        if (name === "memoryEdges")
          return (
            nodeIds.has(row.fromId as string) && nodeIds.has(row.toId as string)
          );
        if (name === "memoryRevisions")
          return nodeIds.has(row.nodeId as string);
        if (name === "agentEpisodes") return episodeIds.has(row.id as string);
        if (name === "agentMessages" || name === "agentToolRuns")
          return (
            permits.has("memory.history") &&
            episodeIds.has(row.episodeId as string)
          );
        if (["skinScans", "skinObservations"].includes(name))
          return permits.has("analysis.history");
        return true;
      });
      const prepared = allowed.map((row) => {
        if (name === "shoppingBags") {
          const normalized = normalizeShoppingBag(
            row as unknown as ShoppingBag,
          );
          return {
            ...normalized,
            imported: true,
            ...(normalized.priceKind === "verified"
              ? { priceKind: "imported" }
              : {}),
          };
        }
        if (name === "priceSnapshots") return { ...row, imported: true };
        return row;
      });
      if (prepared.length) {
        if (name === "shoppingBags")
          for (const row of prepared) {
            const existing = await database.shoppingBags
              .where("lineKey")
              .equals(row.lineKey as string)
              .first();
            if (existing && existing.id !== row.id)
              await database.shoppingBags.delete(existing.id);
          }
        await database.table(name).bulkPut(prepared);
      }
    }
    await database.memoryEdges
      .filter((e) => !nodeIds.has(e.fromId) || !nodeIds.has(e.toId))
      .delete();
    await database.memoryRevisions
      .filter((r) => !nodeIds.has(r.nodeId))
      .delete();
    await database.agentEpisodes
      .filter((episode) => !episodeIds.has(episode.id))
      .delete();
    await database.agentMessages
      .filter((message) => !episodeIds.has(message.episodeId))
      .delete();
    await database.agentToolRuns
      .filter((run) => !episodeIds.has(run.episodeId))
      .delete();
  });
  return count;
}

const base64 = (bytes: Uint8Array) => {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
};
const unbase64 = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  usages: KeyUsage[],
) {
  if (passphrase.length < 12)
    throw new Error("Use a passphrase with at least 12 characters");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 310000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}
export async function encryptBackup(
  json: string,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16)),
    iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(json),
  );
  return JSON.stringify({
    format: "true-beauty-encrypted",
    version: 1,
    kdf: "PBKDF2-SHA256",
    iterations: 310000,
    salt: base64(salt),
    iv: base64(iv),
    ciphertext: base64(new Uint8Array(ciphertext)),
  });
}
export async function decryptBackup(
  json: string,
  passphrase: string,
): Promise<string> {
  if (json.length > 40 * 1024 * 1024)
    throw new Error("Encrypted backup exceeds 40 MB");
  const backup = z
    .object({
      format: z.literal("true-beauty-encrypted"),
      version: z.literal(1),
      kdf: z.literal("PBKDF2-SHA256"),
      iterations: z.literal(310000),
      salt: z.string(),
      iv: z.string(),
      ciphertext: z.string(),
    })
    .strict()
    .parse(JSON.parse(json));
  const salt = unbase64(backup.salt),
    iv = unbase64(backup.iv);
  if (salt.length !== 16 || iv.length !== 12)
    throw new Error("Invalid encryption parameters");
  const key = await deriveKey(passphrase, salt, ["decrypt"]);
  try {
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource },
        key,
        unbase64(backup.ciphertext) as BufferSource,
      ),
    );
  } catch {
    throw new Error("Incorrect passphrase or damaged backup");
  }
}
