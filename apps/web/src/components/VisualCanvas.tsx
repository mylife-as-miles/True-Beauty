import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownToLine,
  ImagePlus,
  Minus,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  Palette,
  ShoppingBag,
} from "lucide-react";
import { db, type JsonValue } from "../../../../packages/local-database/src";
import {
  SAMPLE_PRODUCTS,
  productIllustration,
} from "../../../../packages/commerce-engine/src";
import {
  moveCanvasObject,
  type CanvasObject,
} from "../../../../packages/fashion-engine/src";
import { useApp } from "../state/store";
import "./VisualCanvas.css";
const INITIAL: CanvasObject[] = [
  {
    id: "canvas-portrait",
    kind: "photo",
    x: 95,
    y: 45,
    width: 280,
    height: 350,
    rotation: -4,
    value: "/images/portrait-3.jpg",
  },
  {
    id: "canvas-note",
    kind: "note",
    x: 375,
    y: 70,
    width: 235,
    height: 200,
    rotation: 3,
    value:
      "A feeling to follow.\nSoft rose. Warm light.\nA little everyday romance.",
  },
  {
    id: "canvas-palette",
    kind: "palette",
    x: 350,
    y: 300,
    width: 330,
    height: 120,
    rotation: -1,
    value: "#a45356,#b76c63,#dcc5b4,#6e4d48,#c3aa8c",
  },
  {
    id: "canvas-product",
    kind: "product",
    x: 675,
    y: 70,
    width: 190,
    height: 295,
    rotation: 4,
    value: "elf-lip",
  },
];
function validObjects(value: unknown): CanvasObject[] | null {
  if (!Array.isArray(value) || value.length > 150) return null;
  return value.every(
    (o) =>
      o &&
      typeof o === "object" &&
      typeof o.id === "string" &&
      ["photo", "palette", "garment", "product", "note"].includes(o.kind) &&
      ["x", "y", "width", "height", "rotation"].every(
        (k) => typeof o[k] === "number" && Number.isFinite(o[k]),
      ) &&
      typeof o.value === "string" &&
      (o.kind !== "photo" ||
        [
          "session-photo",
          "/images/portrait.jpg",
          "/images/portrait-3.jpg",
        ].includes(o.value)),
  )
    ? value
    : null;
}
export default function VisualCanvas() {
  const notify = useApp((s) => s.notify),
    look = useApp((s) => s.look),
    record = useLiveQuery(
      async () => (await db.settings.get("visual-canvas")) ?? null,
      [],
    ),
    [objects, setObjects] = useState<CanvasObject[]>(INITIAL),
    [selected, setSelected] = useState<string | null>(null),
    [zoom, setZoom] = useState(1),
    [loaded, setLoaded] = useState(false),
    [editing, setEditing] = useState<string | null>(null);
  const drag = useRef<{
      id: string;
      startX: number;
      startY: number;
      origin: CanvasObject[];
      moved: boolean;
    } | null>(null),
    files = useRef<HTMLInputElement>(null),
    sessionImages = useRef<Map<string, string>>(new Map()),
    current = useRef(objects);
  current.current = objects;
  useEffect(() => {
    if (record === undefined || drag.current) return;
    const data = record ? validObjects(record.value) : INITIAL;
    if (data) setObjects(data);
    setLoaded(true);
  }, [record]);
  useEffect(
    () => () => {
      sessionImages.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const persist = async (next: CanvasObject[]) => {
    setObjects(next);
    try {
      await db.settings.put({
        id: "visual-canvas",
        value: next as unknown as JsonValue,
        updatedAt: Date.now(),
      });
    } catch {
      notify("Canvas could not be saved. Check browser storage.");
    }
  };
  const start = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0 || editing) return;
    if ((event.target as HTMLElement).closest("button,input,textarea,a"))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      origin: current.current,
      moved: false,
    };
    setSelected(id);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (event.clientX - d.startX) / zoom,
      dy = (event.clientY - d.startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setObjects(moveCanvasObject(d.origin, d.id, dx, dy));
  };
  const end = () => {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (moved) void persist(current.current);
  };
  const add = (kind: "note" | "palette" | "product") => {
    const offset = (objects.length % 6) * 30;
    const object: CanvasObject = {
      id: crypto.randomUUID(),
      kind,
      x: 150 + offset,
      y: 80 + offset,
      width: kind === "palette" ? 300 : 220,
      height: kind === "palette" ? 110 : kind === "product" ? 280 : 200,
      rotation: 0,
      value:
        kind === "note"
          ? "What are you drawn to?"
          : kind === "palette"
            ? [
                look.lipstick.color,
                look.blush.color,
                look.eyeshadow.color,
                look.hair.color,
              ].join(",")
            : SAMPLE_PRODUCTS[
                objects.filter((o) => o.kind === "product").length %
                  SAMPLE_PRODUCTS.length
              ].id,
    };
    setSelected(object.id);
    void persist([...objects, object]);
  };
  const remove = () => {
    if (!selected) return;
    const image = sessionImages.current.get(selected);
    if (image) {
      URL.revokeObjectURL(image);
      sessionImages.current.delete(selected);
    }
    void persist(objects.filter((o) => o.id !== selected));
    setSelected(null);
  };
  const exportBoard = () => {
    const contents = {
      format: "true-beauty-style-board",
      version: 1,
      objects,
      exportedAt: new Date().toISOString(),
      note: "Reference uploads are not included. This file contains composition, colours, text and sample product identifiers only.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(contents, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "true-beauty-style-board.json";
    a.click();
    URL.revokeObjectURL(url);
    notify("Style board exported without personal image data.");
  };
  return (
    <section className="visual-canvas">
      <header className="canvas-heading">
        <div>
          <p>Your visual beauty canvas</p>
          <h1>
            Follow your <em>inspiration.</em>
          </h1>
          <span>Collect a colour. Leave a thought. Let a look take shape.</span>
        </div>
        <button className="button secondary" onClick={exportBoard}>
          <ArrowDownToLine size={16} />
          Export board
        </button>
      </header>
      <div className="canvas-toolbar" aria-label="Style board tools">
        <div>
          <button onClick={() => add("note")}>
            <StickyNote size={16} />
            Note
          </button>
          <button onClick={() => add("palette")}>
            <Palette size={16} />
            Mirror palette
          </button>
          <button onClick={() => add("product")}>
            <ShoppingBag size={16} />
            Sample product
          </button>
          <button onClick={() => files.current?.click()}>
            <ImagePlus size={16} />
            Reference
          </button>
        </div>
        <div>
          <button
            onClick={() =>
              setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))
            }
            aria-label="Zoom out canvas"
          >
            <Minus size={16} />
          </button>
          <output aria-label="Canvas zoom">{Math.round(zoom * 100)}%</output>
          <button
            onClick={() =>
              setZoom((z) => Math.min(1.5, Math.round((z + 0.1) * 10) / 10))
            }
            aria-label="Zoom in canvas"
          >
            <Plus size={16} />
          </button>
          <button
            disabled={!selected}
            onClick={remove}
            aria-label="Remove selected canvas object"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      <input
        ref={files}
        className="canvas-hidden-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="Upload inspiration reference"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (
            !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
            file.size > 12 * 1024 * 1024
          ) {
            notify("Choose a JPEG, PNG or WebP under 12 MB.");
            return;
          }
          const id = crypto.randomUUID();
          sessionImages.current.set(id, URL.createObjectURL(file));
          const item: CanvasObject = {
            id,
            kind: "photo",
            x: 220,
            y: 80,
            width: 260,
            height: 330,
            rotation: 0,
            value: "session-photo",
          };
          void persist([...objects, item]);
          setSelected(id);
          notify(
            "Reference added to this tab. The photo itself has not been saved.",
          );
          event.target.value = "";
        }}
      />
      <div className="canvas-viewport" aria-busy={!loaded}>
        <div
          className="canvas-surface"
          style={{ width: 1100 * zoom, height: 650 * zoom }}
        >
          <div
            className="canvas-coordinate-space"
            style={{ transform: `scale(${zoom})` }}
          >
            {objects.map((object) => {
              const product =
                object.kind === "product"
                  ? SAMPLE_PRODUCTS.find((p) => p.id === object.value)
                  : undefined;
              const photo =
                object.kind === "photo"
                  ? object.value === "session-photo"
                    ? sessionImages.current.get(object.id)
                    : object.value
                  : undefined;
              return (
                <div
                  className={`canvas-object canvas-${object.kind} ${selected === object.id ? "selected" : ""}`}
                  key={object.id}
                  tabIndex={0}
                  role="group"
                  aria-label={`${object.kind} on style board. Use arrow keys to move, Delete to remove.`}
                  style={{
                    left: object.x,
                    top: object.y,
                    width: object.width,
                    height: object.height,
                    transform: `rotate(${object.rotation}deg)`,
                  }}
                  onFocus={() => setSelected(object.id)}
                  onPointerDown={(event) => start(event, object.id)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  onKeyDown={(event) => {
                    if (
                      (event.target as HTMLElement).tagName === "TEXTAREA" ||
                      (event.target as HTMLElement).tagName === "INPUT"
                    )
                      return;
                    const amount = event.shiftKey ? 20 : 5;
                    if (
                      [
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(event.key)
                    ) {
                      event.preventDefault();
                      void persist(
                        moveCanvasObject(
                          objects,
                          object.id,
                          event.key === "ArrowLeft"
                            ? -amount
                            : event.key === "ArrowRight"
                              ? amount
                              : 0,
                          event.key === "ArrowUp"
                            ? -amount
                            : event.key === "ArrowDown"
                              ? amount
                              : 0,
                        ),
                      );
                    } else if (
                      event.key === "Delete" ||
                      event.key === "Backspace"
                    ) {
                      event.preventDefault();
                      void persist(objects.filter((o) => o.id !== object.id));
                    }
                  }}
                >
                  {object.kind === "note" ? (
                    <>
                      {editing === object.id ? (
                        <textarea
                          aria-label="Edit inspiration note"
                          autoFocus
                          value={object.value}
                          maxLength={1500}
                          onChange={(event) =>
                            setObjects((old) =>
                              old.map((o) =>
                                o.id === object.id
                                  ? { ...o, value: event.target.value }
                                  : o,
                              ),
                            )
                          }
                          onBlur={() => {
                            setEditing(null);
                            void persist(current.current);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setEditing(null);
                              void persist(current.current);
                            }
                          }}
                        />
                      ) : (
                        <>
                          <p>{object.value}</p>
                          <button
                            className="canvas-edit-note"
                            onClick={() => setEditing(object.id)}
                          >
                            Edit note
                          </button>
                        </>
                      )}
                    </>
                  ) : object.kind === "palette" ? (
                    <>
                      <div className="canvas-swatches">
                        {object.value
                          .split(",")
                          .filter((c) => /^#[a-fA-F0-9]{6}$/.test(c))
                          .map((c, i) => (
                            <span
                              key={`${c}-${i}`}
                              style={{ background: c }}
                              title={c}
                            />
                          ))}
                      </div>
                      <p>A palette from your mirror</p>
                    </>
                  ) : object.kind === "product" && product ? (
                    <>
                      <img
                        src={productIllustration(product)}
                        alt="Original generic packaging illustration"
                        draggable={false}
                      />
                      <p>
                        {product.brand}
                        <strong>{product.name}</strong>
                        <small>Sample product reference</small>
                      </p>
                      <button
                        className="canvas-product-action"
                        onClick={() => useApp.getState().setSpace("discover")}
                      >
                        Explore products
                      </button>
                    </>
                  ) : object.kind === "photo" ? (
                    <>
                      {photo ? (
                        <img
                          src={photo}
                          alt={
                            object.value === "session-photo"
                              ? "Your inspiration reference"
                              : "Demo editorial portrait"
                          }
                          draggable={false}
                        />
                      ) : (
                        <p className="canvas-missing-photo">
                          Your reference stayed in its original tab. Add it
                          again to revisit this composition.
                        </p>
                      )}
                      <span className="canvas-photo-label">
                        {object.value === "session-photo"
                          ? "Session-only reference"
                          : "Demo editorial portrait"}
                      </span>
                    </>
                  ) : (
                    <p>{object.value}</p>
                  )}
                </div>
              );
            })}
            <div className="canvas-signature">
              A place for possibilities.<span>True Beauty</span>
            </div>
          </div>
        </div>
      </div>
      <footer className="canvas-footnote">
        <span>
          Move objects by dragging or using arrow keys. Shift + arrow moves
          further. Select an object, then Delete to remove it.
        </span>
        <button
          onClick={() => {
            setZoom(1);
            void persist(INITIAL);
            notify("Sample board restored.");
          }}
        >
          <RotateCcw size={13} />
          Restore sample board
        </button>
      </footer>
      <p className="canvas-privacy">
        Notes, colours and layout save locally. Uploaded reference images stay
        in this tab and are excluded from exports. No image analysis or look
        extraction has run.
      </p>
    </section>
  );
}
