import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  RefreshCw,
  ScanLine,
  Sparkles,
} from "lucide-react";
import {
  analyzeInspiration,
  correctRemixRegion,
  type RemixResult,
  type RemixRegion,
  type RegionCorrection,
} from "../../../../packages/look-remix/src";
import { BeautyRenderer } from "../../../../packages/ar-renderer/src";
import {
  createDefaultLook,
  MAKEUP_LAYERS,
  type MakeupLook,
} from "../../../../packages/makeup-engine/src";
import {
  createVision,
  type VisionEngine,
  type VisionSnapshot,
} from "../../../../packages/vision-core/src";
import "./LookRemix.css";

export interface LookRemixProps {
  referenceImageFile?: File;
  portraitUrl: string;
  /** undefined permits one standalone target analysis; null waits for shared target geometry. */
  targetSnapshot?: VisionSnapshot | null;
  onApply: (look: MakeupLook) => void;
  onReturnToMirror: () => void;
  onResult?: (result: RemixResult) => void;
}
const REGIONS: RemixRegion[] = [
  "lipstick",
  "eyeshadow",
  "blush",
  "hair",
  "skin",
];
const DEMOS = [
  {
    url: "/images/portrait-2.jpg",
    name: "A softer mood",
    credit: "Unsplash reference portrait",
  },
  {
    url: "/images/portrait-3.jpg",
    name: "Warm & understated",
    credit: "Unsplash reference portrait",
  },
];
const originalLook = () => {
  const look = createDefaultLook();
  for (const key of MAKEUP_LAYERS) look[key].enabled = false;
  return look;
};
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(url)) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error(
          "This image could not be decoded. Choose a JPEG, PNG, WebP or AVIF photo.",
        ),
      );
    image.src = url;
  });
}

