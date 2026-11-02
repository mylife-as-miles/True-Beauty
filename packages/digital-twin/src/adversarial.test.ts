import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BeautyDatabase,
  clearLocalData,
  exportLocalData,
  importLocalData,
  initializeDatabase,
  localProfileId,
  setConsent,
} from "../../local-database/src";
import { createDefaultLook } from "../../makeup-engine/src";
import {
  deleteCompleteLook,
  EMPTY_TWIN_PREFERENCES,
  exportDigitalTwin,
  loadDigitalTwin,
  saveCompleteLook,
  saveTwinProfile,
} from "./index";

let database: BeautyDatabase;
beforeEach(async () => {
  database = new BeautyDatabase("r06-twin-" + crypto.randomUUID());
  await initializeDatabase(database);
});
afterEach(async () => {
  await database.delete();
});
const profile = {
  displayName: "Fixture explorer",
  skinType: "dry",
  budget: 25000,
  currency: "NGN" as const,
  concerns: ["dry-feeling skin"],
  preferences: ["simple routines"],
};
const preferences = {
  ...structuredClone(EMPTY_TWIN_PREFERENCES),
  styleGoals: ["expressive colour"],
  favoriteColors: ["#995577"],
};
const input = (name = "Complete fixture") => ({
  name,
  look: createDefaultLook(),
  occasion: "Fixture occasion",
  productIds: ["owned-product"],
  outfitId: "outfit",
  remember: false,
  lighting: {
    preset: "golden-hour" as const,
    intensity: 0.6,
    direction: { x: -0.2, y: 0.4 },
  },
});
async function wardrobe() {
  await database.ownedProducts.add({
    id: "owned-row",
    productId: "owned-product",
    name: "Fixture product",
    addedAt: 1,
  });
  await database.outfits.add({
    id: "outfit",
    name: "Fixture outfit",
    createdAt: 1,
  });
}

