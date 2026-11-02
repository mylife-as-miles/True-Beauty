import {
  db,
  hasConsent,
  localProfileId,
  newId,
  type BeautyDatabase,
  type AgentToolRun,
  type JsonValue,
} from "../../local-database/src";
import { retrieveMemories } from "../../beauty-memory/src";
import { normalizeLook } from "../../makeup-engine/src";
import {
  executeTool,
  type AgentContext,
  type AgentResult,
  type AgentBudgetPlan,
  type AgentRecommendation,
} from "./index";
import {
  ReasoningCapabilitiesSchema,
  ReasoningQuoteSchema,
  ReasoningPayloadSchema,
  ReasoningStepResultSchema,
  allowedReasoningTools,
  contextScopes,
  hashReasoningPayload,
  type ReasoningCapabilities,
  type ReasoningContextSnapshot,
  type ReasoningPayload,
  type ReasoningQuote,
  type ReasoningScope,
  type ToolFeedback,
} from "./reasoning-protocol";

export interface ReasoningPreview {
  payload: ReasoningPayload;
  payloadHash: string;
  scopes: ReasoningScope[];
  bytes: number;
}
export interface ReasoningApproval extends ReasoningPreview {
  quote: ReasoningQuote;
  maxUsd: number;
  textTransmission: true;
  providerRetentionAcknowledged: true;
}
export interface ReasoningTransport {
  capabilities(signal?: AbortSignal): Promise<ReasoningCapabilities>;
  quote(
    preview: ReasoningPreview,
    limits?: { maxSteps?: number; maxOutputTokens?: number },
    signal?: AbortSignal,
  ): Promise<ReasoningQuote>;
  start(
    approval: ReasoningApproval,
    signal?: AbortSignal,
    beforeTransmit?: () => Promise<void>,
  ): Promise<{ sessionId: string }>;
  step(
    sessionId: string,
    stepId: string,
    feedback: ToolFeedback[],
    signal?: AbortSignal,
    beforeTransmit?: () => Promise<void>,
  ): Promise<unknown>;
  cancel(sessionId: string): Promise<void>;
}
async function requestJson(
  path: string,
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
  signal?: AbortSignal,
  beforeTransmit?: () => Promise<void>,
) {
  let csrf: string | undefined;
  if (method !== "GET") {
    const session = await fetch("/api/session", {
      credentials: "same-origin",
      signal,
      cache: "no-store",
    });
    if (!session.ok)
      throw new Error("The local API session could not be opened");
    csrf = (await session.json()).csrfToken;
  }
  await beforeTransmit?.();
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json: Record<string, unknown>;
  try {
    json = await response.json();
  } catch {
    throw new Error("The reasoning service returned an invalid response");
  }
  if (!response.ok)
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : "The reasoning request could not be completed",
    );
  return json;
}
export function createReasoningTransport(): ReasoningTransport {
  return {
    capabilities: async (signal) =>
      ReasoningCapabilitiesSchema.parse(
        await requestJson(
          "/api/reasoning/capabilities",
          "GET",
          undefined,
          signal,
        ),
      ),
    quote: async (preview, limits = {}, signal) =>
      ReasoningQuoteSchema.parse(
        await requestJson(
          "/api/reasoning/quotes",
          "POST",
          {
            payloadHash: preview.payloadHash,
            scopes: preview.scopes,
            allowedTools: preview.payload.allowedTools,
            allowPersistence: preview.payload.allowPersistence,
            maxSteps: limits.maxSteps ?? 3,
            maxOutputTokens: limits.maxOutputTokens ?? 1000,
          },
          signal,
        ),
      ),
    start: async (approval, signal, beforeTransmit) => {
      const response = await requestJson(
        "/api/reasoning/sessions",
        "POST",
        {
          quoteId: approval.quote.quoteId,
          payload: approval.payload,
          consent: {
            approvedPayloadHash: approval.payloadHash,
            scopes: approval.scopes,
            textTransmission: approval.textTransmission,
            providerRetentionAcknowledged:
              approval.providerRetentionAcknowledged,
          },
          maxUsd: approval.maxUsd,
        },
        signal,
        beforeTransmit,
      );
      if (
        typeof response.sessionId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(response.sessionId)
      )
        throw new Error("The server returned an invalid reasoning session");
      return { sessionId: response.sessionId };
    },
    step: (id, stepId, feedback, signal, beforeTransmit) =>
      requestJson(
        `/api/reasoning/sessions/${encodeURIComponent(id)}/step`,
        "POST",
        { stepId, feedback },
        signal,
        beforeTransmit,
      ),
    cancel: async (id) => {
      await requestJson(
        `/api/reasoning/sessions/${encodeURIComponent(id)}`,
        "DELETE",
      );
    },
  };
}

