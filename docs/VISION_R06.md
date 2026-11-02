# Round 06 — real body/pose inference and expanded accessory projections

Recorded 2026-11-02. These engines are implemented and locally verified in software Chromium. Physical-device speed, moving-body robustness, population fairness, metric fit/depth, and R06 Firefox/WebKit model operation remain unverified. This report is not a 9/10 acceptance claim for those scopes.

## Operational changes

The existing coordinated `VisionPipeline` and dedicated worker now support optional **body** and **pose** features, retaining the single shared face model, hand model, explicit still-image queue, source lifecycle and adaptive scheduler. Real official Selfie Multiclass output supplies background, hair, body-skin, face-skin, clothes and other confidence masks. Its actual hair channel replaces the dedicated hair invocation whenever body segmentation is active. No garment categories, hidden anatomy or body depth are fabricated.

Pose Landmarker Lite supplies actual 33-point image-plane landmarks with visibility/presence. The app requests one person. Face, hands and pose use temporal coordinate smoothing; uncertain class changes receive bounded temporal filtering with stale-gap reset. There is no optical-flow tracker, 3D hair skeleton, physical body reconstruction or identity association across different people. Model loading is lazy. Optional body/pose failures remain explicit status errors, trigger a genuine main-thread CPU attempt after a worker failure, and retain usable basic controls. Optional failures have a 30-second retry cooldown to avoid repeated model churn.

Original procedural **ring, bracelet, watch and hat** previews extend the existing glasses/earrings/necklace contract. Rings require an actual sufficiently supported in-frame hand. Wrists prefer actual hand geometry and fall back to visible pose wrist/elbow pairs; weak/out-of-frame anchors are suppressed. Necklaces can use real shoulder pose even without a detected face. Hats require actual face geometry and use the observed top-head hair/face silhouette when available. Scaling is an image-plane estimate, not measured sizing. The procedural shapes are geometric AR/static-photo composites, not photorealistic generated garments, depth-aware fitting or merchant product fit.

Semantic exclusion protects confident hair/background boundaries around body jewellery and preserves hair fringe below the hat brim. Confident body-skin/clothes/other predictions inside the tracked facial oval can suppress face paint; hand geometry retains the existing explicit face-occlusion path. These are semantic-category decisions, **not a claim to recover physical front/back depth**. A mask can be wrong or lag behind motion, particularly at the low cadence measured on this server. Only same-frame forehead registration adjusts the hat's observed head boundary; there is no general mask warping/optical flow.

Existing shader/pigment/material/light behavior was retained. New body jewellery is composited after hand-source restoration so valid rings/watches are not erased by the face-paint occlusion path. All new inference/renderer state is temporary; these modules contain no photo/geometry database writes or external upload calls.

## Shared contracts and root integration

- `Feature` adds `body` and `pose`; old callers requesting face/hair/hands continue to work.
- `VisionSnapshot.bodyMask?: BodySegmentation|null` contains copied `labels:Uint8Array`, winning `confidence:Float32Array`, `person:Float32Array`, dimensions, timestamp and explicit model source. Labels use official class order. No callback-owned array is retained.
- `VisionSnapshot.pose?: PoseFrame|null` contains normalized image-plane landmarks, visibility/presence and timestamp. Depth/physical fit is not exported as a validated measurement.
- Optional status fields preserve old snapshot literals. Missing detections produce null/empty observations, never placeholder landmarks.
- `BeautyRenderer.RenderFrame` accepts optional `bodyMask` and `pose`.
- `ACCESSORY_KEYS` exposes seven keys. Existing three required booleans remain backwards compatible; ring/bracelet/watch/hat are optional booleans. `normalizeLook` validates explicit booleans and preserves legacy sparse object shape.
- `accessoryVisionRequirements(look.accessories)` centralizes lazy model needs. `accessoryAnchorStatus()` reports actual available anchors and a reason when an enabled projection is unavailable.
- `summarizeVision()` exposes technical metadata without images, coordinates or masks. `maskPredictionAgreement()` requires identical framing; it labels the output prediction agreement, not accuracy. `summarizeValidationCoverage()` excludes unconsented local observations and never infers demographic groups.

