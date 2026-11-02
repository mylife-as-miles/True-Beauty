import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BeautyDatabase,
  initializeDatabase,
  setConsent,
} from "../../local-database/src";
import { createDefaultLook } from "../../makeup-engine/src";
import {
  buildReasoningPreview,
  executeRemoteBeautyRequest,
  RemoteReasoningError,
  type ReasoningApproval,
  type ReasoningTransport,
} from "./remote";
import type { ReasoningStepResult, RemoteToolName } from "./reasoning-protocol";
let database: BeautyDatabase;
beforeEach(async () => {
  database = new BeautyDatabase("remote-agent-fixture-" + crypto.randomUUID());
  await initializeDatabase(database);
});
afterEach(async () => {
  await database.delete();
});
async function approved(
  tools: RemoteToolName[] = ["setLipColor"],
): Promise<ReasoningApproval> {
  const preview = await buildReasoningPreview(
    "Set a soft rose lip",
    [],
    { database },
    false,
  );
  preview.payload.allowedTools = tools;
  const { hashReasoningPayload } = await import("./reasoning-protocol");
  preview.payloadHash = await hashReasoningPayload(preview.payload);
  return {
    ...preview,
    quote: {
      quoteId: crypto.randomUUID(),
      maximumUsd: 0.02,
      currency: "USD",
      maxSteps: 3,
      maxOutputTokens: 256,
      inputTokenCeiling: 32000,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      model: "fixture",
      pricingProvenance: {
        sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
        reviewedAt: new Date().toISOString(),
        kind: "operator-reviewed-upper-bound",
      },
      note: "Fixture quote only",
    },
    maxUsd: 0.02,
    textTransmission: true,
    providerRetentionAcknowledged: true,
  };
}
function transport(responses: ReasoningStepResult[]): ReasoningTransport {
  let i = 0;
  return {
    capabilities: vi.fn(),
    quote: vi.fn(),
    start: vi.fn(async () => ({ sessionId: "fixture-session" })),
    step: vi.fn(async () => responses[i++]),
    cancel: vi.fn(async () => {}),
  };
}
const turn = (
  name: RemoteToolName,
  args: Record<string, unknown>,
  id = "fixture-call",
): ReasoningStepResult => ({
  status: "needs-tools",
  calls: [{ id, name, args }],
  guidance: "This is model fixture guidance, not proof of action.",
  stepsUsed: 1,
  stepsRemaining: 2,
  usage: { inputTokens: 20, outputTokens: 30 },
});
const done: ReasoningStepResult = {
  status: "done",
  calls: [],
  guidance: "Completed fixture guidance.",
  stepsUsed: 2,
  stepsRemaining: 1,
  usage: { inputTokens: 40, outputTokens: 20 },
};
describe("bounded remote planner with actual local tools — fixture decisions only", () => {
  it("sends no personal data while building an exact review and does not include photos or history by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const preview = await buildReasoningPreview("A berry lip", [], {
      database,
      inspectCurrentLook: () => createDefaultLook(),
    });
    expect(preview.payload.context).toEqual({});
    expect(preview.payload.allowedTools).not.toContain("findProduct");
    expect(preview.payload.allowedTools).not.toContain("saveLook");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("executes actual callbacks and feeds their real results into the next model turn", async () => {
    const approval = await approved(),
      tx = transport([turn("setLipColor", { color: "#B35B6B" }), done]),
      setLipColor = vi.fn();
    const result = await executeRemoteBeautyRequest(
      approval,
      { database, setLipColor },
      { transport: tx },
    );
    expect(setLipColor).toHaveBeenCalledWith("#B35B6B");
    expect(result.tools[0].status).toBe("succeeded");
    expect(result.mode).toBe("remote");
    expect(tx.step).toHaveBeenNthCalledWith(
      2,
      "fixture-session",
      expect.any(String),
      [
        expect.objectContaining({
          status: "succeeded",
          summary: "Changed your lip preview to #B35B6B.",
        }),
      ],
      undefined,
      expect.any(Function),
    );
    expect(tx.cancel).toHaveBeenCalledOnce();
  });
  it("reports failed local actions truthfully and does not infer success from model prose", async () => {
    const approval = await approved(),
      tx = transport([turn("setLipColor", { color: "#B35B6B" }), done]);
    const result = await executeRemoteBeautyRequest(
      approval,
      {
        database,
        setLipColor: () => {
          throw new Error("Actual renderer failure");
        },
      },
      { transport: tx },
    );
    expect(result.tools[0].status).toBe("failed");
    expect(result.message).toContain("Actual renderer failure");
    expect(result.message).not.toContain("Changed your lip");
    const noActions = await executeRemoteBeautyRequest(
      approval,
      { database },
      {
        transport: transport([
          { ...done, guidance: "I saved everything (untrusted claim)." },
        ]),
      },
    );
    expect(noActions.tools).toHaveLength(0);
    expect(noActions.message).toContain("without performing a local action");
    expect(await database.savedLooks.count()).toBe(0);
  });
  it("blocks unapproved persistence, repeated calls and malformed model parameters", async () => {
    for (const response of [
      turn("saveLook", { name: "Injected save" }),
      turn("setLipColor", { color: "javascript:bad" }),
    ]) {
      const setLipColor = vi.fn();
      try {
        const value = await executeRemoteBeautyRequest(
          await approved(),
          { database, setLipColor },
          { transport: transport([response, done]) },
        );
        expect(value.tools[0].status).toBe("failed");
      } catch (error) {
        expect(error).toBeInstanceOf(RemoteReasoningError);
      }
      expect(setLipColor).not.toHaveBeenCalled();
      expect(await database.savedLooks.count()).toBe(0);
    }
    const tx = transport([
      turn("setLipColor", { color: "#B35B6B" }),
      turn("setLipColor", { color: "#ffffff" }),
    ]);
    await expect(
      executeRemoteBeautyRequest(
        await approved(),
        { database, setLipColor: vi.fn() },
        { transport: tx },
      ),
    ).rejects.toThrow("repeated");
  });
  it("requires persisted external-context permission as well as exact per-request approval", async () => {
    const preview = await buildReasoningPreview(
        "A rose lip",
        ["profile"],
        { database },
        false,
      ),
      approval = { ...(await approved()), ...preview };
    const tx = transport([done]);
    await expect(
      executeRemoteBeautyRequest(approval, { database }, { transport: tx }),
    ).rejects.toThrow("External reasoning-context permission");
    expect(tx.start).not.toHaveBeenCalled();
  });
  it("rechecks permission after CSRF acquisition so revocation cannot send a stale reviewed snapshot", async () => {
    await setConsent("remote.history", true, database);
    const preview = await buildReasoningPreview(
        "A rose lip",
        ["profile"],
        { database },
        false,
      ),
      approval = { ...(await approved()), ...preview };
    const fetched: string[] = [];
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const path = String(input);
        fetched.push(path);
        if (path === "/api/session") {
          await setConsent("remote.history", false, database);
          return Response.json({ csrfToken: "fixture-csrf" });
        }
        throw new Error("A private payload must not be posted");
      });
    try {
      await expect(
        executeRemoteBeautyRequest(approval, { database }),
      ).rejects.toThrow("External reasoning-context permission");
      expect(fetched).toEqual(["/api/session"]);
    } finally {
      spy.mockRestore();
    }
  });
  it("stops further feedback transmission when context permission is revoked during a tool", async () => {
    await setConsent("remote.history", true, database);
    const preview = await buildReasoningPreview(
        "A rose lip",
        ["profile"],
        { database },
        false,
      ),
      approval = { ...(await approved()), ...preview },
      tx = transport([turn("setLipColor", { color: "#B35B6B" }), done]);
    try {
      await executeRemoteBeautyRequest(
        approval,
        {
          database,
          setLipColor: async () => {
            await setConsent("remote.history", false, database);
          },
        },
        { transport: tx },
      );
      throw new Error("Expected revocation to stop the loop");
    } catch (error) {
      expect(error).toBeInstanceOf(RemoteReasoningError);
      expect(
        (error as RemoteReasoningError).partialResult.tools[0].status,
      ).toBe("succeeded");
    }
    expect(tx.step).toHaveBeenCalledOnce();
    expect(tx.cancel).toHaveBeenCalledOnce();
  });
  it("does not execute a late model plan after the user revokes shared-context permission", async () => {
    await setConsent("remote.history", true, database);
    const preview = await buildReasoningPreview(
        "A rose lip",
        ["profile"],
        { database },
        false,
      ),
      approval = { ...(await approved()), ...preview },
      tx = transport([done]),
      setLipColor = vi.fn();
    tx.step = vi.fn(async () => {
      await setConsent("remote.history", false, database);
      return turn("setLipColor", { color: "#B35B6B" });
    });
    await expect(
      executeRemoteBeautyRequest(
        approval,
        { database, setLipColor },
        { transport: tx },
      ),
    ).rejects.toThrow("External reasoning-context permission");
    expect(setLipColor).not.toHaveBeenCalled();
    expect(tx.cancel).toHaveBeenCalledOnce();
  });
  it("rejects a changed reviewed payload before dispatch and respects a bounded turn limit", async () => {
    const approval = await approved(),
      tx = transport([done]);
    approval.payload.goal = "Different request";
    await expect(
      executeRemoteBeautyRequest(approval, { database }, { transport: tx }),
    ).rejects.toThrow("reviewed request changed");
    expect(tx.start).not.toHaveBeenCalled();
    const bounded = await approved();
    bounded.quote.maxSteps = 1;
    const setLipColor = vi.fn(),
      result = await executeRemoteBeautyRequest(
        bounded,
        { database, setLipColor },
        { transport: transport([turn("setLipColor", { color: "#B35B6B" })]) },
      );
    expect(setLipColor).toHaveBeenCalledOnce();
    expect(result.message).toContain("authorized turn limit");
  });
});
