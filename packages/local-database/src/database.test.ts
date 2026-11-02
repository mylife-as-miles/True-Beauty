import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import {
  BeautyDatabase,
  initializeDatabase,
  saveLook,
  saveMedia,
  saveSkinScan,
  setConsent,
  hasConsent,
  exportLocalData,
  importLocalData,
  clearLocalData,
  deleteSkinScan,
  encryptBackup,
  decryptBackup,
} from "./index";
import { rememberPreference, retrieveMemories } from "../../beauty-memory/src";

let db: BeautyDatabase;
beforeEach(async () => {
  db = new BeautyDatabase("database-test-" + crypto.randomUUID());
  await initializeDatabase(db);
});
afterEach(async () => {
  await db.delete();
});

describe("local-first persistence and privacy", () => {
  it("creates one no-login profile transactionally", async () => {
    const a = await initializeDatabase(db),
      b = await initializeDatabase(db);
    expect(a.id).toBe(b.id);
    expect(await db.profiles.count()).toBe(1);
    expect(await db.consents.count()).toBe(0);
  });
  it("stores editable look controls without a photograph", async () => {
    await saveLook("Daylight", { lipstick: { color: "#ff0000" } }, db);
    const look = await db.savedLooks.toCollection().first();
    expect(look?.name).toBe("Daylight");
    expect(look).not.toHaveProperty("thumbnail");
    expect(await db.mediaAssets.count()).toBe(0);
  });
  it("denies photo storage by default and validates consented images", async () => {
    await expect(
      saveMedia(new Blob(["image"], { type: "image/png" }), "portrait", db),
    ).rejects.toThrow("consent");
    await setConsent("media.photos", true, db);
    await expect(
      saveMedia(new Blob(["svg"], { type: "image/svg+xml" }), "portrait", db),
    ).rejects.toThrow("JPEG");
    const id = await saveMedia(
      new Blob(["png"], { type: "image/png" }),
      "portrait",
      db,
    );
    expect(await db.mediaAssets.get(id)).toBeDefined();
    await setConsent("media.photos", false, db);
    expect(await db.mediaAssets.count()).toBe(0);
  });
  it("exports/imports validated non-image data and never imports consent grants", async () => {
    await saveLook("Test", { color: "#112233" }, db);
    await setConsent("memory.preferences", true, db);
    await rememberPreference("finish", "matte", { consented: true }, db);
    const exported = await exportLocalData(db);
    await clearLocalData(db);
    await importLocalData(exported, db);
    expect(await db.savedLooks.count()).toBe(1);
    expect(await hasConsent("memory.preferences", db)).toBe(false);
    expect(await db.memoryNodes.count()).toBe(0);
  });
  it("rejects malformed and credential-bearing backup records atomically", async () => {
    const exported = JSON.parse(await exportLocalData(db));
    exported.tables.settings.push({ id: "bad", apiKey: "not-real" });
    await expect(importLocalData(JSON.stringify(exported), db)).rejects.toThrow(
      "credential",
    );
    expect(await db.settings.count()).toBe(0);
    exported.tables.settings = [];
    exported.tables.shoppingBags.push({
      id: "bad",
      productId: "abc",
      quantity: -2,
    });
    await expect(importLocalData(JSON.stringify(exported), db)).rejects.toThrow(
      "quantity",
    );
  });
  it("rejects incomplete memory records before writing any table", async () => {
    await setConsent("memory.preferences", true, db);
    const exported = JSON.parse(await exportLocalData(db));
    exported.tables.memoryNodes.push({
      id: "invalid-node",
      subjectId: "local-profile",
      type: "UserPreference",
      key: "finish",
      confidence: 1,
      consentScope: "memory.preferences",
      updatedAt: Date.now(),
      value: "matte",
    });
    exported.tables.savedLooks.push({
      id: "new-look",
      name: "Should not be imported",
      look: {},
      createdAt: 1,
      updatedAt: 1,
    });
    await expect(importLocalData(JSON.stringify(exported), db)).rejects.toThrow(
      "Malformed memoryNodes",
    );
    expect(await db.savedLooks.count()).toBe(0);
    expect(await db.memoryNodes.count()).toBe(0);
  });
  it("deletes a skin scan with its observations, photo and evidence memories", async () => {
    await setConsent("analysis.history", true, db);
    await setConsent("media.photos", true, db);
    const mediaAssetId = await saveMedia(
      new Blob(["png"], { type: "image/png" }),
      "scan",
      db,
    );
    await db.skinScans.add({
      id: "scan-1",
      provider: "actual-provider",
      createdAt: 1,
      observations: [],
      mediaAssetId,
    });
    await db.skinObservations.add({ id: "observation", scanId: "scan-1" });
    await rememberPreference(
      "redness",
      "user description",
      {
        consented: true,
        scope: "analysis.history",
        evidenceRefs: ["scan-1"],
        type: "SkinObservation",
      },
      db,
    );
    await deleteSkinScan("scan-1", db);
    expect(await db.skinScans.count()).toBe(0);
    expect(await db.skinObservations.count()).toBe(0);
    expect(await db.mediaAssets.count()).toBe(0);
    expect(await db.memoryNodes.count()).toBe(0);
    expect(await db.memoryRevisions.count()).toBe(0);
  });
  it("clears every table and retrieves no forgotten data", async () => {
    await setConsent("memory.preferences", true, db);
    await rememberPreference("colour", "rose", { consented: true }, db);
    await clearLocalData(db);
    for (const table of db.tables) expect(await table.count()).toBe(0);
    expect(await retrieveMemories("", {}, db)).toEqual([]);
  });
  it("revocation cascades evidence-derived prose and photo references", async () => {
    await setConsent("memory.preferences", true, db);
    const node = await rememberPreference(
      "private-preference",
      "rose",
      { consented: true },
      db,
    );
    await db.agentEpisodes.add({
      id: "episode",
      createdAt: 1,
      request: "rose",
      summary: "rose",
      memoryRefs: [node.id],
    });
    await db.agentMessages.add({
      id: "message",
      episodeId: "episode",
      role: "assistant",
      content: "rose",
      createdAt: 1,
    });
    await db.agentToolRuns.add({
      id: "run",
      episodeId: "episode",
      name: "explain",
      status: "succeeded",
      summary: "rose",
      durationMs: 1,
      createdAt: 1,
    });
    await db.outfits.add({
      id: "outfit",
      personMediaAssetId: "person",
      garmentMediaAssetId: "garment",
    });
    await setConsent("memory.preferences", false, db);
    expect(await db.agentEpisodes.count()).toBe(0);
    expect(await db.agentMessages.count()).toBe(0);
    expect(await db.agentToolRuns.count()).toBe(0);
    await setConsent("media.photos", false, db);
    expect(await db.outfits.get("outfit")).not.toHaveProperty(
      "personMediaAssetId",
    );
    expect(await db.outfits.get("outfit")).not.toHaveProperty(
      "garmentMediaAssetId",
    );
  });
  it("serializes an in-flight skin-history save with consent revocation", async () => {
    await setConsent("analysis.history", true, db);
    await Promise.allSettled([
      saveSkinScan(
        { id: "scan", provider: "fixture", createdAt: 1, observations: [] },
        db,
      ),
      setConsent("analysis.history", false, db),
    ]);
    expect(await db.skinScans.count()).toBe(0);
  });
  it("uses a fresh salt and IV and authenticates encrypted backups", async () => {
    const backup = await exportLocalData(db),
      passphrase = "a deliberately long passphrase";
    const encrypted = await encryptBackup(backup, passphrase),
      encryptedAgain = await encryptBackup(backup, passphrase);
    expect(encrypted).not.toEqual(encryptedAgain);
    expect(encrypted).not.toContain("local-profile");
    expect(await decryptBackup(encrypted, passphrase)).toBe(backup);
    await expect(
      decryptBackup(encrypted, "a wrong long passphrase"),
    ).rejects.toThrow("Incorrect");
  });
});

it("migrates a real version-one memory record to version two", async () => {
  const name = "migration-" + crypto.randomUUID(),
    old = new Dexie(name);
  old
    .version(1)
    .stores({
      memoryNodes:
        "id,type,subjectId,key,consentScope,updatedAt,[subjectId+type+key]",
    });
  await old.open();
  await old
    .table("memoryNodes")
    .add({
      id: "legacy",
      createdAt: 100,
      updatedAt: 100,
      type: "UserPreference",
      subjectId: "local-profile",
      key: "finish",
      value: "matte",
    });
  old.close();
  const upgraded = new BeautyDatabase(name);
  await upgraded.open();
  const value = await upgraded.memoryNodes.get("legacy");
  expect(value?.revision).toBe(1);
  expect(value?.retentionPolicy).toBe("until-deleted");
  expect(value?.validFrom).toBe(100);
  expect(await upgraded.memoryRevisions.count()).toBe(0);
  await upgraded.delete();
});