export async function buildReasoningPreview(
  goal: string,
  selected: ReasoningScope[],
  context: AgentContext,
  allowPersistence = false,
): Promise<ReasoningPreview> {
  const database = context.database ?? db,
    snapshot: ReasoningContextSnapshot = {};
  if (selected.includes("currentLook")) {
    if (!context.inspectCurrentLook)
      throw new Error("The mirror controls are not connected");
    snapshot.currentLook = normalizeLook(await context.inspectCurrentLook());
  }
  if (selected.includes("profile")) {
    const profile = await database.profiles.get(localProfileId);
    if (profile)
      snapshot.profile = {
        skinType: profile.skinType,
        budget: profile.budget,
        currency: profile.currency,
        concerns: profile.concerns.slice(0, 20),
        preferences: profile.preferences.slice(0, 20),
      };
  }
  if (selected.includes("preferences")) {
    const memories = await retrieveMemories("", { limit: 8 }, database);
    snapshot.preferences = memories.map(({ node }) => ({
      id: node.id,
      key: node.key,
      value: JSON.stringify(node.value),
      source: node.source,
      confidence: node.confidence,
    }));
  }
  if (selected.includes("wardrobe"))
    snapshot.wardrobe = (await database.ownedProducts.limit(50).toArray()).map(
      (product) => ({
        id: product.id,
        productId: product.productId,
        name:
          product.name ??
          context.products?.find((item) => item.id === product.productId)
            ?.name ??
          product.productId,
      }),
    );
  if (selected.includes("history")) {
    if (!(await hasConsent("memory.history", database)))
      throw new Error(
        "Consultation history is disabled. No saved history can be selected.",
      );
    snapshot.history = (
      await database.agentEpisodes
        .orderBy("createdAt")
        .reverse()
        .limit(3)
        .toArray()
    ).map((episode) => ({
      id: episode.id,
      createdAt: episode.createdAt,
      summary: episode.summary.slice(0, 1500),
    }));
  }
  const scopes = contextScopes(snapshot),
    payload = ReasoningPayloadSchema.parse({
      goal: goal.trim(),
      context: snapshot,
      allowedTools: allowedReasoningTools(scopes, allowPersistence),
      allowPersistence,
    });
  const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (bytes > 12000)
    throw new Error(
      "This review exceeds 12 KB. Select fewer context categories or shorten the request.",
    );
  return {
    payload,
    payloadHash: await hashReasoningPayload(payload),
    scopes,
    bytes,
  };
}