Root owns Living Mirror, Dressing Room, shared app state and validation UI integration. Core/browser evidence below does not by itself verify every root UI control or stored complete-look journey.

## Model and fixture provenance

Official documentation was reviewed before downloading:

- https://ai.google.dev/edge/mediapipe/solutions/vision/image_segmenter
- https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker

The official Multiclass Segmentation card (May 10, 2023; Google author Adel Ahmadyan) and BlazePose GHUM 3D card (April 16, 2021; Google authors) explicitly state “LICENSED UNDER” Apache License, Version 2.0. The independent rights audit found the same explicit declaration for face-bundle constituents, hair and hand cards. This is model-specific evidence, not an assumption from the SDK license.

| New model | Official pinned source | Bytes | SHA-256 |
|---|---|---:|---|
| Selfie multiclass | `mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/1/selfie_multiclass_256x256.tflite` | 16,371,837 | `c6748b1253a99067ef71f7e26ca71096cd449baefa8f101900ea23016507e0e0` |
| Pose Lite | `mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` | 5,777,746 | `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` |

Sources use `https://storage.googleapis.com/`. The downloader validates pinned SHA-256 values before atomically replacing an existing model. The full versioned URLs/download receipts for all five models are in [manifest.json](../apps/web/public/models/manifest.json). Full Apache text and model attribution are copied beside public model files by `npm run models`. Per-module notices retain exact model-card URLs. Only minimal licensing quotations/receipts are committed, not full model-card PDFs and their example photos. See [RIGHTS_AUDIT_R06.md](RIGHTS_AUDIT_R06.md) for exact card hashes and remaining distribution blockers. Model-weight licensing does not license training data or portrait likeness rights.

Development/regression uses existing provenance-recorded Unsplash portraits; this does not resolve the separate release/likeness audit. Two additional **evaluation-only** full-body fixtures, NASA IDs `iss040e006091` and `iss018e030096`, have official item metadata, download hashes, credits and policy basis in [evaluation/r06](../apps/web/public/evaluation/r06/). NASA policy permits factual educational/informational uses subject to exceptions and no endorsement; these are not labelled CC0, beauty marketing portraits, endorsement or training assets. No demographic categories are inferred. They are application holdouts, not guaranteed upstream pretraining holdouts. Their initial evaluation exposed a general face-gated necklace bug; it was fixed and rerun, so these are regression fixtures after that repair, not an untouched statistical validation set.

## Executed evidence

Environment: Linux, AMD EPYC 9V74 server CPU, Chromium 154.0.8037.57, MediaPipe Tasks Vision 0.10.35, CPU model delegate, dedicated worker; software graphics/Canvas2D accessory rendering. No physical webcam, mobile hardware or discrete GPU was used. Exact machine/browser/timestamps/source hashes are in the JSON evidence.

Real static-model run at 13:53 UTC:

| Fixture | Face / hands / pose | Visible pose points | Model batch ms | Ring / bracelet / watch / hat / necklace changed pixels |
|---|---|---:|---:|---|
| Development portrait600×900 | 478 /1 /33 |18 |1,028.3 cold |200 /910 /2,435 /47,015 /6,556 |
| Regression portrait600×900 |478 /1 /33 |21 |563.3 |50 /92 /233 /12,299 /1,007 |
| NASA `iss040e006091`,850×1280 |0 /1 /33 |28 |499.3 |16 /72 /78 /0 /27 |
| NASA `iss018e030096`,850×1280 |0 /1 /33 |29 |505.0 |26 /99 /144 /0 /292 |

All four produced genuine six-class masks. Missing face detection on distant/full-body images correctly produced no hat pixels. Source-size-dependent pixel counts demonstrate operational compositing, not visual realism, anchor accuracy or product fit. Plain gray 320×320 negative input produced zero face/hand/pose detections; its mean predicted person probability remained 0.0879, which is retained as uncertainty rather than replaced with a fabricated zero.

