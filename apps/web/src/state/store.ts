import { create } from "zustand";
import {
  createDefaultLook,
  MAKEUP_LAYERS,
  type MakeupLook,
  normalizeLook,
} from "../../../../packages/makeup-engine/src";
import type { VisionSnapshot } from "../../../../packages/vision-core/src";
import type { SavedLook } from "../../../../packages/local-database/src";
import { CompositionSchema } from "../../../../packages/digital-twin/src/contracts";
import type { Space, StudioMode } from "../../../../packages/shared-types/src";
export interface StudioLighting {
  preset: "neutral" | "daylight" | "golden-hour" | "moonlight";
  intensity: number;
  direction: { x: number; y: number };
}
export const DEFAULT_LIGHTING: StudioLighting = {
  preset: "neutral",
  intensity: 0.65,
  direction: { x: -0.35, y: -0.45 },
};
interface EditSnapshot {
  look: MakeupLook;
  lookName: string;
  lighting: StudioLighting;
  activeOutfitId: string | null;
  activeProductIds: string[];
}
interface State {
  portraitProvenance: {
    kind: "ai-generated";
    provider: "perfect-corp";
    feature: "hair" | "clothing";
    createdAt: string;
  } | null;
  originalPortraitUrl: string | null;
  setGeneratedPortrait: (
    url: string,
    provenance: NonNullable<State["portraitProvenance"]>,
    options?: { restored: true },
  ) => void;
  restoreOriginalPortrait: () => void;
  visionOcclusion: boolean;
  setVisionOcclusion: (enabled: boolean) => void;
  portraitUrl: string;
  portraitVision: { url: string; snapshot: VisionSnapshot } | null;
  setPortraitUrl: (url: string) => void;
  setPortraitVision: (url: string, snapshot: VisionSnapshot) => void;
  generationFeature: "hair" | "clothing";
  setGenerationFeature: (feature: "hair" | "clothing") => void;
  activeOutfitId: string | null;
  activeProductIds: string[];
  setCompleteScene: (patch: {
    activeOutfitId?: string | null;
    activeProductIds?: string[];
  }) => void;
  space: Space;
  studioMode: StudioMode;
  look: MakeupLook;
  lookName: string;
  focusLayer: string;
  setFocusLayer: (layer: string) => void;
  maskBackend: "canvas" | "opencv";
  setMaskBackend: (backend: "canvas" | "opencv") => void;
  lighting: StudioLighting;
  setLighting: (patch: Partial<StudioLighting>) => void;
  renderQuality: "adaptive" | "high";
  setRenderQuality: (quality: "adaptive" | "high") => void;
  mirrorFraming: "cover" | "contain";
  mirrorZoom: number;
  mirrorCompare: boolean;
  mirrorSplit: number;
  mirrorFocused: boolean;
  setMirrorView: (
    patch: Partial<
      Pick<
        State,
        | "mirrorZoom"
        | "mirrorCompare"
        | "mirrorSplit"
        | "mirrorFocused"
        | "mirrorFraming"
      >
    >,
  ) => void;
  past: EditSnapshot[];
  future: EditSnapshot[];
  editStart: EditSnapshot | null;
  beginEdit: () => void;
  endEdit: () => void;
  undo: () => void;
  redo: () => void;
  clearEditHistory: () => void;
  clearMakeup: () => void;
  agentOpen: boolean;
  settingsOpen: boolean;
  toast: string;
  discoveryContext: {
    color: string;
    category: string;
    productId?: string;
  } | null;
  setDiscoveryContext: (
    context: { color: string; category: string; productId?: string } | null,
  ) => void;
  rendererBackend: string;
  rendererReason: string;
  setRenderer: (backend: string, reason?: string) => void;
  setSpace: (space: Space) => void;
  setStudioMode: (mode: StudioMode) => void;
  applySavedLook: (saved: SavedLook) => void;
  setLook: (look: MakeupLook, name?: string) => void;
  patchLayer: (name: string, patch: Record<string, unknown>) => void;
  notify: (toast: string) => void;
  setAgentOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}
