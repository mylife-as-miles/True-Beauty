/** Local HTTP-runtime fixture only; never calls an external provider. */
import {
  AnthropicMessagesProvider,
  OpenAICompatibleReasoningProvider,
  type ReasoningMessage,
} from "../../api/src/reasoningProvider";
import { remoteToolSpecifications } from "../../../packages/agent-runtime/src/reasoning-protocol";

export default {
  async fetch(request: Request) {
    const { compatible = false, feedback = false } = (await request.json()) as {
      compatible?: boolean;
      feedback?: boolean;
    };
    let sent: Record<string, any> | undefined;
    let calls = 0;
    const providerOptions = {
      apiKey: "fixture-not-a-real-provider-credential",
      model: "workerd-fixture-only-model",
      fetchImpl: async (_url: RequestInfo | URL, init?: RequestInit) => {
        calls++;
        sent = JSON.parse(init!.body as string);
        return compatible
          ? Response.json({
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: "Fixture guidance only." },
                },
              ],
              usage: { prompt_tokens: 100, completion_tokens: 25 },
            })
          : Response.json({
              stop_reason: feedback ? "end_turn" : "tool_use",
              content: feedback
                ? [
                    {
                      type: "text",
                      text: "The actual fixture callback reported failure; no success is claimed.",
                    },
                  ]
                : [
                    {
                      type: "tool_use",
                      id: "actual-fixture-call-31",
                      name: "setLipColor",
                      input: { color: "#b35b6b" },
                    },
                  ],
              usage: { input_tokens: 100, output_tokens: 25 },
            });
      },
    };
    const provider = compatible
      ? new OpenAICompatibleReasoningProvider(providerOptions)
      : new AnthropicMessagesProvider(providerOptions);
    const messages: ReasoningMessage[] = [
      { role: "user", content: "Fixture local-only request." },
    ];
    if (feedback)
      messages.push(
        {
          role: "assistant",
          content: "",
          calls: [
            {
              id: "actual-fixture-call-31",
              name: "setLipColor",
              args: { color: "#b35b6b" },
            },
          ],
        },
        {
          role: "tool",
          callId: "actual-fixture-call-31",
          isError: true,
          content: JSON.stringify({
            status: "failed",
            summary: "The mounted callback fixture failed.",
          }),
        },
      );
    const result = await provider.complete({
      system: "Fixture system",
      messages,
      tools: remoteToolSpecifications(["setLipColor"]),
      maxOutputTokens: 256,
      signal: new AbortController().signal,
    });
    return Response.json({ result, sent, calls, externalProviderCalls: 0 });
  },
};
