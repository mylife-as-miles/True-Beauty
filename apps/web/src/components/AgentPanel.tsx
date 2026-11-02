import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  Mic,
  Sparkles,
  ShieldCheck,
  Square,
} from "lucide-react";
import {
  executeBeautyRequest,
  type AgentResult,
} from "../../../../packages/agent-runtime/src";
import { SAMPLE_PRODUCTS } from "../../../../packages/commerce-engine/src";
import { saveLook, hasConsent } from "../../../../packages/local-database/src";
import { useLiveQuery } from "dexie-react-hooks";
import {
  buildReasoningPreview,
  createReasoningTransport,
  executeRemoteBeautyRequest,
  RemoteReasoningError,
  type ReasoningPreview,
} from "../../../../packages/agent-runtime/src/remote";
import {
  REASONING_SCOPES,
  type ReasoningCapabilities,
  type ReasoningQuote,
  type ReasoningScope,
} from "../../../../packages/agent-runtime/src/reasoning-protocol";
import { useApp } from "../state/store";
import { Modal, Mark } from "./ui";
import "./PrivacySettings.css";
import "./ReasoningPanel.css";

interface SpeechEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface SpeechRecognizer {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechConstructor = new () => SpeechRecognizer;
interface ConversationItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  result?: AgentResult;
}

