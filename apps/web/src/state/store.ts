import { create } from "zustand";
import {
  createDefaultLook,
  MAKEUP_LAYERS,
  type MakeupLook,
} from "../../../../packages/makeup-engine/src";
import type { VisionSnapshot } from "../../../../packages/vision-core/src";
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
}
interface State {
  portraitUrl: string;
  portraitVision: { url: string; snapshot: VisionSnapshot } | null;
  setPortraitUrl: (url: string) => void;
  setPortraitVision: (url: string, snapshot: VisionSnapshot) => void;
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
  setLook: (look: MakeupLook, name?: string) => void;
  patchLayer: (name: string, patch: Record<string, unknown>) => void;
  notify: (toast: string) => void;
  setAgentOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}
const snap = (
  state: Pick<State, "look" | "lookName" | "lighting">,
): EditSnapshot =>
  structuredClone({
    look: state.look,
    lookName: state.lookName,
    lighting: state.lighting,
  });
const same = (a: EditSnapshot, b: EditSnapshot) =>
  JSON.stringify(a) === JSON.stringify(b);
function edit(
  state: State,
  patch: Partial<Pick<State, "look" | "lookName" | "lighting">>,
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
  portraitUrl: "/images/portrait-neutral.jpg",
  portraitVision: null,
  setPortraitUrl: (portraitUrl) =>
    set((state) => {
      if (
        state.portraitUrl.startsWith("blob:") &&
        state.portraitUrl !== portraitUrl
      )
        URL.revokeObjectURL(state.portraitUrl);
      return {
        portraitUrl,
        ...(state.portraitUrl !== portraitUrl ? { portraitVision: null } : {}),
      };
    }),
  setPortraitVision: (url, snapshot) =>
    set((state) =>
      state.portraitUrl === url
        ? { portraitVision: { url, snapshot: structuredClone(snapshot) } }
        : {},
    ),
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
