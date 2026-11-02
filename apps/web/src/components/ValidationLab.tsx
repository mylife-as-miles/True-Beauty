import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Camera,
  ImagePlus,
  Play,
  Square,
  FlaskConical,
  CheckCircle2,
  ShieldCheck,
  Upload,
} from "lucide-react";
import {
  useCamera,
  type VisionSnapshot,
} from "../../../../packages/vision-core/src";
import {
  runLocalBenchmark,
  type BenchmarkReport,
} from "../../../../packages/evaluation/src/benchmark";
import {
  binaryMaskMetrics,
  summarizeCoverage,
  type Distribution,
} from "../../../../packages/evaluation/src";
import type { MakeupLook } from "../../../../packages/makeup-engine/src";
import "./ValidationLab.css";

const ms = (value: number | null) =>
  value === null ? "—" : `${value.toFixed(1)} ms`;
export default function ValidationLab({
  portraitUrl = "/images/portrait-neutral.jpg",
  look,
}: {
  portraitUrl?: string;
  look?: MakeupLook;
}) {
  const [sourceUrl, setSourceUrl] = useState(portraitUrl),
    [sourceKind, setSourceKind] = useState<"demo" | "upload" | "camera">(
      "demo",
    ),
    [hair, setHair] = useState(true),
    [hands, setHands] = useState(false),
    [maxSide, setMaxSide] = useState(640),
    [samples, setSamples] = useState(18),
    [quality, setQuality] = useState<"adaptive" | "high">("adaptive"),
    [evidenceKind, setEvidenceKind] =
      useState<BenchmarkReport["evidenceKind"]>("unverified-browser"),
    [groupLabel, setGroupLabel] = useState(""),
    [lightingLabel, setLightingLabel] = useState(""),
    [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0),
    [report, setReport] = useState<BenchmarkReport | null>(null),
    [error, setError] = useState(""),
    [maskFile, setMaskFile] = useState<File | null>(null),
    [confirmMask, setConfirmMask] = useState(false),
    [maskMetrics, setMaskMetrics] = useState<ReturnType<
      typeof binaryMaskMetrics
    > | null>(null),
    [coverage, setCoverage] = useState<ReturnType<
      typeof summarizeCoverage
    > | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    video = useRef<HTMLVideoElement>(null),
    upload = useRef<HTMLInputElement>(null),
    controller = useRef<AbortController | null>(null),
    epoch = useRef(0),
    blobUrl = useRef<string | null>(null),
    lastSnapshot = useRef<VisionSnapshot | null>(null);
  const { stream, error: cameraError, isOpening, open, close } = useCamera();
  useEffect(() => {
    if (video.current) {
      video.current.srcObject = stream;
      if (stream)
        void video.current
          .play()
          .catch(() => setError("Camera playback could not start."));
    }
  }, [stream]);
  useEffect(
    () => () => {
      epoch.current++;
      controller.current?.abort();
      controller.current = null;
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    },
    [],
  );
  useEffect(() => {
    const pause = () => {
      if (document.hidden) {
        controller.current?.abort();
        close();
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [close]);
  useEffect(() => {
    controller.current?.abort();
    epoch.current++;
    lastSnapshot.current = null;
    setSourceUrl(portraitUrl);
    setSourceKind("demo");
    setReport(null);
    setMaskMetrics(null);
    setMaskFile(null);
    setConfirmMask(false);
  }, [portraitUrl]);
  const changeSource = (url: string, kind: "demo" | "upload") => {
    controller.current?.abort();
    epoch.current++;
    close();
    lastSnapshot.current = null;
    if (blobUrl.current) {
      URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    }
    if (kind === "upload") blobUrl.current = url;
    setSourceUrl(url);
    setSourceKind(kind);
    setReport(null);
    setMaskMetrics(null);
    setMaskFile(null);
    setConfirmMask(false);
    setError("");
  };
  const start = async () => {
    if (running) return;
    const signal = new AbortController();
    controller.current = signal;
    const taskEpoch = ++epoch.current;
    setRunning(true);
    setProgress(0);
    setError("");
    setReport(null);
    setMaskMetrics(null);
    setMaskFile(null);
    setConfirmMask(false);
    lastSnapshot.current = null;
    try {
      let source: HTMLImageElement | HTMLVideoElement;
      if (sourceKind === "camera") {
        if (!video.current || video.current.readyState < 2)
          throw new Error(
            "Open the camera and wait for its preview before starting.",
          );
        source = video.current;
      } else {
        const image = new Image();
        image.src = sourceUrl;
        await image.decode();
        source = image;
      }
      if (signal.signal.aborted) return;
      const result = await runLocalBenchmark(source, canvas.current!, {
        sourceKind,
        evidenceKind,
        maxSide,
        samples,
        quality,
        groupLabel,
        lightingLabel,
        look,
        signal: signal.signal,
        features: { face: true, hair, hands },
        onProgress: (n) => {
          if (epoch.current === taskEpoch) setProgress(n);
        },
        onSnapshot: (snapshot) => {
          if (epoch.current === taskEpoch)
            lastSnapshot.current = structuredClone(snapshot);
        },
      });
      if (epoch.current === taskEpoch) setReport(result);
    } catch (err) {
      if (!signal.signal.aborted && epoch.current === taskEpoch)
        setError(
          err instanceof Error
            ? err.message
            : "The local benchmark could not finish.",
        );
    } finally {
      if (controller.current === signal) {
        controller.current = null;
        setRunning(false);
      }
      if (sourceKind === "camera") close();
    }
  };
  const saveReport = () => {
    if (!report) return;
    const json = {
      ...report,
      ...(maskMetrics
        ? {
            hairMaskEvaluation: {
              ...maskMetrics,
              referenceProvenance:
                "User-confirmed same-source binary annotation; not independently verified.",
            },
          }
        : {}),
      ...(coverage ? { cohortCoverage: coverage } : {}),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `true-beauty-evaluation-${Date.now()}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const compareMask = async () => {
    const mask = lastSnapshot.current?.hairMask;
    if (!mask || !maskFile || !confirmMask) {
      setError(
        "Run hair segmentation, choose its matching binary reference mask, and confirm the source pairing.",
      );
      return;
    }
    const comparisonEpoch = epoch.current;
    const url = URL.createObjectURL(maskFile);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const target = document.createElement("canvas");
      target.width = mask.width;
      target.height = mask.height;
      const ctx = target.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, target.width, target.height);
      const rgba = ctx.getImageData(0, 0, target.width, target.height).data,
        reference = new Float32Array(mask.width * mask.height);
      for (let i = 0; i < reference.length; i++)
        reference[i] =
          ((rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / (3 * 255)) *
            (rgba[i * 4 + 3] / 255) >=
          0.5
            ? 1
            : 0;
      if (epoch.current === comparisonEpoch) {
        setMaskMetrics(
          binaryMaskMetrics(mask.confidence ?? mask.data, reference),
        );
        setError("");
      }
    } catch {
      if (epoch.current === comparisonEpoch)
        setError(
          "The reference mask could not be opened. Choose a PNG binary annotation.",
        );
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  const metrics: Array<{ label: string; data: Distribution }> = report
    ? [
        { label: "Inference call", data: report.timings.inferenceCallMs },
        {
          label: "Model-reported latency",
          data: report.timings.modelReportedLatencyMs,
        },
        {
          label: "Canvas render + readback",
          data: report.timings.flushedRenderMs,
        },
        {
          label: "UI animation-frame interval",
          data: report.timings.uiRafIntervalMs,
        },
      ]
    : [];
  return (
    <section className="validation-lab">
      <header className="validation-heading">
        <div>
          <p>Local validation lab</p>
          <h1>
            Your mirror, <em>measured.</em>
          </h1>
          <span>Real measurements. Clear limits. No silent photo storage.</span>
        </div>
        <button
          className="button secondary"
          disabled={!report || running}
          onClick={saveReport}
        >
          <ArrowDownToLine size={16} />
          Export numeric report
        </button>
      </header>
      <div className="validation-layout">
        <div className="validation-source">
          <div className="validation-preview">
            <img
              src={sourceUrl}
              alt={
                sourceKind === "upload"
                  ? "Your local evaluation image"
                  : "Supplied demo portrait for local evaluation"
              }
              hidden={sourceKind === "camera" || !!report || running}
            />
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              hidden={sourceKind !== "camera" || running || !!report}
              aria-label="Local evaluation camera preview"
            />
            <canvas
              ref={canvas}
              width={480}
              height={720}
              hidden={!running && !report}
              aria-label="Actual locally rendered benchmark output"
            />
            <span className="validation-preview-label">
              <FlaskConical size={14} />
              {running
                ? `Measuring ${progress} / ${samples}`
                : report
                  ? `${report.execution.renderer} · ${report.execution.renderResolution.width}×${report.execution.renderResolution.height}`
                  : sourceKind === "camera"
                    ? "Camera stays on this device"
                    : "Local evaluation source"}
            </span>
          </div>
          <div className="validation-source-actions">
            <button
              disabled={running}
              onClick={() => changeSource(portraitUrl, "demo")}
            >
              Demo image
            </button>
            <button disabled={running} onClick={() => upload.current?.click()}>
              <ImagePlus size={15} />
              Upload
            </button>
            <button
              disabled={running || isOpening}
              onClick={() => {
                epoch.current++;
                lastSnapshot.current = null;
                setReport(null);
                setMaskMetrics(null);
                setMaskFile(null);
                setConfirmMask(false);
                setError("");
                setSourceKind("camera");
                void open();
              }}
            >
              <Camera size={15} />
              {isOpening ? "Opening…" : "Camera"}
            </button>
          </div>
          <input
            ref={upload}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            aria-label="Upload local evaluation image"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (
                !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
                f.size > 12 * 1024 * 1024
              ) {
                setError("Choose a JPG, PNG or WebP under 12 MB.");
                return;
              }
              changeSource(URL.createObjectURL(f), "upload");
              e.target.value = "";
            }}
          />
          <p className="validation-privacy">
            <ShieldCheck size={15} />
            Processing stays here. Reports contain timings, device metadata and
            optional labels; no photos, masks or facial coordinates.
          </p>
        </div>
        <div className="validation-controls">
          <h2>Run on this browser.</h2>
          <p>
            A browser viewport does not establish physical-device performance.
            Use this page on a real device to collect its own measurements.
          </p>
          <fieldset disabled={running}>
            <legend>Measured workload</legend>
            <label>
              <input type="checkbox" checked readOnly />
              Shared face model
            </label>
            <label>
              <input
                type="checkbox"
                checked={hair}
                onChange={(e) => setHair(e.target.checked)}
              />
              Hair segmentation
            </label>
            <label>
              <input
                type="checkbox"
                checked={hands}
                onChange={(e) => setHands(e.target.checked)}
              />
              Hand tracking
            </label>
          </fieldset>
          <div className="validation-fields">
            <label>
              Longest edge
              <select
                aria-label="Longest edge"
                value={maxSide}
                disabled={running}
                onChange={(e) => setMaxSide(Number(e.target.value))}
              >
                {[320, 480, 640, 960, 1280].map((n) => (
                  <option key={n} value={n}>
                    {n}px
                  </option>
                ))}
              </select>
            </label>
            <label>
              Measured cycles
              <select
                aria-label="Measured cycles"
                value={samples}
                disabled={running}
                onChange={(e) => setSamples(Number(e.target.value))}
              >
                {[8, 18, 36, 72].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Renderer quality
            <select
              aria-label="Renderer quality"
              value={quality}
              disabled={running}
              onChange={(e) =>
                setQuality(e.target.value as "adaptive" | "high")
              }
            >
              <option value="adaptive">Adaptive</option>
              <option value="high">Enhanced WebGL materials</option>
            </select>
          </label>
          <label>
            Evidence source
            <select
              aria-label="Evidence source"
              value={evidenceKind}
              disabled={running}
              onChange={(e) =>
                setEvidenceKind(
                  e.target.value as BenchmarkReport["evidenceKind"],
                )
              }
            >
              <option value="unverified-browser">
                Unverified browser session
              </option>
              <option value="self-reported-physical-device">
                I am using a physical device (self-reported)
              </option>
              <option value="automated-fixture">
                Automated / emulated fixture
              </option>
            </select>
          </label>
          <details className="validation-annotations">
            <summary>Optional evaluation labels</summary>
            <p>
              Describe your own test conditions. No complexion or clinical
              phototype is inferred from this image.
            </p>
            <label>
              User-described group
              <input
                maxLength={60}
                value={groupLabel}
                onChange={(e) => setGroupLabel(e.target.value)}
                placeholder="Optional, self-described"
                disabled={running}
              />
            </label>
            <label>
              Lighting condition
              <input
                maxLength={60}
                value={lightingLabel}
                onChange={(e) => setLightingLabel(e.target.value)}
                placeholder="e.g. indirect window light"
                disabled={running}
              />
            </label>
          </details>
          <div className="validation-run-actions">
            <button
              className="button primary"
              disabled={running || (sourceKind === "camera" && !stream)}
              onClick={() => void start()}
            >
              <Play size={15} />
              {report ? "Measure again" : "Run local benchmark"}
            </button>
            {running && (
              <button
                className="button secondary"
                onClick={() => {
                  controller.current?.abort();
                  close();
                }}
              >
                <Square size={14} />
                Cancel
              </button>
            )}
          </div>
          {running && (
            <p className="validation-status" role="status">
              Loading models or measuring cycle {progress} of {samples}. Two
              warm-up cycles are reported separately.
            </p>
          )}
          {(error || (sourceKind === "camera" && cameraError)) && (
            <p className="inline-error" role="alert">
              {error || (sourceKind === "camera" ? cameraError : "")}
            </p>
          )}
        </div>
      </div>
      {report && (
        <section
          className="validation-results"
          aria-label="Actual benchmark results"
        >
          <div className="validation-result-heading">
            <div>
              <span role="status" aria-live="polite">
                <CheckCircle2 size={15} />
                {report.status === "completed"
                  ? "Measurement complete"
                  : "Measurement cancelled"}
              </span>
              <h2>Evidence from this run.</h2>
            </div>
            <p>
              {report.execution.uniqueInferenceUpdates} snapshots with new
              predictions. Actual model runs:{" "}
              {Object.entries(report.execution.featureInferenceRuns)
                .filter(([, runs]) => runs > 0)
                .map(([feature, runs]) => `${feature} ${runs}`)
                .join(" · ") || "none"}
              .
            </p>
          </div>
          <div className="validation-table-wrap">
            <table>
              <caption>
                Measured time distributions after two warm-up cycles. Empty
                values mean no observations.
              </caption>
              <thead>
                <tr>
                  <th>Measurement</th>
                  <th>Samples</th>
                  <th>Median</th>
                  <th>95th percentile</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.label}>
                    <th>{m.label}</th>
                    <td>{m.data.count}</td>
                    <td>{ms(m.data.median)}</td>
                    <td>{ms(m.data.p95)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="validation-result-notes">
            <p>
              Model loading: {ms(report.execution.modelLoadMs)}. Actual output:{" "}
              {report.execution.renderResolution.width}×
              {report.execution.renderResolution.height}. UI animation-frame
              timing is <strong>not AR FPS</strong>.
            </p>
            <p>
              Registered landmark displacement:{" "}
              {report.registeredMotion.eyeDistanceUnits.median === null
                ? "insufficient observations"
                : `${report.registeredMotion.eyeDistanceUnits.median.toFixed(6)} eye-distance units`}
              . This is residual motion, not ground-truth tracking accuracy.
            </p>
          </div>
          <details className="validation-reference">
            <summary>Compare an annotated hair mask</summary>
            <p>
              Use a binary PNG of the same source photo: white hair, black
              background. This checks an explicit prediction/reference pair; the
              app cannot independently verify that your annotation is correct.
            </p>
            <label>
              Reference binary mask
              <input
                type="file"
                accept="image/png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setMaskFile(
                    f?.type === "image/png" && f.size <= 12 * 1024 * 1024
                      ? f
                      : null,
                  );
                  setMaskMetrics(null);
                  setConfirmMask(false);
                }}
              />
            </label>
            <label className="validation-check">
              <input
                type="checkbox"
                checked={confirmMask}
                onChange={(e) => setConfirmMask(e.target.checked)}
              />
              I confirm this annotation corresponds to the benchmark source.
            </label>
            <button
              className="button secondary"
              disabled={
                !maskFile || !confirmMask || !lastSnapshot.current?.hairMask
              }
              onClick={() => void compareMask()}
            >
              Measure hair-mask overlap
            </button>
            {maskMetrics && (
              <p role="status">
                IoU{" "}
                {maskMetrics.iou === null
                  ? "undefined (both masks empty)"
                  : maskMetrics.iou.toFixed(4)}{" "}
                · Dice{" "}
                {maskMetrics.dice === null
                  ? "undefined"
                  : maskMetrics.dice.toFixed(4)}
                . Reference quality is user-asserted.
              </p>
            )}
          </details>
        </section>
      )}
      <section className="validation-coverage">
        <div>
          <span>Representative evaluation</span>
          <h2>Coverage before conclusions.</h2>
          <p>
            No representative annotated cohort is bundled. Import numeric
            evaluation samples to inspect group coverage; this tool never awards
            a fairness pass from synthetic fixtures or group averages.
          </p>
        </div>
        <label className="button secondary">
          <Upload size={15} />
          Import numeric evaluation samples
          <input
            type="file"
            hidden
            accept="application/json,.json"
            aria-label="Import numeric evaluation samples"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 2_000_000) {
                setError("Evaluation data must be under2MB.");
                return;
              }
              void f.text().then((text) => {
                try {
                  const parsed = JSON.parse(text);
                  setCoverage(
                    summarizeCoverage(
                      Array.isArray(parsed) ? parsed : parsed.samples,
                    ),
                  );
                  setError("");
                } catch {
                  setError(
                    "Evaluation data must contain validated numeric samples with provenance and grouping labels.",
                  );
                }
              });
              e.target.value = "";
            }}
          />
        </label>
        {coverage && (
          <div className="validation-coverage-results" role="status">
            <strong>
              {coverage.status === "insufficient-ground-truth"
                ? "Insufficient ground truth"
                : "Descriptive coverage only"}
            </strong>
            <p>{coverage.sampleCount} samples. Fairness remains unverified.</p>
            {coverage.groups.map((g) => (
              <p key={g.label}>
                {g.label}: {g.total} samples, {g.annotated} annotated with a
                declared rights basis, {g.synthetic} synthetic.
              </p>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
