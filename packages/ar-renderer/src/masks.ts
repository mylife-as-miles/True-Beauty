import type { OpenCvBackend } from "./opencv";
import { REGIONS, type Landmark, validFace, faceMetrics } from "./geometry";
export const MASK_ORDER = [
  "lipstick",
  "blush",
  "eyeshadow",
  "foundation",
  "eyeliner",
  "mascara",
  "brows",
  "highlighter",
  "contour",
  "bronzer",
  "lipliner",
  "lipgloss",
] as const;
export type MaskName = (typeof MASK_ORDER)[number];
/** Single shared source-space mask atlas. Lips exclude mouth/teeth and eyes remain untinted. */
export class FaceMaskAtlas {
  readonly atlases: HTMLCanvasElement[];
  readonly layerMasks: HTMLCanvasElement[];
  private scratch: HTMLCanvasElement;
  private lastPoints: readonly Landmark[] | null = null;
  private cv: OpenCvBackend | null = null;
  private activeKey = "";
  constructor() {
    this.layerMasks = Array.from({ length: 12 }, () =>
      document.createElement("canvas"),
    );
    this.atlases = Array.from({ length: 4 }, () =>
      document.createElement("canvas"),
    );
    this.scratch = document.createElement("canvas");
  }
  setBackend(backend: OpenCvBackend | null) {
    this.cv = backend;
    this.lastPoints = null;
  }
  get backend() {
    return this.cv ? "opencv" : "canvas";
  }
  get backendStats() {
    return this.cv?.stats;
  }
  update(
    points: readonly Landmark[],
    sourceWidth: number,
    sourceHeight: number,
    enabled?: ReadonlySet<MaskName>,
  ): boolean {
    const activeKey = enabled ? [...enabled].join(",") : "*";
    const factor = Math.min(1, 512 / Math.max(sourceWidth, sourceHeight));
    const w = Math.max(1, Math.round(sourceWidth * factor)),
      h = Math.max(1, Math.round(sourceHeight * factor));
    if (
      this.lastPoints === points &&
      this.activeKey === activeKey &&
      this.scratch.width === w &&
      this.scratch.height === h
    )
      return false;
    this.activeKey = activeKey;
    this.lastPoints = points;
    this.layerMasks.forEach((c) => {
      c.width = w;
      c.height = h;
    });
    this.scratch.width = w;
    this.scratch.height = h;
    this.atlases.forEach((c) => {
      c.width = w;
      c.height = h;
      const d = c.getContext("2d")!;
      d.fillStyle = "black";
      d.fillRect(0, 0, w, h);
    });
    if (!validFace(points)) return true;
    const ctx = this.scratch.getContext("2d")!;
    const polygon = (ids: readonly number[], stroke = false) => {
      ctx.beginPath();
      ids.forEach((id, i) => {
        const p = points[id];
        if (!p) return;
        if (i === 0) ctx.moveTo(p.x * w, p.y * h);
        else ctx.lineTo(p.x * w, p.y * h);
      });
      if (stroke) ctx.stroke();
      else {
        ctx.closePath();
        ctx.fill();
      }
    };
    const metrics = faceMetrics(points, w, h)!;
    const softOval = (
      id: number,
      rx: number,
      ry: number,
      angle = metrics.rotation,
    ) => {
      const p = points[id];
      if (!p) return;
      ctx.save();
      ctx.translate(p.x * w, p.y * h);
      ctx.rotate(angle);
      ctx.scale(rx, ry);
      const grad = ctx.createRadialGradient(0, 0, 0.06, 0, 0, 1);
      grad.addColorStop(0, "white");
      grad.addColorStop(0.35, "rgba(255,255,255,.78)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const fill = (name: MaskName) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.filter = "none";
      ctx.fillStyle = "white";
      ctx.strokeStyle = "white";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const soft = Math.max(0.5, metrics.eyeDistance * 0.012);
      if (this.cv) {
        let rings: ReadonlyArray<readonly number[]> | null = null,
          holes: ReadonlyArray<readonly number[]> = [],
          sigma = soft;
        if (name === "lipstick" || name === "lipgloss") {
          rings = [REGIONS.lipOuter];
          holes = [REGIONS.lipInner];
          sigma = soft * 0.45;
        }
        if (name === "eyeshadow") {
          rings = [REGIONS.leftShadow, REGIONS.rightShadow];
          holes = [REGIONS.leftEye, REGIONS.rightEye];
        }
        if (name === "brows") {
          rings = [REGIONS.leftBrow, REGIONS.rightBrow];
          sigma = soft * 0.4;
        }
        if (name === "foundation") {
          rings = [REGIONS.face];
          holes = [
            REGIONS.leftEye,
            REGIONS.rightEye,
            REGIONS.lipOuter,
            REGIONS.leftBrow,
            REGIONS.rightBrow,
          ];
        }
        if (rings) {
          ctx.putImageData(
            this.cv.createMask({
              width: w,
              height: h,
              points,
              rings,
              holes,
              sigma,
            }),
            0,
            0,
          );
          ctx.globalCompositeOperation = "source-in";
          return;
        }
      }
      if (name === "lipstick" || name === "lipgloss") {
        ctx.filter = `blur(${soft * 0.45}px)`;
        polygon(REGIONS.lipOuter);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "destination-out";
        polygon(REGIONS.lipInner);
      }
      if (name === "lipliner") {
        ctx.lineWidth = Math.max(0.7, metrics.eyeDistance * 0.008);
        polygon([...REGIONS.lipOuter, 61], true);
      }
      if (name === "foundation") {
        ctx.filter = `blur(${soft}px)`;
        polygon(REGIONS.face);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "destination-out";
        polygon(REGIONS.leftEye);
        polygon(REGIONS.rightEye);
        polygon(REGIONS.lipOuter);
        polygon(REGIONS.leftBrow);
        polygon(REGIONS.rightBrow);
      }
      if (name === "blush") {
        softOval(50, metrics.eyeDistance * 0.26, metrics.eyeDistance * 0.15);
        softOval(280, metrics.eyeDistance * 0.26, metrics.eyeDistance * 0.15);
      }
      if (name === "eyeshadow") {
        ctx.filter = `blur(${soft}px)`;
        polygon(REGIONS.leftShadow);
        polygon(REGIONS.rightShadow);
        ctx.filter = "none";
        ctx.globalCompositeOperation = "destination-out";
        polygon(REGIONS.leftEye);
        polygon(REGIONS.rightEye);
      }
      if (name === "eyeliner" || name === "mascara") {
        ctx.lineWidth =
          metrics.eyeDistance * (name === "eyeliner" ? 0.008 : 0.012);
        polygon(REGIONS.leftLid, true);
        polygon(REGIONS.rightLid, true);
        for (const ids of [REGIONS.leftLid, REGIONS.rightLid]) {
          const outer = points[ids[0]],
            inside = points[ids[ids.length - 1]];
          const sign = outer.x < inside.x ? -1 : 1;
          ctx.beginPath();
          ctx.moveTo(outer.x * w, outer.y * h);
          ctx.lineTo(
            outer.x * w + sign * metrics.eyeDistance * 0.05,
            outer.y * h - metrics.eyeDistance * 0.025,
          );
          ctx.stroke();
          if (name === "mascara")
            for (let i = 2; i < 7; i++) {
              const p = points[ids[i]];
              ctx.beginPath();
              ctx.moveTo(p.x * w, p.y * h);
              ctx.lineTo(
                p.x * w + sign * metrics.eyeDistance * 0.006,
                p.y * h - metrics.eyeDistance * 0.022,
              );
              ctx.stroke();
            }
        }
      }
      if (name === "brows") {
        ctx.filter = `blur(${soft * 0.4}px)`;
        polygon(REGIONS.leftBrow);
        polygon(REGIONS.rightBrow);
      }
      if (name === "highlighter") {
        softOval(119, metrics.eyeDistance * 0.13, metrics.eyeDistance * 0.045);
        softOval(348, metrics.eyeDistance * 0.13, metrics.eyeDistance * 0.045);
        softOval(4, metrics.eyeDistance * 0.035, metrics.eyeDistance * 0.1);
      }
      if (name === "contour") {
        softOval(
          123,
          metrics.eyeDistance * 0.2,
          metrics.eyeDistance * 0.065,
          metrics.rotation + 0.3,
        );
        softOval(
          352,
          metrics.eyeDistance * 0.2,
          metrics.eyeDistance * 0.065,
          metrics.rotation - 0.3,
        );
        softOval(172, metrics.eyeDistance * 0.1, metrics.eyeDistance * 0.16);
        softOval(397, metrics.eyeDistance * 0.1, metrics.eyeDistance * 0.16);
      }
      if (name === "bronzer") {
        softOval(54, metrics.eyeDistance * 0.17, metrics.eyeDistance * 0.11);
        softOval(284, metrics.eyeDistance * 0.17, metrics.eyeDistance * 0.11);
        softOval(137, metrics.eyeDistance * 0.2, metrics.eyeDistance * 0.09);
        softOval(366, metrics.eyeDistance * 0.2, metrics.eyeDistance * 0.09);
      }
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-in";
    };
    MASK_ORDER.forEach((name, i) => {
      if (enabled && !enabled.has(name)) return;
      fill(name);
      const raw = this.layerMasks[i];
      raw.width = w;
      raw.height = h;
      raw.getContext("2d")!.drawImage(this.scratch, 0, 0);
      const channel = i % 3;
      const color = ["#ff0000", "#00ff00", "#0000ff"][channel];
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      const dest = this.atlases[Math.floor(i / 3)].getContext("2d")!;
      // Opaque black atlas + additive RGB stores feathered scalar masks in independent channels.
      dest.globalCompositeOperation = "lighter";
      dest.drawImage(this.scratch, 0, 0);
    });
    return true;
  }
}
