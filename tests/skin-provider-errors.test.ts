/** Sanitized terminal-error contract fixtures only. No real provider call or spend. */
import { describe, expect, it } from "vitest";
import {
  skinProviderFailure,
  PerfectCorpProvider,
  pricingHash,
} from "../apps/api/src/provider";
import { createApi } from "../apps/api/src/server";
import { ApprovedPlan } from "../apps/api/src/contracts";
const privateText =
  "Authorization Bearer secret-fixture https://private.invalid/signed?token=must-not-escape";
describe("documented skin provider failure mapping", () => {
  it.each([
    ["error_src_face_too_small", "60%", "change-input-and-authorize"],
    ["error_below_min_image_size", "480px", "change-input-and-authorize"],
    ["error_src_face_out_of_bound", "forehead", "change-input-and-authorize"],
    ["error_lighting_dark", "even light", "change-input-and-authorize"],
    ["error_decode_image", "standard JPEG", "change-input-and-authorize"],
    ["error_inference", "does not identify a skin concern", "operator-review"],
    [
      "unknown_internal_error",
      "Do not infer a photo-quality cause",
      "operator-review",
    ],
  ])(
    "maps %s without rendering free-form messages",
    (code, guidance, nextStep) => {
      const failure = skinProviderFailure({
        error: code,
        error_message: privateText,
      });
      expect(failure.code).toBe(code);
      expect(failure.known).toBe(true);
      expect(failure.recovery).toContain(guidance);
      expect(failure.nextStep).toBe(nextStep);
      expect(failure.automaticRetry).toBe(false);
      expect(JSON.stringify(failure)).not.toContain("secret-fixture");
    },
  );
  it("recognizes the documented request-error compatibility field but never guesses from free text", () => {
    expect(
      skinProviderFailure({
        error_code: "InvalidParameters",
        error: privateText,
      }).code,
    ).toBe("InvalidParameters");
    for (const data of [
      { error: "__proto__" },
      { error: privateText, error_message: "error_no_face" },
      { error: { code: "error_no_face", message: privateText } },
      undefined,
    ]) {
      const failure = skinProviderFailure(data);
      expect(failure.code).toBe("unrecognized_provider_error");
      expect(failure.known).toBe(false);
      expect(failure.nextStep).toBe("operator-review");
      expect(JSON.stringify(failure)).not.toContain("must-not-escape");
    }
  });
  it("drops free-form error bodies at the actual provider adapter boundary", async () => {
    const provider = new PerfectCorpProvider(
      "fixture-key-never-transmitted",
      async () =>
        Response.json({
          data: {
            task_status: "error",
            error: "error_lighting_dark",
            error_message: privateText,
            results: { privateText },
          },
        }),
    );
    expect(await provider.status("loopback-fixture-only")).toEqual({
      task_status: "error",
      error: "error_lighting_dark",
    });
  });
  it.each(["error_src_face_too_small", "unknown-new-engine-code"])(
    "returns safe typed status for %s without creating a retry",
    async (code) => {
      let now = Date.now(),
        creates = 0,
        polls = 0;
      const sku = {
        run_task_url:
          "https://yce-api-01.makeupar.com/s2s/v2.1/task/skin-analysis",
        amount: 4,
        description: "contract fixture only",
      };
      const app = createApi({
        provider: {
          pricing: async () => [sku],
          create: async () => {
            creates++;
            return "non-secret-upstream-fixture";
          },
          status: async () => {
            polls++;
            return {
              task_status: "error",
              error: code,
              error_message: privateText,
            };
          },
        },
        plan: ApprovedPlan.parse({
          actions: ["texture"],
          credits: 4,
          skuHash: pricingHash(sku),
          reviewedAt: new Date(now).toISOString(),
        }),
        dailyCredits: 4,
        ledger: { used: () => 0, reserve: () => {} },
        now: () => now,
      });
      try {
        const opened = await app.inject({ method: "GET", url: "/api/session" });
        const headers = {
          origin: "http://localhost:5173",
          cookie: opened.headers["set-cookie"]!.toString().split(";")[0],
          "x-csrf-token": opened.json().csrfToken,
        };
        const quote = await app.inject({
          method: "POST",
          url: "/api/skin/quotes",
          headers,
          payload: { actions: ["texture"] },
        });
        const bytes = Buffer.alloc(120);
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
        const task = await app.inject({
          method: "POST",
          url: "/api/skin/tasks",
          headers,
          payload: {
            quoteId: quote.json().quoteId,
            imageBase64: bytes.toString("base64"),
            contentType: "image/png",
            actions: ["texture"],
            maxCredits: 4,
            consent: {
              uploadImage: true,
              externalProcessing: true,
              providerRetentionAcknowledged: true,
            },
          },
        });
        now += 10001;
        const first = await app.inject({
          method: "GET",
          url: "/api/skin/tasks/" + task.json().taskId,
          headers,
        });
        expect(first.json().status).toBe("error");
        expect(first.json().providerFailure.code).toBe(
          code === "error_src_face_too_small"
            ? code
            : "unrecognized_provider_error",
        );
        expect(first.json().providerFailure.automaticRetry).toBe(false);
        expect(first.body).not.toContain("secret-fixture");
        expect(first.body).not.toContain("non-secret-upstream-fixture");
        expect(first.json()).not.toHaveProperty("result");
        await app.inject({
          method: "GET",
          url: "/api/skin/tasks/" + task.json().taskId,
          headers,
        });
        expect(creates).toBe(1);
        expect(polls).toBe(1);
      } finally {
        await app.close();
      }
    },
  );
});
