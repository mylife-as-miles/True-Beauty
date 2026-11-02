import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Scissors,
  ShieldCheck,
  Shirt,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "../state/store";
import {
  PROVIDER_RETENTION_DAYS,
  PROVIDER_RETENTION_SOURCE,
  type GenerationCapabilities,
  type GenerationFeature,
  type GenerationSpec,
  type GenerationTaskView,
} from "../../../api/src/generationContracts";
import "./RemoteStudio.css";
export interface RemoteStudioProps {
  initialFeature?: GenerationFeature;
  onClose?: () => void;
  onUseResult?: (
    blob: Blob,
    meta: {
      kind: "ai-generated";
      provider: "perfect-corp";
      feature: GenerationFeature;
      createdAt: string;
    },
  ) => void;
}
interface PreparedImage {
  file: File;
  url: string;
}
interface CreditQuote {
  quoteId: string;
  spec: GenerationSpec;
  credits: number;
  expiresAt: string;
}
const categoryLabels = {
  full_body: "Full look",
  upper_body: "Top",
  lower_body: "Bottom",
  outer: "Outer layer",
  shoes: "Shoes",
  auto: "Let the provider choose",
} as const;
async function readJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The provider service could not be reached. Your prepared images stay on this device.",
    );
  }
  if (!response.ok) {
    const value = body as { error?: string | { message?: string } };
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : (value.error?.message ??
            "The provider request could not be completed."),
    );
  }
  return body as T;
}
async function mutation<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const session = await readJson<{ csrfToken: string }>("/api/session");
  if (typeof session.csrfToken !== "string")
    throw new Error("The local provider session could not be opened.");
  return readJson<T>(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": session.csrfToken,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function encodedFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return {
    base64: btoa(value),
    contentType: file.type as "image/jpeg" | "image/png",
  };
}
export default function RemoteStudio({
  initialFeature = "hair",
  onClose,
  onUseResult,
}: RemoteStudioProps) {
  const sharedPortrait = useApp((s) => s.portraitUrl),
    notify = useApp((s) => s.notify);
  const [feature, setFeature] = useState<GenerationFeature>(initialFeature),
    [source, setSource] = useState<PreparedImage | null>(null),
    [reference, setReference] = useState<PreparedImage | null>(null),
    [hairColor, setHairColor] = useState<"src" | "ref">("src"),
    [styleSource, setStyleSource] = useState<"photo" | "template">("photo"),
    [templateId, setTemplateId] = useState(""),
    [category, setCategory] =
      useState<keyof typeof categoryLabels>("upper_body"),
    [changeShoes, setChangeShoes] = useState(false),
    [templates, setTemplates] = useState<{ id: string; title: string }[]>([]),
    [templateToken, setTemplateToken] = useState<string | undefined>();
  const [capabilities, setCapabilities] =
      useState<GenerationCapabilities | null>(null),
    [quote, setQuote] = useState<CreditQuote | null>(null),
    [maxCredits, setMaxCredits] = useState(""),
    [uploadConsent, setUploadConsent] = useState(false),
    [retentionConsent, setRetentionConsent] = useState(false),
    [task, setTask] = useState<GenerationTaskView | null>(null),
    [recent, setRecent] = useState<GenerationTaskView[]>([]),
    [result, setResult] = useState<{
      taskId: string;
      blob: Blob;
      url: string;
    } | null>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [checking, setChecking] = useState(false),
    [retryImage, setRetryImage] = useState(0);
  const sourceInput = useRef<HTMLInputElement>(null),
    referenceInput = useRef<HTMLInputElement>(null),
    mounted = useRef(true),
    requestEpoch = useRef(0);
  const spec = useMemo<GenerationSpec>(
    () =>
      feature === "hair"
        ? {
            feature: "hair",
            hairColor,
            ...(styleSource === "template" && templateId ? { templateId } : {}),
          }
        : {
            feature: "clothing",
            garmentCategory: category,
            changeShoes,
            filterMultiPerson: "strict",
          },
    [feature, hairColor, styleSource, templateId, category, changeShoes],
  );
  const specKey = JSON.stringify(spec),
    needsReference = feature === "clothing" || styleSource === "photo";
  const capability = capabilities?.features[feature];
  const reviewed =
    !!capability?.readyForQuote &&
    capability.allowedSpecs.some((s) => JSON.stringify(s) === specKey);
  const isActive = task?.status === "uploading" || task?.status === "running";
  const currentResult = result?.taskId === task?.taskId ? result : null;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestEpoch.current++;
    };
  }, []);
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (reference) URL.revokeObjectURL(reference.url);
    },
    [reference],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    setQuote(null);
    setMaxCredits("");
    setUploadConsent(false);
    setRetentionConsent(false);
  }, [specKey, source, reference]);
  const refreshSetup = useCallback(async () => {
    setChecking(true);
    setError("");
    try {
      const value = await readJson<GenerationCapabilities>(
        "/api/generation/capabilities",
      );
      if (!value.features?.hair || !value.features?.clothing)
        throw new Error(
          "This provider service does not yet support the generation workflow.",
        );
      if (mounted.current) setCapabilities(value);
      await readJson("/api/session");
      const list = await readJson<{ tasks: GenerationTaskView[] }>(
        "/api/generation/tasks",
      );
      if (mounted.current) setRecent(list.tasks ?? []);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Provider setup is unavailable.",
        );
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, []);
  useEffect(() => {
    void refreshSetup();
  }, [refreshSetup]);
  const chooseImage = (
    file: File | undefined,
    which: "source" | "reference",
  ) => {
    if (!file) return;
    if (
      !["image/jpeg", "image/png"].includes(file.type) ||
      file.size > 4 * 1024 * 1024 ||
      file.size === 0
    ) {
      setError("Choose a JPEG or PNG image under 4 MB.");
      return;
    }
    requestEpoch.current++;
    setError("");
    const image = { file, url: URL.createObjectURL(file) };
    if (which === "source") setSource(image);
    else setReference(image);
  };
  const reusePortrait = async () => {
    setBusy("portrait");
    setError("");
    try {
      const response = await fetch(sharedPortrait);
      if (!response.ok)
        throw new Error(
          "The session portrait could not be opened. Upload it again.",
        );
      const blob = await response.blob();
      if (mounted.current)
        chooseImage(
          new File([blob], "session-portrait", { type: blob.type }),
          "source",
        );
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "The portrait could not be opened.",
        );
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const getQuote = async () => {
    setBusy("quote");
    setError("");
    const epoch = requestEpoch.current;
    try {
      const value = await mutation<CreditQuote>("/api/generation/quotes", {
        spec,
      });
      if (mounted.current && epoch === requestEpoch.current) setQuote(value);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "A verified quote is unavailable.",
        );
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const start = async () => {
    if (
      !source ||
      !quote ||
      !uploadConsent ||
      !retentionConsent ||
      (needsReference && !reference) ||
      Number(maxCredits) < quote.credits
    )
      return;
    const selectedSource = source.file,
      selectedReference = reference?.file,
      selectedSpec = spec;
    setBusy("start");
    setError("");
    const epoch = requestEpoch.current;
    try {
      const input = await encodedFile(selectedSource),
        ref =
          needsReference && selectedReference
            ? await encodedFile(selectedReference)
            : undefined;
      if (!mounted.current || epoch !== requestEpoch.current) return;
      const value = await mutation<GenerationTaskView>(
        "/api/generation/tasks",
        {
          quoteId: quote.quoteId,
          spec: selectedSpec,
          source: input,
          ...(ref ? { reference: ref } : {}),
          maxCredits: Number(maxCredits),
          consent: {
            uploadImages: true,
            rightsConfirmed: true,
            externalProcessing: true,
            providerRetentionAcknowledged: true,
          },
        },
      );
      if (mounted.current) {
        setTask(value);
        setRecent((v) => [
          value,
          ...v.filter((t) => t.taskId !== value.taskId),
        ]);
        setResult(null);
        setQuote(null);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "The generation request could not be started.",
        );
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const checkTask = useCallback(async (id: string) => {
    setError("");
    try {
      const value = await readJson<GenerationTaskView>(
        `/api/generation/tasks/${encodeURIComponent(id)}`,
      );
      if (mounted.current) {
        setTask((current) => (current?.taskId === id ? value : current));
        setRecent((v) => [value, ...v.filter((t) => t.taskId !== id)]);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Task status could not be verified.",
        );
    }
  }, []);
  useEffect(() => {
    if (!task || !isActive) return;
    const timer = setTimeout(
      () => {
        void checkTask(task.taskId);
      },
      Math.max(10000, task.pollAfterMs || 10000),
    );
    return () => clearTimeout(timer);
  }, [task, isActive, checkTask]);
  useEffect(() => {
    if (!task || task.status !== "success" || currentResult) return;
    let active = true;
    const controller = new AbortController(),
      id = task.taskId;
    void fetch(`/api/generation/tasks/${encodeURIComponent(id)}/image`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) {
          let message = "The generated image could not be loaded.";
          try {
            message = (await response.json()).error ?? message;
          } catch {
            /* Keep the safe fallback when an error response is not JSON. */
          }
          throw new Error(message);
        }
        const blob = await response.blob();
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(blob.type) ||
          blob.size > 8 * 1024 * 1024
        )
          throw new Error("The generated image format is not supported.");
        if (active && mounted.current)
          setResult({ taskId: id, blob, url: URL.createObjectURL(blob) });
      })
      .catch((e) => {
        if (active && mounted.current)
          setError(
            e instanceof Error
              ? e.message
              : "The generated image could not be loaded.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [task?.taskId, task?.status, retryImage, currentResult]);
  const stopWaiting = async () => {
    if (!task) return;
    setBusy("stop");
    try {
      const value = await mutation<GenerationTaskView>(
        `/api/generation/tasks/${encodeURIComponent(task.taskId)}/cancel`,
        {},
      );
      if (mounted.current) {
        setTask(value);
        setResult(null);
        setRecent((v) => v.map((t) => (t.taskId === value.taskId ? value : t)));
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "The local task could not be stopped.",
        );
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const deleteTask = async () => {
    if (!task) return;
    setBusy("delete");
    try {
      await mutation(
        `/api/generation/tasks/${encodeURIComponent(task.taskId)}`,
        undefined,
        "DELETE",
      );
      if (mounted.current) {
        setRecent((v) => v.filter((t) => t.taskId !== task.taskId));
        setTask(null);
        setResult(null);
        notify(
          "Local task and generated result removed. Provider retention still applies.",
        );
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "The local task could not be removed.",
        );
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const loadTemplates = async () => {
    setBusy("templates");
    setError("");
    try {
      await readJson("/api/session");
      const value = await readJson<{
        templates: { id: string; title: string }[];
        nextToken?: string;
      }>(
        `/api/generation/templates/hair${templateToken ? "?startingToken=" + encodeURIComponent(templateToken) : ""}`,
      );
      if (mounted.current) {
        setTemplates((v) => [
          ...v,
          ...value.templates.filter((t) => !v.some((x) => x.id === t.id)),
        ]);
        setTemplateToken(value.nextToken);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "Provider styles could not be loaded.",
        );
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const download = () => {
    if (!currentResult) return;
    const link = document.createElement("a");
    link.href = currentResult.url;
    link.download = `true-beauty-generated-${task?.feature ?? feature}.${currentResult.blob.type === "image/png" ? "png" : currentResult.blob.type === "image/webp" ? "webp" : "jpg"}`;
    link.click();
  };
  return (
    <section className="remote-studio" aria-label="AI generation studio">
      <header className="remote-heading">
        <div>
          <span className="subtle-label">
            A new possibility, thoughtfully made
          </span>
          <h1>Imagine your next look.</h1>
          <p>
            Generated hair and clothing previews, with a clear choice before
            anything leaves your device.
          </p>
        </div>
        {onClose && (
          <button className="text-action" onClick={onClose}>
            <ArrowLeft size={15} />
            Back to the studio
          </button>
        )}
      </header>
      <div
        className="remote-feature-switch"
        role="group"
        aria-label="Generation feature"
      >
        {(["hair", "clothing"] as const).map((name) => (
          <button
            key={name}
            aria-pressed={feature === name}
            disabled={!!busy}
            onClick={() => {
              requestEpoch.current++;
              setFeature(name);
              setTask(null);
              setResult(null);
              setError("");
            }}
          >
            {name === "hair" ? <Scissors size={17} /> : <Shirt size={17} />}{" "}
            {name === "hair" ? "Hairstyle studio" : "Clothing studio"}
          </button>
        ))}
      </div>
      <div className="remote-layout">
        <div className="remote-composer">
          <div className="remote-step-heading">
            <h2>
              {feature === "hair"
                ? "Your hair, reimagined."
                : "A different way to dress."}
            </h2>
            <span>AI-generated image</span>
          </div>
          <p className="remote-guidance">
            {feature === "hair"
              ? "Use a front-facing portrait with your hair and shoulders visible. Choose a hairstyle reference or a provider style."
              : "Use a full- or upper-body photo and one garment reference. Generated clothing is a visual idea, not a measurement of fit."}
          </p>
          <div className="remote-image-pair">
            <div className="remote-image-choice">
              <button
                onClick={() => sourceInput.current?.click()}
                disabled={!!busy}
                aria-label="Choose your generation portrait"
              >
                {source ? (
                  <img src={source.url} alt="Your selected generation source" />
                ) : (
                  <>
                    <ImagePlus size={25} />
                    <span>Your portrait</span>
                    <small>JPEG or PNG · under 4 MB</small>
                  </>
                )}
              </button>
              <input
                ref={sourceInput}
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                aria-label="Upload generation portrait"
                onChange={(e) => chooseImage(e.target.files?.[0], "source")}
              />
              <span>{source ? "Your selected photo" : "Choose a photo"}</span>
            </div>
            <div className="remote-image-choice">
              <button
                onClick={() => referenceInput.current?.click()}
                disabled={
                  !!busy || (feature === "hair" && styleSource === "template")
                }
                aria-label="Choose a generation reference"
              >
                {reference ? (
                  <img
                    src={reference.url}
                    alt={
                      feature === "hair"
                        ? "Selected hairstyle reference"
                        : "Selected garment reference"
                    }
                  />
                ) : (
                  <>
                    <ImagePlus size={25} />
                    <span>
                      {feature === "hair" ? "Style reference" : "Your garment"}
                    </span>
                    <small>
                      {feature === "hair" && styleSource === "template"
                        ? "Using a provider style"
                        : "JPEG or PNG · under 4 MB"}
                    </small>
                  </>
                )}
              </button>
              <input
                ref={referenceInput}
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                aria-label="Upload generation reference"
                onChange={(e) => chooseImage(e.target.files?.[0], "reference")}
              />
              <span>
                {feature === "hair"
                  ? "The hairstyle to explore"
                  : "The garment to try"}
              </span>
            </div>
          </div>
          {sharedPortrait.startsWith("blob:") && (
            <button
              className="text-action remote-reuse"
              disabled={!!busy}
              onClick={() => void reusePortrait()}
            >
              Use my current session photo <ArrowRight size={14} />
            </button>
          )}
          {feature === "hair" ? (
            <>
              <label className="field-label">
                Hairstyle source
                <select
                  value={styleSource}
                  disabled={!!busy}
                  onChange={(e) => {
                    requestEpoch.current++;
                    setStyleSource(e.target.value as "photo" | "template");
                  }}
                >
                  <option value="photo">My reference photo</option>
                  <option value="template">A provider style</option>
                </select>
              </label>
              {styleSource === "template" && (
                <div className="remote-templates">
                  <label className="field-label">
                    Provider hairstyle
                    <select
                      value={templateId}
                      disabled={!templates.length || !!busy}
                      onChange={(e) => {
                        requestEpoch.current++;
                        setTemplateId(e.target.value);
                      }}
                    >
                      <option value="">Choose a verified provider style</option>
                      {templates.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="text-action"
                    disabled={!!busy || !capabilities?.credentialConfigured}
                    onClick={() => void loadTemplates()}
                  >
                    {templates.length
                      ? "Load more provider styles"
                      : "Load provider styles"}
                    <RefreshCw size={13} />
                  </button>
                </div>
              )}
              <label className="field-label">
                Hair colour source
                <select
                  value={hairColor}
                  disabled={!!busy}
                  onChange={(e) => {
                    requestEpoch.current++;
                    setHairColor(e.target.value as "src" | "ref");
                  }}
                >
                  <option value="src">Keep my hair colour</option>
                  <option value="ref">Use the reference colour</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="field-label">
                Garment area
                <select
                  value={category}
                  disabled={!!busy}
                  onChange={(e) => {
                    requestEpoch.current++;
                    setCategory(e.target.value as keyof typeof categoryLabels);
                  }}
                >
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {["full_body", "lower_body"].includes(category) && (
                <label className="remote-checkbox">
                  <input
                    type="checkbox"
                    checked={changeShoes}
                    disabled={!!busy}
                    onChange={(e) => {
                      requestEpoch.current++;
                      setChangeShoes(e.target.checked);
                    }}
                  />
                  Include shoes from the reference
                </label>
              )}
              <p className="fine-print">
                The provider is asked to reject photos with additional people.
              </p>
            </>
          )}
          <div className="remote-connection" role="status">
            <ShieldCheck size={18} />
            <div>
              <strong>
                {capability?.readyForQuote
                  ? "Connected · quote required"
                  : capability?.configured
                    ? "One setup step is still needed"
                    : "Generation is not connected yet"}
              </strong>
              <p>
                {capability?.reason ??
                  "Your images are prepared locally. No image is sent while checking this service."}
              </p>
              <button
                className="text-action"
                disabled={checking}
                onClick={() => void refreshSetup()}
              >
                {checking ? "Checking setup…" : "Check provider setup"}
                <RefreshCw size={12} />
              </button>
            </div>
          </div>
          {capability?.readyForQuote && !reviewed && (
            <p className="remote-inline-note">
              These settings do not yet have an approved price. Select an
              operator-reviewed setting or update the server price plan.
            </p>
          )}
          <button
            className="button secondary remote-quote-button"
            onClick={() => void getQuote()}
            disabled={
              !!busy ||
              !reviewed ||
              (styleSource === "template" && feature === "hair" && !templateId)
            }
          >
            {busy === "quote" ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ShieldCheck size={16} />
            )}
            Get a verified credit quote
          </button>
          <p className="fine-print">
            A quote sends settings only. Your photos stay here until you
            explicitly authorize generation.
          </p>
          {quote && (
            <div className="remote-credit-review">
              <div>
                <span>One generated preview</span>
                <strong>{quote.credits} credits</strong>
              </div>
              <p>
                Quote expires at{" "}
                {new Date(quote.expiresAt).toLocaleTimeString()}. No automatic
                retry or additional generation.
              </p>
              <label className="remote-checkbox">
                <input
                  type="checkbox"
                  checked={uploadConsent}
                  onChange={(e) => setUploadConsent(e.target.checked)}
                />
                I have permission to use these images and consent to sending
                them to Perfect Corp for this preview.
              </label>
              <label className="remote-checkbox">
                <input
                  type="checkbox"
                  checked={retentionConsent}
                  onChange={(e) => setRetentionConsent(e.target.checked)}
                />
                I understand the provider may retain uploaded and generated
                media for up to {PROVIDER_RETENTION_DAYS} days.{" "}
                <a
                  href={PROVIDER_RETENTION_SOURCE}
                  target="_blank"
                  rel="noreferrer"
                >
                  Retention terms
                </a>
              </label>
              <label className="field-label">
                Maximum provider credits I authorize
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={maxCredits}
                  onChange={(e) => setMaxCredits(e.target.value)}
                />
              </label>
              <button
                className="button primary"
                onClick={() => void start()}
                disabled={
                  !!busy ||
                  !source ||
                  (needsReference && !reference) ||
                  !uploadConsent ||
                  !retentionConsent ||
                  !maxCredits ||
                  !Number.isFinite(Number(maxCredits)) ||
                  Number(maxCredits) < quote.credits
                }
              >
                {busy === "start" ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                Authorize and generate preview
              </button>
            </div>
          )}
          {error && (
            <p className="remote-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="text-action remote-clear"
            disabled={!!busy}
            onClick={() => {
              requestEpoch.current++;
              setSource(null);
              setReference(null);
              setQuote(null);
              setError("");
            }}
          >
            <Trash2 size={13} />
            Clear prepared photos from this panel
          </button>
        </div>
        <div className="remote-result-pane">
          <div className={`remote-result ${currentResult ? "has-result" : ""}`}>
            {currentResult ? (
              <>
                <img
                  src={currentResult.url}
                  alt={`AI-generated ${task?.feature === "hair" ? "hairstyle" : "clothing"} preview from Perfect Corp`}
                />
                <span className="remote-generated-label">
                  <Sparkles size={13} />
                  AI-generated preview
                </span>
              </>
            ) : (
              <div className="remote-empty-result">
                {isActive ? (
                  <LoaderCircle size={32} className="spin" />
                ) : feature === "hair" ? (
                  <Scissors size={34} />
                ) : (
                  <Shirt size={34} />
                )}
                <h2>
                  {task?.status === "uploading"
                    ? "Sending your selected images…"
                    : task?.status === "running"
                      ? "Your preview is being created."
                      : task?.status === "error"
                        ? "This generation did not complete."
                        : task?.status === "cancelled"
                          ? "You stopped waiting."
                          : "Your next possibility."}
                </h2>
                <p>
                  {isActive
                    ? "This is a real provider task. Checking its status does not start another paid generation."
                    : (task?.error ??
                      "A genuine generated image will appear here only after an authorized provider task succeeds.")}
                </p>
                {!task && (
                  <span>Prepared locally. Generated only by your choice.</span>
                )}
              </div>
            )}
          </div>
          {task && (
            <div className="remote-task-details">
              <div>
                <span>
                  {task.feature === "hair" ? "Hairstyle" : "Clothing"} task ·{" "}
                  {task.status}
                </span>
                <time>
                  Local expiry {new Date(task.expiresAt).toLocaleTimeString()}
                </time>
              </div>
              {task.error && <p role="status">{task.error}</p>}
              {currentResult && <p>{task.result?.notice}</p>}
              <div className="remote-result-actions">
                {isActive && (
                  <>
                    <button
                      className="button secondary"
                      disabled={!!busy}
                      onClick={() => void checkTask(task.taskId)}
                    >
                      <RefreshCw size={14} />
                      Check existing task
                    </button>
                    <button
                      className="text-action"
                      disabled={!!busy}
                      onClick={() => void stopWaiting()}
                    >
                      <X size={14} />
                      Stop waiting
                    </button>
                  </>
                )}
                {task.status === "success" && !currentResult && (
                  <button
                    className="button secondary"
                    onClick={() => setRetryImage((v) => v + 1)}
                  >
                    Load generated image
                  </button>
                )}
                {currentResult && (
                  <>
                    <button className="button secondary" onClick={download}>
                      <Download size={15} />
                      Download generated image
                    </button>
                    {onUseResult && (
                      <button
                        className="button primary"
                        onClick={() =>
                          onUseResult(currentResult.blob, {
                            kind: "ai-generated",
                            provider: "perfect-corp",
                            feature: task.feature,
                            createdAt:
                              task.result?.receivedAt ??
                              new Date().toISOString(),
                          })
                        }
                      >
                        Use this generated preview <ArrowRight size={15} />
                      </button>
                    )}
                  </>
                )}
                <button
                  className="text-action"
                  disabled={!!busy}
                  onClick={() => void deleteTask()}
                >
                  <Trash2 size={13} />
                  Delete local task and result
                </button>
              </div>
              <p className="fine-print">
                Stopping or deleting here does not cancel provider processing,
                refund credits or delete its copy. Provider retention terms
                still apply.
              </p>
            </div>
          )}
          {recent.length > 0 && (
            <div className="remote-recent">
              <h3>Your temporary tasks</h3>
              <p>
                Resume checking a task without creating another charge. These
                records expire after 15 minutes.
              </p>
              {recent.map((item) => (
                <button
                  key={item.taskId}
                  onClick={() => {
                    setTask(item);
                    setResult(null);
                    setError("");
                    void checkTask(item.taskId);
                  }}
                >
                  <span>
                    {item.feature === "hair"
                      ? "Hairstyle preview"
                      : "Clothing preview"}
                  </span>
                  <small>{item.status}</small>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
