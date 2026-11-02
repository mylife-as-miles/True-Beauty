# Complete feature inventory

This is the full-scope backlog from the creator’s directive. Nothing is removed because an implementation is difficult. Status is conservative: only a named test, browser capture or live-provider evidence may promote an item to **Implemented and verified**. Code present without integration evidence is **Implemented but unverified**. A category row can be split when only part is implemented; do not mark an entire combined capability verified from a partial test.

Allowed statuses: **Implemented and verified** · **Implemented but unverified** · **In progress** · **Planned** · **Blocked with evidence**.

Initial inventory date: 2026-11-02. Review this table against current code and the latest quality report after each round. Initial statuses are Planned rather than guesses about concurrent work.

## Round 06 evidence boundary

These statuses describe the working tree and explicitly identified local-service/browser runs. The currently published public R05 Site remains static and has no provider backend; a successful local task is not a hosted capability or deployment receipt.

- Genuine generated outputs: hair and initial clothing in `cook/evidence/r06-live-001/receipt.json`; corrected upper-body clothing in `cook/evidence/r06-clothing-002/receipt.json`. Output bytes match their recorded SHA-256 values. The corrected clothing visual retains the trousers; this is one synthetic fixture, not fit validation. All actual billing remains unverified.
- Genuine native Claude: `cook/evidence/r06-claude-live-001/receipt.json` records three model turns, two actual lip/hair actions, no selected personal context and no images. A US$0.111 reservation is not a charge receipt.
- Genuine skin: `cook/evidence/r06-skin-003/receipt.json` now records successful pore/redness/texture/moisture predictions from the explicitly framed 724×809 synthetic image (`framing.json`, face width about 71.96%). The first two failures remain preserved. Success establishes this task and parser execution, not clinical accuracy, returned concern masks, representative fairness, all concern families or actual billing.
- `VISION_R06`, `FASHION_R06`, `LOOK_REMIX_R06`, `DIGITAL_TWIN_R06_UI`, `MERCHANT_R06` and `technical-r06` provide scoped local-model/browser/domain evidence. Model-specific licensing evidence improved in `RIGHTS_AUDIT_R06`; overall distribution, physical-device, representative fairness and advanced-feature gates remain open.

All 219 capability rows and all ten mandatory journey rows are retained. Combined rows remain partial when only one constituent is verified; evidence does not imply a >=9 product score.

## Foundation

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| ARC-01 | No-login desktop/mobile React TypeScript Vite application | Implemented and verified | Product Critic r01: actual no-login Chromium desktop1440 / mobile 390 app, six spaces; more browsers unverified |
| ARC-02 | Tailwind custom design system; typed engine boundaries; Zod runtime validation | In progress | React/Tailwind and runtime contracts exist; every engine boundary not independently audited |
| ARC-03 | Modular monorepo frontend/API/packages organization | Implemented and verified | apps/web, apps/api and modular packages inspected in working tree; contracts completion separately tracked |
| ARC-04 | Local-first core independent of remote providers | Implemented but unverified | Local Mirror, image-derived Remix, Twin, routines and stored commerce work independently of paid services; R06 scope evidence in LOOK_REMIX_R06, DIGITAL_TWIN_R06_UI and MERCHANT_R06. Complete offline production journey remains separate. |
| ARC-05 | WebGL 2 baseline and graceful Canvas fallback | Implemented but unverified | Real WebGL/Canvas renderer code + portrait screenshots; context-loss/mobile GPU evidence incomplete |
| ARC-06 | Three.js / React Three Fiber where useful; measured WebGPU experiments | In progress | Actual Three.js/R3F product viewer verified in browser; WebGPU experiment remains planned |
| ARC-07 | Workers / OffscreenCanvas / WASM performance experiments | In progress | R06 real dedicated-worker/OffscreenCanvas/WASM inference and benchmark exports include measured five-model cadence. Physical-device benefit, long-run stability and broader performance experiments remain incomplete; WebGPU is tracked separately. |
| ARC-08 | Offline app shell and local records access | Implemented but unverified | Production generated service-worker precache and offline E2E exist; latest whole production offline result principal-owned |
| ARC-09 | Error boundaries, operational status and recoverable failure UI | In progress | Camera unavailable recovery and provider unavailable state verified in product-r01; full recovery cases pending |

## Provenance

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| SRC-01 | OpenMakeupSDK real tracking / mesh / GLSL / materials / patterns / morph source integration | Implemented but unverified | Actual adapted GLSL/makeup code in packages + source-notes/openmakeup; full fidelity/asset audit pending |
| SRC-02 | virtual-makeup real camera / MediaPipe / hair / OpenCV / geometry / palette integration | In progress | Real shared camera/MediaPipe/hair/OpenCV adaptations remain active; R06 original body/pose extensions and seven accessory projections verified in VISION_R06. Missing upstream standalone notice remains unresolved. |
| SRC-03 | SKIN_AI real Perfect Corp / color analysis / matching / routine / VTO adaptation | In progress | Actual MIROIR colour/routine/commerce/provider adaptations; genuine R06 skin four-field parsing, hairstyle and corrected upper_body clothing receipts. Full upstream feature/asset scope, accuracy and licensing obligations remain separate. |
| SRC-04 | Skyn real capture / preprocessing / tone / clustering / ML / cosine adaptation with uncertainty | In progress | Tone/preprocessing/recommendation adaptation; legacy classifier/dataset not deployed; scientific validation pending |
| SRC-05 | Source integration matrix: SHA, paths, destination, modification, operations, tests, licenses | Implemented and verified | SOURCE_INTEGRATION_MATRIX pins four SHAs, studied/reused paths, destinations, improvements, evidence and license gaps; independently inspected |
| SRC-06 | Independent model weights, datasets, textures, font and photographic asset audit | In progress | RIGHTS_AUDIT_R06: explicit Apache-2.0 model-card evidence for all five weights, pinned hashes and retained notices; portrait/release, unused upstream asset and broader distribution audit gates remain open. |
| SRC-07 | Preserved copyright and license notices | In progress | R06 inventory verifies 10 retained known notice files, including public model Apache/NOTICE copies; Virtual Makeup full standalone notice and production/transitive packaging audit remain unresolved. |
| SRC-08 | Proofline and Common Table interaction study with restricted reuse boundaries | Implemented and verified | Source/doc/license study pinned in DESIGN_RESEARCH; no source app runtime claim |
| SRC-09 | Taste Skill/Cook read and compatible installation | Implemented and verified | Taste/Cook current instructions read; non-overwriting Codex installation; draw seed 890544161 |
| SRC-10 | Current official YouCam API documentation and skills review | Implemented and verified | Current official YouCam schemas/skills and authenticated pricing/template metadata reviewed; genuine skin/hair/upper_body clothing receipts confirm these local execution paths. No hosted or scientific validation implied. |

