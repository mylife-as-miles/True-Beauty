# True Beauty product specification

Source of authority: the creator's Master Autonomous Engineering & Design Directive, received 2026-11-02. This document preserves the entire product scope in a buildable inventory; implementation phases are dependency order only. A partial implementation must never be presented as the finished product.

## Product and audience

True Beauty is a no-login, local-first browser beauty operating system for desktop and mobile. Its signature is the Living Mirror: a continuous, camera-first surface that connects makeup, hair, cosmetic observations, clothing, accessories, product discovery, routines and a tool-using assistant. It serves self-expression across complexions, genders and cultural styles. Branding and creative assets are original. WEBTOON/drama characters, art, logos and distinctive designs are excluded.

The application must be useful immediately through an honestly labelled demo portrait, user photograph, or explicit camera activation. Basic local features must remain usable without remote services. The finished product requires excellent functionality and visual quality together.

## Architecture constraints

React + TypeScript + Vite frontend; custom Tailwind design system. Shared typed vision/scene contracts; a central scheduled MediaPipe pipeline with face, hair and hand subsystems. WebGL 2 baseline, custom GLSL and suitable Three.js components; WebGPU only after measured benefit. OpenCV.js is retained where real masks/compositing improve results. Workers, OffscreenCanvas and WASM are evaluated for inference, preprocessing and rendering. Dexie + reactive live queries own local persistence. Zod validates external and agent boundaries. A small server isolates all provider credentials and enforces explicit consent, bounded use/cost, retention and task lifecycles. No account creation or auth service.

## Core spaces and continuity

The product includes Home, Living Mirror, Skin Lab, Makeup Atelier, Hair Studio, Dressing Room, Beauty Wardrobe, Beauty Intelligence, Beauty Shop, Beauty Journal and the contextual Beauty Agent. These are grouped progressively rather than eleven equal tabs. Scene, selected products, looks and permitted context persist across spaces. The mirror remains the user's focal object; tools appear near the region or task they affect.

## Engines and expected behavior

### Vision and Living Mirror

One pipeline consumes camera or still image, schedules inference separately from rendering, and shares face landmarks, mesh, transforms, pose, blendshapes, regions and temporally smoothed geometry. It handles detection failure, face occlusion, glasses when possible, image suitability, camera denial, switching, backgrounding, rotation, model failures, GPU context loss and low memory. Inference cadence and resolution adapt to device capacity.

Hair uses real segmentation with stable confidence masks, boundary feathering, temporal smoothing, motion correspondence experiments, hair/skin separation and face/hand occlusion handling. Hair segmentation is never described as skeletal hair tracking. Hands support landmarks, finger positions, confidence, calibration, pinch, open palm, swipe and pointing with mapping/debouncing. Gestures can control safe previews only; accessible controls perform the same work.

The mirror supports live camera, supplied demo, upload, before/after split, region zoom, skin overlays, saved transformations, look switching, accessories and natural-language modifications. Raw frames or face embeddings are not silently persisted.

### Makeup

OpenMakeupSDK and virtual-makeup both make functional source contributions; duplicate tracking is consolidated without dropping useful techniques. Editable structured layers include foundation (shade, coverage, tone-aware blending), lipstick, gloss, liner, blush, contour, bronzer, highlighter, eyeliner, eyeshadow, brows, mascara and lashes. Users adjust colors, opacity and materials, blend multiple layers, use presets and custom palettes, make artistic looks, preview product shades and save/compare complete looks.

GLSL/compositing work covers matte, gloss, specular highlights, glitter, shimmer, reflection, soft shadows, texture preservation, natural blending, color correction, feathered masks and approximate light response. Effects remain anchored to facial geometry, avoid teeth/eyes/hair overlap, and preserve texture. Transparent optional reshaping is separate from cosmetic observations and retouching.

### Skin intelligence

The pipeline guides framing and lighting, checks suitability, requests image-upload consent, invokes an actual configured provider, dynamically parses supported real fields, explains observations and limitations, accepts corrections, suggests products/routines and saves only with retention permission. History comparisons use framing/lighting guidance. Cosmetic appearance categories include skin type/tonal appearance, texture, pore appearance, wrinkles/fine lines, pigmentation/dark spots, redness, acne-related appearance, dark circles and appearance-based hydration concerns only to the extent a validated provider supports them.

The application distinguishes genuine measurements, model predictions, qualitative observations and hypothetical simulation. It does not diagnose disease or infer clinical Fitzpatrick phototype from selfie pixels. Unvalidated legacy classifiers or unclear model/dataset licenses are not shipped as medical analysis. Diversity and lighting testing is a required gate.

### Hair and fashion

Hair supports natural/artistic recoloring, highlights, root-to-tip, ombre, balayage, multi-tone gradients, segmentation refinement, texture-preserving rendering, style inspiration, characteristics/preferences, care routines, recommendations and harmony with makeup/outfits. Realistic hairstyle generation is a provider adapter with generated-result and cost labels.

Dressing Room supports garment upload, wardrobe, outfits, comparison, inspiration, clothing color matching, twelve-season analysis, complete-look coordination and product matching. Accessories include glasses, earrings, necklaces, watches, rings, bracelets, bags, hats and shoes, using appropriate face/hand/body anchors when available. The technology label explicitly distinguishes live AR, static-photo compositing and generative virtual try-on. A static overlay must never be named generative try-on.

### Intelligence and commerce

