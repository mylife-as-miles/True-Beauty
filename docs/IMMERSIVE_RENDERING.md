# Living Mirror materials and creative light — round05

The mirror now has functional matte, gloss, shimmer and glitter previews in both backends, plus an optional creative-light treatment. These are cosmetic image previews. They do not reconstruct a physical environment, measure a cosmetic formula, establish a product shade match, or modify an input used for skin analysis.

## Operational contract

`packages/ar-renderer/src/index.ts` exports:

```ts
interface LightingSettings {
  preset: 'neutral' | 'daylight' | 'golden-hour' | 'moonlight';
  intensity: number; // 0..1, validated/clamped at render boundary
  direction: { x: number; y: number }; // -1..1; source x right, y down
}

renderer.render({ source, landmarks, look, hairMask, hands, compare, lighting });
renderer.setQuality('adaptive' | 'high'); // returns actual 'canvas2d' | 'webgl2'
renderer.setResolution(maxSide);        // finite 320..1920 preview bound
renderer.quality;
renderer.mode;                        // same actual current backend as activeMode
renderer.activeMode;
renderer.renderResolution;            // {width, height, maxSide}
```

`LightingSettings`, `LIGHTING_PRESETS`, `DEFAULT_LIGHTING` and `normalizeLighting` are shared exports for the UI. Omitting `lighting` selects neutral; neutral is an exact image-color identity. An intensity of0 also preserves source color under any preset. The intensity still sets an ambient floor for material finish response because the original photograph contains ambient illumination.

Directions are unmirrored source coordinates. A camera UI that mirrors the rendered canvas must reverse display x when mapping a light-position pointer. Light grading and quality are session preview settings, separate from a persisted cosmetic look. The original HTML image/video remains the input to vision and skin workflows.

## Materials

### Actual WebGL2 compositor

The existing OpenMakeupSDK-derived simplex-noise, Fresnel and mask-compositing code remains credited under MIT. New original shader code adds a shared source-to-face basis, separate upper/lower lip surfaces, eyelid surfaces, approximate head depth tilt, directional specular response and a bounded ambient clearcoat component. Source luminance and image detail remain in the pigment composite; the renderer does not blur skin.

- **Matte:** texture-preserving pigment with a small bounded high-light attenuation; this does not claim to remove an actual formula's gloss or retouch skin.
- **Gloss:** directional plus ambient clearcoat lobes on separate lip bodies, preventing the strongest response from being placed inside the mouth cavity. A small source-gradient perturbation preserves photographic lip detail.
- **Shimmer:** fine, softly reflective pearlescent variation from retained simplex material noise and deterministic microfacets.
- **Glitter:** larger sparse embedded pigment facets; their addresses are canonical face/lip coordinates. There are no scene particles, time seeds or animated screen-space sparkles.

The face basis accounts for source aspect, eye distance and roll. Lip facet coordinates additionally follow lip center/width/height; they move and scale with the current landmark geometry. This is an approximate regional2.5D surface, not a registered full nonrigid3D mesh or measured BRDF. Head pose, occlusion and physical material accuracy remain subject to the broader vision-validation backlog.

### Canvas light approximation

Canvas now uses the same per-pixel luminance-preserving pigment rule as GLSL for makeup color. It processes the face region and caches unchanged images/masks, preserving photographic texture. Reflective appearance remains an approximation: masked geometric sheen lobes, deterministic face/lip registered flecks and bounded screen blending follow the shared pigment stage. Every effect is clipped to the shared mask; eyes and mouth holes remain excluded. The grain field has no clock dependence.

This backend approximates appearance. It does not reproduce per-pixel shader normals, identical facets, source-gradient micro-normal response or a physical material. Hair recoloring retains a separate approximate fallback compositor; the digital pigment-parity checks below concern makeup, not a claim of calibrated hair dye matching. UI wording should say **Light approximation** for Canvas and **Shader studio** for actual WebGL2. All finish controls can remain usable, with this distinction available in contextual help rather than a wall of technical metadata.

