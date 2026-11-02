import {
  ACCESSORY_KEYS,
  type AccessoryKey,
  type MakeupLook,
} from "../../makeup-engine/src";
import { visiblePosePoint, type PoseFrame } from "../../pose-tracking/src";
import {
  BODY_LABELS,
  type BodySegmentation,
} from "../../body-segmentation/src";
import { faceMetrics, validFace, type Landmark } from "./geometry";
export interface AccessoryHand {
  landmarks: readonly Landmark[];
  confidence?: number;
}
export interface AccessoryAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  source: "face" | "hand" | "pose";
  /** Handedness score or joint visibility; not calibrated fit/tracking confidence. */
  support?: number;
  side?: "left" | "right";
}
export interface AccessoryAnchors {
  rings: AccessoryAnchor[];
  wrists: AccessoryAnchor[];
  hat: AccessoryAnchor | null;
  necklace: AccessoryAnchor | null;
}
export interface AccessoryScene {
  landmarks?: readonly Landmark[];
  hands?: readonly AccessoryHand[];
  pose?: PoseFrame | null;
  bodyMask?: BodySegmentation | null;
}
const point = (p: Landmark | undefined, w: number, h: number) =>
  p &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= 0 &&
  p.x <= 1 &&
  p.y >= 0 &&
  p.y <= 1
    ? { x: p.x * w, y: p.y * h }
    : null;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Source-space projections from actual task landmarks; no body reconstruction or metric fit. */
