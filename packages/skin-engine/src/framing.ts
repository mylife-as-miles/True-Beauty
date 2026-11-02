import { REGIONS } from "../../face-tracking/src";
export interface FramingPoint {
  x: number;
  y: number;
}
export interface ScanFramingPlan {
  ok: true;
  crop: { x: number; y: number; width: number; height: number };
  output: { width: number; height: number };
  face: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    widthFraction: number;
  };
  scale: number;
  upscaled: boolean;
  warnings: string[];
  source: "observed-face-landmarks";
}
export interface ScanFramingFailure {
  ok: false;
  code:
    | "invalid-image"
    | "landmarks-unavailable"
    | "clipped-face"
    | "insufficient-detail"
    | "unsupported-aspect";
  message: string;
}
export type ScanFramingResult = ScanFramingPlan | ScanFramingFailure;
const fail = (
  code: ScanFramingFailure["code"],
  message: string,
): ScanFramingFailure => ({ ok: false, code, message });
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
/**
 * Local image-plane crop planning, not face reconstruction or provider approval.
 * The official skin recovery guidance asks for a frontal face over 60% of width.
 * We aim for 72%, preserving observed chin/forehead and 12.5% vertical margins.
 * Resizing can meet the file-size geometry constraint but cannot restore detail.
 */
export function planScanFraming(input: {
  width: number;
  height: number;
  landmarks: readonly FramingPoint[];
  targetFaceWidthRatio?: number;
}): ScanFramingResult {
  const { width, height, landmarks } = input;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width > 50000 ||
    height > 50000
  )
    return fail(
      "invalid-image",
      "Open a valid image before preparing scan framing.",
    );
  const points = REGIONS.faceOval.map((index) => landmarks[index]);
  if (
    landmarks.length < 468 ||
    points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return fail(
      "landmarks-unavailable",
      "Face landmarks are not ready. Use a clear front-facing photo, keep the forehead and chin inside the image, and try local framing again.",
    );
  if (points.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
    return fail(
      "clipped-face",
      "The detected face reaches outside this photo. Retake it with the entire forehead and chin visible; cropping cannot recover missing pixels.",
    );
  const left = Math.min(...points.map((p) => p.x)) * width,
    right = Math.max(...points.map((p) => p.x)) * width,
    top = Math.min(...points.map((p) => p.y)) * height,
    bottom = Math.max(...points.map((p) => p.y)) * height;
  const faceWidth = right - left,
    faceHeight = bottom - top;
  if (
    faceWidth < 8 ||
    faceHeight < 12 ||
    faceWidth / faceHeight < 0.25 ||
    faceWidth / faceHeight > 1.6
  )
    return fail(
      "landmarks-unavailable",
      "The detected face geometry is uncertain. Face forward in even light and keep both cheeks, forehead and chin visible.",
    );
  if (
    top < faceHeight * 0.025 ||
    height - bottom < faceHeight * 0.025 ||
    left < 1 ||
    width - right < 1
  )
    return fail(
      "clipped-face",
      "There is too little room around the detected face. Retake the photo with space above the forehead and below the chin.",
    );
  if (
    input.targetFaceWidthRatio !== undefined &&
    !Number.isFinite(input.targetFaceWidthRatio)
  )
    return fail("invalid-image", "The requested framing ratio is invalid.");
  const target = clamp(input.targetFaceWidthRatio ?? 0.72, 0.65, 0.8);
  const cropWidth = Math.min(width, Math.ceil(faceWidth / target)),
    cropHeight = Math.min(
      height,
      Math.ceil(Math.max(faceHeight * 1.25, cropWidth * 0.9)),
    );
  const x = Math.round(
      clamp((left + right - cropWidth) / 2, 0, width - cropWidth),
    ),
    y = Math.round(
      clamp((top + bottom - cropHeight) / 2, 0, height - cropHeight),
    );
  const widthFraction = faceWidth / cropWidth;
  if (
    widthFraction <= 0.6 ||
    top < y ||
    bottom > y + cropHeight ||
    left < x ||
    right > x + cropWidth
  )
    return fail(
      "clipped-face",
      "A complete face cannot be framed above 60% of the image width without losing an edge. Retake a closer, front-facing photo.",
    );
  const minSide = Math.min(cropWidth, cropHeight),
    maxSide = Math.max(cropWidth, cropHeight);
  const minScale = 480 / minSide,
    maxScale = 2560 / maxSide;
  if (minScale > maxScale)
    return fail(
      "unsupported-aspect",
      "This crop is too narrow to meet the provider image limits. Retake a normally framed frontal portrait.",
    );
  const scale = Math.min(Math.max(1, minScale), maxScale);
  if (scale > 2)
    return fail(
      "insufficient-detail",
      "The face is too small in the original image for a detailed scan crop. Retake a closer photo; enlarging this crop would not recover skin detail.",
    );
  const output = {
    width: Math.max(480, Math.round(cropWidth * scale)),
    height: Math.max(480, Math.round(cropHeight * scale)),
  };
  if (Math.max(output.width, output.height) > 2560)
    return fail(
      "unsupported-aspect",
      "The prepared image cannot meet the provider size limits. Choose another frontal portrait.",
    );
  const warnings = [
    "Framing is estimated from visible landmarks. Confirm that the face is frontal and the forehead and chin remain visible; this does not guarantee provider acceptance.",
  ];
  if (scale > 1.001)
    warnings.push(
      "This crop is enlarged to meet the 480-pixel short-edge requirement. Enlargement adds no skin detail.",
    );
  if (
    top - y < faceHeight * 0.08 ||
    y + cropHeight - bottom < faceHeight * 0.08
  )
    warnings.push(
      "The source limits the margin around the forehead or chin. Review the exact crop before authorizing upload.",
    );
  return {
    ok: true,
    crop: { x, y, width: cropWidth, height: cropHeight },
    output,
    face: { left, top, right, bottom, widthFraction },
    scale,
    upscaled: scale > 1.001,
    warnings,
    source: "observed-face-landmarks",
  };
}
