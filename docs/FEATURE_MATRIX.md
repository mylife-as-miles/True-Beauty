# Complete feature inventory

This is the full-scope backlog from the creator’s directive. Nothing is removed because an implementation is difficult. Status is conservative: only a named test, browser capture or live-provider evidence may promote an item to **Implemented and verified**. Code present without integration evidence is **Implemented but unverified**. A category row can be split when only part is implemented; do not mark an entire combined capability verified from a partial test.

Allowed statuses: **Implemented and verified** · **Implemented but unverified** · **In progress** · **Planned** · **Blocked with evidence**.

Initial inventory date: 2026-11-02. Review this table against current code and the latest quality report after each round. Initial statuses are Planned rather than guesses about concurrent work.

## Foundation

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| ARC-01 | No-login desktop/mobile React TypeScript Vite application | Implemented and verified | Product Critic r01: actual no-login Chromium desktop1440 / mobile 390 app, six spaces; more browsers unverified |
| ARC-02 | Tailwind custom design system; typed engine boundaries; Zod runtime validation | In progress | React/Tailwind and runtime contracts exist; every engine boundary not independently audited |
| ARC-03 | Modular monorepo frontend/API/packages organization | Implemented and verified | apps/web, apps/api and modular packages inspected in working tree; contracts completion separately tracked |
| ARC-04 | Local-first core independent of remote providers | Implemented but unverified | Local demo/agent/data function without paid provider; complete offline journey not reviewed here |
| ARC-05 | WebGL 2 baseline and graceful Canvas fallback | Implemented but unverified | Real WebGL/Canvas renderer code + portrait screenshots; context-loss/mobile GPU evidence incomplete |
| ARC-06 | Three.js / React Three Fiber where useful; measured WebGPU experiments | In progress | Actual Three.js/R3F product viewer verified in browser; WebGPU experiment remains planned |
| ARC-07 | Workers / OffscreenCanvas / WASM performance experiments | In progress | VISION_REPORT real inference worker/bitmap experiment; OffscreenCanvas/WebGPU not all established |
| ARC-08 | Offline app shell and local records access | Implemented but unverified | Production generated service-worker precache and offline E2E exist; latest whole production offline result principal-owned |
| ARC-09 | Error boundaries, operational status and recoverable failure UI | In progress | Camera unavailable recovery and provider unavailable state verified in product-r01; full recovery cases pending |

## Provenance

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| SRC-01 | OpenMakeupSDK real tracking / mesh / GLSL / materials / patterns / morph source integration | Implemented but unverified | Actual adapted GLSL/makeup code in packages + source-notes/openmakeup; full fidelity/asset audit pending |
| SRC-02 | virtual-makeup real camera / MediaPipe / hair / OpenCV / geometry / palette integration | In progress | Actual geometry/camera/hair adaptation + VISION_REPORT; OpenCV integration/standalone license gap separate |
| SRC-03 | SKIN_AI real Perfect Corp / color analysis / matching / routine / VTO adaptation | In progress | MIT algorithm/API adaptations and source-notes/skin-ai; actual provider/VTO workflow unverified |
| SRC-04 | Skyn real capture / preprocessing / tone / clustering / ML / cosine adaptation with uncertainty | In progress | Tone/preprocessing/recommendation adaptation; legacy classifier/dataset not deployed; scientific validation pending |
| SRC-05 | Source integration matrix: SHA, paths, destination, modification, operations, tests, licenses | Implemented and verified | SOURCE_INTEGRATION_MATRIX pins four SHAs, studied/reused paths, destinations, improvements, evidence and license gaps; independently inspected |
| SRC-06 | Independent model weights, datasets, textures, font and photographic asset audit | In progress | VISION_REPORT model-card/commercial distribution clearance remains unverified |
| SRC-07 | Preserved copyright and license notices | In progress | MIT/OFL notices retained at documented package paths; missing upstream standalone notice/model redistribution rights remain unresolved |
| SRC-08 | Proofline and Common Table interaction study with restricted reuse boundaries | Implemented and verified | Source/doc/license study pinned in DESIGN_RESEARCH; no source app runtime claim |
| SRC-09 | Taste Skill/Cook read and compatible installation | Implemented and verified | Taste/Cook current instructions read; non-overwriting Codex installation; draw seed 890544161 |
| SRC-10 | Current official YouCam API documentation and skills review | Implemented but unverified | Official skills/docs current workflow researched by API owner; live provider unverified |