export function AgentPanel() {
  const open = useApp((s) => s.agentOpen),
    setOpen = useApp((s) => s.setAgentOpen),
    setLook = useApp((s) => s.setLook),
    patchLayer = useApp((s) => s.patchLayer),
    notify = useApp((s) => s.notify);
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [items, setItems] = useState<ConversationItem[]>([]),
    [listening, setListening] = useState(false),
    [mode, setMode] = useState<"local" | "remote">("local"),
    [capabilities, setCapabilities] = useState<ReasoningCapabilities | null>(
      null,
    ),
    [reviewOpen, setReviewOpen] = useState(false),
    [reviewGoal, setReviewGoal] = useState(""),
    [selectedScopes, setSelectedScopes] = useState<ReasoningScope[]>([]),
    [allowPersistence, setAllowPersistence] = useState(false),
    [maximumTurns, setMaximumTurns] = useState(3),
    [outputTokens, setOutputTokens] = useState(1000),
    [preview, setPreview] = useState<ReasoningPreview | null>(null),
    [quote, setQuote] = useState<ReasoningQuote | null>(null),
    [remoteConsent, setRemoteConsent] = useState(false),
    [retentionConsent, setRetentionConsent] = useState(false),
    [maximumUsd, setMaximumUsd] = useState(0),
    [reviewError, setReviewError] = useState(""),
    [progress, setProgress] = useState(""),
    [remoteRunning, setRemoteRunning] = useState(false);
  const mayShareContext = useLiveQuery(
    () => hasConsent("remote.history"),
    [],
    false,
  );
  const remoteAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null),
    endRef = useRef<HTMLDivElement>(null),
    recognitionRef = useRef<SpeechRecognizer | null>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const speech =
    typeof window !== "undefined"
      ? (window as unknown as {
          SpeechRecognition?: SpeechConstructor;
          webkitSpeechRecognition?: SpeechConstructor;
        })
      : {};
  const Speech = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
  useEffect(() => {
    if (open)
      endRef.current?.scrollIntoView({
        block: "nearest",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [items, open]);
  useEffect(() => () => recognitionRef.current?.stop(), []);
  useEffect(() => () => remoteAbort.current?.abort(), []);
  useEffect(() => {
    if (mode !== "remote") return;
    const controller = new AbortController();
    createReasoningTransport()
      .capabilities(controller.signal)
      .then(setCapabilities)
      .catch((error) => {
        if (!controller.signal.aborted)
          setReviewError(
            error instanceof Error
              ? error.message
              : "Connected reasoning is unavailable.",
          );
      });
    return () => controller.abort();
  }, [mode]);
  useEffect(() => {
    if (!open) recognitionRef.current?.stop();
  }, [open]);
  async function send(request: string) {
    if (!request.trim() || busy) return;
    if (mode === "remote") {
      setReviewGoal(request.trim());
      setReviewOpen(true);
      setPreview(null);
      setQuote(null);
      setRemoteConsent(false);
      setRetentionConsent(false);
      setReviewError("");
      return;
    }
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text: request.trim() },
    ]);
    setText("");
    setBusy(true);
    try {
      const result = await executeBeautyRequest(request, {
        inspectCurrentLook: () => useApp.getState().look,
        openRemix: () => {
          useApp.getState().setSpace("remix");
        },
        applyLook: (look) => setLook(look, "Agent composition"),
        setLipColor: (color) =>
          patchLayer("lipstick", { color, enabled: true }),
        setHairColor: (color) => patchLayer("hair", { color, enabled: true }),
        saveLook: async (name) => {
          await saveLook(name, useApp.getState().look);
          notify(`“${name}” saved to your journal`);
        },
        products: SAMPLE_PRODUCTS.map((product) => ({
          ...product,
          priceNgn: product.price,
          sample: product.source === "sample",
        })),
      });
      setItems((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.message,
          result,
        },
      ]);
    } catch (error) {
      setItems((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "The request could not be completed. Try again.",
        },
      ]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }
  function agentContext() {
    return {
      inspectCurrentLook: () => useApp.getState().look,
      openRemix: () => {
        useApp.getState().setSpace("remix");
      },
      applyLook: (
        look: import("../../../../packages/makeup-engine/src").MakeupLook,
      ) => setLook(look, "Connected agent composition"),
      setLipColor: (color: string) =>
        patchLayer("lipstick", { color, enabled: true }),
      setHairColor: (color: string) =>
        patchLayer("hair", { color, enabled: true }),
      saveLook: async (name: string) => {
        await saveLook(name, useApp.getState().look);
        notify(`“${name}” saved to your journal`);
      },
      products: SAMPLE_PRODUCTS.map((product) => ({
        ...product,
        priceNgn: product.price,
        sample: product.source === "sample",
      })),
    };
  }
  function invalidateReview() {
    setPreview(null);
    setQuote(null);
    setRemoteConsent(false);
    setRetentionConsent(false);
    setReviewError("");
  }
  async function preparePreview() {
    setBusy(true);
    setReviewError("");
    try {
      setPreview(
        await buildReasoningPreview(
          reviewGoal,
          selectedScopes,
          agentContext(),
          allowPersistence,
        ),
      );
      setQuote(null);
      setRemoteConsent(false);
      setRetentionConsent(false);
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "The context preview could not be prepared.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function getQuote() {
    if (!preview) return;
    setBusy(true);
    setReviewError("");
    try {
      const value = await createReasoningTransport().quote(preview, {
        maxSteps: maximumTurns,
        maxOutputTokens: outputTokens,
      });
      setQuote(value);
      setMaximumUsd(value.maximumUsd);
      setRemoteConsent(false);
      setRetentionConsent(false);
    } catch (error) {
      setReviewError(
        error instanceof Error
          ? error.message
          : "A reasoning quote is unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function runRemote() {
    if (!preview || !quote || !remoteConsent || !retentionConsent || busy)
      return;
    const controller = new AbortController();
    remoteAbort.current = controller;
    setBusy(true);
    setRemoteRunning(true);
    setReviewError("");
    setReviewOpen(false);
    setText("");
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text: preview.payload.goal },
    ]);
    try {
      const result = await executeRemoteBeautyRequest(
        {
          ...preview,
          quote,
          maxUsd: maximumUsd,
          textTransmission: true,
          providerRetentionAcknowledged: true,
        },
        agentContext(),
        { signal: controller.signal, onProgress: setProgress },
      );
      setItems((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: result.message,
          result,
        },
      ]);
    } catch (error) {
      const result =
        error instanceof RemoteReasoningError ? error.partialResult : undefined;
      setItems((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text:
            result?.message ??
            (error instanceof Error
              ? error.message
              : "Connected reasoning failed."),
          result,
        },
      ]);
    } finally {
      remoteAbort.current = null;
      setBusy(false);
      setRemoteRunning(false);
      setProgress("");
      setQuote(null);
      setRemoteConsent(false);
      setRetentionConsent(false);
      inputRef.current?.focus();
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void send(text);
  }
  function startVoice() {
    if (!Speech) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    try {
      const recognition = new Speech();
      recognition.lang = "en-NG";
      recognition.interimResults = false;
      recognition.onresult = (event) => {
        setText(event.results[0]?.[0]?.transcript ?? "");
        setListening(false);
      };
      recognition.onend = () => setListening(false);
      recognition.onerror = () => {
        setListening(false);
        notify("Voice input is unavailable. You can type your request.");
      };
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      notify("Voice input could not start. Use the text field.");
    }
  }
  if (!open) return null;
  return (
    <Modal title="Your beauty agent" onClose={close} wide>
      <div className="agent-panel">
        <div className="agent-mode">
          <span>
            <span className="local-dot" />{" "}
            {mode === "local" ? "Local assistant" : "Connected reasoning"}
          </span>
          <label className="reasoning-mode-label">
            <span className="sr-only">Assistant mode</span>
            <select
              aria-label="Assistant mode"
              value={mode}
              disabled={busy}
              onChange={(event) => {
                setMode(event.target.value as "local" | "remote");
                setReviewOpen(false);
                invalidateReview();
              }}
            >
              <option value="local">Local · no paid requests</option>
              <option value="remote">Claude / configured provider</option>
            </select>
          </label>
        </div>
        {mode === "remote" && (
          <div className="reasoning-status">
            <ShieldCheck size={15} />
            <span>
              {capabilities?.ready
                ? `${capabilities.model} · exact review and a cost quote before each request.`
                : (capabilities?.unavailableReason ?? reviewError) ||
                  "Checking server reasoning configuration…"}{" "}
              Images are never sent by this text-only adapter.
            </span>
          </div>
        )}
        {mode === "remote" && reviewOpen && (
          <section
            className="reasoning-review"
            aria-label="Review connected reasoning request"
          >
            <div className="reasoning-review-heading">
              <h3>Review before connecting.</h3>
              <button onClick={() => setReviewOpen(false)} disabled={busy}>
                Back to chat
              </button>
            </div>
            <label className="field-label">
              Request to send
              <textarea
                aria-label="Request to send"
                value={reviewGoal}
                maxLength={4000}
                rows={2}
                onChange={(event) => {
                  setReviewGoal(event.target.value);
                  invalidateReview();
                }}
                disabled={busy}
              />
            </label>
            <p>
              Only your typed request is selected by default. Choose any
              additional local context you want this one request to use.
            </p>
            <div className="reasoning-scopes">
              {REASONING_SCOPES.map((scope) => (
                <label key={scope}>
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    disabled={busy || !mayShareContext}
                    onChange={(event) => {
                      setSelectedScopes((previous) =>
                        event.target.checked
                          ? [...previous, scope]
                          : previous.filter((value) => value !== scope),
                      );
                      invalidateReview();
                    }}
                  />
                  {
                    {
                      currentLook: "Editable mirror controls · no photo",
                      profile: "Self-reported beauty profile",
                      preferences: "Up to 8 permitted preferences",
                      wardrobe: "Up to 50 owned-product records",
                      history: "Up to 3 saved consultation excerpts",
                    }[scope]
                  }
                </label>
              ))}
            </div>
            {!mayShareContext && (
              <p className="reasoning-scope-note">
                Personal-context sharing is off.{" "}
                <button onClick={() => useApp.getState().setSettingsOpen(true)}>
                  Review privacy permissions
                </button>
                , or send only your typed request.
              </p>
            )}
            <label className="reasoning-permission">
              <input
                type="checkbox"
                checked={allowPersistence}
                disabled={busy}
                onChange={(event) => {
                  setAllowPersistence(event.target.checked);
                  invalidateReview();
                }}
              />
              Allow this request to save editable looks and create routines
              locally
            </label>
            <p className="reasoning-scope-note">
              The model can use only the actions listed in the exact preview.
              Tool-result summaries from those approved actions may be sent back
              for the next turn. Purchases, image APIs, memory changes and
              deletion are excluded.
            </p>
            <button
              className="button secondary"
              onClick={() => void preparePreview()}
              disabled={busy || !reviewGoal.trim()}
            >
              Prepare exact preview
            </button>
            {preview && (
              <>
                <details className="reasoning-payload" open>
                  <summary>
                    Exact outgoing text · {preview.bytes.toLocaleString()} bytes
                  </summary>
                  <pre>{JSON.stringify(preview.payload, null, 2)}</pre>
                </details>
                <div className="reasoning-limits">
                  <label>
                    Maximum model turns
                    <select
                      aria-label="Maximum model turns"
                      value={maximumTurns}
                      disabled={busy}
                      onChange={(event) => {
                        setMaximumTurns(Number(event.target.value));
                        setQuote(null);
                        setRemoteConsent(false);
                        setRetentionConsent(false);
                      }}
                    >
                      {[1, 2, 3, 4].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Output tokens per turn
                    <select
                      aria-label="Output tokens per turn"
                      value={outputTokens}
                      disabled={busy}
                      onChange={(event) => {
                        setOutputTokens(Number(event.target.value));
                        setQuote(null);
                        setRemoteConsent(false);
                        setRetentionConsent(false);
                      }}
                    >
                      {[256, 512, 1000, 1600].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="button secondary"
                  disabled={busy || !capabilities?.ready}
                  onClick={() => void getQuote()}
                >
                  Get a maximum-cost quote
                </button>
              </>
            )}
            {quote && (
              <div className="reasoning-quote">
                <h4>Up to US${quote.maximumUsd.toFixed(6)}</h4>
                <p>
                  {quote.maxSteps} model turns maximum · {quote.maxOutputTokens}{" "}
                  output tokens per turn. Full quote reserved once; cancellation
                  or uncertain failures do not automatically refund the ceiling.
                </p>
                <p>
                  Operator-reviewed rates dated{" "}
                  {new Date(
                    quote.pricingProvenance.reviewedAt,
                  ).toLocaleDateString()}
                  .{" "}
                  <a
                    href={quote.pricingProvenance.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Pricing source
                  </a>
                  . This is a conservative bound, not a live provider-price
                  lookup.
                </p>
                <label className="field-label">
                  My maximum authorized USD amount
                  <input
                    type="number"
                    aria-label="Maximum authorized USD amount"
                    min={quote.maximumUsd}
                    max={10}
                    step="0.000001"
                    value={maximumUsd}
                    onChange={(event) =>
                      setMaximumUsd(Number(event.target.value))
                    }
                  />
                </label>
                <label className="reasoning-permission">
                  <input
                    type="checkbox"
                    checked={remoteConsent}
                    onChange={(event) => setRemoteConsent(event.target.checked)}
                  />
                  Send this request, exactly the selected context, and approved
                  tool-result feedback to the configured provider.
                </label>
                <label className="reasoning-permission">
                  <input
                    type="checkbox"
                    checked={retentionConsent}
                    onChange={(event) =>
                      setRetentionConsent(event.target.checked)
                    }
                  />
                  I reviewed the maximum cost and understand that the provider
                  has its own data-retention terms. This app cannot promise
                  provider-side deletion.
                </label>
                <button
                  className="button primary"
                  onClick={() => void runRemote()}
                  disabled={
                    busy ||
                    !remoteConsent ||
                    !retentionConsent ||
                    !Number.isFinite(maximumUsd) ||
                    maximumUsd < quote.maximumUsd
                  }
                >
                  Authorize up to US$
                  {Number.isFinite(maximumUsd)
                    ? maximumUsd.toFixed(6)
                    : "—"}{" "}
                  and run
                </button>
              </div>
            )}
            {reviewError && (
              <p className="settings-error" role="alert">
                {reviewError}
              </p>
            )}
          </section>
        )}
        <div
          className="agent-conversation"
          role="log"
          aria-label="Beauty conversation"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {!items.length && (
            <div className="agent-welcome">
              <Mark size={36} />
              <h3>
                A little direction.
                <br />A look that feels like you.
              </h3>
              <p>
                Ask me to change your mirror, build a routine, or find products
                you already own.
              </p>
              <div className="agent-suggestions">
                {[
                  "Soft glam for a wedding, dry skin, ₦20,000",
                  "Make my lips berry",
                  "Build a simple PM routine",
                  "Use only my owned makeup products",
                ].map((prompt) => (
                  <button key={prompt} onClick={() => void send(prompt)}>
                    {prompt}
                    <ArrowUp size={15} />
                  </button>
                ))}
              </div>
              <p className="agent-footnote">
                {mode === "local"
                  ? "A local command planner powers these supported beauty actions. It does not perform medical diagnosis or claim to be a connected language model."
                  : "Connected reasoning uses only your reviewed text, the tool permissions you approve, and a bounded cost quote. Model guidance is displayed separately from actual action results."}
              </p>
            </div>
          )}
          {items.map((item) => (
            <article className={`agent-message ${item.role}`} key={item.id}>
              <div className="agent-message-label">
                {item.role === "user" ? "You" : "True Beauty"}
              </div>
              <div className="agent-message-text">{item.text}</div>
              {item.result?.mode === "remote" &&
                item.result.providerGuidance && (
                  <details className="agent-tool-details">
                    <summary>
                      Model guidance · separate from verified actions
                      <ChevronDown size={14} />
                    </summary>
                    <p className="reasoning-model-guidance">
                      {item.result.providerGuidance}
                    </p>
                  </details>
                )}
              {item.result?.reasoningUsage && (
                <p className="reasoning-usage">
                  {item.result.reasoningUsage.turns} completed model turns ·{" "}
                  {item.result.reasoningUsage.inputTokens ?? "unreported"} input
                  / {item.result.reasoningUsage.outputTokens ?? "unreported"}{" "}
                  output tokens ·{" "}
                  {item.result.reasoningUsage.reservedMaximumUsd === null
                    ? "no server reservation confirmed"
                    : `maximum reservation US$${item.result.reasoningUsage.reservedMaximumUsd.toFixed(6)}`}
                  . Check your provider for actual billing.
                </p>
              )}
              {item.result?.tools.length ? (
                <details className="agent-tool-details">
                  <summary>
                    {
                      item.result.tools.filter((t) => t.status === "succeeded")
                        .length
                    }{" "}
                    of {item.result.tools.length} actions completed
                    <ChevronDown size={14} />
                  </summary>
                  <ul>
                    {item.result.tools.map((tool) => (
                      <li key={tool.id}>
                        <span className={`tool-status ${tool.status}`}>
                          {tool.status === "succeeded" ? (
                            <Check size={14} />
                          ) : (
                            <CircleAlert size={14} />
                          )}
                        </span>
                        <span>
                          <strong>{tool.name}</strong>
                          <small>
                            {tool.status.replaceAll("-", " ")} ·{" "}
                            {tool.durationMs} ms
                          </small>
                          {tool.status !== "succeeded" && <p>{tool.summary}</p>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {item.result?.budgetPlan && (
                <div className="agent-budget-plan">
                  <div>
                    <span>Combined plan</span>
                    <strong>
                      {item.result.budgetPlan.currency}{" "}
                      {item.result.budgetPlan.total.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span>Remaining</span>
                    <strong>
                      {item.result.budgetPlan.currency}{" "}
                      {item.result.budgetPlan.remaining.toLocaleString()}
                    </strong>
                  </div>
                  <small>
                    Of {item.result.budgetPlan.currency}{" "}
                    {item.result.budgetPlan.budget.toLocaleString()} total ·{" "}
                    {item.result.budgetPlan.samplePricing
                      ? "sample catalogue prices"
                      : "owned-product allocations"}
                  </small>
                  {item.result.budgetPlan.unfilledSlots.length > 0 && (
                    <p>
                      Still to cover:{" "}
                      {item.result.budgetPlan.unfilledSlots.join(", ")}. Use
                      owned options or adjust your budget.
                    </p>
                  )}
                </div>
              )}
              {item.result?.recommendations.length ? (
                <div className="agent-recommendations">
                  <p className="field-label">
                    Selected products · verify sample data
                  </p>
                  {item.result.recommendations.map((product) => (
                    <div key={product.id}>
                      <strong>{product.name}</strong>
                      <p>{product.explanation}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {item.result?.memoryUsed.length ? (
                <details className="agent-tool-details">
                  <summary>
                    {item.result.memoryUsed.length} permitted memories
                    considered
                    <ChevronDown size={14} />
                  </summary>
                  {item.result.memoryUsed.map((memory) => (
                    <p key={memory.id}>{memory.explanation}</p>
                  ))}
                </details>
              ) : null}
            </article>
          ))}
          {busy && (
            <div className="agent-thinking" role="status">
              <LoaderCircle className="spin" size={16} />{" "}
              {progress || "Applying your request…"}
              {remoteRunning && (
                <button
                  className="reasoning-stop"
                  onClick={() => remoteAbort.current?.abort()}
                >
                  <Square size={13} /> Stop
                </button>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form className="agent-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="beauty-request">
            Your beauty request
          </label>
          <textarea
            id="beauty-request"
            ref={inputRef}
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            placeholder="Try ‘a soft rose lip and copper hair’"
            rows={2}
            disabled={busy}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send(text);
              }
            }}
          />
          <div className="agent-composer-actions">
            {Speech && (
              <button
                type="button"
                className={`icon-button ${listening ? "listening" : ""}`}
                aria-label={
                  listening ? "Stop voice input" : "Dictate a request"
                }
                aria-pressed={listening}
                onClick={startVoice}
                disabled={busy}
              >
                <Mic size={18} />
              </button>
            )}
            <button
              type="submit"
              className="agent-send"
              disabled={busy || !text.trim()}
              aria-label="Send request"
            >
              {busy ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <ArrowUp size={20} />
              )}
            </button>
          </div>
        </form>
        <div className="agent-bottom-note">
          <Sparkles size={12} /> Changes affect your editable mirror. Chat
          history is saved only when you enable it in privacy settings.
        </div>
        {Speech && (
          <p
            className="agent-footnote"
            style={{ margin: "6px 0 0", fontSize: 11 }}
          >
            Voice input uses your browser’s speech service; audio may be
            processed externally when you press the microphone.
          </p>
        )}
      </div>
    </Modal>
  );
}
