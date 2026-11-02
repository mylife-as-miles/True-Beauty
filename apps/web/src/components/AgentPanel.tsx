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
} from "lucide-react";
import {
  executeBeautyRequest,
  type AgentResult,
} from "../../../../packages/agent-runtime/src";
import { SAMPLE_PRODUCTS } from "../../../../packages/commerce-engine/src";
import { saveLook } from "../../../../packages/local-database/src";
import { useApp } from "../state/store";
import { Modal, Mark } from "./ui";
import "./PrivacySettings.css";

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
    [listening, setListening] = useState(false);
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
  useEffect(() => {
    if (!open) recognitionRef.current?.stop();
  }, [open]);
  async function send(request: string) {
    if (!request.trim() || busy) return;
    setItems((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: "user", text: request.trim() },
    ]);
    setText("");
    setBusy(true);
    try {
      const result = await executeBeautyRequest(request, {
        inspectCurrentLook: () => useApp.getState().look,
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
            <span className="local-dot" /> Local assistant
          </span>
          <span>No image upload · no paid requests</span>
        </div>
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
                A local command planner powers this assistant. It understands
                the supported beauty actions below. It does not perform medical
                diagnosis or claim to be a connected language model.
              </p>
            </div>
          )}
          {items.map((item) => (
            <article className={`agent-message ${item.role}`} key={item.id}>
              <div className="agent-message-label">
                {item.role === "user" ? "You" : "True Beauty"}
              </div>
              <div className="agent-message-text">{item.text}</div>
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
              <LoaderCircle className="spin" size={16} /> Applying your request…
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