## Living Mirror

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| MIR-01 | Camera activation with explicit permission | Implemented but unverified | Explicit camera action exercised; no physical device available; VISION_REPORT lifecycle fixtures pass |
| MIR-02 | Supplied labelled demo portrait without camera permission | Implemented and verified | product-r01/01-desktop-studio + mobile-studio: actual no-permission demo with real portrait inference |
| MIR-03 | User photograph upload and image-based preview | Implemented and verified | Actual neutral/portrait upload and queued model checks technical-r03; final feature recheck confirms session upload remains available across spaces |
| MIR-04 | Live webcam preview with movement-aligned makeup | Implemented but unverified | Real VIDEO-mode worker executes on canvas MediaStream fixture; physical live makeup alignment unverified |
| MIR-05 | Camera switching and cleanup on navigation/unmount | Implemented but unverified | Actual delayed-permission/unmount and canvas-stream switch/stop tests technical-r02/r03 pass; physical hardware remains unverified |
| MIR-06 | Camera denial, backgrounding, rotation and recovery | In progress | Denial/background/late-stream/unmount fixture checks pass; real device rotation/permission lifecycle unverified |
| MIR-07 | Before/after draggable split and comparable saved transformations | Implemented and verified | Actual split alignment under crop/zoom/resize technical-r02; saved two-look replay captured r03 and tested journal-studio.spec.ts |
| MIR-08 | Zoom to facial region and contextual face-region controls | In progress | Actual zoom/reset and named layer controls work; complete direct facial-region exploration not fully verified |
| MIR-09 | Skin-analysis overlays with contextual explanation | Blocked with evidence | Local color ROI map exists; meaningful provider skin-concern overlays require genuine configured provider results |
| MIR-10 | Complete-look switching and scene continuity | In progress | Session demo and uploaded Blob now shared Mirror→Skin→Mirror, independently checked feature-final-recheck.json; full outfit/product scene composition remains incomplete |
| MIR-11 | Save look and optional photo with separate storage consent | In progress | Named control recipe survives reload; no-photo save truthful; optional photo storage full workflow not verified |
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
| VIS-06 | Occlusion handling; glasses/partial-face support where possible | In progress | No-face handling and basic masks exist; glasses/partial occlusion robustness not validated |
| VIS-07 | Single coordinated frame scheduler / shared scene state | Implemented and verified | VISION_REPORT actual worker/video scheduler fixture; real app scene integration visible in product-r01 |
| VIS-08 | Inference separated from rendering; adaptive inference cadence | Implemented and verified | VISION_REPORT worker test:270 rAF callbacks vs28 face / 11 hair / 20 hand calls; not 60 predictions/s |
| VIS-09 | Adaptive camera / inference / rendering resolution | In progress | Bounded640 face / 256 hair and adaptive cadence implemented; complete device-resolution policy pending |
| VIS-10 | Hair image segmentation with actual confidence mask | Implemented and verified | VISION_REPORT three real portraits produced nonempty hair confidence masks; boundary quality unvalidated |
| VIS-11 | Hair temporal mask smoothing and motion correspondence experiments | In progress | Temporal mask unit tests pass; optical-flow/motion correspondence remains unimplemented/unverified |
| VIS-12 | Hair-skin feathered boundaries and face/hand occlusion correction | In progress | Real confidence hair mask feathering/temporal smoothing and hand-occlusion work exist; precise matting/skin/hand boundary quality unverified |
| VIS-13 | Hand landmarks/finger positions/tracking confidence | Implemented but unverified | Real hand model executes; some portrait hand detections unlabelled; no actual gesture accuracy claim |
| VIS-14 | Pinch/open palm/swipe/pointing with calibration and debouncing | Implemented but unverified | Unit debounced pinch/geometry tests; calibration/real gesture accuracy not demonstrated |
| VIS-15 | Hand-to-screen coordinate mapping and interaction state machine | Implemented but unverified | Normalized hand geometry/debounced pinch/swipe mapping coded with unit tests; real interaction accuracy/latency unverified |
| VIS-16 | Safe gestures: select color/switch look/move accessory/rotate product/open panel | In progress | Safe pinch/swipe integration exists; principal enabled/active guard fixed; physical end-to-end behavior unverified |
| VIS-17 | No gesture purchase/private transmission/paid operation; standard control equivalents | Implemented but unverified | Standard compare/shade controls exercised; complete gesture/privacy invariants not independently audited |
| VIS-18 | Body/person/garment segmentation provider interfaces and actual implementation research | Planned | Requires implementation and named evidence |

