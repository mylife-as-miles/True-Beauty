/** Local workerd regression: actual providers use their default global fetch. */
import {
  AnthropicMessagesProvider,
  OpenAICompatibleReasoningProvider,
  type ReasoningMessage,
} from "../../api/src/reasoningProvider";
import { remoteToolSpecifications } from "../../../packages/agent-runtime/src/reasoning-protocol";

export default {
  async fetch(request: Request) {
    const {
      compatible = false,
      feedback = false,
      redirect = false,
    } = (await request.json()) as {
      compatible?: boolean;
      feedback?: boolean;
      redirect?: boolean;
    };
    // Deliberately omit fetchImpl AND endpoint. Miniflare's outboundService
    // handles every native HTTP request; no request reaches a real provider.
    const options = {
      apiKey: "fixture-only-default-fetch-key-never-a-real-credential",
      model:
        "workerd-default-fetch-fixture-model" + (redirect ? "-redirect" : ""),
    };
    const provider = compatible
      ? new OpenAICompatibleReasoningProvider(options)
      : new AnthropicMessagesProvider(options);
    const callId = compatible
      ? "compatible-actual-tool-23"
      : "native-actual-tool-19";
    const messages: ReasoningMessage[] = [
      { role: "user", content: "Local HTTP fixture only." },
    ];
    if (feedback)
      messages.push(
        {
          role: "assistant",
          content: "",
          calls: [
            { id: callId, name: "setLipColor", args: { color: "#b35b6b" } },
          ],
        },
        {
          role: "tool",
          callId,
          isError: true,
          content: JSON.stringify({
            status: "failed",
            summary: "The actual fixture callback failed.",
          }),
        },
      );
    try {
      const result = await provider.complete({
        system: "Local fixture system",
        messages,
        tools: remoteToolSpecifications(["setLipColor"]),
        maxOutputTokens: 256,
        signal: new AbortController().signal,
      });
      return Response.json({ result });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error ? error.message : "Unknown fixture failure",
          name: error instanceof Error ? error.name : "Error",
        },
        { status: 500 },
      );
    }
  },
};