The run fetched the face, multiclass, pose and hand files once; it requested **no redundant dedicated hair model**. The routed browser harness observed **zero POST requests**. Screenshots and complete data:

- [Model/accessory evidence](../packages/vision-core/evidence/r06/model-accessory-evidence.json)
- [Development image, classes and accessories](../packages/vision-core/evidence/r06/portrait-development.png)
- [Regression image](../packages/vision-core/evidence/r06/portrait-context.png)
- [NASA side-stride evaluation](../packages/vision-core/evidence/r06/iss040e006091.png)
- [NASA harness-occlusion evaluation](../packages/vision-core/evidence/r06/iss018e030096.png)

An 8.08-second actual video-mode run used a **canvas-captureStream repeating a static portrait**, 480×720, advertised 30 FPS. Aspect ratio matters: an earlier distorted 480×600 experiment lost the pose, so the final test preserves framing; this is not evidence of robust pose tracking under arbitrary distortion. Final actual model executions were face 24, hands 16, body 5, pose 9, dedicated hair 0. The renderer/UI loop recorded 480 rAF callbacks, 59.4 Hz, interval p50/p95 16.7ms; model-batch p50/p95 were 40.0/337.5 ms. Mean body inference cost was 363.1 ms and the scheduler slowed aggregate target cadence 5.68×. **UI refresh is not inference FPS**; face inference was about 3 Hz and body about 0.62 Hz under this concurrent software-server load. The supplied static image still produced 478 face / 33 pose points while the main-thread 10 ms timer ticked 104 times. Stream tracks ended after cleanup; no error was recorded. Eight seconds does not establish long-run memory stability or moving-user quality. See [worker evidence](../packages/vision-core/evidence/r06/worker-five-model-integration.json).

Four development-portrait stress cases (reference, 50% brightness, 35% sepia, 3px blur) used actual local inference and identical framing. Face/hands/pose remained available; class prediction-agreement IoU ranged 0.9742–0.9973 across transformed hair/body-skin/face-skin/clothes outputs. These are synthetic lighting/blur stressors from one image, **not new participants, complexion cohorts or ground-truth segmentation accuracy**. The semantic-compositing test bypassed only exclusion in one renderer using identical real face/hand/pose geometry: 2,913 pixels changed and painted pixels decreased 52,204 → 50,056 when the actual category mask was enabled. Jewellery-only pixels on this unobstructed wrist did not change; actual suppression here came from the hair-fringe/hat boundary. See [stress/occlusion evidence](../packages/vision-core/evidence/r06/stress-semantic-evidence.json) and [comparison screenshot](../packages/vision-core/evidence/r06/actual-semantic-exclusion.png).

## Verification commands and limits

```sh
npm run dev -- --port 5173
node packages/vision-core/scripts/verify-r06.mjs
node packages/vision-core/scripts/verify-r06-worker.mjs
node packages/vision-core/scripts/verify-r06-stress.mjs
npx vitest run packages/vision-core/src packages/ar-renderer/src packages/makeup-engine/src packages/body-segmentation/src packages/pose-tracking/src
npx tsc --noEmit
npx eslint packages/vision-core/src packages/body-segmentation/src packages/pose-tracking/src packages/ar-renderer/src packages/makeup-engine/src
```

Targeted unit verification: **44 tests in 12 files passed**. Coverage includes model-buffer copy lifetime, malformed/NaN output, semantic confidence gating, temporal reset, actual-coordinate projection transformations, suppression of weak/out-of-frame anchors, legacy look normalization, optional-worker-error fallback, source queues, pose confidence, and existing shader/surface/pigment/light regression tests. Browser fixtures execute real model files rather than mocking MediaPipe. Whole-project TypeScript checking and scoped ESLint passed after the other agents completed their integration. The existing camera lifecycle browser harness also passed nine checks: denial, explicit open, hidden/foreground behavior, camera switching, close, late cancellation, late hidden permission, and unmount cleanup. This uses controlled permission responses and real canvas MediaStreams, not physical devices. `git diff --check` passed for the owned code.