## Makeup Atelier

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| MUP-01 | Structured editable serializable Look Composer | Implemented and verified | Actual structured scene changes and saved/reopened recipe in product-r01 + package contract |
| MUP-02 | Foundation shade matching, coverage and skin-tone-aware compositing | In progress | Foundation layer/coverage controls and tone-aware blend code exist; physical shade matching/complexion fidelity not validated |
| MUP-03 | Lipstick and lip liner; teeth/inner-mouth exclusion | Implemented but unverified | Actual lipstick/liner masks and inner-mouth exclusion in renderer; all expressions/teeth motion and visual quality unverified |
| MUP-04 | Lip gloss with adjustable finish/specular response | Implemented but unverified | Real gloss shader parameters/compilation evidence; software fallback disables reflective finish; hardware realism unverified |
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
| SKN-02 | Explicit image-upload consent and provider task creation | Blocked with evidence | UI/API show no configured Perfect Corp credential/reviewed cost plan; no actual upload task invoked |
| SKN-03 | Real configured provider task polling/result parsing | Blocked with evidence | No genuine provider result available; product-r01/12 explicitly reports not connected |
| SKN-04 | Dynamic supported concerns rather than fixed score count | Implemented but unverified | Dynamic genuine-provider parser with malformed/missing-field fixtures; live real concern payload unavailable |
| SKN-05 | Skin type user profile and validated provider classification where available | In progress | Self-reported type control exists; real provider skin-type classification unavailable |
| SKN-06 | Apparent tone and sRGB/CIELAB color processing | Implemented and verified | product-r01/11 and supplement: actual local sRGB/CIELAB sampling/season suggestion, no clinical type claim |
| SKN-07 | Visible texture and pore appearance observations where provider supports | Blocked with evidence | No configured/live-verified provider concern response; local pixel-color does not measure texture/pores |
| SKN-08 | Wrinkle/fine-line appearance where provider supports | Blocked with evidence | Provider unavailable; no wrinkle/fine-line measurement fabricated |
| SKN-09 | Pigmentation/dark spot/redness appearance where provider supports | Blocked with evidence | Provider unavailable; no pigmentation/redness analysis evidence |
| SKN-10 | Acne-related/dark-circle/hydration appearance where provider supports | Blocked with evidence | Provider unavailable; no acne/dark-circle/hydration appearance evidence |
| SKN-11 | Confidence, limitations, evidence/source and result-class labels | In progress | Heuristic confidence/source/limits labelled; actual provider result explanation awaiting real response |
| SKN-12 | Editable user correction and storage preferences | Implemented but unverified | Color correction/self-report/storage controls present; full correction/history browser coverage pending |
| SKN-13 | Interactive regional skin map with meaningful provider overlays | Blocked with evidence | Local ROI color map is not provider concern overlay; no genuine provider map/result configured |
| SKN-14 | History/progress comparison with standardized light/framing guidance | In progress | Consented local history and provider comparison algorithms/interfaces exist; standardized real longitudinal concern comparison unavailable |
| SKN-15 | Explainable product/routine suggestions using approved observations | In progress | Actual self-report/owned/budget routine explanations work; genuine provider-observation recommendations await provider |
| SKN-16 | No disease diagnosis or selfie-derived clinical Fitzpatrick claim | Implemented and verified | Reviewed UI says rule-based heuristic/not clinical/no phototype; no such inference in tested local flow |
| SKN-17 | Complexion and lighting robustness evaluation with recorded fixtures | In progress | Synthetic deep/light clustering/exposure fixtures pass; representative human complexion/lighting fairness unverified |