export function projectAccessoryAnchors(
  scene: AccessoryScene,
  w: number,
  h: number,
): AccessoryAnchors {
  const result: AccessoryAnchors = {
    rings: [],
    wrists: [],
    hat: null,
    necklace: null,
  };
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
    return result;
  for (const hand of scene.hands ?? []) {
    if ((hand.confidence ?? 0) < 0.6) continue;
    const p = hand.landmarks,
      wrist = point(p[0], w, h),
      index = point(p[5], w, h),
      pinky = point(p[17], w, h),
      middle = point(p[9], w, h);
    if (!index || !pinky) continue;
    const palm = distance(index, pinky);
    if (palm < 4 || palm > Math.min(w, h) * 0.7) continue;
    if (wrist && middle) {
      const length = distance(wrist, middle);
      if (length > 2)
        result.wrists.push({
          x: wrist.x + ((wrist.x - middle.x) / length) * palm * 0.12,
          y: wrist.y + ((wrist.y - middle.y) / length) * palm * 0.12,
          width: palm * 0.64,
          height: palm * 0.19,
          rotation:
            Math.atan2(wrist.y - middle.y, wrist.x - middle.x) - Math.PI / 2,
          source: "hand",
          support: hand.confidence,
        });
    }
    const mcp = point(p[13], w, h),
      pip = point(p[14], w, h);
    if (mcp && pip && distance(mcp, pip) > 2)
      result.rings.push({
        x: mcp.x * 0.65 + pip.x * 0.35,
        y: mcp.y * 0.65 + pip.y * 0.35,
        width: palm * 0.2,
        height: palm * 0.075,
        rotation: Math.atan2(pip.y - mcp.y, pip.x - mcp.x) - Math.PI / 2,
        source: "hand",
        support: hand.confidence,
      });
  }
  const pose = scene.pose;
  for (const [wristIndex, elbowIndex, side] of [
    [15, 13, "left"],
    [16, 14, "right"],
  ] as const) {
    const wristRaw = visiblePosePoint(pose, wristIndex, 0.65),
      elbowRaw = visiblePosePoint(pose, elbowIndex, 0.55);
    if (!wristRaw || !elbowRaw) continue;
    const wrist = { x: wristRaw.x * w, y: wristRaw.y * h },
      elbow = { x: elbowRaw.x * w, y: elbowRaw.y * h };
    if (result.wrists.some((a) => distance(a, wrist) < Math.min(w, h) * 0.12))
      continue;
    const length = distance(wrist, elbow);
    if (length < 8 || length > Math.max(w, h) * 0.8) continue;
    result.wrists.push({
      x: wrist.x + (elbow.x - wrist.x) * 0.045,
      y: wrist.y + (elbow.y - wrist.y) * 0.045,
      width: length * 0.23,
      height: length * 0.075,
      rotation: Math.atan2(elbow.y - wrist.y, elbow.x - wrist.x) - Math.PI / 2,
      source: "pose",
      support: Math.min(wristRaw.visibility ?? 0, elbowRaw.visibility ?? 0),
      side,
    });
  }
  const left = visiblePosePoint(pose, 11, 0.6),
    right = visiblePosePoint(pose, 12, 0.6);
  if (left && right) {
    const l = { x: left.x * w, y: left.y * h },
      r = { x: right.x * w, y: right.y * h },
      span = distance(l, r);
    if (span > 12) {
      const rotation = Math.atan2(l.y - r.y, l.x - r.x);
      result.necklace = {
        x: (l.x + r.x) / 2,
        y: (l.y + r.y) / 2,
        width: span * 0.7,
        height: span * 0.3,
        rotation:
          Math.abs(rotation) > Math.PI / 2
            ? rotation - Math.sign(rotation) * Math.PI
            : rotation,
        source: "pose",
        support: Math.min(left.visibility ?? 0, right.visibility ?? 0),
      };
    }
  }
  const face = scene.landmarks ?? [];
  if (validFace(face)) {
    const metrics = faceMetrics(face, w, h),
      forehead = point(face[10], w, h),
      a = point(face[234], w, h),
      b = point(face[454], w, h);
    if (metrics && forehead && a && b) {
      const span = distance(a, b);
      let center = (a.x + b.x) / 2,
        headSpan = span;
      // The top-of-head silhouette includes hair outside the facial oval. This is
      // class-mask geometry, not an inferred hidden skull or hairstyle model.
      const body = scene.bodyMask;
      if (body) {
        let minX = Infinity,
          maxX = -Infinity;
        const dx = body.faceAnchor ? face[10].x - body.faceAnchor.x : 0,
          dy = body.faceAnchor ? face[10].y - body.faceAnchor.y : 0;
        for (let i = 0; i < body.labels.length; i++) {
          const y = (Math.floor(i / body.width) / body.height + dy) * h,
            x = ((i % body.width) / body.width + dx) * w;
          if (
            (body.labels[i] === 1 || body.labels[i] === 3) &&
            body.confidence[i] > 0.7 &&
            y > forehead.y - metrics.height * 0.8 &&
            y < forehead.y + metrics.height * 0.1 &&
            Math.abs(x - forehead.x) < span * 1.3
          ) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
        }
        if (Number.isFinite(minX) && maxX - minX > span * 0.65) {
          center = ((minX + maxX) / 2) * 0.8 + center * 0.2;
          headSpan = Math.max(span, maxX - minX);
        }
      }
      if (span > 10)
        result.hat = {
          x: center,
          y: forehead.y - metrics.height * 0.055,
          width: headSpan * 1.2,
          height: metrics.height * 0.38,
          rotation: metrics.rotation,
          source: "face",
        };
    }
  }
  return result;
}
export function accessoryAnchorStatus(
  accessories: MakeupLook["accessories"],
  scene: AccessoryScene,
  w = 1,
  h = 1,
) {
  const width = w === 1 ? 1000 : w,
    height = h === 1 ? 1000 : h;
  const anchors = projectAccessoryAnchors(scene, width, height),
    hasFace = validFace(scene.landmarks ?? []);
  return ACCESSORY_KEYS.filter((key) => accessories[key]).map((key) => {
    const found =
      key === "hat"
        ? anchors.hat
          ? [anchors.hat]
          : []
        : key === "ring"
          ? anchors.rings
          : key === "necklace"
            ? anchors.necklace
              ? [anchors.necklace]
              : hasFace
                ? [{ source: "face" }]
                : []
            : key === "glasses" || key === "earrings"
              ? hasFace
                ? [{ source: "face" }]
                : []
              : anchors.wrists;
    return {
      key: key as AccessoryKey,
      available: found.length > 0,
      source: found[0]?.source ?? null,
      reason: found.length
        ? "Geometric landmark projection; size and depth are not measured."
        : key === "hat" || key === "glasses" || key === "earrings"
          ? "A visible tracked face is needed."
          : key === "necklace"
            ? "A tracked face or supported shoulder pose is needed."
            : key === "ring"
              ? "A sufficiently supported, in-frame hand is needed."
              : "A supported hand or visible wrist/elbow pose is needed.",
    };
  });
}
export interface ExtendedAccessoryFrame extends AccessoryScene {
  look: MakeupLook;
  compare: number;
}

