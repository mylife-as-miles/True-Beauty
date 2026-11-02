import {
  VisionPipeline,
  type Feature,
  type VisionOptions,
  type VisionSnapshot,
} from "./pipeline";
import { VisionWorkerClient } from "./workerClient";
import { contextualVisionError, getGraphicsCapabilities } from "./capabilities";
type Features = Partial<Record<Feature, boolean>>;
type Source =
  HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;
export interface VisionEngine {
  readonly isBusy: boolean;
  load(features?: Features): Promise<void>;
  analyzeImage(source: Source, features?: Features): Promise<VisionSnapshot>;
  analyzeVideo(
    source: HTMLVideoElement,
    timestamp: number,
    features?: Features,
  ): Promise<VisionSnapshot>;
  getSnapshot(): VisionSnapshot;
  calibratePinch(ratio: number): void | Promise<void>;
  resetTracking(): void | Promise<void>;
  dispose(): void;
}

/** Capability-based worker preference with a genuine main-thread CPU fallback. */
class ResilientVision implements VisionEngine {
  private engine: VisionWorkerClient | VisionPipeline;
  private disposed = false;
  private readonly features: Features = {};
  private failover: Promise<void> | null = null;
  constructor(private options: VisionOptions) {
    if (VisionWorkerClient.supported()) {
      try {
        this.engine = new VisionWorkerClient(options);
        return;
      } catch {
        // Module workers can be blocked by policy despite graphics support.
      }
    }
    this.engine = new VisionPipeline({ ...options, delegate: "CPU" });
  }
  get isBusy() {
    return this.engine.isBusy;
  }
  getSnapshot() {
    return this.engine.getSnapshot();
  }
  private async run<T>(
    operation: (engine: VisionEngine) => Promise<T>,
  ): Promise<T> {
    if (this.disposed) throw new Error("Vision engine has been disposed");
    if (this.failover) await this.failover;
    const original = this.engine;
    try {
      return await operation(original);
    } catch (error) {
      if (this.disposed) throw new Error("Vision engine has been disposed");
      // Retry only worker failures, once. Never invent geometry when both paths fail.
      if (original instanceof VisionWorkerClient) {
        if (this.engine === original) {
          const main = new VisionPipeline({ ...this.options, delegate: "CPU" });
          this.engine = main;
          original.dispose();
          const transition = main.load(this.features);
          this.failover = transition;
          // A failed model/network request must remain retryable without remounting.
          const clear = () => {
            if (this.failover === transition) this.failover = null;
          };
          void transition.then(clear, clear);
        }
        try {
          if (this.failover) await this.failover;
          if (this.disposed) throw new Error("Vision engine has been disposed");
          return await operation(this.engine);
        } catch (fallbackError) {
          throw contextualVisionError(
            fallbackError,
            "Local face and hair processing",
          );
        }
      }
      throw contextualVisionError(error, "Local face and hair processing");
    }
  }
  async load(features: Features = { face: true }) {
    Object.assign(this.features, features);
    await this.run((engine) => engine.load(features));
  }
  analyzeImage(source: Source, features: Features = { face: true }) {
    Object.assign(this.features, features);
    return this.run((engine) => engine.analyzeImage(source, features));
  }
  analyzeVideo(
    source: HTMLVideoElement,
    timestamp: number,
    features: Features = { face: true },
  ) {
    Object.assign(this.features, features);
    return this.run((engine) =>
      engine.analyzeVideo(source, timestamp, features),
    );
  }
  calibratePinch(ratio: number) {
    return this.engine.calibratePinch(ratio);
  }
  resetTracking() {
    return this.engine.resetTracking();
  }
  dispose() {
    this.disposed = true;
    this.engine.dispose();
  }
}
export function createVision(options: VisionOptions = {}): VisionEngine {
  return new ResilientVision(options);
}
export { getGraphicsCapabilities };