## Hair Studio

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| HAI-01 | Natural and artistic live hair recoloring from segmentation | Implemented but unverified | Product pass copper/balayage preview + genuine hair-mask report; physical live motion quality pending |
| HAI-02 | Luminance/texture-preserving compositing and feathered hairline | Implemented but unverified | Actual luminance-preserving hair composite/feathering code and test evidence; real hairline/matting fidelity unvalidated |
| HAI-03 | Highlights, ombre, balayage and multi-tone gradients | Implemented but unverified | Balayage mode selected in browser; full high/ombre/multi-tone quality unverified |
| HAI-04 | Root-to-tip modes and adjustable strength | Implemented but unverified | Root-tip modes/strength inputs present; all rendering paths not reviewed |
| HAI-05 | Segmentation refinement and temporal stability | In progress | Temporal confidence smoothing implemented; interactive segmentation refinement UI and representative motion stability incomplete |
| HAI-06 | Hair shape/style preview with truthful technology label | Blocked with evidence | Hair style/shape generation provider unavailable; hair tint is explicitly a separate preview |
| HAI-07 | Generated hairstyle provider adapter and generated-result consent/cost states | Blocked with evidence | Hair Studio truthfully states generative provider not configured |
| HAI-08 | Hairstyle inspiration and personal experiments | Planned | Requires implementation and named evidence |
| HAI-09 | Hair characteristics/preferences and user correction | In progress | Hair domain preference/characteristic contracts exist; complete editable hair profile workflow not verified |
| HAI-10 | Haircare routines and product recommendations | Implemented but unverified | Hair-engine care/palette functions and domain tests exist; full personalized haircare UI/recommendation journey incomplete |
| HAI-11 | Hair/makeup/outfit color harmony | In progress | Palette/harmony domain functions exist; full live coordinated outfit/makeup/hair plan integration incomplete |

## Dressing Room

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| FAS-01 | Garment upload and local wardrobe persistence | Implemented but unverified | Real portrait/garment upload, local composition and explicit photo-save path; full independent upload/revisit/privacy UI evaluation incomplete |
| FAS-02 | Static-photo garment compositing with explicit technology label | Implemented and verified | product-r01/13 real local composition with explicit static-photo/manual placement label; not sizing/VTO model |
| FAS-03 | Real generative clothing VTO provider workflow if configured | Blocked with evidence | No configured generative fashion provider/live result; static compositor is separate |
| FAS-04 | Live AR garment preview using appropriate segmentation/pose if implemented | Planned | Requires implementation and named evidence |
| FAS-05 | Outfit assembly, garment comparison and saved complete looks | In progress | Local outfit colors/placement/save/restore and board exist; complete multi-garment assembly/comparison integrated scene incomplete |
| FAS-06 | Twelve-season classification with face/hair/eye sample uncertainty | In progress | Actual season heuristic + wardrobe palettes exist; face/hair/eye sampling/coordination not complete across scene |
| FAS-07 | Clothing color matching and fashion inspiration | In progress | Actual ΔE seasonal color rankings and garment recoloring; broader fashion inspiration discovery incomplete |
| FAS-08 | Glasses/earrings/necklaces previews with appropriate anchors | Implemented but unverified | Glasses/earrings toggled on real tracked portrait; necklace/fit/motion correctness not all validated |
| FAS-09 | Watches/rings/bracelets previews using hand tracking where appropriate | Planned | Requires implementation and named evidence |
| FAS-10 | Bags/hats/shoes preview with truthful constraints | Planned | Requires implementation and named evidence |
| FAS-11 | Fashion product matching and coordinated outfit/hair/makeup | In progress | Actual palette harmony/wardrobe static composition; product-linked complete fashion/hair/makeup planning incomplete |
| FAS-12 | Expensive generation progress/cancellation/cost/failure states | In progress | Provider capability/error interfaces exist; no configured expensive fashion generation task/progress/cancel verified |
| FAS-13 | CatVTON/IDM-VTON/Leffa software/model license research | Implemented and verified | Source notes fashion.md records CatVTON/IDM-VTON/Leffa license/weight constraints; none falsely deployed as commercially cleared |

## Intelligence and routines

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| INT-01 | Sourced ingredient knowledge and INCI parser | Implemented and verified | Actual INCI parser/source-linked cosmetic ingredient notes, 24-test skin/intelligence/API check and browser ingredient lens |
| INT-02 | Ingredient highlight-to-explore contextual lens | Implemented and verified | product-r01/06 ingredient selection opens context/source while preserving product |
| INT-03 | Product/ingredient comparison with evidence and uncertain guidance labels | Implemented but unverified | Actual two-product comparison and ingredient lens exercised; evidence completeness/formula effects limited |
| INT-04 | Explainable matching and recommendation provenance | Implemented but unverified | Actual cosine/profile/owned/budget matching explanations and attributed memory; efficacy/fairness quality not established |
| INT-05 | Product alternatives and affordable dupes with truthful data | In progress | Sample lower-price/category alternatives with truthful empty state exist; validated equivalent affordable dupes/real pricing unavailable |
| INT-06 | Routine compatibility/usage notes without unsupported scientific claims | Implemented but unverified | Source-linked cosmetic ingredient/usage cautions and routine notes exist; complete formulation/concentration compatibility knowledge limited |
| INT-07 | Budget-aware recommendations including NGN | Implemented and verified | Final independent browser checks at1440/390: unique purchase total NGN19,300 + remaining700 within20,000, sample prices and missing slots disclosed; live offers separate |
| INT-08 | AM/PM routine generation from profile and allowed observations | Implemented and verified | product-r01/12 + supplement:5actual AM/PM routine slots from current profile/catalog; live analysis not available |
| INT-09 | Routine editing, completion events and history | Implemented and verified | Actual routine name/step edits persist across reload desktop/mobile; final feature recheck + journal-studio.spec.ts, skin routine completion tests |
| INT-10 | Owned-product prioritization and owned-only recommendations | Implemented but unverified | Owned-only constraints/unit algorithms and real wardrobe UI exist; complete owned-products planning quality across occasions still unvalidated |
| INT-11 | Skincare journal, feedback and noncausal progress tracking | In progress | Real local notes/experiments/routine events work; linked outcome/progress intelligence incomplete |

