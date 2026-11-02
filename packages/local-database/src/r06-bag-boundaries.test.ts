import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import {
  BeautyDatabase,
  exportLocalData,
  importLocalData,
  initializeDatabase,
  normalizeShoppingBag,
  tableNames,
  type ShoppingBag,
} from "./index";
import { bagLineIdentity } from "../../shared-types/src/bag-identity";
import { getPriceState, type PriceSnapshot } from "../../commerce-engine/src";

const databases: Dexie[] = [];
afterEach(async () => {
  for (const d of databases.splice(0)) await d.delete();
});
async function fresh() {
  const d = new BeautyDatabase("r06-bag-" + crypto.randomUUID());
  databases.push(d);
  await initializeDatabase(d);
  return d;
}
const row = (id: string, patch: Partial<ShoppingBag> = {}): ShoppingBag => ({
  id,
  productId: "shared-product",
  quantity: 2,
  addedAt: 1,
  variantId: "rose",
  currency: "NGN",
  sourceKey: "sample",
  unitPrice: 9500,
  priceKind: "sample",
  ...patch,
});

describe("real version-two database upgrade", () => {
  it("migrates a legacy product-only bag and permits independent shade/currency/source tuples afterward", async () => {
    const name = "r06-v2-" + crypto.randomUUID();
    const legacy = new Dexie(name);
    // Frozen historical schema: exercise a persisted v2 database, not a mocked upgrader.
    const legacyStores: Record<string, string> = {
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
        "id,type,subjectId,key,consentScope,updatedAt,[subjectId+type+key],validUntil,lastUsedAt",
      memoryEdges: "id,fromId,toId,type",
      memoryRevisions: "id,nodeId,createdAt",
      agentEpisodes: "id,createdAt",
      agentMessages: "id,episodeId,createdAt",
      agentToolRuns: "id,episodeId,name,createdAt",
      recommendations: "id,createdAt",
      priceSnapshots: "id,productId,observedAt",
      mediaAssets: "id,createdAt",
      settings: "id",
    };
    expect(Object.keys(legacyStores).sort()).toEqual([...tableNames].sort());
    legacy.version(2).stores(legacyStores);
    await legacy.open();
    await legacy.table("shoppingBags").add({
      id: "legacy-line",
      productId: "shared-product",
      quantity: 3,
      addedAt: 7,
    });
    await legacy
      .table("profiles")
      .add({
        id: "local-profile",
        displayName: "Legacy visitor",
        skinType: "dry",
        budget: 12000,
        currency: "NGN",
        concerns: [],
        preferences: [],
        createdAt: 1,
        updatedAt: 1,
      });
    await legacy
      .table("consents")
      .add({
        id: "memory.preferences",
        scope: "memory.preferences",
        granted: false,
        updatedAt: 1,
        source: "user",
      });
    legacy.close();
    const d = new BeautyDatabase(name);
    databases.push(d);
    await d.open();
    const migrated = await d.shoppingBags.get("legacy-line");
    expect(d.verno).toBe(3);
    expect(migrated).toMatchObject({
      quantity: 3,
      addedAt: 7,
      variantId: "default",
      currency: "NGN",
      sourceKey: "sample",
      lineKey: bagLineIdentity(
        "shared-product",
        undefined,
        "default",
        "NGN",
        "sample",
      ),
    });
    expect(migrated?.unitPrice).toBeUndefined();
    expect(await d.profiles.get("local-profile")).toMatchObject({
      displayName: "Legacy visitor",
      budget: 12000,
    });
    expect(await d.consents.get("memory.preferences")).toMatchObject({
      granted: false,
    });
    for (const r of [
      row("rose"),
      row("usd", { currency: "USD", unitPrice: 9 }),
      row("source", { sourceKey: "merchant:fixture" }),
    ])
      await d.shoppingBags.add(normalizeShoppingBag(r));
    expect(await d.shoppingBags.count()).toBe(4);
    expect(d.shoppingBags.schema.idxByName.productId.unique).toBe(false);
    expect(d.shoppingBags.schema.idxByName.lineKey.unique).toBe(true);
  });
});