## Living Mirror

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| MIR-01 | Camera activation with explicit permission | Implemented but unverified | Explicit camera action exercised; no physical device available; VISION_REPORT lifecycle fixtures pass |
| MIR-02 | Supplied labelled demo portrait without camera permission | Implemented and verified | product-r01/01-desktop-studio + mobile-studio: actual no-permission demo with real portrait inference |
| MIR-03 | User photograph upload and image-based preview | Implemented and verified | Actual neutral/portrait upload and queued model checks technical-r03; final feature recheck confirms session upload remains available across spaces |
| MIR-04 | Live webcam preview with movement-aligned makeup | Implemented but unverified | Real VIDEO-mode worker executes on canvas MediaStream fixture; physical live makeup alignment unverified |
| MIR-05 | Camera switching and cleanup on navigation/unmount | Implemented but unverified | Actual delayed-permission/unmount and canvas-stream switch/stop tests technical-r02/r03 pass; physical hardware remains unverified |
| MIR-06 | Camera denial, backgrounding, rotation and recovery | In progress | Denial/background/late-stream/unmount fixture checks pass; real device rotation/permission lifecycle unverified |
| MIR-07 | Before/after draggable split and comparable saved transformations | Implemented and verified | Actual split alignment under crop/zoom/resize technical-r02; round05 full-portrait letterboxing preserves original half; saved two-look replay tested journal-studio.spec.ts |
| MIR-08 | Zoom to facial region and contextual face-region controls | In progress | Round05 actual anchored face-region lens, named controls, zoom/framing and source-correct split verified in immersive-studio + independent interaction review; precision zoom-to-every-region remains incomplete |
| MIR-09 | Skin-analysis overlays with contextual explanation | Blocked with evidence | Local colour ROI/lens and original pixels work; genuine r06-skin-003 returns four whole-image predictions but no verified concern mask/overlay. Scalar predictions do not create meaningful spatial maps. |
| MIR-10 | Complete-look switching and scene continuity | Implemented and verified | R06 shared portrait Mirror/Skin/Dressing continuity and complete-look cosmetics/light/owned-product/outfit restoration verified by digital-twin.spec.ts and dressing-scene-r06.spec.ts. Static composition, not measured fit. |
| MIR-11 | Save look and optional photo with separate storage consent | In progress | R06 complete-look recipe and outfit parameters save/reopen without images; photo saves remain separately consented. Full optional-photo storage/device lifecycle validation remains incomplete. |
| MIR-12 | Touch, pointer, keyboard and screen-reader interaction | In progress | Touch viewport/menu/range controls work; full screen-reader/keyboard and physical gestures not passed |
| MIR-13 | GPU context loss/missing model/low-memory recovery | In progress | Actual GPU context-loss fallback renderer smoke/report; camera/model errors recover; low-memory/device validation outstanding |
| MIR-14 | Product drag onto mirror with accessible alternate action | In progress | Shade swatch drag/drop and normal shade button path exist; full product-to-mirror drag workflow not verified |

## Vision Core

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| VIS-01 | Single shared face model; face detection and landmark estimation | Implemented and verified | VISION_REPORT: one shared real FaceLandmarker,478 landmarks across 3 portraits; physical motion robustness unverified |
| VIS-02 | Face mesh geometry and normalized render coordinate conversion | Implemented but unverified | Actual normalized geometry/mesh mapping plus geometry unit tests/renderer smoke; representative face registration accuracy not validated |
| VIS-03 | Head pose, facial transformation matrix and expression blendshapes | Implemented and verified | VISION_REPORT real local models:52 blendshapes + 16 transform values across portraits; live head-pose quality unverified |
| VIS-04 | Eye, mouth and facial contour region geometry | Implemented but unverified | Landmark-defined eye/mouth/contour regions active in renderer and sampling; occlusion/expression alignment not fully validated |
| VIS-05 | Temporal landmark smoothing and stability | Implemented and verified | VISION_REPORT 7-unit suite tests jitter smoothing/lost-track reset; representative motion validation pending |
| VIS-06 | Occlusion handling; glasses/partial-face support where possible | In progress | R06 genuine six-class masks, hand geometry and semantic exclusion change rendered pixels; this is category-based overlap, not physical depth, robust moving-person occlusion or glasses validation. |
| VIS-07 | Single coordinated frame scheduler / shared scene state | Implemented and verified | VISION_REPORT actual worker/video scheduler fixture; real app scene integration visible in product-r01 |
| VIS-08 | Inference separated from rendering; adaptive inference cadence | Implemented and verified | VISION_REPORT worker test:270 rAF callbacks vs28 face / 11 hair / 20 hand calls; not 60 predictions/s |
| VIS-09 | Adaptive camera / inference / rendering resolution | In progress | Bounded640 face / 256 hair and adaptive cadence implemented; complete device-resolution policy pending |
| VIS-10 | Hair image segmentation with actual confidence mask | Implemented and verified | VISION_REPORT three real portraits produced nonempty hair confidence masks; boundary quality unvalidated |
| VIS-11 | Hair temporal mask smoothing and motion correspondence experiments | In progress | Temporal mask unit tests pass; optical-flow/motion correspondence remains unimplemented/unverified |
| VIS-12 | Hair-skin feathered boundaries and face/hand occlusion correction | In progress | R06 actual multiclass hair/face/body/clothes confidence gating and 2,913-pixel semantic-exclusion comparison; no optical flow or validated front/back matting/depth quality. |
| VIS-13 | Hand landmarks/finger positions/tracking confidence | Implemented but unverified | Real hand model executes; some portrait hand detections unlabelled; no actual gesture accuracy claim |
| VIS-14 | Pinch/open palm/swipe/pointing with calibration and debouncing | Implemented but unverified | Unit debounced pinch/geometry tests; calibration/real gesture accuracy not demonstrated |
| VIS-15 | Hand-to-screen coordinate mapping and interaction state machine | Implemented but unverified | Normalized hand geometry/debounced pinch/swipe mapping coded with unit tests; real interaction accuracy/latency unverified |
| VIS-16 | Safe gestures: select color/switch look/move accessory/rotate product/open panel | In progress | Safe pinch/swipe integration exists; principal enabled/active guard fixed; physical end-to-end behavior unverified |
| VIS-17 | No gesture purchase/private transmission/paid operation; standard control equivalents | Implemented but unverified | Standard compare/shade controls exercised; complete gesture/privacy invariants not independently audited |
| VIS-18 | Body/person/garment segmentation provider interfaces and actual implementation research | Implemented and verified | VISION_R06 real Selfie Multiclass six-class body/person/clothes masks and Pose Lite 33 landmarks; four image fixtures, negative input and eight UI cases. Semantic classes are not garment instances, draping or fit; physical/fairness gates remain. |