## Beauty commerce

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| COM-01 | Searchable product catalog with category/brand/filter controls | Implemented but unverified | Actual catalog/filter/search controls visible and commerce unit suite passed; all search filters not exercised here |
| COM-02 | Product detail, brand, ingredients and usage information | Implemented and verified | product-r01/06 actual product detail/brand/ingredient subset/use context; sample data disclosed |
| COM-03 | Variant and shade selection; shade try-on link to mirror | In progress | Shade variants/try-on + context-preserving discovery implemented; product-to-face matching remains illustrative |
| COM-04 | Prices with provenance, currency and freshness | Implemented and verified | product-r01 catalog/bag show sample NGN prices and detail provenance/reference date; not live verified merchant price |
| COM-05 | Verified price comparison/local availability only when sources exist | Blocked with evidence | Only sample planning prices; real merchant/local stock feeds absent; no availability fabricated |
| COM-06 | Clearly labelled sample catalog/illustrative prices | Implemented and verified | product-r01 screenshots visibly label catalog/ingredient subsets/prices as sample |
| COM-07 | Local owned products and beauty inventory | Implemented and verified | product-r01 stable results:added cleanser, owned-only wardrobe showed 1 product; no account |
| COM-08 | Wishlist and persistent shopping bag | Implemented but unverified | Actual local bag/owned persistence E2E product.spec.ts; wishlist toggle exists but full wishlist browsing workflow not verified |
| COM-09 | Shoppable complete looks | Planned | Requires implementation and named evidence |
| COM-10 | Currency support including NGN and budget planning | Implemented and verified | Actual NGN/USD illustrative prices, shared total-budget allocator, USD100profile regression technical-r02; no exchange conversion invented |
| COM-11 | Verified external merchant handoff; no invented orders/payment success | Implemented but unverified | Catalog links official brand sites and disclaims stock/payment; final merchant page/availability/checkout not verified |

