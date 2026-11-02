/** Browser verification harness. This module is never imported by the product. */
import { createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useCamera, type CameraState } from "./useCamera";
export function mountCameraHarness(element: HTMLElement) {
  let current: CameraState | null = null;
  function Harness() {
    const state = useCamera();
    useEffect(() => {
      current = state;
    });
    return createElement(
      "p",
      {},
      state.error ?? (state.stream ? "Camera active" : "Camera off"),
    );
  }
  const root = createRoot(element);
  root.render(createElement(Harness));
  return { getState: () => current, unmount: () => root.unmount() };
}