async function assertContextStillPermitted(
  preview: ReasoningPreview,
  database: BeautyDatabase,
) {
  if (preview.scopes.length && !(await hasConsent("remote.history", database)))
    throw new Error(
      "External reasoning-context permission is disabled. Enable it in privacy settings or send only your typed request.",
    );
  for (const preference of preview.payload.context.preferences ?? []) {
    const node = await database.memoryNodes.get(preference.id);
    if (
      !node ||
      !(await hasConsent(node.consentScope, database)) ||
      JSON.stringify(node.value) !== preference.value
    )
      throw new Error(
        "A selected memory changed or was deleted. Review the context again before sending.",
      );
  }
  for (const product of preview.payload.context.wardrobe ?? []) {
    const current = await database.ownedProducts.get(product.id);
    if (!current || current.productId !== product.productId)
      throw new Error(
        "Your selected wardrobe changed. Review it again before sending.",
      );
  }
  for (const episode of preview.payload.context.history ?? []) {
    if (!(await hasConsent("memory.history", database)))
      throw new Error("History permission was revoked. Reasoning was stopped.");
    const current = await database.agentEpisodes.get(episode.id);
    if (!current || current.summary.slice(0, 1500) !== episode.summary)
      throw new Error(
        "Selected consultation history changed. Review it again before sending.",
      );
  }
  if (preview.payload.context.profile) {
    const current = await database.profiles.get(localProfileId);
    const expected = preview.payload.context.profile;
    if (
      !current ||
      JSON.stringify({
        skinType: current.skinType,
        budget: current.budget,
        currency: current.currency,
        concerns: current.concerns.slice(0, 20),
        preferences: current.preferences.slice(0, 20),
      }) !== JSON.stringify(expected)
    )
      throw new Error(
        "Your beauty profile changed. Review it again before sending.",
      );
  }
}
export class RemoteReasoningError extends Error {
  constructor(
    message: string,
    public readonly partialResult: AgentResult,
  ) {
    super(message);
  }
}
function approvedPreferences(snapshot: ReasoningContextSnapshot) {
  return (snapshot.preferences ?? []).map((memory) => {
    let value: JsonValue;
    try {
      value = JSON.parse(memory.value);
    } catch {
      value = memory.value;
    }
    return { key: memory.key, value };
  });
}
async function saveRemoteEpisode(
  goal: string,
  result: AgentResult,
  preview: ReasoningPreview,
  database: BeautyDatabase,
) {
  const refs = (preview.payload.context.preferences ?? []).map(
    (memory) => memory.id,
  );
  await database.transaction(
    "rw",
    [
      database.consents,
      database.memoryNodes,
      database.agentEpisodes,
      database.agentMessages,
      database.agentToolRuns,
    ],
    async () => {
      if (!(await hasConsent("memory.history", database))) return;
      for (const id of refs) {
        const node = await database.memoryNodes.get(id);
        if (!node || !(await hasConsent(node.consentScope, database))) return;
      }
      for (const episode of preview.payload.context.history ?? []) {
        const row = await database.agentEpisodes.get(episode.id);
        if (!row) return;
        refs.push(...row.memoryRefs);
      }
      await database.agentEpisodes.add({
        id: result.episodeId,
        createdAt: Date.now(),
        request: goal,
        summary: result.message,
        memoryRefs: [...new Set(refs)],
      });
      await database.agentMessages.bulkAdd([
        {
          id: newId(),
          episodeId: result.episodeId,
          role: "user",
          content: goal,
          createdAt: Date.now(),
        },
        {
          id: newId(),
          episodeId: result.episodeId,
          role: "assistant",
          content: result.message,
          createdAt: Date.now(),
        },
      ]);
      if (result.tools.length)
        await database.agentToolRuns.bulkAdd(result.tools);
    },
  );
}