## Agent tools

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| AGT-01 | Contextual tool-using assistant throughout application | Implemented and verified | product-r01/17 contextual agent performs3 actual tools, not prose-only chat |
| AGT-02 | Runtime-validated tool contracts and explicit results/failures | Implemented but unverified | Tool schemas/unit suites and visible3/3 execution; complete failures/full requested tool set unverified |
| AGT-03 | Local deterministic interpretation and useful offline operation | Implemented and verified | Actual local command planner applies scene/builds routine/finds options; scope clearly disclosed |
| AGT-04 | LLM provider adapter and approved context transmission | In progress | Provider adapter interface exists; no configured external reasoning model or approved transmission exercised |
| AGT-05 | analyzeSkin / inspectCurrentLook tools | In progress | Actual inspectCurrentLook works; analyzeSkin is consent-gated and unavailable without provider |
| AGT-06 | applyMakeup / adjustMakeupLayer / setLipColor tools | Implemented but unverified | Actual preset/color tools exercised; all detailed layer tool paths unverified |
| AGT-07 | setHairColor / previewHairstyle tools | In progress | Actual setHairColor tool operates tint; previewHairstyle generation tool/provider incomplete |
| AGT-08 | previewClothing / previewAccessory tools | In progress | Actual geometric previewAccessory subset; previewClothing tool/generative orchestration incomplete |
| AGT-09 | compareLooks / extractInspirationLook / generateLook tools | Planned | UI saved-look comparison exists; full agent compareLooks/inspiration extraction/generateLook tools not implemented |
| AGT-10 | findProduct / compareIngredients / findAffordableAlternatives tools | In progress | Actual findProduct now total-budget/profile/cosine-ranked; compareIngredients/full alternative tool interfaces not all implemented |
| AGT-11 | buildSkincareRoutine / inspectBeautyWardrobe / recommendOwnedProducts tools | Implemented but unverified | Routine/owned product tool schemas and local executor tests; all natural-language/profile combinations not validated |
| AGT-12 | saveLook / trackRoutine / compareSkinHistory tools | In progress | Actual save/reload/routine completion and skin history interfaces; complete comparison/history tool coverage incomplete |
| AGT-13 | explainRecommendation tool with actual supporting records | Implemented but unverified | Actual attributed preference/source explanations and local matching rules; full recommendation evidence retrieval cases incomplete |
| AGT-14 | rememberPreference / reviseMemory / forgetMemory tools | Implemented and verified | Runtime-validated remember/revise/forget tools and UI correction/use/deletion tests; independent revoke/history regressions pass |
| AGT-15 | Voice interaction where browser supports with text alternative | Implemented but unverified | Browser SpeechRecognition input with explicit external-service disclosure and typed alternative; actual audio/browser support not verified |
| AGT-16 | Wedding soft-glam/dry-skin/NGN20,000 coordinated journey | In progress | Wedding request applies look/routine and combined sample purchase plan NGN19,300 with700remaining; missing lip/eye slots honestly disclosed; full saved occasion plan not complete |

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
| DAT-01 | Versioned Dexie schema with migrations and typed indexes | Implemented but unverified | Versioned Dexie schema + migration test suite; end-to-end upgrade pending |
| DAT-02 | Reactive live queries and cross-tab consistency | In progress | Reactive UI works and multi-tab race fixes covered by privacy regression tests; broad cross-tab conflict UX remains unverified |
| DAT-03 | Transactional writes and explicit deletion semantics | Implemented and verified | Independent consent/write/import/revocation race regressions technical-r02; importer atomicity reproduction fixed; no claim of all conceivable races |
| DAT-04 | profiles/consents/skinScans/skinObservations tables | Implemented but unverified | Required tables declared; actual complete scan/observation workflow pending |
| DAT-05 | savedLooks/makeupPresets/hairPresets/outfits tables | Implemented but unverified | Required tables declared; preset/outfit usage not all verified |
| DAT-06 | products/productVariants/ownedProducts/wishlists/shoppingBags tables | Implemented but unverified | Required tables declared; full commerce UI journey pending |
| DAT-07 | routines/routineEvents/journalEntries/goals/beautyExperiments/userFeedback tables | Implemented but unverified | Required tables declared; complete experiments/feedback journey pending |
| DAT-08 | memoryNodes/memoryEdges/agentEpisodes/agentMessages/agentToolRuns tables | Implemented but unverified | Required graph/episode/tool tables declared and unit tested; UI workflow pending |
| DAT-09 | recommendations/priceSnapshots/mediaAssets/settings tables | Implemented but unverified | Required tables declared; all usage paths not verified |
| DAT-10 | Import/export with validation and recovery | Implemented and verified | Atomic validation + no-consent import/privacy regressions pass; actual export/clear/import E2E memory-agent.spec.ts; photos excluded |
| DAT-11 | Quota handling and storage recovery | In progress | Quota-aware media error path and useful local failure message exist; full storage failure/recovery simulation not verified |
| DAT-12 | Image/blob lifecycle; no implicit camera persistence or facial embeddings | Implemented but unverified | Session image URLs now shared/released, explicit photo storage and local backup exclusion; long-run blob/frame lifetime unverified |
| DAT-13 | Individual-record deletion and clear-all-local-data | Implemented and verified | Real browser export/clear/import and memory correction/forget E2E; independent revoke/import-prose leakage cases closed technical-r02 |
| DAT-14 | Optional passphrase backup with genuine key management | Implemented but unverified | Genuine PBKDF2/AES-GCM passphrase backup unit tests and UI exist; comprehensive browser encrypted roundtrip not independently reviewed |
| DAT-15 | No credentials in client/env-public/IndexedDB; no implicit auth/recognition | Implemented but unverified | No client API secrets/identity in reviewed boundary, explicit server env and technical review; comprehensive final bundle/remote auth audit not claimed |
| DAT-16 | Origin storage limitations and no false cross-device sync promises | Implemented and verified | product-r01/15 privacy UI explicitly explains origin-scoped unencrypted storage and no cross-device sync |

