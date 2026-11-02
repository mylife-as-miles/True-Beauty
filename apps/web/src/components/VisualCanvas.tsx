import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Focus,
  Hand,
  ImagePlus,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
  StickyNote,
  Trash2,
  Palette,
  ShoppingBag,
  X,
} from "lucide-react";
import { db, type JsonValue } from "../../../../packages/local-database/src";
import {
  SAMPLE_PRODUCTS,
  productIllustration,
  type Product,
} from "../../../../packages/commerce-engine/src";
import {
  moveCanvasObject,
  type CanvasObject,
} from "../../../../packages/fashion-engine/src";
import { useApp } from "../state/store";
import "./VisualCanvas.css";

const WORLD = { width: 1100, height: 650 };
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
const TARGETS = [
  { id: "lipstick", name: "Lips", label: "lip colour" },
  { id: "blush", name: "Cheeks", label: "blush" },
  { id: "eyeshadow", name: "Eyes", label: "eyeshadow" },
] as const;
type Target = (typeof TARGETS)[number]["id"];
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const colorsOf = (object?: CanvasObject) =>
  object?.kind === "palette"
    ? object.value.split(",").filter((color) => /^#[a-f\d]{6}$/i.test(color))
    : [];
const productOf = (object?: CanvasObject) =>
  object?.kind === "product"
    ? SAMPLE_PRODUCTS.find((product) => product.id === object.value)
    : undefined;
const labelOf = (object: CanvasObject) =>
  productOf(object)?.name ??
  (object.kind === "photo"
    ? "Reference portrait"
    : object.kind === "palette"
      ? "Colour palette"
      : object.kind === "note"
        ? "A note to follow"
        : "Garment reference");
function validObjects(value: unknown): CanvasObject[] | null {
  if (!Array.isArray(value) || value.length > 150) return null;
  return value.every(
    (object) =>
      object &&
      typeof object === "object" &&
      typeof object.id === "string" &&
      ["photo", "palette", "garment", "product", "note"].includes(
        object.kind,
      ) &&
      ["x", "y", "width", "height", "rotation"].every(
        (key) =>
          typeof object[key] === "number" && Number.isFinite(object[key]),
      ) &&
      object.width > 0 &&
      object.height > 0 &&
      typeof object.value === "string" &&
      (object.kind !== "photo" ||
        [
          "session-photo",
          "/images/portrait.jpg",
          "/images/portrait-3.jpg",
        ].includes(object.value)),
  )
    ? value
    : null;
}
interface BoardView {
  zoom: number;
  left: number;
  top: number;
  selected: string | null;
  color: string | null;
  target: Target;
  variant: number;
}

export default function VisualCanvas() {
  const notify = useApp((state) => state.notify),
    look = useApp((state) => state.look);
  const record = useLiveQuery(
    async () => (await db.settings.get("visual-canvas")) ?? null,
    [],
  );
  const [objects, setObjects] = useState<CanvasObject[]>(INITIAL),
    [selected, setSelected] = useState<string | null>(null),
    [zoom, setZoom] = useState(1),
    [loaded, setLoaded] = useState(false),
    [viewReady, setViewReady] = useState(false),
    [editing, setEditing] = useState<string | null>(null),
    [color, setColor] = useState<string | null>(null),
    [target, setTarget] = useState<Target>("lipstick"),
    [variant, setVariant] = useState(0),
    [panning, setPanning] = useState(false),
    [size, setSize] = useState({ width: 800, height: 540 });
  const viewport = useRef<HTMLDivElement>(null),
    files = useRef<HTMLInputElement>(null),
    sessionImages = useRef(new Map<string, string>()),
    objectElements = useRef(new Map<string, HTMLDivElement>()),
    current = useRef(objects),
    restore = useRef<{ x: number; y: number } | null>(null),
    savedView = useRef<BoardView | null>(null),
    firstView = useRef(false),
    hadBoard = useRef(false);
  const drag = useRef<{
      id: string;
      pointer: number;
      x: number;
      y: number;
      origin: CanvasObject[];
      moved: boolean;
    } | null>(null),
    pan = useRef<{
      pointer: number;
      x: number;
      y: number;
      left: number;
      top: number;
      moved: boolean;
    } | null>(null);
  current.current = objects;
  const selectedObject = objects.find((object) => object.id === selected),
    selectedProduct = productOf(selectedObject),
    chosenVariant =
      selectedProduct?.variants[variant] ?? selectedProduct?.variants[0];
  const origin = {
    x: Math.max(0, (size.width - WORLD.width * zoom) / 2),
    y: Math.max(0, (size.height - WORLD.height * zoom) / 2),
  };
  const latestView = useRef<BoardView>({
    zoom,
    left: 0,
    top: 0,
    selected,
    color,
    target,
    variant,
  });
  latestView.current = {
    zoom,
    left: viewport.current?.scrollLeft ?? 0,
    top: viewport.current?.scrollTop ?? 0,
    selected,
    color,
    target,
    variant,
  };

  useEffect(() => {
    if (record === undefined || drag.current) return;
    const data = record ? validObjects(record.value) : INITIAL;
    if (data) {
      current.current = data;
      setObjects(data);
    }
    if (record === null && hadBoard.current) {
      sessionImages.current.forEach((url) => URL.revokeObjectURL(url));
      sessionImages.current.clear();
      setSelected(null);
      setColor(null);
      setEditing(null);
    }
    hadBoard.current = record !== null;
    setLoaded(true);
  }, [record]);
  useEffect(() => {
    let alive = true;
    void db.settings
      .get("visual-canvas-view")
      .then((row) => {
        if (!alive) return;
        const value = row?.value as Partial<BoardView> | undefined;
        if (
          value &&
          typeof value.zoom === "number" &&
          Number.isFinite(value.zoom)
        ) {
          savedView.current = {
            zoom: clamp(value.zoom, 0.25, 1.8),
            left: Math.max(0, Number(value.left) || 0),
            top: Math.max(0, Number(value.top) || 0),
            selected:
              typeof value.selected === "string" ? value.selected : null,
            color:
              typeof value.color === "string" &&
              /^#[a-f\d]{6}$/i.test(value.color)
                ? value.color
                : null,
            target: TARGETS.some((item) => item.id === value.target)
              ? (value.target as Target)
              : "lipstick",
            variant: Math.max(0, Number(value.variant) || 0),
          };
        }
        setViewReady(true);
      })
      .catch(() => {
        if (alive) setViewReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const storeView = (override: Partial<BoardView> = {}) => {
    if (!firstView.current) return;
    const value = {
      ...latestView.current,
      left: viewport.current?.scrollLeft ?? latestView.current.left,
      top: viewport.current?.scrollTop ?? latestView.current.top,
      ...override,
    };
    latestView.current = value;
    // Save explicit interactions immediately; no deferred write may revive data after clearing it.
    void db.settings
      .put({
        id: "visual-canvas-view",
        value: value as unknown as JsonValue,
        updatedAt: Date.now(),
      })
      .catch(() => {});
  };
  useEffect(
    () => () => {
      sessionImages.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useLayoutEffect(() => {
    if (!restore.current || !viewport.current) return;
    viewport.current.scrollLeft = restore.current.x;
    viewport.current.scrollTop = restore.current.y;
    restore.current = null;
  }, [zoom, size]);
  const viewAt = (next: number, center: { x: number; y: number }) => {
    const z = clamp(next, 0.25, 1.8),
      nextOrigin = {
        x: Math.max(0, (size.width - WORLD.width * z) / 2),
        y: Math.max(0, (size.height - WORLD.height * z) / 2),
      };
    const destination = {
      x: Math.max(0, center.x * z + nextOrigin.x - size.width / 2),
      y: Math.max(0, center.y * z + nextOrigin.y - size.height / 2),
    };
    restore.current = destination;
    if (z === zoom && viewport.current) {
      viewport.current.scrollLeft = restore.current.x;
      viewport.current.scrollTop = restore.current.y;
      restore.current = null;
    }
    setZoom(z);
    storeView({ zoom: z, left: destination.x, top: destination.y });
  };
  const fit = (items = current.current) => {
    const x1 = Math.min(...items.map((object) => object.x), 110),
      y1 = Math.min(...items.map((object) => object.y), 70),
      x2 = Math.max(...items.map((object) => object.x + object.width), 800),
      y2 = Math.max(...items.map((object) => object.y + object.height), 430);
    viewAt(
      Math.min(
        (size.width - 44) / (x2 - x1 + 60),
        (size.height - 44) / (y2 - y1 + 60),
        1,
      ),
      { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
    );
  };
  useEffect(() => {
    if (!loaded || !viewReady || !size.width || firstView.current) return;
    firstView.current = true;
    const value = savedView.current;
    if (value) {
      restore.current = { x: value.left, y: value.top };
      setZoom(value.zoom);
      setSelected(value.selected);
      setColor(value.color);
      setTarget(value.target);
      setVariant(value.variant);
      requestAnimationFrame(() => {
        if (restore.current && viewport.current) {
          viewport.current.scrollLeft = restore.current.x;
          viewport.current.scrollTop = restore.current.y;
          restore.current = null;
        }
      });
    } else fit();
  }, [loaded, viewReady, size.width]);

  const persist = async (next: CanvasObject[]) => {
    current.current = next;
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
  const select = (id: string) => {
    if (selected !== id) {
      setColor(null);
      setVariant(0);
      storeView({ selected: id, color: null, variant: 0 });
    } else storeView({ selected: id });
    setSelected(id);
  };
  const focusObject = (object: CanvasObject) => {
    select(object.id);
    viewAt(
      Math.min(
        1,
        (size.width - 90) / object.width,
        (size.height - 90) / object.height,
      ),
      { x: object.x + object.width / 2, y: object.y + object.height / 2 },
    );
    objectElements.current.get(object.id)?.focus({ preventScroll: true });
  };
  const start = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    if (
      event.button !== 0 ||
      editing ||
      (event.target as HTMLElement).closest("button,input,textarea,a")
    )
      return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: current.current,
      moved: false,
    };
    select(id);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    const dx = (event.clientX - d.x) / zoom,
      dy = (event.clientY - d.y) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    const next = moveCanvasObject(d.origin, d.id, dx, dy).map((object) =>
      object.id === d.id
        ? {
            ...object,
            x: clamp(object.x, 0, WORLD.width - object.width),
            y: clamp(object.y, 0, WORLD.height - object.height),
          }
        : object,
    );
    current.current = next;
    setObjects(next);
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointer !== event.pointerId) return;
    const moved = drag.current.moved;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (moved) void persist(current.current);
  };
  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(
        ".canvas-object,button,input,textarea,a",
      )
    )
      return;
    const node = event.currentTarget;
    node.focus({ preventScroll: true });
    node.setPointerCapture(event.pointerId);
    pan.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: node.scrollLeft,
      top: node.scrollTop,
      moved: false,
    };
    setPanning(true);
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = pan.current;
    if (!d || d.pointer !== event.pointerId) return;
    const dx = event.clientX - d.x,
      dy = event.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    event.currentTarget.scrollLeft = d.left - dx;
    event.currentTarget.scrollTop = d.top - dy;
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pan.current || pan.current.pointer !== event.pointerId) return;
    const deselect = !pan.current.moved;
    if (deselect) setSelected(null);
    pan.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    storeView(deselect ? { selected: null } : {});
  };
  const zoomBy = (delta: number) => {
    const node = viewport.current;
    if (!node) return;
    viewAt(zoom + delta, {
      x: (node.scrollLeft + size.width / 2 - origin.x) / zoom,
      y: (node.scrollTop + size.height / 2 - origin.y) / zoom,
    });
  };
  const boardKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-70, 0],
      ArrowRight: [70, 0],
      ArrowUp: [0, -70],
      ArrowDown: [0, 70],
    };
    if (offsets[event.key]) {
      event.preventDefault();
      event.currentTarget.scrollBy(...offsets[event.key]);
      storeView();
    } else if (["+", "=", "-"].includes(event.key)) {
      event.preventDefault();
      zoomBy(event.key === "-" ? -0.1 : 0.1);
    } else if (event.key === "Home") {
      event.preventDefault();
      fit();
    } else if (event.key === "0") {
      event.preventDefault();
      viewAt(1, { x: WORLD.width / 2, y: WORLD.height / 2 });
    } else if (event.key === "Escape") setSelected(null);
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
                objects.filter((item) => item.kind === "product").length %
                  SAMPLE_PRODUCTS.length
              ].id,
    };
    select(object.id);
    void persist([...objects, object]);
  };
  const remove = () => {
    if (!selected) return;
    const url = sessionImages.current.get(selected);
    if (url) {
      URL.revokeObjectURL(url);
      sessionImages.current.delete(selected);
    }
    void persist(objects.filter((object) => object.id !== selected));
    setSelected(null);
    viewport.current?.focus({ preventScroll: true });
  };
  const applyColor = (value: string, objectId: string, where = target) => {
    select(objectId);
    setColor(value);
    setTarget(where);
    const app = useApp.getState();
    app.patchLayer(where, { color: value, enabled: true });
    app.setFocusLayer(where);
    storeView({ selected: objectId, color: value, target: where });
    // The selected-colour status inside the lens is the feedback; a global toast would cover the mobile action.
  };
  const exploreProduct = (
    product: Product,
    objectId = selected,
    choice = variant,
  ) => {
    const shade = product.variants[choice] ?? product.variants[0];
    useApp.getState().setDiscoveryContext({
      productId: product.id,
      category: product.category,
      color: shade?.hex ?? color ?? look.lipstick.color,
    });
    void db.settings.put({
      id: "visual-canvas-view",
      value: {
        ...latestView.current,
        selected: objectId,
      } as unknown as JsonValue,
      updatedAt: Date.now(),
    });
    useApp.getState().setSpace("discover");
  };
  const toMirror = () => {
    void db.settings.put({
      id: "visual-canvas-view",
      value: latestView.current as unknown as JsonValue,
      updatedAt: Date.now(),
    });
    useApp.getState().setFocusLayer(target);
    useApp.getState().setStudioMode("makeup");
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
      ),
      a = document.createElement("a");
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
          <span>
            A thought, a colour, a finishing detail. Keep them in conversation.
          </span>
        </div>
        <button className="button secondary" onClick={exportBoard}>
          <ArrowDownToLine size={16} />
          Export board
        </button>
      </header>
      <div
        className="canvas-toolbar"
        role="group"
        aria-label="Style board tools"
      >
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
          <button aria-label="Zoom out canvas" onClick={() => zoomBy(-0.1)}>
            <Minus size={16} />
          </button>
          <output aria-label="Canvas zoom">{Math.round(zoom * 100)}%</output>
          <button aria-label="Zoom in canvas" onClick={() => zoomBy(0.1)}>
            <Plus size={16} />
          </button>
          <button onClick={() => fit()} aria-label="Fit all canvas objects">
            <Maximize2 size={16} />
            <span>Fit all</span>
          </button>
          <button
            onClick={() =>
              viewAt(1, { x: WORLD.width / 2, y: WORLD.height / 2 })
            }
            aria-label="Reset canvas view"
          >
            <RotateCcw size={16} />
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
          select(id);
          notify(
            "Reference added to this tab. The photo itself has not been saved.",
          );
          event.target.value = "";
        }}
      />
      <div className="canvas-workspace">
        <div className="canvas-board-column">
          <div
            ref={viewport}
            className={`canvas-viewport ${panning ? "is-panning" : ""}`}
            role="region"
            tabIndex={0}
            aria-label="Inspiration board. Drag empty space to pan. Arrow keys pan; plus and minus zoom; Home fits all."
            aria-busy={!loaded}
            data-zoom={zoom.toFixed(3)}
            onScroll={() => {
              if (!pan.current) storeView();
            }}
            onPointerDown={beginPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onKeyDown={boardKeys}
          >
            <div
              className="canvas-surface"
              style={{
                width: Math.max(size.width, WORLD.width * zoom),
                height: Math.max(size.height, WORLD.height * zoom),
              }}
            >
              <div
                className="canvas-coordinate-space"
                style={{
                  left: origin.x,
                  top: origin.y,
                  transform: `scale(${zoom})`,
                }}
              >
                {objects.map((object) => {
                  const product = productOf(object),
                    photo =
                      object.kind === "photo"
                        ? object.value === "session-photo"
                          ? sessionImages.current.get(object.id)
                          : object.value
                        : undefined;
                  return (
                    <div
                      className={`canvas-object canvas-${object.kind} ${selected === object.id ? "selected" : ""}`}
                      key={object.id}
                      ref={(node) => {
                        if (node) objectElements.current.set(object.id, node);
                        else objectElements.current.delete(object.id);
                      }}
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
                      onFocus={() => select(object.id)}
                      onPointerDown={(event) => start(event, object.id)}
                      onPointerMove={move}
                      onPointerUp={end}
                      onPointerCancel={end}
                      onKeyDown={(event) => {
                        if (
                          (event.target as HTMLElement).closest(
                            "textarea,input,button",
                          )
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
                          event.stopPropagation();
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
                          ["Delete", "Backspace"].includes(event.key)
                        ) {
                          event.preventDefault();
                          event.stopPropagation();
                          select(object.id);
                          const url = sessionImages.current.get(object.id);
                          if (url) {
                            URL.revokeObjectURL(url);
                            sessionImages.current.delete(object.id);
                          }
                          void persist(
                            objects.filter((item) => item.id !== object.id),
                          );
                          setSelected(null);
                        } else if (event.key === "Escape") {
                          setSelected(null);
                          viewport.current?.focus();
                        }
                      }}
                    >
                      {object.kind === "note" ? (
                        editing === object.id ? (
                          <textarea
                            aria-label="Edit inspiration note"
                            autoFocus
                            value={object.value}
                            maxLength={1500}
                            onChange={(event) => {
                              const next = objects.map((item) =>
                                item.id === object.id
                                  ? { ...item, value: event.target.value }
                                  : item,
                              );
                              current.current = next;
                              setObjects(next);
                            }}
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
                        )
                      ) : object.kind === "palette" ? (
                        <>
                          <div
                            className="canvas-swatches"
                            role="group"
                            aria-label="Palette colours"
                          >
                            {colorsOf(object).map((shade, index) => (
                              <button
                                key={`${shade}-${index}`}
                                style={{ background: shade }}
                                aria-label={`Apply ${shade.toUpperCase()} to ${TARGETS.find((item) => item.id === target)?.label}`}
                                aria-pressed={
                                  selected === object.id &&
                                  color?.toLowerCase() === shade.toLowerCase()
                                }
                                onClick={() => applyColor(shade, object.id)}
                              >
                                {selected === object.id &&
                                  color?.toLowerCase() ===
                                    shade.toLowerCase() && <Check size={15} />}
                              </button>
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
                            onClick={() => {
                              select(object.id);
                              exploreProduct(product, object.id, 0);
                            }}
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
          <div className="canvas-board-navigation">
            <span>
              <Hand size={13} />
              Drag the open space to explore
            </span>
            <button onClick={() => fit()}>
              <Maximize2 size={14} />
              See the whole story
            </button>
          </div>
          <div
            className="canvas-object-index"
            role="group"
            aria-label="Objects on your board"
          >
            {objects.map((object) => (
              <button
                key={object.id}
                aria-pressed={selected === object.id}
                onClick={() => focusObject(object)}
              >
                {object.kind === "palette" ? (
                  <Palette size={14} />
                ) : object.kind === "product" ? (
                  <ShoppingBag size={14} />
                ) : object.kind === "note" ? (
                  <StickyNote size={14} />
                ) : (
                  <ImagePlus size={14} />
                )}
                <span>{labelOf(object)}</span>
              </button>
            ))}
          </div>
        </div>
        <aside
          className={`canvas-inspector ${selectedObject && !editing ? "is-open" : ""}`}
          aria-label="Selected object inspector"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setSelected(null);
              viewport.current?.focus({ preventScroll: true });
            }
          }}
        >
          {selectedObject ? (
            <>
              <div className="canvas-inspector-heading">
                <span>
                  {selectedObject.kind === "palette"
                    ? "A colour to follow"
                    : selectedObject.kind === "product"
                      ? "A finishing detail"
                      : selectedObject.kind === "note"
                        ? "Your own words"
                        : "A reference, held close"}
                </span>
                <button
                  onClick={() => {
                    setSelected(null);
                    viewport.current?.focus({ preventScroll: true });
                  }}
                  aria-label="Close object inspector"
                >
                  <X size={17} />
                </button>
              </div>
              <h2>
                {selectedProduct?.name ??
                  (selectedObject.kind === "palette"
                    ? "Where will it take you?"
                    : selectedObject.kind === "note"
                      ? "Keep the thought."
                      : "Look a little closer.")}
              </h2>
              {selectedObject.kind === "palette" ? (
                <>
                  <p>
                    Touch a shade to try it. Your mirror keeps the same
                    portrait.
                  </p>
                  <div
                    className="canvas-inspector-swatches"
                    role="group"
                    aria-label="Selected palette colours"
                  >
                    {colorsOf(selectedObject).map((shade, index) => (
                      <button
                        key={`${shade}-${index}`}
                        style={{ background: shade }}
                        aria-label={`Try palette shade ${shade.toUpperCase()}`}
                        aria-pressed={
                          color?.toLowerCase() === shade.toLowerCase()
                        }
                        onClick={() => applyColor(shade, selectedObject.id)}
                      >
                        {color?.toLowerCase() === shade.toLowerCase() && (
                          <Check size={15} />
                        )}
                      </button>
                    ))}
                  </div>
                  <div
                    className="canvas-wear-targets"
                    role="group"
                    aria-label="Where to wear this colour"
                  >
                    {TARGETS.map((item) => (
                      <button
                        key={item.id}
                        aria-pressed={target === item.id}
                        onClick={() => {
                          setTarget(item.id);
                          if (color)
                            applyColor(color, selectedObject.id, item.id);
                        }}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                  {color && (
                    <div className="canvas-colour-result" role="status">
                      <i style={{ background: color }} />
                      <span>
                        <strong>{color.toUpperCase()}</strong>
                        {look[target].enabled &&
                        look[target].color.toLowerCase() === color.toLowerCase()
                          ? `On your ${TARGETS.find((item) => item.id === target)?.label}`
                          : "Ready for your mirror"}
                      </span>
                    </div>
                  )}
                  <button
                    className="button primary canvas-lens-primary"
                    onClick={toMirror}
                  >
                    See it in my mirror
                    <ArrowUpRight size={15} />
                  </button>
                  <small>
                    This is a cosmetic colour preview, not a physical shade
                    match.
                  </small>
                </>
              ) : selectedProduct ? (
                <>
                  <span className="canvas-product-brand">
                    {selectedProduct.brand}
                  </span>
                  <p>{selectedProduct.description}</p>
                  {selectedProduct.variants.some((item) => item.hex) && (
                    <div
                      className="canvas-product-variants"
                      role="group"
                      aria-label="Product shade reference"
                    >
                      {selectedProduct.variants.map((item, index) =>
                        item.hex ? (
                          <button
                            key={item.id}
                            style={{ background: item.hex }}
                            aria-label={`Choose product shade ${item.name}`}
                            aria-pressed={variant === index}
                            onClick={() => {
                              setVariant(index);
                              storeView({ variant: index });
                            }}
                          >
                            {variant === index && <Check size={14} />}
                          </button>
                        ) : null,
                      )}
                    </div>
                  )}
                  {chosenVariant?.hex && (
                    <span className="canvas-variant-name">
                      {chosenVariant.name} · {chosenVariant.hex.toUpperCase()}
                    </span>
                  )}
                  <button
                    className="button primary canvas-lens-primary"
                    onClick={() => exploreProduct(selectedProduct)}
                  >
                    Explore this product
                    <ArrowUpRight size={15} />
                  </button>
                  {chosenVariant?.hex && (
                    <button
                      className="canvas-lens-secondary"
                      onClick={() => {
                        const where = [
                          "foundation",
                          "blush",
                          "eyeshadow",
                        ].includes(selectedProduct.category)
                          ? selectedProduct.category
                          : "lipstick";
                        const app = useApp.getState();
                        app.patchLayer(where, {
                          color: chosenVariant.hex!,
                          enabled: true,
                        });
                        app.setFocusLayer(where);
                        app.setStudioMode("makeup");
                      }}
                    >
                      Try this shade in my mirror
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                  <small>
                    Sample product reference. The actual formula, price and
                    packaging may differ.
                  </small>
                </>
              ) : selectedObject.kind === "note" ? (
                <>
                  <blockquote>“{selectedObject.value}”</blockquote>
                  <button
                    className="button secondary canvas-lens-primary"
                    onClick={() => {
                      focusObject(selectedObject);
                      setEditing(selectedObject.id);
                    }}
                  >
                    <StickyNote size={15} />
                    Edit this note
                  </button>
                  <small>
                    Your words save locally. No look has been inferred from
                    them.
                  </small>
                </>
              ) : (
                <>
                  <p>
                    {selectedObject.value === "session-photo"
                      ? "Your uploaded reference stays in this canvas session. Its image data is excluded from saved board records and exports."
                      : "An editorial reference for your own interpretation. No image analysis or automatic look extraction has run."}
                  </p>
                  <button
                    className="button secondary canvas-lens-primary"
                    onClick={() => add("note")}
                  >
                    <StickyNote size={15} />
                    Add a thought
                  </button>
                  <small>Capture what you notice in your own words.</small>
                </>
              )}
              <div className="canvas-inspector-tools">
                <button onClick={() => focusObject(selectedObject)}>
                  <Focus size={15} />
                  Focus object
                </button>
                <button
                  onClick={remove}
                  aria-label="Remove selected canvas object"
                >
                  <Trash2 size={15} />
                  Remove
                </button>
              </div>
            </>
          ) : (
            <div className="canvas-inspector-empty">
              <span>A space for your eye.</span>
              <h2>
                Let one detail
                <br />
                lead to another.
              </h2>
              <p>
                Select a note, a product or a palette. Its possibilities will
                meet you here.
              </p>
              <div className="canvas-inspector-rule" />
              <p>
                Choose a colour to try it in your mirror. Explore a product
                without losing the shade that caught your eye.
              </p>
              <small>
                Pointer, touch and keyboard all have a place at this table.
              </small>
            </div>
          )}
        </aside>
      </div>
      <footer className="canvas-footnote">
        <span>
          Arrow keys move a selected object. Focus the board to pan. Home fits
          everything; 0 returns to actual size.
        </span>
        <button
          onClick={() => {
            sessionImages.current.forEach((url) => URL.revokeObjectURL(url));
            sessionImages.current.clear();
            setSelected(null);
            void persist(INITIAL);
            fit(INITIAL);
            notify("Sample board restored.");
          }}
        >
          <RotateCcw size={13} />
          Restore sample board
        </button>
      </footer>
      <p className="canvas-privacy">
        Notes, colours and layout save locally. Uploaded reference images stay
        in this canvas session and are excluded from exports. No automatic look
        extraction or remote image processing has run.
      </p>
    </section>
  );
}
