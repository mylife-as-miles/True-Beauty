export interface GraphicsCapabilities {
  webgl: boolean;
  webgl2: boolean;
  offscreenWebgl2: boolean;
  worker: boolean;
}
let cached: GraphicsCapabilities | null = null;
function probe(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  kind: "webgl" | "webgl2",
): boolean {
  try {
    const gl = canvas.getContext(kind) as
      WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) return false;
    const usable = !gl.isContextLost();
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return usable;
  } catch {
    return false;
  }
}
/** Runtime graphics capability; user-agent brands are never treated as a denial. */
export function getGraphicsCapabilities(): GraphicsCapabilities {
  if (cached) return cached;
  const webgl2 =
    typeof document !== "undefined" &&
    probe(document.createElement("canvas"), "webgl2");
  const webgl =
    webgl2 ||
    (typeof document !== "undefined" &&
      probe(document.createElement("canvas"), "webgl"));
  const offscreenWebgl2 =
    typeof OffscreenCanvas !== "undefined" &&
    probe(new OffscreenCanvas(1, 1), "webgl2");
  return (cached = {
    webgl,
    webgl2,
    offscreenWebgl2,
    worker:
      typeof Worker !== "undefined" &&
      typeof createImageBitmap === "function" &&
      offscreenWebgl2,
  });
}
export function graphicsError(
  feature = "Local face and hair processing",
): Error {
  return new Error(
    `${feature} needs a usable graphics context in this browser, including when inference uses the CPU. Enable browser graphics acceleration or try a graphics-enabled browser. You can still choose colour swatches manually and use your saved collections.`,
  );
}
export function contextualVisionError(error: unknown, feature: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  return /kGpuService|GLctx|activeTexture|webgl_create_context|WebGL|OpenGL|GL driver/i.test(
    message,
  )
    ? graphicsError(feature)
    : error instanceof Error
      ? error
      : new Error(message);
}
