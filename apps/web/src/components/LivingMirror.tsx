import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  ImagePlus,
  Expand,
  Minus,
  Plus,
  RotateCcw,
  Columns2,
  Hand,
  Download,
  VideoOff,
  SwitchCamera,
  ScanFace,
  X,
  Paintbrush,
  Ratio,
  Diamond,
} from "lucide-react";
import {
  createVision,
  useCamera,
  type VisionEngine,
  type VisionSnapshot,
} from "../../../../packages/vision-core/src";
import {
  LOOK_PRESETS,
  ACCESSORY_KEYS,
  accessoryVisionRequirements,
  cloneLook,
  type MakeupLayerName,
} from "../../../../packages/makeup-engine/src";
import {
  BeautyRenderer,
  accessoryAnchorStatus,
} from "../../../../packages/ar-renderer/src";
import { useApp } from "../state/store";
import { IconButton } from "./ui";
import { sourceCoordinates, objectPosition } from "../lib/mirror-coordinates";
const emptySnapshot = (): VisionSnapshot => ({
  landmarks: [],
  blendshapes: {},
  transform: null,
  hairMask: null,
  hands: [],
  timestamp: 0,
  latencyMs: 0,
  inferenceCount: 0,
  status: {
    face: { state: "idle" },
    hair: { state: "idle" },
    hands: { state: "idle" },
  },
});
export interface MirrorTrackingStatus {
  accessories: ReturnType<typeof accessoryAnchorStatus>;
  warning: string;
}
export interface MirrorProps {
  onTrackingStatus?: (status: MirrorTrackingStatus) => void;
  onSnapshot?: (canvas: HTMLCanvasElement, vision: VisionSnapshot) => void;
}
export default function LivingMirror({
  onSnapshot,
  onTrackingStatus,
}: MirrorProps) {
  const {
    stream: cameraStream,
    error: cameraError,
    isOpening: cameraOpening,
    open: openCamera,
    close: closeCamera,
  } = useCamera();
  const sourceUrl = useApp((s) => s.portraitUrl),
    setSourceUrl = useApp((s) => s.setPortraitUrl);
  const maskBackend = useApp((s) => s.maskBackend);
  const visionOcclusion = useApp((s) => s.visionOcclusion);
  const portraitProvenance = useApp((s) => s.portraitProvenance);
  const originalPortraitUrl = useApp((s) => s.originalPortraitUrl);
  const rendererBackend = useApp((s) => s.rendererBackend);
  const lighting = useApp((s) => s.lighting),
    quality = useApp((s) => s.renderQuality);
  const framing = useApp((s) => s.mirrorFraming);
  const framingRef = useRef(framing);
  const zoom = useApp((s) => s.mirrorZoom),
    compare = useApp((s) => s.mirrorCompare),
    split = useApp((s) => s.mirrorSplit);
  const setZoom = (value: number | ((current: number) => number)) =>
    useApp.getState().setMirrorView({
      mirrorZoom:
        typeof value === "function"
          ? value(useApp.getState().mirrorZoom)
          : value,
    });
  const setCompare = (value: boolean | ((current: boolean) => boolean)) =>
    useApp.getState().setMirrorView({
      mirrorCompare:
        typeof value === "function"
          ? value(useApp.getState().mirrorCompare)
          : value,
    });
  const setSplit = (value: number) =>
    useApp.getState().setMirrorView({ mirrorSplit: value });
  const lightingRef = useRef(lighting);
  const look = useApp((s) => s.look),
    notify = useApp((s) => s.notify);
  const mirrorElement = useRef<HTMLDivElement>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    videoRef = useRef<HTMLVideoElement>(null),
    imageRef = useRef<HTMLImageElement | null>(null),
    pipelineRef = useRef<VisionEngine | null>(null),
    rendererRef = useRef<BeautyRenderer | null>(null),
    streamRef = useRef<MediaStream | null>(null),
    fileRef = useRef<HTMLInputElement>(null),
    frameRef = useRef(0),
    lookRef = useRef(look),
    snapshotRef = useRef(emptySnapshot());
  const [mode, setMode] = useState<"demo" | "camera" | "upload">(
      sourceUrl.startsWith("blob:") ? "upload" : "demo",
    ),
    [status, setStatus] = useState("Preparing your mirror…"),
    [tracked, setTracked] = useState(false),
    [gestures, setGestures] = useState(false),
    [latency, setLatency] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [modelsOpen, setModelsOpen] = useState(false),
    [facing, setFacing] = useState<"user" | "environment">("user");
  const [accessoryStatus, setAccessoryStatus] = useState<
    ReturnType<typeof accessoryAnchorStatus>
  >([]);
  const accessoryBits = ACCESSORY_KEYS.map((key) =>
    look.accessories[key] ? "1" : "0",
  ).join("");
  const requirements = accessoryVisionRequirements(look.accessories);
  const bodyEnabled = visionOcclusion && requirements.body;
  const poseNeeded = requirements.pose;
  const handsNeeded = gestures || requirements.hands;
  const hairEnabled = look.hair.enabled;
  const featuresRef = useRef({
    face: true,
    hair: hairEnabled,
    hands: handsNeeded,
    body: bodyEnabled,
    pose: poseNeeded,
  });
  useEffect(() => {
    featuresRef.current = {
      face: true,
      hair: hairEnabled,
      hands: handsNeeded,
      body: bodyEnabled,
      pose: poseNeeded,
    };
    // A feature toggle also invalidates the cached static render.
    lookRef.current = { ...lookRef.current };
  }, [hairEnabled, handsNeeded, bodyEnabled, poseNeeded]);
  const publishAccessoryStatus = useCallback(
    (snapshot: VisionSnapshot) => {
      const next = accessoryAnchorStatus(
        useApp.getState().look.accessories,
        snapshot,
        canvasRef.current?.width ?? 960,
        canvasRef.current?.height ?? 1200,
      );
      setAccessoryStatus((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
      const warnings = (["body", "pose"] as const)
        .filter(
          (feature) =>
            featuresRef.current[feature] &&
            snapshot.status[feature]?.state === "error",
        )
        .map(
          (feature) =>
            snapshot.status[feature]?.error ?? `${feature} model unavailable`,
        );
      onTrackingStatus?.({ accessories: next, warning: warnings.join(" ") });
    },
    [onTrackingStatus],
  );
  const sourceEpoch = useRef(0),
    zoomRef = useRef(1),
    compareRef = useRef(false),
    splitRef = useRef(0.5),
    gesturesRef = useRef(false);
  const [regionLens, setRegionLens] = useState<{
    layer: MakeupLayerName;
    x: number;
    y: number;
  } | null>(null);
  const lastGesture = useRef(0);
  const lastStatus = useRef(0);
  useEffect(() => {
    framingRef.current = framing;
    lookRef.current = { ...lookRef.current };
  }, [framing]);
  useEffect(() => {
    lightingRef.current = lighting;
    lookRef.current = { ...lookRef.current };
  }, [lighting]);
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setQuality(quality);
    useApp.getState().setRenderer(renderer.activeMode, renderer.fallbackReason);
    lookRef.current = { ...lookRef.current };
  }, [quality]);
  useEffect(() => {
    lookRef.current = look;
  }, [look]);
  useEffect(() => {
    zoomRef.current = zoom;
    lookRef.current = { ...lookRef.current };
  }, [zoom]);
  useEffect(() => {
    compareRef.current = compare;
    splitRef.current = split;
    gesturesRef.current = gestures;
  }, [compare, split, gestures]);
  const stopCamera = useCallback(() => {
    closeCamera();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [closeCamera]);
  useEffect(() => {
    if (cameraStream) {
      streamRef.current = cameraStream;
      if (videoRef.current) {
        videoRef.current.srcObject = cameraStream;
        void videoRef.current
          .play()
          .catch(() =>
            setError("Camera playback could not start. Try opening it again."),
          );
      }
      setMode("camera");
      setStatus("Finding your face…");
    }
  }, [cameraStream]);
  useEffect(() => {
    if (cameraError) {
      setError(cameraError);
      setMode("demo");
      setLoading(false);
      setRetry((v) => v + 1);
    }
  }, [cameraError]);
  useEffect(() => {
    if (cameraOpening) setLoading(true);
    else if (cameraStream) setLoading(false);
  }, [cameraOpening, cameraStream]);
  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new BeautyRenderer(canvas);
    renderer.setQuality(useApp.getState().renderQuality);
    rendererRef.current = renderer;
    useApp.getState().setRenderer(renderer.activeMode, renderer.fallbackReason);
    const pipeline = createVision();
    pipelineRef.current = pipeline;
    let alive = true;
    let running = false;
    let lastSource: unknown = null;
    let lastLook: unknown = null;
    let lastLandmarks: unknown = null;
    let lastHair: unknown = null;
    let lastBody: unknown = null;
    let lastPose: unknown = null;
    let lastHands: unknown = null;
    let lastCompare = false;
    let lastSplit = 0;
    let lastVideoTime = -1;
    const draw = async (time: number) => {
      if (!alive) return;
      const source =
        streamRef.current && (videoRef.current?.readyState ?? 0) >= 2
          ? videoRef.current
          : imageRef.current;
      if (source) {
        if (streamRef.current && !running) {
          running = true;
          const epoch = sourceEpoch.current;
          pipeline
            .analyzeVideo(videoRef.current!, time, featuresRef.current)
            .then((snapshot) => {
              if (!alive || epoch !== sourceEpoch.current || !streamRef.current)
                return;
              snapshotRef.current = snapshot;
              if (time - lastStatus.current > 600) {
                setTracked(snapshot.landmarks.length > 0);
                setLatency(snapshot.latencyMs);
                publishAccessoryStatus(snapshot);
                setStatus(
                  snapshot.landmarks.length
                    ? "Face mesh connected"
                    : "Position your face in the mirror",
                );
                lastStatus.current = time;
              }
              const gesture = snapshot.hands[0]?.gesture;
              if (
                gesturesRef.current &&
                gesture?.active &&
                time - lastGesture.current > 1400
              ) {
                const name = gesture.name;
                if (name === "pinch") {
                  setCompare((v) => !v);
                  lastGesture.current = time;
                } else if (name === "swipe-left" || name === "swipe-right") {
                  const current = LOOK_PRESETS.findIndex(
                    (p) =>
                      JSON.stringify(p.look) ===
                      JSON.stringify(lookRef.current),
                  );
                  const next =
                    LOOK_PRESETS[
                      (Math.max(0, current) +
                        (name === "swipe-left" ? 1 : LOOK_PRESETS.length - 1)) %
                        LOOK_PRESETS.length
                    ];
                  useApp.getState().setLook(cloneLook(next.look), next.name);
                  lastGesture.current = time;
                } else if (name === "open-palm") {
                  useApp
                    .getState()
                    .setStudioMode(
                      useApp.getState().studioMode === "hair"
                        ? "makeup"
                        : "hair",
                    );
                  lastGesture.current = time;
                }
              }
            })
            .catch((e) => {
              setError(e.message);
            })
            .finally(() => {
              running = false;
            });
        }
        const changed =
          source !== lastSource ||
          lookRef.current !== lastLook ||
          snapshotRef.current.landmarks !== lastLandmarks ||
          snapshotRef.current.hairMask !== lastHair ||
          snapshotRef.current.bodyMask !== lastBody ||
          snapshotRef.current.pose !== lastPose ||
          snapshotRef.current.hands !== lastHands ||
          compareRef.current !== lastCompare ||
          splitRef.current !== lastSplit ||
          (source instanceof HTMLVideoElement &&
            source.currentTime !== lastVideoTime);
        if (changed)
          try {
            renderer.render({
              source: source as HTMLImageElement | HTMLVideoElement,
              landmarks: snapshotRef.current.landmarks,
              look: lookRef.current,
              lighting: lightingRef.current,
              hairMask: snapshotRef.current.hairMask ?? undefined,
              hands: featuresRef.current.hands ? snapshotRef.current.hands : [],
              bodyMask: featuresRef.current.body
                ? snapshotRef.current.bodyMask
                : undefined,
              pose: featuresRef.current.pose
                ? snapshotRef.current.pose
                : undefined,
              beforeAfter: compareRef.current
                ? 0.5 +
                  ((splitRef.current - 0.5) *
                    (mirrorElement.current?.clientWidth ?? 1)) /
                    ((framingRef.current === "contain" ? Math.min : Math.max)(
                      (mirrorElement.current?.clientWidth ?? 1) / canvas.width,
                      (mirrorElement.current?.clientHeight ?? 1) /
                        canvas.height,
                    ) *
                      canvas.width *
                      zoomRef.current)
                : undefined,
              time,
            });
            lastSource = source;
            lastLook = lookRef.current;
            lastLandmarks = snapshotRef.current.landmarks;
            lastHair = snapshotRef.current.hairMask;
            lastBody = snapshotRef.current.bodyMask;
            lastPose = snapshotRef.current.pose;
            lastHands = snapshotRef.current.hands;
            lastCompare = compareRef.current;
            lastSplit = splitRef.current;
            lastVideoTime =
              source instanceof HTMLVideoElement ? source.currentTime : -1;
            onSnapshot?.(canvas, snapshotRef.current);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Rendering failed");
          }
      }
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);
    return () => {
      alive = false;
      sourceEpoch.current++;
      cancelAnimationFrame(frameRef.current);
      stopCamera();
      pipeline.dispose();
      renderer.dispose();
      rendererRef.current = null;
      pipelineRef.current = null;
    };
  }, [stopCamera, onSnapshot, publishAccessoryStatus]);
  useEffect(() => {
    let active = true;
    const epoch = ++sourceEpoch.current;
    setRegionLens(null);
    snapshotRef.current = emptySnapshot();
    imageRef.current = null;
    setTracked(false);
    setAccessoryStatus([]);
    onTrackingStatus?.({ accessories: [], warning: "" });
    setLoading(true);
    setStatus("Opening your portrait…");
    const img = new Image();
    img.onload = async () => {
      if (!active) return;
      imageRef.current = img;
      setLoading(true);
      setStatus("Mapping facial contours…");
      try {
        const snapshot = await pipelineRef.current?.analyzeImage(
          img,
          featuresRef.current,
        );
        if (active && epoch === sourceEpoch.current && snapshot) {
          snapshotRef.current = snapshot;
          useApp.getState().setPortraitVision(sourceUrl, snapshot);
          setTracked(snapshot.landmarks.length > 0);
          setLatency(snapshot.latencyMs);
          publishAccessoryStatus(snapshot);
          setStatus(
            snapshot.landmarks.length
              ? "Face mesh connected"
              : "No face found. Try a clear, front-facing portrait.",
          );
        }
      } catch {
        if (active && epoch === sourceEpoch.current) {
          useApp.getState().setPortraitVision(sourceUrl, emptySnapshot());
          setError(
            "Tracking could not load. You can retry or use another photo.",
          );
          setStatus("Portrait loaded · tracking unavailable");
        }
      } finally {
        if (active && epoch === sourceEpoch.current) setLoading(false);
      }
    };
    img.onerror = () => {
      if (!active) return;
      setError(
        "This portrait could not be opened. Please choose another image.",
      );
      setLoading(false);
    };
    img.src = sourceUrl;
    return () => {
      active = false;
    };
  }, [sourceUrl, retry, publishAccessoryStatus, onTrackingStatus]);
  useEffect(() => {
    if (!hairEnabled && !handsNeeded && !bodyEnabled && !poseNeeded) {
      snapshotRef.current = {
        ...snapshotRef.current,
        hairMask: null,
        hands: [],
        bodyMask: null,
        pose: null,
      };
      publishAccessoryStatus(snapshotRef.current);
      return;
    }
    const pipeline = pipelineRef.current;
    if (!pipeline) return;
    let active = true;
    const epoch = sourceEpoch.current;
    const sourceImage = imageRef.current;
    setStatus(
      bodyEnabled
        ? "Preparing overlap detail…"
        : poseNeeded
          ? "Preparing accessory anchors…"
          : handsNeeded
            ? "Preparing hand tracking…"
            : "Preparing hair segmentation…",
    );
    pipeline
      .load(featuresRef.current)
      .then(async () => {
        if (!active) return;
        if (mode !== "camera" && sourceImage) {
          const snap = await pipeline.analyzeImage(
            sourceImage,
            featuresRef.current,
          );
          if (
            active &&
            epoch === sourceEpoch.current &&
            imageRef.current === sourceImage
          ) {
            snapshotRef.current = snap;
            useApp.getState().setPortraitVision(sourceUrl, snap);
            setTracked(snap.landmarks.length > 0);
            setLatency(snap.latencyMs);
            publishAccessoryStatus(snap);
          }
        } else if (active) publishAccessoryStatus(pipeline.getSnapshot());
        if (
          active &&
          epoch === sourceEpoch.current &&
          imageRef.current === sourceImage
        )
          setStatus(
            snapshotRef.current.landmarks.length
              ? "Face mesh connected"
              : "No face found. Try a clear portrait.",
          );
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Accessory tracking unavailable",
          );
      });
    return () => {
      active = false;
    };
  }, [
    hairEnabled,
    handsNeeded,
    bodyEnabled,
    poseNeeded,
    accessoryBits,
    mode,
    sourceUrl,
    publishAccessoryStatus,
  ]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden && streamRef.current) {
        stopCamera();
        setMode("demo");
        setStatus("Camera paused while away. Open it again to resume.");
        setRetry((v) => v + 1);
      }
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [stopCamera]);
  const startCamera = async (nextFacing = facing) => {
    const epoch = ++sourceEpoch.current;
    snapshotRef.current = emptySnapshot();
    setError("");
    setLoading(true);
    setMode("camera");
    try {
      await pipelineRef.current?.load(featuresRef.current);
      if (epoch !== sourceEpoch.current) return;
      await openCamera(nextFacing);
    } catch (e) {
      stopCamera();
      setError(e instanceof Error ? e.message : "Camera unavailable");
      setMode("demo");
    } finally {
      setLoading(false);
    }
  };
  const upload = (file?: File) => {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 15 * 1024 * 1024
    ) {
      notify("Choose a JPG, PNG or WebP image under 15 MB.");
      return;
    }
    sourceEpoch.current++;
    setError("");
    stopCamera();
    setMode("upload");
    snapshotRef.current = emptySnapshot();
    setSourceUrl(URL.createObjectURL(file));
  };
  useEffect(() => {
    let active = true;
    const renderer = rendererRef.current;
    if (!renderer) return;
    void renderer
      .setMaskBackend(maskBackend)
      .then(() => {
        if (active) {
          lookRef.current = { ...lookRef.current };
          if (maskBackend === "opencv")
            notify(
              "Precision edges are ready. All processing stays on this device.",
            );
        }
      })
      .catch(() => {
        if (active) {
          useApp.getState().setMaskBackend("canvas");
          notify(
            "Precision edges could not load. Standard blending is still available.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [maskBackend, notify]);
  useEffect(() => {
    const element = mirrorElement.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      lookRef.current = { ...lookRef.current };
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "true-beauty-look.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
    notify(
      "Your preview was downloaded. It has not been stored in your beauty history.",
    );
  };
  const sourceCaption =
    mode === "camera"
      ? "Live mirror"
      : portraitProvenance
        ? `AI-generated ${portraitProvenance.feature} preview`
        : mode === "upload"
          ? "Your photo"
          : "Studio portrait";
  return (
    <div className="mirror-column">
      <div
        ref={mirrorElement}
        className="mirror-frame"
        data-renderer={rendererBackend}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const color = e.dataTransfer.getData("application/true-beauty-color");
          if (color) {
            useApp.getState().patchLayer("lipstick", { color, enabled: true });
            notify("Shade applied to your mirror.");
          } else upload(e.dataTransfer.files[0]);
        }}
      >
        <div className="mirror-media" style={{ transform: `scale(${zoom})` }}>
          <canvas
            onClick={(e) => {
              const canvas = e.currentTarget;
              const rect = canvas.getBoundingClientRect();
              const { x: u, y: v } = sourceCoordinates(
                { x: e.clientX, y: e.clientY },
                rect,
                { width: canvas.width, height: canvas.height },
                objectPosition(getComputedStyle(canvas).objectPosition),
              );
              const points = snapshotRef.current.landmarks;
              if (!points.length) return;
              const regions: [string, number][] = [
                ["lipstick", 13],
                ["eyeshadow", 159],
                ["eyeshadow", 386],
                ["blush", 50],
                ["blush", 280],
                ["foundation", 10],
              ];
              const closest = regions
                .map(([layer, id]) => ({
                  layer,
                  d: Math.hypot(points[id].x - u, points[id].y - v),
                }))
                .sort((a, b) => a.d - b.d)[0];
              if (closest.d < 0.17) {
                useApp.getState().setFocusLayer(closest.layer);
                useApp.getState().setStudioMode("makeup");
                const box = mirrorElement.current!.getBoundingClientRect();
                setRegionLens({
                  layer: closest.layer as MakeupLayerName,
                  x: Math.max(
                    132,
                    Math.min(box.width - 132, e.clientX - box.left),
                  ),
                  y: Math.max(
                    66,
                    Math.min(box.height - 130, e.clientY - box.top),
                  ),
                });
                notify(
                  "Editing " +
                    closest.layer +
                    ". Use the tools to change this region.",
                );
              }
            }}
            ref={canvasRef}
            data-source-url={sourceUrl}
            style={{ objectFit: framing }}
            width={960}
            height={1200}
            aria-label="Living Mirror preview with your selected cosmetic effects"
          />
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="vision-video"
            aria-hidden="true"
          />
        </div>
        <div className="mirror-top">
          <button
            aria-label={`${sourceCaption}${loading ? " · preparing" : ""}: Choose a demo portrait`}
            aria-expanded={modelsOpen}
            onClick={() => setModelsOpen((v) => !v)}
            className="mirror-label"
          >
            <span className={tracked ? "live-dot" : "loading-dot"} />
            <span
              style={{
                maxWidth: "min(36vw,170px)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {sourceCaption}
            </span>
            {loading ? " · preparing" : ""}
          </button>
          <div className="mirror-top-actions">
            <button
              className="mirror-framing-toggle"
              aria-label={
                framing === "cover" ? "Show full portrait" : "Fill mirror"
              }
              onClick={() =>
                useApp.getState().setMirrorView({
                  mirrorFraming: framing === "cover" ? "contain" : "cover",
                  mirrorZoom: 1,
                })
              }
            >
              <Ratio size={15} />
              <span>
                {framing === "cover" ? "Full portrait" : "Fill mirror"}
              </span>
            </button>
            <IconButton label="Download preview" onClick={download}>
              <Download size={17} />
            </IconButton>
          </div>
        </div>
        {mode !== "camera" && portraitProvenance && (
          <div
            role="note"
            aria-label="Generated image provenance"
            style={{
              position: "absolute",
              top: 58,
              left: 14,
              right: 70,
              zIndex: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "4px 8px",
              background: "rgba(255,250,240,.94)",
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1.4,
            }}
          >
            <span>
              <strong>AI-generated {portraitProvenance.feature} preview</strong>
              <br />
              Still image · Perfect Corp
            </span>
            {portraitProvenance && (
              <button
                className="icon-button"
                aria-label={
                  originalPortraitUrl
                    ? "Restore original photo"
                    : "Use studio portrait"
                }
                title={
                  originalPortraitUrl
                    ? "Restore original photo"
                    : "Use studio portrait"
                }
                style={{
                  minHeight: 44,
                  minWidth: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => {
                  sourceEpoch.current++;
                  stopCamera();
                  snapshotRef.current = emptySnapshot();
                  setMode(
                    originalPortraitUrl?.startsWith("blob:")
                      ? "upload"
                      : "demo",
                  );
                  useApp.getState().restoreOriginalPortrait();
                }}
              >
                <RotateCcw size={17} />
              </button>
            )}
          </div>
        )}
        {modelsOpen && (
          <div
            className="demo-chooser"
            role="group"
            aria-label="Demo portraits"
          >
            {[
              ["/images/portrait-neutral.jpg", "Warm portrait"],
              ["/images/portrait-2.jpg", "Soft portrait"],
              ["/images/portrait.jpg", "Editorial light"],
            ].map(([url, label]) => (
              <button
                key={url}
                aria-label={label}
                onClick={() => {
                  sourceEpoch.current++;
                  setError("");
                  snapshotRef.current = emptySnapshot();
                  stopCamera();
                  setMode("demo");
                  setSourceUrl(url);
                  setRetry((v) => v + 1);
                  setModelsOpen(false);
                }}
              >
                <img src={url} alt="" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mirror-side">
          <IconButton
            label="Zoom in"
            onClick={() => setZoom((v) => Math.min(2, v + 0.15))}
          >
            <Plus size={17} />
          </IconButton>
          <span>{Math.round(zoom * 100)}%</span>
          <IconButton
            label="Zoom out"
            onClick={() => setZoom((v) => Math.max(1, v - 0.15))}
          >
            <Minus size={17} />
          </IconButton>
          <IconButton label="Reset view" onClick={() => setZoom(1)}>
            <Expand size={17} />
          </IconButton>
        </div>
        {compare && (
          <>
            <div
              className="compare-divider"
              style={{ left: `${split * 100}%` }}
            >
              <span>
                <Columns2 size={16} />
              </span>
            </div>
            <input
              className="compare-range"
              aria-label="Before and after split"
              type="range"
              min="0"
              max="100"
              value={split * 100}
              onChange={(e) => setSplit(Number(e.target.value) / 100)}
            />
            <span className="compare-before">Before</span>
            <span className="compare-after">After</span>
          </>
        )}
        {regionLens && !compare && (
          <div
            className="mirror-region-lens"
            role="group"
            aria-label="Selected facial region"
            style={{ left: regionLens.x, top: regionLens.y }}
          >
            <i style={{ background: look[regionLens.layer].color }} />
            <div>
              <strong>
                {(
                  {
                    lipstick: "Lips",
                    eyeshadow: "Eyes",
                    blush: "Cheeks",
                    foundation: "Complexion",
                  } as Record<string, string>
                )[regionLens.layer] ?? regionLens.layer}
              </strong>
              <span>
                {look[regionLens.layer].enabled
                  ? `${Math.round(look[regionLens.layer].opacity * 100)}% · ${look[regionLens.layer].finish}`
                  : "Colour off"}
              </span>
            </div>
            <button
              aria-label="Edit selected region"
              onClick={() => {
                useApp.getState().setFocusLayer(regionLens.layer);
                useApp.getState().setStudioMode("makeup");
                requestAnimationFrame(() => {
                  const target =
                    document.querySelector<HTMLElement>("#intensity");
                  if (target) {
                    target.scrollIntoView({
                      block: "nearest",
                      inline: "nearest",
                      behavior: "instant",
                    });
                    target.focus({ preventScroll: true });
                  }
                });
              }}
            >
              <Paintbrush size={16} />
            </button>
            <button
              aria-label="Dismiss region lens"
              onClick={() => setRegionLens(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="mirror-bottom">
          <div className="mirror-state">
            <ScanFace size={15} />
            <span>{status}</span>
          </div>
          <div className="mirror-tools">
            <IconButton
              label={
                compare ? "Hide before and after" : "Compare before and after"
              }
              className={compare ? "active" : ""}
              onClick={() => setCompare((v) => !v)}
            >
              <Columns2 size={18} />
            </IconButton>
            {accessoryStatus.length > 0 && (
              <button
                className="icon-button"
                aria-label="Accessory tracking details"
                title="Accessory tracking details"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => {
                  useApp.getState().setStudioMode("style");
                  useApp.getState().setMirrorView({ mirrorFocused: false });
                  requestAnimationFrame(() => {
                    const target = document.querySelector<HTMLElement>(
                      "#accessory-tracking-details",
                    );
                    target?.scrollIntoView({
                      block: "nearest",
                      behavior: "instant",
                    });
                    target?.focus({ preventScroll: true });
                  });
                }}
              >
                <Diamond size={16} />
              </button>
            )}
            <IconButton
              label={
                gestures ? "Disable hand gestures" : "Enable hand gestures"
              }
              className={gestures ? "active" : ""}
              onClick={() => {
                setGestures((v) => !v);
                notify(
                  "Hand gestures control previews only. Pinch compares, swipe changes looks, and an open palm switches hair tools. Every action has a button alternative.",
                );
              }}
            >
              <Hand size={18} />
            </IconButton>
            <IconButton
              label="Reset makeup"
              onClick={() => {
                useApp.getState().clearMakeup();
                notify(
                  "Makeup cleared. Hair and accessories kept. Undo to restore.",
                );
              }}
            >
              <RotateCcw size={17} />
            </IconButton>
          </div>
        </div>
      </div>
      <div className="source-bar">
        <button
          className={mode === "demo" ? "selected" : ""}
          onClick={() => {
            sourceEpoch.current++;
            stopCamera();
            setMode("demo");
            setSourceUrl("/images/portrait-neutral.jpg");
            setRetry((v) => v + 1);
          }}
        >
          <ScanFace size={16} />
          Demo portrait
        </button>
        <button
          className={mode === "camera" ? "selected" : ""}
          onClick={() =>
            mode === "camera"
              ? (sourceEpoch.current++,
                stopCamera(),
                setMode("demo"),
                setRetry((v) => v + 1))
              : void startCamera()
          }
        >
          {mode === "camera" ? <VideoOff size={16} /> : <Camera size={16} />}{" "}
          {mode === "camera" ? "Stop camera" : "Open camera"}
        </button>
        <button onClick={() => fileRef.current?.click()}>
          <ImagePlus size={16} />
          Upload photo
        </button>
        {mode === "camera" && (
          <IconButton
            label="Switch camera"
            onClick={() => {
              const next = facing === "user" ? "environment" : "user";
              setFacing(next);
              void startCamera(next);
            }}
          >
            <SwitchCamera size={16} />
          </IconButton>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              setRetry((v) => v + 1);
            }}
          >
            Retry tracking
          </button>
        </p>
      )}
      <div className="mirror-footnote">
        <span>
          <span className="privacy-dot" />
          {mode !== "camera" && portraitProvenance
            ? "Preview effects processed on your device."
            : "Processed on your device. Always your reflection."}
        </span>
        <span title="Last model inference latency">
          {latency > 0 ? `${latency.toFixed(0)} ms` : "Local vision"}
        </span>
      </div>
      {gestures && (
        <div className="gesture-note">
          <span>
            Experimental gestures · pinch to compare, swipe for a look, open
            palm for tools.
          </span>
          <button
            onClick={() => {
              const hand = snapshotRef.current.hands[0];
              if (!hand) {
                notify(
                  "Show a hand with your thumb and index finger pinched, then calibrate.",
                );
                return;
              }
              const p = hand.landmarks;
              const ratio =
                Math.hypot(p[4].x - p[8].x, p[4].y - p[8].y) /
                Math.max(0.01, Math.hypot(p[0].x - p[9].x, p[0].y - p[9].y));
              void pipelineRef.current?.calibratePinch(ratio * 1.3);
              notify(
                "Pinch threshold adjusted from your current hand pose. Gesture reliability varies; use buttons whenever needed.",
              );
            }}
          >
            Calibrate pinch
          </button>
        </div>
      )}
    </div>
  );
}
