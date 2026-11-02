import {
  db,
  deleteMemoryNodes,
  hasConsent,
  localProfileId,
  newId,
  type BeautyDatabase,
  type ConsentScope,
  type JsonValue,
  type MemoryNode,
  type MemoryType,
} from "../../local-database/src";

export interface RememberOptions {
  consented: boolean;
  source?: string;
  confidence?: number;
  evidenceRefs?: string[];
  retentionPolicy?: MemoryNode["retentionPolicy"];
  subjectId?: string;
  type?: MemoryType;
  scope?: ConsentScope;
}
const normalizeKey = (key: string) =>
  key.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 120);
const fingerprint = (value: JsonValue): string =>
  JSON.stringify(
    value,
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.keys(value).sort()
      : undefined,
  );
function isCurrent(node: MemoryNode, now: number) {
  return (
    (!node.validUntil || node.validUntil > now) &&
    node.retentionPolicy !== "session" &&
    (node.retentionPolicy !== "30-days" ||
      node.updatedAt > now - 30 * 86400000) &&
    (node.retentionPolicy !== "90-days" || node.updatedAt > now - 90 * 86400000)
  );
}

/** Explicit, category-scoped memory. Calling a consultation never saves memory implicitly. */
export async function rememberPreference(
  key: string,
  value: JsonValue,
  options: RememberOptions,
  database: BeautyDatabase = db,
): Promise<MemoryNode> {
  const scope = options.scope ?? "memory.preferences";
  if (!options.consented)
    throw new Error("Enable this memory category before saving a preference");
  const cleanKey = normalizeKey(key);
  if (!cleanKey) throw new Error("A memory needs a descriptive key");
  if (JSON.stringify(value).length > 16000)
    throw new Error("Memory is too large");
  const now = Date.now(),
    subjectId = options.subjectId ?? localProfileId,
    type = options.type ?? "UserPreference";
  const confidence = Math.min(1, Math.max(0, options.confidence ?? 1));
  return database.transaction(
    "rw",
    database.consents,
    database.memoryNodes,
    database.memoryEdges,
    database.memoryRevisions,
    async () => {
      if (!(await hasConsent(scope, database)))
        throw new Error(
          "Enable this memory category before saving a preference",
        );
      const previous = (
        await database.memoryNodes
          .where("[subjectId+type+key]")
          .equals([subjectId, type, cleanKey])
          .toArray()
      )
        .filter((n) => isCurrent(n, now))
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (previous && fingerprint(previous.value) === fingerprint(value)) {
        await database.memoryNodes.update(previous.id, {
          lastUsedAt: now,
          updatedAt: now,
        });
        return { ...previous, lastUsedAt: now, updatedAt: now };
      }
      // Contradictions create an attributed successor; historical values remain inspectable.
      const node: MemoryNode = {
        id: newId(),
        type,
        subjectId,
        key: cleanKey,
        value,
        createdAt: now,
        updatedAt: now,
        source: options.source ?? "user",
        confidence,
        evidenceRefs: options.evidenceRefs ?? [],
        consentScope: scope,
        retentionPolicy: options.retentionPolicy ?? "until-deleted",
        lastUsedAt: now,
        validFrom: now,
        revision: 1,
        ...(previous ? { supersedes: previous.id } : {}),
      };
      if (previous) {
        await database.memoryNodes.update(previous.id, {
          validUntil: now,
          updatedAt: now,
        });
        await database.memoryEdges.add({
          id: newId(),
          fromId: previous.id,
          toId: node.id,
          type: "SUPERSEDED_BY",
          createdAt: now,
          evidenceRefs: node.evidenceRefs,
        });
      }
      await database.memoryNodes.add(node);
      await database.memoryRevisions.add({
        id: newId(),
        nodeId: node.id,
        revision: 1,
        value,
        source: node.source,
        createdAt: now,
      });
      return node;
    },
  );
}

