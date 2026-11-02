/// <reference lib="webworker" />
import { VisionPipeline, type Feature, type VisionOptions } from "./pipeline";
declare const self: DedicatedWorkerGlobalScope;

/**
 * Tasks Vision's supported module-loader hook. Vite disallows import() directly
 * from public/ JS assets in development. Fetch only our same-origin WASM loader,
 * then import its module bytes as a temporary blob; never evaluate user content.
 */
(self as unknown as { import: (url: string) => Promise<unknown> }).import =
  async (url) => {
    const resolved = new URL(url, self.location.origin);
    if (
      resolved.origin !== self.location.origin ||
      !resolved.pathname.startsWith("/wasm/")
    )
      throw new Error("Unexpected WASM loader URL");
    const response = await fetch(resolved);
    if (!response.ok) throw new Error(`WASM loader HTTP ${response.status}`);
    const blob = URL.createObjectURL(
      new Blob([await response.text()], { type: "text/javascript" }),
    );
    try {
      return await import(/* @vite-ignore */ blob);
    } finally {
      URL.revokeObjectURL(blob);
    }
  };
interface Request {
  id: number;
  operation: "load" | "image" | "frame" | "dispose" | "calibrate" | "reset";
  options?: VisionOptions;
  features?: Partial<Record<Feature, boolean>>;
  bitmap?: ImageBitmap;
  timestamp?: number;
  ratio?: number;
}
let pipeline: VisionPipeline | null = null;
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<Request>) => {
  queue = queue.then(async () => {
    const request = event.data;
    try {
      if (request.operation === "dispose") {
        pipeline?.dispose();
        pipeline = null;
        self.postMessage({ id: request.id, snapshot: null });
        return;
      }
      pipeline ??= new VisionPipeline(request.options);
      if (request.operation === "calibrate") {
        pipeline.calibratePinch(request.ratio ?? 0.3);
        self.postMessage({ id: request.id, snapshot: pipeline.getSnapshot() });
        return;
      }
      if (request.operation === "reset") {
        pipeline.resetTracking();
        self.postMessage({ id: request.id, snapshot: pipeline.getSnapshot() });
        return;
      }
      await pipeline.load(request.features ?? { face: true });
      let snapshot = pipeline.getSnapshot();
      if (request.operation === "image" && request.bitmap)
        snapshot = await pipeline.analyzeImage(
          request.bitmap,
          request.features,
        );
      if (request.operation === "frame" && request.bitmap)
        snapshot = await pipeline.analyzeFrame(
          request.bitmap,
          request.timestamp ?? performance.now(),
          request.features,
        );
      self.postMessage({ id: request.id, snapshot });
    } catch (error) {
      self.postMessage({
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
        snapshot: pipeline?.getSnapshot(),
      });
    } finally {
      request.bitmap?.close();
    }
  });
};