describe("independent complete-look consent and graph invariants", () => {
  it("never fulfills a typed twin snapshot with a missing profile during concurrent deletion", async () => {
    const [loaded] = await Promise.allSettled([
      loadDigitalTwin(database),
      clearLocalData(database),
    ]);
    if (loaded.status === "fulfilled") {
      expect(loaded.value.profile).toBeDefined();
      expect(loaded.value.profile.id).toBe(localProfileId);
    } else {
      // A recoverable deletion error is allowed; an invalid fulfilled snapshot is not.
      expect(loaded.reason).toBeInstanceOf(Error);
    }
  });

  it("rolls back the whole profile edit when requested memory permission is absent", async () => {
    const before = await database.profiles.get(localProfileId);
    await expect(
      saveTwinProfile(
        profile,
        preferences,
        { rememberPreferences: true },
        database,
      ),
    ).rejects.toThrow(/enable|consent/i);
    expect(await database.profiles.get(localProfileId)).toEqual(before);
    expect(await database.settings.count()).toBe(0);
    expect(await database.memoryNodes.count()).toBe(0);
    expect(await database.memoryRevisions.count()).toBe(0);
  });

  it("saves an explicit local composition without silently authorizing graph memory", async () => {
    await wardrobe();
    await saveTwinProfile(
      profile,
      preferences,
      { rememberPreferences: false },
      database,
    );
    const look = await saveCompleteLook(input(), database);
    expect(await database.savedLooks.get(look.id)).toBeDefined();
    expect(await database.consents.count()).toBe(0);
    for (const table of [
      database.memoryNodes,
      database.memoryEdges,
      database.memoryRevisions,
    ])
      expect(await table.count()).toBe(0);
  });

  it("denies a remembered complete look atomically and never retains graph writes after concurrent revocation", async () => {
    await wardrobe();
    await expect(
      saveCompleteLook({ ...input(), remember: true }, database),
    ).rejects.toThrow(/enable|consent/i);
    expect(await database.savedLooks.count()).toBe(0);
    expect(await database.memoryNodes.count()).toBe(0);
    await setConsent("memory.history", true, database);
    await Promise.allSettled([
      saveCompleteLook({ ...input(), remember: true }, database),
      setConsent("memory.history", false, database),
    ]);
    expect(await database.consents.get("memory.history")).toMatchObject({
      granted: false,
    });
    expect(await database.memoryNodes.count()).toBe(0);
    expect(await database.memoryEdges.count()).toBe(0);
    expect(await database.memoryRevisions.count()).toBe(0);
  });

  it("does not leave partial look/graph writes when an attached product or outfit is invalid", async () => {
    await wardrobe();
    await setConsent("memory.history", true, database);
    await expect(
      saveCompleteLook(
        {
          ...input(),
          productIds: ["owned-product", "not-owned"],
          remember: true,
        },
        database,
      ),
    ).rejects.toThrow(/owned/i);
    await expect(
      saveCompleteLook(
        { ...input(), outfitId: "removed-outfit", remember: true },
        database,
      ),
    ).rejects.toThrow(/outfit/i);
    expect(await database.savedLooks.count()).toBe(0);
    expect(await database.memoryNodes.count()).toBe(0);
    expect(await database.memoryEdges.count()).toBe(0);
  });

  it("deletes a complete look and attributed prose without breaking another look sharing its product and outfit", async () => {
    await wardrobe();
    await setConsent("memory.history", true, database);
    const first = await saveCompleteLook(
      { ...input("First fixture"), remember: true },
      database,
    );
    const second = await saveCompleteLook(
      { ...input("Second fixture"), remember: true },
      database,
    );
    const firstNode = await database.memoryNodes
      .filter((n) => n.type === "Look" && n.evidenceRefs.includes(first.id))
      .first();
    expect(firstNode).toBeDefined();
    await database.agentEpisodes.add({
      id: "look-episode",
      request: "First fixture",
      summary: "First fixture",
      createdAt: 1,
      memoryRefs: [firstNode!.id],
    });
    await database.agentMessages.add({
      id: "look-message",
      episodeId: "look-episode",
      role: "assistant",
      content: "First fixture",
      createdAt: 1,
    });
    await deleteCompleteLook(first.id, database);
    expect(await database.savedLooks.get(first.id)).toBeUndefined();
    expect(await database.agentEpisodes.count()).toBe(0);
    expect(await database.agentMessages.count()).toBe(0);
    expect(await database.memoryNodes.get(firstNode!.id)).toBeUndefined();
    expect(
      await database.memoryRevisions
        .where("nodeId")
        .equals(firstNode!.id)
        .count(),
    ).toBe(0);
    const secondNode = await database.memoryNodes
      .filter((n) => n.type === "Look" && n.evidenceRefs.includes(second.id))
      .first();
    expect(
      await database.memoryEdges.where("toId").equals(secondNode!.id).count(),
    ).toBe(2);
    const nodeIds = new Set(
      await database.memoryNodes.toCollection().primaryKeys(),
    );
    expect(
      (await database.memoryEdges.toArray()).every(
        (e) => nodeIds.has(e.fromId) && nodeIds.has(e.toId),
      ),
    ).toBe(true);
    expect((await loadDigitalTwin(database)).looks.map((l) => l.id)).toEqual([
      second.id,
    ]);
  });

  it("preserves the not-set profile revision used by an early composition when the first edited profile is saved", async () => {
    await wardrobe();
    const first = await saveCompleteLook(
      input("Before profile edit"),
      database,
    );
    const baseline = await loadDigitalTwin(database);
    expect(baseline.document.source).toBe("not-set");
    await saveTwinProfile(
      profile,
      preferences,
      { rememberPreferences: false },
      database,
    );
    const edited = await loadDigitalTwin(database);
    const second = await saveCompleteLook(
      input("After profile edit"),
      database,
    );
    expect(edited.document.revision).toBe(baseline.document.revision + 1);
    expect(first.composition).toMatchObject({
      profileRevision: baseline.document.revision,
    });
    expect(second.composition).toMatchObject({
      profileRevision: edited.document.revision,
    });
  });
});