## Secure provider boundary

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| API-01 | Server-only credentials and strict input/schema validation | Implemented but unverified | Fastify validation/CSRF/origin/secret isolation code + API fixtures and technical review; deployment/live credential boundary not exercised |
| API-02 | Explicit image/history transmission consent enforcement | Implemented but unverified | Actual unconfigured state fails closed; request schema requires explicit upload/processing/retention consent; live provider test unavailable |
| API-03 | Paid cost approval, hard usage/spending limits and abuse prevention | Implemented but unverified | Durable conservative single-process credit ledger/one-use quotes + authorization fixtures; no multi-instance or actual billing verification |
| API-04 | Temporary image retention/cleanup and task lifecycle polling | Implemented but unverified | Temporary in-memory tasks expire15minutes and local deletion endpoint; provider retention is disclosed but not independently verified |
| API-05 | Provider error reporting, timeout/cancellation/recovery | Implemented but unverified | Timeout/error/unconfigured paths tested through provider fixtures; actual provider failures/cleanup not live verified |
| API-06 | Actual endpoint/schema verification from current official docs | Implemented and verified | Official Perfect Corp current endpoints/schemas reviewed, corrections and citations recorded SOURCE_INTEGRATION_MATRIX/API_CONTRACTS; live operation separate |
| API-07 | Unconfigured provider capability state with useful local fallback | Implemented and verified | Actual capabilities accurately unavailable; no fake concern scores; real local mirror/colour/routines/agent function without paid service |

## Differentiators and exploration

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| DIF-01 | Editable Beauty Digital Twin of cosmetic preferences/observations | In progress | Editable self-reported beauty profile/appearance preferences exist; complete connected digital-twin object not finished |
| DIF-02 | Look Remix from user inspiration into editable interpretation | Planned | Requires implementation and named evidence |
| DIF-03 | Beauty Wardrobe Intelligence using owned products | In progress | Actual owned-first/owned-only recommendation/routine constraints; complete saved wardrobe-built occasion workflows incomplete |
| DIF-04 | Beauty Memory personalization from permitted evidence | Implemented and verified | Consented saved matte preference actually changes agent-applied look and remains inspectable/correctable/deletable |
| DIF-05 | Visual spatial canvas: photos/colors/garments/products/annotations/looks | In progress | Actual spatial photos/palettes/products/notes board supports drag/keyboard/persistence; garment/generated-look object integration incomplete |
| DIF-06 | Intelligent experiments with subjective outcomes and no causal overclaim | In progress | Personal experiment records/check-in notes and noncausal disclaimer exist; linked comparative outcome intelligence incomplete |
| DIF-07 | Complete-look color/style/budget coordination | In progress | Makeup/hair/accessory controls and constrained total-budget plan work; clothing/full-scene saved occasion coordination incomplete |
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
| UX-05 | Original premium imagery/type/hierarchy/spacing/material decisions | Implemented but unverified | Original design/imagery/typographic hierarchy inspected by independent visual critics; latest visual score7.7 remains below9 |
| UX-06 | Mobile/tablet/desktop responsive layouts and ≥44px touch controls | In progress | 390px routes no document overflow;10 sampled menu/mirror/source/atelier controls now44×44+; all-product touch/access scope not fully verified |
| UX-07 | Accessible names, focus/keyboard flow and screen-reader status | In progress | 26-state axe scan and6 keyboard regression tests planned/final evidence ACCESSIBILITY_REPORT; physical screen-reader and complete access paths unverified |
| UX-08 | Reduced motion and continuity-preserving transitions | Implemented but unverified | Reduced-motion CSS and feedback transitions present; comprehensive reduced-motion/continuity interaction tests not run |
| UX-09 | Loading/empty/error/offline states that truthfully describe operations | Implemented but unverified | Actual loading/empty/camera-denied/provider-unavailable states truthful; complete production offline/error variants not verified |

## Verification and quality