## Makeup Atelier

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| MUP-01 | Structured editable serializable Look Composer | Implemented and verified | Actual structured scene changes and saved/reopened recipe in product-r01 + package contract |
| MUP-02 | Foundation shade matching, coverage and skin-tone-aware compositing | In progress | Foundation layer/coverage controls and tone-aware blend code exist; physical shade matching/complexion fidelity not validated |
| MUP-03 | Lipstick and lip liner; teeth/inner-mouth exclusion | Implemented but unverified | Actual lipstick/liner masks and inner-mouth exclusion in renderer; all expressions/teeth motion and visual quality unverified |
| MUP-04 | Lip gloss with adjustable finish/specular response | Implemented but unverified | Real gloss shader parameters/compilation evidence; Canvas now has explicit approximate finishes; actual WebGL material controls and four distinct finishes verified round05; hardware realism unverified |
| MUP-05 | Blush; contour; bronzer; highlighter | Implemented but unverified | Actual blush/contour/bronzer/highlighter layer controls/masks; browser rendering exists but all-layer visual realism not validated |
| MUP-06 | Eyeliner and eyeshadow masks with anatomical alignment | Implemented but unverified | Eye-region shader/masks and controls active; eyeliner/shadow anatomical alignment across people unverified |
| MUP-07 | Eyebrow color/shape styling | In progress | Brow tint layer exists; full adjustable eyebrow shape styling not established |
| MUP-08 | Mascara and eyelash effects | Implemented but unverified | Mascara/lash geometry effects active; realistic eye movement/occlusion/coverage not validated |
| MUP-09 | Custom colors/palettes and per-layer opacity/enabled state | Implemented and verified | Actual mobile shade/intensity87% and presets in visual-r02, product-r01 palettes/enables, composer tests; does not verify realism of every layer |
| MUP-10 | Multi-layer blending and artistic makeup | Implemented but unverified | Structured editable multi-layer/preset composition is operational; complete artistic pattern coverage not verified |
| MUP-11 | Makeup presets, saving/reloading and product shade previews | In progress | Presets/save/reopen and illustrative product shades exist; full shoppable look workflow incomplete |
| MUP-12 | Matte/gloss/shimmer/glitter material shaders | Implemented but unverified | Real source-adapted GLSL matte/gloss/shimmer/glitter compiled/drawn in renderer smoke; real supported-hardware finish quality unverified |
| MUP-13 | Natural texture-preserving blending and color correction | Implemented but unverified | Actual source-preserving blend/color math and hair luminance tests; texture fidelity across complexion/light not validated |
| MUP-14 | Mask feathering, soft shadows, reflective/specular highlights | Implemented but unverified | Optional OpenCV feathering and shader specular/soft-mask code operate; final material realism remains below visual bar |
| MUP-15 | Light-responsive skin-like materials and approximate physical lighting experiment | In progress | Approximate view/light/Fresnel material math adapted; no physically calibrated lighting or realism benchmark |
| MUP-16 | Optional explicit facial reshaping separate from analysis | Implemented but unverified | Explicit optional reshape slider and warp code separate from analysis; full functional/visual evaluation unverified |
| MUP-17 | Optional user-controlled retouching separate from natural texture | Planned | Requires implementation and named evidence |

## Skin Lab

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| SKN-01 | Capture guidance: framing, light, blur/exposure suitability checks | Implemented but unverified | Portrait checks and guidance visible; representative failure fixtures/device acquisition not all tested |
| SKN-02 | Explicit image-upload consent and provider task creation | Implemented and verified | Explicitly authorized quoted skin upload/task creation and successful result recorded in r06-skin-003 after two preserved errors. Original synthetic fixture only; public R05 has no provider backend. |
| SKN-03 | Real configured provider task polling/result parsing | Implemented and verified | r06-skin-003 receipt: genuine successful local task/poll/parse for pore, redness, texture and moisture after explicit 724x809 framing. Earlier failures retained; synthetic fixture does not validate clinical accuracy, billing or hosted operation. |
| SKN-04 | Dynamic supported concerns rather than fixed score count | Implemented and verified | Dynamic parser returns four genuine supported fields from r06-skin-003 with distinct raw/UI scores and null confidence; malformed/unknown/missing-field fixtures remain separate from unrequested concern-family verification. |
| SKN-05 | Skin type user profile and validated provider classification where available | In progress | Self-reported profile/type works in Skin Lab and R06 Twin; no genuine provider skin-type result. No type is inferred from local photo colours. |
| SKN-06 | Apparent tone and sRGB/CIELAB color processing | Implemented and verified | product-r01/11 and supplement: actual local sRGB/CIELAB sampling/season suggestion, no clinical type claim |
| SKN-07 | Visible texture and pore appearance observations where provider supports | Implemented and verified | r06-skin-003 genuinely returns pore and texture provider-prediction fields with raw/UI scores. These are cosmetic model predictions on one synthetic fixture, not direct measurements or accuracy validation. |
| SKN-08 | Wrinkle/fine-line appearance where provider supports | Blocked with evidence | Genuine skin success covered texture/pore/redness/moisture only; wrinkle/fine-line actions were not requested or verified under this reviewed plan. |
| SKN-09 | Pigmentation/dark spot/redness appearance where provider supports | In progress | r06-skin-003 genuinely returns redness appearance; pigmentation/dark-spot actions were not requested/verified. No direct physiological or clinical measurement claimed. |
| SKN-10 | Acne-related/dark-circle/hydration appearance where provider supports | In progress | r06-skin-003 genuinely returns apparent-hydration/moisture prediction; acne and dark-circle actions were not requested/verified. Neither score is a measured hydration percentage. |
| SKN-11 | Confidence, limitations, evidence/source and result-class labels | In progress | Genuine r06-skin-003 output labels provider-prediction, separate raw/UI scores, null confidence and explicit lighting/complexion/clinical limitations. Full result-explanation and supported-concern UI coverage remains incomplete. |
| SKN-12 | Editable user correction and storage preferences | Implemented but unverified | Color correction/self-report/storage controls present; full correction/history browser coverage pending |
| SKN-13 | Interactive regional skin map with meaningful provider overlays | Blocked with evidence | Local skin/hair/iris colour lenses work; genuine skin success contains whole-image scalar predictions, with no returned/verified spatial concern masks. Meaningful provider overlays remain incomplete. |
| SKN-14 | History/progress comparison with standardized light/framing guidance | In progress | Consented local history and provider comparison algorithms/interfaces exist; standardized real longitudinal concern comparison unavailable |
| SKN-15 | Explainable product/routine suggestions using approved observations | In progress | Actual self-report/owned/budget routine explanations work; genuine provider-observation recommendations await provider |
| SKN-16 | No disease diagnosis or selfie-derived clinical Fitzpatrick claim | Implemented and verified | Reviewed UI says rule-based heuristic/not clinical/no phototype; no such inference in tested local flow |
| SKN-17 | Complexion and lighting robustness evaluation with recorded fixtures | In progress | Synthetic complexion/exposure fixtures plus R06 prediction-agreement/coverage workbench exist. One-image perturbations and two evaluation photos are not representative-person fairness/accuracy validation. |

