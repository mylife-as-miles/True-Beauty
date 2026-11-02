import { describe, expect, it } from "vitest";
import {
  AnthropicMessagesProvider,
  OpenAICompatibleReasoningProvider,
  providerFromReasoningEnvironment,
  readReasoningPricing,
  reasoningUnavailableReason,
} from "../apps/api/src/reasoningProvider";
import { remoteToolSpecifications } from "../packages/agent-runtime/src/reasoning-protocol";

const key = "fixture-only-secret-never-a-live-key";
const now = Date.parse("2026-11-02T12:00:00Z");
const pricing = {
  model: "fixture-only-model",
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 2,
  reviewedAt: new Date(now).toISOString(),
  sourceUrl: "https://platform.claude.com/docs/en/about-claude/pricing",
};

describe("runtime-independent reasoning provider contracts", () => {
  it("uses explicit bindings and disables missing, mismatched and stale pricing", () => {
    expect(providerFromReasoningEnvironment({})).toBeUndefined();
    expect(
      providerFromReasoningEnvironment({
        TB_REASONING_MODEL: pricing.model,
        ANTHROPIC_API_KEY: key,
        TB_REASONING_PROVIDER: "unknown",
      }),
    ).toBeUndefined();
    const provider = providerFromReasoningEnvironment({
      TB_REASONING_MODEL: pricing.model,
      ANTHROPIC_API_KEY: key,
    });
    const options = {
      provider,
      pricing,
      enabled: true,
      dailyUsd: 5,
      maxRequestUsd: 1,
      now,
    };
    expect(reasoningUnavailableReason(options)).toBeNull();
    expect(
      reasoningUnavailableReason({
        ...options,
        pricing: { ...pricing, model: "other" },
      }),
    ).toContain("matching");
    expect(
      reasoningUnavailableReason({ ...options, now: now + 31 * 86400000 }),
    ).toContain("current operator review");
    expect(
      readReasoningPricing({ TB_REASONING_PRICING_JSON: "malformed" }),
    ).toBeUndefined();
    expect(
      readReasoningPricing({
        TB_REASONING_PRICING_JSON: JSON.stringify(pricing),
      }),
    ).toEqual(pricing);
  });

  it("keeps compatible tool-call IDs through actual feedback and suppresses retries/storage", async () => {
    const requests: RequestInit[] = [];
    const provider = new OpenAICompatibleReasoningProvider({
      apiKey: key,
      model: pricing.model,
      fetchImpl: async (_input, init) => {
        requests.push(init!);
        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content:
                  "The local tool reported failure; no change was saved.",
              },
            },
          ],
          usage: { prompt_tokens: 80, completion_tokens: 15 },
        });
      },
    });
    const result = await provider.complete({
      system: "Fixture system",
      messages: [
        { role: "user", content: "Set lip colour" },
        {
          role: "assistant",
          content: "",
          calls: [
            {
              id: "actual-tool-42",
              name: "setLipColor",
              args: { color: "#aabbcc" },
            },
          ],
        },
        {
          role: "tool",
          callId: "actual-tool-42",
          isError: true,
          content: JSON.stringify({
            status: "failed",
            summary: "Callback failed",
          }),
        },
      ],
      tools: remoteToolSpecifications(["setLipColor"]),
      maxOutputTokens: 256,
      signal: new AbortController().signal,
    });
    expect(requests).toHaveLength(1);
    const body = JSON.parse(requests[0].body as string);
    expect(body.messages[2].tool_calls[0].id).toBe("actual-tool-42");
    expect(body.messages[3]).toMatchObject({
      role: "tool",
      tool_call_id: "actual-tool-42",
    });
    expect(body).toMatchObject({
      store: false,
      parallel_tool_calls: false,
      max_completion_tokens: 256,
    });
    expect(requests[0].redirect).toBe("manual");
    expect(result.calls).toEqual([]);
  });

  it("rejects provider responses that expose a runtime credential without echoing it", async () => {
    const provider = new AnthropicMessagesProvider({
      apiKey: key,
      model: pricing.model,
      fetchImpl: async () =>
        Response.json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: key }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
    });
    await expect(
      provider.complete({
        system: "Fixture",
        messages: [],
        tools: [],
        maxOutputTokens: 256,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("protected configuration");
  });
});
