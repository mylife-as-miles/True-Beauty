import {
  createVision,
  getGraphicsCapabilities,
  type Feature,
  type VisionSnapshot,
} from "../../vision-core/src";
import { BeautyRenderer } from "../../ar-renderer/src";
import {
  createDefaultLook,
  MAKEUP_LAYERS,
  type MakeupLook,
} from "../../makeup-engine/src";
import {
  registeredLandmarkMotion,
  predictionRunDelta,
  summarize,
  type Distribution,
  type Point,
} from "./index";

export interface BenchmarkReport {
  format: "true-beauty-local-evaluation";
  version: 1;
  createdAt: string;
  status: "completed" | "cancelled";
  sourceKind: "demo" | "upload" | "camera";
  evidenceKind:
    | "unverified-browser"
    | "self-reported-physical-device"
    | "automated-fixture";
  metadata: {
    userAgent: string;
    platform: string;
    logicalProcessors: number | null;
    devicePixelRatio: number;
    viewport: { width: number; height: number };
    graphics: ReturnType<typeof getGraphicsCapabilities>;
    gpuRenderer: string | null;
  };
  parameters: {
    requestedMaxSide: number;
    inferenceMaxSide: number;
    hairInputMaxSide: number;
    makeupLayers: string[];
    accessories: string[];
    hairRecolouring: boolean;
    inferencePolicy: "image-full-batch" | "video-adaptive-scheduler";
    features: string[];
    requestedSamples: number;
    warmupSamples: number;
    quality: "adaptive" | "high";
    groupLabel?: string;
    lightingLabel?: string;
  };
  execution: {
    modelLoadMs: number;
    elapsedMs: number;
    measuredElapsedMs: number;
    iterations: number;
    uniqueInferenceUpdates: number;
    featureInferenceRuns: Record<string, number>;
    featureRunsPerSecond: Record<string, number>;
    schedulerCounterResets: number;
    faceDetections: number;
    hairMasks: number;
    handsDetected: number;
    analysisCyclesPerSecond: number | null;
    renderer: string;
    renderResolution: { width: number; height: number; maxSide: number };
  };
  timings: {
    inferenceCallMs: Distribution;
    modelReportedLatencyMs: Distribution;
    flushedRenderMs: Distribution;
    uiRafIntervalMs: Distribution;
    warmupInferenceCallMs: Distribution;
  };
  registeredMotion: ReturnType<typeof registeredLandmarkMotion>;
  accuracy: { status: "unverified-no-ground-truth"; fairnessValidated: false };
  limitations: string[];
}
export interface BenchmarkOptions {
  sourceKind: BenchmarkReport["sourceKind"];
  evidenceKind?: BenchmarkReport["evidenceKind"];
  maxSide?: number;
  samples?: number;
  warmupSamples?: number;
  features?: Partial<Record<Feature, boolean>>;
  quality?: "adaptive" | "high";
  groupLabel?: string;
  lightingLabel?: string;
  signal?: AbortSignal;
  look?: MakeupLook;
  onProgress?: (completed: number, total: number) => void;
  onSnapshot?: (snapshot: VisionSnapshot) => void;
}
function abortError() {
  return new DOMException("Benchmark cancelled.", "AbortError");
}
async function nextFrame(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      cancelAnimationFrame(id);
      reject(abortError());
    };
    const id = requestAnimationFrame(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    });
    signal?.addEventListener("abort", abort, { once: true });
  });
}
/** Runs real local inference/rendering. It neither uploads nor persists source images or geometry. */
export async function runLocalBenchmark(
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  canvas: HTMLCanvasElement,
  options: BenchmarkOptions,
): Promise<BenchmarkReport> {
  const maxSide = Math.round(
      Math.max(320, Math.min(1280, options.maxSide ?? 640)),
    ),
    samples = Math.round(Math.max(4, Math.min(120, options.samples ?? 18))),
    warmupSamples = Math.round(
      Math.max(0, Math.min(5, options.warmupSamples ?? 2)),
    );
  const features = { face: true, ...options.features },
    quality = options.quality ?? "adaptive",
    look = options.look ?? createDefaultLook();
  let previousRuns: Record<string, number> | undefined;
  const featureRuns: Record<string, number> = {};
  let counterResets = 0;
  const engine = createVision({
      inferenceMaxSide: Math.min(maxSide, 960),
      hairMaxSide: Math.min(maxSide, 256),
    }),
    renderer = new BeautyRenderer(canvas, { maxSide });
  renderer.setQuality(quality);
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    engine.dispose();
  }, 45000);
  const onAbort = () => engine.dispose();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const calls: number[] = [],
    latencies: number[] = [],
    renders: number[] = [],
    raf: number[] = [],
    warmups: number[] = [],
    landmarks: Point[][] = [];
  let measuredStart: number | null = null,
    measuring = false;
  let alive = true,
    lastRaf = 0,
    rafId = 0,
    iterations = 0,
    unique = 0,
    faces = 0,
    hair = 0,
    hands = 0,
    lastCount = 0,
    loadMs = 0,
    start = performance.now(),
    cancelled = false;
  const uiClock = (time: number) => {
    if (!alive) return;
    if (lastRaf && measuring) raf.push(time - lastRaf);
    lastRaf = time;
    rafId = requestAnimationFrame(uiClock);
  };
  const metadata = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    logicalProcessors: navigator.hardwareConcurrency || null,
    devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
    graphics: getGraphicsCapabilities(),
    gpuRenderer: renderer.gpuRenderer ?? null,
  };
  let activeMode = renderer.activeMode,
    resolution = renderer.renderResolution;
  try {
    const loadStart = performance.now();
    await engine.load(features);
    loadMs = performance.now() - loadStart;
    if (options.signal?.aborted) throw abortError();
    start = performance.now();
    rafId = requestAnimationFrame(uiClock);
    for (let i = 0; i < samples + warmupSamples; i++) {
      if (options.signal?.aborted) throw abortError();
      await nextFrame(options.signal);
      if (i === warmupSamples) {
        measuredStart = performance.now();
        measuring = true;
      }
      const t = performance.now();
      const snapshot =
        source instanceof HTMLVideoElement
          ? await engine.analyzeVideo(source, t, features)
          : await engine.analyzeImage(source, features);
      const duration = performance.now() - t;
      if (options.signal?.aborted) throw abortError();
      const batchNew = snapshot.inferenceCount > lastCount;
      const scheduled = snapshot.scheduler?.runs;
      const delta =
        source instanceof HTMLVideoElement && scheduled
          ? predictionRunDelta(previousRuns, scheduled)
          : {
              runs: Object.fromEntries(
                Object.entries(features)
                  .filter(
                    ([key, enabled]) =>
                      enabled && !(key === "hair" && features.body),
                  )
                  .map(([key]) => [key, batchNew ? 1 : 0]),
              ),
              total: batchNew ? 1 : 0,
              reset: false,
            };
      if (scheduled) previousRuns = { ...scheduled };
      const isNew = delta.total > 0;
      lastCount = snapshot.inferenceCount;
      const renderStart = performance.now();
      renderer.render({
        source,
        landmarks: snapshot.landmarks,
        hairMask: snapshot.hairMask,
        hands: snapshot.hands,
        look,
        time: t,
      });
      // Explicit readback bounds the canvas output work; it is not a display-present timestamp.
      canvas.getContext("2d")!.getImageData(0, 0, 1, 1);
      const renderMs = performance.now() - renderStart;
      options.onSnapshot?.(snapshot);
      if (i < warmupSamples) {
        warmups.push(duration);
        continue;
      }
      iterations++;
      for (const [key, count] of Object.entries(delta.runs))
        featureRuns[key] = (featureRuns[key] ?? 0) + count;
      if (delta.reset) counterResets++;
      calls.push(duration);
      renders.push(renderMs);
      if (isNew) {
        unique++;
        latencies.push(snapshot.latencyMs);
        if (snapshot.landmarks.length) {
          faces++;
          landmarks.push(snapshot.landmarks.map((p) => ({ x: p.x, y: p.y })));
        }
        if (snapshot.hairMask) hair++;
        hands += snapshot.hands.length;
      }
      options.onProgress?.(iterations, samples);
    }
  } catch (error) {
    if (timedOut)
      throw new Error(
        "The benchmark exceeded its 45-second bound. Reduce cycles or resolution and try again.",
      );
    if (
      options.signal?.aborted ||
      (error instanceof DOMException && error.name === "AbortError")
    )
      cancelled = true;
    else throw error;
  } finally {
    alive = false;
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
    cancelAnimationFrame(rafId);
    activeMode = renderer.activeMode;
    resolution = renderer.renderResolution;
    engine.dispose();
    renderer.dispose();
  }
  const finished = performance.now(),
    elapsedMs = finished - start,
    measuredElapsedMs = measuredStart === null ? 0 : finished - measuredStart;
  return {
    format: "true-beauty-local-evaluation",
    version: 1,
    createdAt: new Date().toISOString(),
    status: cancelled ? "cancelled" : "completed",
    sourceKind: options.sourceKind,
    evidenceKind: options.evidenceKind ?? "unverified-browser",
    metadata,
    parameters: {
      requestedMaxSide: maxSide,
      inferenceMaxSide: Math.min(maxSide, 960),
      hairInputMaxSide: Math.min(maxSide, 256),
      makeupLayers: MAKEUP_LAYERS.filter((key) => look[key].enabled),
      accessories: Object.entries(look.accessories)
        .filter(([, value]) => value)
        .map(([key]) => key),
      hairRecolouring: look.hair.enabled,
      inferencePolicy:
        source instanceof HTMLVideoElement
          ? "video-adaptive-scheduler"
          : "image-full-batch",
      features: Object.entries(features)
        .filter(([, enabled]) => enabled)
        .map(([key]) => key),
      requestedSamples: samples,
      warmupSamples,
      quality,
      ...(options.groupLabel?.trim()
        ? { groupLabel: options.groupLabel.trim().slice(0, 60) }
        : {}),
      ...(options.lightingLabel?.trim()
        ? { lightingLabel: options.lightingLabel.trim().slice(0, 60) }
        : {}),
    },
    execution: {
      modelLoadMs: loadMs,
      elapsedMs,
      measuredElapsedMs,
      iterations,
      uniqueInferenceUpdates: unique,
      featureInferenceRuns: featureRuns,
      featureRunsPerSecond: Object.fromEntries(
        Object.entries(featureRuns).map(([key, count]) => [
          key,
          measuredElapsedMs > 0 ? count / (measuredElapsedMs / 1000) : 0,
        ]),
      ),
      schedulerCounterResets: counterResets,
      faceDetections: faces,
      hairMasks: hair,
      handsDetected: hands,
      analysisCyclesPerSecond:
        measuredElapsedMs > 0 && unique
          ? unique / (measuredElapsedMs / 1000)
          : null,
      renderer: activeMode,
      renderResolution: resolution,
    },
    timings: {
      inferenceCallMs: summarize(calls),
      modelReportedLatencyMs: summarize(latencies),
      flushedRenderMs: summarize(renders),
      uiRafIntervalMs: summarize(raf),
      warmupInferenceCallMs: summarize(warmups),
    },
    registeredMotion: registeredLandmarkMotion(landmarks),
    accuracy: {
      status: "unverified-no-ground-truth",
      fairnessValidated: false,
    },
    limitations: [
      "Measurements describe this browser session and selected source. A desktop viewport is not physical mobile-device evidence.",
      "Device class is unverified or self-reported; GPU renderer strings can be privacy-masked.",
      "Analysis cycles/s excludes model loading/warm-up but includes serial model/render/scheduling work. It is not display FPS or unique per-model inference rate.",
      "Flushed canvas rendering is not screen presentation or thermal/sustained-performance validation.",
      "Face/hair/hand counts describe update snapshots containing geometry, not fresh runs of each model. VIDEO prediction counts use actual scheduler run deltas; IMAGE calls execute the selected full batch.",
      "A supplied still image is not camera-motion accuracy. Registered residual motion has no ground-truth accuracy interpretation.",
      "No representative labelled-person cohort is supplied; fairness remains unverified.",
      "The report contains numeric metadata only. No photo, mask array, facial embedding or raw landmark is exported.",
    ],
  };
}