## Hair Studio

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| HAI-01 | Natural and artistic live hair recoloring from segmentation | Implemented but unverified | Product pass copper/balayage preview + genuine hair-mask report; physical live motion quality pending |
| HAI-02 | Luminance/texture-preserving compositing and feathered hairline | Implemented but unverified | Actual luminance-preserving hair composite/feathering code and test evidence; real hairline/matting fidelity unvalidated |
| HAI-03 | Highlights, ombre, balayage and multi-tone gradients | Implemented but unverified | Balayage mode selected in browser; full high/ombre/multi-tone quality unverified |
| HAI-04 | Root-to-tip modes and adjustable strength | Implemented but unverified | Root-tip modes/strength inputs present; all rendering paths not reviewed |
| HAI-05 | Segmentation refinement and temporal stability | In progress | Temporal confidence smoothing implemented; interactive segmentation refinement UI and representative motion stability incomplete |
| HAI-06 | Hair shape/style preview with truthful technology label | Implemented and verified | Genuine synthetic-fixture hairstyle template transfer succeeded: r06-live-001/receipt.json and hash-matched generated-hair.jpg. Explicit AI-generated still-image label; not live AR or validated haircut fidelity. |
| HAI-07 | Generated hairstyle provider adapter and generated-result consent/cost states | Implemented and verified | Local quote/consent/task/result adapter has genuine 2-credit-quoted hair success plus labelled browser contract fixtures; actual billing/retention and public hosted backend remain unverified. |
| HAI-08 | Hairstyle inspiration and personal experiments | Planned | Requires implementation and named evidence |
| HAI-09 | Hair characteristics/preferences and user correction | Implemented and verified | R06 Twin UI edits and reloads self-described hair texture/length/goals and finish with explicit optional memory consent; DIGITAL_TWIN_R06_UI and digital-twin.spec.ts. No inferred biological characteristics. |
| HAI-10 | Haircare routines and product recommendations | Implemented but unverified | Hair-engine care/palette functions and domain tests exist; full personalized haircare UI/recommendation journey incomplete |
| HAI-11 | Hair/makeup/outfit color harmony | In progress | R06 Dressing Room renders current hair, makeup, accessories and light on the shared portrait before manual garment placement. Broader colour/style planning and physical fidelity remain incomplete. |

## Dressing Room

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| FAS-01 | Garment upload and local wardrobe persistence | Implemented and verified | R06 desktop/mobile garment upload, manual placement, no-photo save/reload/restore/delete and shared-source return pass; FASHION_R06. Retained photos require separate explicit consent; not a live fitting engine. |
| FAS-02 | Static-photo garment compositing with explicit technology label | Implemented and verified | product-r01/13 real local composition with explicit static-photo/manual placement label; not sizing/VTO model |
| FAS-03 | Real generative clothing VTO provider workflow if configured | Implemented and verified | Genuine cloth-v4 outputs preserved: initial full_body success altered trousers; corrected upper_body r06-clothing-002 receipt and hash-matched image succeed with trousers preserved on visual review. Not fit/depth validation or a public backend. |
| FAS-04 | Live AR garment preview using appropriate segmentation/pose if implemented | Planned | R06 body/pose inference is real and supports accessory/semantic overlap previews; the garment compositor remains explicitly static. Live clothing draping/fit AR is not implemented. |
| FAS-05 | Outfit assembly, garment comparison and saved complete looks | In progress | R06 actual saved outfit receiver and complete-look restoration verified, including exact study ID/name/colour and shared portrait. Full multi-garment assembly/comparison remains incomplete. |
| FAS-06 | Twelve-season classification with face/hair/eye sample uncertainty | In progress | Actual season heuristic + wardrobe palettes exist; face/hair/eye sampling/coordination not complete across scene |
| FAS-07 | Clothing color matching and fashion inspiration | In progress | Actual ΔE seasonal color rankings and garment recoloring; broader fashion inspiration discovery incomplete |
| FAS-08 | Glasses/earrings/necklaces previews with appropriate anchors | Implemented and verified | R06 actual face/pose anchoring, pixels and Style controls for glasses/earrings/necklace verified in accessories-r06.spec.ts and VISION_R06; geometric image-plane previews, not measured jewellery fit or robust physical motion. |
| FAS-09 | Watches/rings/bracelets previews using hand tracking where appropriate | Implemented and verified | R06 genuine hand/visible pose anchors drive ring/bracelet/watch pixel changes; weak/out-of-frame anchors suppress previews with explicit reasons. Eight scoped desktop/mobile cases; sizing, depth and physical-device reliability unverified. |
| FAS-10 | Bags/hats/shoes preview with truthful constraints | In progress | R06 hat preview uses genuine face/hair silhouette and truthful geometry labels. Bags and shoes remain unimplemented; a seven-accessory implementation does not complete this combined row. |
| FAS-11 | Fashion product matching and coordinated outfit/hair/makeup | In progress | Shared current cosmetics/hair/accessories/light and manual garment rendering, saved outfit IDs and owned-product complete recipes work in R06. Full fashion product matching/style/budget planning remains incomplete. |
| FAS-12 | Expensive generation progress/cancellation/cost/failure states | In progress | Local quote/consent/ceiling/progress/delete/error states have contract/browser tests and genuine clothing polling/output. Provider-side cancellation, actual billing/retention and hosted abuse controls remain unverified. |
| FAS-13 | CatVTON/IDM-VTON/Leffa software/model license research | Implemented and verified | Source notes fashion.md records CatVTON/IDM-VTON/Leffa license/weight constraints; none falsely deployed as commercially cleared |