export interface RetrievedMemory {
  node: MemoryNode;
  score: number;
  explanation: string;
}
export async function retrieveMemories(
  query: string,
  options: { limit?: number; types?: MemoryType[]; subjectId?: string } = {},
  database: BeautyDatabase = db,
): Promise<RetrievedMemory[]> {
  return database.transaction(
    "rw",
    database.consents,
    database.memoryNodes,
    async () => {
      const now = Date.now();
      const permits = new Set(
        (await database.consents.toArray())
          .filter((c) => c.granted)
          .map((c) => c.scope),
      );
      const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      const memories = await database.memoryNodes
        .where("subjectId")
        .equals(options.subjectId ?? localProfileId)
        .toArray();
      const relevant = memories
        .filter(
          (node) =>
            permits.has(node.consentScope) &&
            isCurrent(node, now) &&
            (!options.types || options.types.includes(node.type)),
        )
        .map((node) => {
          const content = (
            node.key +
            " " +
            JSON.stringify(node.value)
          ).toLowerCase();
          const matches = tokens.filter((token) =>
            content.includes(token),
          ).length;
          const textScore = tokens.length ? matches / tokens.length : 0.5;
          const ageDays = (now - node.updatedAt) / 86400000;
          const recency = Math.exp(-ageDays / 90);
          const score = node.confidence * (0.75 * textScore + 0.25 * recency);
          return {
            node,
            score,
            explanation: `${node.source === "user" ? "You provided" : `Source: ${node.source};`} ${node.key.replaceAll("-", " ")} on ${new Date(node.createdAt).toISOString().slice(0, 10)}. Confidence ${Math.round(node.confidence * 100)}%.${node.evidenceRefs.length ? ` Evidence: ${node.evidenceRefs.join(", ")}.` : ""}`,
          };
        })
        .filter(
          (result) =>
            result.node.confidence >= 0.3 &&
            (!tokens.length || result.score >= 0.25),
        )
        .sort((a, b) => b.score - a.score)
        .slice(0, options.limit ?? 8);
      if (relevant.length)
        await database.memoryNodes.bulkPut(
          relevant.map((r) => ({ ...r.node, lastUsedAt: now })),
        );
      return relevant;
    },
  );
}

export async function reviseMemory(
  id: string,
  value: JsonValue,
  database: BeautyDatabase = db,
): Promise<MemoryNode> {
  if (JSON.stringify(value).length > 16000)
    throw new Error("Memory is too large");
  return database.transaction(
    "rw",
    database.consents,
    database.memoryNodes,
    database.memoryRevisions,
    async () => {
      const node = await database.memoryNodes.get(id);
      if (!node) throw new Error("Memory not found");
      if (!(await hasConsent(node.consentScope, database)))
        throw new Error("Memory category is disabled");
      if (node.validUntil && node.validUntil <= Date.now())
        throw new Error(
          "This memory was superseded. Edit the current preference instead.",
        );
      const now = Date.now(),
        revision = node.revision + 1;
      const updated = {
        ...node,
        value,
        revision,
        updatedAt: now,
        source: "user correction",
        confidence: 1,
      };
      await database.memoryNodes.put(updated);
      await database.memoryRevisions.add({
        id: newId(),
        nodeId: id,
        revision,
        value,
        source: "user correction",
        createdAt: now,
      });
      return updated;
    },
  );
}
export async function forgetMemory(id: string, database: BeautyDatabase = db) {
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
      // Remove the revision chain too: deleting an active preference must not leave older values retrievable.
      const nodes = await database.memoryNodes.toArray(),
        ids = new Set([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of nodes)
          if (
            (node.supersedes && ids.has(node.supersedes)) ||
            (ids.has(node.id) && node.supersedes && !ids.has(node.supersedes))
          ) {
            const before = ids.size;
            ids.add(node.id);
            if (node.supersedes) ids.add(node.supersedes);
            if (ids.size !== before) changed = true;
          }
      }
      await deleteMemoryNodes([...ids], database);
      // Episodes may contain values in prose. Delete every episode attributed to the forgotten chain.
      const episodes = await database.agentEpisodes
        .filter((e) => e.memoryRefs.some((ref) => ids.has(ref)))
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
    },
  );
}
export async function getMemoryExplanation(
  id: string,
  database: BeautyDatabase = db,
) {
  return database.transaction(
    "r",
    database.consents,
    database.memoryNodes,
    database.memoryRevisions,
    database.memoryEdges,
    async () => {
      const node = await database.memoryNodes.get(id);
      if (!node) return null;
      if (!(await hasConsent(node.consentScope, database))) return null;
      return {
        node,
        revisions: await database.memoryRevisions
          .where("nodeId")
          .equals(id)
          .sortBy("createdAt"),
        edges: await database.memoryEdges
          .filter((e) => e.fromId === id || e.toId === id)
          .toArray(),
      };
    },
  );
}
export async function purgeExpiredMemories(database: BeautyDatabase = db) {
  return database.transaction(
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
      const now = Date.now();
      const expired = (await database.memoryNodes.toArray()).filter(
        (node) =>
          node.retentionPolicy === "session" ||
          (node.retentionPolicy === "30-days" &&
            node.updatedAt <= now - 30 * 86400000) ||
          (node.retentionPolicy === "90-days" &&
            node.updatedAt <= now - 90 * 86400000),
      );
      await deleteMemoryNodes(
        expired.map((n) => n.id),
        database,
      );
      return expired.length;
    },
  );
}
