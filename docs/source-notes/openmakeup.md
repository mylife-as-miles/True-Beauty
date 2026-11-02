# OpenMakeupSDK integration audit

Source: https://github.com/ehsanwwe/OpenMakeupSDK

Pinned revision: `12c5a8023aab0fcec7eef4fbdc0d1a29cf9989dd` (shallow clone at `/workspace/research/OpenMakeupSDK`).

License: MIT, Copyright (c) 2026 Ehsan Moradi. Complete notice preserved in `packages/shader-library/LICENSE.OpenMakeupSDK`; derivative source headers identify the source. No upstream texture, GLB, photo, pattern raster or model-weight files have been redistributed. The repository MIT notice does not establish independent provenance of third-party texture or model assets; those remain an asset-audit task.

## Studied implementation

- `assets/shaders/lip/{vertex,fragment}.glsl`: simplex noise, view reflection, bounded brightness, open/closed lip mask.
- `assets/shaders/blush/{vertex,fragment}.glsl`: simplex material variation, Fresnel response, separate alpha mask.
- `assets/shaders/eyeshadow/{vertex,fragment}.glsl`: per-material noise and alpha compositing.
- `assets/shaders/foundation/{vertex,fragment}.glsl`: mask-scaled coverage and view-angle response.
- `assets/shaders/{eyeline,mascara}/{vertex,fragment}.glsl`: UV offsets, texture alpha, transparency.
- `assets/shaders/facewarp/{vertex,fragment}.glsl`, `src/core/faceWarpMaterial.js`: unmorphed camera projection with morphed positions.
- `src/core/FaceMeshModelController.js`: source-normalized image coordinates, eye-distance scale, eye/forehead/chin registration, lip-open ratio.
- `src/core/{MakeupEngine,materials,KalmanFilter2D}.js`, `src/morphs.js`, `src/{categories,config}.js`: engine responsibilities, effect controls, filters and morph target mappings.
- `assets/patterns/patterns.json` and categories: upstream pattern inventory. Raster texture licenses are not independently established, so no bitmap pattern is copied.

## Code actually adapted

| Upstream implementation | True Beauty destination | Changes |
|---|---|---|
| Lip/blush/eyeshadow simplex noise functions (`mod289`, `permute`, `snoise`, exact constants and polynomial) | `packages/shader-library/src/index.ts` | Consolidated one shared GLSL ES 3 material function. Noise is anchored to the tracked face region and used by shimmer/glitter instead of brightening the whole frame. |
| Foundation/blush Fresnel mask response | `packages/shader-library/src/index.ts` | Shared view-dependent bounded specular/Fresnel response, low-opacity skin-texture-preserving coverage, original camera luminance retained. Approximate 2.5D lighting, not measured physical material reconstruction. |
| Face landmark registration, eye-distance scale and rotation, mouth aspect ratio | `packages/ar-renderer/src/geometry.ts` | Plain typed geometry utilities independent of Three.js internals; exact source image coordinates prevent asset-UV drift. Mouth interior remains an excluded mask, including teeth. |
| Camera texture projection / source-preserving facewarp concept | `packages/shader-library/src/index.ts` | Optional bounded inverse-sampling jaw warp (`reshape`, off by default). This is a transparent cosmetic geometric preview. Upstream GLB morph targets are not reused; individual brow/nose/lip mesh morphs remain planned. |
| Layer categories and material controls | `packages/makeup-engine/src/index.ts`, `packages/ar-renderer/src/masks.ts` | Twelve separately editable effect layers plus hair/accessory state, normalized import boundary, six structured presets. Landmark masks replace unprovenanceable texture assets. |

## Working implementation

`BeautyRenderer` accepts a shared tracked face and camera/image source. It does **not** run a second tracker. Four independent RGB mask atlases feed a WebGL2 shader in one pass. Shader compositing preserves the image's spatial luminance; source pixels are returned unchanged outside enabled masks. Makeup masks exclude mouth interior and eye openings. Effects are registered to current source-space landmarks. Face/eye coordinates support source roll; no guessed face masks are substituted when tracking fails.

The renderer supports lipstick, gloss, lipliner, blush, eyeshadow, eyeliner, procedural mascara lashes, brow color, foundation tint, contour, bronzer and highlight. Material finishes include matte, gloss, shimmer and glitter. Hair uses the shared segmentation confidence mask, solid/ombre/highlights/balayage modes and source luminance. Procedural glasses, earrings and necklace previews use tracked source geometry; they are approximate 2D AR overlays, not body-fit or occlusion-validated 3D jewelry simulations. Hand landmarks can exclude a conservative palm/finger geometry mask; this is not a learned hand segmentation model.

