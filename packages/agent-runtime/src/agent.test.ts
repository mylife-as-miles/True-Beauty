import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BeautyDatabase,
  initializeDatabase,
  setConsent,
} from "../../local-database/src";
import { createDefaultLook } from "../../makeup-engine/src";
import { executeBeautyRequest, executeTool, planLocalRequest } from "./index";
import { rememberPreference } from "../../beauty-memory/src";
import { SAMPLE_PRODUCTS } from "../../commerce-engine/src";
let db: BeautyDatabase;
beforeEach(async () => {
  db = new BeautyDatabase("agent-test-" + crypto.randomUUID());
  await initializeDatabase(db);
});
afterEach(async () => {
  await db.delete();
});
describe("local beauty agent actual tool execution", () => {
  it("lets supported accessory requests edit a fresh mirror recipe before their anchors are visible", async () => {
    let look = createDefaultLook();
    const context = {
      database: db,
      inspectCurrentLook: () => look,
      applyLook: (next: typeof look) => {
        look = next;
      },
    };
    for (const accessory of ["ring", "bracelet", "watch", "hat"] as const) {
      const result = await executeBeautyRequest(`Add a ${accessory}`, context);
      expect(
        result.tools.find((t) => t.name === "previewAccessory")?.status,
      ).toBe("succeeded");
      expect(look.accessories[accessory]).toBe(true);
    }
    await executeBeautyRequest("Remove the hat", context);
    expect(look.accessories.hat).toBe(false);
  });
  it("applies a wedding look, builds a routine and selects affordable catalogue options", async () => {
    const applyLook = vi.fn();
    const result = await executeBeautyRequest(
      "Wedding soft glam next week, my skin feels dry, budget ₦20,000",
      {
        database: db,
        applyLook,
        products: [
          {
            id: "a",
            name: "Moisturizer",
            category: "moisturizer",
            concerns: ["dryness"],
            priceNgn: 10000,
            currency: "NGN",
          },
          {
            id: "b",
            name: "Expensive",
            category: "moisturizer",
            priceNgn: 30000,
            currency: "NGN",
          },
        ],
      },
    );
    expect(applyLook).toHaveBeenCalledOnce();
    expect(await db.routines.count()).toBe(1);
    expect(result.recommendations.map((p) => p.id)).toEqual(["a"]);
    expect(result.tools.every((t) => t.status === "succeeded")).toBe(true);
    expect(await db.agentEpisodes.count()).toBe(0);
  });
  it("changes the actual mirror state with a validated colour", async () => {
    const setLipColor = vi.fn();
    const result = await executeBeautyRequest("Make my lips berry", {
      database: db,
      setLipColor,
    });
    expect(setLipColor).toHaveBeenCalledWith("#792C48");
    expect(result.tools[0].status).toBe("succeeded");
    const failed = await executeTool(
      { name: "setLipColor", args: { color: "url(javascript:bad)" } },
      { database: db, setLipColor },
    );
    expect(failed.run.status).toBe("failed");
    expect(setLipColor).toHaveBeenCalledOnce();
  });
  it("applies different requested lip and hair colours rather than reusing the first colour", async () => {
    const setLipColor = vi.fn(),
      setHairColor = vi.fn();
    await executeBeautyRequest("A soft rose lip and copper hair", {
      database: db,
      setLipColor,
      setHairColor,
    });
    expect(setLipColor).toHaveBeenCalledWith("#B35B6B");
    expect(setHairColor).toHaveBeenCalledWith("#A35C36");
  });
  it("never reports success if a scene callback fails", async () => {
    const result = await executeBeautyRequest("Soft glam", {
      database: db,
      applyLook: () => {
        throw new Error("Renderer failed");
      },
    });
    expect(result.tools[0].status).toBe("failed");
    expect(result.message).toContain("Renderer failed");
    expect(result.message).not.toContain("Applied");
  });
  it("only saves a real connected scene and stores controls without a photo", async () => {
    const failed = await executeBeautyRequest("Save this look", {
      database: db,
    });
    expect(failed.tools[0].status).toBe("unavailable");
    const result = await executeBeautyRequest("Save this look as First look", {
      database: db,
      inspectCurrentLook: () => createDefaultLook(),
    });
    expect(result.tools[0].status).toBe("succeeded");
    expect(await db.savedLooks.count()).toBe(1);
    expect(await db.mediaAssets.count()).toBe(0);
  });
  it("requires upload and spend authorization before invoking analysis", async () => {
    const analyzeSkin = vi.fn();
    const result = await executeBeautyRequest("Analyze my skin", {
      database: db,
      analyzeSkin,
    });
    expect(analyzeSkin).not.toHaveBeenCalled();
    expect(result.tools[0].status).toBe("consent-required");
  });
  it("an untrusted tool cannot self-authorize an expensive provider using true booleans", async () => {
    const analyzeSkin = vi.fn();
    const result = await executeTool(
      { name: "analyzeSkin", args: { consent: true, costAuthorized: true } },
      { database: db, analyzeSkin },
    );
    expect(result.run.status).toBe("consent-required");
    expect(analyzeSkin).not.toHaveBeenCalled();
  });
  it("records history only after specific consent", async () => {
    await setConsent("memory.history", true, db);
    await executeBeautyRequest("Make my lips rose", {
      database: db,
      setLipColor: vi.fn(),
    });
    expect(await db.agentEpisodes.count()).toBe(1);
    expect(await db.agentMessages.count()).toBe(2);
    expect(await db.agentToolRuns.count()).toBe(1);
    await setConsent("memory.history", false, db);
    expect(await db.agentEpisodes.count()).toBe(0);
    expect(await db.agentMessages.count()).toBe(0);
  });
  it("supports an owned-only request without recommending a new purchase or irrelevant haircare", async () => {
    await db.ownedProducts.bulkAdd([
      { id: "owned", productId: "a", addedAt: 1 },
      { id: "owned-hair", productId: "h", addedAt: 1 },
    ]);
    const result = await executeBeautyRequest(
      "Recommend only my owned makeup products",
      {
        database: db,
        products: [
          { id: "a", name: "Owned lipstick", category: "lipstick" },
          { id: "b", name: "New lipstick", category: "lipstick" },
          { id: "h", name: "Owned conditioner", category: "haircare" },
        ],
      },
    );
    expect(result.recommendations.map((p) => p.id)).toEqual(["a"]);
    expect(result.recommendations[0].owned).toBe(true);
  });
  it("uses permitted persistent preferences in actual tool results", async () => {
    await setConsent("memory.preferences", true, db);
    await rememberPreference("lip finish", "matte", { consented: true }, db);
    await rememberPreference("owned-only", true, { consented: true }, db);
    await db.ownedProducts.add({ id: "owned", productId: "a", addedAt: 1 });
    const applyLook = vi.fn();
    const result = await executeBeautyRequest(
      "Soft glam and recommend products",
      {
        database: db,
        applyLook,
        products: [
          { id: "a", name: "Owned lipstick", category: "lipstick" },
          { id: "b", name: "New lipstick", category: "lipstick" },
        ],
      },
    );
    expect(applyLook.mock.calls[0][0].lipstick.finish).toBe("matte");
    expect(result.recommendations.map((p) => p.id)).toEqual(["a"]);
    expect(result.memoryUsed).toHaveLength(2);
    expect(result.message).toContain("saved matte");
  });
  it("allocates a total wedding budget across relevant unique products and links only funded routine products", async () => {
    const result = await executeBeautyRequest(
      "Wedding soft glam, my skin feels dry, budget ₦20,000",
      {
        database: db,
        applyLook: vi.fn(),
        products: SAMPLE_PRODUCTS.map((p) => ({ ...p, sample: true })),
      },
    );
    expect(result.budgetPlan?.total).toBeLessThanOrEqual(20000);
    expect(result.budgetPlan?.remaining).toBe(20000 - result.budgetPlan!.total);
    expect(
      result.recommendations.reduce((sum, p) => sum + (p.purchaseCost ?? 0), 0),
    ).toBe(result.budgetPlan?.total);
    expect(new Set(result.recommendations.map((p) => p.id)).size).toBe(
      result.recommendations.length,
    );
    expect(result.recommendations.some((p) => p.category === "haircare")).toBe(
      false,
    );
    expect(result.budgetPlan?.unfilledSlots.length).toBeGreaterThan(0);
    const routine = await db.routines.toCollection().first();
    const selectedIds = new Set(result.recommendations.map((p) => p.id));
    expect(
      routine?.steps
        .filter((s) => s.productId)
        .every((s) => selectedIds.has(s.productId!)),
    ).toBe(true);
    expect(result.message).toContain("combined product plan");
    expect(result.message).toContain("sample catalogue estimates");
  });
  it("charges zero for owned products and excludes unpriced purchases from the total plan", async () => {
    await db.ownedProducts.add({ id: "own-lip", productId: "lip", addedAt: 1 });
    const result = await executeBeautyRequest(
      "Recommend lipstick and blush for a wedding, budget ₦8,000",
      {
        database: db,
        products: [
          {
            id: "lip",
            name: "Owned lip",
            category: "lipstick",
            priceNgn: 50000,
            currency: "NGN",
          },
          {
            id: "blush",
            name: "Affordable blush",
            category: "blush",
            priceNgn: 7500,
            currency: "NGN",
          },
          { id: "unknown", name: "Unpriced blush", category: "blush" },
        ],
      },
    );
    expect(result.budgetPlan?.total).toBe(7500);
    expect(result.budgetPlan?.remaining).toBe(500);
    expect(
      result.recommendations.find((p) => p.id === "lip")?.purchaseCost,
    ).toBe(0);
    expect(result.recommendations.map((p) => p.id)).not.toContain("unknown");
  });
  it("attributes newly remembered values to their originating episode so revocation removes all copies", async () => {
    await setConsent("memory.preferences", true, db);
    await setConsent("memory.history", true, db);
    await executeBeautyRequest("Remember that I prefer matte lipstick", {
      database: db,
    });
    const episode = await db.agentEpisodes.toCollection().first();
    expect(episode?.memoryRefs).toHaveLength(1);
    await setConsent("memory.preferences", false, db);
    expect(await db.agentEpisodes.count()).toBe(0);
    expect(await db.agentMessages.count()).toBe(0);
    expect(await db.agentToolRuns.count()).toBe(0);
  });
  it("cannot persist in-flight consultation history after history permission revocation", async () => {
    await setConsent("memory.history", true, db);
    await Promise.allSettled([
      executeBeautyRequest("Make my lips rose", {
        database: db,
        setLipColor: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        },
      }),
      setConsent("memory.history", false, db),
    ]);
    expect(await db.agentEpisodes.count()).toBe(0);
    expect(await db.agentMessages.count()).toBe(0);
    expect(await db.agentToolRuns.count()).toBe(0);
  });
  it("does not accidentally authorize destructive or paid commands through gestures", () => {
    const plan = planLocalRequest("pinch swipe open palm");
    expect(plan).toEqual([]);
  });
});
