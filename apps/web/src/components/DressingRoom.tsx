import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { z } from "zod";
import {
  ArrowDownToLine,
  Sparkles,
  Bookmark,
  ImagePlus,
  RotateCcw,
  Shirt,
  Trash2,
  ScanFace,
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
  hasConsent,
} from "../../../../packages/local-database/src";
import { BeautyRenderer } from "../../../../packages/ar-renderer/src";
import {
  createVision,
  type VisionEngine,
  type VisionSnapshot,
} from "../../../../packages/vision-core/src";
import { accessoryVisionRequirements } from "../../../../packages/makeup-engine/src";
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
const placementSchema = z.object({
  x: z.number().finite().min(-1).max(2),
  y: z.number().finite().min(-1).max(2),
  width: z.number().finite().positive().max(2),
  height: z.number().finite().positive().max(2),
  rotation: z.number().finite().min(-180).max(180),
  opacity: z.number().finite().min(0).max(1),
  flipX: z.boolean().optional(),
});
const sourceProvenanceSchema = z.strictObject({
  kind: z.literal("ai-generated"),
  provider: z.literal("perfect-corp"),
  feature: z.enum(["hair", "clothing"]),
  createdAt: z.iso.datetime({ offset: true }),
});
const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth * image.naturalHeight > 36000000)
        reject(new Error("Use a portrait under 36 megapixels."));
      else resolve(image);
    };
    image.onerror = () =>
      reject(
        new Error("This image could not be opened. Try JPEG, PNG or WebP."),
      );
    image.src = src;
  });
