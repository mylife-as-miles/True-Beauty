import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowUpRight,
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  ScanFace,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  createVision,
  type VisionEngine,
  useCamera,
  type VisionSnapshot,
} from "../../../../packages/vision-core/src";
import {
  analyzeAppearance,
  assessImageQuality,
  sampleAppearance,
  compareSkinResults,
  type ImageQuality,
  type SkinAnalysisResult,
} from "../../../../packages/skin-engine/src";
import {
  buildRoutine,
  type IntelligenceRoutine,
} from "../../../../packages/beauty-intelligence/src";
import {
  SAMPLE_PRODUCTS,
  formatPrice,
  type Product,
} from "../../../../packages/commerce-engine/src";
import {
  db,
  deleteSkinScan,
  hasConsent,
  localProfileId,
  newId,
  setConsent,
  saveSkinScan,
  type SkinScan,
  type Currency,
} from "../../../../packages/local-database/src";
import { useApp } from "../state/store";
import { SectionTitle } from "./ui";
import "./SkinLab.css";
interface Capabilities {
  skinAnalysis?: {
    configured: boolean;
    paidEnabled: boolean;
    pricingPlanConfigured: boolean;
    status: string;
    allowedActions?: string[];
  };
}
interface Quote {
  quoteId: string;
  credits: number;
  actions: string[];
  expiresAt: string;
}
const concernChoices = [
  "moisture",
  "redness",
  "acne",
  "texture",
  "dark spots",
  "fine lines",
];
const concernLabel = (s: string) =>
  ({
    moisture: "Feels dry",
    redness: "Redness",
    acne: "Breakouts",
    texture: "Texture",
    "dark spots": "Dark spots",
    "fine lines": "Fine lines",
  })[s] ?? s;
