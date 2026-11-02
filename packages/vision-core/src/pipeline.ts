import {
  contextualVisionError,
  getGraphicsCapabilities,
  graphicsError,
} from "./capabilities";
import { SerialTaskQueue } from "./taskQueue";
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  ImageSegmenter,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type {
  FaceLandmarkerResult,
  HandLandmarkerResult,
  ImageSegmenterResult,
  PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { LandmarkSmoother, type Landmark } from "../../face-tracking/src";
import { HairMaskSmoother, type HairMask } from "../../hair-segmentation/src";
import { GestureTracker, type Gesture } from "../../hand-tracking/src";
import { InferenceScheduler } from "./scheduler";
import {
  decodeBodyMasks,
  BodyMaskSmoother,
  type BodySegmentation,
} from "../../body-segmentation/src";
import { PoseSmoother, type PoseFrame } from "../../pose-tracking/src";
export type { Landmark, HairMask, Gesture, BodySegmentation, PoseFrame };
export type CoreFeature = "face" | "hair" | "hands";
export type Feature = CoreFeature | "body" | "pose";
export type VisionStatus = Record<CoreFeature, FeatureStatus> &
  Partial<Record<"body" | "pose", FeatureStatus>>;
export interface FeatureStatus {
  state: "idle" | "loading" | "ready" | "error";
  error?: string;
}
export interface TrackedHand {
  landmarks: Landmark[];
  handedness: string;
  confidence: number;
  gesture: Gesture;
}
export interface VisionSnapshot {
  landmarks: Landmark[];
  blendshapes: Record<string, number>;
  transform: number[] | null;
  hairMask: HairMask | null;
  hands: TrackedHand[];
  timestamp: number;
  latencyMs: number;
  inferenceCount: number;
  status: VisionStatus;
  bodyMask?: BodySegmentation | null;
  pose?: PoseFrame | null;
  scheduler?: ReturnType<InferenceScheduler["getMetrics"]>;
}
export interface VisionOptions {
  wasmPath?: string;
  modelPath?: string;
  delegate?: "CPU" | "GPU";
  faceHz?: number;
  hairHz?: number;
  handsHz?: number;
  inferenceMaxSide?: number;
  hairMaxSide?: number;
  bodyHz?: number;
  poseHz?: number;
  bodyMaxSide?: number;
}
type ImageSource =
  HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;
const initialStatus = (): VisionStatus => ({
  face: { state: "idle" },
  hair: { state: "idle" },
  hands: { state: "idle" },
  body: { state: "idle" },
  pose: { state: "idle" },
});

/**
 * A coordinated Tasks Vision scheduler, adapted from Virtual Makeup's
 * useMediaPipeVision/useMakeupRenderer model lifecycle and duplicate-video gate.
 * One face model is shared by every effect. Hair/hands have independent cadence.
 * Models and WASM are local, downloaded by scripts/fetch-models.mjs.
 * No frame, facial identity or image is persisted or transmitted by this class.
 */
export class VisionPipeline {
  private face: FaceLandmarker | null = null;
  private hair: ImageSegmenter | null = null;
  private hand: HandLandmarker | null = null;
  private body: ImageSegmenter | null = null;
  private pose: PoseLandmarker | null = null;
  private optionalRetryAfter = new Map<Feature, number>();
  private bodySmoother = new BodyMaskSmoother();
  private poseSmoother = new PoseSmoother();
  private readonly options: Required<VisionOptions>;
  private fileset: Awaited<
    ReturnType<typeof FilesetResolver.forVisionTasks>
  > | null = null;
  private readonly loads = new Map<Feature, Promise<void>>();
  private readonly frameCanvases = new Map<
    number,
    HTMLCanvasElement | OffscreenCanvas
  >();
  private mode: "IMAGE" | "VIDEO" = "IMAGE";
  private disposed = false;
  private busy = false;
  private imageQueue = new SerialTaskQueue();
  private pendingImages = 0;
  private idleWaiters: Array<() => void> = [];
  private waitUntilIdle() {
    return this.busy
      ? new Promise<void>((resolve) => this.idleWaiters.push(resolve))
      : Promise.resolve();
  }
  private release() {
    this.busy = false;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
  private lastVideoTime = -1;
  private readonly scheduler: InferenceScheduler;
  private readonly faceSmoother = new LandmarkSmoother();
  private readonly hairSmoother = new HairMaskSmoother();
  private readonly handSmoothers = [
    new LandmarkSmoother(),
    new LandmarkSmoother(),
  ];
  private previousHandLabels: string[] = [];
  private readonly gestureTrackers = [
    new GestureTracker(),
    new GestureTracker(),
  ];
  private snapshot: VisionSnapshot = {
    landmarks: [],
    blendshapes: {},
    transform: null,
    hairMask: null,
    hands: [],
    timestamp: 0,
    latencyMs: 0,
    inferenceCount: 0,
    status: initialStatus(),
  };
  constructor(options: VisionOptions = {}) {
    this.options = {
      wasmPath: "/wasm",
      modelPath: "/models",
      delegate: "CPU",
      faceHz: 24,
      hairHz: 8,
      handsHz: 15,
      inferenceMaxSide: 640,
      hairMaxSide: 256,
      bodyMaxSide: 256,
      bodyHz: 4,
      poseHz: 8,
      ...options,
    };
    this.scheduler = new InferenceScheduler({
      face: this.options.faceHz,
      hair: this.options.hairHz,
      hands: this.options.handsHz,
      body: this.options.bodyHz,
      pose: this.options.poseHz,
    });
  }
  getSnapshot() {
    return this.snapshot;
  }
  get isBusy() {
    return this.busy;
  }
  async load(
    features: Partial<Record<Feature, boolean>> = { face: true },
  ): Promise<void> {
    if (this.disposed) throw new Error("Vision pipeline has been disposed");
    if (typeof document !== "undefined" && !getGraphicsCapabilities().webgl)
      throw graphicsError();
    this.fileset ??= await FilesetResolver.forVisionTasks(
      this.options.wasmPath,
      typeof document === "undefined",
    );
    for (const feature of ["face", "body", "pose", "hair", "hands"] as const) {
      if (!features[feature]) continue;
      if (feature === "hair" && features.body && this.body) {
        this.snapshot.status.hair = { state: "ready" };
        continue;
      }
      if (
        (feature === "body" || feature === "pose") &&
        performance.now() < (this.optionalRetryAfter.get(feature) ?? 0)
      )
        continue;
      let promise = this.loads.get(feature);
      if (!promise) {
        promise = this.loadFeature(feature);
        this.loads.set(feature, promise);
      }
      try {
        await promise;
      } catch (error) {
        if (feature === "body" || feature === "pose") {
          this.optionalRetryAfter.set(feature, performance.now() + 30000);
          continue;
        }
        throw error;
      }
    }
  }
  private async loadFeature(feature: Feature) {
    this.snapshot.status[feature] = { state: "loading" };
    try {
      const file = {
        face: "face_landmarker.task",
        hair: "hair_segmenter.tflite",
        hands: "hand_landmarker.task",
        body: "selfie_multiclass_256x256.tflite",
        pose: "pose_landmarker_lite.task",
      }[feature];
      const modelAssetPath = `${this.options.modelPath}/${file}`;
      const baseOptions = { modelAssetPath, delegate: this.options.delegate };
      // A main-thread fallback must use the HTML canvas when worker/offscreen GL is unavailable.
      const canvas =
        typeof document !== "undefined"
          ? document.createElement("canvas")
          : undefined;
      if (!this.fileset) throw new Error("WASM runtime not initialized");
      if (feature === "face") {
        const model = await FaceLandmarker.createFromOptions(this.fileset, {
          baseOptions,
          canvas,
          runningMode: this.mode,
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        if (this.disposed) {
          model.close();
          return;
        }
        this.face = model;
      } else if (feature === "hair") {
        const model = await ImageSegmenter.createFromOptions(this.fileset, {
          baseOptions,
          canvas,
          runningMode: this.mode,
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        if (this.disposed) {
          model.close();
          return;
        }
        this.hair = model;
      } else if (feature === "body") {
        const model = await ImageSegmenter.createFromOptions(this.fileset, {
          baseOptions,
          canvas,
          runningMode: this.mode,
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
        if (this.disposed) {
          model.close();
          return;
        }
        this.body = model;
      } else if (feature === "pose") {
        const model = await PoseLandmarker.createFromOptions(this.fileset, {
          baseOptions,
          canvas,
          runningMode: this.mode,
          numPoses: 1,
          outputSegmentationMasks: false,
          minPoseDetectionConfidence: 0.55,
          minPosePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
        if (this.disposed) {
          model.close();
          return;
        }
        this.pose = model;
      } else {
        const model = await HandLandmarker.createFromOptions(this.fileset, {
          baseOptions,
          canvas,
          runningMode: this.mode,
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
        if (this.disposed) {
          model.close();
          return;
        }
        this.hand = model;
      }
      this.snapshot.status[feature] = { state: "ready" };
    } catch (error) {
      const explained = contextualVisionError(
        error,
        feature === "hair"
          ? "Hair segmentation"
          : feature === "face"
            ? "Face tracking"
            : feature === "body"
              ? "Person segmentation"
              : feature === "pose"
                ? "Pose tracking"
                : "Hand tracking",
      );
      this.snapshot.status[feature] = {
        state: "error",
        error: explained.message,
      };
      this.loads.delete(feature);
      throw explained;
    }
  }
  private async setMode(mode: "IMAGE" | "VIDEO") {
    if (mode === this.mode) return;
    if (this.face) await this.face.setOptions({ runningMode: mode });
    if (this.hair) await this.hair.setOptions({ runningMode: mode });
    if (this.hand) await this.hand.setOptions({ runningMode: mode });
    if (this.body) await this.body.setOptions({ runningMode: mode });
    if (this.pose) await this.pose.setOptions({ runningMode: mode });
    this.mode = mode;
    this.resetTracking();
  }
  analyzeImage(
    image: ImageSource,
    features: Partial<Record<Feature, boolean>> = { face: true },
  ): Promise<VisionSnapshot> {
    this.pendingImages++;
    return this.imageQueue
      .enqueue(() => this.runImage(image, features))
      .finally(() => {
        this.pendingImages--;
      });
  }
  private async runImage(
    image: ImageSource,
    features: Partial<Record<Feature, boolean>>,
  ): Promise<VisionSnapshot> {
    await this.waitUntilIdle();
    if (this.disposed) throw new Error("Vision pipeline has been disposed");
    this.busy = true;
    try {
      await this.load(features);
      await this.setMode("IMAGE");
      this.resetTracking();
      const start = performance.now();
      if (features.face && this.face)
        this.acceptFace(
          this.face.detect(
            this.prepareFrame(image, this.options.inferenceMaxSide),
          ),
          start,
          false,
        );
      if (features.body && this.body)
        this.body.segment(
          this.prepareFrame(image, this.options.bodyMaxSide),
          (result) => this.acceptBody(result, start, false),
        );
      if (features.pose && this.pose)
        this.acceptPose(
          this.pose.detect(
            this.prepareFrame(image, this.options.inferenceMaxSide),
          ),
          start,
          false,
        );
      if (features.hair && this.hair && !(features.body && this.body))
        this.hair.segment(
          this.prepareFrame(image, this.options.hairMaxSide),
          (result) => this.acceptHair(result, start, false),
        );
      if (features.hands && this.hand)
        this.acceptHands(
          this.hand.detect(
            this.prepareFrame(image, this.options.inferenceMaxSide),
          ),
          start,
        );
      this.snapshot = {
        ...this.snapshot,
        timestamp: start,
        latencyMs: performance.now() - start,
        inferenceCount: this.snapshot.inferenceCount + 1,
      };
      return this.snapshot;
    } finally {
      this.release();
    }
  }
  /** Call from rAF; model inference is decoupled from the renderer's frame cadence. */
  async analyzeVideo(
    video: HTMLVideoElement,
    timestamp: number,
    features: Partial<Record<Feature, boolean>> = { face: true },
  ): Promise<VisionSnapshot> {
    if (
      this.disposed ||
      this.busy ||
      this.pendingImages > 0 ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoTime ||
      document.visibilityState === "hidden"
    )
      return this.snapshot;
    this.lastVideoTime = video.currentTime;
    return this.analyzeFrame(video, timestamp, features);
  }
  /** Transferable ImageBitmap path used by the dedicated vision worker. */
  async analyzeFrame(
    source: ImageSource | HTMLVideoElement,
    timestamp: number,
    features: Partial<Record<Feature, boolean>> = { face: true },
  ): Promise<VisionSnapshot> {
    if (this.disposed || this.busy) return this.snapshot;
    this.busy = true;
    try {
      await this.setMode("VIDEO");
      const active = {
        ...features,
        hair: features.hair && !(features.body && this.body),
      };
      this.scheduler.setActive(active);
      if (!features.face) {
        this.snapshot.landmarks = [];
        this.snapshot.blendshapes = {};
        this.snapshot.transform = null;
      }
      if (!features.body) this.snapshot.bodyMask = null;
      if (!features.pose) this.snapshot.pose = null;
      if (!features.hands) this.snapshot.hands = [];
      if (!features.hair && !features.body) this.snapshot.hairMask = null;
      const start = performance.now();
      if (features.face && this.face && this.scheduler.due("face", timestamp)) {
        const began = performance.now();
        this.acceptFace(
          this.face.detectForVideo(
            this.prepareFrame(source, this.options.inferenceMaxSide),
            timestamp,
          ),
          timestamp,
          true,
        );
        this.scheduler.record("face", timestamp, performance.now() - began);
      }
      if (features.body && this.body && this.scheduler.due("body", timestamp)) {
        const began = performance.now();
        this.body.segmentForVideo(
          this.prepareFrame(source, this.options.bodyMaxSide),
          timestamp,
          (result) => this.acceptBody(result, timestamp, true),
        );
        this.scheduler.record("body", timestamp, performance.now() - began);
      }
      if (features.pose && this.pose && this.scheduler.due("pose", timestamp)) {
        const began = performance.now();
        this.acceptPose(
          this.pose.detectForVideo(
            this.prepareFrame(source, this.options.inferenceMaxSide),
            timestamp,
          ),
          timestamp,
          true,
        );
        this.scheduler.record("pose", timestamp, performance.now() - began);
      }
      if (active.hair && this.hair && this.scheduler.due("hair", timestamp)) {
        const began = performance.now();
        this.hair.segmentForVideo(
          this.prepareFrame(source, this.options.hairMaxSide),
          timestamp,
          (result) => this.acceptHair(result, timestamp, true),
        );
        this.scheduler.record("hair", timestamp, performance.now() - began);
      }
      if (
        features.hands &&
        this.hand &&
        this.scheduler.due("hands", timestamp)
      ) {
        const began = performance.now();
        this.acceptHands(
          this.hand.detectForVideo(
            this.prepareFrame(source, this.options.inferenceMaxSide),
            timestamp,
          ),
          timestamp,
        );
        this.scheduler.record("hands", timestamp, performance.now() - began);
      }
      this.snapshot = {
        ...this.snapshot,
        timestamp,
        latencyMs: performance.now() - start,
        inferenceCount: this.snapshot.inferenceCount + 1,
        scheduler: this.scheduler.getMetrics(),
      };
      return this.snapshot;
    } catch (error) {
      throw new Error(
        `Vision frame failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.release();
    }
  }
  private prepareFrame(
    source: ImageSource | HTMLVideoElement,
    maxSide: number,
  ): ImageSource | HTMLVideoElement {
    const isVideo =
      typeof HTMLVideoElement !== "undefined" &&
      source instanceof HTMLVideoElement;
    const isImage =
      typeof HTMLImageElement !== "undefined" &&
      source instanceof HTMLImageElement;
    const width = isVideo
      ? source.videoWidth
      : isImage
        ? source.naturalWidth
        : (source as ImageBitmap | OffscreenCanvas).width;
    const height = isVideo
      ? source.videoHeight
      : isImage
        ? source.naturalHeight
        : (source as ImageBitmap | OffscreenCanvas).height;
    if (Math.max(width, height) <= maxSide) return source;
    const ratio = maxSide / Math.max(width, height);
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    let canvas = this.frameCanvases.get(maxSide);
    if (!canvas) {
      canvas =
        typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(w, h)
          : document.createElement("canvas");
      this.frameCanvases.set(maxSide, canvas);
    }
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const context = canvas.getContext("2d") as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context)
      throw new Error("2D canvas is unavailable for vision frame preparation");
    context.drawImage(source, 0, 0, w, h);
    return canvas;
  }
  private acceptFace(
    result: FaceLandmarkerResult,
    timestamp: number,
    smooth: boolean,
  ) {
    const points = result.faceLandmarks[0] ?? [];
    this.snapshot.landmarks = smooth
      ? this.faceSmoother.update(points, timestamp)
      : points;
    if (!points.length) this.faceSmoother.reset();
    this.snapshot.blendshapes = Object.fromEntries(
      (result.faceBlendshapes[0]?.categories ?? []).map((value) => [
        value.categoryName,
        value.score,
      ]),
    );
    this.snapshot.transform =
      result.facialTransformationMatrixes[0]?.data ?? null;
  }
  private acceptHair(
    result: ImageSegmenterResult,
    timestamp: number,
    smooth: boolean,
  ) {
    // Hair model has two confidence channels: background index 0, hair index 1.
    const mask = result.confidenceMasks?.[1] ?? result.confidenceMasks?.[0];
    if (!mask) {
      this.snapshot.hairMask = null;
      return;
    }
    const data = mask.getAsFloat32Array();
    this.snapshot.hairMask = this.hairSmoother.update(
      data,
      mask.width,
      mask.height,
      timestamp,
      smooth ? 0.35 : 0,
    );
    // All mask data is copied during the callback; MediaPipe owns result disposal.
  }
  private acceptBody(
    result: ImageSegmenterResult,
    timestamp: number,
    smooth: boolean,
  ) {
    const masks = result.confidenceMasks;
    if (!masks || masks.length !== 6) {
      this.snapshot.bodyMask = null;
      this.snapshot.status.body = {
        state: "error",
        error:
          "The multiclass body model did not return six expected confidence channels.",
      };
      return;
    }
    const body = decodeBodyMasks(
      masks.map((mask) => mask.getAsFloat32Array()),
      masks[0].width,
      masks[0].height,
      timestamp,
    );
    const forehead = this.snapshot.landmarks[10];
    if (forehead) body.faceAnchor = { x: forehead.x, y: forehead.y };
    this.snapshot.bodyMask = smooth ? this.bodySmoother.update(body) : body;
    this.snapshot.hairMask = this.hairSmoother.update(
      masks[1].getAsFloat32Array(),
      masks[1].width,
      masks[1].height,
      timestamp,
      smooth ? 0.25 : 0,
    );
  }
  private acceptPose(
    result: PoseLandmarkerResult,
    timestamp: number,
    smooth: boolean,
  ) {
    const points = result.landmarks[0];
    if (!points?.length) {
      this.snapshot.pose = null;
      this.poseSmoother.reset();
      return;
    }
    this.snapshot.pose = smooth
      ? this.poseSmoother.update(points, timestamp)
      : { landmarks: points, timestamp, source: "mediapipe-pose-lite" };
  }
  private acceptHands(result: HandLandmarkerResult, timestamp: number) {
    this.snapshot.hands = result.landmarks.map((landmarks, i) => {
      const category = result.handedness[i]?.[0];
      const confidence = category?.score ?? 0;
      const label = category?.categoryName ?? "Unknown";
      if (this.previousHandLabels[i] !== label) this.handSmoothers[i].reset();
      this.previousHandLabels[i] = label;
      const stable = this.handSmoothers[i].update(landmarks, timestamp);
      return {
        landmarks: stable,
        handedness: category?.categoryName ?? "Unknown",
        confidence,
        gesture: this.gestureTrackers[i].update(stable, timestamp, confidence),
      };
    });
    if (!result.landmarks.length)
      for (const tracker of this.gestureTrackers) tracker.reset();
  }
  calibratePinch(ratio: number) {
    for (const tracker of this.gestureTrackers) tracker.calibratePinch(ratio);
  }
  resetTracking() {
    this.faceSmoother.reset();
    this.hairSmoother.reset();
    this.bodySmoother.reset();
    this.poseSmoother.reset();
    this.previousHandLabels = [];
    for (const smoother of this.handSmoothers) smoother.reset();
    for (const tracker of this.gestureTrackers) tracker.reset();
    this.lastVideoTime = -1;
    this.scheduler.reset();
    // Returned observations belong to their callers. Release internal references
    // without altering a result that a caller may still be interpreting.
    this.snapshot = {
      ...this.snapshot,
      landmarks: [],
      blendshapes: {},
      transform: null,
      hairMask: null,
      hands: [],
      bodyMask: null,
      pose: null,
    };
  }
  dispose() {
    this.disposed = true;
    this.release();
    this.face?.close();
    this.hair?.close();
    this.hand?.close();
    this.body?.close();
    this.pose?.close();
    this.face = null;
    this.hair = null;
    this.hand = null;
    this.body = null;
    this.pose = null;
    this.loads.clear();
    this.frameCanvases.clear();
    this.resetTracking();
    this.snapshot.status = initialStatus();
  }
}