/** Source pixels remain in this session. The target portrait is never replaced by inspiration. */
export default function LookRemix({
  referenceImageFile,
  portraitUrl,
  targetSnapshot,
  onApply,
  onReturnToMirror,
  onResult,
}: LookRemixProps) {
  const titleId = useId(),
    uploadId = useId(),
    generation = useRef(0),
    abort = useRef<AbortController | null>(null),
    fileUrl = useRef<string | null>(null),
    input = useRef<HTMLInputElement>(null),
    targetCanvas = useRef<HTMLCanvasElement>(null),
    targetStage = useRef<HTMLDivElement>(null),
    detailCanvas = useRef<HTMLCanvasElement>(null),
    detailPanel = useRef<HTMLDivElement>(null);
  const [sourceUrl, setSourceUrl] = useState(DEMOS[0].url),
    [sourceName, setSourceName] = useState(DEMOS[0].name),
    [isUpload, setIsUpload] = useState(false),
    [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null),
    [targetImage, setTargetImage] = useState<HTMLImageElement | null>(null),
    [targetGeometry, setTargetGeometry] = useState<VisionSnapshot | null>(null),
    [targetNotice, setTargetNotice] = useState("Preparing your portrait…");
  const [result, setResult] = useState<RemixResult | null>(null),
    [selected, setSelected] = useState<RemixRegion>("lipstick"),
    [phase, setPhase] = useState<"idle" | "analyzing" | "ready" | "error">(
      "idle",
    ),
    [error, setError] = useState(""),
    [applied, setApplied] = useState(false),
    [compare, setCompare] = useState(false),
    [split, setSplit] = useState(0.5),
    [detailPinned, setDetailPinned] = useState(false);
  const resultCallback = useRef(onResult);
  resultCallback.current = onResult;
  const chooseFile = (file: File) => {
    if (!/^image\/(jpeg|png|webp|avif)$/i.test(file.type)) {
      setError("Choose a JPEG, PNG, WebP or AVIF photograph.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a photograph smaller than 20 MB.");
      return;
    }
    abort.current?.abort();
    generation.current++;
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = URL.createObjectURL(file);
    setSourceUrl(fileUrl.current);
    setSourceName(file.name);
    setIsUpload(true);
    setResult(null);
    setPhase("idle");
    setError("");
    setApplied(false);
  };
  const fileHandler = useRef(chooseFile);
  fileHandler.current = chooseFile;
  useEffect(() => {
    const stage = targetStage.current;
    if (!stage || !result) {
      setDetailPinned(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        setDetailPinned(entry.boundingClientRect.bottom <= 12);
      },
      { rootMargin: "-12px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [result !== null]);
  useEffect(() => {
    if (referenceImageFile) fileHandler.current(referenceImageFile);
  }, [referenceImageFile]);
  useEffect(
    () => () => {
      abort.current?.abort();
      generation.current++;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    },
    [],
  );
  useEffect(() => {
    let alive = true;
    setSourceImage(null);
    loadImage(sourceUrl)
      .then((image) => {
        if (alive) setSourceImage(image);
      })
      .catch((cause) => {
        if (alive) {
          setError(cause.message);
          setPhase("error");
        }
      });
    return () => {
      alive = false;
    };
  }, [sourceUrl]);
  useEffect(() => {
    let alive = true;
    setTargetImage(null);
    setTargetGeometry(null);
    setTargetNotice("Preparing your portrait…");
    loadImage(portraitUrl)
      .then((image) => {
        if (alive) setTargetImage(image);
      })
      .catch(() => {
        if (alive)
          setTargetNotice(
            "Your portrait could not be opened. Choose another in the mirror.",
          );
      });
    return () => {
      alive = false;
    };
  }, [portraitUrl]);
  useEffect(() => {
    if (!targetImage) return;
    let alive = true;
    let engine: VisionEngine | undefined;
    setTargetGeometry(null);
    setTargetNotice("Preparing aligned preview…");
    if (targetSnapshot === null) return;
    const prepare = async () => {
      try {
        let geometry = targetSnapshot;
        if (geometry === undefined) {
          engine = createVision({ inferenceMaxSide: 640, hairMaxSide: 256 });
          geometry = await engine.analyzeImage(targetImage, {
            face: true,
            hair: true,
            hands: true,
          });
        }
        if (!alive) return;
        setTargetGeometry(geometry);
        setTargetNotice(
          geometry.landmarks.length
            ? "Aligned cosmetic interpretation · original skin texture"
            : "Original portrait shown. A clear face is needed for aligned makeup.",
        );
      } catch {
        if (alive)
          setTargetNotice(
            "Original portrait shown. Local face tracking is unavailable.",
          );
      } finally {
        engine?.dispose();
      }
    };
    void prepare();
    return () => {
      alive = false;
      engine?.dispose();
    };
  }, [targetImage, targetSnapshot]);
  useEffect(() => {
    const canvas = targetCanvas.current;
    if (!canvas || !targetImage) return;
    let renderer: BeautyRenderer | undefined;
    try {
      renderer = new BeautyRenderer(canvas, {
        maxSide: 1000,
        forceCanvas: true,
      });
      renderer.render({
        source: targetImage,
        landmarks: targetGeometry?.landmarks ?? [],
        hairMask: targetGeometry?.hairMask,
        hands: targetGeometry?.hands,
        look: result?.look ?? originalLook(),
        beforeAfter: compare ? split : null,
        time: 0,
      });
      canvas.dataset.rendered = targetGeometry?.landmarks.length
        ? "aligned"
        : "original";
      canvas.dataset.sourceUrl = portraitUrl;
      const detail = detailCanvas.current;
      if (detail) {
        // Copy the actual composed output. The small view never starts a renderer or model.
        let x = 0,
          y = 0,
          width = canvas.width,
          height = canvas.height;
        const landmarks = targetGeometry?.landmarks;
        if (landmarks && landmarks.length >= 468) {
          const left = Math.min(landmarks[234].x, landmarks[454].x),
            right = Math.max(landmarks[234].x, landmarks[454].x),
            top = Math.min(landmarks[10].y, landmarks[152].y),
            bottom = Math.max(landmarks[10].y, landmarks[152].y),
            faceWidth = right - left,
            faceHeight = bottom - top;
          if (
            [left, right, top, bottom].every(Number.isFinite) &&
            faceWidth > 0 &&
            faceHeight > 0
          ) {
            const x1 = Math.max(
                0,
                Math.min(
                  canvas.width,
                  (left - faceWidth * 0.55) * canvas.width,
                ),
              ),
              y1 = Math.max(
                0,
                Math.min(
                  canvas.height,
                  (top - faceHeight * 0.6) * canvas.height,
                ),
              ),
              x2 = Math.max(
                0,
                Math.min(
                  canvas.width,
                  (right + faceWidth * 0.55) * canvas.width,
                ),
              ),
              y2 = Math.max(
                0,
                Math.min(
                  canvas.height,
                  (bottom + faceHeight * 0.2) * canvas.height,
                ),
              );
            if (x2 > x1 && y2 > y1) {
              x = x1;
              y = y1;
              width = x2 - x1;
              height = y2 - y1;
            }
          }
        }
        const scale = Math.min(1, 240 / Math.max(width, height));
        detail.width = Math.max(1, Math.round(width * scale));
        detail.height = Math.max(1, Math.round(height * scale));
        detail
          .getContext("2d", { alpha: false })
          ?.drawImage(
            canvas,
            x,
            y,
            width,
            height,
            0,
            0,
            detail.width,
            detail.height,
          );
        detail.dataset.rendered = canvas.dataset.rendered;
        detail.dataset.sourceUrl = portraitUrl;
      }
    } catch {
      setTargetNotice(
        "Original portrait shown. The preview renderer is unavailable.",
      );
      canvas.dataset.rendered = "unavailable";
    } finally {
      renderer?.dispose();
    }
  }, [targetImage, targetGeometry, result, compare, split, portraitUrl]);

  function returnToFullPreview() {
    targetCanvas.current?.focus({ preventScroll: true });
    targetStage.current?.scrollIntoView({
      block: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  async function analyze() {
    if (!sourceImage) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const run = ++generation.current;
    setPhase("analyzing");
    setError("");
    setApplied(false);
    setResult(null);
    try {
      const next = await analyzeInspiration(sourceImage, {
        sourceName,
        signal: controller.signal,
      });
      if (run !== generation.current) return;
      setResult(next);
      setPhase("ready");
      setSelected(next.faceDetected ? "lipstick" : "hair");
      resultCallback.current?.(next);
    } catch (cause) {
      if (run !== generation.current || controller.signal.aborted) return;
      setPhase("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Local analysis could not finish. Choose another image and try again.",
      );
    }
  }
  function selectDemo(index: number) {
    abort.current?.abort();
    generation.current++;
    if (fileUrl.current) {
      URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = null;
    }
    setSourceUrl(DEMOS[index].url);
    setSourceName(DEMOS[index].name);
    setIsUpload(false);
    setResult(null);
    setPhase("idle");
    setApplied(false);
    setError("");
  }
  function correct(patch: RegionCorrection) {
    if (!result) return;
    const next = correctRemixRegion(result, selected, patch);
    setResult(next);
    setApplied(false);
    resultCallback.current?.(next);
  }
  const paletteTarget = selected === "skin" ? "lipstick" : selected;
  const sample = result?.regions[selected],
    canApply = Boolean(
      (result &&
        (["lipstick", "eyeshadow", "blush"] as const).some(
          (key) => result.look[key].enabled,
        )) ||
      result?.look.hair.enabled,
    );
  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) chooseFile(file);
    event.target.value = "";
  };
  return (
    <section
      className="look-remix"
      aria-labelledby={titleId}
      data-remix-phase={phase}
    >
      <header className="remix-heading">
        <div>
          <span className="eyebrow">The art of interpretation</span>
          <h1 id={titleId}>A mood. Made yours.</h1>
          <p>
            Follow the colour in a reference, then find its expression on you.
          </p>
        </div>
        <button className="remix-mirror-link" onClick={onReturnToMirror}>
          Back to your mirror <ArrowUpRight size={17} />
        </button>
      </header>
      <div className="remix-workbench">
        <section className="remix-study" aria-label="Inspiration source">
          <div className="remix-study-label">
            <span>01 / The reference</span>
            <span>{isUpload ? "Session photo" : "Demo portrait"}</span>
          </div>
          <div className="remix-photo-stage remix-source-stage">
            {sourceImage && (
              <div
                className="remix-source-image"
                style={{
                  aspectRatio: `${sourceImage.naturalWidth} / ${sourceImage.naturalHeight}`,
                  width: `min(100%, calc(var(--remix-stage-height) * ${sourceImage.naturalWidth / sourceImage.naturalHeight}))`,
                }}
              >
                <img
                  src={sourceUrl}
                  alt={`Inspiration reference: ${sourceName}`}
                />
                {result &&
                  sample?.bounds.map((box, index) => (
                    <button
                      key={index}
                      className="remix-sample-bound"
                      aria-label={`Inspect ${sample.label.toLowerCase()} sample ${index + 1}`}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.width * 100}%`,
                        height: `${box.height * 100}%`,
                      }}
                      onClick={() =>
                        document.getElementById(`${titleId}-inspector`)?.focus()
                      }
                    >
                      <span>{sample.label}</span>
                    </button>
                  ))}
              </div>
            )}
            {phase === "analyzing" && (
              <div className="remix-analyzing" role="status">
                <ScanLine size={24} />
                <span>Reading regions & colour…</span>
                <small>Face, hair and hands · processed on this device</small>
              </div>
            )}
            {!sourceImage && (
              <span className="remix-image-loading">Opening reference…</span>
            )}
          </div>
          <div className="remix-source-caption">
            <div>
              <strong>{sourceName}</strong>
              <span>
                {isUpload
                  ? "Not saved. Not uploaded."
                  : "Unsplash · demo image, not a calibrated colour reference"}
              </span>
            </div>
            <button
              className="remix-upload-button"
              onClick={() => input.current?.click()}
              aria-label="Upload an inspiration photograph"
            >
              <ImagePlus size={19} />
            </button>
          </div>
          <input
            ref={input}
            id={uploadId}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            onChange={handleUpload}
            aria-label="Inspiration photograph"
          />
          <div className="remix-source-actions">
            <div
              className="remix-demo-choices"
              role="group"
              aria-label="Demo inspiration portraits"
            >
              {DEMOS.map((demo, index) => (
                <button
                  key={demo.url}
                  className={sourceUrl === demo.url ? "selected" : ""}
                  onClick={() => selectDemo(index)}
                  aria-label={`Use ${demo.name.toLowerCase()} reference`}
                  aria-pressed={sourceUrl === demo.url}
                >
                  <img src={demo.url} alt="" />
                </button>
              ))}
            </div>
            <button
              className="button primary remix-analyze-button"
              disabled={!sourceImage || phase === "analyzing"}
              onClick={() => void analyze()}
            >
              {phase === "analyzing" ? (
                <LoaderCircle className="remix-spin" size={17} />
              ) : result ? (
                <RefreshCw size={16} />
              ) : (
                <ScanLine size={17} />
              )}{" "}
              {phase === "analyzing"
                ? "Interpreting…"
                : result
                  ? "Read reference again"
                  : "Interpret this reference"}
            </button>
          </div>
        </section>
        <div className="remix-transfer-mark" aria-hidden="true">
          <span />
          <ArrowRight size={22} />
          <span />
        </div>
        <section
          className="remix-study remix-target-study"
          aria-label="Your editable interpretation"
        >
          <div className="remix-study-label">
            <span>02 / Your expression</span>
            <span>{result ? "Editable interpretation" : "Your portrait"}</span>
          </div>
          <div
            ref={targetStage}
            className="remix-photo-stage remix-target-stage"
          >
            <div
              className="remix-target-content"
              style={
                targetImage
                  ? {
                      aspectRatio: `${targetImage.naturalWidth} / ${targetImage.naturalHeight}`,
                      width: `min(100%, calc(var(--remix-stage-height) * ${targetImage.naturalWidth / targetImage.naturalHeight}))`,
                    }
                  : { width: "100%", height: "100%" }
              }
            >
              {targetImage && (
                <img
                  className="remix-target-original"
                  src={portraitUrl}
                  alt="Your unchanged target portrait"
                />
              )}
              <canvas
                ref={targetCanvas}
                tabIndex={-1}
                role="img"
                aria-label="Image-derived makeup preview on your portrait"
              />
              {compare && (
                <div
                  className="remix-compare-line"
                  style={{ left: `${split * 100}%` }}
                  aria-hidden="true"
                >
                  <span>Original</span>
                  <span>Interpretation</span>
                </div>
              )}
            </div>
            {!result && (
              <div className="remix-target-note">
                <Sparkles size={18} />
                <span>Bring a colour story into your mirror.</span>
              </div>
            )}
          </div>
          <div className="remix-target-caption">
            <p role="status">{targetNotice}</p>
            {result && (
              <label className="remix-compare-toggle">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />{" "}
                Compare
              </label>
            )}
          </div>
          {compare && (
            <label className="remix-split-control">
              Original{" "}
              <input
                type="range"
                min="0"
                max="100"
                value={split * 100}
                onChange={(event) => setSplit(Number(event.target.value) / 100)}
                aria-label="Original and interpretation split"
              />{" "}
              Interpretation
            </label>
          )}
        </section>
      </div>
      {error && (
        <p role="alert" className="remix-error">
          {error}
        </p>
      )}
      {result ? (
        <div
          className="remix-interpretation"
          onFocusCapture={(event) => {
            if (
              !detailPinned ||
              !matchMedia("(max-width: 760px)").matches ||
              detailPanel.current?.contains(event.target)
            )
              return;
            const panel = detailPanel.current?.getBoundingClientRect(),
              focused = event.target.getBoundingClientRect();
            if (panel && focused.top < panel.bottom + 12)
              window.scrollBy({
                top: focused.top - panel.bottom - 16,
                behavior: "instant",
              });
          }}
        >
          <div
            ref={detailPanel}
            className={`remix-detail-preview ${detailPinned ? "is-pinned" : ""}`}
            role="region"
            aria-label="Persistent target preview"
            data-pinned={detailPinned}
          >
            <canvas
              ref={detailCanvas}
              role="img"
              aria-label="Current editable target detail"
            />
            <div className="remix-detail-controls">
              <span>Your expression</span>
              <strong>{sample?.label ?? "Colour"} in focus</strong>
              <small>
                {selected === "hair" && !targetGeometry?.hairMask
                  ? "Original hair · mask unavailable"
                  : targetGeometry?.landmarks.length
                    ? "Aligned colour preview"
                    : "Original portrait · no face tracking"}
              </small>
              <button
                type="button"
                className="remix-detail-expand"
                onClick={returnToFullPreview}
              >
                Full preview <Maximize2 size={14} />
              </button>
              <label className="remix-detail-compare">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />{" "}
                Before & after
              </label>
              {compare && (
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={split * 100}
                  onChange={(event) =>
                    setSplit(Number(event.target.value) / 100)
                  }
                  aria-label="Detail comparison split"
                />
              )}
            </div>
          </div>
          <div className="remix-result-heading">
            <div>
              <span className="eyebrow">
                A starting point, never a prescription
              </span>
              <h2>
                {result.faceDetected
                  ? "The colours we found."
                  : "A palette, without a face."}
              </h2>
              <p>
                {result.faceDetected
                  ? "Select a region. Refine its shade, finish and presence."
                  : "No usable face was detected. Facial layers stay off; add a colour yourself or choose a clearer portrait."}
              </p>
            </div>
            <span className="remix-method">
              Local pixel interpretation
              <br />
              Heuristic · not generative AI
            </span>
          </div>
          <div
            className="remix-region-tabs"
            role="group"
            aria-label="Sampled image regions"
          >
            {REGIONS.map((key) => {
              const region = result.regions[key];
              return (
                <button
                  key={key}
                  className={key === selected ? "selected" : ""}
                  aria-pressed={key === selected}
                  onClick={() => setSelected(key)}
                >
                  <span
                    className={`remix-region-swatch ${!region.color ? "unavailable" : ""}`}
                    style={
                      region.color
                        ? { backgroundColor: region.color }
                        : undefined
                    }
                  />
                  <span>
                    <strong>{region.label}</strong>
                    <small>
                      {region.source === "unavailable"
                        ? "Not sampled"
                        : region.source === "user-correction"
                          ? "Your correction"
                          : `${region.pixelCount.toLocaleString()} pixels`}
                    </small>
                  </span>
                  {region.enabled && key !== "skin" && (
                    <Check size={14} aria-label="Layer enabled" />
                  )}
                </button>
              );
            })}
          </div>
          {sample && (
            <div
              className="remix-inspector"
              role="region"
              id={`${titleId}-inspector`}
              tabIndex={-1}
              aria-label={`${sample.label} colour inspector`}
            >
              <div className="remix-inspector-title">
                <span
                  className={`remix-large-swatch ${!sample.color ? "unavailable" : ""}`}
                  style={
                    sample.color ? { backgroundColor: sample.color } : undefined
                  }
                />
                <div>
                  <h3>{sample.label}, reimagined.</h3>
                  <p>
                    {sample.source === "user-correction"
                      ? `Your choice${sample.measuredColor ? ` · measured ${sample.measuredColor.toUpperCase()}` : " · no measured colour"}`
                      : sample.color
                        ? `${sample.color.toUpperCase()} · ${Math.round(sample.confidence * 100)}/100 sample quality`
                        : "No reliable colour was sampled here."}
                  </p>
                  <small>
                    Quality is a heuristic indicator, not a probability.
                  </small>
                </div>
              </div>
              <div className="remix-edit-controls">
                <label className="remix-color-control">
                  {sample.color ? "Refine shade" : "Add your own shade"}
                  <input
                    type="color"
                    value={sample.color ?? "#a45356"}
                    aria-label={`${sample.label} colour correction`}
                    onChange={(event) =>
                      correct({
                        color: event.target.value,
                        ...(!sample.color
                          ? { enabled: selected !== "skin", opacity: 0.4 }
                          : {}),
                      })
                    }
                  />
                </label>
                {selected !== "skin" && (
                  <>
                    <label className="remix-enable-control">
                      <input
                        type="checkbox"
                        checked={sample.enabled}
                        disabled={!sample.color}
                        onChange={(event) =>
                          correct({ enabled: event.target.checked })
                        }
                      />{" "}
                      Include {sample.label.toLowerCase()}
                    </label>
                    <label className="remix-opacity-control">
                      Presence{" "}
                      <input
                        type="range"
                        aria-label={`${sample.label} presence`}
                        min="0"
                        max="100"
                        disabled={!sample.color}
                        value={sample.opacity * 100}
                        onChange={(event) =>
                          correct({ opacity: Number(event.target.value) / 100 })
                        }
                      />
                      <output>{Math.round(sample.opacity * 100)}%</output>
                    </label>
                    {selected !== "hair" && (
                      <label className="remix-finish-control">
                        Finish{" "}
                        <select
                          aria-label={`${sample.label} finish`}
                          value={sample.finish}
                          disabled={!sample.color}
                          onChange={(event) =>
                            correct({
                              finish: event.target
                                .value as RegionCorrection["finish"],
                            })
                          }
                        >
                          <option value="matte">Matte</option>
                          <option value="gloss">Gloss</option>
                          <option value="shimmer">Shimmer</option>
                          <option value="glitter">Glitter</option>
                        </select>
                      </label>
                    )}
                  </>
                )}
              </div>
              {selected === "skin" && (
                <p className="remix-inspector-note">
                  A colour reference for interpreting contrast. Your complexion
                  is preserved; this swatch does not become foundation.
                </p>
              )}
              {sample.warnings.length > 0 && (
                <ul className="remix-region-warnings">
                  {sample.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="remix-bottom-row">
            <div className="remix-palette">
              <span>
                {result.paletteScope === "whole-image"
                  ? "Whole-image palette"
                  : "Lower-image colour story"}
              </span>
              <div>
                {result.palette.map((swatch, index) => (
                  <button
                    key={`${swatch.color}-${index}`}
                    style={{ backgroundColor: swatch.color }}
                    onClick={() => {
                      setSelected(paletteTarget);
                      const next = correctRemixRegion(result, paletteTarget, {
                        color: swatch.color,
                        enabled: true,
                        opacity: 0.55,
                      });
                      setResult(next);
                      setApplied(false);
                      resultCallback.current?.(next);
                    }}
                    aria-label={`Use palette colour ${swatch.color} for ${result.regions[paletteTarget].label.toLowerCase()}`}
                    title={`${swatch.color.toUpperCase()} · ${Math.round(swatch.fraction * 100)}% of sampled crop`}
                  />
                ))}
              </div>
              <small>
                {result.paletteScope === "whole-image"
                  ? `Apply to ${result.regions[paletteTarget].label.toLowerCase()}. Includes surroundings; choose deliberately.`
                  : `Apply to ${result.regions[paletteTarget].label.toLowerCase()}. Spatial crop, not garment segmentation.`}
              </small>
            </div>
            <div className="remix-apply">
              <span role="status">
                {applied
                  ? "Your interpretation is in the mirror."
                  : "Your portrait stays yours. Adjustments stay editable."}
              </span>
              <button
                className="button primary"
                disabled={!canApply}
                onClick={() => {
                  if (result) {
                    onApply(result.look);
                    setApplied(true);
                  }
                }}
              >
                {applied ? <Check size={17} /> : <Sparkles size={17} />}{" "}
                {applied
                  ? "Applied to your mirror"
                  : "Apply this interpretation"}
              </button>
              {applied && (
                <button
                  className="remix-return-action"
                  onClick={onReturnToMirror}
                >
                  See it in my mirror <ArrowUpRight size={16} />
                </button>
              )}
            </div>
          </div>
          <details className="remix-evidence">
            <summary>How this interpretation was made</summary>
            <p>
              The reference was decoded and analysed on this device. Actual face
              landmarks locate the lip ring, upper eyelids and cheeks; segmented
              hair is sampled separately. Bright clipped pixels and detected
              hand areas are excluded. Colours describe this photograph,
              including its lighting and natural features.
            </p>
            <ul>
              {[...result.quality.warnings, ...result.warnings].map(
                (warning) => (
                  <li key={warning}>{warning}</li>
                ),
              )}
            </ul>
            <p>
              No source image, facial geometry or result is saved by this
              workspace. Applying changes updates the current mirror scene. Save
              a look separately if you choose. Material guesses are approximate;
              hairstyle and garment generation are separate capabilities.
            </p>
          </details>
        </div>
      ) : (
        <div className="remix-introduction">
          <span className="remix-small-mark" aria-hidden="true">
            ✳
          </span>
          <p>
            Borrow a mood.
            <br />
            <em>Keep your own face.</em>
          </p>
          <div>
            <strong>A local, editable colour study.</strong>
            <span>
              Actual image regions, not a preset match. Lighting and natural
              features influence every sample. Review each shade before
              applying.
            </span>
          </div>
        </div>
      )}
      <footer className="remix-privacy-note">
        Your inspiration stays on this device, in this session. No account. No
        photo upload. Demo portraits: Unsplash; subject rights review remains
        required before public launch.
      </footer>
    </section>
  );
}
