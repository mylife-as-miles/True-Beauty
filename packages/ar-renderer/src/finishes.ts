import type { MakeupLayer, MakeupLayerName } from "../../makeup-engine/src";
import { lightingVector, type LightingSettings } from "./lighting";
import { surfaceNormal, type FaceSurface } from "./surface";
/** A deterministic face-space flake field. No animation, screen-space particles or time seed. */
function hash(x: number, y: number) {
  let n = Math.imul(x + 811, 374761393) ^ Math.imul(y + 937, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const kindFor = (name: MakeupLayerName) =>
  ["lipstick", "lipgloss", "lipliner"].includes(name)
    ? "lip"
    : name === "eyeshadow"
      ? "eye"
      : "face";
export function drawCanvasFinish(
  canvas: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  layer: MakeupLayer,
  name: MakeupLayerName,
  surface: FaceSurface,
  lighting: LightingSettings,
) {
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d")!,
    w = canvas.width,
    h = canvas.height;
  // Source-normalized to canvas projection keeps material positions attached when the head rolls.
  const project = (x: number, y: number) => {
    const p = surface.toSource(x, y);
    return { x: p.x * w, y: p.y * h };
  };
  const left = surface.toSource(0, 0),
    right = surface.toSource(1, 0),
    eye = Math.hypot((right.x - left.x) * w, (right.y - left.y) * h);
  const light = lightingVector(lighting),
    c = Math.cos(surface.rotation),
    s = Math.sin(surface.rotation),
    lf: [number, number, number] = [
      light[0] * c + light[1] * s,
      -light[0] * s + light[1] * c,
      light[2],
    ],
    strength = 0.35 + 0.65 * lighting.intensity;
  const warm =
    lighting.preset === "moonlight"
      ? "211,226,255"
      : lighting.preset === "golden-hour"
        ? "255,230,191"
        : "255,249,239";
  const oval = (
    x: number,
    y: number,
    rx: number,
    ry: number,
    opacity: number,
  ) => {
    const p = project(x, y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(surface.rotation);
    ctx.scale(Math.max(0.5, rx * eye), Math.max(0.5, ry * eye));
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${warm},${opacity})`);
    g.addColorStop(0.3, `rgba(${warm},${opacity * 0.58})`);
    g.addColorStop(1, `rgba(${warm},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const kind = kindFor(name);
  const [lx, ly, rx, ry] = surface.lip;
  if (layer.finish === "gloss") {
    if (kind === "lip") {
      oval(
        lx + lf[0] * rx * 0.55,
        surface.lipBands[1] + lf[1] * surface.lipBands[3] * 0.32,
        rx * 0.66,
        surface.lipBands[3] * 0.35,
        0.68 * strength,
      );
      oval(
        lx - rx * 0.28 + lf[0] * rx * 0.3,
        surface.lipBands[0],
        rx * 0.3,
        surface.lipBands[2] * 0.3,
        0.34 * strength,
      );
    } else if (kind === "eye")
      for (const side of [0, 2])
        oval(
          surface.eyes[side] + lf[0] * 0.05,
          surface.eyes[side + 1] + lf[1] * 0.03,
          0.15,
          0.045,
          0.27 * strength,
        );
    else {
      oval(
        -0.44 + lf[0] * 0.09,
        0.36 + lf[1] * 0.08,
        0.19,
        0.08,
        0.22 * strength,
      );
      oval(
        0.44 + lf[0] * 0.09,
        0.36 + lf[1] * 0.08,
        0.19,
        0.08,
        0.22 * strength,
      );
    }
  }
  if (layer.finish === "shimmer" || layer.finish === "glitter") {
    const glitter = layer.finish === "glitter",
      density = glitter ? 72 : 112,
      threshold = glitter ? 0.78 : 0.82;
    const bounds =
      kind === "lip"
        ? [-0.27, 0.27, -0.1, 0.1]
        : kind === "eye"
          ? [-0.7, 0.7, -0.35, 0.15]
          : [-0.9, 0.9, -0.75, 1.45];
    for (
      let ix = Math.floor(bounds[0] * density);
      ix < Math.ceil(bounds[1] * density);
      ix++
    )
      for (
        let iy = Math.floor(bounds[2] * density);
        iy < Math.ceil(bounds[3] * density);
        iy++
      ) {
        const seed = hash(ix, iy);
        if (seed < threshold) continue;
        const mx = (ix + 0.2 + hash(ix + 71, iy) * 0.6) / density,
          my = (iy + 0.2 + hash(ix, iy + 53) * 0.6) / density,
          x = kind === "lip" ? lx + (mx * rx) / 0.25 : mx,
          y = kind === "lip" ? ly + (my * ry) / 0.08 : my;
        if (
          kind === "lip" &&
          (Math.abs(x - lx) > rx * 1.1 || Math.abs(y - ly) > ry * 1.15)
        )
          continue;
        if (
          kind === "eye" &&
          Math.min(
            Math.abs(x - surface.eyes[0]),
            Math.abs(x - surface.eyes[2]),
          ) > 0.35
        )
          continue;
        const n = surfaceNormal(x, y, kind, surface),
          half = [lf[0], lf[1], lf[2] + 1],
          len = Math.hypot(...half),
          ndh = Math.max(
            0,
            (n[0] * half[0] + n[1] * half[1] + n[2] * half[2]) / len,
          ),
          response = Math.pow(ndh, glitter ? 56 : 18);
        const alpha =
          (glitter ? 0.15 + response * 0.78 : 0.08 + response * 0.32) *
          strength;
        if (alpha < 0.025) continue;
        const p = project(x, y),
          size = eye * (glitter ? 0.0038 : 0.0019) * (0.6 + seed * 0.6);
        ctx.fillStyle = `rgba(${warm},${alpha})`;
        ctx.beginPath();
        if (glitter) {
          ctx.moveTo(p.x, p.y - size);
          ctx.lineTo(p.x + size * 0.7, p.y);
          ctx.lineTo(p.x, p.y + size);
          ctx.lineTo(p.x - size * 0.7, p.y);
          ctx.closePath();
        } else ctx.arc(p.x, p.y, Math.max(0.2, size), 0, Math.PI * 2);
        ctx.fill();
      }
    if (kind === "lip")
      oval(
        lx + lf[0] * rx * 0.3,
        ly + ry * 0.35,
        rx * 0.7,
        ry * 0.5,
        (layer.finish === "shimmer" ? 0.12 : 0.075) * strength,
      );
  }
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = "source-over";
}
