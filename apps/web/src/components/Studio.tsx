import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Bookmark,
  SlidersHorizontal,
  Paintbrush,
  Scissors,
  Diamond,
  Maximize2,
  Minimize2,
  Undo2,
  Redo2,
  Sparkles,
  Sun,
  Layers,
} from "lucide-react";
import {
  LOOK_PRESETS,
  cloneLook,
  MAKEUP_LAYERS,
  ACCESSORY_KEYS,
  type MakeupLayerName,
  type MakeupFinish,
} from "../../../../packages/makeup-engine/src";
import { saveLook } from "../../../../packages/local-database/src";
import LivingMirror, { type MirrorTrackingStatus } from "./LivingMirror";
import LookGallery from "./LookGallery";
import LightControl from "./LightControl";
import "./StudioExperience.css";
import { useApp } from "../state/store";
import { Mark, Modal } from "./ui";
const LAYER_NAMES: Record<MakeupLayerName, string> = {
  lipstick: "Lip colour",
  blush: "Blush",
  eyeshadow: "Eyeshadow",
  foundation: "Foundation",
  eyeliner: "Eyeliner",
  mascara: "Mascara",
  brows: "Brows",
  contour: "Contour",
  bronzer: "Bronzer",
  highlighter: "Highlighter",
  lipliner: "Lip liner",
  lipgloss: "Lip gloss",
};
const COLORS = [
  "#a45356",
  "#b76c63",
  "#c57b79",
  "#a9475b",
  "#843b4b",
  "#71374b",
  "#b65a45",
  "#ce8c77",
  "#a26a58",
  "#7e4e4a",
  "#ba5267",
  "#9f3759",
];
const HAIR_COLORS = [
  ["Espresso", "#302321"],
  ["Soft black", "#1b1919"],
  ["Chestnut", "#6c3e2c"],
  ["Copper", "#a25232"],
  ["Honey", "#c09b5d"],
  ["Champagne", "#d4bb91"],
  ["Rosewood", "#884b60"],
  ["Silver", "#bfc0c4"],
  ["Cherry", "#731c34"],
];
export default function Studio() {
  const backend = useApp((s) => s.rendererBackend),
    maskBackend = useApp((s) => s.maskBackend),
    layer = useApp((s) => s.focusLayer) as MakeupLayerName,
    setLayer = useApp((s) => s.setFocusLayer);
  const look = useApp((s) => s.look),
    mode = useApp((s) => s.studioMode),
    setMode = useApp((s) => s.setStudioMode),
    patch = useApp((s) => s.patchLayer),
    notify = useApp((s) => s.notify),
    setLook = useApp((s) => s.setLook),
    lookName = useApp((s) => s.lookName);
  const [saveOpen, setSaveOpen] = useState(false),
    [name, setName] = useState("My soft glow"),
    [palette, setPalette] = useState("The rose edit"),
    [looksOpen, setLooksOpen] = useState(false),
    [moreTools, setMoreTools] = useState(false);
  const portrait = useApp((s) => s.portraitUrl),
    portraitVision = useApp((s) => s.portraitVision);
  const focused = useApp((s) => s.mirrorFocused),
    past = useApp((s) => s.past),
    future = useApp((s) => s.future),
    quality = useApp((s) => s.renderQuality);
  const visionOcclusion = useApp((s) => s.visionOcclusion);
  const [tracking, setTracking] = useState<MirrorTrackingStatus>({
    accessories: [],
    warning: "",
  });
  const onTrackingStatus = useCallback(
    (next: MirrorTrackingStatus) =>
      setTracking((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      ),
    [],
  );
  const focusReturnRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let frame = 0;
    if (focused) {
      if (!focusReturnRef.current)
        focusReturnRef.current = document.activeElement as HTMLElement;
      frame = requestAnimationFrame(() =>
        document
          .querySelector<HTMLButtonElement>(".focus-toggle")
          ?.focus({ preventScroll: true }),
      );
    } else if (focusReturnRef.current) {
      const target = focusReturnRef.current;
      focusReturnRef.current = null;
      frame = requestAnimationFrame(() => {
        if (target.isConnected && target.getClientRects().length)
          target.focus({ preventScroll: true });
      });
    }
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  const beginEdit = () => useApp.getState().beginEdit(),
    endEdit = () => useApp.getState().endEdit();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "Escape") {
        useApp.getState().setMirrorView({ mirrorFocused: false });
        return;
      }
      const el = e.target as HTMLElement;
      if (
        el.matches(
          'textarea,select,input:not([type="range"]):not([type="checkbox"]),[contenteditable="true"]',
        )
      )
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useApp.getState().redo();
        else useApp.getState().undo();
      } else if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.key.toLowerCase() === "f" &&
        Boolean(el.closest(".studio-sheet"))
      ) {
        e.preventDefault();
        if (!useApp.getState().mirrorFocused)
          focusReturnRef.current = document.activeElement as HTMLElement;
        useApp
          .getState()
          .setMirrorView({ mirrorFocused: !useApp.getState().mirrorFocused });
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);
  const preset =
    LOOK_PRESETS.find((p) => JSON.stringify(p.look) === JSON.stringify(look))
      ?.id ?? "custom";
  const inspectorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = inspectorRef.current;
    if (!el) return;
    const update = () =>
      setMoreTools(el.scrollTop + el.clientHeight < el.scrollHeight - 6);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    update();
    return () => observer.disconnect();
  }, [mode, layer, quality]);
  const snapshotRef = useRef<HTMLCanvasElement | null>(null);
  const onSnapshot = useCallback((canvas: HTMLCanvasElement) => {
    snapshotRef.current = canvas;
  }, []);
  const choosePreset = (id: string) => {
    const p = LOOK_PRESETS.find((p) => p.id === id);
    if (!p) return;
    setLook(cloneLook(p.look), p.name);
    if (!looksOpen) notify(`${p.name} applied. Make it your own.`);
  };
  const save = async () => {
    if (!name.trim()) return;
    try {
      await saveLook(name.trim(), look);
      notify("Look saved on this device. Your photo has not been stored.");
      setSaveOpen(false);
    } catch {
      notify("Unable to save. Check available browser storage.");
    }
  };
  return (
    <>
      <div className="studio-heading">
        <div>
          <div className="breadcrumb">
            Your personal beauty space <span>/</span> The Living Mirror
          </div>
          <h1>
            A little more <em>you.</em>
          </h1>
          <p>Your reflection. An open canvas.</p>
        </div>
        <div className="studio-heading-actions">
          <div className="edit-history" role="group" aria-label="Edit history">
            <button
              aria-label="Undo edit"
              title="Undo · Ctrl/⌘ Z"
              disabled={!past.length}
              onClick={() => useApp.getState().undo()}
            >
              <Undo2 size={17} />
            </button>
            <button
              aria-label="Redo edit"
              title="Redo · Ctrl/⌘ Shift Z"
              disabled={!future.length}
              onClick={() => useApp.getState().redo()}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <button
            className="focus-toggle"
            aria-label={focused ? "Leave focus" : "Focus mirror"}
            aria-pressed={focused}
            onClick={() => {
              if (!focused)
                focusReturnRef.current = document.activeElement as HTMLElement;
              useApp.getState().setMirrorView({ mirrorFocused: !focused });
            }}
            title="Focus mirror · F while editing / Escape"
          >
            {focused ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            <span>{focused ? "Leave focus" : "Focus mirror"}</span>
          </button>
          <button
            className="button primary"
            onClick={() => {
              setName(preset === "soft-glow" ? "My soft glow" : lookName);
              setSaveOpen(true);
            }}
          >
            <Bookmark size={16} /> Save this look
          </button>
        </div>
      </div>
      <div className="studio-layout">
        <aside className="look-library" aria-label="Look library">
          <LookGallery
            compact
            activeId={preset}
            onSelect={choosePreset}
            portraitUrl={portrait}
            snapshot={
              portraitVision?.url === portrait ? portraitVision.snapshot : null
            }
          />
          <button
            className="studio-agent-link"
            onClick={() => useApp.getState().setAgentOpen(true)}
          >
            <Sparkles size={17} />
            <span>
              Create with your
              <br />
              beauty companion
            </span>
            <ArrowUpRight size={15} />
          </button>
        </aside>
        <div className="mobile-look-select">
          <button className="text-action" onClick={() => setLooksOpen(true)}>
            The look edit <ChevronDown size={14} />
          </button>
          <label className="sr-only" htmlFor="mobile-look-preset">
            Choose a look
          </label>
          <select
            id="mobile-look-preset"
            value={preset}
            onChange={(e) => choosePreset(e.target.value)}
          >
            {preset === "custom" && (
              <option value="custom">
                {lookName === "Your signature look"
                  ? "Your own expression"
                  : lookName}
              </option>
            )}
            {LOOK_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <LivingMirror
          onSnapshot={onSnapshot}
          onTrackingStatus={onTrackingStatus}
        />
        <div className="atelier-dock">
          <aside
            ref={inspectorRef}
            className="atelier"
            aria-label="Mirror editor"
            onScroll={(e) => {
              const el = e.currentTarget;
              setMoreTools(
                el.scrollTop + el.clientHeight < el.scrollHeight - 6,
              );
            }}
          >
            <div
              className="atelier-tabs"
              role="group"
              aria-label="Studio tools"
            >
              {(
                [
                  { id: "makeup", label: "Makeup", Icon: Paintbrush },
                  { id: "hair", label: "Hair", Icon: Scissors },
                  { id: "style", label: "Style", Icon: Diamond },
                  { id: "light", label: "Light", Icon: Sun },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  aria-pressed={mode === t.id}
                  onClick={() => setMode(t.id)}
                  className={mode === t.id ? "active" : ""}
                >
                  <t.Icon size={16} />
                  {t.label}
                </button>
              ))}
            </div>
            {mode === "light" ? (
              <LightControl />
            ) : mode === "makeup" ? (
              <>
                <div className="atelier-heading">
                  <div>
                    <span className="subtle-label">Makeup atelier</span>
                    <h2>Your finishing touch.</h2>
                  </div>
                  <SlidersHorizontal size={18} />
                </div>
                <div className="layer-selector">
                  {(
                    [
                      "lipstick",
                      "blush",
                      "eyeshadow",
                      "foundation",
                    ] as MakeupLayerName[]
                  ).map((k) => (
                    <button
                      key={k}
                      className={layer === k ? "active" : ""}
                      onClick={() => setLayer(k)}
                    >
                      <span
                        className={`layer-icon layer-${k}`}
                        style={{ color: look[k].color }}
                      >
                        {k === "lipstick" ? (
                          <svg width="28" height="18" viewBox="0 0 40 24">
                            <path
                              d="M1 12C8 12 12 1 20 6 28 1 32 12 39 12 30 15 28 23 20 22 12 23 8 15 1 12Z"
                              fill="currentColor"
                            />
                            <path
                              d="M1 12Q20 17 39 12"
                              fill="none"
                              stroke="white"
                              strokeOpacity=".5"
                            />
                          </svg>
                        ) : k === "blush" ? (
                          <span className="blush-mark" />
                        ) : k === "eyeshadow" ? (
                          <svg width="28" height="18" viewBox="0 0 40 24">
                            <path
                              d="M2 17Q20-3 38 17Q20 8 2 17Z"
                              fill="currentColor"
                            />
                            <path
                              d="M2 17Q20 7 38 17"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                            />
                          </svg>
                        ) : (
                          <span className="foundation-mark" />
                        )}
                      </span>
                      <span>{LAYER_NAMES[k]}</span>
                    </button>
                  ))}
                </div>
                <div className="control-heading">
                  <h3>{LAYER_NAMES[layer]}</h3>
                  <label className="switch">
                    <input
                      aria-label={`Enable ${LAYER_NAMES[layer]}`}
                      type="checkbox"
                      checked={look[layer].enabled}
                      onChange={(e) =>
                        patch(layer, { enabled: e.target.checked })
                      }
                    />
                    <span />
                  </label>
                </div>
                <div className="palette-title">
                  <span>{palette}</span>
                  <button
                    aria-label="Change colour palette"
                    onClick={() =>
                      setPalette((p) =>
                        p === "The rose edit" ? "Warm earth" : "The rose edit",
                      )
                    }
                  >
                    <ChevronDown size={15} />
                  </button>
                </div>
                <div className="color-palette">
                  {(palette === "The rose edit"
                    ? COLORS
                    : [
                        "#a16247",
                        "#b47b51",
                        "#af8b53",
                        "#c59a77",
                        "#815c4c",
                        "#bf8766",
                        "#7b543c",
                        "#a55d42",
                        "#d9ad88",
                        "#855943",
                        "#ba714a",
                        "#593f37",
                      ]
                  ).map((c, i) => (
                    <button
                      key={c}
                      className={
                        look[layer].color.toLowerCase() === c.toLowerCase()
                          ? "selected"
                          : ""
                      }
                      style={{ background: c }}
                      aria-label={`Apply ${LAYER_NAMES[layer]} shade ${i + 1}`}
                      title={c}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "application/true-beauty-color",
                          c,
                        )
                      }
                      onClick={() => patch(layer, { color: c, enabled: true })}
                    >
                      {look[layer].color.toLowerCase() === c.toLowerCase() && (
                        <Check size={16} />
                      )}
                    </button>
                  ))}
                </div>
                <div className="shade-detail">
                  <span>
                    <i style={{ background: look[layer].color }} />
                    {look[layer].color.toUpperCase()}
                  </span>
                  <label>
                    Custom shade{" "}
                    <input
                      type="color"
                      aria-label="Custom makeup colour"
                      value={look[layer].color}
                      onChange={(e) =>
                        patch(layer, { color: e.target.value, enabled: true })
                      }
                    />
                  </label>
                </div>
                <div className="range-control">
                  <div>
                    <label htmlFor="intensity">Intensity</label>
                    <span>{Math.round(look[layer].opacity * 100)}%</span>
                  </div>
                  <input
                    id="intensity"
                    onPointerDown={beginEdit}
                    onPointerUp={endEdit}
                    onBlur={endEdit}
                    type="range"
                    min="0"
                    max="100"
                    value={look[layer].opacity * 100}
                    onChange={(e) =>
                      patch(layer, { opacity: Number(e.target.value) / 100 })
                    }
                  />
                  <div className="range-hints">
                    <span>A hint</span>
                    <span>A statement</span>
                  </div>
                </div>
                <fieldset className="finish-control">
                  <legend>
                    <span>Finish</span>
                    <button
                      type="button"
                      className="material-detail-toggle"
                      aria-pressed={quality === "high"}
                      onClick={() =>
                        useApp
                          .getState()
                          .setRenderQuality(
                            quality === "high" ? "adaptive" : "high",
                          )
                      }
                      title="More material detail can use more battery"
                    >
                      <Sparkles size={13} />
                      {quality === "high" ? "Enhanced" : "Enhance detail"}
                    </button>
                  </legend>
                  <div>
                    {(
                      ["matte", "gloss", "shimmer", "glitter"] as MakeupFinish[]
                    ).map((f) => (
                      <button
                        key={f}
                        className={look[layer].finish === f ? "active" : ""}
                        aria-pressed={look[layer].finish === f}
                        onClick={() => patch(layer, { finish: f })}
                      >
                        <i
                          className={`finish-sample finish-${f}`}
                          style={
                            {
                              "--pigment": look[layer].color,
                            } as React.CSSProperties
                          }
                        />
                        {f === "gloss"
                          ? "Glossy"
                          : f[0].toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <details className="more-layers">
                  <summary>
                    <Layers size={16} /> More layers <ChevronDown size={15} />
                  </summary>
                  <div className="extra-layers">
                    {MAKEUP_LAYERS.filter(
                      (k) =>
                        ![
                          "lipstick",
                          "blush",
                          "eyeshadow",
                          "foundation",
                        ].includes(k),
                    ).map((k) => (
                      <button
                        key={k}
                        onClick={() => {
                          setLayer(k);
                          patch(k, { enabled: true });
                        }}
                        className={layer === k ? "active" : ""}
                      >
                        {LAYER_NAMES[k]}
                        {look[k].enabled && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                  <label className="precision-control">
                    <span>Precision edges</span>
                    <input
                      type="checkbox"
                      checked={maskBackend === "opencv"}
                      onChange={(e) =>
                        useApp
                          .getState()
                          .setMaskBackend(
                            e.target.checked ? "opencv" : "canvas",
                          )
                      }
                    />
                  </label>
                  <p className="fine-print">
                    Optional refined feathering. The image engine loads only
                    when selected.
                  </p>
                  <label className="reshape-label">
                    Optional face reshaping{" "}
                    <input
                      aria-label="Optional face reshaping"
                      type="range"
                      min="0"
                      max=".6"
                      step=".01"
                      value={look.reshape}
                      onChange={(e) =>
                        setLook({ ...look, reshape: Number(e.target.value) })
                      }
                    />
                  </label>
                  <p className="fine-print">
                    A cosmetic simulation, separate from skin observations.
                  </p>
                </details>
                <button
                  className="product-match"
                  onClick={() => {
                    useApp.getState().setDiscoveryContext({
                      color: look[layer].color,
                      category: ["foundation", "blush", "eyeshadow"].includes(
                        layer,
                      )
                        ? layer
                        : "lipstick",
                    });
                    useApp.getState().setSpace("discover");
                  }}
                >
                  <span className="mini-product" />
                  <span>
                    <strong>Love this shade?</strong>
                    <small>Explore similar shade references</small>
                  </span>
                  <ArrowUpRight size={17} />
                </button>
              </>
            ) : mode === "hair" ? (
              <>
                <div className="atelier-heading">
                  <div>
                    <span className="subtle-label">Hair studio</span>
                    <h2>A different kind of glow.</h2>
                  </div>
                </div>
                <div className="control-heading">
                  <h3>Live hair colour</h3>
                  <label className="switch">
                    <input
                      aria-label="Enable hair recolouring"
                      type="checkbox"
                      checked={look.hair.enabled}
                      onChange={(e) =>
                        patch("hair", { enabled: e.target.checked })
                      }
                    />
                    <span />
                  </label>
                </div>
                <p className="panel-description">
                  Your texture, a new perspective. Segmented locally on your
                  device.
                </p>
                <div className="hair-palette">
                  {HAIR_COLORS.map(([n, c]) => (
                    <button
                      key={n}
                      className={look.hair.color === c ? "selected" : ""}
                      onClick={() => patch("hair", { color: c, enabled: true })}
                    >
                      <i style={{ background: c }} />
                      <span>{n}</span>
                    </button>
                  ))}
                </div>
                <div className="range-control">
                  <div>
                    <label htmlFor="hair-intensity">Colour strength</label>
                    <span>{Math.round(look.hair.opacity * 100)}%</span>
                  </div>
                  <input
                    id="hair-intensity"
                    onPointerDown={beginEdit}
                    onPointerUp={endEdit}
                    onBlur={endEdit}
                    type="range"
                    min="0"
                    max="100"
                    value={look.hair.opacity * 100}
                    onChange={(e) =>
                      patch("hair", { opacity: Number(e.target.value) / 100 })
                    }
                  />
                </div>
                <label className="field-label">
                  Colour placement
                  <select
                    value={look.hair.mode}
                    onChange={(e) =>
                      patch("hair", { mode: e.target.value, enabled: true })
                    }
                  >
                    <option value="solid">All-over colour</option>
                    <option value="ombre">Root-to-tip ombré</option>
                    <option value="highlights">Soft highlights</option>
                    <option value="balayage">Balayage</option>
                  </select>
                </label>
                <label className="field-label color-field">
                  Second shade
                  <input
                    type="color"
                    value={look.hair.secondaryColor}
                    onChange={(e) =>
                      patch("hair", { secondaryColor: e.target.value })
                    }
                  />
                </label>
                <div className="info-note">
                  Recolouring is a local preview. For generated hairstyle
                  changes, open provider preview to review availability and a
                  credit quote.
                </div>
                <button
                  className="button secondary full-width"
                  onClick={() => {
                    useApp.getState().setGenerationFeature("hair");
                    useApp.getState().setSpace("generation");
                  }}
                >
                  Explore hairstyle previews <ArrowUpRight size={16} />
                </button>
              </>
            ) : (
              <>
                <div className="atelier-heading">
                  <div>
                    <span className="subtle-label">The dressing room</span>
                    <h2>The details are you.</h2>
                  </div>
                </div>
                <p className="panel-description">
                  Landmark-anchored accessories move with your reflection.
                </p>
                {ACCESSORY_KEYS.map((a) => (
                  <div className="accessory-row" key={a}>
                    <Diamond size={20} />
                    <span>{a[0].toUpperCase() + a.slice(1)}</span>
                    <label className="switch">
                      <input
                        aria-label={`Preview ${a}`}
                        type="checkbox"
                        checked={!!look.accessories[a]}
                        onChange={(e) =>
                          setLook({
                            ...look,
                            accessories: {
                              ...look.accessories,
                              [a]: e.target.checked,
                            },
                          })
                        }
                      />
                      <span />
                    </label>
                  </div>
                ))}
                <div className="info-note">
                  These are geometric landmark projections. Fit, material and
                  dimensions are illustrative. Rings need a supported visible
                  hand; wrist previews can use a visible hand or visible
                  wrist/elbow pose. Choose Full portrait to see wrist and head
                  accessories. The diamond control opens tracker details.
                </div>
                {tracking.accessories.length > 0 && (
                  <div
                    id="accessory-tracking-details"
                    tabIndex={-1}
                    style={{ scrollMarginTop: 60 }}
                    onFocus={(event) => {
                      event.currentTarget.style.outline =
                        "2px solid var(--accent)";
                      event.currentTarget.style.outlineOffset = "3px";
                    }}
                    onBlur={(event) => {
                      event.currentTarget.style.outline = "";
                      event.currentTarget.style.outlineOffset = "";
                    }}
                    className="info-note"
                    role="status"
                    aria-label="Accessory tracking status"
                  >
                    {tracking.accessories.map((item) => (
                      <p key={item.key} style={{ margin: "4px 0" }}>
                        <strong>
                          {item.key[0].toUpperCase() + item.key.slice(1)}:{" "}
                          {item.available
                            ? `${item.source} anchor available`
                            : "anchor unavailable"}
                          .
                        </strong>{" "}
                        {item.reason}
                      </p>
                    ))}
                  </div>
                )}
                {tracking.warning && (
                  <p
                    className="inline-error"
                    role="status"
                    aria-label="Optional vision unavailable"
                  >
                    {tracking.warning} Basic local previews remain available.
                  </p>
                )}
                <label
                  className="check-label"
                  style={{
                    minHeight: 44,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={visionOcclusion}
                    onChange={(e) =>
                      useApp.getState().setVisionOcclusion(e.target.checked)
                    }
                  />
                  Enhanced overlap detail
                </label>
                <p className="panel-description">
                  Optional local body segmentation helps preserve hair and skin
                  boundaries around accessories. It loads only with an accessory
                  enabled, uses more processing, and does not measure depth.
                </p>
                <button
                  className="button secondary full-width"
                  onClick={() => useApp.getState().setSpace("wardrobe")}
                >
                  Open your wardrobe <ArrowUpRight size={16} />
                </button>
              </>
            )}
            <details className="studio-quality">
              <summary>
                Preview quality{" "}
                <span>{quality === "high" ? "Detailed" : "Balanced"}</span>
              </summary>
              <div role="group" aria-label="Rendering quality">
                {(["adaptive", "high"] as const).map((q) => (
                  <button
                    key={q}
                    aria-pressed={quality === q}
                    onClick={() => useApp.getState().setRenderQuality(q)}
                  >
                    {q === "high" ? "Detailed materials" : "Balanced"}
                  </button>
                ))}
              </div>
              <p>
                {backend === "canvas2d"
                  ? "Efficient rendering with approximate reflective finishes. Detailed mode uses WebGL when available."
                  : "Shader materials respond to your chosen light. Detailed mode can use more battery."}
              </p>
            </details>
          </aside>
          <button
            className="more-tools-cue"
            style={{ visibility: moreTools ? "visible" : "hidden" }}
            onClick={() =>
              inspectorRef.current?.scrollBy({
                top: Math.max(160, inspectorRef.current.clientHeight * 0.65),
                behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
                  ? "instant"
                  : "smooth",
              })
            }
          >
            More controls below <ChevronDown size={13} />
          </button>
        </div>
      </div>
      <div className="studio-bottom">
        <div>
          <Mark size={20} />
          <span>Your face. Your palette. Your possibilities.</span>
        </div>
        <button
          className="text-action"
          onClick={() => useApp.getState().setSpace("skin")}
        >
          Get to know your skin <ArrowUpRight size={16} />
        </button>
      </div>
      {looksOpen && (
        <Modal
          title="A starting point. Make it yours."
          onClose={() => setLooksOpen(false)}
        >
          <LookGallery
            activeId={preset}
            portraitUrl={portrait}
            snapshot={
              portraitVision?.url === portrait ? portraitVision.snapshot : null
            }
            onSelect={choosePreset}
          />
          <button
            className="button primary full-width"
            onClick={() => setLooksOpen(false)}
          >
            See in the mirror <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
      {saveOpen && (
        <Modal title="Keep this feeling." onClose={() => setSaveOpen(false)}>
          <p>
            Your colours, layers and styling will be saved on this device. No
            photograph is stored.
          </p>
          <label className="field-label">
            Name your look
            <input
              autoFocus
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save()}
            />
          </label>
          <div className="saved-palette">
            {[
              look.lipstick.color,
              look.blush.color,
              look.eyeshadow.color,
              look.hair.color,
            ].map((c, i) => (
              <i key={i} style={{ background: c }} />
            ))}
          </div>
          <button
            className="button primary full-width"
            disabled={!name.trim()}
            onClick={() => void save()}
          >
            <Bookmark size={16} />
            Save look locally
          </button>
        </Modal>
      )}
    </>
  );
}
