import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowUpRight,
  Camera,
  Check,
  ImagePlus,
  LoaderCircle,
  ScanFace,
  ShieldCheck,
  Trash2,
  Minus,
  Plus,
  RotateCcw,
  Droplets,
  Eye,
  Scissors,
} from "lucide-react";
import {
  createVision,
  type VisionEngine,
  useCamera,
  type VisionSnapshot,
} from "../../../../packages/vision-core/src";
import {
  analyzeAppearance,
  assessImageQuality,
  sampleAppearance,
  compareSkinResults,
  type ImageQuality,
  type SkinAnalysisResult,
  type AppearanceSample,
} from "../../../../packages/skin-engine/src";
import {
  planScanFraming,
  type ScanFramingPlan,
} from "../../../../packages/skin-engine/src/framing";
import {
  buildRoutine,
  type IntelligenceRoutine,
} from "../../../../packages/beauty-intelligence/src";
import {
  SAMPLE_PRODUCTS,
  formatPrice,
  type Product,
} from "../../../../packages/commerce-engine/src";
import {
  db,
  deleteSkinScan,
  hasConsent,
  localProfileId,
  newId,
  setConsent,
  saveSkinScan,
  type SkinScan,
  type Currency,
} from "../../../../packages/local-database/src";
import { useApp } from "../state/store";
import { SectionTitle } from "./ui";
import "./SkinLab.css";
interface Capabilities {
  skinAnalysis?: {
    configured: boolean;
    paidEnabled: boolean;
    pricingPlanConfigured: boolean;
    status: string;
    allowedActions?: string[];
  };
}
interface UploadPayload {
  base64: string;
  type: "image/jpeg" | "image/png";
  previewUrl: string;
  sourceUrl: string;
  kind: "original" | "prepared";
  framing?: ScanFramingPlan;
}
interface Quote {
  imageRevision: number;
  sourceEpoch: number;
  quoteId: string;
  credits: number;
  actions: string[];
  expiresAt: string;
}
const concernChoices = [
  "moisture",
  "redness",
  "acne",
  "texture",
  "dark spots",
  "fine lines",
];
const concernLabel = (s: string) =>
  ({
    moisture: "Feels dry",
    redness: "Redness",
    acne: "Breakouts",
    texture: "Texture",
    "dark spots": "Dark spots",
    "fine lines": "Fine lines",
  })[s] ?? s;
