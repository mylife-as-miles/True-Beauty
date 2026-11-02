/**
 * Optional local OpenCV polygon/feather backend.
 * Implementation written independently against OpenCV's documented public API after
 * studying virtual-makeup/apps/web/src/lib/makeup/face.ts (revision 1d6ed5e...).
 * That source has no repository license; its expressive source is not copied here.
 * The reusable method is polygon rasterization, Gaussian feathering, weighted tint.
 * OpenCV and @techstark/opencv-js retain their own Apache-2.0 notices.
 */
import type { Landmark } from "./geometry";

type Cv = typeof import("@techstark/opencv-js");
export interface MaskRequest {
  width: number;
  height: number;
  points: readonly Landmark[];
  rings: ReadonlyArray<readonly number[]>;
  holes?: ReadonlyArray<readonly number[]>;
  sigma?: number;
}
export interface OpenCvStats {
  maskCalls: number;
  compositeCalls: number;
  lastMaskMs: number;
  activeMatrices: number;
}
export class OpenCvBackend {
  readonly stats: OpenCvStats = {
    maskCalls: 0,
    compositeCalls: 0,
    lastMaskMs: 0,
    activeMatrices: 0,
  };
  private constructor(private readonly cv: Cv) {}
  static async load(): Promise<OpenCvBackend> {
    const imported = await import("@techstark/opencv-js");
    const candidate =
      (imported as unknown as { default?: unknown }).default ?? imported;
    const cv = (await Promise.resolve(candidate)) as Cv;
    if (typeof cv.Mat !== "function")
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error(
                "OpenCV initialization timed out. Canvas masks remain available.",
              ),
            ),
          20_000,
        );
        const runtime = cv as unknown as {
          onRuntimeInitialized?: () => void;
          onAbort?: (reason: unknown) => void;
        };
        const previous = runtime.onRuntimeInitialized;
        runtime.onRuntimeInitialized = () => {
          clearTimeout(timer);
          previous?.();
          resolve();
        };
        runtime.onAbort = (reason) => {
          clearTimeout(timer);
          reject(new Error(`OpenCV initialization failed: ${String(reason)}`));
        };
      });
    if (typeof cv.Mat !== "function" || typeof cv.GaussianBlur !== "function")
      throw new Error(
        "OpenCV runtime did not initialize. Canvas masks remain available.",
      );
    return new OpenCvBackend(cv);
  }
  /** Returns white RGBA pixels with feathered alpha; holes remain exactly transparent. */
  createMask(request: MaskRequest): ImageData {
    const { width, height, points, rings, holes = [], sigma = 1.2 } = request;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width * height > 4_194_304
    )
      throw new Error("Mask dimensions exceed the local processing budget.");
    const start = performance.now(),
      cv = this.cv,
      mask = cv.Mat.zeros(height, width, cv.CV_8UC1);
    this.stats.activeMatrices++;
    const fill = (ring: readonly number[], value: number) => {
      const coordinates: number[] = [];
      for (const id of ring) {
        const p = points[id];
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
          throw new Error("Mask landmarks are incomplete.");
        coordinates.push(
          Math.round(Math.min(1, Math.max(0, p.x)) * (width - 1)),
          Math.round(Math.min(1, Math.max(0, p.y)) * (height - 1)),
        );
      }
      if (coordinates.length < 6) return;
      const polygon = cv.matFromArray(
          coordinates.length / 2,
          1,
          cv.CV_32SC2,
          coordinates,
        ),
        collection = new cv.MatVector();
      this.stats.activeMatrices += 2;
      try {
        collection.push_back(polygon);
        cv.fillPoly(
          mask,
          collection,
          new cv.Scalar(value),
          value === 0 ? cv.LINE_8 : cv.LINE_AA,
        );
      } finally {
        collection.delete();
        polygon.delete();
        this.stats.activeMatrices -= 2;
      }
    };
    try {
      for (const ring of rings) fill(ring, 255);
      for (const hole of holes) fill(hole, 0);
      if (sigma > 0) {
        const radius = Math.max(1, Math.min(12, Math.ceil(sigma * 2)));
        cv.GaussianBlur(
          mask,
          mask,
          new cv.Size(radius * 2 + 1, radius * 2 + 1),
          sigma,
          sigma,
          cv.BORDER_DEFAULT,
        );
      }
      // Feathering should not introduce pigment into the mouth cavity or eyeballs.
      for (const hole of holes) fill(hole, 0);
      const output = new Uint8ClampedArray(width * height * 4),
        pixels = mask.data;
      for (let i = 0; i < width * height; i++) {
        output[i * 4] = 255;
        output[i * 4 + 1] = 255;
        output[i * 4 + 2] = 255;
        output[i * 4 + 3] = pixels[i];
      }
      this.stats.maskCalls++;
      this.stats.lastMaskMs = performance.now() - start;
      return new ImageData(output, width, height);
    } finally {
      mask.delete();
      this.stats.activeMatrices--;
    }
  }
  /** Local static-image weighted color compositing; source pixels outside the mask remain exact. */
  composite(
    source: ImageData,
    mask: ImageData,
    color: [number, number, number],
    opacity: number,
  ): ImageData {
    if (source.width !== mask.width || source.height !== mask.height)
      throw new Error("Source and mask dimensions must agree.");
    if (
      !Number.isFinite(opacity) ||
      opacity < 0 ||
      opacity > 1 ||
      color.some((v) => !Number.isFinite(v) || v < 0 || v > 255)
    )
      throw new Error("Tint controls are out of range.");
    const cv = this.cv,
      src = cv.matFromImageData(source),
      tint = new cv.Mat(
        source.height,
        source.width,
        cv.CV_8UC4,
        new cv.Scalar(...color, 255),
      ),
      blend = new cv.Mat();
    this.stats.activeMatrices += 3;
    try {
      cv.addWeighted(src, 1 - opacity, tint, opacity, 0, blend);
      const output = new Uint8ClampedArray(source.data),
        blended = blend.data;
      for (let i = 0; i < source.width * source.height; i++) {
        const alpha = mask.data[i * 4 + 3] / 255;
        if (!alpha) continue;
        for (let channel = 0; channel < 3; channel++) {
          const j = i * 4 + channel;
          output[j] = Math.round(
            source.data[j] * (1 - alpha) + blended[j] * alpha,
          );
        }
      }
      this.stats.compositeCalls++;
      return new ImageData(output, source.width, source.height);
    } finally {
      blend.delete();
      tint.delete();
      src.delete();
      this.stats.activeMatrices -= 3;
    }
  }
}