describe("portable bag identity and freshness", () => {
  it("recomputes supplied keys and keeps all independent canonical dimensions separate", async () => {
    const d = await fresh(),
      backup = JSON.parse(await exportLocalData(d));
    const rows = [
      row("base"),
      row("shade", { variantId: "berry" }),
      row("currency", { currency: "USD", unitPrice: 9 }),
      row("source", { sourceKey: "merchant:fixture" }),
      row("size", { size: "large" }),
    ];
    backup.tables.shoppingBags = rows.map((r) => ({
      ...r,
      lineKey: "forged-identical-key",
    }));
    await importLocalData(JSON.stringify(backup), d);
    const saved = await d.shoppingBags.toArray();
    expect(saved).toHaveLength(5);
    expect(new Set(saved.map((r) => r.lineKey)).size).toBe(5);
    for (const r of saved)
      expect(r.lineKey).toBe(
        bagLineIdentity(
          r.productId,
          r.size,
          r.variantId,
          r.currency,
          r.sourceKey,
        ),
      );
    expect(saved.every((r) => r.imported === true)).toBe(true);
  });

  it("replaces the matching tuple without clobbering another source or duplicating identifiers", async () => {
    const d = await fresh();
    await d.shoppingBags.bulkAdd([
      normalizeShoppingBag(row("local")),
      normalizeShoppingBag(row("other", { sourceKey: "another-source" })),
    ]);
    const backup = JSON.parse(await exportLocalData(d));
    backup.tables.shoppingBags = [
      {
        ...row("imported"),
        quantity: 5,
        priceKind: "verified",
        sourceUrl: "https://example.com/reference",
        priceObservedAt: new Date().toISOString(),
      },
    ];
    await importLocalData(JSON.stringify(backup), d);
    expect(await d.shoppingBags.count()).toBe(2);
    expect(await d.shoppingBags.get("local")).toBeUndefined();
    expect(await d.shoppingBags.get("other")).toMatchObject({
      sourceKey: "another-source",
      quantity: 2,
    });
    expect(await d.shoppingBags.get("imported")).toMatchObject({
      quantity: 5,
      imported: true,
      priceKind: "imported",
    });
  });

  it("rejects a malformed bag atomically before unrelated records are restored", async () => {
    const d = await fresh(),
      backup = JSON.parse(await exportLocalData(d));
    backup.tables.journalEntries = [
      {
        id: "should-not-write",
        title: "Fixture",
        body: "Fixture",
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    backup.tables.shoppingBags = [row("negative", { unitPrice: -1 })];
    await expect(importLocalData(JSON.stringify(backup), d)).rejects.toThrow(
      /shoppingBags/i,
    );
    expect(await d.journalEntries.count()).toBe(0);
    expect(await d.shoppingBags.count()).toBe(0);
  });

  it("does not promote a just-imported generic price snapshot into a fresh verified quote", async () => {
    const d = await fresh(),
      backup = JSON.parse(await exportLocalData(d));
    const price: PriceSnapshot = {
      amount: 100,
      currency: "NGN",
      kind: "verified",
      observedAt: new Date().toISOString(),
      sourceUrl: "https://example.com/reference",
      merchant: "Fixture merchant",
    };
    backup.tables.priceSnapshots = [
      { id: "price-fixture", productId: "fixture", ...price },
    ];
    await importLocalData(JSON.stringify(backup), d);
    const imported = await d.priceSnapshots.get("price-fixture");
    expect(imported?.imported).toBe(true);
    const freshness = getPriceState(imported as unknown as PriceSnapshot);
    expect(freshness.fresh).toBe(false);
    expect(freshness.verified).toBe(false);
    expect(freshness.label).toMatch(/import|refresh/i);
  });

  it("does not treat a future-dated observation as a fresh current quote", () => {
    const now = Date.parse("2026-11-02T12:00:00.000Z");
    const price: PriceSnapshot = {
      amount: 100,
      currency: "NGN",
      kind: "verified",
      observedAt: "2026-11-04T12:00:00.000Z",
      sourceUrl: "https://example.com/reference",
      merchant: "Fixture merchant",
    };
    expect(getPriceState(price, now).fresh).toBe(false);
  });
});
