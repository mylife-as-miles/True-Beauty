import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw } from "lucide-react";
import { BeautyRenderer } from "../../../../packages/ar-renderer/src";
import { LOOK_PRESETS } from "../../../../packages/makeup-engine/src";
import {
  createVision,
  type VisionEngine,
  type VisionSnapshot,
} from "../../../../packages/vision-core/src";
import "./LookGallery.css";

export interface LookGalleryProps {
  activeId: string;
  onSelect: (id: string) => void;
  portraitUrl: string;
  compact?: boolean;
  /** undefined: standalone inference; null: wait for the parent's shared pipeline. */
  snapshot?: VisionSnapshot | null;
}

type PreviewState = "loading" | "ready" | "unavailable";
const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Six actual color studies share one facial analysis and one temporary renderer. */
export default function LookGallery({
  activeId,
  onSelect,
  portraitUrl,
  compact = false,
  snapshot,
}: LookGalleryProps) {
  const titleId = useId(),
    noticeId = useId(),
    buttons = useRef<Array<HTMLButtonElement | null>>([]),
    canvases = useRef<Array<HTMLCanvasElement | null>>([]),
    [image, setImage] = useState<HTMLImageElement | null>(null),
    [imageFailed, setImageFailed] = useState(false),
    [previewState, setPreviewState] = useState<PreviewState>("loading"),
    [notice, setNotice] = useState("Preparing your looks…"),
    [attempt, setAttempt] = useState(0),
    [focusIndex, setFocusIndex] = useState(() =>
      Math.max(
        0,
        LOOK_PRESETS.findIndex((look) => look.id === activeId),
      ),
    );

  useEffect(() => {
    const index = LOOK_PRESETS.findIndex((look) => look.id === activeId);
    if (index >= 0) setFocusIndex(index);
  }, [activeId]);

  useEffect(() => {
    let alive = true;
    const next = new Image();
    next.dataset.gallerySource = portraitUrl;
    setImage(null);
    setImageFailed(false);
    setPreviewState("loading");
    setNotice("Preparing your looks…");
    if (/^https?:/i.test(portraitUrl)) next.crossOrigin = "anonymous";
    next.onload = () => {
      if (alive) setImage(next);
    };
    next.onerror = () => {
      if (!alive) return;
      setImageFailed(true);
      setPreviewState("unavailable");
      setNotice("Choose a portrait in the mirror to see your looks.");
    };
    next.src = portraitUrl;
    return () => {
      alive = false;
      next.onload = null;
      next.onerror = null;
      // The application owns this source, including any session Blob URL.
    };
  }, [portraitUrl, attempt]);

  useEffect(() => {
    if (!image || image.dataset.gallerySource !== portraitUrl) return;
    let alive = true,
      engine: VisionEngine | undefined,
      renderer: BeautyRenderer | undefined;
    setPreviewState("loading");
    setNotice("Preparing your looks…");

    if (snapshot === null) return;

    const prepare = async () => {
      try {
        let geometry = snapshot;
        if (geometry === undefined) {
          engine = createVision({ inferenceMaxSide: 480 });
          geometry = await engine.analyzeImage(image, {
            face: true,
            hair: false,
            hands: false,
          });
        }
        if (!alive) return;
        if (!geometry.landmarks.length)
          throw new Error("A clear face is needed for aligned previews.");
        const scratch = document.createElement("canvas");
        // Thumbnails show genuine pigment placement. Full finish controls live in the mirror.
        renderer = new BeautyRenderer(scratch, {
          maxSide: 240,
          forceCanvas: true,
        });
        for (let index = 0; index < LOOK_PRESETS.length; index++) {
          if (!alive) return;
          renderer.render({
            source: image,
            landmarks: geometry.landmarks,
            hairMask: geometry.hairMask,
            hands: geometry.hands,
            look: LOOK_PRESETS[index].look,
            time: 0,
          });
          const target = canvases.current[index];
          if (!target) continue;
          target.width = scratch.width;
          target.height = scratch.height;
          const context = target.getContext("2d", { alpha: false });
          if (!context) throw new Error("Preview canvas is unavailable.");
          context.drawImage(scratch, 0, 0);
          // Give the main mirror a chance to paint between these one-shot renders.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        if (alive) {
          setPreviewState("ready");
          setNotice(
            "Colour studies on your portrait. Explore the finish in your mirror.",
          );
        }
      } catch {
        if (alive) {
          setPreviewState("unavailable");
          setNotice(
            "Original photo shown. Aligned look previews are unavailable.",
          );
        }
      } finally {
        renderer?.dispose();
        engine?.dispose();
      }
    };
    void prepare();
    return () => {
      alive = false;
      renderer?.dispose();
      engine?.dispose();
    };
  }, [image, snapshot, portraitUrl]);

  const choose = (index: number, moveFocus = false) => {
    const wrapped = (index + LOOK_PRESETS.length) % LOOK_PRESETS.length;
    setFocusIndex(wrapped);
    onSelect(LOOK_PRESETS[wrapped].id);
    if (moveFocus) buttons.current[wrapped]?.focus({ preventScroll: true });
    buttons.current[wrapped]?.scrollIntoView({
      behavior: reducedMotion() ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  };
  const keySelect = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? LOOK_PRESETS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    choose(next, true);
  };

  return (
    <section
      className={`look-gallery${compact ? " look-gallery--compact" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={noticeId}
      data-preview-state={
        image?.dataset.gallerySource === portraitUrl
          ? previewState
          : imageFailed
            ? "unavailable"
            : "loading"
      }
      data-vision-source={snapshot === undefined ? "standalone" : "shared"}
    >
      <div className="look-gallery-heading">
        <div>
          <h2 id={titleId}>Find your feeling.</h2>
          <p>A starting point. A thousand possibilities.</p>
        </div>
        <div
          className="look-gallery-navigation"
          role="group"
          aria-label="Browse looks"
        >
          <button
            type="button"
            aria-label="Previous look"
            onClick={() => choose(focusIndex - 1, true)}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Next look"
            onClick={() => choose(focusIndex + 1, true)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
      <div
        className="look-gallery-reel"
        role="list"
        aria-label="Look collection"
      >
        {LOOK_PRESETS.map((look, index) => {
          const active = activeId === look.id;
          return (
            <div className="look-gallery-item" role="listitem" key={look.id}>
              <button
                type="button"
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                className={`look-object${active ? " is-active" : ""}`}
                data-look-id={look.id}
                aria-labelledby={`${titleId}-${look.id}-action ${titleId}-${look.id}-name ${titleId}-${look.id}-description`}
                aria-pressed={active}
                tabIndex={focusIndex === index ? 0 : -1}
                onClick={() => choose(index)}
                onKeyDown={(event) => keySelect(event, index)}
              >
                <span className="sr-only" id={`${titleId}-${look.id}-action`}>
                  Apply
                </span>
                <span className="look-object-image">
                  {!imageFailed ? (
                    <img
                      src={portraitUrl}
                      alt=""
                      loading="lazy"
                      draggable={false}
                    />
                  ) : (
                    <span className="look-object-placeholder">
                      Your next look
                    </span>
                  )}
                  <canvas
                    ref={(node) => {
                      canvases.current[index] = node;
                    }}
                    aria-hidden="true"
                    data-look-id={look.id}
                    width={180}
                    height={240}
                  />
                  <span className="look-object-selection" aria-hidden="true">
                    <Check size={14} />
                  </span>
                </span>
                <span className="look-object-caption">
                  <span
                    className="look-object-name"
                    id={`${titleId}-${look.id}-name`}
                  >
                    {look.name}
                  </span>{" "}
                  <span className="look-object-palette" aria-hidden="true">
                    {look.palette.map((color) => (
                      <i key={color} style={{ backgroundColor: color }} />
                    ))}
                  </span>{" "}
                  <span
                    className="look-object-description"
                    id={`${titleId}-${look.id}-description`}
                  >
                    {look.description}
                  </span>
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="look-gallery-footnote">
        <p id={noticeId} role="status" aria-live="polite">
          {notice}
        </p>
        {previewState === "unavailable" &&
          snapshot === undefined &&
          !imageFailed && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <RotateCcw size={13} /> Retry previews
            </button>
          )}
      </div>
    </section>
  );
}
