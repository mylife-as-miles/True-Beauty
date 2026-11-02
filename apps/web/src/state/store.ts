import { create } from "zustand";
import {
  createDefaultLook,
  type MakeupLook,
} from "../../../../packages/makeup-engine/src";
import type { Space, StudioMode } from "../../../../packages/shared-types/src";
interface State {
  portraitUrl: string;
  setPortraitUrl: (url: string) => void;
  space: Space;
  studioMode: StudioMode;
  look: MakeupLook;
  lookName: string;
  focusLayer: string;
  setFocusLayer: (layer: string) => void;
  maskBackend: "canvas" | "opencv";
  setMaskBackend: (backend: "canvas" | "opencv") => void;
  agentOpen: boolean;
  settingsOpen: boolean;
  toast: string;
  discoveryContext: { color: string; category: string } | null;
  setDiscoveryContext: (
    context: { color: string; category: string } | null,
  ) => void;
  rendererBackend: string;
  rendererReason: string;
  setRenderer: (backend: string, reason?: string) => void;
  setSpace: (space: Space) => void;
  setStudioMode: (studioMode: StudioMode) => void;
  setLook: (look: MakeupLook, name?: string) => void;
  patchLayer: (name: string, patch: Record<string, unknown>) => void;
  notify: (toast: string) => void;
  setAgentOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
}
export const useApp = create<State>((set) => ({
  portraitUrl: "/images/portrait-neutral.jpg",
  setPortraitUrl: (portraitUrl) =>
    set((state) => {
      if (
        state.portraitUrl.startsWith("blob:") &&
        state.portraitUrl !== portraitUrl
      )
        URL.revokeObjectURL(state.portraitUrl);
      return { portraitUrl };
    }),
  space: "studio",
  studioMode: "makeup",
  look: createDefaultLook(),
  lookName: "Your signature look",
  focusLayer: "lipstick",
  setFocusLayer: (focusLayer) => set({ focusLayer }),
  maskBackend: "canvas",
  setMaskBackend: (maskBackend) => set({ maskBackend }),
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
  setLook: (look, name) => set({ look, ...(name ? { lookName: name } : {}) }),
  patchLayer: (name, patch) =>
    set((state) => ({
      look: {
        ...state.look,
        [name]: {
          ...(state.look[name as keyof MakeupLook] as object),
          ...patch,
        },
      },
    })),
  notify: (toast) => set({ toast }),
  setAgentOpen: (agentOpen) => set({ agentOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