Ingredient knowledge includes sourced INCI parsing, comparisons, alternatives/dupes, routine compatibility, usage notes, uncertainty and evidence. Matching respects skin preferences, budget and owned products. AM/PM routine planning, editing, completion tracking, journaling, feedback and progress connect back to recommendation explanations.

Commerce supports searchable catalog, product/brand details, variants/shades, ingredients, verified merchant links, price comparison only when sourced, inventory, wishlist, shopping bag, shoppable complete looks, currency/budget planning including NGN, and local availability only when verified. Sample catalog and illustrative pricing are visibly labelled with provenance and freshness. No fake availability, payments, orders, reservations or in-app checkout success. External merchant checkout is acceptable.

### Beauty Agent

The assistant performs actual validated tools on current scene and stored records. Typed tools cover skin analysis, look inspection, makeup application/layer adjustment, lip/hair color, hairstyle/clothing/accessory preview, comparison, inspiration extraction, look generation, product search/alternatives, ingredient comparison, routine planning, owned inventory, save/history/routine tracking, explanations and memory lifecycle. Failed tools return recoverable truthful state. Local deterministic tools are useful without an LLM; remote LLMs use an adapter. Supported browser speech has accessible text alternatives. Private image/history transmission and costly actions require explicit authorization.

### BeautyGraph

BeautyGraph is a typed temporal graph, not a transcript/summary blob. It supports profile, episodic, preference, outcome, procedural, contextual, evidence and consent memories. Nodes/edges carry identity, subject, source, confidence, evidence refs, consent, retention, created/updated/last-used times, temporal validity and revisions. Relationships include PREFERS, AVOIDS, OWNS, TRIED, BELONGS_TO_LOOK, RECOMMENDED_FOR, CONFLICTS_WITH, PART_OF_ROUTINE, OBSERVED_DURING, DERIVED_FROM and SUPERSEDED_BY.

Memory behavior includes approved extraction, duplicate detection, contradiction handling, time/confidence-aware retrieval, correction/deletion, source attribution and recommendation explanations. Users inspect memory, disable categories, configure retention, delete individual or all records, export/import, and optionally use real passphrase-derived encrypted backup. IndexedDB is origin-scoped and not inherently encrypted; no cross-device synchronization is promised without an implemented secure service.

### Persistence and differentiators

Versioned schema/migrations cover profiles, consent, scans/observations, saved looks/presets, outfits, products/variants, inventory/wishlist/bags, routines/events, journals, goals/experiments/feedback, graph nodes/edges, episodes/messages/tool runs, recommendations/prices, media blobs and settings. Indexes, transactions, quota recovery, cross-tab consistency, offline access, blob disposal and deletion semantics are required.

Complete differentiators remain in scope: editable Beauty Digital Twin (preferences and appearance observations, not physically complete body model); Look Remix from user inspiration; owned-product intelligence; consented adaptive memory; visual spatial canvas; noncausal beauty experiments; coordinated full-look/budget intelligence; conversational mirror control.

## Mandatory end-to-end journeys

| Journey | Completion evidence |
|---|---|
| A First visit | No account; immediate functioning labelled demo and navigation |
| B Living Mirror | Real camera tracking, makeup/hair edits and explicitly saved look |
| C Hands | Supported reliable gesture with equivalent standard control |
| D Skin | Explicit consent, actual provider response, interpretable details and approved storage |
| E Routine | Explainable profile-based routine, edits and completion events |
| F Fashion | Actual or clearly labelled demo VTO, garment/color/makeup coordination |
| G Discovery | Ingredient exploration/comparison, alternatives, persistent collection |
| H Agent | Natural-language full look modifies scene through real tools and saves when requested |
| I BeautyGraph | Revisiting retrieval, traceable personalization, inspect/correct/delete |
| J Offline | Saved looks, inventory, routines and permitted history survive network loss |

## Acceptance rubric and hard gates

| Category | Weight |
|---|---:|
| Product functionality/coverage | 15% |
| AR realism/shaders/compositing | 12% |
| Face/hair/hand tracking | 11% |
| UX/design/immersion | 10% |
| Agent intelligence/tool execution | 10% |
| BeautyGraph | 9% |
| Scientific accuracy/transparency | 7% |
| Runtime performance | 8% |
| Reliability/test coverage | 7% |
| Accessibility/responsiveness | 4% |
| Privacy/security | 5% |
| Source integration/provenance | 2% |

Target weighted score ≥9.0/10, with no critical category below 9.0; all mandatory engines operational; all four source contributions real; no unresolved high/critical defects, exposed credentials, fabricated results, pretend calls, misleading medical claims or nonfunctional operational buttons. Real browser interaction and end-to-end tests pass with screenshots/recordings. No mocked test establishes live API verification.

Performance targets are measured, never presumed: approximately 60 FPS on suitable desktop, usable approximately 30 FPS on supported midrange mobile, adaptive resolution/cadence, controlled bundle and lazy models, camera/frame resource stability. Reports record hardware/browser/resolution/FPS/frame-time percentiles/inference latency. Chrome, Firefox and WebKit desktop/mobile layouts are tested where available; unsupported tests remain unverified.

## Autonomous execution and reporting

Research → plan → implement → integrate → run → capture → test → independent critics → score → fix weakest category. Maintain Cook rounds, source matrix, architecture/contracts, feature matrix, memory, decisions, quality and exact remaining work. Distinct visual, technical and product reviews are skeptical and evidence based. Security/fairness specialists review their domains. Do not publish/deploy, spend paid budget, transmit private data or destroy outside-project work without the applicable authorization. A session constraint requires a precise resumable checkpoint, never a false completion claim.