## Intelligence and routines

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| INT-01 | Sourced ingredient knowledge and INCI parser | Implemented and verified | Actual INCI parser/source-linked cosmetic ingredient notes, 24-test skin/intelligence/API check and browser ingredient lens |
| INT-02 | Ingredient highlight-to-explore contextual lens | Implemented and verified | product-r01/06 ingredient selection opens context/source while preserving product |
| INT-03 | Product/ingredient comparison with evidence and uncertain guidance labels | Implemented but unverified | Actual ingredient/product comparison and user-provided attributed INCI editing work; MERCHANT_R06 distinguishes illustrative subsets/packaging text from full current formulations or proven effects. |
| INT-04 | Explainable matching and recommendation provenance | Implemented but unverified | Actual cosine/profile/owned/budget matching explanations and attributed memory; efficacy/fairness quality not established |
| INT-05 | Product alternatives and affordable dupes with truthful data | In progress | R06 reviewed real offers supplement sample alternatives with exact SKU/source/date; no scientifically validated formulation equivalence or complete affordable-dupe engine. |
| INT-06 | Routine compatibility/usage notes without unsupported scientific claims | Implemented but unverified | Source-linked cosmetic ingredient/usage cautions and routine notes exist; complete formulation/concentration compatibility knowledge limited |
| INT-07 | Budget-aware recommendations including NGN | Implemented and verified | Final independent browser checks at 1440 / 390: unique purchase total NGN 19,300 + remaining 700 within 20,000, sample prices and missing slots disclosed; live offers separate |
| INT-08 | AM/PM routine generation from profile and allowed observations | Implemented and verified | Actual self-report/owned/catalog AM/PM routines and editing work. Genuine skin003 predictions now exist, but automatic use of that genuine result in a personalized routine is not independently verified. |
| INT-09 | Routine editing, completion events and history | Implemented and verified | Actual routine name/step edits persist across reload desktop/mobile; final feature recheck + journal-studio.spec.ts, skin routine completion tests |
| INT-10 | Owned-product prioritization and owned-only recommendations | Implemented but unverified | R06 explicit owned product/INCI edit/delete, owned-first routines and attached owned-product complete looks verified. Recommendation quality across occasions and ingredient efficacy remain unvalidated. |
| INT-11 | Skincare journal, feedback and noncausal progress tracking | In progress | Real local notes/experiments/routine events work; linked outcome/progress intelligence incomplete |

## Beauty commerce

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| COM-01 | Searchable product catalog with category/brand/filter controls | Implemented but unverified | Actual catalog/filter/search controls visible and commerce unit suite passed; all search filters not exercised here |
| COM-02 | Product detail, brand, ingredients and usage information | Implemented and verified | product-r01/06 actual product detail/brand/ingredient subset/use context; sample data disclosed |
| COM-03 | Variant and shade selection; shade try-on link to mirror | Implemented and verified | R06 six desktop/mobile commerce cases verify exact variant selection, mirror shade control handoff and variant/size/currency/source-separated persistent bag; physical shade matching remains illustrative. |
| COM-04 | Prices with provenance, currency and freshness | Implemented and verified | R06 genuine Nuban NGN and BOJ/Ordinary USD offers carry exact SKU/source/fetch/expiry metadata; sample prices remain separate. Imported/future prices cannot become fresh verified quotes; technical-r06 regressions pass. |
| COM-05 | Verified price comparison/local availability only when sources exist | In progress | MERCHANT_R06 and genuine live-contract/live-browser receipts verify four reviewed official pages, including Nuban Nigeria NGN prices/explicit stock. This is narrow dated source observation, not broad local stock coverage or complete cross-merchant comparison. |
| COM-06 | Clearly labelled sample catalog/illustrative prices | Implemented and verified | product-r01 screenshots visibly label catalog/ingredient subsets/prices as sample |
| COM-07 | Local owned products and beauty inventory | Implemented and verified | R06 real user-owned product/INCI form supports attributed label text, edit and delete; no prices or ownership invented. Six commerce browser cases plus local domain tests. |
| COM-08 | Wishlist and persistent shopping bag | Implemented but unverified | R06 persistent bag supports exact shade/size/currency/source identity, quantity/removal and separate totals, including genuine offers. Full wishlist browsing remains unverified; do not promote combined row from bag tests alone. |
| COM-09 | Shoppable complete looks | In progress | R06 complete-look recipes persist actual owned-product references and saved outfits. No verified full-look merchant purchase/checkout, live stock reservation or order creation. |
| COM-10 | Currency support including NGN and budget planning | Implemented and verified | R06 real Nuban NGN and BOJ USD source offers coexist in separate-currency bag totals; no exchange conversion invented. Sample budgets and genuine quotes remain distinct. |
| COM-11 | Verified external merchant handoff; no invented orders/payment success | Implemented but unverified | R06 registry resolves only four audited canonical HTTPS product pages, fetched genuinely and linked from source observations. No payment/order success; final checkout and broad merchant handoff coverage remain unverified. |

## Agent tools

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| AGT-01 | Contextual tool-using assistant throughout application | Implemented and verified | product-r01/17 contextual agent performs3 actual tools, not prose-only chat |
| AGT-02 | Runtime-validated tool contracts and explicit results/failures | Implemented but unverified | R06 validated native tool loop executes actual local feedback; receipt proves setLipColor/setHairColor, not every requested advanced tool. Runtime and consent/failure fixtures remain separate evidence. |
| AGT-03 | Local deterministic interpretation and useful offline operation | Implemented and verified | Actual local command planner applies scene/builds routine/finds options; scope clearly disclosed |
| AGT-04 | LLM provider adapter and approved context transmission | Implemented and verified | r06-claude-live-001 receipt: genuine native Claude Haiku 4.5, three model turns and two actual colour actions after review, contextCategories=[]; no images/history transmitted. Selected personal-context cases, compatible endpoints and actual billing remain unverified. |
| AGT-05 | analyzeSkin / inspectCurrentLook tools | In progress | Actual inspectCurrentLook works; analyzeSkin remains an explicit consent/review handoff without a verified genuine agent-triggered analysis. Standalone skin003 success does not establish that tool orchestration. |
| AGT-06 | applyMakeup / adjustMakeupLayer / setLipColor tools | Implemented but unverified | Actual preset/color tools exercised; all detailed layer tool paths unverified |
| AGT-07 | setHairColor / previewHairstyle tools | In progress | setHairColor has genuine Claude action evidence; standalone provider hairstyle generation also succeeds. The named previewHairstyle agent tool/orchestration remains absent; do not conflate engine availability with tool coverage. |
| AGT-08 | previewClothing / previewAccessory tools | In progress | previewAccessory schema/controller now supports seven geometric projections; actual clothing engine succeeds separately. Named previewClothing agent generation orchestration remains incomplete. |
| AGT-09 | compareLooks / extractInspirationLook / generateLook tools | Planned | R06 local image-derived Look Remix and saved-look UI comparison work; openRemix is a real agent navigation handoff. Named compareLooks/extractInspirationLook/generateLook tool set remains unimplemented. |
| AGT-10 | findProduct / compareIngredients / findAffordableAlternatives tools | In progress | Actual findProduct now total-budget/profile/cosine-ranked; compareIngredients/full alternative tool interfaces not all implemented |
| AGT-11 | buildSkincareRoutine / inspectBeautyWardrobe / recommendOwnedProducts tools | Implemented but unverified | Routine/owned product tool schemas and local executor tests; all natural-language/profile combinations not validated |
| AGT-12 | saveLook / trackRoutine / compareSkinHistory tools | In progress | Actual save/reload/routine completion and skin history interfaces; complete comparison/history tool coverage incomplete |
| AGT-13 | explainRecommendation tool with actual supporting records | Implemented but unverified | Actual attributed preference/source explanations and local matching rules; full recommendation evidence retrieval cases incomplete |
| AGT-14 | rememberPreference / reviseMemory / forgetMemory tools | Implemented and verified | Runtime-validated remember/revise/forget tools and UI correction/use/deletion tests; independent revoke/history regressions pass |
| AGT-15 | Voice interaction where browser supports with text alternative | Implemented but unverified | Browser SpeechRecognition input with explicit external-service disclosure and typed alternative; actual audio/browser support not verified |
| AGT-16 | Wedding soft-glam/dry-skin/NGN20,000 coordinated journey | In progress | Local wedding request and combined sample budget work; R06 Twin adds manual saved occasion recipes. Genuine Claude receipt proves two colour tools only, not the complete requested occasion/tool/save journey. |