const snap = (
  state: Pick<
    State,
    "look" | "lookName" | "lighting" | "activeOutfitId" | "activeProductIds"
  >,
): EditSnapshot =>
  structuredClone({
    look: state.look,
    lookName: state.lookName,
    lighting: state.lighting,
    activeOutfitId: state.activeOutfitId,
    activeProductIds: state.activeProductIds,
  });
const same = (a: EditSnapshot, b: EditSnapshot) =>
  JSON.stringify(a) === JSON.stringify(b);
function edit(
  state: State,
  patch: Partial<
    Pick<
      State,
      "look" | "lookName" | "lighting" | "activeOutfitId" | "activeProductIds"
    >
  >,
): Partial<State> {
  const next = { ...state, ...patch };
  if (same(snap(state), snap(next))) return {};
  return {
    ...patch,
    ...(!state.editStart
      ? { past: [...state.past, snap(state)].slice(-30), future: [] }
      : {}),
  };
}
export const useApp = create<State>((set, get) => ({
  portraitProvenance: null,
  originalPortraitUrl: null,
  visionOcclusion: false,
  setVisionOcclusion: (visionOcclusion) => set({ visionOcclusion }),
  setGeneratedPortrait: (url, provenance, options) =>
    set((state) => {
      if (options?.restored) {
        for (const previous of new Set([
          state.portraitUrl,
          state.originalPortraitUrl,
        ])) {
          if (previous?.startsWith("blob:") && previous !== url)
            URL.revokeObjectURL(previous);
        }
        return {
          portraitUrl: url,
          originalPortraitUrl: null,
          portraitProvenance: provenance,
          portraitVision: null,
        };
      }
      if (
        state.portraitProvenance &&
        state.portraitUrl !== url &&
        state.portraitUrl.startsWith("blob:")
      )
        URL.revokeObjectURL(state.portraitUrl);
      return {
        portraitUrl: url,
        originalPortraitUrl: state.originalPortraitUrl ?? state.portraitUrl,
        portraitProvenance: provenance,
        portraitVision: null,
      };
    }),
  restoreOriginalPortrait: () =>
    set((state) => {
      if (!state.originalPortraitUrl && !state.portraitProvenance) return {};
      if (state.portraitUrl.startsWith("blob:"))
        URL.revokeObjectURL(state.portraitUrl);
      return {
        portraitUrl:
          state.originalPortraitUrl ?? "/images/portrait-neutral.jpg",
        originalPortraitUrl: null,
        portraitProvenance: null,
        portraitVision: null,
      };
    }),
  portraitUrl: "/images/portrait-neutral.jpg",
  portraitVision: null,
  setPortraitUrl: (portraitUrl) =>
    set((state) => {
      if (state.portraitUrl === portraitUrl) return {};
      if (
        state.originalPortraitUrl?.startsWith("blob:") &&
        state.originalPortraitUrl !== portraitUrl
      )
        URL.revokeObjectURL(state.originalPortraitUrl);
      if (
        state.portraitUrl.startsWith("blob:") &&
        state.portraitUrl !== portraitUrl
      )
        URL.revokeObjectURL(state.portraitUrl);
      return {
        portraitUrl,
        portraitProvenance: null,
        originalPortraitUrl: null,
        ...(state.portraitUrl !== portraitUrl ? { portraitVision: null } : {}),
      };
    }),
  setPortraitVision: (url, snapshot) =>
    set((state) => {
      if (state.portraitUrl !== url) return {};
      const next = structuredClone(snapshot),
        previous =
          state.portraitVision?.url === url
            ? state.portraitVision.snapshot
            : null;
      // A source-matching partial analysis must not erase a feature that was
      // deliberately prepared in another space. Explicit errors/empty results
      // still replace old data; only an unrequested (idle) feature is retained.
      if (
        previous &&
        next.status?.hair?.state === "idle" &&
        previous.hairMask
      ) {
        next.hairMask = structuredClone(previous.hairMask);
        next.status.hair = structuredClone(previous.status.hair);
      }
      return { portraitVision: { url, snapshot: next } };
    }),
  generationFeature: "hair",
  setGenerationFeature: (generationFeature) => set({ generationFeature }),
  activeOutfitId: null,
  activeProductIds: [],
  setCompleteScene: (patch) => set((state) => edit(state, patch)),
  space: "studio",
  studioMode: "makeup",
  look: createDefaultLook(),
  lookName: "Your signature look",
  focusLayer: "lipstick",
  setFocusLayer: (focusLayer) => set({ focusLayer }),
  maskBackend: "canvas",
  setMaskBackend: (maskBackend) => set({ maskBackend }),
  lighting: structuredClone(DEFAULT_LIGHTING),
  setLighting: (patch) =>
    set((state) => edit(state, { lighting: { ...state.lighting, ...patch } })),
  renderQuality: "adaptive",
  setRenderQuality: (renderQuality) => set({ renderQuality }),
  mirrorFraming: "cover",
  mirrorZoom: 1,
  mirrorCompare: false,
  mirrorSplit: 0.5,
  mirrorFocused: false,
  setMirrorView: (patch) =>
    set({
      ...patch,
      ...(patch.mirrorZoom !== undefined
        ? { mirrorZoom: Math.max(1, Math.min(2.5, patch.mirrorZoom)) }
        : {}),
      ...(patch.mirrorSplit !== undefined
        ? { mirrorSplit: Math.max(0, Math.min(1, patch.mirrorSplit)) }
        : {}),
    }),
  past: [],
  future: [],
  editStart: null,
  beginEdit: () =>
    set((state) => (state.editStart ? {} : { editStart: snap(state) })),
  endEdit: () =>
    set((state) =>
      !state.editStart
        ? {}
        : same(state.editStart, snap(state))
          ? { editStart: null }
          : {
              past: [...state.past, state.editStart].slice(-30),
              future: [],
              editStart: null,
            },
    ),
  undo: () => {
    get().endEdit();
    set((state) => {
      const previous = state.past.at(-1);
      return previous
        ? {
            ...structuredClone(previous),
            past: state.past.slice(0, -1),
            future: [snap(state), ...state.future].slice(0, 30),
          }
        : {};
    });
  },
  redo: () => {
    get().endEdit();
    set((state) => {
      const next = state.future[0];
      return next
        ? {
            ...structuredClone(next),
            past: [...state.past, snap(state)].slice(-30),
            future: state.future.slice(1),
          }
        : {};
    });
  },
  clearEditHistory: () => set({ past: [], future: [], editStart: null }),
  clearMakeup: () =>
    set((state) => {
      const look = structuredClone(state.look);
      for (const key of MAKEUP_LAYERS) look[key].enabled = false;
      look.reshape = 0;
      return edit(state, { look, lookName: "Your own expression" });
    }),
  agentOpen: false,
  settingsOpen: false,
  toast: "",
  discoveryContext: null,
  setDiscoveryContext: (discoveryContext) => set({ discoveryContext }),
  rendererBackend: "initializing",
  rendererReason: "",
  setRenderer: (rendererBackend, rendererReason = "") =>
    set({ rendererBackend, rendererReason }),
  setSpace: (space) => set({ space }),
  setStudioMode: (studioMode) => set({ studioMode, space: "studio" }),
  applySavedLook: (saved) =>
    set((state) => {
      const composition = CompositionSchema.safeParse(saved.composition);
      if (saved.composition !== undefined && !composition.success) {
        state.notify("This complete look has invalid composition data.");
        return {};
      }
      return edit(state, {
        look: normalizeLook(saved.look),
        lookName: saved.name,
        activeOutfitId: composition.success
          ? (composition.data.outfitId ?? null)
          : null,
        activeProductIds: composition.success
          ? composition.data.productIds
          : [],
        ...(composition.success ? { lighting: composition.data.lighting } : {}),
      });
    }),
  setLook: (look, name) =>
    set((state) =>
      edit(state, {
        look: structuredClone(look),
        ...(name ? { lookName: name } : {}),
      }),
    ),
  patchLayer: (name, patch) =>
    set((state) => {
      if (![...MAKEUP_LAYERS, "hair", "accessories"].includes(name)) return {};
      return edit(state, {
        look: {
          ...state.look,
          [name]: {
            ...(state.look[name as keyof MakeupLook] as object),
            ...patch,
          },
        },
      });
    }),
  notify: (toast) => set({ toast }),
  setAgentOpen: (agentOpen) => set({ agentOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
