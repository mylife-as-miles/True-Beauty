export * from "./colourways";
export * from "./lightness";
export * from "./recolor";
import {
  seasonDef,
  type Season,
  type PaletteColor,
} from "../../skin-engine/src/color";
import { rankColourways, type Colourway } from "./colourways";
export type { Season, PaletteColor };
export const SEASON_IDS: Season[] = [
  "light-spring",
  "true-spring",
  "bright-spring",
  "light-summer",
  "true-summer",
  "soft-summer",
  "soft-autumn",
  "true-autumn",
  "deep-autumn",
  "true-winter",
  "deep-winter",
  "bright-winter",
];
export const SEASON_PALETTES = Object.fromEntries(
  SEASON_IDS.map((id) => [id, { id, ...seasonDef(id) }]),
) as Record<
  Season,
  {
    id: Season;
    label: string;
    headline: string;
    description: string;
    palette: PaletteColor[];
  }
>;
export interface Garment {
  id: string;
  name: string;
  category: "upper-body" | "lower-body" | "full-body" | "accessory";
  color: string;
  imageUrl?: string;
  sample: boolean;
  notes?: string;
}
export interface Outfit {
  id: string;
  name: string;
  garments: Garment[];
  season?: Season;
  createdAt: number;
  updatedAt: number;
  kind: "assembled-look";
}
export function createOutfit(
  name: string,
  garments: Garment[],
  season?: Season,
): Outfit {
  if (!name.trim()) throw new Error("Give this outfit a name");
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    garments: garments.map((g) => ({ ...g })),
    season,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    kind: "assembled-look",
  };
}
export function coordinateOutfit(colors: string[], season: Season) {
  const palette = SEASON_PALETTES[season];
  if (!palette) throw new Error("Unknown season");
  const ways: Colourway[] = colors.map((hex, i) => ({
    id: String(i),
    hex,
    name: `Colour ${i + 1}`,
  }));
  return {
    season,
    label: palette.label,
    ranking: rankColourways(ways, palette.palette),
    disclaimer:
      "Season palettes are optional styling heuristics. Lighting affects sampled colours; your own preferences take precedence. These are aesthetic colour-distance comparisons, not measurements of attractiveness.",
  };
}
export interface GarmentPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  flipX?: boolean;
}
export const DEFAULT_PLACEMENT: GarmentPlacement = {
  x: 0.12,
  y: 0.4,
  width: 0.78,
  height: 0.6,
  rotation: 0,
  opacity: 0.93,
};
/** Local static-photo overlay. No learned draping, fit, body segmentation or generated image. */
export function composeGarment(
  ctx: CanvasRenderingContext2D,
  person: CanvasImageSource,
  garment: CanvasImageSource,
  placement: GarmentPlacement,
  size?: { width: number; height: number },
): { technology: "static-photo-compositing"; note: string } {
  const { width: w, height: h } = size ?? ctx.canvas;
  if (
    ![
      placement.x,
      placement.y,
      placement.width,
      placement.height,
      placement.rotation,
      placement.opacity,
    ].every(Number.isFinite) ||
    placement.width <= 0 ||
    placement.height <= 0 ||
    placement.opacity < 0 ||
    placement.opacity > 1
  )
    throw new Error("Invalid placement");
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(person, 0, 0, w, h);
  ctx.globalAlpha = placement.opacity;
  ctx.translate(
    (placement.x + placement.width / 2) * w,
    (placement.y + placement.height / 2) * h,
  );
  ctx.rotate((placement.rotation * Math.PI) / 180);
  if (placement.flipX) ctx.scale(-1, 1);
  ctx.drawImage(
    garment,
    (-placement.width * w) / 2,
    (-placement.height * h) / 2,
    placement.width * w,
    placement.height * h,
  );
  ctx.restore();
  return {
    technology: "static-photo-compositing",
    note: "Manually positioned garment overlay. Does not predict fit, sizing, draping or occlusion.",
  };
}
/** Original procedural sample blouse: transparent product illustration, not a real garment photograph. */
export function sampleGarmentImage(color = "#98645e"): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color))
    throw new Error("Invalid garment colour");
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="650" viewBox="0 0 600 650"><defs><linearGradient id="cloth" x1="0" x2="1"><stop stop-color="${color}"/><stop offset=".4" stop-color="${color}"/><stop offset=".6" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="${color}"/></linearGradient></defs><path d="M205 40Q300 100 395 40L570 185L480 305L410 260L440 615Q300 650 160 615L190 260L120 305L30 185Z" fill="${color}"/><path d="M205 40Q300 100 395 40L365 140Q300 175 235 140Z" fill="#000" opacity=".1"/><path d="M205 40L240 155L300 220L360 155L395 40M300 220V620M190 260L200 575M410 260L400 575" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="4"/><g fill="#e8d8c6">${[290, 365, 440, 515, 590].map((y) => `<circle cx="308" cy="${y}" r="5"/>`).join("")}</g></svg>`)}`;
}
export type AccessoryKind =
  | "glasses"
  | "earrings"
  | "necklace"
  | "hat"
  | "ring"
  | "watch"
  | "bracelet"
  | "bag"
  | "shoes";
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}
export interface AccessoryAnchor {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  confidence: "geometry-estimate";
  tracking: "face" | "hand";
}
/** Face/hand geometry anchors; unsupported body anchors return null rather than guessing. */
export function accessoryAnchor(
  points: readonly Landmark[],
  kind: AccessoryKind,
  tracking: "face" | "hand" = "face",
): AccessoryAnchor | null {
  const point = (i: number) => points[i];
  if (tracking === "hand") {
    if (points.length < 21 || !["ring", "watch", "bracelet"].includes(kind))
      return null;
    const wrist = point(0),
      middle = point(9),
      ring = point(13),
      knuckle = point(14);
    const width = Math.hypot(
      point(5).x - point(17).x,
      point(5).y - point(17).y,
    );
    const a =
      kind === "ring"
        ? { x: (ring.x + knuckle.x) / 2, y: (ring.y + knuckle.y) / 2 }
        : wrist;
    return {
      ...a,
      scale: width * (kind === "ring" ? 0.22 : 0.8),
      rotation:
        Math.atan2(middle.y - wrist.y, middle.x - wrist.x) + Math.PI / 2,
      confidence: "geometry-estimate",
      tracking,
    };
  }
  if (points.length < 468) return null;
  const left = point(33),
    right = point(263),
    chin = point(152),
    forehead = point(10);
  const width = Math.hypot(right.x - left.x, right.y - left.y);
  const angle = Math.atan2(right.y - left.y, right.x - left.x);
  const base = {
    scale: width,
    rotation: angle,
    confidence: "geometry-estimate" as const,
    tracking,
  };
  if (kind === "glasses")
    return {
      ...base,
      x: (left.x + right.x) / 2,
      y: (left.y + right.y) / 2,
      scale: width * 1.35,
    };
  if (kind === "earrings")
    return {
      ...base,
      x: point(234).x,
      y: point(234).y + 0.06,
      scale: width * 0.19,
    };
  if (kind === "necklace")
    return { ...base, x: chin.x, y: chin.y + width * 0.55, scale: width * 1.6 };
  if (kind === "hat")
    return {
      ...base,
      x: forehead.x,
      y: forehead.y - width * 0.3,
      scale: width * 1.7,
    };
  return null;
}
export interface CanvasObject {
  id: string;
  kind: "photo" | "palette" | "garment" | "product" | "note";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  value: string;
}
export function moveCanvasObject(
  objects: CanvasObject[],
  id: string,
  dx: number,
  dy: number,
) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy))
    throw new Error("Invalid movement");
  return objects.map((o) =>
    o.id === id ? { ...o, x: o.x + dx, y: o.y + dy } : o,
  );
}
export interface VirtualTryOnProvider {
  capabilities(): Promise<{
    configured: boolean;
    technology: "generative-virtual-try-on";
    costPerTask: number | null;
    currency: string | null;
  }>;
  start(input: {
    person: Blob;
    garment: Blob;
    consentId: string;
    costAuthorizationId: string;
    category: "upper_body" | "lower_body" | "full_body";
  }): Promise<{ taskId: string }>;
  status(
    taskId: string,
  ): Promise<{
    status: "queued" | "running" | "complete" | "failed";
    resultUrl?: string;
    error?: string;
  }>;
}