There is an exact split comparison, local snapshot operation, capped render resolution, Canvas2D soft-light/multiply fallback, and GPU-context restoration. Canvas fallback retains color masks and hair but does not reproduce shader specular/glitter. `fallbackReason` records shader initialization failure. No raw frame is stored by the renderer; only the explicit caller-controlled snapshot operation returns an image.

## Verification

- `packages/makeup-engine/src/index.test.ts`: all 12 layers, normalization, invalid colors/NaN, bounded optional warping, independent presets.
- `packages/ar-renderer/src/geometry.test.ts`: malformed tracks rejected, actual aspect/roll registration, mouth-interior separation, lip openness and colors.
- `packages/ar-renderer/scripts/smoke.mjs`: real MediaPipe inference on supplied portrait, actual WebGL2 compile and draw, nonblack/source-fidelity pixel checks, changed-pixel effect check, exact original/after split, hair-mask presence, context-loss fallback/restoration, static-source timing. Run with a Vite server on port4174 or `GRAPHICS_TEST_ORIGIN`.
- Captured evidence: `cook/stills/graphics/comparison.png` and `report.json`. Measurements explicitly identify managed-cloud Chromium and static-source repetition, not real mobile camera FPS.

## Remaining limitations

No claim of 9/10 realism, real-device 30/60 FPS, validated occlusion with glasses/partial faces, complete upstream pattern coverage, individual GLB facial morphs, WebGPU benefit or physically measured light/material response. Full complexion/lighting evaluation and camera motion performance remain unverified. The image mask pipeline is feathered but not a production-quality matting system. Those requirements remain in the full product backlog.

## Optional OpenCV mask refinement

`packages/ar-renderer/src/opencv.ts` lazily loads real `@techstark/opencv-js` 5.0.0-release.1 WASM (Apache-2.0, notice preserved). `BeautyRenderer.setMaskBackend('opencv')` switches actual lip, shadow, brow and foundation mask construction to OpenCV `fillPoly` and `GaussianBlur`. The feature is optional and makes no network image upload; initialization errors preserve the Canvas path. A separate static-image `composite` operation calls actual `addWeighted`, then applies the feather mask while preserving all source pixels outside it. Mat and MatVector allocations are released in `finally` blocks. Inner lip/eye polygons are cleared after blur with non-antialiased hole fill to keep cavities free from pigment.

The Virtual Makeup `apps/web/src/lib/makeup/face.ts` workflow was studied for this method. Its repository has no detected root license, so this is an independently written implementation of public OpenCV operations, not a claim of license-cleared source-copy reuse. That upstream licensing/integration gap remains blocked. See `packages/ar-renderer/THIRD_PARTY.md`.

Browser proof: `packages/ar-renderer/scripts/opencv-smoke.mjs`, screenshots/report at `cook/stills/opencv`. Tested actual WASM initialization, 478 inferred landmarks, soft mask edges, exact zero mouth-cavity alpha, source-preserving weighted tint, and zero outstanding matrix allocations after 81 masks and one composite. Managed-cloud Chromium mask timing at512 longest edge: Canvas median8ms/p95 9.6ms; OpenCV median14.9ms/p95 20ms. Keep Canvas default on this evidence; OpenCV remains an explicit alternate for pixel-space workflows. No claim that WASM is faster here.

## Accessory refinement and runtime degradation

Procedural glasses now use tracked temple anchors, layered rim thickness, bridge, nose pads, restrained lens reflection and metallic gradients balanced by sampled cheek brightness. Hoops/studs have layered metallic shading and a conservative far-side depth gate. A separate accessory layer is removed by shared hair confidence, while hand geometry is restored last. Necklace placement remains inferred from chin position without body tracking. These remain approximate live 2D overlays; no commercial fit, realistic jewelry material or full physical occlusion validation is claimed.

Hardware WebGL2 uses the adapted GLSL material compositor. SwiftShader/llvmpipe/software GPUs automatically use cached Canvas2D instead, with an explicit `fallbackReason`. Default render cap is960 longest edge; `{maxSide:720}` is available for constrained live scenarios. Mask atlases cap512 and skip disabled layers. Static landmark frames and unchanged colors reuse cached masks. Hair ombre/balayage progression is anchored to actual confidence-mask bounds instead of full image height.

Final expanded-accessory browser run (see current `cook/stills/graphics/report.json`) verified exact split comparison with zero mismatched pixels on both sides, 54,012 changed pixels out of737,280, and successful source-preserving fallback/restoration after forced GPU loss. Repeated timing is variable under shared cloud load: latest Canvas720 cached median28ms/p95 44ms, changed-mask median37.4ms/p90 39.4ms; forced SwiftShader WebGL960 median188ms/p95 244.6ms. Earlier isolated Canvas medians were15.5–18.3ms cached and26.4–28ms with new masks. These timings include pixel-read flush and exclude model inference; none are camera FPS measurements. Hardware/mobile targets remain unverified. Software GLSL is automatically avoided in the application. The browser report retains Vite HMR local-network WebSocket warnings and TensorFlow initialization console output; these are development/runtime console messages rather than shader compilation or application exceptions.