Remaining validation: physical desktop/mobile cameras and actual 30/60 FPS targets; moving subject/occlusion/rotation/device-switch behavior for the new optional models; Firefox/WebKit R06 models; long-run frame/mask memory profiling; independent annotated masks/anchor ground truth; multi-person association; consented self-described demographic cohorts across lighting and hair/skin appearances. Existing historical upstream model-card fairness statements do not validate this app. Coverage aggregation intentionally reports fairness as **unverified**. No clinical skin classifier, phototype inference, face recognition, paid calls, external photo transmission or photo database writes were introduced.

## Living Mirror / Studio integration handoff

The requested UI integration was completed in `LivingMirror.tsx` and `Studio.tsx` after the engine work. Every `load`, `analyzeImage` and `analyzeVideo` path now reads the same stable face/hair/hand/body/pose requirement bits; all seven accessory keys participate in the primitive dependency fingerprint. Face remains shared for cosmetics. Pose/hands load for supported accessories. **Enhanced overlap detail** is off by default and requests body only when explicitly enabled and an accessory needs it. Its actual hair channel avoids a second hair model. Render frames pass optional body and pose data, and static render invalidation includes hands/body/pose changes.

All seven accessory controls are available in Style. Actual anchor availability and precise unavailable reasons appear in that inspector; a diamond control in the mirror opens and focuses the details. Camera status publication remains throttled to approximately 600 ms rather than setting React state every frame. Optional model failures are visible; turning overlap detail off recovers basic previews. Expanded status text was moved out of the mirror column after screenshot inspection found it shrinking the mobile canvas. The final measured mirror heights were 652.6 px desktop and 256.2 px at 390×844, with no horizontal overflow.

Generated-photo metadata from the root's explicit provider-result action produces a persistent **AI-generated hair/clothing preview** label, provider/still-image badge and 44×44 Restore-original control. The badge does not overlap zoom controls. A live controlled camera stream is labelled Live; the still-image provenance returns when that stream stops. Restoring returns the original source. The Hair Studio opens the real provider preview/quote space with feature `hair`; it does not assert the provider is unconfigured before inspecting its capabilities. These UI tests use explicit generated metadata fixtures and do not claim a live provider call.

Executed final UI checks:

- **8/8** new desktop/mobile Playwright cases passed: real accessory pixel changes, actual hand/pose/body model outputs, body opt-in, hair deduplication, optional model failure/off recovery, unavailable-hand explanation, generated provenance, controlled real MediaStream Live labeling, restore-original behavior, zero POSTs and zero saved media records. Source: `tests/e2e/accessories-r06.spec.ts`.
- **12/12** existing immersive/source-queue desktop/mobile regression cases passed: light/undo/keyboard/pointer edits, responsive placement, focus continuity, shader/gallery output, source-aligned full-portrait comparison, and a held old model fetch followed by a new portrait. This does not replace physical-camera validation.
- **4/4** new automated WCAG scans (Style and generated-source states at 1440×1000 and 390×844) found zero violations. Inspector focus, no overflow, mirror dimensions, 44 px restore targets, badge/zoom non-overlap and zero POSTs were checked. Automated scans and viewport emulation are not full screen-reader/device certification. Evidence: [accessibility-layout-evidence.json](../cook/stills/r06-accessories/accessibility-layout-evidence.json).
- Whole-project type checking, scoped UI/core lint and owned-file whitespace checks passed. The existing 9-check camera lifecycle harness passed separately using real canvas MediaStreams with controlled permission/visibility fixtures.

Repeatable commands:

```sh
npx playwright test tests/e2e/accessories-r06.spec.ts --project=chromium --project=mobile
npx playwright test tests/e2e/vision-source.spec.ts tests/e2e/immersive-studio.spec.ts --project=chromium --project=mobile
node packages/vision-core/scripts/verify-r06-ui.mjs
```

Actual UI screenshots are under [cook/stills/r06-accessories](../cook/stills/r06-accessories/). Model/renderer unit evidence remains in the preceding sections. Root's separate provider work and product-wide regression/critic rounds need their own evidence; these focused results do not establish complete-product acceptance.
