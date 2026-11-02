import { getGraphicsCapabilities } from "./capabilities";
import { SerialTaskQueue } from "./taskQueue";
import type { Feature, VisionOptions, VisionSnapshot } from "./pipeline";
type Features = Partial<Record<Feature, boolean>>;
type Source =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap
  | OffscreenCanvas;
interface Pending {
  resolve: (snapshot: VisionSnapshot) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Optional off-main-thread drop-in adapter. No automatic camera or upload. */
export class VisionWorkerClient {
  private readonly worker: Worker;
  private readonly options: VisionOptions;
  private sequence = 0;
  private readonly pending = new Map<number, Pending>();
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
  private disposed = false;
  private lastVideoTime = -1;
  private snapshot: VisionSnapshot = {
    landmarks: [],
    blendshapes: {},
    transform: null,
    hairMask: null,
    hands: [],
    timestamp: 0,
    latencyMs: 0,
    inferenceCount: 0,
    status: {
      face: { state: "idle" },
      hair: { state: "idle" },
      hands: { state: "idle" },
    },
  };
  static supported() {
    return getGraphicsCapabilities().worker;
  }
  constructor(options: VisionOptions = {}) {
    if (!VisionWorkerClient.supported())
      throw new Error(
        "Offscreen vision is unavailable; use VisionPipeline on this browser",
      );
    this.options = {
      wasmPath: new URL("/wasm", location.origin).href,
      modelPath: new URL("/models", location.origin).href,
      ...options,
    };
    this.worker = new Worker(new URL("./vision.worker.ts", import.meta.url), {
      type: "module",
      name: "true-beauty-vision",
    });
    this.worker.onmessage = (event) => {
      const { id, snapshot, error } = event.data as {
        id: number;
        snapshot?: VisionSnapshot;
        error?: string;
      };
      if (snapshot) this.snapshot = snapshot;
      const pending = this.pending.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(this.snapshot);
    };
    this.worker.onerror = (event) => {
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error(event.message || "Vision worker failed"));
      }
      this.pending.clear();
      this.release();
    };
  }
  get isBusy() {
    return this.busy;
  }
  getSnapshot() {
    return this.snapshot;
  }
  private request(
    operation: "load" | "image" | "frame" | "calibrate" | "reset",
    features: Features,
    bitmap?: ImageBitmap,
    timestamp?: number,
    ratio?: number,
  ): Promise<VisionSnapshot> {
    if (this.disposed) {
      bitmap?.close();
      return Promise.reject(new Error("Vision worker has been disposed"));
    }
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.dispose();
        reject(
          new Error(
            "Vision worker timed out; retry with the local image fallback",
          ),
        );
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage(
          {
            id,
            operation,
            options: this.options,
            features,
            bitmap,
            timestamp,
            ratio,
          },
          bitmap ? [bitmap] : [],
        );
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        bitmap?.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  async load(features: Features = { face: true }) {
    await this.request("load", features);
  }
  analyzeImage(
    source: Source,
    features: Features = { face: true },
  ): Promise<VisionSnapshot> {
    this.pendingImages++;
    return this.imageQueue
      .enqueue(async () => {
        await this.waitUntilIdle();
        if (this.disposed) throw new Error("Vision worker has been disposed");
        this.busy = true;
        try {
          const bitmap = await createImageBitmap(source);
          return await this.request("image", features, bitmap);
        } finally {
          this.release();
        }
      })
      .finally(() => {
        this.pendingImages--;
      });
  }
  async analyzeVideo(
    video: HTMLVideoElement,
    timestamp: number,
    features: Features = { face: true },
  ): Promise<VisionSnapshot> {
    if (
      this.busy ||
      this.pendingImages > 0 ||
      this.disposed ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoTime ||
      document.visibilityState === "hidden"
    )
      return this.snapshot;
    this.lastVideoTime = video.currentTime;
    this.busy = true;
    try {
      const bitmap = await createImageBitmap(video);
      return await this.request("frame", features, bitmap, timestamp);
    } finally {
      this.release();
    }
  }
  async calibratePinch(ratio: number) {
    await this.request("calibrate", {}, undefined, undefined, ratio);
  }
  async resetTracking() {
    this.lastVideoTime = -1;
    await this.request("reset", {});
  }
  dispose() {
    this.disposed = true;
    this.worker.terminate();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Vision worker was disposed"));
    }
    this.pending.clear();
    this.release();
    this.snapshot = {
      ...this.snapshot,
      landmarks: [],
      hairMask: null,
      hands: [],
      bodyMask: null,
      pose: null,
    };
  }
}
