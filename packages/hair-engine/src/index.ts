/** Hair studio parameters and preference-driven care. No hairstyle model or hair-health diagnosis is implied. */
export type HairColorMode = "solid" | "ombre" | "balayage" | "highlights";
export interface HairPalette {
  id: string;
  name: string;
  color: string;
  secondaryColor: string;
  mode: HairColorMode;
  family: "natural" | "expressive";
}
export const HAIR_PALETTES: HairPalette[] = [
  {
    id: "espresso",
    name: "Espresso",
    color: "#332824",
    secondaryColor: "#5e4235",
    mode: "solid",
    family: "natural",
  },
  {
    id: "chocolate",
    name: "Dark chocolate",
    color: "#4c3027",
    secondaryColor: "#82533a",
    mode: "balayage",
    family: "natural",
  },
  {
    id: "copper",
    name: "Burnished copper",
    color: "#9a4c2e",
    secondaryColor: "#cc8d54",
    mode: "solid",
    family: "natural",
  },
  {
    id: "honey",
    name: "Honey ribbons",
    color: "#775335",
    secondaryColor: "#c49b62",
    mode: "highlights",
    family: "natural",
  },
  {
    id: "rose",
    name: "Rose quartz",
    color: "#66414c",
    secondaryColor: "#c28a98",
    mode: "ombre",
    family: "expressive",
  },
  {
    id: "midnight",
    name: "Midnight blue",
    color: "#262b3c",
    secondaryColor: "#5c7292",
    mode: "balayage",
    family: "expressive",
  },
  {
    id: "plum",
    name: "Mulberry",
    color: "#4f2941",
    secondaryColor: "#96577b",
    mode: "ombre",
    family: "expressive",
  },
  {
    id: "silver",
    name: "Smoked silver",
    color: "#64646a",
    secondaryColor: "#b8b8bf",
    mode: "solid",
    family: "expressive",
  },
];
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
function rgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error("Invalid hair colour");
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}
/** Pure matching function used by shader/fallback experiments; returns linear blending weights per root-to-tip coordinate. */
export function resolveHairGradient(
  palette: Pick<HairPalette, "color" | "secondaryColor" | "mode">,
  rootToTip: number,
  strandCoordinate = 0,
): { rgb: [number, number, number]; weight: number } {
  const a = rgb(palette.color),
    b = rgb(palette.secondaryColor),
    t = clamp(rootToTip);
  const ribbon = 0.5 + 0.5 * Math.sin(strandCoordinate * 44 + t * 3);
  const weight =
    palette.mode === "solid"
      ? 0
      : palette.mode === "ombre"
        ? smooth(0.25, 0.9, t)
        : palette.mode === "balayage"
          ? smooth(0.15, 0.95, t) * smooth(0.25, 0.9, ribbon)
          : smooth(0.58, 0.94, ribbon) * 0.8;
  return {
    rgb: a.map((v, i) => v * (1 - weight) + b[i] * weight) as [
      number,
      number,
      number,
    ],
    weight,
  };
}
/** Luminance-preserving preview color, no bleach/lift chemistry prediction. */
export function recolorHairPixel(
  original: [number, number, number],
  mask: number,
  palette: HairPalette,
  rootToTip: number,
  strandCoordinate = 0,
  strength = 0.65,
): [number, number, number] {
  const target = resolveHairGradient(palette, rootToTip, strandCoordinate).rgb;
  const lum =
    original[0] * 0.2126 + original[1] * 0.7152 + original[2] * 0.0722;
  const targetLum =
    target[0] * 0.2126 + target[1] * 0.7152 + target[2] * 0.0722;
  const amount = clamp(mask) * clamp(strength);
  return target.map((v, i) =>
    clamp(
      original[i] * (1 - amount) +
        clamp((v * (0.12 + lum)) / (0.12 + targetLum)) * amount,
    ),
  ) as [number, number, number];
}
export interface HairPreferences {
  texture?: "straight" | "wavy" | "curly" | "coily" | "unspecified";
  scalp?: "dry" | "oily" | "balanced" | "sensitive";
  colorTreated?: boolean;
  goals?: Array<"moisture" | "definition" | "volume" | "gentle-care">;
  washFrequency?: string;
}
export interface HairCareStep {
  id: string;
  title: string;
  instruction: string;
  reason: string;
  frequency: string;
  evidence: "general-cosmetic-guidance" | "user-preference";
}
export function buildHairRoutine(preferences: HairPreferences): {
  steps: HairCareStep[];
  notes: string[];
} {
  const steps: HairCareStep[] = [
    {
      id: "cleanse",
      title: "Cleanse as needed",
      instruction:
        "Use a cleanser suited to your scalp and follow its label. Adjust timing to buildup, comfort and your own routine.",
      reason:
        preferences.scalp === "sensitive"
          ? "You reported a sensitive scalp; keep the routine simple."
          : "Start from your scalp needs rather than an inferred hair diagnosis.",
      frequency: preferences.washFrequency ?? "Your preferred wash day",
      evidence: "user-preference",
    },
    {
      id: "condition",
      title: "Condition lengths",
      instruction:
        "Apply conditioner to lengths and detangle gently according to the label.",
      reason:
        preferences.texture === "curly" || preferences.texture === "coily"
          ? "You selected a textured-hair routine. Adjust slip and richness to how your hair feels."
          : "A conditioning step can improve manageability.",
      frequency: "After cleansing",
      evidence: "general-cosmetic-guidance",
    },
  ];
  if (preferences.goals?.includes("definition"))
    steps.push({
      id: "style",
      title: "Style for definition",
      instruction:
        "Try a small amount of a styling product on damp hair. Compare the hold and feel before adding more.",
      reason: "You selected definition as a goal.",
      frequency: "When styling",
      evidence: "user-preference",
    });
  if (preferences.colorTreated)
    steps.push({
      id: "color-care",
      title: "Care for colour",
      instruction:
        "Choose products labelled for your colour treatment and follow your stylist’s aftercare. Use heat protection if heat styling.",
      reason: "You reported colour-treated hair.",
      frequency: "When washing or heat styling",
      evidence: "user-preference",
    });
  return {
    steps,
    notes: [
      "Hair characteristics are user-provided; the app has not diagnosed hair or scalp health.",
      "Preview shades are digital simulations. Results on physical hair depend on starting colour, treatment and lighting.",
      "Persistent scalp irritation or sudden hair changes warrant qualified professional advice.",
    ],
  };
}
export interface HairstyleIdea {
  id: string;
  name: string;
  description: string;
  technology: "inspiration";
  image?: string;
}
export const HAIRSTYLE_IDEAS: HairstyleIdea[] = [
  {
    id: "soft-wave",
    name: "Soft movement",
    description: "Loose movement, a relaxed part and softly defined ends.",
    technology: "inspiration",
  },
  {
    id: "sculpted-crop",
    name: "Sculpted crop",
    description: "A close silhouette with a defined shape and visible texture.",
    technology: "inspiration",
  },
  {
    id: "braided-crown",
    name: "Braided expression",
    description:
      "A gathered braid or twist arrangement with room for personal expression.",
    technology: "inspiration",
  },
  {
    id: "natural-volume",
    name: "Natural volume",
    description:
      "Celebrate texture with a shape and finishing routine you enjoy.",
    technology: "inspiration",
  },
];
