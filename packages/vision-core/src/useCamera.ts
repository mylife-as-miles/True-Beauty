import { useCallback, useEffect, useRef, useState } from "react";
const isDocumentHidden = () => document.visibilityState === "hidden";
export interface CameraState {
  stream: MediaStream | null;
  error: string | null;
  isOpening: boolean;
  open: (facing?: "user" | "environment") => Promise<void>;
  close: () => void;
  switchCamera: () => Promise<void>;
}
/**
 * Camera lifecycle adapted from Virtual Makeup/useCamera.ts (MIT declaration in
 * upstream README, Copyright otdnnc). Adds request invalidation, switching, track
 * cleanup on denial/races/backgrounding, and a secure-context error with actionable recovery.
 */
export function useCamera(): CameraState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const live = useRef<MediaStream | null>(null);
  const requestId = useRef(0);
  const facing = useRef<"user" | "environment">("user");
  const mounted = useRef(true);
  const close = useCallback(() => {
    requestId.current++;
    live.current?.getTracks().forEach((track) => track.stop());
    live.current = null;
    if (mounted.current) {
      setStream(null);
      setIsOpening(false);
    }
  }, []);
  const open = useCallback(
    async (direction: "user" | "environment" = "user") => {
      if (!mounted.current) return;
      close();
      if (isDocumentHidden()) {
        setError("Return to this tab before opening the camera.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          "Camera needs HTTPS or localhost and a browser with camera support. You can still upload a portrait.",
        );
        return;
      }
      const id = ++requestId.current;
      facing.current = direction;
      setIsOpening(true);
      setError(null);
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: direction },
            width: { ideal: 960 },
            height: { ideal: 720 },
            frameRate: { ideal: 30, max: 30 },
          },
        });
        if (
          !mounted.current ||
          id !== requestId.current ||
          isDocumentHidden()
        ) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        live.current = media;
        setStream(media);
      } catch (error) {
        if (mounted.current && id === requestId.current)
          setError(
            error instanceof DOMException && error.name === "NotAllowedError"
              ? "Camera permission was declined. Allow camera access in browser settings, or use a portrait instead."
              : error instanceof DOMException && error.name === "NotFoundError"
                ? "No camera was found. Upload a portrait instead."
                : error instanceof Error
                  ? error.message
                  : "Could not open the camera. Try a portrait instead.",
          );
      } finally {
        if (mounted.current && id === requestId.current) setIsOpening(false);
      }
    },
    [close],
  );
  const switchCamera = useCallback(
    () => open(facing.current === "user" ? "environment" : "user"),
    [open],
  );
  useEffect(() => {
    mounted.current = true;
    const pause = () => {
      if (isDocumentHidden()) close();
    };
    const end = () => close();
    document.addEventListener("visibilitychange", pause);
    window.addEventListener("pagehide", end);
    return () => {
      mounted.current = false;
      close();
      document.removeEventListener("visibilitychange", pause);
      window.removeEventListener("pagehide", end);
    };
  }, [close]);
  return { stream, error, isOpening, open, close, switchCamera };
}