## BeautyGraph

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| MEM-01 | Typed nodes/relationships instead of transcript-only memory | Implemented but unverified | Typed graph package and 26-test memory/database/runtime suite; full browser workflow pending |
| MEM-02 | Profile/episodic/preference/outcome memory | In progress | Typed nodes and retrieval exist; complete memory-specific workflows still pending |
| MEM-03 | Procedural/contextual/evidence/consent memory | In progress | Node kinds declared; full procedural/contextual/evidence/consent behavior not all established |
| MEM-04 | Node source/confidence/evidence/consent/retention/timestamps | Implemented but unverified | MemoryNode contract contains required attribution/consent/retention fields; browser evidence pending |
| MEM-05 | Temporal validity and revision/supersession history | Implemented but unverified | Revision/supersession tests in 26-test targeted suite; UI unverified |
| MEM-06 | Approved memory extraction and duplicate detection | In progress | Explicit remember command/dedup tests pass; broad approved extraction not established |
| MEM-07 | Contradiction resolution and preference updates | Implemented but unverified | Supersession/correction tests pass; full preference UX pending |
| MEM-08 | Confidence-aware/temporal/context retrieval | Implemented but unverified | Temporal/confidence retrieval tested; cross-session UI evidence pending |
| MEM-09 | Memory correction/deletion and recommendation source attribution | Implemented and verified | Memory correction/forget/revoke source attribution independently tested technical-r02 + browser memory-agent.spec.ts; no clinical efficacy inference |
| MEM-10 | User memory inspector and category enable/disable controls | Implemented and verified | Product-r01/15/16 memory inspector + opt-in category control + source/confidence/retention visible; deeper retention gate separate |
| MEM-11 | Retention configuration and expiration enforcement | Implemented but unverified | 30/90-day retention fields, explicit purge and expiry tests; long-lived browser enforcement/product policy UX not fully verified |
| MEM-12 | Local embeddings/hybrid search experiment if justified | Planned | Requires implementation and named evidence |
| MEM-13 | Ask why/liked-last-month/what-changed/forget-last-scan/owned-only from real records | In progress | Why/forget-last-scan/owned-only deterministic actions exist; liked-last-month/what-changed temporal query breadth incomplete |

## Local database and privacy

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| DAT-01 | Versioned Dexie schema with migrations and typed indexes | Implemented and verified | R06 independent real Dexie/fake-indexeddb full historical v2→v3 migration verifies canonical bag tuples and preserves profile/revoked consent; 20 adversarial tests pass. Real-browser interrupted/quota migrations remain separate. |
| DAT-02 | Reactive live queries and cross-tab consistency | In progress | Reactive UI works and multi-tab race fixes covered by privacy regression tests; broad cross-tab conflict UX remains unverified |
| DAT-03 | Transactional writes and explicit deletion semantics | Implemented and verified | R06 independent Twin consent rollback/revocation, graph/prose deletion, malformed import atomicity and load-vs-clear race tests pass; no claim of every race or production storage failure. |
| DAT-04 | profiles/consents/skinScans/skinObservations tables | Implemented but unverified | Required tables declared; actual complete scan/observation workflow pending |
| DAT-05 | savedLooks/makeupPresets/hairPresets/outfits tables | Implemented but unverified | Required tables declared; preset/outfit usage not all verified |
| DAT-06 | products/productVariants/ownedProducts/wishlists/shoppingBags tables | In progress | R06 actual owned-product/variant/source-aware bag persistence and user INCI edit/delete verified. Wishlist and all table workflows are not completed by those cases. |
| DAT-07 | routines/routineEvents/journalEntries/goals/beautyExperiments/userFeedback tables | Implemented but unverified | Required tables declared; complete experiments/feedback journey pending |
| DAT-08 | memoryNodes/memoryEdges/agentEpisodes/agentMessages/agentToolRuns tables | Implemented but unverified | Required graph/episode/tool tables declared and unit tested; UI workflow pending |
| DAT-09 | recommendations/priceSnapshots/mediaAssets/settings tables | In progress | R06 actual merchant snapshots, Twin settings and retained-media consent paths operate. All recommendation/media lifecycle usage remains incompletely verified. |
| DAT-10 | Import/export with validation and recovery | Implemented and verified | R06 import rekeys canonical bag tuples, downgrades imported quotes and exports projected image-free Twin metadata; malformed nested records/image-object attacks and atomicity regressions pass in technical-r06. |
| DAT-11 | Quota handling and storage recovery | In progress | Quota-aware media error path and useful local failure message exist; full storage failure/recovery simulation not verified |
| DAT-12 | Image/blob lifecycle; no implicit camera persistence or facial embeddings | Implemented but unverified | Session image URLs now shared/released, explicit photo storage and local backup exclusion; long-run blob/frame lifetime unverified |
| DAT-13 | Individual-record deletion and clear-all-local-data | Implemented and verified | R06 complete-look deletion removes linked Look memory/revisions/prose while preserving another look shared product/outfit graph; concurrent clear returns valid snapshot or actionable error. Earlier record/clear browser evidence retained. |
| DAT-14 | Optional passphrase backup with genuine key management | Implemented but unverified | Genuine PBKDF2/AES-GCM passphrase backup unit tests and UI exist; comprehensive browser encrypted roundtrip not independently reviewed |
| DAT-15 | No credentials in client/env-public/IndexedDB; no implicit auth/recognition | Implemented but unverified | No client API secrets/identity in reviewed boundary, explicit server env and technical review; comprehensive final bundle/remote auth audit not claimed |
| DAT-16 | Origin storage limitations and no false cross-device sync promises | Implemented and verified | product-r01/15 privacy UI explicitly explains origin-scoped unencrypted storage and no cross-device sync |