| ID | Capability (all constituents remain required) | Status | Evidence / next verification |
|---|---|---|---|
| QA-01 | Vitest algorithm/contract/database/migration tests | In progress | 65 domain/database/memory/agent/skin/API tests independently rerun; engine+full suite coverage elsewhere |
| QA-02 | React Testing Library state and consent tests | Planned | Requires implementation and named evidence |
| QA-03 | Playwright real browser interaction and E2E suites | Implemented but unverified | Real browser E2E suites + independent modal regression tests; latest whole-suite result principal-owned, not inferred from source |
| QA-04 | TypeScript and ESLint checks | Implemented but unverified | Typecheck/lint/build scripts exist and principal reruns checks; exact latest final outputs belong QUALITY_REPORT, not inferred here |
| QA-05 | Landmark/hair-mask/hand-gesture/scene-sync test evidence | In progress | VISION_REPORT unit/static/worker fixtures; physical stability/hand accuracy/occlusion not validated |
| QA-06 | Camera denial/device switch/GPU loss/snapshot/mask-alignment evidence | In progress | VISION_REPORT: 8lifecycle checks; missing camera browser recovery verified; physical switches/GPU/snapshot all pending |
| QA-07 | Provider malformed/missing-field/parsing tests | Implemented but unverified | 24 skin/intelligence/API tests rerun passing incl provider fixtures; live API result not established |
| QA-08 | Recommendation/user-correction/tool/memory/consent/cost/offline tests | In progress | 26 memory/agent/database +24 skin/API tests passing; complete offline/cost/history browser matrix pending |
| QA-09 | Product selection/routine/history/shopping/export/deletion tests | In progress | Actual product detail/owned/bag/notes/looks/routine generation exercised; full export/delete/edit elsewhere pending |
| QA-10 | No secret leak/unauthorized upload/hidden retention/untrusted output tests | In progress | Independent consent/revocation/race/backup privacy regressions closed technical-r02; complete bundle/retention/untrusted-output audit not exhaustive |
| QA-11 | Desktop/mobile screenshots and interaction recordings | Implemented and verified | Real desktop/mobile screenshots/recordings product-r01,r02,r03 and independent visual/technical captures; paths cited in reviews |
| QA-12 | Chrome/Firefox/WebKit compatibility where executable | In progress | Actual Chromium/mobile and targeted Firefox-final artifacts pass; WebKit/full browser/device parity not established here |
| QA-13 | Real/throttled device performance: FPS/frame percentiles/inference/resolution/hardware | In progress | VISION_REPORT CPU fixture rAF 59.86 explicitly not full-app FPS; real mobile/long-run target unverified |
| QA-14 | Lazy models, controlled bundles and no persistent frame leaks | In progress | Lazy actual models/OpenCV and dirty rendering implemented; idle viewer draws0report; full-app bundle/multi-hour allocation/leak target still unverified |
| QA-15 | Independent visual/technical/product critics; security/fairness review | In progress | Distinct product/technical/visual critic rounds executed; security regression review pass; representative fairness validation remains unverified |
| QA-16 | Weighted rubric ≥9.0 and mandatory no-high-defect/all-engines gates | In progress | Mandatory live skin/generative/fullscope/device/fairness/license gates unresolved; no fabricated passing weighted score |
| QA-17 | Cook checkpoint rounds, exact remaining work and resumable next task | In progress | Cook briefs/references/screenshots/critic reports/run evidence maintained; exact final checkpoint/remaining-work principal-owned |

## Required end-to-end journeys

| Journey | Required outcome | Status | Evidence |
|---|---|---|---|
| A | First visit, no login and functional labelled demo | Implemented and verified | product-r01 desktop/mobile actual no-login functional demo |
| B | Live face tracking, makeup/hair edit, save result | Implemented but unverified | Static portrait edit/save works; physical camera unavailable |
| C | Reliable supported hand gesture and equivalent control | Implemented but unverified | VISION_REPORT unit/worker fixtures; real gesture behavior unverified |
| D | Consented real provider skin result and approved history | Blocked with evidence | Actual UI/API no provider credential/cost plan; no live task result |
| E | Explainable editable routine and completion tracking | Implemented and verified | Actual self-reported budget routine generation/edit/save/reload/completion desktop/mobile; live provider inputs unavailable |
| F | Real or labelled demo VTO with coordinated colors/makeup | In progress | Verified static-photo compositor, generated/live expansions unavailable |
| G | Ingredients/comparison/alternatives and persistent collection | Implemented and verified | product-r01 product detail/ingredient lens/comparison/owned collection; sample data only |
| H | Natural-language full look via actual tools and requested save | In progress | Real tools/memory + combined budget verified; complete occasion artifact/all styling tools not finished |
| I | Persisted permitted memory retrieval, inspect/correct/delete | Implemented and verified | Consented preference save/correct/use/forget/revisit browser tests and independent privacy regressions; all memory types separate |
| J | Offline saved looks/inventory/routines/history | Implemented but unverified | Production service worker path and offline tests exist; latest whole offline suite principal-owned; not inferred from development server |

Total initial capability rows: 219, plus 10 end-to-end journey gates. Row count measures inventory detail, not completion or quality.