type ColourRegion = "skin" | "hair" | "eye";
const regionLabels: Record<ColourRegion, string> = {
  skin: "Skin",
  hair: "Hair",
  eye: "Eyes",
};
const regionExplanation: Record<ColourRegion, string> = {
  skin: "A blend of small cheek and forehead samples. Makeup, light and your camera all change this colour.",
  hair: "A colour sampled inside the detected hair area. Fine strands, reflections and mixed lighting can change the reading.",
  eye: "A small sample around the iris, away from the pupil. Eyes occupy very few pixels; your own correction matters.",
};
export default function SkinLab() {
  const notify = useApp((s) => s.notify),
    setSpace = useApp((s) => s.setSpace),
    sourceUrl = useApp((s) => s.portraitUrl),
    generatedSource = useApp((s) => s.portraitProvenance),
    originalPortraitUrl = useApp((s) => s.originalPortraitUrl),
    setSourceUrl = useApp((s) => s.setPortraitUrl);
  const sourceName = generatedSource
    ? `AI-generated ${generatedSource.feature} preview`
    : sourceUrl.startsWith("blob:")
      ? "Your session photo"
      : "Studio portrait";
  const {
    stream: cameraStream,
    error: cameraError,
    isOpening: cameraOpening,
    open: openDeviceCamera,
    close: closeCamera,
  } = useCamera();
  const camera = !!cameraStream;
  const profile = useLiveQuery(() => db.profiles.get(localProfileId));
  const owned = useLiveQuery(() => db.ownedProducts.toArray(), [], []);
  const scans = useLiveQuery(
    () => db.skinScans.orderBy("createdAt").reverse().toArray(),
    [],
    [],
  );
  const [tab, setTab] = useState<"colour" | "care" | "history">("colour");
  const [quality, setQuality] = useState<ImageQuality | null>(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("Your image stays on this device."),
    [error, setError] = useState("");
  const [swatches, setSwatches] = useState({
      skin: "#bc9279",
      hair: "#342721",
      eye: "#604435",
    }),
    [sampled, setSampled] = useState(false),
    [corrected, setCorrected] = useState(false),
    [showMap, setShowMap] = useState(false),
    [vision, setVision] = useState<VisionSnapshot | null>(null);
  const [focusedRegion, setFocusedRegion] = useState<ColourRegion | null>(null);
  const [portraitZoom, setPortraitZoom] = useState(1);
  const [sampleMeta, setSampleMeta] = useState<AppearanceSample | null>(null);
  const [swatchOrigins, setSwatchOrigins] = useState<
    Record<ColourRegion, "example" | "photo" | "manual">
  >({ skin: "example", hair: "example", eye: "example" });
  const [frameSize, setFrameSize] = useState({ width: 1, height: 1 });
  const [skinType, setSkinType] = useState("Not specified"),
    [concerns, setConcerns] = useState<string[]>([]),
    [budget, setBudget] = useState(20000),
    [currency, setCurrency] = useState<Currency>("NGN"),
    [routine, setRoutine] = useState<IntelligenceRoutine<Product> | null>(null),
    [ownedOnly, setOwnedOnly] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null),
    [remoteConsent, setRemoteConsent] = useState(false),
    [retentionConsent, setRetentionConsent] = useState(false),
    [quote, setQuote] = useState<Quote | null>(null),
    [csrf, setCsrf] = useState(""),
    [authorizedCredits, setAuthorizedCredits] = useState(""),
    [remoteResult, setRemoteResult] = useState<SkinAnalysisResult | null>(null),
    [taskId, setTaskId] = useState(""),
    [uploadBytes, setUploadBytes] = useState<UploadPayload | null>(null),
    [saveConsent, setSaveConsent] = useState(false),
    [comparison, setComparison] = useState<string[]>([]);
  const imageRef = useRef<HTMLImageElement | null>(null),
    canvasRef = useRef<HTMLCanvasElement>(null),
    portraitFrameRef = useRef<HTMLDivElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    pipelineRef = useRef<VisionEngine | null>(null),
    videoRef = useRef<HTMLVideoElement>(null),
    aliveRef = useRef(true),
    sourceEpochRef = useRef(0),
    inspectionIdRef = useRef(0);
  const preparationIdRef = useRef(0),
    uploadRevisionRef = useRef(0),
    quoteRequestRef = useRef(0);
  const originalUploadRef = useRef<UploadPayload | null>(null);
  const visionSourceRef = useRef<{
    image: HTMLImageElement;
    epoch: number;
    url: string;
  } | null>(null);
  const [framingBusy, setFramingBusy] = useState(false),
    [framingError, setFramingError] = useState("");
  const invalidateRemoteImage = useCallback(() => {
    uploadRevisionRef.current++;
    quoteRequestRef.current++;
    setQuote(null);
    setCsrf("");
    setRemoteConsent(false);
    setRetentionConsent(false);
    setAuthorizedCredits("");
    setRemoteResult(null);
    setTaskId("");
    setSaveConsent(false);
  }, []);
  const appearance = useMemo(
    () =>
      sampled
        ? analyzeAppearance({
            skin: swatches.skin,
            ...(swatchOrigins.hair !== "example"
              ? { hair: swatches.hair }
              : {}),
            ...(swatchOrigins.eye !== "example" ? { eye: swatches.eye } : {}),
          })
        : null,
    [sampled, swatches, swatchOrigins],
  );
  useEffect(() => {
    const frame = portraitFrameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  const portraitLayout = useMemo(() => {
    const width = canvasRef.current?.width || 1,
      height = canvasRef.current?.height || 1;
    const scale = Math.max(frameSize.width / width, frameSize.height / height);
    return {
      width: width * scale,
      height: height * scale,
      left: (frameSize.width - width * scale) / 2,
      top: (frameSize.height - height * scale) / 2,
    };
  }, [frameSize, quality]);
  const regionPoints = useMemo(() => {
    const points: Partial<Record<ColourRegion, { x: number; y: number }>> = {};
    if (!vision?.landmarks.length) return points;
    const skin = vision.landmarks[50];
    if (skin) points.skin = skin;
    const left = vision.landmarks[468],
      right = vision.landmarks[473];
    if (left && right) points.eye = { x: left.x, y: left.y };
    const mask = vision.hairMask;
    if (mask && sampleMeta?.hair) {
      let xTotal = 0,
        yTotal = 0,
        n = 0;
      for (let y = 0; y < mask.height; y += 3)
        for (let x = 0; x < mask.width; x += 3) {
          if (mask.data[y * mask.width + x] > 0.8) {
            xTotal += x;
            yTotal += y;
            n++;
          }
        }
      if (n)
        points.hair = {
          x: xTotal / n / mask.width,
          y: yTotal / n / mask.height,
        };
    }
    return Object.fromEntries(
      Object.entries(points).map(([key, p]) => [
        key,
        {
          x:
            (p.x * portraitLayout.width + portraitLayout.left) /
            frameSize.width,
          y:
            (p.y * portraitLayout.height + portraitLayout.top) /
            frameSize.height,
        },
      ]),
    ) as Partial<Record<ColourRegion, { x: number; y: number }>>;
  }, [vision, sampleMeta, portraitLayout, frameSize]);
  const currentFocus = focusedRegion ? regionPoints[focusedRegion] : undefined;
  const panX = currentFocus
    ? Math.max(
        (-frameSize.width * (portraitZoom - 1)) / 2,
        Math.min(
          (frameSize.width * (portraitZoom - 1)) / 2,
          (0.5 - currentFocus.x) * frameSize.width * portraitZoom,
        ),
      )
    : 0;
  const panY = currentFocus
    ? Math.max(
        (-frameSize.height * (portraitZoom - 1)) / 2,
        Math.min(
          (frameSize.height * (portraitZoom - 1)) / 2,
          (0.5 - currentFocus.y) * frameSize.height * portraitZoom,
        ),
      )
    : 0;
  const focusRegion = (region: ColourRegion) => {
    if (!regionPoints[region]) return;
    setFocusedRegion(region);
    setShowMap(true);
    setPortraitZoom(region === "eye" ? 2.4 : region === "hair" ? 1.6 : 1.8);
    const epoch = sourceEpochRef.current;
    // Wait for the selected pose and its contextual content to commit. Scrolling
    // the whole portrait before commit can leave the actual feature above the
    // viewport when the control rail sits below a tall or sticky portrait.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!aliveRef.current || epoch !== sourceEpochRef.current) return;
        const marker = portraitFrameRef.current?.querySelector<HTMLElement>(
          `[data-colour-region="${region}"] .skin-lens-ring`,
        );
        if (!marker) return;
        const rect = marker.getBoundingClientRect();
        const viewport = window.visualViewport;
        const top = (viewport?.offsetTop ?? 0) + 48;
        const bottom =
          (viewport?.offsetTop ?? 0) +
          (viewport?.height ?? window.innerHeight) -
          48;
        // Keep context stable when the selected feature is already visible.
        if (rect.top >= top && rect.bottom <= bottom) return;
        marker.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      }),
    );
  };
  useEffect(() => {
    if (profile) {
      setSkinType(profile.skinType);
      setConcerns(profile.concerns);
      setBudget(profile.budget);
      setCurrency(profile.currency);
    }
  }, [profile]);
  useEffect(() => {
    aliveRef.current = true;
    const pipeline = createVision();
    pipelineRef.current = pipeline;
    fetch("/api/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (aliveRef.current) setCapabilities(v);
      })
      .catch(() => {});
    return () => {
      aliveRef.current = false;
      pipeline.dispose();
      pipelineRef.current = null;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const epoch = ++sourceEpochRef.current;
    imageRef.current = null;
    inspectionIdRef.current++;
    preparationIdRef.current++;
    uploadRevisionRef.current++;
    quoteRequestRef.current++;
    originalUploadRef.current = null;
    visionSourceRef.current = null;
    setFramingBusy(false);
    setFramingError("");
    setBusy(false);
    setShowMap(false);
    setPortraitZoom(1);
    setFocusedRegion(null);
    setSampleMeta(null);
    setSwatchOrigins({ skin: "example", hair: "example", eye: "example" });
    setSwatches({ skin: "#bc9279", hair: "#342721", eye: "#604435" });
    const oldCanvas = canvasRef.current;
    oldCanvas
      ?.getContext("2d")
      ?.clearRect(0, 0, oldCanvas.width, oldCanvas.height);
    setQuality(null);
    setSampled(false);
    setCorrected(false);
    setVision(null);
    setRemoteResult(null);
    setQuote(null);
    setError("");
    setTaskId("");
    setComparison([]);
    setSaveConsent(false);
    setRemoteConsent(false);
    setRetentionConsent(false);
    setAuthorizedCredits("");
    setUploadBytes(null);
    const img = new Image();
    img.onload = () => {
      if (!active || epoch !== sourceEpochRef.current) return;
      imageRef.current = img;
      const ratio = Math.min(
        1,
        1400 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      const c = canvasRef.current;
      if (!c) return;
      c.width = Math.round(img.naturalWidth * ratio);
      c.height = Math.round(img.naturalHeight * ratio);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      setQuality(assessImageQuality(ctx.getImageData(0, 0, c.width, c.height)));
      setStatus(
        "Portrait ready. Read your colours locally or choose your own swatches.",
      );
    };
    img.onerror = () => {
      if (active && epoch === sourceEpochRef.current)
        setError(
          "This image could not be opened. Choose another JPG, PNG or WebP.",
        );
    };
    img.src = sourceUrl;
    const preparationVersion = preparationIdRef.current;
    if (sourceUrl.startsWith("blob:") && !generatedSource)
      void fetch(sourceUrl)
        .then((r) => r.blob())
        .then(async (blob) => {
          if (
            blob.size > 4 * 1024 * 1024 ||
            !["image/jpeg", "image/png"].includes(blob.type)
          )
            return;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (!active || epoch !== sourceEpochRef.current) return;
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          const base64 = btoa(binary);
          const payload: UploadPayload = {
            base64,
            type: blob.type as "image/jpeg" | "image/png",
            previewUrl: `data:${blob.type};base64,${base64}`,
            sourceUrl,
            kind: "original",
          };
          originalUploadRef.current = payload;
          if (preparationVersion === preparationIdRef.current)
            setUploadBytes(payload);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [sourceUrl, generatedSource]);
  const inspectLocal = async () => {
    const img = imageRef.current;
    if (!img || !pipelineRef.current) return;
    const epoch = sourceEpochRef.current,
      inspectionId = ++inspectionIdRef.current;
    setBusy(true);
    setError("");
    setStatus("Reading facial regions on this device…");
    try {
      const snapshot = await pipelineRef.current.analyzeImage(img, {
        face: true,
        hair: true,
      });
      if (
        !aliveRef.current ||
        epoch !== sourceEpochRef.current ||
        img !== imageRef.current ||
        inspectionId !== inspectionIdRef.current
      )
        return;
      setVision(snapshot);
      visionSourceRef.current = { image: img, epoch, url: sourceUrl };
      const c = document.createElement("canvas");
      const ratio = Math.min(
        1,
        1200 / Math.max(img.naturalWidth, img.naturalHeight),
      );
      c.width = Math.round(img.naturalWidth * ratio);
      c.height = Math.round(img.naturalHeight * ratio);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("Image processing is unavailable.");
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const pixels = ctx.getImageData(0, 0, c.width, c.height);
      const sample = sampleAppearance(
        pixels,
        snapshot.landmarks,
        snapshot.hairMask
          ? {
              data: snapshot.hairMask.data,
              width: snapshot.hairMask.width,
              height: snapshot.hairMask.height,
            }
          : undefined,
      );
      if (!sample.skin)
        throw new Error(
          "No clear face region was found. Use a close, front-facing portrait or choose your swatches manually.",
        );
      setSampleMeta(sample);
      setSwatchOrigins({
        skin: "photo",
        hair: sample.hair ? "photo" : "example",
        eye: sample.eye ? "photo" : "example",
      });
      setFocusedRegion("skin");
      setSwatches({
        skin: sample.skin,
        hair: sample.hair ?? swatches.hair,
        eye: sample.eye ?? swatches.eye,
      });
      setSampled(true);
      setCorrected(false);
      setShowMap(true);
      setStatus(
        "Colour sampled from facial regions. Lighting changes the reading; correct any swatch.",
      );
    } catch (e) {
      if (
        aliveRef.current &&
        epoch === sourceEpochRef.current &&
        img === imageRef.current &&
        inspectionId === inspectionIdRef.current
      )
        setError(
          e instanceof Error
            ? e.message
            : "The image could not be analysed locally.",
        );
    } finally {
      if (aliveRef.current && inspectionId === inspectionIdRef.current)
        setBusy(false);
    }
  };
  const prepareScanFraming = async () => {
    const img = imageRef.current,
      current = useApp.getState();
    if (current.portraitProvenance || generatedSource) {
      setFramingError(
        "Restore the original photograph before preparing a skin scan. Generated pixels remain excluded.",
      );
      return;
    }
    if (
      !img ||
      !sourceUrl.startsWith("blob:") ||
      current.portraitUrl !== sourceUrl
    ) {
      setFramingError(
        "Upload your own original portrait first. Keep the full forehead and chin visible and face the camera directly.",
      );
      return;
    }
    const epoch = sourceEpochRef.current,
      id = ++preparationIdRef.current;
    invalidateRemoteImage();
    setFramingBusy(true);
    setFramingError("");
    const isCurrent = () =>
      aliveRef.current &&
      epoch === sourceEpochRef.current &&
      id === preparationIdRef.current &&
      img === imageRef.current &&
      useApp.getState().portraitUrl === sourceUrl &&
      !useApp.getState().portraitProvenance;
    let preparedCanvas: HTMLCanvasElement | null = null;
    try {
      let snapshot = vision;
      const identity = visionSourceRef.current;
      if (
        !snapshot?.landmarks.length ||
        identity?.image !== img ||
        identity.epoch !== epoch ||
        identity.url !== sourceUrl
      ) {
        const pipeline = pipelineRef.current;
        if (!pipeline)
          throw new Error(
            "Local face tracking is not ready. Try again, or retake a close frontal portrait with the forehead and chin inside the image.",
          );
        setStatus("Finding scan framing locally. Nothing is being uploaded…");
        snapshot = await pipeline.analyzeImage(img, { face: true });
        if (!isCurrent()) return;
        setVision(snapshot);
        visionSourceRef.current = { image: img, epoch, url: sourceUrl };
      }
      const plan = planScanFraming({
        width: img.naturalWidth,
        height: img.naturalHeight,
        landmarks: snapshot.landmarks,
      });
      if (!plan.ok) throw new Error(plan.message);
      preparedCanvas = document.createElement("canvas");
      preparedCanvas.width = plan.output.width;
      preparedCanvas.height = plan.output.height;
      const context = preparedCanvas.getContext("2d");
      if (!context)
        throw new Error(
          "Local image preparation is unavailable. Retake a closer frontal portrait instead.",
        );
      context.drawImage(
        img,
        plan.crop.x,
        plan.crop.y,
        plan.crop.width,
        plan.crop.height,
        0,
        0,
        plan.output.width,
        plan.output.height,
      );
      const blob = await new Promise<Blob>((resolve, reject) =>
        preparedCanvas!.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(
                  new Error(
                    "The local JPEG could not be prepared. No image was uploaded.",
                  ),
                ),
          "image/jpeg",
          0.94,
        ),
      );
      if (!isCurrent()) return;
      if (blob.size > 4 * 1024 * 1024)
        throw new Error(
          "This prepared JPEG is above the provider's 4 MB limit. Choose a smaller original image; nothing has been uploaded.",
        );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (!isCurrent()) return;
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const base64 = btoa(binary);
      setUploadBytes({
        base64,
        type: "image/jpeg",
        previewUrl: `data:image/jpeg;base64,${base64}`,
        sourceUrl,
        kind: "prepared",
        framing: plan,
      });
      setStatus(
        "Temporary scan crop prepared locally. Review the exact upload image before requesting a new quote.",
      );
    } catch (e) {
      if (isCurrent())
        setFramingError(
          e instanceof Error
            ? e.message
            : "Framing could not be prepared. Retake a close frontal portrait.",
        );
    } finally {
      if (preparedCanvas) preparedCanvas.width = preparedCanvas.height = 1;
      if (isCurrent()) setFramingBusy(false);
    }
  };
  const resetScanFraming = () => {
    preparationIdRef.current++;
    invalidateRemoteImage();
    setFramingBusy(false);
    setFramingError("");
    const original = originalUploadRef.current;
    setUploadBytes(original?.sourceUrl === sourceUrl ? original : null);
    setStatus(
      original
        ? "Original upload image selected. Review it and request a new quote before authorizing transmission."
        : "The original file is selected locally. Prepare a JPEG crop or choose an eligible JPEG/PNG for provider upload.",
    );
  };
  const upload = async (file?: File) => {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setError("Choose a JPG, PNG or WebP under 12 MB.");
      return;
    }
    sourceEpochRef.current++;
    preparationIdRef.current++;
    invalidateRemoteImage();
    setFramingBusy(false);
    setFramingError("");
    visionSourceRef.current = null;
    imageRef.current = null;
    inspectionIdRef.current++;
    closeCamera();
    setUploadBytes(null);
    setSourceUrl(URL.createObjectURL(file));
  };
  useEffect(() => {
    if (cameraError) setError(cameraError);
  }, [cameraError]);
  useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      void videoRef.current.play().catch(() => {
        setError("The camera stream could not play. Try another image.");
        closeCamera();
      });
    }
  }, [cameraStream, closeCamera]);
  const openCamera = async () => {
    setError("");
    await openDeviceCamera("user");
  };
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const c = document.createElement("canvas");
    const ratio = Math.min(
      1,
      1600 / Math.max(video.videoWidth, video.videoHeight),
    );
    c.width = Math.round(video.videoWidth * ratio);
    c.height = Math.round(video.videoHeight * ratio);
    c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
    c.toBlob(
      (blob) => {
        if (blob && aliveRef.current)
          void upload(new File([blob], "portrait.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  };
  const saveProfile = async () => {
    try {
      await db.profiles.update(localProfileId, {
        skinType,
        concerns,
        budget,
        currency,
        updatedAt: Date.now(),
      });
      notify("Your self-reported preferences were saved locally.");
    } catch {
      setError(
        "Your profile could not be saved. Check available browser storage.",
      );
    }
  };
  const createRoutine = () => {
    setRoutine(
      buildRoutine({ skinType, concerns, budget, currency }, SAMPLE_PRODUCTS, {
        ownedIds: owned.map((p) => p.productId),
        ownedOnly,
        budget,
        currency,
      }),
    );
  };
  const saveRoutine = async () => {
    if (!routine) return;
    try {
      const now = Date.now();
      await db.routines.bulkPut(
        (["AM", "PM"] as const).map((period) => ({
          id: newId(),
          name: period === "AM" ? "My morning ritual" : "My evening ritual",
          period,
          steps: routine[period === "AM" ? "am" : "pm"].map((s) => ({
            id: newId(),
            name: s.product?.name ?? s.slot,
            productId: s.product?.id,
            reason: s.why,
          })),
          createdAt: now,
          updatedAt: now,
        })),
      );
      notify("Morning and evening routines saved to your journal.");
    } catch {
      setError("Routine could not be saved.");
    }
  };
  const requestQuote = async () => {
    if (generatedSource || useApp.getState().portraitProvenance) {
      setError(
        "Restore your original photograph before requesting skin observations. Generated pixels cannot describe your skin.",
      );
      return;
    }
    if (
      framingBusy ||
      !uploadBytes ||
      uploadBytes.sourceUrl !== useApp.getState().portraitUrl
    )
      return;
    const epoch = sourceEpochRef.current,
      revision = uploadRevisionRef.current,
      requestId = ++quoteRequestRef.current;
    const isCurrent = () =>
      aliveRef.current &&
      epoch === sourceEpochRef.current &&
      revision === uploadRevisionRef.current &&
      requestId === quoteRequestRef.current &&
      !useApp.getState().portraitProvenance;
    setBusy(true);
    setError("");
    try {
      const session = await fetch("/api/session").then((r) => r.json());
      if (!isCurrent()) return;
      setCsrf(session.csrfToken);
      const actions = capabilities?.skinAnalysis?.allowedActions ?? [
        "texture",
        "pore",
        "redness",
        "moisture",
      ];
      const res = await fetch("/api/skin/quotes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ actions }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          body.error ?? "A verified provider quote is unavailable.",
        );
      if (isCurrent())
        setQuote({ ...body, imageRevision: revision, sourceEpoch: epoch });
    } catch (e) {
      if (isCurrent())
        setError(
          e instanceof Error ? e.message : "The provider is unavailable.",
        );
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const submitRemote = async () => {
    if (
      useApp.getState().portraitProvenance ||
      !quote ||
      !uploadBytes ||
      framingBusy ||
      uploadBytes.sourceUrl !== useApp.getState().portraitUrl ||
      quote.imageRevision !== uploadRevisionRef.current ||
      quote.sourceEpoch !== sourceEpochRef.current ||
      !remoteConsent ||
      !retentionConsent ||
      Number(authorizedCredits) < quote.credits
    )
      return;
    const epoch = sourceEpochRef.current,
      revision = uploadRevisionRef.current;
    const isCurrent = () =>
      aliveRef.current &&
      epoch === sourceEpochRef.current &&
      revision === uploadRevisionRef.current;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/skin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          imageBase64: uploadBytes.base64,
          contentType: uploadBytes.type,
          actions: quote.actions,
          maxCredits: Number(authorizedCredits),
          consent: {
            uploadImage: true,
            externalProcessing: true,
            providerRetentionAcknowledged: true,
          },
        }),
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(body.error ?? "The provider could not start the task.");
      if (!isCurrent()) return;
      setTaskId(body.taskId);
      setStatus(
        "Provider task started. Checking status never starts a new paid task.",
      );
    } catch (e) {
      if (isCurrent())
        setError(e instanceof Error ? e.message : "Provider request failed.");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const checkTask = async () => {
    if (!taskId) return;
    const epoch = sourceEpochRef.current,
      revision = uploadRevisionRef.current;
    const isCurrent = () =>
      aliveRef.current &&
      epoch === sourceEpochRef.current &&
      revision === uploadRevisionRef.current;
    setBusy(true);
    try {
      const res = await fetch("/api/skin/tasks/" + encodeURIComponent(taskId));
      const body = await res.json();
      if (!isCurrent()) return;
      if (!res.ok || body.status === "error")
        throw new Error(body.error ?? "Provider task failed.");
      if (body.status === "success") {
        setRemoteResult(body.result);
        setStatus("Provider observations received. No history has been saved.");
      } else
        setStatus(
          "The provider is still processing. Check again after 10 seconds.",
        );
    } catch (e) {
      if (isCurrent())
        setError(e instanceof Error ? e.message : "Status unavailable.");
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const saveObservation = async () => {
    if (!saveConsent || (!appearance && !remoteResult)) return;
    try {
      if (!(await hasConsent("analysis.history")))
        await setConsent("analysis.history", true);
      await saveSkinScan({
        id: newId(),
        createdAt: Date.now(),
        provider: remoteResult ? "perfect-corp" : "local-pixel-colour",
        observations: remoteResult?.observations ?? [
          {
            kind: corrected ? "user-corrected-colour" : "local-pixel-colour",
            ...swatches,
            season: appearance?.season,
          },
        ],
        ...(remoteResult ? { result: remoteResult } : {}),
        ...(appearance ? { appearance } : {}),
        note: "No photograph stored. Colour comparisons are lighting-sensitive and do not establish clinical change.",
      });
      notify("Observation saved locally. Your photograph was not stored.");
      setSaveConsent(false);
    } catch {
      setError("The observation could not be saved. Check browser storage.");
    }
  };
  const compareHistory = (scan: SkinScan) => {
    const latest = scans.find((s) => s.id !== scan.id);
    if (!latest) {
      setComparison([
        "Save another observation to compare. Match lighting and framing for a more useful comparison.",
      ]);
      return;
    }
    if (scan.result && latest.result) {
      const rows = compareSkinResults(
        scan.result as SkinAnalysisResult,
        latest.result as SkinAnalysisResult,
      );
      setComparison(
        rows.length
          ? rows.map(
              (r) =>
                `${r.concern}${r.region ? " · " + r.region : ""}: ${r.before.toFixed(1)} → ${r.after.toFixed(1)} raw model score. ${r.note}`,
            )
          : ["No comparable raw provider fields are available."],
      );
    } else
      setComparison([
        "These local colour observations record photo swatches only. They do not measure skin health. Compare your saved swatches and use the same lighting for future captures.",
      ]);
  };
  return (
    <section className="skin-lab">
      <SectionTitle
        overline="A closer look, with care"
        title="Skin, understood."
      >
        <button className="text-action" onClick={() => setSpace("studio")}>
          Back to your mirror <ArrowUpRight size={16} />
        </button>
      </SectionTitle>
      <div className="skin-layout">
        <section className="skin-portrait-pane" aria-label="Skin portrait">
          <div
            className="skin-portrait"
            ref={portraitFrameRef}
            data-focused-region={focusedRegion ?? "full"}
            data-zoom={portraitZoom.toFixed(1)}
          >
            <div
              className="skin-portrait-view"
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${portraitZoom})`,
              }}
            >
              <canvas
                ref={canvasRef}
                data-portrait-source={sourceUrl}
                aria-label="Your portrait; local sampling regions can be shown"
                style={{
                  width: portraitLayout.width,
                  height: portraitLayout.height,
                  left: portraitLayout.left,
                  top: portraitLayout.top,
                }}
              />
              {showMap &&
                (["skin", "hair", "eye"] as const).map((region) => {
                  const point = regionPoints[region];
                  if (!point) return null;
                  return (
                    <button
                      key={region}
                      data-colour-region={region}
                      className={`skin-region-lens ${focusedRegion === region ? "selected" : ""}`}
                      style={{
                        left: `${point.x * 100}%`,
                        top: `${point.y * 100}%`,
                        transform: `translate(-50%, -50%) scale(${1 / portraitZoom})`,
                      }}
                      aria-label={`Focus ${regionLabels[region].toLowerCase()} region`}
                      aria-pressed={focusedRegion === region}
                      onClick={() => focusRegion(region)}
                    >
                      <span className="skin-lens-ring" />
                      <span>
                        {regionLabels[region]}
                        <Plus size={11} />
                      </span>
                    </button>
                  );
                })}
            </div>
            {camera && (
              <div className="skin-camera">
                <video ref={videoRef} playsInline muted autoPlay />
                <button className="button" onClick={capture}>
                  <Camera size={16} />
                  Capture portrait
                </button>
                <button
                  className="skin-camera-close"
                  onClick={() => {
                    closeCamera();
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            <span className="skin-image-label">
              {sourceName} ·{" "}
              {showMap
                ? "Colour sampling regions"
                : generatedSource
                  ? "Generated pixels"
                  : "Unretouched image"}
            </span>
            <button
              className="skin-map-button"
              aria-pressed={showMap}
              onClick={() => setShowMap((v) => !v)}
              disabled={!vision?.landmarks.length}
            >
              <ScanFace size={16} />
              {showMap ? "Hide regions" : "Show regions"}
            </button>
          </div>
          {generatedSource && (
            <div className="skin-generated-notice" role="note">
              <p>
                This is a generated styling image. Its colours can inspire a
                look; it cannot describe your skin.
              </p>
              <button
                className="button secondary"
                onClick={() => useApp.getState().restoreOriginalPortrait()}
              >
                {originalPortraitUrl
                  ? "Restore original photograph"
                  : "Use studio portrait"}
              </button>
            </div>
          )}
          <div
            className="skin-zoom-controls"
            aria-label="Portrait zoom controls"
          >
            <button
              aria-label="Zoom out of portrait"
              disabled={portraitZoom <= 1}
              onClick={() => setPortraitZoom((z) => Math.max(1, z - 0.2))}
            >
              <Minus size={15} />
            </button>
            <output aria-label="Portrait zoom">
              {Math.round(portraitZoom * 100)}%
            </output>
            <button
              aria-label="Zoom into portrait"
              disabled={portraitZoom >= 3}
              onClick={() => setPortraitZoom((z) => Math.min(3, z + 0.2))}
            >
              <Plus size={15} />
            </button>
            <button
              className="skin-reset"
              onClick={() => {
                setPortraitZoom(1);
                setFocusedRegion(null);
              }}
            >
              <RotateCcw size={13} />
              Reset view
            </button>
          </div>
          <div
            className="skin-region-rail"
            role="group"
            aria-label="Explore portrait regions"
          >
            <span>Look closer</span>
            {(["skin", "hair", "eye"] as const).map((region) => (
              <button
                key={region}
                aria-label={`Explore ${regionLabels[region].toLowerCase()} colour`}
                aria-pressed={focusedRegion === region}
                disabled={!regionPoints[region]}
                onClick={() => focusRegion(region)}
              >
                {region === "skin" ? (
                  <Droplets size={14} />
                ) : region === "hair" ? (
                  <Scissors size={14} />
                ) : (
                  <Eye size={14} />
                )}{" "}
                {regionLabels[region]}
              </button>
            ))}
          </div>
          {focusedRegion && regionPoints[focusedRegion] && (
            <div className="skin-region-reading" aria-live="polite">
              <span
                className="skin-reading-swatch"
                style={{ backgroundColor: swatches[focusedRegion] }}
              />
              <div>
                <div>
                  <strong>{regionLabels[focusedRegion]} colour</strong>
                  <span>
                    {swatchOrigins[focusedRegion] === "manual"
                      ? "Your correction"
                      : swatchOrigins[focusedRegion] === "photo"
                        ? "From your portrait"
                        : "Choose your swatch"}
                  </span>
                </div>
                <p>{regionExplanation[focusedRegion]}</p>
                <button
                  className="text-action"
                  onClick={() =>
                    document
                      .getElementById(`skin-swatch-${focusedRegion}`)
                      ?.click()
                  }
                >
                  Correct this colour <ArrowUpRight size={12} />
                </button>
              </div>
            </div>
          )}
          <div className="skin-source">
            <button onClick={() => void openCamera()} disabled={cameraOpening}>
              <Camera size={16} />
              {cameraOpening ? "Opening camera…" : "Camera"}
            </button>
            <button onClick={() => fileRef.current?.click()}>
              <ImagePlus size={16} />
              Upload portrait
            </button>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
          </div>
          <p className="skin-private">
            <ShieldCheck size={15} />
            Your image is processed locally unless you explicitly choose
            provider analysis.
          </p>
          {quality && (
            <details className="skin-checks">
              <summary>
                Portrait checks{" "}
                <span>
                  {quality.suitable
                    ? "Ready for local exploration"
                    : `${quality.issues.length} capture tips`}
                </span>
              </summary>
              <p>These checks evaluate image pixels, not your skin.</p>
              <ul>
                {quality.issues.length ? (
                  quality.issues.map((t) => <li key={t}>{t}</li>)
                ) : (
                  <li>
                    Image size, exposure and sharpness pass the basic local
                    checks.
                  </li>
                )}
              </ul>
              <p>
                For a provider scan: face forward, remove makeup and glasses
                when comfortable, and let your face fill most of the frame.
              </p>
            </details>
          )}
        </section>
        <section className="skin-details">
          <div className="skin-tabs" role="group" aria-label="Skin Lab spaces">
            {(["colour", "care", "history"] as const).map((t) => (
              <button
                aria-pressed={tab === t}
                key={t}
                onClick={() => setTab(t)}
              >
                {t === "colour"
                  ? "Your colours"
                  : t === "care"
                    ? "Skin & care"
                    : "Your history"}
              </button>
            ))}
          </div>
          {tab === "colour" && (
            <div className="skin-tab-content">
              <div className="skin-intro">
                <span className="skin-kicker">Personal colour studio</span>
                <h2>
                  A palette that feels
                  <br />
                  like you.
                </h2>
                <p>
                  Your skin, hair and eyes tell a colour story. Read your
                  portrait, explore each detail, then take a shade into your
                  mirror.
                </p>
              </div>
              <button
                className="button skin-primary"
                onClick={() => void inspectLocal()}
                disabled={busy || !quality}
              >
                {busy ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <ScanFace size={17} />
                )}{" "}
                {busy ? "Reading your portrait…" : "Read my colours locally"}
              </button>
              <p role="status" className="skin-status">
                {status}
              </p>
              {vision?.landmarks.length ? (
                <button
                  className="text-action skin-explore-link"
                  onClick={() => focusRegion(focusedRegion ?? "skin")}
                >
                  <ScanFace size={14} />
                  Explore the colour regions <ArrowUpRight size={13} />
                </button>
              ) : null}
              <div className="skin-swatch-inputs">
                {(["skin", "hair", "eye"] as const).map((type) => (
                  <label key={type}>
                    <input
                      type="color"
                      id={`skin-swatch-${type}`}
                      aria-label={`Correct ${type} colour`}
                      value={swatches[type]}
                      onChange={(e) => {
                        inspectionIdRef.current++;
                        setBusy(false);
                        setSwatchOrigins((previous) => ({
                          ...previous,
                          [type]: "manual",
                        }));
                        setSwatches({ ...swatches, [type]: e.target.value });
                        setSampled(true);
                        setCorrected(true);
                      }}
                    />
                    <span>
                      {type === "eye"
                        ? "Eyes"
                        : type.charAt(0).toUpperCase() + type.slice(1)}
                    </span>
                    <small>{swatches[type]}</small>
                  </label>
                ))}
              </div>
              {!sampled && (
                <p className="skin-note">
                  Swatches are starting examples until you read your portrait or
                  choose your own.
                </p>
              )}
              {appearance && (
                <div className="skin-palette">
                  <div>
                    <span className="skin-kicker">
                      {corrected
                        ? "Your corrected swatches"
                        : "Photo-based colour suggestion"}
                    </span>
                    <h3>{appearance.seasonLabel}</h3>
                    <p>
                      {appearance.headline}. A styling direction to explore,
                      never a rule.
                    </p>
                  </div>
                  <p className="skin-palette-invitation">
                    Choose a shade to try it on your lips in the mirror{" "}
                    <ArrowUpRight size={14} />
                  </p>
                  <div className="skin-palette-colours">
                    {appearance.palette.map((c) => (
                      <button
                        key={c.hex}
                        aria-label={`Try ${c.name} in your mirror`}
                        title={c.name}
                        onClick={() => {
                          useApp.getState().patchLayer("lipstick", {
                            color: c.hex,
                            enabled: true,
                          });
                          useApp.getState().setFocusLayer("lipstick");
                          useApp.getState().setStudioMode("makeup");
                          notify(
                            `${c.name} on your lips. Adjust the finish and intensity to make it yours.`,
                          );
                        }}
                      >
                        <span
                          className="skin-palette-chip"
                          style={{ backgroundColor: c.hex }}
                        />
                        <span className="skin-shade-name">
                          {c.name}
                          <ArrowUpRight size={11} />
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="skin-confidence">
                    <span>Heuristic confidence</span>
                    <strong>
                      {Math.round(
                        (appearance.analysis?.confidence ?? 0.4) * 100,
                      )}
                      %
                    </strong>
                  </div>
                  <p className="skin-note">
                    A styling suggestion for this photograph. Lighting and
                    makeup affect the reading; your preferences come first.
                    Confidence is a rough styling guide, not a validated
                    accuracy score. No clinical skin type or phototype is
                    inferred.
                  </p>
                  <details>
                    <summary>What informed this palette?</summary>
                    {appearance.analysis?.reasoning.map((s) => (
                      <p key={s}>{s}</p>
                    ))}
                  </details>
                </div>
              )}
            </div>
          )}
          {tab === "care" && (
            <div className="skin-tab-content">
              <div className="skin-intro">
                <span className="skin-kicker">Your voice comes first</span>
                <h2>Care, made personal.</h2>
                <p>
                  Tell us how your skin feels. A photograph cannot reliably
                  establish skin type or hydration.
                </p>
              </div>
              <label className="skin-field">
                Your skin type, as you describe it
                <select
                  value={skinType}
                  onChange={(e) => setSkinType(e.target.value)}
                >
                  {[
                    "Not specified",
                    "normal",
                    "dry",
                    "oily",
                    "combination",
                    "sensitive",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <fieldset className="skin-concerns">
                <legend>What would you like to focus on?</legend>
                {concernChoices.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={concerns.includes(c)}
                      onChange={() =>
                        setConcerns((v) =>
                          v.includes(c) ? v.filter((x) => x !== c) : [...v, c],
                        )
                      }
                    />
                    {concernLabel(c)}
                  </label>
                ))}
              </fieldset>
              <label className="skin-field">
                Budget currency
                <select
                  aria-label="Budget currency"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value as Currency);
                    setRoutine(null);
                  }}
                >
                  {(["NGN", "USD", "GBP", "EUR"] as const).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="skin-field">
                Routine budget · {currency}
                <input
                  aria-label={`Routine budget in ${currency}`}
                  type="number"
                  min="0"
                  max="10000000"
                  value={budget}
                  onChange={(e) =>
                    setBudget(
                      Math.min(
                        10000000,
                        Math.max(0, Number(e.target.value) || 0),
                      ),
                    )
                  }
                />
              </label>
              <div className="skin-actions">
                <button
                  className="button secondary"
                  onClick={() => void saveProfile()}
                >
                  Save my preferences
                </button>
                <button className="button" onClick={createRoutine}>
                  Build my routine <ArrowUpRight size={15} />
                </button>
              </div>
              <label className="skin-checkbox">
                <input
                  type="checkbox"
                  checked={ownedOnly}
                  onChange={(e) => setOwnedOnly(e.target.checked)}
                />
                Only use products I own
              </label>
              {routine && (
                <div className="skin-routine">
                  <div className="skin-routine-header">
                    <h3>Your daily ritual</h3>
                    <span>
                      {routine.am.concat(routine.pm).some((s) => s.product)
                        ? formatPrice(
                            routine.total,
                            routine.currency as Currency,
                          )
                        : `No ${routine.currency} catalogue prices selected`}{" "}
                      <small>
                        {routine.am.concat(routine.pm).some((s) => s.product)
                          ? "sample total · no exchange conversion"
                          : "Add priced or owned products to assemble this routine"}
                      </small>
                    </span>
                  </div>
                  {(["am", "pm"] as const).map((period) => (
                    <div className="skin-routine-period" key={period}>
                      <h4>{period === "am" ? "Morning" : "Evening"}</h4>
                      {routine[period].map((step, i) => (
                        <div className="skin-routine-step" key={step.slot}>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <div>
                            <strong>{step.product?.name ?? step.slot}</strong>
                            <p>{step.why}</p>
                            <small>{step.usage}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <p className="skin-note">
                    Sample catalogue and prices. These are cosmetic suggestions
                    based on your self-reported preferences, not diagnosis or
                    proof of efficacy. Verify current product labels.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => void saveRoutine()}
                  >
                    Save both routines
                  </button>
                </div>
              )}
              <div className="skin-provider">
                <div>
                  <ShieldCheck size={19} />
                  <h3>Provider skin analysis</h3>
                </div>
                <p>
                  {capabilities?.skinAnalysis?.status ===
                  "requires-verified-quote"
                    ? "A connected provider can estimate cosmetic concerns. Review the exact credit quote and upload consent first."
                    : "Not connected. Genuine concern scores need a configured Perfect Corp account and a verified cost plan. No scan results are simulated."}
                </p>
                <p className="skin-note">
                  Local colour sampling remains available. No photo is
                  transmitted by opening this panel.
                </p>
                <section
                  className="skin-scan-framing"
                  aria-label="Provider image framing"
                >
                  <h4>Frame your scan</h4>
                  <p>
                    Face the camera directly in even light. The provider asks
                    for a full face over 60% of the image width, with forehead
                    and chin visible. Local preparation aims for 72%; it cannot
                    create missing detail or guarantee acceptance.
                  </p>
                  <button
                    className="button secondary"
                    disabled={
                      busy ||
                      framingBusy ||
                      !quality ||
                      !!generatedSource ||
                      !sourceUrl.startsWith("blob:")
                    }
                    onClick={() => void prepareScanFraming()}
                  >
                    {framingBusy ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <ScanFace size={16} />
                    )}{" "}
                    {framingBusy
                      ? "Preparing scan framing…"
                      : "Prepare scan framing"}
                  </button>
                  {!sourceUrl.startsWith("blob:") && !generatedSource && (
                    <p className="skin-note">
                      Upload your own original portrait to prepare a temporary
                      scan image. Studio portraits cannot be submitted.
                    </p>
                  )}
                  {!vision?.landmarks.length && !generatedSource && (
                    <p className="skin-note">
                      Preparation reads face landmarks locally through the
                      existing tracker. If no clear face is found, retake a
                      closer frontal photo with both cheeks, forehead and chin
                      visible.
                    </p>
                  )}
                  {framingError && (
                    <p role="alert" className="inline-error">
                      {framingError}
                    </p>
                  )}
                  {uploadBytes &&
                    uploadBytes.sourceUrl === sourceUrl &&
                    !generatedSource && (
                      <figure className="skin-upload-preview">
                        <img
                          src={uploadBytes.previewUrl}
                          alt={
                            uploadBytes.kind === "prepared"
                              ? "Exact temporary cropped image selected for provider upload"
                              : "Exact original image selected for provider upload"
                          }
                        />
                        <figcaption>
                          <strong>
                            {uploadBytes.kind === "prepared"
                              ? "Temporary cropped upload preview"
                              : "Original upload preview"}
                          </strong>
                          {uploadBytes.framing && (
                            <span>
                              {uploadBytes.framing.output.width}×
                              {uploadBytes.framing.output.height}px · detected
                              face approximately{" "}
                              {Math.round(
                                uploadBytes.framing.face.widthFraction * 100,
                              )}
                              % of image width
                            </span>
                          )}
                          <span>
                            This exact encoded image is selected for upload.
                            Your session photograph is unchanged; no image has
                            been sent or saved by preparing it.
                          </span>
                        </figcaption>
                        {uploadBytes.framing && (
                          <>
                            <ul>
                              {uploadBytes.framing.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                            <button
                              className="text-action"
                              disabled={busy}
                              onClick={resetScanFraming}
                            >
                              Use original upload image
                            </button>
                          </>
                        )}
                      </figure>
                    )}
                </section>
                {capabilities?.skinAnalysis?.status ===
                  "requires-verified-quote" && (
                  <>
                    <p>
                      Upload your own JPEG or PNG under 4 MB. Studio portraits
                      are excluded from provider submission.
                    </p>
                    <button
                      className="button secondary"
                      onClick={() => void requestQuote()}
                      disabled={
                        busy ||
                        framingBusy ||
                        !uploadBytes ||
                        uploadBytes.sourceUrl !== sourceUrl ||
                        !!generatedSource
                      }
                    >
                      Get a credit quote
                    </button>
                    {quote && (
                      <div className="skin-quote">
                        <p>
                          Quote:{" "}
                          <strong>{quote.credits} provider credits</strong>.
                          Expires{" "}
                          {new Date(quote.expiresAt).toLocaleTimeString()}.
                        </p>
                        <label className="skin-checkbox">
                          <input
                            type="checkbox"
                            checked={remoteConsent}
                            onChange={(e) => setRemoteConsent(e.target.checked)}
                          />
                          I consent to sending this portrait to Perfect Corp for
                          these cosmetic observations.
                        </label>
                        <label className="skin-checkbox">
                          <input
                            type="checkbox"
                            checked={retentionConsent}
                            onChange={(e) =>
                              setRetentionConsent(e.target.checked)
                            }
                          />
                          I understand the provider processes the image remotely
                          and publishes media/file retention of up to 30 days;
                          some task documentation still says 24 hours. This
                          preview uses the longer period.
                        </label>
                        <label className="skin-field">
                          Maximum credits I authorize
                          <input
                            type="number"
                            min="0"
                            value={authorizedCredits}
                            onChange={(e) =>
                              setAuthorizedCredits(e.target.value)
                            }
                          />
                        </label>
                        <button
                          className="button"
                          disabled={
                            busy ||
                            framingBusy ||
                            !uploadBytes ||
                            uploadBytes.sourceUrl !== sourceUrl ||
                            !!generatedSource ||
                            quote.imageRevision !== uploadRevisionRef.current ||
                            !remoteConsent ||
                            !retentionConsent ||
                            Number(authorizedCredits) < quote.credits
                          }
                          onClick={() => void submitRemote()}
                        >
                          Authorize and send portrait
                        </button>
                      </div>
                    )}
                    {taskId && !remoteResult && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => void checkTask()}
                      >
                        Check existing task status
                      </button>
                    )}
                  </>
                )}
                {remoteResult && (
                  <div className="skin-observations">
                    <h4>Genuine provider observations</h4>
                    {remoteResult.observations.map((o) => (
                      <div key={o.id}>
                        <strong>
                          {o.label}
                          {o.region ? " · " + o.region : ""}
                        </strong>
                        <span>
                          {o.uiScore === undefined
                            ? "Display score unavailable"
                            : `${o.uiScore} / 100 display score`}
                        </span>
                        <small>
                          {o.rawScore === undefined
                            ? "Raw model score unavailable"
                            : `Raw model score: ${o.rawScore.toFixed(1)}`}
                        </small>
                        {o.skinType && <span>{o.skinType}</span>}
                      </div>
                    ))}
                    {remoteResult.limitations.map((s) => (
                      <p className="skin-note" key={s}>
                        {s}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === "history" && (
            <div className="skin-tab-content">
              <div className="skin-intro">
                <span className="skin-kicker">Observations over time</span>
                <h2>
                  Notice. Reflect.
                  <br />
                  Keep what matters.
                </h2>
                <p>
                  History is yours to save and remove. Match your lighting and
                  framing for useful comparisons.
                </p>
              </div>
              {scans.length === 0 ? (
                <div className="skin-history-empty">
                  <ScanFace size={32} />
                  <h3>Your history starts with your choice.</h3>
                  <p>
                    Read your colours, then explicitly save an observation.
                    Photographs are never saved here.
                  </p>
                  <button
                    className="text-action"
                    onClick={() => setTab("colour")}
                  >
                    Explore your colours <ArrowUpRight size={15} />
                  </button>
                </div>
              ) : (
                <div className="skin-history-list">
                  {scans.map((s) => (
                    <article key={s.id}>
                      <div>
                        <time>
                          {new Date(s.createdAt).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </time>
                        <h3>
                          {s.provider === "perfect-corp"
                            ? "Provider cosmetic observations"
                            : "Colour observation"}
                        </h3>
                        <p>
                          {s.provider === "perfect-corp"
                            ? "Provider predictions · no photo stored"
                            : "Photo swatches or your corrections · no skin health scores"}
                        </p>
                        {s.appearance ? (
                          <div className="skin-history-swatches">
                            {["skin", "hair", "eye"].map((k) => {
                              const value = (s.appearance as { hex?: string })
                                .hex;
                              if (k !== "skin" || !value) return null;
                              return (
                                <span
                                  key={k}
                                  style={{ backgroundColor: value }}
                                  title="Saved skin-colour swatch"
                                />
                              );
                            })}
                            <span>
                              {
                                (s.appearance as { seasonLabel?: string })
                                  .seasonLabel
                              }
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <button
                          className="text-action"
                          onClick={() => compareHistory(s)}
                        >
                          Compare
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`Delete observation from ${new Date(s.createdAt).toLocaleDateString()}`}
                          onClick={() =>
                            void deleteSkinScan(s.id).then(() =>
                              notify("Observation deleted locally."),
                            )
                          }
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {comparison.length > 0 && (
                <div className="skin-comparison" role="status">
                  {comparison.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                </div>
              )}
            </div>
          )}
          {(appearance || remoteResult) && tab !== "history" && (
            <div className="skin-save">
              <label className="skin-checkbox">
                <input
                  type="checkbox"
                  checked={saveConsent}
                  onChange={(e) => setSaveConsent(e.target.checked)}
                />
                Save this observation to my local history. No photograph.
              </label>
              <button
                className="button secondary"
                disabled={!saveConsent}
                onClick={() => void saveObservation()}
              >
                <Check size={15} />
                Save observation
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