## Secure provider boundary

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| API-01 | Server-only credentials and strict input/schema validation | Implemented but unverified | Server-only native/provider credentials and fixed-schema boundaries exercised locally, including genuine Claude and YouCam tasks. Public R05 is static; production hosting/multi-instance security remains unverified. |
| API-02 | Explicit image/history transmission consent enforcement | Implemented but unverified | Genuine operator-authorized synthetic image tasks and explicit Claude nonpersonal-text review recorded; selected private-history transmission remains contract-tested only. Public R05 has no provider backend. |
| API-03 | Paid cost approval, hard usage/spending limits and abuse prevention | Implemented but unverified | Quoted genuine YouCam and Claude runs use conservative local reservations; billingVerified=false in receipts. EDGE_R06 atomic D1 voucher proof is local workerd only, not integrated provider hosting or a distributed production ledger. |
| API-04 | Temporary image retention/cleanup and task lifecycle polling | Implemented but unverified | Genuine local polling/proxied generated images and bounded task/result buffers operate; provider-side retention/deletion and hosted lifecycle persistence remain unverified. Current docs disclose up to30-day media policy. |
| API-05 | Provider error reporting, timeout/cancellation/recovery | Implemented but unverified | Genuine error_src_face_too_small is sanitized and actionable; a separately authorized framed skin003 succeeds without automatic retry. Timeout/cancel/provider-side deletion remain separately fixture-tested or unverified. |
| API-06 | Actual endpoint/schema verification from current official docs | Implemented and verified | Official Perfect Corp current endpoints/schemas reviewed, corrections and citations recorded SOURCE_INTEGRATION_MATRIX/API_CONTRACTS; live operation separate |
| API-07 | Unconfigured provider capability state with useful local fallback | Implemented and verified | Unconfigured public R05 remains local-only; configured working-tree API enables reviewed operations and truthful failures. Local Mirror/Remix/Twin/routines/agent remain available without remote providers. |

## Differentiators and exploration

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| DIF-01 | Editable Beauty Digital Twin of cosmetic preferences/observations | Implemented and verified | DIGITAL_TWIN_R06_UI and technical-r06: editable self-reported cosmetic preferences, actual owned-product/outfit complete recipes, save/reload/reopen/delete/export and optional consented graph links. Not a biometric or physically complete body model. |
| DIF-02 | Look Remix from user inspiration into editable interpretation | Implemented and verified | LOOK_REMIX_R06: actual source-image regional colour extraction, correction, real target render/apply/return, no-face/model-failure palette-only fallback and eight desktop/mobile cases. Not product identification, reverse rendering or generative style reconstruction. |
| DIF-03 | Beauty Wardrobe Intelligence using owned products | Implemented and verified | R06 owned INCI/inventory edit/delete, owned-prioritized routines and saved complete-look links/occasion restoration verified; this bounded wardrobe workflow does not validate recommendation efficacy or all occasion intelligence. |
| DIF-04 | Beauty Memory personalization from permitted evidence | Implemented and verified | Consented saved matte preference actually changes agent-applied look and remains inspectable/correctable/deletable |
| DIF-05 | Visual spatial canvas: photos/colors/garments/products/annotations/looks | In progress | Actual spatial photos/palettes/products/notes board supports drag/keyboard/persistence; garment/generated-look object integration incomplete |
| DIF-06 | Intelligent experiments with subjective outcomes and no causal overclaim | In progress | Personal experiment records/check-in notes and noncausal disclaimer exist; linked comparative outcome intelligence incomplete |
| DIF-07 | Complete-look color/style/budget coordination | In progress | R06 shared static cosmetics/hair/accessories/light + garment scene and saved owned-product/outfit recipes work. Complete fashion/colour/style/budget optimization and physical realism remain incomplete. |
| DIF-08 | Conversational mirror control with actual state changes | Implemented and verified | Actual natural-language local tools change mirror lip/hair/preset/accessory state; scope honestly limited to supported commands |
| DIF-09 | Interactive 3D product viewer with keyboard alternatives | Implemented and verified | Real Three.js/R3F generic packaging viewer: pointer/touch/keyboard/context-loss evidence product-viewer/report.json; keyboard independently rechecked both viewports in axe-final.json |
| DIF-10 | Visual look/routine timeline and AI style board | In progress | Saved recipes/journal/routine history and manual style board exist; full visual temporal timeline/AI-assembled board incomplete |

## Experience and access

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| UX-01 | Home personal overview and recent activity | In progress | Studio is immediate entry; full personalized overview/recent-home space incomplete |
| UX-02 | Connected Mirror/Skin/Makeup/Hair/Dressing spaces | Implemented but unverified | All local space surfaces reachable; provider/gen workflow continuity incomplete |
| UX-03 | Connected Wardrobe/Intelligence/Shop/Journal spaces | Implemented and verified | Product-r01 actual wardrobe/discovery/ingredients/journal routes and local product state tested |
| UX-04 | Progressive contextual navigation rather than eleven equal tabs | Implemented and verified | Four main destinations + contextual rail/menu; mobile navigation exercised through six spaces |
| UX-05 | Original premium imagery/type/hierarchy/spacing/material decisions | Implemented but unverified | Original design/imagery/typographic hierarchy inspected by independent visual critics; latest independent visual-r05 score8.4 remains below9 |
| UX-06 | Mobile/tablet/desktop responsive layouts and ≥44px touch controls | In progress | R06 scoped Style/restore, Remix, Twin and commerce layouts have no documented overflow and sampled 44px actions; all-product >=44px coverage, physical-touch behavior and complete responsive validation remain open. |
| UX-07 | Accessible names, focus/keyboard flow and screen-reader status | In progress | R06 scoped Twin/Validation/Style scans pass automated checks and keyboard regressions; Remix comparison retains an incomplete image-background check. Earlier full-app scans and physical screen-reader coverage remain separate, not inferred passed. |
| UX-08 | Reduced motion and continuity-preserving transitions | Implemented but unverified | Reduced-motion CSS and feedback transitions present; comprehensive reduced-motion/continuity interaction tests not run |
| UX-09 | Loading/empty/error/offline states that truthfully describe operations | Implemented but unverified | Actual loading/empty/camera-denied/provider-unavailable states truthful; complete production offline/error variants not verified |