## Creative lighting

These presets perform actual renderer image-color operations, not a CSS wash over the application. Both backends apply the same bounded per-channel/exposure transform and directional image gain:

- **Original light:** identity.
- **Daylight:** a small clean/cool balance.
- **Golden hour:** warmer highlights and an amber color balance.
- **Moonlight:** a restrained cooler blue interpretation.

Makeup specular color and direction respond to the same settings. Existing source texture is retained. The treatment affects image pixels, including background, and is not depth-aware physical relighting. Before/after's original side bypasses grading and makeup exactly. Hand occlusion restores original or graded source pixels for the appropriate side, without restoring makeup through a hand.

## Quality, caches and cleanup

Adaptive mode uses hardware WebGL2 when available and chooses Canvas for renderer strings identifying SwiftShader/llvmpipe/software. Browser privacy masking can hide the actual driver; a renderer string is not evidence of physical hardware. Explicit high quality can initialize actual WebGL2 with a640px longest-edge ceiling when the renderer identifies software. A privacy-masked renderer uses the configured resolution bound instead; that is not evidence that it is physical hardware. This is a deliberate quality/cost tradeoff, not a hardware-speed claim. The UI can always return to adaptive mode.

Quality changes release old GPU textures, program, buffer and context before creating a new graphics surface. Every frame independently synchronizes visible and hidden GPU dimensions, preserving the fixed WebKit pre-sized-canvas regression. Context restoration rebuilds uniforms/textures. Source-space masks and finish layers reuse unchanged landmark frames; color, finish, enabled layers and light settings invalidate the relevant caches.

Canvas creative grading caches immutable image identity/source URL, or the current video frame time and stream identity. Mutable canvases are processed again. Changing the source or returning to neutral clears the unused graded-image cache. Renderer disposal releases canvases and references. No frame, lighting image, landmark array or API credential is written to IndexedDB by these modules; snapshots remain explicit caller actions.

## Verification and evidence

`packages/ar-renderer/scripts/materials-smoke.mjs` runs actual MediaPipe inference on the bundled portrait and captures complete portraits plus lip macros. It verifies:

1. Four finishes produce distinct rendered pixels in Canvas and actual WebGL2.
2. Moving the light changes actual finish pixels.
3. Changing `frame.time` from0 to98765 leaves the same still material exactly unchanged.
4. Omitted/neutral lighting preserves source color; all three creative presets change actual image pixels.
5. The original side of the lit before/after remains exact.
6. Adaptive→high→adaptive switches actual backends and applies the software640px bound.
7. Static, updated-geometry and mutable-source grading workloads are timed with a pixel-read flush. These are not camera FPS measurements.

Evidence: `cook/stills/r05-materials/{materials-and-lights,canvas-finishes,shader-finishes,before-after,lighting-presets}.png` and `report.json`. Browser-specific reports live below the same folder. Macro inspection led to two refinements: separate upper/lower lip bodies, then bounded ambient clearcoat/facet response so a key light missing a turned lip does not make every finish appear matte.

Unit coverage includes validated light bounds/identity, bounded directional grading, canonical coordinates independent of output resolution, source↔face inversion, face-roll registration, separate lip surfaces and malformed optional depth. Existing look normalization, geometry and mask tests remain. Source identities, source switching, skin-analysis inputs and privacy are also subject to the broader application regressions.

## Limits still open

Physical-device frame rates, calibrated cosmetic realism, representative complexion/lighting fairness, full mesh/material reconstruction, true depth-aware relighting, learned hair/hand matting and manufacturer shade accuracy remain unverified or unimplemented. The complete product's9/10 acceptance gate is not satisfied by this rendering round. This document reports operational local previews and executed evidence, not a full-product completion claim.

## Executed round05 measurements — final pigment-parity revision

The current reports below were captured **after** unifying the makeup pigment math. Earlier macro/benchmark runs and the standalone Firefox material folder predate that correction and are historical; they are not current performance evidence. Root’s separate current Firefox application regressions cover integrated behavior.

