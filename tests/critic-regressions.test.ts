import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  BeautyDatabase,
  exportLocalData,
  hasConsent,
  importLocalData,
  initializeDatabase,
  saveMedia,
  setConsent,
} from "../packages/local-database/src";
import { rememberPreference } from "../packages/beauty-memory/src";

let database: BeautyDatabase;
beforeEach(async () => {
  database = new BeautyDatabase("critic-regression-" + crypto.randomUUID());
  await initializeDatabase(database);
});
afterEach(async () => {
  await database.delete();
});

it("does not retain an in-flight preference save after permission revocation completes", async () => {
  await setConsent("memory.preferences", true, database);
  await Promise.allSettled([
    rememberPreference(
      "private preference",
      "private value",
      { consented: true },
      database,
    ),
    setConsent("memory.preferences", false, database),
  ]);
  expect(await hasConsent("memory.preferences", database)).toBe(false);
  expect(await database.memoryNodes.count()).toBe(0);
  expect(await database.memoryRevisions.count()).toBe(0);
});

it("does not retain an in-flight photograph save after permission revocation completes", async () => {
  await setConsent("media.photos", true, database);
  await Promise.allSettled([
    saveMedia(
      new Blob(["image fixture"], { type: "image/png" }),
      "private photo",
      database,
    ),
    setConsent("media.photos", false, database),
  ]);
  expect(await hasConsent("media.photos", database)).toBe(false);
  expect(await database.mediaAssets.count()).toBe(0);
});

it("does not restore revoked preference prose through an older consultation backup", async () => {
  await setConsent("memory.preferences", true, database);
  await setConsent("memory.history", true, database);
  const node = await rememberPreference(
    "private preference",
    "private value",
    { consented: true },
    database,
  );
  await database.agentEpisodes.add({
    id: "private-episode",
    createdAt: 1,
    request: "private value",
    summary: "private value",
    memoryRefs: [node.id],
  });
  await database.agentMessages.add({
    id: "private-message",
    episodeId: "private-episode",
    role: "assistant",
    content: "private value",
    createdAt: 1,
  });
  await database.agentToolRuns.add({
    id: "private-tool",
    episodeId: "private-episode",
    name: "explainRecommendation",
    status: "succeeded",
    summary: "private value",
    createdAt: 1,
    durationMs: 1,
  });
  const backup = await exportLocalData(database);
  await setConsent("memory.preferences", false, database);
  expect(await database.agentEpisodes.count()).toBe(0);
  await importLocalData(backup, database);
  expect(await database.memoryNodes.count()).toBe(0);
  expect(await database.agentEpisodes.count()).toBe(0);
  expect(await database.agentMessages.count()).toBe(0);
  expect(await database.agentToolRuns.count()).toBe(0);
});
