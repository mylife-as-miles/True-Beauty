import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BeautyDatabase,
  initializeDatabase,
  setConsent,
} from "../../local-database/src";
import {
  rememberPreference,
  retrieveMemories,
  reviseMemory,
  forgetMemory,
  purgeExpiredMemories,
  getMemoryExplanation,
} from "./index";
let db: BeautyDatabase;
beforeEach(async () => {
  db = new BeautyDatabase("memory-test-" + crypto.randomUUID());
  await initializeDatabase(db);
});
afterEach(async () => {
  await db.delete();
});
describe("BeautyGraph consent, temporal retrieval, revision and deletion", () => {
  it("requires both an explicit request and a category permission", async () => {
    await expect(
      rememberPreference("finish", "matte", { consented: true }, db),
    ).rejects.toThrow("Enable");
    await setConsent("memory.preferences", true, db);
    await expect(
      rememberPreference("finish", "matte", { consented: false }, db),
    ).rejects.toThrow("Enable");
  });
  it("deduplicates identical values and supersedes contradictory preferences", async () => {
    await setConsent("memory.preferences", true, db);
    const a = await rememberPreference(
        "lip finish",
        "matte",
        { consented: true },
        db,
      ),
      b = await rememberPreference(
        "lip finish",
        "matte",
        { consented: true },
        db,
      );
    expect(a.id).toBe(b.id);
    const c = await rememberPreference(
      "lip finish",
      "gloss",
      { consented: true },
      db,
    );
    expect(c.id).not.toBe(a.id);
    expect(c.supersedes).toBe(a.id);
    expect((await db.memoryNodes.get(a.id))?.validUntil).toBeDefined();
    const retrieved = await retrieveMemories("lip finish", {}, db);
    expect(retrieved.map((r) => r.node.value)).toEqual(["gloss"]);
    expect(await db.memoryEdges.count()).toBe(1);
  });
  it("keeps attributed revisions and uses corrected values", async () => {
    await setConsent("memory.preferences", true, db);
    const node = await rememberPreference(
      "hair colour",
      "copper",
      { consented: true },
      db,
    );
    await reviseMemory(node.id, "auburn", db);
    const explained = await getMemoryExplanation(node.id, db);
    expect(explained?.node.value).toBe("auburn");
    expect(explained?.node.confidence).toBe(1);
    expect(explained?.revisions).toHaveLength(2);
    expect(explained?.revisions[1].source).toBe("user correction");
  });
  it("revocation deletes values, revisions and links immediately", async () => {
    await setConsent("memory.preferences", true, db);
    await rememberPreference("finish", "matte", { consented: true }, db);
    await setConsent("memory.preferences", false, db);
    expect(await retrieveMemories("", {}, db)).toEqual([]);
    expect(await db.memoryNodes.count()).toBe(0);
    expect(await db.memoryRevisions.count()).toBe(0);
  });
  it("a racing correction cannot recreate revoked memory or leave a revision artifact", async () => {
    await setConsent("memory.preferences", true, db);
    const node = await rememberPreference(
      "finish",
      "matte",
      { consented: true },
      db,
    );
    await Promise.allSettled([
      reviseMemory(node.id, "gloss", db),
      setConsent("memory.preferences", false, db),
    ]);
    expect(await db.memoryNodes.count()).toBe(0);
    expect(await db.memoryRevisions.count()).toBe(0);
    expect(await db.memoryEdges.count()).toBe(0);
  });
  it("forgetting an active preference removes the whole temporal chain", async () => {
    await setConsent("memory.preferences", true, db);
    await rememberPreference("finish", "matte", { consented: true }, db);
    const latest = await rememberPreference(
      "finish",
      "gloss",
      { consented: true },
      db,
    );
    await forgetMemory(latest.id, db);
    expect(await db.memoryNodes.count()).toBe(0);
    expect(await db.memoryEdges.count()).toBe(0);
    expect(await db.memoryRevisions.count()).toBe(0);
  });
  it("filters low confidence and expired observations with explicit retention cleanup", async () => {
    await setConsent("memory.preferences", true, db);
    const old = await rememberPreference(
      "old note",
      "test",
      { consented: true, retentionPolicy: "30-days" },
      db,
    );
    await db.memoryNodes.update(old.id, {
      updatedAt: Date.now() - 31 * 86400000,
    });
    await rememberPreference(
      "guess",
      "uncertain",
      { consented: true, confidence: 0.1 },
      db,
    );
    expect(await retrieveMemories("", {}, db)).toEqual([]);
    expect(await purgeExpiredMemories(db)).toBe(1);
  });
});