const emptyVision = (): VisionSnapshot => ({
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
type Feature = "face" | "hair" | "hands" | "body" | "pose";
interface SourceCache {
  snapshot: VisionSnapshot;
  completed: Set<Feature>;
  faceSource: "shared" | "local" | "none";
  localInferences: number;
  faceInferences: number;
}
function belowFacePlacement(
  snapshot: VisionSnapshot | undefined,
): GarmentPlacement {
  const chin = snapshot?.landmarks[152],
    left = snapshot?.landmarks[234],
    right = snapshot?.landmarks[454];
  if (!chin || !left || !right) return { ...DEFAULT_PLACEMENT };
  const y = Math.min(0.85, Math.max(0.3, chin.y + 0.02)),
    width = Math.min(1.25, Math.max(0.7, Math.abs(right.x - left.x) * 2.2));
  return {
    ...DEFAULT_PLACEMENT,
    x: Math.max(-0.25, Math.min(0.9, (left.x + right.x) / 2 - width / 2)),
    y,
    width,
    height: Math.min(0.7, Math.max(0.2, 1 - y + 0.04)),
  };
}
export default function DressingRoom() {
  const notify = useApp((s) => s.notify),
    personSrc = useApp((s) => s.portraitUrl),
    portraitProvenance = useApp((s) => s.portraitProvenance),
    sharedVision = useApp((s) => s.portraitVision),
    look = useApp((s) => s.look),
    lighting = useApp((s) => s.lighting),
    quality = useApp((s) => s.renderQuality),
    activeOutfitId = useApp((s) => s.activeOutfitId);
  const [garmentSrc, setGarmentSrc] = useState(""),
    [color, setColor] = useState(COLORS[0]),
    [placement, setPlacement] = useState<GarmentPlacement>(() =>
      belowFacePlacement(
        sharedVision?.url === personSrc ? sharedVision.snapshot : undefined,
      ),
    ),
    [season, setSeason] = useState<Season>("soft-autumn"),
    [name, setName] = useState("My colour story"),
    [storeImages, setStoreImages] = useState(false),
    [includeMirrorLook, setIncludeMirrorLook] = useState(true),
    [restoredOutfitId, setRestoredOutfitId] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [visionStatus, setVisionStatus] = useState(
      "Using your current session portrait.",
    ),
    [attempt, setAttempt] = useState(0),
    [tintUpload, setTintUpload] = useState(false),
    [person, setPerson] = useState<{
      url: string;
      image: HTMLImageElement;
    } | null>(null),
    [garment, setGarment] = useState<{
      url: string;
      image: HTMLImageElement;
    } | null>(null),
    [vision, setVision] = useState<{ url: string; entry: SourceCache } | null>(
      null,
    );
  const canvas = useRef<HTMLCanvasElement>(null),
    editPreview = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    revealComposition = useRef(true),
    personInput = useRef<HTMLInputElement>(null),
    garmentInput = useRef<HTMLInputElement>(null),
    personFile = useRef<File | null>(null),
    personFileUrl = useRef(""),
    garmentFile = useRef<File | null>(null),
    urls = useRef<string[]>([]),
    renderer = useRef<BeautyRenderer | null>(null),
    processed = useRef<HTMLCanvasElement | null>(null),
    engine = useRef<VisionEngine | null>(null),
    cache = useRef(new Map<string, SourceCache>()),
    queue = useRef<Promise<void>>(Promise.resolve()),
    lifecycle = useRef(0),
    restoreEpoch = useRef(0),
    appliedOutfit = useRef<string | null>(null),
    placementTouched = useRef(false);
  const outfits = useLiveQuery(
    () => db.outfits.orderBy("createdAt").reverse().limit(12).toArray(),
    [],
  );
  const harmony = coordinateOutfit([color, look.lipstick.color], season);
  const garmentUrl = garmentSrc || sampleGarmentImage(color);
  const requirements = useMemo(
    () => ({
      ...accessoryVisionRequirements(look.accessories),
      face: true,
      hair: look.hair.enabled,
    }),
    [look.hair.enabled, look.accessories],
  );
  const requiredKey = JSON.stringify({ ...requirements, face: true });
  useEffect(() => {
    lifecycle.current++;
    const scratch = document.createElement("canvas");
    processed.current = scratch;
    try {
      renderer.current = new BeautyRenderer(scratch, { maxSide: 1080 });
    } catch {
      setVisionStatus(
        "Local effects are unavailable. The original portrait will be used.",
      );
    }
    return () => {
      lifecycle.current++;
      restoreEpoch.current++;
      appliedOutfit.current = null;
      engine.current?.dispose();
      engine.current = null;
      renderer.current?.dispose();
      renderer.current = null;
      processed.current = null;
      cache.current.clear();
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setError("");
    setStatus("Preparing your portrait…");
    if (personFileUrl.current !== personSrc) {
      personFile.current = null;
      personFileUrl.current = "";
    }
    void loadImage(personSrc)
      .then((image) => {
        if (!cancelled) setPerson({ url: personSrc, image });
      })
      .catch((e) => {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : "Unable to open this portrait.",
          );
          setStatus("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [personSrc]);
  useEffect(() => {
    let cancelled = false;
    void loadImage(garmentUrl)
      .then((image) => {
        if (!cancelled) setGarment({ url: garmentUrl, image });
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Unable to open this garment.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [garmentUrl]);
  useEffect(() => {
    if (!includeMirrorLook || !person || person.url !== personSrc) {
      setVisionStatus(
        includeMirrorLook
          ? "Preparing local look alignment…"
          : "Original portrait · mirror effects excluded.",
      );
      return;
    }
    let cancelled = false;
    const generation = lifecycle.current;
    setVisionStatus("Aligning your current mirror look…");
    const task = async () => {
      if (cancelled || generation !== lifecycle.current) return;
      let entry = cache.current.get(personSrc);
      if (!entry) {
        entry = {
          snapshot: emptyVision(),
          completed: new Set(),
          faceSource: "none",
          localInferences: 0,
          faceInferences: 0,
        };
        cache.current.set(personSrc, entry);
        while (cache.current.size > 3) {
          const oldest = cache.current.keys().next().value;
          if (oldest && oldest !== personSrc) cache.current.delete(oldest);
          else break;
        }
      }
      if (sharedVision?.url === personSrc) {
        const snapshot = sharedVision.snapshot;
        entry.snapshot = { ...entry.snapshot, ...snapshot };
        for (const feature of [
          "face",
          "hair",
          "hands",
          "body",
          "pose",
        ] as Feature[])
          if (snapshot.status[feature]?.state === "ready")
            entry.completed.add(feature);
        if (snapshot.status.face.state === "ready") entry.faceSource = "shared";
      }
      const need = JSON.parse(requiredKey) as Record<Feature, boolean>;
      const missing = Object.fromEntries(
        (Object.keys(need) as Feature[]).map((feature) => [
          feature,
          need[feature] && !entry!.completed.has(feature),
        ]),
      ) as Record<Feature, boolean>;
      if (Object.values(missing).some(Boolean)) {
        try {
          engine.current ??= createVision({
            inferenceMaxSide: 640,
            hairMaxSide: 384,
            bodyMaxSide: 384,
          });
          const result = await engine.current.analyzeImage(
            person.image,
            missing,
          );
          if (cancelled || generation !== lifecycle.current) return;
          entry.localInferences++;
          if (missing.face) {
            entry.faceInferences++;
            entry.faceSource = "local";
            entry.snapshot.landmarks = result.landmarks;
            entry.snapshot.blendshapes = result.blendshapes;
            entry.snapshot.transform = result.transform;
          }
          if (missing.hair || missing.body)
            entry.snapshot.hairMask = result.hairMask;
          if (missing.hands) entry.snapshot.hands = result.hands;
          if (missing.body) entry.snapshot.bodyMask = result.bodyMask;
          if (missing.pose) entry.snapshot.pose = result.pose;
          for (const feature of Object.keys(missing) as Feature[])
            if (missing[feature]) {
              entry.completed.add(feature);
              if (result.status[feature])
                entry.snapshot.status[feature] = result.status[feature]!;
            }
          entry.snapshot.timestamp = result.timestamp;
          entry.snapshot.latencyMs = result.latencyMs;
          entry.snapshot.inferenceCount = entry.localInferences;
          if (useApp.getState().portraitUrl === personSrc)
            useApp.getState().setPortraitVision(personSrc, entry.snapshot);
        } catch (e) {
          if (!cancelled && generation === lifecycle.current) {
            setVisionStatus(
              e instanceof Error
                ? `Some mirror effects could not load: ${e.message}`
                : "Some mirror effects could not load. Original portrait retained.",
            );
            setVision({ url: personSrc, entry: { ...entry } });
          }
          return;
        }
      }
      if (!cancelled && generation === lifecycle.current) {
        setVision({ url: personSrc, entry: { ...entry } });
        if (!placementTouched.current && !useApp.getState().activeOutfitId)
          setPlacement(belowFacePlacement(entry.snapshot));
        setVisionStatus(
          entry.snapshot.landmarks.length
            ? `Current mirror look included · ${entry.faceSource === "shared" ? "shared face geometry" : "local face geometry"}.`
            : "No clear face found. The original portrait and garment remain available.",
        );
      }
    };
    queue.current = queue.current.catch(() => {}).then(task);
    return () => {
      cancelled = true;
    };
  }, [
    person,
    personSrc,
    sharedVision,
    includeMirrorLook,
    requiredKey,
    attempt,
  ]);
  useEffect(() => {
    if (
      !person ||
      person.url !== personSrc ||
      !garment ||
      garment.url !== garmentUrl ||
      !canvas.current
    )
      return;
    const frame = requestAnimationFrame(() => {
      try {
        const output = canvas.current!,
          ctx = output.getContext("2d");
        if (!ctx) throw new Error("Canvas is unavailable.");
        output.width = 720;
        output.height = Math.min(
          1200,
          Math.round(
            (720 * person.image.naturalHeight) / person.image.naturalWidth,
          ),
        );
        let personLayer: CanvasImageSource = person.image;
        const entry = vision?.url === personSrc ? vision.entry : undefined;
        if (includeMirrorLook && renderer.current && processed.current) {
          try {
            renderer.current.setQuality(quality);
            renderer.current.render({
              source: person.image,
              look,
              lighting,
              landmarks: entry?.snapshot.landmarks ?? [],
              hairMask: entry?.snapshot.hairMask,
              hands: entry?.snapshot.hands,
              bodyMask: entry?.snapshot.bodyMask,
              pose: entry?.snapshot.pose,
              time: 0,
            });
            personLayer = processed.current;
          } catch {
            setVisionStatus(
              "The current look could not render. Original portrait shown.",
            );
          }
        }
        const painted =
          garmentSrc && tintUpload
            ? recolorGarment(garment.image, color)
            : garment.image;
        composeGarment(ctx, personLayer, painted, placement);
        // This is a reduced copy of the composition, not another renderer or
        // vision pipeline. Placement edits share the very same scene pixels.
        const preview = editPreview.current;
        if (preview) {
          preview.width = 180;
          preview.height = Math.round((180 * output.height) / output.width);
          preview
            .getContext("2d")
            ?.drawImage(output, 0, 0, preview.width, preview.height);
        }
        output.dataset.portraitSource = personSrc;
        output.dataset.activeOutfit = restoredOutfitId ?? "";
        output.dataset.faceSource = entry?.faceSource ?? "none";
        output.dataset.localInferences = String(entry?.localInferences ?? 0);
        output.dataset.faceInferences = String(entry?.faceInferences ?? 0);
        output.dataset.mirrorLook = String(includeMirrorLook);
        if (
          revealComposition.current &&
          (!activeOutfitId || restoredOutfitId === activeOutfitId)
        ) {
          revealComposition.current = false;
          stage.current?.scrollIntoView({ block: "start", behavior: "auto" });
        }
        setStatus("Local static-photo composition · manual placement");
        setError("");
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Unable to compose your look.",
        );
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [
    person,
    personSrc,
    garment,
    garmentUrl,
    garmentSrc,
    color,
    placement,
    tintUpload,
    vision,
    includeMirrorLook,
    look,
    lighting,
    quality,
    activeOutfitId,
    restoredOutfitId,
  ]);
  const markDirty = () => {
    setRestoredOutfitId(null);
    appliedOutfit.current = null;
    useApp.getState().setCompleteScene({ activeOutfitId: null });
  };
  const chooseColor = (value: string) => {
    markDirty();
    setColor(value);
  };
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
      if (kind === "person") {
        personFile.current = file;
        personFileUrl.current = url;
        useApp.getState().setPortraitUrl(url);
      } else {
        markDirty();
        urls.current.push(url);
        garmentFile.current = file;
        setGarmentSrc(url);
      }
      event.target.value = "";
    };
  const update = (key: keyof GarmentPlacement, value: number) => {
    placementTouched.current = true;
    markDirty();
    setPlacement((p) => ({ ...p, [key]: value }));
  };
  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const sourceProvenance = portraitProvenance
        ? sourceProvenanceSchema.parse(portraitProvenance)
        : undefined;
      if (storeImages) await setConsent("media.photos", true);
      let sourceFile = personFile.current;
      if (storeImages && !sourceFile && personSrc.startsWith("blob:")) {
        const blob = await fetch(personSrc).then((response) => response.blob());
        sourceFile = new File(
          [blob],
          "session-portrait." + (blob.type === "image/png" ? "png" : "jpg"),
          { type: blob.type },
        );
      }
      const id = crypto.randomUUID();
      await db.transaction(
        "rw",
        [db.outfits, db.mediaAssets, db.consents],
        async () => {
          let personMediaAssetId: string | undefined,
            garmentMediaAssetId: string | undefined;
          if (storeImages) {
            if (sourceFile)
              personMediaAssetId = await saveMedia(sourceFile, sourceFile.name);
            if (garmentFile.current)
              garmentMediaAssetId = await saveMedia(
                garmentFile.current,
                garmentFile.current.name,
              );
          }
          const now = Date.now();
          await db.outfits.add({
            id,
            name: name.trim(),
            createdAt: now,
            updatedAt: now,
            color,
            season,
            placement,
            includeMirrorLook,
            technology: "static-photo-compositing",
            garmentName: garmentFile.current?.name ?? "Original sample blouse",
            personMediaAssetId,
            garmentMediaAssetId,
            ...(personMediaAssetId && sourceProvenance
              ? { personProvenance: sourceProvenance }
              : {}),
            usesSamplePerson: !personSrc.startsWith("blob:"),
            sampleGarment: !garmentFile.current,
          });
        },
      );
      appliedOutfit.current = id;
      setRestoredOutfitId(id);
      useApp.getState().setCompleteScene({ activeOutfitId: id });
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
  const restore = useCallback(
    async (id: string) => {
      const epoch = ++restoreEpoch.current,
        startPortrait = useApp.getState().portraitUrl;
      appliedOutfit.current = id;
      useApp.getState().setCompleteScene({ activeOutfitId: id });
      const valid = () =>
        restoreEpoch.current === epoch &&
        useApp.getState().activeOutfitId === id &&
        useApp.getState().portraitUrl === startPortrait;
      const outfit = await db.outfits.get(id);
      if (!valid()) return;
      if (!outfit) {
        appliedOutfit.current = null;
        useApp.getState().setCompleteScene({ activeOutfitId: null });
        notify(
          "That saved outfit is unavailable. Your current portrait has been kept.",
        );
        return;
      }
      const checked = placementSchema.safeParse(outfit.placement);
      if (!checked.success) {
        appliedOutfit.current = null;
        useApp.getState().setCompleteScene({ activeOutfitId: null });
        notify(
          "This outfit has invalid placement data. Your current scene has been kept.",
        );
        return;
      }
      const provenance =
        outfit.personProvenance === undefined
          ? undefined
          : sourceProvenanceSchema.safeParse(outfit.personProvenance);
      if (provenance && !provenance.success) {
        appliedOutfit.current = null;
        useApp.getState().setCompleteScene({ activeOutfitId: null });
        notify(
          "This outfit has invalid source provenance. Its saved photo was not reopened.",
        );
        return;
      }
      let missing = false;
      let savedPerson: File | undefined;
      let savedGarment: File | undefined;
      const photosPermitted = await hasConsent("media.photos");
      if (!valid()) return;
      for (const kind of ["person", "garment"] as const) {
        const key =
          kind === "person" ? "personMediaAssetId" : "garmentMediaAssetId";
        const asset =
          photosPermitted && typeof outfit[key] === "string"
            ? await db.mediaAssets.get(outfit[key] as string)
            : undefined;
        if (!valid()) return;
        if (asset) {
          const file = new File([asset.blob], asset.name, {
            type: asset.mimeType,
          });
          if (kind === "person") savedPerson = file;
          else savedGarment = file;
        } else if (kind === "person" && !outfit.usesSamplePerson)
          missing = true;
        else if (kind === "garment" && !outfit.sampleGarment) missing = true;
      }
      if (!valid()) return;
      placementTouched.current = true;
      revealComposition.current = true;
      setRestoredOutfitId(id);
      setPlacement(checked.data);
      if (
        typeof outfit.color === "string" &&
        /^#[a-f0-9]{6}$/i.test(outfit.color)
      )
        setColor(outfit.color);
      if (SEASON_IDS.includes(outfit.season as Season))
        setSeason(outfit.season as Season);
      setName(String(outfit.name ?? "Outfit study"));
      setIncludeMirrorLook(outfit.includeMirrorLook !== false);
      setTintUpload(false);
      if (savedGarment) {
        const url = URL.createObjectURL(savedGarment);
        urls.current.push(url);
        garmentFile.current = savedGarment;
        setGarmentSrc(url);
      } else {
        garmentFile.current = null;
        setGarmentSrc("");
      }
      if (savedPerson) {
        const url = URL.createObjectURL(savedPerson);
        personFile.current = savedPerson;
        personFileUrl.current = url;
        if (provenance?.success)
          useApp.getState().setGeneratedPortrait(url, provenance.data, {
            restored: true,
          });
        else useApp.getState().setPortraitUrl(url);
      }
      notify(
        missing
          ? "Colours and placement restored. Upload the original images to complete this study."
          : "Outfit study restored on your current mirror portrait.",
      );
    },
    [notify],
  );
  useEffect(() => {
    if (activeOutfitId && appliedOutfit.current !== activeOutfitId)
      void restore(activeOutfitId).catch(() =>
        notify(
          "That outfit could not be opened. Your current portrait has been kept.",
        ),
      );
  }, [activeOutfitId, restore]);
  const remove = async (id: string) => {
    await db.transaction("rw", [db.outfits, db.mediaAssets], async () => {
      const outfit = await db.outfits.get(id);
      if (!outfit) return;
      for (const key of ["personMediaAssetId", "garmentMediaAssetId"])
        if (typeof outfit[key] === "string")
          await db.mediaAssets.delete(outfit[key] as string);
      await db.outfits.delete(id);
    });
    if (useApp.getState().activeOutfitId === id) {
      appliedOutfit.current = null;
      useApp.getState().setCompleteScene({ activeOutfitId: null });
    }
  };
  const download = () => {
    if (!canvas.current || error) return;
    let output = canvas.current;
    if (portraitProvenance) {
      const labelled = document.createElement("canvas");
      labelled.width = output.width;
      labelled.height = output.height + 56;
      const context = labelled.getContext("2d");
      if (!context) {
        notify("Unable to export the source disclosure. Please try again.");
        return;
      }
      context.fillStyle = "#f8f3ed";
      context.fillRect(0, 0, labelled.width, labelled.height);
      context.drawImage(output, 0, 0);
      context.fillStyle = "#49323d";
      context.font = "20px Georgia, serif";
      context.fillText(
        "AI-generated source · styled in True Beauty",
        20,
        output.height + 34,
        output.width - 40,
      );
      output = labelled;
    }
    const a = document.createElement("a");
    a.download = "true-beauty-composition.png";
    a.href = output.toDataURL("image/png");
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
      <button
        className="button secondary"
        onClick={() => {
          useApp.getState().setGenerationFeature("clothing");
          useApp.getState().setSpace("generation");
        }}
      >
        <Sparkles size={16} />
        Generate a clothing preview
      </button>
      <div className="dressing-layout">
        <div className="dressing-stage" ref={stage}>
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
          {portraitProvenance && (
            <p
              className="dressing-provenance"
              role="note"
              aria-label="Generated image provenance"
            >
              <Sparkles size={14} />
              AI-generated {portraitProvenance.feature} preview · Perfect Corp.
              This source is a generated simulation.
            </p>
          )}
          <canvas
            ref={canvas}
            aria-label="Your manually placed garment composition"
          />
          <div className="dressing-stage-foot">
            <span role="status">{error || status}</span>
            <button
              onClick={() => {
                markDirty();
                placementTouched.current = false;
                setPlacement(belowFacePlacement(vision?.entry.snapshot));
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
          <div className="dressing-edit-preview">
            <canvas
              ref={editPreview}
              aria-label="Current composition preview"
            />
            <div>
              <span className="dressing-kicker">As you compose</span>
              <p>Your placement preview</p>
              <span>Adjust below. See the same composition here.</span>
              {portraitProvenance && (
                <strong>
                  AI-generated {portraitProvenance.feature} source
                </strong>
              )}
              <button
                type="button"
                onClick={() =>
                  stage.current?.scrollIntoView({
                    block: "start",
                    behavior: "auto",
                  })
                }
              >
                View full composition
              </button>
            </div>
          </div>
          <h2>Compose your look</h2>
          <label className="dressing-check dressing-mirror-choice">
            <input
              type="checkbox"
              aria-label="Include current mirror look"
              checked={includeMirrorLook}
              onChange={(e) => {
                markDirty();
                setIncludeMirrorLook(e.target.checked);
              }}
            />
            Include current mirror look
          </label>
          <p className="dressing-look-status" role="status">
            <ScanFace size={13} />
            {visionStatus}
          </p>
          <p className="dressing-hint">
            Your makeup, hair colour, accessories and creative light stay with
            this portrait. The garment is manually placed.
          </p>
          {includeMirrorLook && visionStatus.includes("could not") && (
            <button
              className="text-action"
              onClick={() => {
                cache.current.delete(personSrc);
                setAttempt((a) => a + 1);
              }}
            >
              Retry local look alignment
            </button>
          )}
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
              onChange={(e) => chooseColor(e.target.value)}
            />
          </div>
          <div className="dressing-swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                style={{ background: c }}
                aria-label={`Choose garment colour ${c}`}
                aria-pressed={color === c}
                onClick={() => chooseColor(c)}
              />
            ))}
          </div>
          {garmentSrc && (
            <label className="dressing-check">
              <input
                type="checkbox"
                checked={tintUpload}
                onChange={(e) => {
                  markDirty();
                  setTintUpload(e.target.checked);
                }}
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
              onChange={(e) => {
                markDirty();
                setSeason(e.target.value as Season);
              }}
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
            This canvas is manual photo compositing. Generate clothing preview
            opens a separate provider workflow and requests consent before
            upload.
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