Final Chromium156 and Linux Playwright WebKit27.2 fixtures both passed with478 real landmarks and no application page errors. Host: AMD EPYC9V74,5 logical CPUs exposed; viewport1520×1120; ordinary material comparison output480×720. The final run coincided with other project verification and recorded load averages around6.5–6.7. These are loaded cloud samples, not isolated hardware benchmarks. WebKit reports a Safari-shaped user agent and `Apple GPU` privacy string in this Linux software-graphics setup; neither establishes Apple hardware. Exact runtime metadata is retained in each JSON report.

| Final fixture | Cached material median / p90 | New geometry median / p90 | Mutable-source golden grade median / p90 |
|---|---|---|---|
| Chromium Canvas480×720 |5.0 /5.3ms|23.1 /36.8ms|11.7 /46.8ms|
| Chromium SwiftShader WebGL480×720 |80.2 /103.0ms|90.5 /104.5ms|86.5 /106.1ms|
| WebKit Canvas480×720 |4 /5ms|35 /36ms|15 /38ms|
| WebKit WebGL480×720 |8 /11ms|17 /20ms|10 /23ms|

Explicit high-mode Chromium used actual WebGL427×640, cached golden-grade median98.6ms/p90 118.3ms in this loaded sample. WebKit’s masked renderer retained600×900, median12ms/p90 13ms. Resolution alone does not explain all small-sample/concurrent-load timing differences. These numbers do not establish camera FPS. Changed-frame CPU processing, software shader cost, lower high-mode resolution and large p90 outliers remain performance concerns. Adaptive mode is the default; physical-device30/60FPS targets remain unverified.

### Corrected digital color consistency

Independent criticism found that the same90% `#AE4C8B` read brick red under the previous Canvas soft-light stage and purple under GLSL. That was an algorithm mismatch, not a finish difference. The actual Canvas makeup stage now uses the same numeric pigment target, mask coverage, blend order, multiply categories, foundation coverage and matte attenuation as GLSL. The source image is not smoothed. Reflections remain a separate, explicitly approximate stage.

- Actual application controls were exercised by `packages/ar-renderer/scripts/app-pigment-parity.mjs`:90% matte `#AE4C8B`, Balanced then Detailed. Matching normalized lower-lip samples were RGB `[136.64,62.52,106.30]` and `[137.74,63.14,107.28]`; maximum channel difference **1.10/255**, despite600×900 versus427×640 output. Captures/report: `cook/stills/r05-materials/app-parity/`.
- At equal480×720 resolution, final Chromium maximum mean RGB-channel difference was **0.33/255**; WebKit **0.037/255**. These are digital preview comparisons, not physical shade calibration or manufacturer-match evidence.
- Both backends preserve neutral image color and the original half of a creative-light comparison. Final tests found **zero changed pixels outside the actual rasterized makeup-mask footprint**, with a documented1px guard for bilinear mask sampling. The initial coarse face-box check incorrectly counted low-alpha blush feathering beyond the box; the retained final check uses actual masks.
- Matte/gloss/shimmer/glitter remain distinct; directional light changes finish pixels; advancing the frame clock leaves still pigment facets unchanged. Same-element source replacement invalidates the grade cache, and returning to neutral clears it. Final raw counters are authoritative in the reports.

The forced-WebGL pre-sized-output, exact split and real GPU-loss restoration regression still passes after the parity revision. The OpenCV polygon/Gaussian/composite regression passed after the lip-feather update with zero mouth-cavity alpha and zero outstanding matrices. All **18 affected** makeup/geometry/lighting/surface/pigment unit tests, strict TypeScript and scoped ESLint pass. Root owns reconciliation of full-suite and production counts.

Independent visual limits remain: full-opacity purple can look crisp/flat, gloss may reinforce an original photographic highlight, and shimmer is subtle. Outer lip feathering was increased slightly while clearing mouth holes afterward. This is an incremental material-quality improvement, below a9/10 photorealism claim.
