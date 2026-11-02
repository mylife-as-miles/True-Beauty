import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownToLine,
  Bookmark,
  ImagePlus,
  RotateCcw,
  Shirt,
  Trash2,
} from "lucide-react";
import {
  composeGarment,
  DEFAULT_PLACEMENT,
  sampleGarmentImage,
  coordinateOutfit,
  SEASON_IDS,
  SEASON_PALETTES,
  recolorGarment,
  type GarmentPlacement,
  type Season,
} from "../../../../packages/fashion-engine/src";
import {
  db,
  saveMedia,
  setConsent,
} from "../../../../packages/local-database/src";
import { useApp } from "../state/store";
import "./DressingRoom.css";
const COLORS = [
  "#98645e",
  "#d2bc9c",
  "#293b43",
  "#7d843e",
  "#7e4c6d",
  "#232323",
];
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        new Error("This image could not be opened. Try JPEG, PNG or WebP."),
      );
    image.src = src;
  });
export default function DressingRoom() {
  const notify = useApp((s) => s.notify),
    [personSrc, setPersonSrc] = useState("/images/portrait-2.jpg"),
    [garmentSrc, setGarmentSrc] = useState(""),
    [color, setColor] = useState(COLORS[0]),
    [placement, setPlacement] = useState<GarmentPlacement>({
      ...DEFAULT_PLACEMENT,
    }),
    [season, setSeason] = useState<Season>("soft-autumn"),
    [name, setName] = useState("My colour story"),
    [storeImages, setStoreImages] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null),
    personInput = useRef<HTMLInputElement>(null),
    garmentInput = useRef<HTMLInputElement>(null),
    personFile = useRef<File | null>(null),
    garmentFile = useRef<File | null>(null),
    urls = useRef<string[]>([]),
    [tintUpload, setTintUpload] = useState(false);
  const outfits = useLiveQuery(
    () => db.outfits.orderBy("createdAt").reverse().limit(12).toArray(),
    [],
  );
  const lipColor = useApp((s) => s.look.lipstick.color);
  const harmony = coordinateOutfit([color, lipColor], season);
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  useEffect(() => {
    let cancelled = false;
    setError("");
    setStatus("Preparing your composition…");
    const render = async () => {
      try {
        const [person, garment] = await Promise.all([
          loadImage(personSrc),
          loadImage(garmentSrc || sampleGarmentImage(color)),
        ]);
        if (cancelled || !canvas.current) return;
        const ctx = canvas.current.getContext("2d");
        if (!ctx) throw new Error("Canvas is not available in this browser.");
        const ratio = person.naturalHeight / person.naturalWidth;
        canvas.current.width = 720;
        canvas.current.height = Math.min(1200, Math.round(720 * ratio));
        const painted =
          garmentSrc && tintUpload ? recolorGarment(garment, color) : garment;
        composeGarment(ctx, person, painted, placement);
        setStatus("Local static-photo composition · manual placement");
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Unable to compose images.",
          );
          setStatus("");
        }
      }
    };
    void render();
    return () => {
      cancelled = true;
    };
  }, [personSrc, garmentSrc, color, placement, tintUpload]);
  const upload =
    (kind: "person" | "garment") => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 12 * 1024 * 1024
      ) {
        notify("Choose a JPEG, PNG or WebP smaller than 12 MB.");
        event.target.value = "";
        return;
      }
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      if (kind === "person") {
        personFile.current = file;
        setPersonSrc(url);
      } else {
        garmentFile.current = file;
        setGarmentSrc(url);
      }
      event.target.value = "";
    };
  const update = (key: keyof GarmentPlacement, value: number) =>
    setPlacement((p) => ({ ...p, [key]: value }));
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (storeImages) await setConsent("media.photos", true);
      await db.transaction(
        "rw",
        [db.outfits, db.mediaAssets, db.consents],
        async () => {
          let personMediaAssetId: string | undefined,
            garmentMediaAssetId: string | undefined;
          if (storeImages) {
            if (personFile.current)
              personMediaAssetId = await saveMedia(
                personFile.current,
                personFile.current.name,
              );
            if (garmentFile.current)
              garmentMediaAssetId = await saveMedia(
                garmentFile.current,
                garmentFile.current.name,
              );
          }
          const now = Date.now();
          await db.outfits.add({
            id: crypto.randomUUID(),
            name: name.trim(),
            createdAt: now,
            updatedAt: now,
            color,
            season,
            placement,
            technology: "static-photo-compositing",
            garmentName: garmentFile.current?.name ?? "Original sample blouse",
            personMediaAssetId,
            garmentMediaAssetId,
            usesSamplePerson: !personFile.current,
            sampleGarment: !garmentFile.current,
          });
        },
      );
      notify(
        storeImages
          ? "Outfit and permitted uploads saved on this device."
          : "Outfit colours and placement saved. Uploaded images have not been stored.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to save the outfit.");
    } finally {
      setBusy(false);
    }
  };
  const restore = async (id: string) => {
    const outfit = await db.outfits.get(id);
    if (!outfit) return;
    if (typeof outfit.color === "string") setColor(outfit.color);
    if (SEASON_IDS.includes(outfit.season as Season))
      setSeason(outfit.season as Season);
    if (outfit.placement && typeof outfit.placement === "object")
      setPlacement(outfit.placement as GarmentPlacement);
    setName(String(outfit.name ?? "Outfit study"));
    let missing = false;
    for (const kind of ["person", "garment"] as const) {
      const key =
        kind === "person" ? "personMediaAssetId" : "garmentMediaAssetId";
      const asset =
        typeof outfit[key] === "string"
          ? await db.mediaAssets.get(outfit[key] as string)
          : undefined;
      if (asset) {
        const url = URL.createObjectURL(asset.blob);
        urls.current.push(url);
        if (kind === "person") {
          setPersonSrc(url);
          personFile.current = new File([asset.blob], asset.name, {
            type: asset.mimeType,
          });
        } else {
          setGarmentSrc(url);
          garmentFile.current = new File([asset.blob], asset.name, {
            type: asset.mimeType,
          });
        }
      } else if (kind === "person") {
        setPersonSrc("/images/portrait-2.jpg");
        personFile.current = null;
        if (!outfit.usesSamplePerson) missing = true;
      } else {
        setGarmentSrc("");
        garmentFile.current = null;
        if (!outfit.sampleGarment) missing = true;
      }
    }
    notify(
      missing
        ? "Colours and placement restored. Upload the original images to complete this study."
        : "Outfit study restored.",
    );
  };
  const remove = async (id: string) => {
    await db.transaction("rw", [db.outfits, db.mediaAssets], async () => {
      const outfit = await db.outfits.get(id);
      if (!outfit) return;
      for (const key of ["personMediaAssetId", "garmentMediaAssetId"])
        if (typeof outfit[key] === "string")
          await db.mediaAssets.delete(outfit[key] as string);
      await db.outfits.delete(id);
    });
  };
  const download = () => {
    if (!canvas.current || error) return;
    const a = document.createElement("a");
    a.download = "true-beauty-composition.png";
    a.href = canvas.current.toDataURL("image/png");
    a.click();
    notify(
      "Composition exported. This is a static overlay, not a fit prediction.",
    );
  };
  return (
    <section className="dressing-room">
      <header className="dressing-title">
        <div>
          <p className="dressing-kicker">Your dressing room</p>
          <h1>
            Wear the <em>feeling.</em>
          </h1>
          <p>A colour story, a finishing detail, a look that belongs to you.</p>
        </div>
        <span className="dressing-mode">Static photo composition</span>
      </header>
      <div className="dressing-layout">
        <div className="dressing-stage">
          <div className="dressing-stage-toolbar">
            <span>
              <Shirt size={15} />
              Your composition
            </span>
            <button
              onClick={download}
              disabled={!!error || !status}
              aria-label="Export composition"
            >
              <ArrowDownToLine size={17} />
            </button>
          </div>
          <canvas
            ref={canvas}
            aria-label="Your manually placed garment composition"
          />
          <div className="dressing-stage-foot">
            <span role="status">{error || status}</span>
            <button
              onClick={() => {
                setPlacement({ ...DEFAULT_PLACEMENT });
                setColor(COLORS[0]);
                setGarmentSrc("");
                setTintUpload(false);
                garmentFile.current = null;
              }}
              aria-label="Reset garment placement"
            >
              <RotateCcw size={17} />
            </button>
          </div>
          <p className="dressing-limit">
            A playful composition, not a sizing or draping prediction. Uploaded
            garments work best on a transparent or plain white background. Demo
            portrait and sample blouse are illustrative.
          </p>
        </div>
        <aside className="dressing-controls">
          <h2>Compose your look</h2>
          <div className="dressing-upload-row">
            <button onClick={() => personInput.current?.click()}>
              <ImagePlus size={18} />
              <span>Your portrait</span>
            </button>
            <button onClick={() => garmentInput.current?.click()}>
              <Shirt size={18} />
              <span>Your garment</span>
            </button>
          </div>
          <input
            ref={personInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="dressing-hidden"
            aria-label="Upload dressing room portrait"
            onChange={upload("person")}
          />
          <input
            ref={garmentInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="dressing-hidden"
            aria-label="Upload garment"
            onChange={upload("garment")}
          />
          <p className="dressing-hint">
            JPEG, PNG or WebP · up to 12 MB. Uploads stay in this tab unless you
            choose to save them.
          </p>
          <div className="dressing-colour-heading">
            <h3>A colour to start with</h3>
            <input
              type="color"
              value={color}
              aria-label="Garment colour"
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <div className="dressing-swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                style={{ background: c }}
                aria-label={`Choose garment colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          {garmentSrc && (
            <label className="dressing-check">
              <input
                type="checkbox"
                checked={tintUpload}
                onChange={(e) => setTintUpload(e.target.checked)}
              />
              Recolour my garment <span>(white background excluded)</span>
            </label>
          )}
          <h3 className="dressing-placement-title">Make it sit just right</h3>
          {(
            [
              {
                key: "x",
                label: "Horizontal position",
                min: -0.5,
                max: 1,
                step: 0.01,
              },
              {
                key: "y",
                label: "Vertical position",
                min: -0.5,
                max: 1,
                step: 0.01,
              },
              { key: "width", label: "Width", min: 0.1, max: 1.5, step: 0.01 },
              {
                key: "height",
                label: "Height",
                min: 0.1,
                max: 1.5,
                step: 0.01,
              },
              {
                key: "rotation",
                label: "Rotation",
                min: -40,
                max: 40,
                step: 1,
              },
              {
                key: "opacity",
                label: "Opacity",
                min: 0.1,
                max: 1,
                step: 0.01,
              },
            ] as const
          ).map(({ key, label, min, max, step }) => (
            <label className="dressing-range" key={key}>
              <span>
                {label}
                <output>
                  {key === "rotation"
                    ? `${placement[key]}°`
                    : `${Math.round(placement[key] * 100)}%`}
                </output>
              </span>
              <input
                type="range"
                aria-label={label}
                min={min}
                max={max}
                step={step}
                value={Number(placement[key])}
                onChange={(e) => update(key, Number(e.target.value))}
              />
            </label>
          ))}
          <div className="dressing-season">
            <label htmlFor="style-season">Explore a seasonal palette</label>
            <select
              id="style-season"
              value={season}
              onChange={(e) => setSeason(e.target.value as Season)}
            >
              {SEASON_IDS.map((id) => (
                <option key={id} value={id}>
                  {SEASON_PALETTES[id].label}
                </option>
              ))}
            </select>
            <div className="dressing-palette-strip">
              {SEASON_PALETTES[season].palette.map((p) => (
                <span
                  key={p.hex}
                  style={{ background: p.hex }}
                  title={p.name}
                />
              ))}
            </div>
            <p>
              {harmony.ranking.find((r) => r.colourway.id === "0")?.reason} Your
              preference comes first.
            </p>
          </div>
          <label className="dressing-name">
            Name this outfit
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="dressing-check">
            <input
              type="checkbox"
              checked={storeImages}
              onChange={(e) => setStoreImages(e.target.checked)}
            />
            Also store my uploaded photos locally
          </label>
          <p className="dressing-hint">
            This grants photo storage consent on this device. You can revoke it
            in Privacy. Browser storage is not encrypted.
          </p>
          <button
            className="button primary full-width"
            onClick={() => void save()}
            disabled={busy || !name.trim()}
          >
            <Bookmark size={16} />
            {busy ? "Saving…" : "Save this outfit"}
          </button>
          <p className="dressing-provider">
            Generative virtual try-on is not configured. No images are uploaded
            and no paid requests are made here.
          </p>
        </aside>
      </div>
      <div className="dressing-saved">
        <h2>Your outfit studies</h2>
        {outfits?.length ? (
          <div className="dressing-outfit-list">
            {outfits.map((o) => (
              <article key={o.id}>
                <span
                  className="dressing-outfit-swatch"
                  style={{
                    background:
                      typeof o.color === "string" ? o.color : "#98645e",
                  }}
                />
                <div>
                  <button
                    className="dressing-restore"
                    onClick={() => void restore(o.id)}
                  >
                    {String(o.name ?? "Untitled outfit")}
                  </button>
                  <p>
                    {String(o.garmentName ?? "Garment study")} ·{" "}
                    {new Date(o.createdAt ?? 0).toLocaleDateString()}
                  </p>
                </div>
                <button
                  aria-label={`Delete outfit ${String(o.name)}`}
                  onClick={() => void remove(o.id)}
                >
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p>
            Your first outfit study will live here. Save colours and placement
            without storing a photo.
          </p>
        )}
      </div>
    </section>
  );
}
