import { useCallback, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Bookmark,
  SlidersHorizontal,
  Paintbrush,
  Scissors,
  Diamond,
  ChevronRight,
  Layers,
} from "lucide-react";
import {
  LOOK_PRESETS,
  cloneLook,
  MAKEUP_LAYERS,
  type MakeupLayerName,
  type MakeupFinish,
} from "../../../../packages/makeup-engine/src";
import { saveLook } from "../../../../packages/local-database/src";
import LivingMirror from "./LivingMirror";
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
    [advanced, setAdvanced] = useState(false);
  const preset =
    LOOK_PRESETS.find((p) => JSON.stringify(p.look) === JSON.stringify(look))
      ?.id ?? "custom";
  const snapshotRef = useRef<HTMLCanvasElement | null>(null);
  const onSnapshot = useCallback((canvas: HTMLCanvasElement) => {
    snapshotRef.current = canvas;
  }, []);
  const choosePreset = (id: string) => {
    const p = LOOK_PRESETS.find((p) => p.id === id);
    if (!p) return;
    setLook(cloneLook(p.look), p.name);
    notify(`${p.name} applied. Make it your own.`);
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
            Your personal beauty space <span>/</span> The studio
          </div>
          <h1>
            A little more <em>you.</em>
          </h1>
          <p>Explore a look. Find a feeling. Make it your own.</p>
        </div>
        <div className="studio-heading-actions">
          <span className="local-badge">
            <span />
            Private by design
          </span>
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
        <aside className="look-library">
          <div className="panel-heading">
            <h2>The look edit</h2>
            <span>6 looks</span>
          </div>
          <p className="panel-description">A starting point, never a rule.</p>
          <div className="preset-list">
            {LOOK_PRESETS.slice(0, 4).map((p, i) => (
              <button
                key={p.id}
                className={`preset-item ${preset === p.id ? "active" : ""}`}
                onClick={() => choosePreset(p.id)}
              >
                <div className={`preset-thumb thumb-${i}`}>
                  <img
                    src={
                      i === 3
                        ? "/images/portrait.jpg"
                        : "/images/portrait-neutral.jpg"
                    }
                    alt=""
                  />
                  <span style={{ background: p.palette[0] }} />
                </div>
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {
                      [
                        "Everyday, elevated",
                        "Romantic & luminous",
                        "Warmth in every detail",
                        "A little after-dark",
                      ][i]
                    }
                  </span>
                  <div className="mini-swatches">
                    {p.palette.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </div>
                </div>
                {preset === p.id && <Check size={15} />}
              </button>
            ))}
          </div>
          <button
            className="text-action explore-looks"
            onClick={() => {
              setAdvanced((v) => !v);
            }}
          >
            More ways to express <ArrowUpRight size={15} />
          </button>
          {advanced &&
            LOOK_PRESETS.slice(4).map((p) => (
              <button
                className="more-preset"
                key={p.id}
                onClick={() => choosePreset(p.id)}
              >
                <span style={{ background: p.palette[0] }} />
                {p.name}
                <ChevronRight size={15} />
              </button>
            ))}
          <div className="inspiration-note">
            <div className="note-art">
              <Mark size={42} />
              <span>
                Beauty has
                <br />
                no single shade.
              </span>
            </div>
            <h3>Meet your beauty companion</h3>
            <p>A new look, a better routine, or just a little inspiration.</p>
            <button
              className="text-action"
              onClick={() => useApp.getState().setAgentOpen(true)}
            >
              Let’s create together <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="portrait-credit">
            Demo photography via{" "}
            <a
              href="https://unsplash.com/license"
              target="_blank"
              rel="noreferrer"
            >
              Unsplash
            </a>
            . Cosmetic preview only.
          </div>
        </aside>
        <div className="mobile-look-select">
          <label htmlFor="mobile-look-preset">The look edit</label>
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
        <LivingMirror onSnapshot={onSnapshot} />
        <aside className="atelier">
          <div className="atelier-tabs" role="group" aria-label="Studio tools">
            {(
              [
                { id: "makeup", label: "Makeup", Icon: Paintbrush },
                { id: "hair", label: "Hair", Icon: Scissors },
                { id: "style", label: "Style", Icon: Diamond },
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
          {mode === "makeup" ? (
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
                      e.dataTransfer.setData("application/true-beauty-color", c)
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
                  {backend === "canvas2d" ? "Colour blending" : "Finish"}
                </legend>
                <div>
                  {(
                    ["matte", "gloss", "shimmer", "glitter"] as MakeupFinish[]
                  ).map((f) => (
                    <button
                      disabled={backend === "canvas2d" && f !== "matte"}
                      title={
                        backend === "canvas2d" && f !== "matte"
                          ? "This finish needs hardware WebGL2"
                          : undefined
                      }
                      key={f}
                      className={
                        (
                          backend === "canvas2d"
                            ? f === "matte"
                            : look[layer].finish === f
                        )
                          ? "active"
                          : ""
                      }
                      aria-pressed={
                        backend === "canvas2d"
                          ? f === "matte"
                          : look[layer].finish === f
                      }
                      onClick={() => patch(layer, { finish: f })}
                    >
                      {backend === "canvas2d" && f === "matte"
                        ? "Natural"
                        : f === "gloss"
                          ? "Glossy"
                          : f[0].toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </fieldset>
              {backend === "canvas2d" && (
                <p className="renderer-note">
                  Natural colour preview. Reflective finishes need hardware
                  WebGL2.
                </p>
              )}
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
                        .setMaskBackend(e.target.checked ? "opencv" : "canvas")
                    }
                  />
                </label>
                <p className="fine-print">
                  Optional refined feathering. The image engine loads only when
                  selected.
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
                  useApp
                    .getState()
                    .setDiscoveryContext({
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
                Recolouring is a local preview. A change in hairstyle or hair
                shape requires a generative provider, which is not configured.
              </div>
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
              {(["glasses", "earrings", "necklace"] as const).map((a) => (
                <div className="accessory-row" key={a}>
                  <Diamond size={20} />
                  <span>{a[0].toUpperCase() + a.slice(1)}</span>
                  <label className="switch">
                    <input
                      aria-label={`Preview ${a}`}
                      type="checkbox"
                      checked={look.accessories[a]}
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
                These are geometric AR accessory previews. Fit, material and
                dimensions are illustrative.
              </div>
              <button
                className="button secondary full-width"
                onClick={() => useApp.getState().setSpace("wardrobe")}
              >
                Open your wardrobe <ArrowUpRight size={16} />
              </button>
            </>
          )}
        </aside>
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