export default function SkinLab() {
  const notify = useApp((s) => s.notify),
    setSpace = useApp((s) => s.setSpace),
    sourceUrl = useApp((s) => s.portraitUrl),
    setSourceUrl = useApp((s) => s.setPortraitUrl);
  const sourceName = sourceUrl.startsWith("blob:")
    ? "Your session photo"
    : "Studio portrait";
  const {
    stream: cameraStream,
    error: cameraError,
    isOpening: cameraOpening,
    open: openDeviceCamera,
    close: closeCamera,
  } = useCamera();
  const camera = !!cameraStream;
  const profile = useLiveQuery(() => db.profiles.get(localProfileId));
  const owned = useLiveQuery(() => db.ownedProducts.toArray(), [], []);
  const scans = useLiveQuery(
    () => db.skinScans.orderBy("createdAt").reverse().toArray(),
    [],
    [],
  );
  const [tab, setTab] = useState<"colour" | "care" | "history">("colour");
  const [quality, setQuality] = useState<ImageQuality | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Your image stays on this device."),
    [error, setError] = useState("");
  const [swatches, setSwatches] = useState({
      skin: "#bc9279",
      hair: "#342721",
      eye: "#604435",
    }),
    [sampled, setSampled] = useState(false),
    [corrected, setCorrected] = useState(false),
    [showMap, setShowMap] = useState(false),
    [vision, setVision] = useState<VisionSnapshot | null>(null);
  const [skinType, setSkinType] = useState("Not specified"),
    [concerns, setConcerns] = useState<string[]>([]),
    [budget, setBudget] = useState(20000),
    [currency, setCurrency] = useState<Currency>("NGN"),
    [routine, setRoutine] = useState<IntelligenceRoutine<Product> | null>(null),
    [ownedOnly, setOwnedOnly] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null),
    [remoteConsent, setRemoteConsent] = useState(false),
    [retentionConsent, setRetentionConsent] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [csrf, setCsrf] = useState(""),
    [authorizedCredits, setAuthorizedCredits] = useState(""),
    [remoteResult, setRemoteResult] = useState<SkinAnalysisResult | null>(null),
    [taskId, setTaskId] = useState(""),
    [uploadBytes, setUploadBytes] = useState<{
      base64: string;
      type: "image/jpeg" | "image/png";
    } | null>(null),
    [saveConsent, setSaveConsent] = useState(false),
    [comparison, setComparison] = useState<string[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    pipelineRef = useRef<VisionEngine | null>(null),
    videoRef = useRef<HTMLVideoElement>(null),
    aliveRef = useRef(true),
    sourceEpochRef = useRef(0),
    inspectionIdRef = useRef(0);
  const appearance = useMemo(
    () => (sampled ? analyzeAppearance(swatches) : null),
    [sampled, swatches],
  );
  useEffect(() => {
    if (profile) {
      setSkinType(profile.skinType);
      setConcerns(profile.concerns);
      setBudget(profile.budget);
      setCurrency(profile.currency);
    }
  }, [profile]);
  useEffect(() => {
    aliveRef.current = true;
    const pipeline = createVision();
    pipelineRef.current = pipeline;
    fetch("/api/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (aliveRef.current) setCapabilities(v);
      })
      .catch(() => {});
    return () => {
      aliveRef.current = false;
      pipeline.dispose();
      pipelineRef.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const epoch = ++sourceEpochRef.current;
    imageRef.current = null;
    inspectionIdRef.current++;
    setBusy(false);
    setShowMap(false);
    setSwatches({ skin: "#bc9279", hair: "#342721", eye: "#604435" });
    const oldCanvas = canvasRef.current;
    oldCanvas
      ?.getContext("2d")
      ?.clearRect(0, 0, oldCanvas.width, oldCanvas.height);
    setQuality(null);
    setSampled(false);
    setCorrected(false);
    setVision(null);
    setRemoteResult(null);
    setQuote(null);
    setError("");
    setTaskId("");
    setComparison([]);
    setSaveConsent(false);
    setRemoteConsent(false);
    setRetentionConsent(false);
    setAuthorizedCredits("");
    setUploadBytes(null);
    const img = new Image();
    img.onload = () => {
      if (!active || epoch !== sourceEpochRef.current) return;
      imageRef.current = img;
      const ratio = Math.min(
        1,
        1400 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const c = canvasRef.current;
      if (!c) return;
      c.width = Math.round(img.naturalWidth * ratio);
      c.height = Math.round(img.naturalHeight * ratio);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      setQuality(assessImageQuality(ctx.getImageData(0, 0, c.width, c.height)));
      setStatus(
        "Portrait ready. Read your colours locally or choose your own swatches.",
      );
    };
    img.onerror = () => {
      if (active && epoch === sourceEpochRef.current)
        setError(
          "This image could not be opened. Choose another JPG, PNG or WebP.",
        );
    };
    img.src = sourceUrl;
    if (sourceUrl.startsWith("blob:"))
      void fetch(sourceUrl)
        .then((r) => r.blob())
        .then(async (blob) => {
          if (
            blob.size > 4 * 1024 * 1024 ||
            !["image/jpeg", "image/png"].includes(blob.type)
          )
            return;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (!active || epoch !== sourceEpochRef.current) return;
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          setUploadBytes({
            base64: btoa(binary),
            type: blob.type as "image/jpeg" | "image/png",
          });
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [sourceUrl]);
  useEffect(() => {
    const c = canvasRef.current,
      img = imageRef.current;
    if (!c || !img) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    if (showMap && vision?.landmarks.length) {
      ctx.save();
      ctx.strokeStyle = "#fff5e8";
      ctx.lineWidth = 1.5;
      ctx.fillStyle = "rgba(126,151,125,.16)";
      for (const i of [50, 280, 151]) {
        const p = vision.landmarks[i];
        ctx.beginPath();
        ctx.arc(p.x * c.width, p.y * c.height, c.width * 0.035, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [showMap, vision]);
  const inspectLocal = async () => {
    const img = imageRef.current;
    if (!img || !pipelineRef.current) return;
    const epoch = sourceEpochRef.current,
      inspectionId = ++inspectionIdRef.current;
    setBusy(true);
    setError("");
    setStatus("Reading facial regions on this device…");
    try {
      const snapshot = await pipelineRef.current.analyzeImage(img, {
        face: true,
        hair: true,
      });
      if (
        !aliveRef.current ||
        epoch !== sourceEpochRef.current ||
        img !== imageRef.current ||
        inspectionId !== inspectionIdRef.current
      )
        return;
      setVision(snapshot);
      const c = document.createElement("canvas");
      const ratio = Math.min(
        1,
        1200 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      c.width = Math.round(img.naturalWidth * ratio);
      c.height = Math.round(img.naturalHeight * ratio);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Image processing is unavailable.");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const pixels = ctx.getImageData(0, 0, c.width, c.height);
      const sample = sampleAppearance(
        pixels,
        snapshot.landmarks,
        snapshot.hairMask
          ? {
              data: snapshot.hairMask.data,
              width: snapshot.hairMask.width,
              height: snapshot.hairMask.height,
            }
          : undefined,
      );
      if (!sample.skin)
        throw new Error(
          "No clear face region was found. Use a close, front-facing portrait or choose your swatches manually.",
        );
      setSwatches({
        skin: sample.skin,
        hair: sample.hair ?? swatches.hair,
        eye: sample.eye ?? swatches.eye,
      });
      setSampled(true);
      setCorrected(false);
      setShowMap(true);
      setStatus(
        "Colour sampled from facial regions. Lighting changes the reading; correct any swatch.",
      );
    } catch (e) {
      if (
        aliveRef.current &&
        epoch === sourceEpochRef.current &&
        img === imageRef.current &&
        inspectionId === inspectionIdRef.current
      )
        setError(
          e instanceof Error
            ? e.message
            : "The image could not be analysed locally.",
        );
    } finally {
      if (aliveRef.current && inspectionId === inspectionIdRef.current)
        setBusy(false);
    }
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG or WebP under 12 MB.");
      return;
    }
    sourceEpochRef.current++;
    imageRef.current = null;
    inspectionIdRef.current++;
    closeCamera();
    setUploadBytes(null);
    setSourceUrl(URL.createObjectURL(file));
  };
  useEffect(() => {
    if (cameraError) setError(cameraError);
  }, [cameraError]);
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      void videoRef.current.play().catch(() => {
        setError("The camera stream could not play. Try another image.");
        closeCamera();
      });
    }
  }, [cameraStream, closeCamera]);
  const openCamera = async () => {
    setError("");
    await openDeviceCamera("user");
  };
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const c = document.createElement("canvas");
    const ratio = Math.min(
      1,
      1600 / Math.max(video.videoWidth, video.videoHeight),
    );
    c.width = Math.round(video.videoWidth * ratio);
    c.height = Math.round(video.videoHeight * ratio);
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    c.toBlob(
      (blob) => {
        if (blob && aliveRef.current)
          void upload(new File([blob], "portrait.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };
  const saveProfile = async () => {
    try {
      await db.profiles.update(localProfileId, {
        skinType,
        concerns,
        budget,
        currency,
        updatedAt: Date.now(),
      });
      notify("Your self-reported preferences were saved locally.");
    } catch {
      setError(
        "Your profile could not be saved. Check available browser storage.",
      );
    }
  };
  const createRoutine = () => {
    setRoutine(
      buildRoutine({ skinType, concerns, budget, currency }, SAMPLE_PRODUCTS, {
        ownedIds: owned.map((p) => p.productId),
        ownedOnly,
        budget,
        currency,
      }),
    );
  };
  const saveRoutine = async () => {
    if (!routine) return;
    try {
      const now = Date.now();
      await db.routines.bulkPut(
        (["AM", "PM"] as const).map((period) => ({
          id: newId(),
          name: period === "AM" ? "My morning ritual" : "My evening ritual",
          period,
          steps: routine[period === "AM" ? "am" : "pm"].map((s) => ({
            id: newId(),
            name: s.product?.name ?? s.slot,
            productId: s.product?.id,
            reason: s.why,
          })),
          createdAt: now,
          updatedAt: now,
        })),
      );
      notify("Morning and evening routines saved to your journal.");
    } catch {
      setError("Routine could not be saved.");
    }
  };
  const requestQuote = async () => {
    setBusy(true);
    setError("");
    try {
      const session = await fetch("/api/session").then((r) => r.json());
      setCsrf(session.csrfToken);
      const actions = capabilities?.skinAnalysis?.allowedActions ?? [
        "texture",
        "pore",
        "redness",
        "moisture",
      ];
      const res = await fetch("/api/skin/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ actions }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          body.error ?? "A verified provider quote is unavailable.",
        );
      setQuote(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The provider is unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const submitRemote = async () => {
    if (
      !quote ||
      !uploadBytes ||
      !remoteConsent ||
      !retentionConsent ||
      Number(authorizedCredits) < quote.credits
    )
      return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/skin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          imageBase64: uploadBytes.base64,
          contentType: uploadBytes.type,
          actions: quote.actions,
          maxCredits: Number(authorizedCredits),
          consent: {
            uploadImage: true,
            externalProcessing: true,
            providerRetentionAcknowledged: true,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? "The provider could not start the task.");
      setTaskId(body.taskId);
      setStatus(
        "Provider task started. Checking status never starts a new paid task.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Provider request failed.");
    } finally {
      setBusy(false);
    }
  };
  const checkTask = async () => {
    if (!taskId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/skin/tasks/" + encodeURIComponent(taskId));
      const body = await res.json();
      if (!res.ok || body.status === "error")
        throw new Error(body.error ?? "Provider task failed.");
      if (body.status === "success") {
        setRemoteResult(body.result);
        setStatus("Provider observations received. No history has been saved.");
      } else
        setStatus(
          "The provider is still processing. Check again after 10 seconds.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status unavailable.");
    } finally {
      setBusy(false);
    }
  };
  const saveObservation = async () => {
    if (!saveConsent || (!appearance && !remoteResult)) return;
    try {
      if (!(await hasConsent("analysis.history")))
        await setConsent("analysis.history", true);
      await saveSkinScan({
        id: newId(),
        createdAt: Date.now(),
        provider: remoteResult ? "perfect-corp" : "local-pixel-colour",
        observations: remoteResult?.observations ?? [
          {
            kind: corrected ? "user-corrected-colour" : "local-pixel-colour",
            ...swatches,
            season: appearance?.season,
          },
        ],
        ...(remoteResult ? { result: remoteResult } : {}),
        ...(appearance ? { appearance } : {}),
        note: "No photograph stored. Colour comparisons are lighting-sensitive and do not establish clinical change.",
      });
      notify("Observation saved locally. Your photograph was not stored.");
      setSaveConsent(false);
    } catch {
      setError("The observation could not be saved. Check browser storage.");
    }
  };
  const compareHistory = (scan: SkinScan) => {
    const latest = scans.find((s) => s.id !== scan.id);
    if (!latest) {
      setComparison([
        "Save another observation to compare. Match lighting and framing for a more useful comparison.",
      ]);
      return;
    }
    if (scan.result && latest.result) {
      const rows = compareSkinResults(
        scan.result as SkinAnalysisResult,
        latest.result as SkinAnalysisResult,
      );
      setComparison(
        rows.length
          ? rows.map(
              (r) =>
                `${r.concern}${r.region ? " · " + r.region : ""}: ${r.before.toFixed(1)} → ${r.after.toFixed(1)} raw model score. ${r.note}`,
            )
          : ["No comparable raw provider fields are available."],
      );
    } else
      setComparison([
        "These local colour observations record photo swatches only. They do not measure skin health. Compare your saved swatches and use the same lighting for future captures.",
      ]);
  };
  return (
    <section className="skin-lab">
      <SectionTitle
        overline="A closer look, with care"
        title="Skin, understood."
      >
        <button className="text-action" onClick={() => setSpace("studio")}>
          Back to your mirror <ArrowUpRight size={16} />
        </button>
      </SectionTitle>
      <div className="skin-layout">
        <section className="skin-portrait-pane" aria-label="Skin portrait">
          <div className="skin-portrait">
            <canvas
              ref={canvasRef}
              data-portrait-source={sourceUrl}
              aria-label="Your portrait; local sampling regions can be shown"
            />
            {camera && (
              <div className="skin-camera">
                <video ref={videoRef} playsInline muted autoPlay />
                <button className="button" onClick={capture}>
                  <Camera size={16} />
                  Capture portrait
                </button>
                <button
                  className="skin-camera-close"
                  onClick={() => {
                    closeCamera();
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            <span className="skin-image-label">
              {sourceName} ·{" "}
              {showMap ? "Colour sampling regions" : "Unretouched image"}
            </span>
            <button
              className="skin-map-button"
              aria-pressed={showMap}
              onClick={() => setShowMap((v) => !v)}
              disabled={!vision?.landmarks.length}
            >
              <ScanFace size={16} />
              {showMap ? "Hide regions" : "Show regions"}
            </button>
          </div>
          <div className="skin-source">
            <button onClick={() => void openCamera()} disabled={cameraOpening}>
              <Camera size={16} />
              {cameraOpening ? "Opening camera…" : "Camera"}
            </button>
            <button onClick={() => fileRef.current?.click()}>
              <ImagePlus size={16} />
              Upload portrait
            </button>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </div>
          <p className="skin-private">
            <ShieldCheck size={15} />
            Your image is processed locally unless you explicitly choose
            provider analysis.
          </p>
          {quality && (
            <details className="skin-checks">
              <summary>
                Portrait checks{" "}
                <span>
                  {quality.suitable
                    ? "Ready for local exploration"
                    : `${quality.issues.length} capture tips`}
                </span>
              </summary>
              <p>These checks evaluate image pixels, not your skin.</p>
              <ul>
                {quality.issues.length ? (
                  quality.issues.map((t) => <li key={t}>{t}</li>)
                ) : (
                  <li>
                    Image size, exposure and sharpness pass the basic local
                    checks.
                  </li>
                )}
              </ul>
              <p>
                For a provider scan: face forward, remove makeup and glasses
                when comfortable, and let your face fill most of the frame.
              </p>
            </details>
          )}
        </section>
        <section className="skin-details">
          <div className="skin-tabs" role="group" aria-label="Skin Lab spaces">
            {(["colour", "care", "history"] as const).map((t) => (
              <button
                aria-pressed={tab === t}
                key={t}
                onClick={() => setTab(t)}
              >
                {t === "colour"
                  ? "Your colours"
                  : t === "care"
                    ? "Skin & care"
                    : "Your history"}
              </button>
            ))}
          </div>
          {tab === "colour" && (
            <div className="skin-tab-content">
              <div className="skin-intro">
                <span className="skin-kicker">Personal colour studio</span>
                <h2>
                  A palette that feels
                  <br />
                  like you.
                </h2>
                <p>
                  Explore the colours in your portrait. Your light, your camera,
                  your preferences all matter.
                </p>
              </div>
              <button
                className="button skin-primary"
                onClick={() => void inspectLocal()}
                disabled={busy || !quality}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ScanFace size={17} />
                )}{" "}
                {busy ? "Reading your portrait…" : "Read my colours locally"}
              </button>
              <p role="status" className="skin-status">
                {status}
              </p>
              <div className="skin-swatch-inputs">
                {(["skin", "hair", "eye"] as const).map((type) => (
                  <label key={type}>
                    <input
                      type="color"
                      aria-label={`Correct ${type} colour`}
                      value={swatches[type]}
                      onChange={(e) => {
                        inspectionIdRef.current++;
                        setBusy(false);
                        setSwatches({ ...swatches, [type]: e.target.value });
                        setSampled(true);
                        setCorrected(true);
                      }}
                    />
                    <span>
                      {type === "eye"
                        ? "Eyes"
                        : type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                    <small>{swatches[type]}</small>
                  </label>
                ))}
              </div>
              {!sampled && (
                <p className="skin-note">
                  Swatches are starting examples until you read your portrait or
                  choose your own.
                </p>
              )}
              {appearance && (
                <div className="skin-palette">
                  <div>
                    <span className="skin-kicker">
                      {corrected
                        ? "Your corrected swatches"
                        : "Photo-based colour suggestion"}
                    </span>
                    <h3>{appearance.seasonLabel}</h3>
                    <p>
                      {appearance.headline}. A styling direction to explore,
                      never a rule.
                    </p>
                  </div>
                  <div className="skin-palette-colours">
                    {appearance.palette.map((c) => (
                      <button
                        key={c.hex}
                        style={{ backgroundColor: c.hex }}
                        aria-label={`Try ${c.name} in your mirror`}
                        title={c.name}
                        onClick={() => {
                          useApp
                            .getState()
                            .patchLayer("lipstick", {
                              color: c.hex,
                              enabled: true,
                            });
                          notify(
                            `${c.name} applied to the mirror. Preview colours are an artistic interpretation.`,
                          );
                        }}
                      />
                    ))}
                  </div>
                  <div className="skin-confidence">
                    <span>Heuristic confidence</span>
                    <strong>
                      {Math.round(
                        (appearance.analysis?.confidence ?? 0.4) * 100,
                      )}
                      %
                    </strong>
                  </div>
                  <p className="skin-note">
                    This is a rule-based styling heuristic adapted from MIROIR.
                    Confidence is not a validated probability. No clinical skin
                    type or phototype is inferred.
                  </p>
                  <details>
                    <summary>What informed this palette?</summary>
                    {appearance.analysis?.reasoning.map((s) => (
                      <p key={s}>{s}</p>
                    ))}
                  </details>
                </div>
              )}
            </div>
          )}
          {tab === "care" && (
            <div className="skin-tab-content">
              <div className="skin-intro">
                <span className="skin-kicker">Your voice comes first</span>
                <h2>Care, made personal.</h2>
                <p>
                  Tell us how your skin feels. A photograph cannot reliably
                  establish skin type or hydration.
                </p>
              </div>
              <label className="skin-field">
                Your skin type, as you describe it
                <select
                  value={skinType}
                  onChange={(e) => setSkinType(e.target.value)}
                >
                  {[
                    "Not specified",
                    "normal",
                    "dry",
                    "oily",
                    "combination",
                    "sensitive",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <fieldset className="skin-concerns">
                <legend>What would you like to focus on?</legend>
                {concernChoices.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={concerns.includes(c)}
                      onChange={() =>
                        setConcerns((v) =>
                          v.includes(c) ? v.filter((x) => x !== c) : [...v, c],
                        )
                      }
                    />
                    {concernLabel(c)}
                  </label>
                ))}
              </fieldset>
              <label className="skin-field">
                Budget currency
                <select
                  aria-label="Budget currency"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value as Currency);
                    setRoutine(null);
                  }}
                >
                  {(["NGN", "USD", "GBP", "EUR"] as const).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="skin-field">
                Routine budget · {currency}
                <input
                  aria-label={`Routine budget in ${currency}`}
                  type="number"
                  min="0"
                  max="10000000"
                  value={budget}
                  onChange={(e) =>
                    setBudget(
                      Math.min(
                        10000000,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    )
                  }
                />
              </label>
              <div className="skin-actions">
                <button
                  className="button secondary"
                  onClick={() => void saveProfile()}
                >
                  Save my preferences
                </button>
                <button className="button" onClick={createRoutine}>
                  Build my routine <ArrowUpRight size={15} />
                </button>
              </div>
              <label className="skin-checkbox">
                <input
                  type="checkbox"
                  checked={ownedOnly}
                  onChange={(e) => setOwnedOnly(e.target.checked)}
                />
                Only use products I own
              </label>
              {routine && (
                <div className="skin-routine">
                  <div className="skin-routine-header">
                    <h3>Your daily ritual</h3>
                    <span>
                      {routine.am.concat(routine.pm).some((s) => s.product)
                        ? formatPrice(
                            routine.total,
                            routine.currency as Currency,
                          )
                        : `No ${routine.currency} catalogue prices selected`}{" "}
                      <small>
                        {routine.am.concat(routine.pm).some((s) => s.product)
                          ? "sample total · no exchange conversion"
                          : "Add priced or owned products to assemble this routine"}
                      </small>
                    </span>
                  </div>
                  {(["am", "pm"] as const).map((period) => (
                    <div className="skin-routine-period" key={period}>
                      <h4>{period === "am" ? "Morning" : "Evening"}</h4>
                      {routine[period].map((step, i) => (
                        <div className="skin-routine-step" key={step.slot}>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{step.product?.name ?? step.slot}</strong>
                            <p>{step.why}</p>
                            <small>{step.usage}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <p className="skin-note">
                    Sample catalogue and prices. These are cosmetic suggestions
                    based on your self-reported preferences, not diagnosis or
                    proof of efficacy. Verify current product labels.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => void saveRoutine()}
                  >
                    Save both routines
                  </button>
                </div>
              )}
              <div className="skin-provider">
                <div>
                  <ShieldCheck size={19} />
                  <h3>Provider skin analysis</h3>
                </div>
                <p>
                  {capabilities?.skinAnalysis?.status ===
                  "requires-verified-quote"
                    ? "A connected provider can estimate cosmetic concerns. Review the exact credit quote and upload consent first."
                    : "Not connected. Genuine concern scores need a configured Perfect Corp account and a verified cost plan. No scan results are simulated."}
                </p>
                <p className="skin-note">
                  Local colour sampling remains available. No photo is
                  transmitted by opening this panel.
                </p>
                {capabilities?.skinAnalysis?.status ===
                  "requires-verified-quote" && (
                  <>
                    <p>
                      Upload your own JPEG or PNG under 4 MB. Studio portraits
                      are excluded from provider submission.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => void requestQuote()}
                      disabled={busy || !uploadBytes}
                    >
                      Get a credit quote
                    </button>
                    {quote && (
                      <div className="skin-quote">
                        <p>
                          Quote:{" "}
                          <strong>{quote.credits} provider credits</strong>.
                          Expires{" "}
                          {new Date(quote.expiresAt).toLocaleTimeString()}.
                        </p>
                        <label className="skin-checkbox">
                          <input
                            type="checkbox"
                            checked={remoteConsent}
                            onChange={(e) => setRemoteConsent(e.target.checked)}
                          />
                          I consent to sending this portrait to Perfect Corp for
                          these cosmetic observations.
                        </label>
                        <label className="skin-checkbox">
                          <input
                            type="checkbox"
                            checked={retentionConsent}
                            onChange={(e) =>
                              setRetentionConsent(e.target.checked)
                            }
                          />
                          I understand the provider processes the image remotely
                          and documents up to 24-hour task result retention.
                        </label>
                        <label className="skin-field">
                          Maximum credits I authorize
                          <input
                            type="number"
                            min="0"
                            value={authorizedCredits}
                            onChange={(e) =>
                              setAuthorizedCredits(e.target.value)
                            }
                          />
                        </label>
                        <button
                          className="button"
                          disabled={
                            busy ||
                            !remoteConsent ||
                            !retentionConsent ||
                            Number(authorizedCredits) < quote.credits
                          }
                          onClick={() => void submitRemote()}
                        >
                          Authorize and send portrait
                        </button>
                      </div>
                    )}
                    {taskId && !remoteResult && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void checkTask()}
                      >
                        Check existing task status
                      </button>
                    )}
                  </>
                )}
                {remoteResult && (
                  <div className="skin-observations">
                    <h4>Genuine provider observations</h4>
                    {remoteResult.observations.map((o) => (
                      <div key={o.id}>
                        <strong>
                          {o.label}
                          {o.region ? " · " + o.region : ""}
                        </strong>
                        <span>
                          {o.uiScore === undefined
                            ? "Display score unavailable"
                            : `${o.uiScore} / 100 display score`}
                        </span>
                        <small>
                          {o.rawScore === undefined
                            ? "Raw model score unavailable"
                            : `Raw model score: ${o.rawScore.toFixed(1)}`}
                        </small>
                        {o.skinType && <span>{o.skinType}</span>}
                      </div>
                    ))}
                    {remoteResult.limitations.map((s) => (
                      <p className="skin-note" key={s}>
                        {s}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "history" && (
            <div className="skin-tab-content">
              <div className="skin-intro">
                <span className="skin-kicker">Observations over time</span>
                <h2>
                  Notice. Reflect.
                  <br />
                  Keep what matters.
                </h2>
                <p>
                  History is yours to save and remove. Match your lighting and
                  framing for useful comparisons.
                </p>
              </div>
              {scans.length === 0 ? (
                <div className="skin-history-empty">
                  <ScanFace size={32} />
                  <h3>Your history starts with your choice.</h3>
                  <p>
                    Read your colours, then explicitly save an observation.
                    Photographs are never saved here.
                  </p>
                  <button
                    className="text-action"
                    onClick={() => setTab("colour")}
                  >
                    Explore your colours <ArrowUpRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="skin-history-list">
                  {scans.map((s) => (
                    <article key={s.id}>
                      <div>
                        <time>
                          {new Date(s.createdAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </time>
                        <h3>
                          {s.provider === "perfect-corp"
                            ? "Provider cosmetic observations"
                            : "Colour observation"}
                        </h3>
                        <p>
                          {s.provider === "perfect-corp"
                            ? "Provider predictions · no photo stored"
                            : "Photo swatches or your corrections · no skin health scores"}
                        </p>
                        {s.appearance ? (
                          <div className="skin-history-swatches">
                            {["skin", "hair", "eye"].map((k) => {
                              const value = (s.appearance as { hex?: string })
                                .hex;
                              if (k !== "skin" || !value) return null;
                              return (
                                <span
                                  key={k}
                                  style={{ backgroundColor: value }}
                                  title="Saved skin-colour swatch"
                                />
                              );
                            })}
                            <span>
                              {
                                (s.appearance as { seasonLabel?: string })
                                  .seasonLabel
                              }
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <button
                          className="text-action"
                          onClick={() => compareHistory(s)}
                        >
                          Compare
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete observation from ${new Date(s.createdAt).toLocaleDateString()}`}
                          onClick={() =>
                            void deleteSkinScan(s.id).then(() =>
                              notify("Observation deleted locally."),
                            )
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {comparison.length > 0 && (
                <div className="skin-comparison" role="status">
                  {comparison.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {(appearance || remoteResult) && tab !== "history" && (
            <div className="skin-save">
              <label className="skin-checkbox">
                <input
                  type="checkbox"
                  checked={saveConsent}
                  onChange={(e) => setSaveConsent(e.target.checked)}
                />
                Save this observation to my local history. No photograph.
              </label>
              <button
                className="button secondary"
                disabled={!saveConsent}
                onClick={() => void saveObservation()}
              >
                <Check size={15} />
                Save observation
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