Verification commands (Vite must already serve the project):

```sh
npx vitest run packages/makeup-engine packages/ar-renderer
npx tsc --noEmit
npx eslint packages/ar-renderer packages/makeup-engine packages/shader-library
GRAPHICS_TEST_ORIGIN=http://127.0.0.1:4174 node packages/ar-renderer/scripts/smoke.mjs
GRAPHICS_TEST_ORIGIN=http://127.0.0.1:4174 node packages/ar-renderer/scripts/opencv-smoke.mjs
```

## Original interactive product material viewer

`apps/web/src/components/ProductViewer.tsx` / `.css` is an optional lazy-loaded Three.js / React Three Fiber module. It uses only selected product `form` and sanitized `accent` for original unbranded bottle, dropper, jar, tube, lipstick and compact geometry. It does not load merchant assets or reproduce a selected merchant package. Persistent labeling explains that no packaging, size or physical finish claim is being made.

The module generates its studio reflection map locally through PMREM, uses physically based materials and real light/shadow rendering, and renders on demand with no autoplay. Pointer/touch drag and arrow keys rotate/tilt; accessible zoom/reset buttons and keyboard alternatives are provided. Forced GPU loss switches to the existing generic2D illustration, with working retry and disabled inactive controls. GPU resources and generated reflection maps are disposed on unmount.

Real browser harness: `packages/ar-renderer/scripts/product-viewer-smoke.mjs` (`GRAPHICS_TEST_ORIGIN` points to Vite). Screenshot evidence at `cook/stills/product-viewer/` covers all six forms, phone layout and GPU fallback. Assertions cover real WebGL draw calls, keyboard and pointer rotation, zoom/reset, zero idle draw calls after settling, GPU-loss fallback/retry, mobile touch rotation and horizontal overflow. TypeScript and ESLint checks are required. This is a generic interactive material study, not a digitized commercial SKU or accessory-fit viewer.

## WebKit pre-sized-canvas regression (fixed)

A real WebKit27.2 journey exposed a renderer defect that software-fallback Chromium/Firefox did not reveal. Saved Daylight/Evening recipes in IndexedDB were different (`#A45356`/.55 versus `#792C48`/.78 lipstick), with actual478-point face inference, but both comparison previews showed identical cropped clothing. WebKit exposed its protected renderer string as `Apple GPU` even under the managed Mesa software runtime, so this run used the actual WebGL compositor.

Root cause: the visible JSX comparison canvas was already600x900, equal to the demo image. A combined resize guard therefore skipped resizing the independent hidden WebGL surface from its default300x150. The oversized viewport clipped the source and the subsequent Canvas draw stretched that crop, leaving the makeup region outside the output. `BeautyRenderer.render` now synchronizes each surface's dimensions independently. `LookComparison` and persisted recipes needed no changes.

Regression evidence:

- Exact previously failing saved-recipe journey now passes in WebKit (7.9s), Chromium (5.0s) and headed Firefox (36.8s under concurrent cloud load). Captures: `cook/stills/r03/look-comparison-{webkit,chromium,firefox}.png`; runner directories: `test-results-{webkit,chromium,firefox}-comparison-fixed`.
- `packages/ar-renderer/scripts/smoke.mjs` now intentionally pre-sizes output canvases before constructing the renderer, forces real WebGL2, and checks source fidelity/nonblack output and exact split. Passed with478 real landmarks,54,012 changed pixels and zero original/after split mismatches. Report includes `preSizedOutput:true` in `cook/stills/graphics/report.json`.
- Diagnostic script `packages/ar-renderer/scripts/webkit-comparison-debug.mjs` records real IndexedDB recipe colors, mask alpha counts, source/canvas dimensions, pixel sums and isolated Canvas/WebGL paths. Before-fix artifacts are preserved at `cook/stills/webkit-debug/{before-resize-fix.png,report-before-resize-fix.json}`; post-fix artifacts use the matching `after-resize-fix` names. These are controlled demo/browser records, not user photos.
- TypeScript, graphics ESLint and all8 makeup/geometry unit tests pass after the fix. The E2E compares data-URL equality as a boolean so failed logs do not dump encoded images.

WebKit command: `TB_WEBKIT=1 TB_WEBKIT_EXECUTABLE=/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright test --project=webkit --grep='saved recipes replay'`. The wrapper is session-specific unprivileged runtime provisioning documented by the vision engineer; this is not physical Safari hardware validation.