/** Original procedural jewellery/hat drawing, aligned to the measured 2D projections. */
export class ExtendedAccessoryRenderer {
  private layer = document.createElement("canvas");
  private mask = document.createElement("canvas");
  private lastMask: BodySegmentation | null = null;
  private lastKind = "";
  private metallic(ctx: CanvasRenderingContext2D, width: number) {
    const g = ctx.createLinearGradient(
      -width / 2,
      -width / 4,
      width / 2,
      width / 3,
    );
    g.addColorStop(0, "#6e4a25");
    g.addColorStop(0.25, "#d4b476");
    g.addColorStop(0.45, "#fff4ce");
    g.addColorStop(0.65, "#ad8044");
    g.addColorStop(1, "#76512b");
    return g;
  }
  private prepare(w: number, h: number) {
    if (this.layer.width !== w) this.layer.width = w;
    if (this.layer.height !== h) this.layer.height = h;
    const c = this.layer.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    return c;
  }
  private semanticMask(
    body: BodySegmentation,
    kind: "hat" | "body",
    brimY = 0,
  ) {
    if (this.lastMask === body && this.lastKind === kind + brimY) return;
    this.lastMask = body;
    this.lastKind = kind + brimY;
    this.mask.width = body.width;
    this.mask.height = body.height;
    const ctx = this.mask.getContext("2d")!,
      image = ctx.createImageData(body.width, body.height);
    for (let i = 0; i < body.labels.length; i++) {
      const label = BODY_LABELS[body.labels[i]],
        confidence = body.confidence[i],
        y = Math.floor(i / body.width) / body.height;
      const excluded =
        kind === "hat"
          ? label === "hair" && y > brimY
          : label === "background" || label === "hair";
      const removal =
        excluded && confidence > 0.65
          ? Math.min(1, (confidence - 0.65) / 0.25)
          : 0;
      image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = 255;
      image.data[i * 4 + 3] = (1 - removal) * 255;
    }
    ctx.putImageData(image, 0, 0);
  }
  private compose(
    ctx: CanvasRenderingContext2D,
    frame: ExtendedAccessoryFrame,
    w: number,
    h: number,
    kind: "hat" | "body",
    brimY = 0,
  ) {
    if (frame.bodyMask) {
      this.semanticMask(frame.bodyMask, kind, brimY);
      const layer = this.layer.getContext("2d")!;
      layer.globalCompositeOperation = "destination-in";
      layer.drawImage(this.mask, 0, 0, w, h);
      layer.globalCompositeOperation = "source-over";
    }
    ctx.save();
    if (frame.compare >= 0) {
      ctx.beginPath();
      ctx.rect(frame.compare * w, 0, (1 - frame.compare) * w, h);
      ctx.clip();
    }
    ctx.drawImage(this.layer, 0, 0, w, h);
    ctx.restore();
  }
  drawHat(
    ctx: CanvasRenderingContext2D,
    frame: ExtendedAccessoryFrame,
    w: number,
    h: number,
  ) {
    if (!frame.look.accessories.hat) return;
    const a = projectAccessoryAnchors(frame, w, h).hat;
    if (!a) return;
    const c = this.prepare(w, h);
    c.save();
    c.translate(a.x, a.y);
    c.rotate(a.rotation);
    const shade = c.createLinearGradient(0, -a.height, 0, a.height * 0.15);
    shade.addColorStop(0, "#eee2cc");
    shade.addColorStop(0.55, "#c9ae89");
    shade.addColorStop(1, "#9e7a52");
    c.fillStyle = shade;
    c.strokeStyle = "#8e6a46";
    c.lineWidth = Math.max(1, a.width * 0.004);
    c.beginPath();
    c.moveTo(-a.width * 0.36, 0);
    c.bezierCurveTo(
      -a.width * 0.32,
      -a.height * 0.8,
      -a.width * 0.28,
      -a.height,
      0,
      -a.height * 0.82,
    );
    c.bezierCurveTo(
      a.width * 0.28,
      -a.height,
      a.width * 0.32,
      -a.height * 0.8,
      a.width * 0.36,
      0,
    );
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#694b48";
    c.beginPath();
    c.moveTo(-a.width * 0.35, -a.height * 0.2);
    c.quadraticCurveTo(0, -a.height * 0.1, a.width * 0.35, -a.height * 0.2);
    c.lineTo(a.width * 0.36, 0);
    c.quadraticCurveTo(0, a.height * 0.07, -a.width * 0.36, 0);
    c.closePath();
    c.fill();
    c.fillStyle = shade;
    c.beginPath();
    c.ellipse(
      0,
      a.height * 0.025,
      a.width * 0.5,
      a.height * 0.19,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.stroke();
    c.restore();
    this.compose(ctx, frame, w, h, "hat", a.y / h);
  }
  drawPoseNecklace(
    ctx: CanvasRenderingContext2D,
    frame: ExtendedAccessoryFrame,
    w: number,
    h: number,
  ) {
    if (!frame.look.accessories.necklace || validFace(frame.landmarks ?? []))
      return;
    const a = projectAccessoryAnchors(frame, w, h).necklace;
    if (!a) return;
    const c = this.prepare(w, h);
    c.save();
    c.translate(a.x, a.y);
    c.rotate(a.rotation);
    c.strokeStyle = this.metallic(c, a.width);
    c.lineWidth = Math.max(1.3, a.width * 0.013);
    c.beginPath();
    c.moveTo(-a.width * 0.5, 0);
    c.quadraticCurveTo(0, a.height * 1.8, a.width * 0.5, 0);
    c.stroke();
    c.fillStyle = this.metallic(c, a.width * 0.08);
    c.beginPath();
    c.ellipse(
      0,
      a.height * 0.9,
      a.width * 0.024,
      a.width * 0.035,
      0,
      0,
      Math.PI * 2,
    );
    c.fill();
    c.restore();
    this.compose(ctx, frame, w, h, "body");
  }
  drawBody(
    ctx: CanvasRenderingContext2D,
    frame: ExtendedAccessoryFrame,
    w: number,
    h: number,
  ) {
    if (
      !frame.look.accessories.ring &&
      !frame.look.accessories.bracelet &&
      !frame.look.accessories.watch
    )
      return;
    const anchors = projectAccessoryAnchors(frame, w, h),
      c = this.prepare(w, h);
    if (frame.look.accessories.ring)
      for (const a of anchors.rings) {
        c.save();
        c.translate(a.x, a.y);
        c.rotate(a.rotation);
        c.strokeStyle = this.metallic(c, a.width);
        c.lineWidth = Math.max(1.5, a.width * 0.15);
        c.beginPath();
        c.ellipse(0, 0, a.width / 2, a.height / 2, 0, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = "#fbf0d5";
        c.beginPath();
        c.moveTo(-a.width * 0.15, -a.height * 0.55);
        c.lineTo(0, -a.height * 1.15);
        c.lineTo(a.width * 0.15, -a.height * 0.55);
        c.lineTo(0, -a.height * 0.08);
        c.closePath();
        c.fill();
        c.restore();
      }
    for (const a of anchors.wrists) {
      c.save();
      c.translate(a.x, a.y);
      c.rotate(a.rotation);
      if (frame.look.accessories.bracelet) {
        c.strokeStyle = this.metallic(c, a.width);
        c.lineWidth = Math.max(2, a.width * 0.075);
        c.beginPath();
        c.ellipse(
          0,
          a.height * 0.8,
          a.width / 2,
          a.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        c.stroke();
        c.strokeStyle = "rgba(255,245,210,.7)";
        c.lineWidth = Math.max(0.7, a.width * 0.015);
        c.beginPath();
        c.ellipse(
          0,
          a.height * 0.72,
          a.width * 0.49,
          a.height * 0.43,
          0,
          0.1,
          Math.PI - 0.1,
        );
        c.stroke();
      }
      if (frame.look.accessories.watch) {
        const dial = a.width * 0.5;
        c.fillStyle = "#62474a";
        c.beginPath();
        c.roundRect(
          -dial * 0.36,
          -a.width * 0.55,
          dial * 0.72,
          a.width * 1.1,
          dial * 0.16,
        );
        c.fill();
        c.fillStyle = this.metallic(c, dial);
        c.beginPath();
        c.roundRect(
          -dial * 0.59,
          -dial * 0.59,
          dial * 1.18,
          dial * 1.18,
          dial * 0.18,
        );
        c.fill();
        c.fillStyle = "#faf3e6";
        c.beginPath();
        c.roundRect(
          -dial * 0.48,
          -dial * 0.48,
          dial * 0.96,
          dial * 0.96,
          dial * 0.1,
        );
        c.fill();
        c.strokeStyle = "#725d48";
        c.lineWidth = Math.max(1, dial * 0.03);
        for (let t = 0; t < 12; t++) {
          const angle = (t * Math.PI) / 6;
          c.beginPath();
          c.moveTo(
            Math.sin(angle) * dial * 0.34,
            -Math.cos(angle) * dial * 0.34,
          );
          c.lineTo(
            Math.sin(angle) * dial * 0.41,
            -Math.cos(angle) * dial * 0.41,
          );
          c.stroke();
        }
        c.lineWidth = Math.max(1, dial * 0.045);
        c.beginPath();
        c.moveTo(-dial * 0.17, -dial * 0.18);
        c.lineTo(0, 0);
        c.lineTo(dial * 0.24, -dial * 0.11);
        c.stroke();
      }
      c.restore();
    }
    this.compose(ctx, frame, w, h, "body");
  }
  dispose() {
    this.layer.width =
      this.layer.height =
      this.mask.width =
      this.mask.height =
        1;
    this.lastMask = null;
  }
}