describe("image-free portable twin boundary", () => {
  const imageFixture =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
  it("does not export a photo smuggled through an imported complete-look payload", async () => {
    await wardrobe();
    await saveCompleteLook(input(), database);
    const backup = JSON.parse(await exportLocalData(database));
    backup.tables.savedLooks[0].look.portraitDataUrl = imageFixture;
    await importLocalData(JSON.stringify(backup), database);
    const exported = await exportDigitalTwin(database);
    expect(exported).not.toContain(imageFixture);
    expect(JSON.parse(exported).looks[0].look).not.toHaveProperty(
      "portraitDataUrl",
    );
  });

  it("whitelists exported owned-product fields after a passthrough backup import", async () => {
    await wardrobe();
    const backup = JSON.parse(await exportLocalData(database));
    backup.tables.ownedProducts[0].portraitDataUrl = imageFixture;
    await importLocalData(JSON.stringify(backup), database);
    const exported = await exportDigitalTwin(database);
    expect(exported).not.toContain(imageFixture);
    expect(JSON.parse(exported).ownedProducts[0]).not.toHaveProperty(
      "portraitDataUrl",
    );
  });

  it("does not export unknown photo or face-geometry fields from an imported profile", async () => {
    const backup = JSON.parse(await exportLocalData(database));
    backup.tables.profiles[0].portraitDataUrl = imageFixture;
    backup.tables.profiles[0].faceGeometry = [{ x: 0.4, y: 0.5, z: 0.01 }];
    await importLocalData(JSON.stringify(backup), database);
    const exported = await exportDigitalTwin(database),
      value = JSON.parse(exported);
    expect(exported).not.toContain(imageFixture);
    expect(value.profile).not.toHaveProperty("portraitDataUrl");
    expect(value.profile).not.toHaveProperty("faceGeometry");
    expect(value.profile.displayName).toBe("Beauty explorer");
  });

  it("normalizes malformed nested imported look fields before portable twin export", async () => {
    await wardrobe();
    await saveCompleteLook(input(), database);
    const backup = JSON.parse(await exportLocalData(database));
    backup.tables.savedLooks[0].look = {
      lipstick: {
        enabled: true,
        color: "url(" + imageFixture + ")",
        opacity: -0.4,
        finish: "arbitrary-finish",
        sourceImage: imageFixture,
      },
      blush: null,
      hair: {
        enabled: true,
        color: "#123456",
        mode: "unknown-mode",
        sourceImage: { data: imageFixture },
      },
      accessories: { glasses: "true", rawFrame: imageFixture },
    };
    await importLocalData(JSON.stringify(backup), database);
    const exported = await exportDigitalTwin(database),
      look = JSON.parse(exported).looks[0].look;
    expect(exported).not.toContain(imageFixture);
    expect(look.lipstick).toMatchObject({
      color: createDefaultLook().lipstick.color,
      opacity: 0,
      finish: createDefaultLook().lipstick.finish,
    });
    expect(look.blush).toEqual(createDefaultLook().blush);
    expect(look.hair).toMatchObject({
      enabled: true,
      color: "#123456",
      mode: "solid",
    });
    expect(look.accessories.glasses).toBe(false);
    expect(look.hair).not.toHaveProperty("sourceImage");
  });

  it("does not serialize image objects masquerading as outfit colour or name fields", async () => {
    await wardrobe();
    const backup = JSON.parse(await exportLocalData(database));
    backup.tables.outfits[0].name = { image: imageFixture };
    backup.tables.outfits[0].color = { rawFrame: imageFixture };
    await importLocalData(JSON.stringify(backup), database);
    const exported = await exportDigitalTwin(database),
      outfit = JSON.parse(exported).outfits[0];
    expect(exported).not.toContain(imageFixture);
    expect(typeof outfit.name).toBe("string");
    expect(outfit.color === null || typeof outfit.color === "string").toBe(
      true,
    );
  });

  it("excludes image references from known text fields and image objects from optional owned-product fields", async () => {
    await wardrobe();
    const backup = JSON.parse(await exportLocalData(database));
    backup.tables.profiles[0].preferences = ["Matte finish", imageFixture];
    backup.tables.ownedProducts[0].note = { image: imageFixture };
    backup.tables.ownedProducts[0].openedAt = { rawFrame: imageFixture };
    await importLocalData(JSON.stringify(backup), database);
    const exported = await exportDigitalTwin(database),
      value = JSON.parse(exported);
    expect(exported).not.toContain(imageFixture);
    expect(value.profile.preferences).toContain("Matte finish");
    expect(value.ownedProducts[0]).not.toHaveProperty("note");
    expect(value.ownedProducts[0]).not.toHaveProperty("openedAt");
  });

  it("rejects object-shaped known profile fields before importing any unrelated row", async () => {
    const before = await database.profiles.get(localProfileId);
    const backup = JSON.parse(await exportLocalData(database));
    backup.tables.profiles[0].displayName = { image: imageFixture };
    backup.tables.outfits = [{ id: "should-not-import", name: "Fixture" }];
    await expect(
      importLocalData(JSON.stringify(backup), database),
    ).rejects.toThrow(/profiles/i);
    expect(await database.profiles.get(localProfileId)).toEqual(before);
    expect(await database.outfits.count()).toBe(0);
  });
});
