/** Creative image-light grading only. Never feed this preview into cosmetic analysis. */
export type LightingPreset =
  "neutral" | "daylight" | "golden-hour" | "moonlight";
export interface LightingSettings {
  preset: LightingPreset;
  intensity: number;
  direction: { x: number; y: number };
}
export const LIGHTING_PRESETS: ReadonlyArray<{
  id: LightingPreset;
  name: string;
  description: string;
}> = [
  {
    id: "neutral",
    name: "Original light",
    description: "Keep the photograph’s original colour.",
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "A clean, gently cool studio-light interpretation.",
  },
  {
    id: "golden-hour",
    name: "Golden hour",
    description: "Warm highlights and a softer amber balance.",
  },
  {
    id: "moonlight",
    name: "Moonlight",
    description: "A restrained cool blue evening interpretation.",
  },
];
export const DEFAULT_LIGHTING: LightingSettings = {
  preset: "neutral",
  intensity: 0.65,
  direction: { x: -0.45, y: -0.55 },
};
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export function normalizeLighting(
  input?: Partial<LightingSettings> | null,
): LightingSettings {
  return {
    preset: LIGHTING_PRESETS.some((p) => p.id === input?.preset)
      ? input!.preset!
      : "neutral",
    intensity:
      typeof input?.intensity === "number" && Number.isFinite(input.intensity)
        ? clamp(input.intensity, 0, 1)
        : DEFAULT_LIGHTING.intensity,
    direction: {
      x:
        typeof input?.direction?.x === "number" &&
        Number.isFinite(input.direction.x)
          ? clamp(input.direction.x, -1, 1)
          : DEFAULT_LIGHTING.direction.x,
      y:
        typeof input?.direction?.y === "number" &&
        Number.isFinite(input.direction.y)
          ? clamp(input.direction.y, -1, 1)
          : DEFAULT_LIGHTING.direction.y,
    },
  };
}
export function lightingVector(
  settings: LightingSettings,
): [number, number, number] {
  const x = settings.direction.x * 0.65,
    y = settings.direction.y * 0.65,
    z = 0.9,
    length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}
export function lightingGrade(settings: LightingSettings): {
  tint: [number, number, number];
  amount: number;
} {
  const tint: Record<LightingPreset, [number, number, number]> = {
    neutral: [1, 1, 1],
    daylight: [1.015, 1.025, 1.065],
    "golden-hour": [1.12, 1.025, 0.9],
    moonlight: [0.89, 0.97, 1.12],
  };
  return {
    tint: tint[settings.preset],
    amount: settings.preset === "neutral" ? 0 : settings.intensity,
  };
}
/** Canvas fallback and GLSL use the same bounded channel/exposure transform. */
export function gradePixel(
  rgb: readonly number[],
  x: number,
  y: number,
  settings: LightingSettings,
): [number, number, number] {
  const { tint, amount } = lightingGrade(settings);
  if (amount === 0) return [rgb[0], rgb[1], rgb[2]];
  const key =
    ((x - 0.5) * -settings.direction.x + (y - 0.5) * -settings.direction.y) *
    0.12;
  return [0, 1, 2].map((i) =>
    clamp(rgb[i] * (1 + (tint[i] - 1) * amount) * (1 + key * amount), 0, 1),
  ) as [number, number, number];
}