/** Model decisions cross a schema+permission boundary before actual local application tools run. */
export async function executeRemoteBeautyRequest(
  approval: ReasoningApproval,
  context: AgentContext,
  options: {
    transport?: ReasoningTransport;
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
  } = {},
): Promise<AgentResult> {
  const transport = options.transport ?? createReasoningTransport(),
    database = context.database ?? db,
    episodeId = newId(),
    tools: AgentToolRun[] = [],
    recommendations: AgentRecommendation[] = [];
  let budgetPlan: AgentBudgetPlan | undefined,
    sessionId: string | undefined,
    guidance = "",
    turnsCompleted = 0,
    inputTokens: number | null = 0,
    outputTokens: number | null = 0,
    reservedMaximumUsd: number | null = null;
  const result = (): AgentResult => ({
    episodeId,
    mode: "remote",
    tools,
    recommendations,
    budgetPlan,
    providerGuidance: guidance,
    reasoningUsage: {
      turns: turnsCompleted,
      inputTokens,
      outputTokens,
      reservedMaximumUsd,
    },
    memoryUsed: (approval.payload.context.preferences ?? []).map((memory) => ({
      id: memory.id,
      key: memory.key,
      source: memory.source,
      explanation: `Included in your reviewed context: ${memory.key} (${memory.source}).`,
    })),
    message: tools.length
      ? tools.map((tool) => tool.summary).join("\n\n")
      : turnsCompleted
        ? "The model returned guidance without performing a local action."
        : "No model result or local action was completed.",
  });
  const persist = async (value: AgentResult) => {
    try {
      await saveRemoteEpisode(approval.payload.goal, value, approval, database);
    } catch {
      value.message +=
        "\n\nThe actions above remain in your scene, but local consultation history could not be saved.";
    }
  };
  const abortCheck = () => {
    if (options.signal?.aborted)
      throw new Error(
        "Reasoning was cancelled. Completed local actions are listed; dispatched provider work may still be billed.",
      );
  };
  try {
    abortCheck();
    if (
      approval.textTransmission !== true ||
      approval.providerRetentionAcknowledged !== true
    )
      throw new Error(
        "Explicit transmission and provider-retention approval are required.",
      );
    if ((await hashReasoningPayload(approval.payload)) !== approval.payloadHash)
      throw new Error(
        "The reviewed request changed. Review it again before authorization.",
      );
    if (
      !Number.isFinite(approval.maxUsd) ||
      approval.maxUsd < approval.quote.maximumUsd
    )
      throw new Error("The approved USD maximum is below the quote.");
    await assertContextStillPermitted(approval, database);
    const beforeTransmit = async () => {
      abortCheck();
      await assertContextStillPermitted(approval, database);
    };
    const started = await transport.start(
      approval,
      options.signal,
      beforeTransmit,
    );
    sessionId = started.sessionId;
    reservedMaximumUsd = approval.quote.maximumUsd;
    const startedAt = Date.now(),
      seenCalls = new Set<string>();
    let feedback: ToolFeedback[] = [];
    for (let round = 0; round < approval.quote.maxSteps; round++) {
      abortCheck();
      if (Date.now() - startedAt > 90000)
        throw new Error(
          "The bounded reasoning session reached its 90-second client limit.",
        );
      await assertContextStillPermitted(approval, database);
      options.onProgress?.(
        `Reasoning turn ${round + 1} of ${approval.quote.maxSteps}`,
      );
      const response = ReasoningStepResultSchema.parse(
        await transport.step(
          sessionId,
          newId(),
          feedback,
          options.signal,
          beforeTransmit,
        ),
      );
      abortCheck();
      await assertContextStillPermitted(approval, database);
      if (
        response.stepsUsed > approval.quote.maxSteps ||
        (response.usage.inputTokens !== null &&
          response.usage.inputTokens > approval.quote.inputTokenCeiling) ||
        (response.usage.outputTokens !== null &&
          response.usage.outputTokens > approval.quote.maxOutputTokens)
      )
        throw new Error(
          "The reasoning response exceeded the authorized turn/token bounds. No next action was executed.",
        );
      guidance = response.guidance;
      turnsCompleted++;
      inputTokens =
        inputTokens === null || response.usage.inputTokens === null
          ? null
          : inputTokens + response.usage.inputTokens;
      outputTokens =
        outputTokens === null || response.usage.outputTokens === null
          ? null
          : outputTokens + response.usage.outputTokens;
      if (response.status === "done") {
        const completed = result();
        await persist(completed);
        return completed;
      }
      if (!response.calls.length)
        throw new Error(
          "The reasoning service requested tools without a valid tool call.",
        );
      feedback = [];
      for (const call of response.calls) {
        abortCheck();
        await assertContextStillPermitted(approval, database);
        if (
          !approval.payload.allowedTools.includes(call.name) ||
          seenCalls.has(call.id)
        )
          throw new Error("An unapproved or repeated tool call was blocked.");
        seenCalls.add(call.id);
        // Persistence and private reads are restricted independently of the model prompt.
        if (
          !allowedReasoningTools(
            approval.scopes,
            approval.payload.allowPersistence,
          ).includes(call.name)
        )
          throw new Error("The model exceeded the permissions you reviewed.");
        const executed = await executeTool(
          { name: call.name, args: call.args },
          {
            ...context,
            onlyApprovedContext: true,
            approvedProfile: approval.payload.context.profile,
            approvedPreferences: approvedPreferences(approval.payload.context),
            ownedProducts: approval.payload.context.wardrobe ?? [],
            permittedMemory: [],
            selectedPlan: budgetPlan,
          },
          episodeId,
        );
        tools.push(executed.run);
        recommendations.push(...executed.recommendations);
        if (executed.budgetPlan) budgetPlan = executed.budgetPlan;
        let data: string | undefined;
        if (call.name === "inspectCurrentLook" && context.inspectCurrentLook)
          data = JSON.stringify(
            normalizeLook(await context.inspectCurrentLook()),
          );
        if (call.name === "inspectBeautyWardrobe")
          data = JSON.stringify(approval.payload.context.wardrobe ?? []);
        if (executed.recommendations.length)
          data = JSON.stringify({
            selected: executed.recommendations,
            total: executed.budgetPlan?.total,
            remaining: executed.budgetPlan?.remaining,
          });
        feedback.push({
          callId: call.id,
          name: call.name,
          status: executed.run.status,
          summary: executed.run.summary,
          ...(data ? { data } : {}),
        });
      }
    }
    const completed = result();
    completed.message +=
      "\n\nThe authorized turn limit was reached. No further model call was sent.";
    await persist(completed);
    return completed;
  } catch (error) {
    const partial = result();
    partial.message +=
      "\n\n" +
      (error instanceof Error
        ? error.message
        : "Remote reasoning could not finish.");
    if (tools.length) await persist(partial);
    throw new RemoteReasoningError(
      error instanceof Error ? error.message : "Remote reasoning failed",
      partial,
    );
  } finally {
    if (sessionId) await transport.cancel(sessionId).catch(() => {});
  }
}