## Verification and quality

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| QA-01 | Vitest algorithm/contract/database/migration tests | In progress | R06 independent 20 adversarial Twin/migration/import tests,44 vision/body/pose/material domain tests and17 Remix fixtures pass in named reports; these scoped counts are not a deduplicated full-suite total or full coverage. |
| QA-02 | React Testing Library state and consent tests | Planned | Requires implementation and named evidence |
| QA-03 | Playwright real browser interaction and E2E suites | Implemented but unverified | Actual local E2E suites and independent 6-test modal focus/save regression pass; latest whole-suite result principal-owned |
| QA-04 | TypeScript and ESLint checks | Implemented but unverified | Typecheck/lint/build scripts exist and principal reruns checks; exact latest final outputs belong QUALITY_REPORT, not inferred here |
| QA-05 | Landmark/hair-mask/hand-gesture/scene-sync test evidence | In progress | VISION_REPORT unit/static/worker fixtures; physical stability/hand accuracy/occlusion not validated |
| QA-06 | Camera denial/device switch/GPU loss/snapshot/mask-alignment evidence | In progress | R06 nine controlled camera lifecycle checks plus actual body/pose/accessory and optional-failure UI evidence; physical switching/rotation, moving-mask alignment and broad device/GPU-loss behavior remain unverified. |
| QA-07 | Provider malformed/missing-field/parsing tests | Implemented but unverified | Malformed/missing-field generation, skin and native reasoning contracts plus genuine skin003 four-field parsing and skin002 error-code mapping verified. Other concern families/provider variations remain unverified. |
| QA-08 | Recommendation/user-correction/tool/memory/consent/cost/offline tests | In progress | 26 memory/agent/database +24 skin/API tests passing; complete offline/cost/history browser matrix pending |
| QA-09 | Product selection/routine/history/shopping/export/deletion tests | In progress | R06 Twin composer/archive/outfit receiver and six commerce browser cases exercise actual selection, owned inventory, exact bag identity, export and deletion; full product journey coverage still separate. |
| QA-10 | No secret leak/unauthorized upload/hidden retention/untrusted output tests | In progress | R06 independent image-export projection, imported-price freshness, consent races and graph/prose deletion regressions pass; no comprehensive deployment/retention/prompt-injection security certification. |
| QA-11 | Desktop/mobile screenshots and interaction recordings | Implemented and verified | Real desktop/mobile screenshots/recordings r01/r02/r03, independent visual/technical captures, final 26-state accessibility evidence |
| QA-12 | Chrome/Firefox/WebKit compatibility where executable | In progress | R05 targeted Chromium/Firefox/WebKit material/compatibility artifacts exist. R06 body/pose, Remix, Twin and commerce evidence is scoped Chromium/mobile emulation; full cross-browser/new-model parity remains unverified. |
| QA-13 | Real/throttled device performance: FPS/frame percentiles/inference/resolution/hardware | In progress | VALIDATION_R06 exports actual hardware/browser/resolution/inference/render distributions, plus VISION_R06 body/pose cadence. SwiftShader and static canvas streams are not physical 30/60 FPS or representative-device proof. |
| QA-14 | Lazy models, controlled bundles and no persistent frame leaks | In progress | Lazy actual models/OpenCV and dirty rendering implemented; idle viewer draws 0 in report; full-app bundle/multi-hour allocation/leak target still unverified |
| QA-15 | Independent visual/technical/product critics; security/fairness review | In progress | Independent technical/visual/product rounds and R06 safety/rights/coverage tooling exist. Coverage arithmetic and model-card fairness statements do not validate representative-person fairness. |
| QA-16 | Weighted rubric ≥9.0 and mandatory no-high-defect/all-engines gates | In progress | No passing >=9 weighted score: four remote families now execute genuinely through the local service, but broader concern/overlay/history, advanced tools/materials/garment scope, physical performance/fairness, public backend and distribution clearance remain incomplete. |
| QA-17 | Cook checkpoint rounds, exact remaining work and resumable next task | In progress | Cook briefs/references/screenshots/critic reports/run evidence maintained; exact final checkpoint/remaining-work principal-owned |

## Required end-to-end journeys

| Journey | Required outcome | Status | Evidence |
|---|---|---|---|
| A | First visit, no login and functional labelled demo | Implemented and verified | product-r01 desktop/mobile actual no-login functional demo |
| B | Live face tracking, makeup/hair edit, save result | Implemented but unverified | Static portrait edit/save works; physical camera unavailable |
| C | Reliable supported hand gesture and equivalent control | Implemented but unverified | VISION_REPORT unit/worker fixtures; real gesture behavior unverified |
| D | Consented real provider skin result and approved history | Implemented and verified | r06-skin-ui-002: actual browser framing, exact nine-credit quote/upload consent, one genuine task/four dynamic predictions, explicit history save, reload persistence and deletion; no photos/image refs retained. Synthetic execution fixture, not clinical/fairness or longitudinal accuracy validation. |
| E | Explainable editable routine and completion tracking | Implemented and verified | Actual self-reported budget routine generation/edit/save/reload/completion desktop/mobile; genuine provider-to-routine recommendation integration remains unverified. |
| F | Real or labelled demo VTO with coordinated colors/makeup | Implemented and verified | R06 labelled static scene coordinates actual makeup/hair/light with manual garment; genuine upper_body clothing generation separately succeeds (r06-clothing-002). No fit/drape/physical live-AR validation. |
| G | Ingredients/comparison/alternatives and persistent collection | Implemented and verified | Actual ingredient lens/comparison/alternatives and persistent owned collection; R06 adds user-attributed INCI and bounded genuine merchant offers while illustrative catalogue data remains labelled sample. |
| H | Natural-language full look via actual tools and requested save | In progress | Local validated look/routine/budget tools and genuine native Claude two-colour action loop work; manual Twin complete recipes exist. Full natural-language occasion generation/tool scope and requested complete-save artifact remain incomplete. |
| I | Persisted permitted memory retrieval, inspect/correct/delete | Implemented and verified | Consented preference save/correct/use/forget/revisit browser tests and independent privacy regressions; all memory types separate |
| J | Offline saved looks/inventory/routines/history | Implemented but unverified | Production service worker path and offline tests exist; latest whole offline suite principal-owned; not inferred from development server |

Total initial capability rows: 219, plus 10 end-to-end journey gates. Row count measures inventory detail, not completion or quality.

## Evidence reconciliation checkpoint

Updated 2026-11-02 for round 06 reports, scoped browser/domain checks and genuine local provider receipts through skin003. All **219 original capability rows** and **10 journey gates** remain in this file. Counts describe grouped inventory statuses, not a completion percentage or quality score. A partially implemented grouped requirement stays In progress even when one constituent has a passing test.

- Implemented and verified: 67 capability rows.
- Implemented but unverified: 67 capability rows.
- In progress: 76 capability rows.
- Planned: 6 capability rows.
- Blocked with evidence: 3 capability rows.

Genuine local skin/hair/clothing/Claude execution, body/pose with seven geometric accessories, local image-derived Remix, user-authored Twin recipes and bounded merchant/variant commerce have named R06 evidence. Concern masks/unrequested concerns, advanced agent/garment/material scopes, representative fairness and physical devices remain incomplete. The public R05 Site still has no provider backend, and overall distribution clearance remains blocked. The original >=9.0 full-product threshold is not declared passed.
