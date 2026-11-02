/** Structured, editable Look Composer. Cosmetic previews do not alter skin assessments. */
export type MakeupFinish = "matte" | "gloss" | "shimmer" | "glitter";
export interface MakeupLayer {
  enabled: boolean;
  color: string;
  opacity: number;
  finish: MakeupFinish;
}
export const MAKEUP_LAYERS = [
  "lipstick",
  "blush",
  "eyeshadow",
  "foundation",
  "eyeliner",
  "mascara",
  "brows",
  "contour",
  "bronzer",
  "highlighter",
  "lipliner",
  "lipgloss",
] as const;
export type MakeupLayerName = (typeof MAKEUP_LAYERS)[number];
export interface HairLook {
  enabled: boolean;
  color: string;
  secondaryColor: string;
  opacity: number;
  mode: "solid" | "ombre" | "highlights" | "balayage";
}
export type MakeupLook = Record<MakeupLayerName, MakeupLayer> & {
  hair: HairLook;
  accessories: { glasses: boolean; earrings: boolean; necklace: boolean };
  reshape: number;
};
const layer = (
  color: string,
  opacity: number,
  finish: MakeupFinish = "matte",
  enabled = true,
): MakeupLayer => ({ enabled, color, opacity, finish });
export function createDefaultLook(): MakeupLook {
  return {
    lipstick: layer("#A45356", 0.55, "gloss"),
    blush: layer("#C47670", 0.32),
    eyeshadow: layer("#967564", 0.24, "shimmer"),
    foundation: layer("#C99B7A", 0.14, "matte", false),
    eyeliner: layer("#2B2020", 0.5, "matte", false),
    mascara: layer("#211C1C", 0.45, "matte", false),
    brows: layer("#45312C", 0.25, "matte", false),
    contour: layer("#815C4C", 0.22, "matte", false),
    bronzer: layer("#B27C51", 0.2, "matte", false),
    highlighter: layer("#F6DBBD", 0.2, "shimmer", false),
    lipliner: layer("#834449", 0.4, "matte", false),
    lipgloss: layer("#F5D0CB", 0.25, "gloss", false),
    hair: {
      enabled: false,
      color: "#783D31",
      secondaryColor: "#C99C70",
      opacity: 0.5,
      mode: "solid",
    },
    accessories: { glasses: false, earrings: false, necklace: false },
    reshape: 0,
  };
}
export interface LookPreset {
  id: string;
  name: string;
  description: string;
  palette: string[];
  look: MakeupLook;
}
const preset = (
  id: string,
  name: string,
  description: string,
  colors: [string, string, string],
  finish: MakeupFinish,
  opacity: number,
): LookPreset => {
  const look = createDefaultLook();
  look.lipstick = { ...look.lipstick, color: colors[0], finish, opacity };
  look.blush.color = colors[1];
  look.eyeshadow.color = colors[2];
  return { id, name, description, palette: colors, look };
};
export const LOOK_PRESETS: LookPreset[] = [
  preset(
    "soft-glow",
    "Soft glow",
    "A rose lip, warm cheeks, and a little light.",
    ["#A45356", "#C47670", "#967564"],
    "gloss",
    0.55,
  ),
  preset(
    "rose-hour",
    "Rose hour",
    "Petal pink, luminous skin, softly defined eyes.",
    ["#B94865", "#DA8D94", "#AB7F93"],
    "gloss",
    0.65,
  ),
  preset(
    "golden",
    "Golden muse",
    "Sunlit bronze with a warm caramel lip.",
    ["#A16247", "#B47B51", "#AF8B53"],
    "shimmer",
    0.56,
  ),
  preset(
    "berry",
    "After hours",
    "A deeper berry lip and expressive smoky eyes.",
    ["#792C48", "#AE637D", "#59415D"],
    "matte",
    0.78,
  ),
  preset(
    "bare",
    "Barely there",
    "A sheer peach tint for everyday expression.",
    ["#BB7E6D", "#D0937A", "#B19480"],
    "matte",
    0.28,
  ),
  preset(
    "editorial",
    "Studio violet",
    "Expressive plum with a soft metallic finish.",
    ["#874666", "#B87999", "#735C99"],
    "glitter",
    0.75,
  ),
];
export function cloneLook(look: MakeupLook): MakeupLook {
  return structuredClone(look);
}
/** Input boundary used by persisted looks, imports and tool calls. Unknown keys are ignored. */
export function normalizeLook(input: unknown): MakeupLook {
  const result = createDefaultLook();
  if (!input || typeof input !== "object") return result;
  const value = input as Record<string, unknown>;
  for (const key of MAKEUP_LAYERS) {
    const raw = value[key];
    if (!raw || typeof raw !== "object") continue;
    const s = raw as Record<string, unknown>;
    result[key] = {
      enabled: typeof s.enabled === "boolean" ? s.enabled : result[key].enabled,
      color:
        typeof s.color === "string" && /^#[0-9a-f]{6}$/i.test(s.color)
          ? s.color
          : result[key].color,
      opacity:
        typeof s.opacity === "number" && Number.isFinite(s.opacity)
          ? Math.min(1, Math.max(0, s.opacity))
          : result[key].opacity,
      finish: ["matte", "gloss", "shimmer", "glitter"].includes(
        String(s.finish),
      )
        ? (s.finish as MakeupFinish)
        : result[key].finish,
    };
  }
  const h = value.hair as Partial<HairLook> | undefined;
  if (h && typeof h === "object")
    result.hair = {
      enabled: typeof h.enabled === "boolean" ? h.enabled : false,
      color:
        typeof h.color === "string" && /^#[0-9a-f]{6}$/i.test(h.color)
          ? h.color
          : result.hair.color,
      secondaryColor:
        typeof h.secondaryColor === "string" &&
        /^#[0-9a-f]{6}$/i.test(h.secondaryColor)
          ? h.secondaryColor
          : result.hair.secondaryColor,
      opacity:
        typeof h.opacity === "number" && Number.isFinite(h.opacity)
          ? Math.min(1, Math.max(0, h.opacity))
          : result.hair.opacity,
      mode: ["solid", "ombre", "highlights", "balayage"].includes(
        String(h.mode),
      )
        ? (h.mode as HairLook["mode"])
        : "solid",
    };
  const a = value.accessories as Record<string, unknown> | undefined;
  if (a && typeof a === "object")
    result.accessories = {
      glasses: a.glasses === true,
      earrings: a.earrings === true,
      necklace: a.necklace === true,
    };
  if (typeof value.reshape === "number" && Number.isFinite(value.reshape))
    result.reshape = Math.min(1, Math.max(-1, value.reshape));
  return result;
}
