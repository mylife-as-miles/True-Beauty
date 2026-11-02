# Vision pipeline verification

Recorded 2026-11-02. This report describes actual executed evidence, not the product's eventual quality gate.

## Implementation

- One shared MediaPipe FaceLandmarker provides 478 normalized landmarks, 52 expression blendshapes and a 4x4 face transformation. No duplicate face detector per effect.
- MediaPipe hair segmentation provides a real confidence mask; temporal smoothing and stale reset are implemented. Hair mask smoothing is a temporal approximation, not optical flow or a skeletal hair tracker.
- MediaPipe HandLandmarker supports up to two hands; heuristic geometric pinch/open-palm/point/swipe recognition is debounced. The MediaPipe handedness-classifier score is used as a rejection gate, **not a calibrated interaction probability**.
- Frame acquisition, inference and rendering are separate. Face/hair/hands have independent target frequencies. An inference-cost EWMA reduces cadence when the measured combined workload exceeds a 65% worker budget.
- Face/hand input max-side is 640; hair max-side is 256. Original aspect ratio and normalized geometry are preserved.
- `VisionWorkerClient` runs actual inference inside a dedicated module worker with transferred ImageBitmap frames. Input bitmap closure occurs in worker `finally`; output masks are cloned so temporal state is not detached. The main-thread `VisionPipeline` remains a fallback.
- Worker WASM JS is loaded from the same-origin `/wasm/` directory through Tasks Vision's module import hook. A short-lived blob module avoids Vite's public-asset dynamic-import restriction; no user-authored content is evaluated.
- Camera access is explicit, requests no audio, invalidates late streams after cancellation, stops on close/unmount/pagehide/hidden, invalidates pending permission requests while hidden, never restarts automatically on foregrounding, and supports facing-mode switching. No frames or geometry are saved or uploaded by this package.

## Executed checks

### Unit tests

`npx vitest run packages/vision-core/src/pipeline.test.ts`: **7 passed**.

Checks: normalized coordinate edges/invalid inputs; time-aware landmark jitter smoothing and lost-track reset; confidence-mask temporal smoothing/stale reset; mask feathering; texture-preserving colour blend; stable debounced pinch; measured-cost adaptive scheduling.

### Real local model integration

`node packages/vision-core/scripts/verify-browser.mjs http://127.0.0.1:5174`

Evidence:
- `packages/vision-core/evidence/model-integration.json`
- `packages/vision-core/evidence/portrait-inference.png`

Browser: Chromium 154.0.8037.57 headless on Linux, AMD EPYC 9V74 80-Core Processor. CPU inference. UI viewport 1500x1050.

Three bundled portraits at source sizes 1200x1500 and 600x900 each produced **478 face landmarks, 52 blendshapes, 16 transformation values and a nonempty confidence hair mask**. The hand model produced zero hands in one portrait and one hand in each of the other two; hand-detection correctness is not independently labelled or scored. Cold combined image inference was 378.9 ms; subsequent different-image calls were 156.6 and 159.1 ms. Model initialization was 658.4 ms on the local runtime.

The first experiment ran the original-sized source through every model and took 863.4 / 280.2 / 223.1 ms. Bounded-resolution inference reduced processing work and mask allocation. These small sequential samples are development evidence, not a statistical device benchmark.

### Worker and video scheduling integration

`node packages/vision-core/scripts/verify-worker.mjs http://127.0.0.1:5174`

Evidence: `packages/vision-core/evidence/worker-integration.json`.

Same browser/CPU as above; 480x600 canvas-generated 30Hz MediaStream repeating a static portrait. All three real models execute in VIDEO mode.

- Test duration: 4510.6 ms.
- Main-thread rAF callbacks: 270; **59.86 callbacks/s**.
- rAF interval p50/p95: 16.7 / 16.7 ms.
- Inference batch p50/p95: 39.3 / 110.4 ms.
- Actual model calls during the run: face 28, hair 11, hands 20.
- Scheduler slowdown: 2.38x; mean model costs: face 22.31 ms, hair 60.15 ms, hands 35.55 ms.
- Final face points: 478; no frame error; all MediaStream tracks ended after explicit stop.
- During the separate cold image worker call, a 10ms main-thread timer ticked 39 times while the worker took 383.4 ms, confirming that this expensive inference did not block the main thread.

**59.86 rAF callbacks/s is not 59.86 new vision predictions/s and is not a measured full-app render rate.** Face update frequency in this loaded CPU fixture was about 6.2 Hz. No 30 FPS mobile AR or 60 FPS end-to-end tracking gate is asserted.

### Camera lifecycle browser fixtures

`node packages/vision-core/scripts/verify-lifecycle.mjs http://127.0.0.1:5174`

Evidence: `packages/vision-core/evidence/camera-lifecycle.json`.

**9 checks passed** after privacy hardening: recoverable permission denial; explicit opening; backgrounding stops and clears the camera; foregrounding never restarts automatically; old stream stopped on camera switch; explicit close; late stream stopped after cancelled request; late permission result stopped after backgrounding; unmount release.

These use a real `canvas.captureStream()` MediaStream, a controlled `getUserMedia` permission fixture and a dispatched visibility fixture. They verify application lifecycle behavior, not physical camera hardware/browser permission prompts.

## Unverified / remaining

- Physical camera motion and true gesture detection/latency; tracking stability across head poses, expressions, partial occlusion and glasses.
- Hair boundary/matting correctness, hand/face/hair occlusion correction and optical-flow correspondence.
- False-positive/false-negative rates on representative labelled face, hand and hair datasets.
- Accuracy and fairness across complexion, age, gender expression, hair textures and lighting. The three portraits are not a diversity validation set.
- Safari on physical hardware, Firefox on physical hardware, real mobile GPU/thermal behavior, rotation, low memory, real GPU context loss and multi-hour allocation stability.
- Full-app AR performance at target resolutions; worker canvas performance is not the application's rendering benchmark.
- Model-card/commercial-distribution licence clearance, separately tracked in `packages/vision-core/MODELS.md`.
- Original Virtual Makeup standalone full MIT notice is missing upstream; its README's explicit MIT declaration and author are retained, with this gap disclosed.

No clinical or identity inference is provided by these modules. No claimed skin measurements, face-recognition authentication or medical phototype estimates are generated.

## Firefox runtime investigation and fallback revision

2026-11-02, Firefox 157.0 on Linux, same AMD EPYC CPU. Evidence: `packages/vision-core/evidence/firefox-integration.json`; reproducible script: `node packages/vision-core/scripts/verify-firefox.mjs http://127.0.0.1:5173`.

The default **headless** Firefox runtime in this container has no usable HTMLCanvas or OffscreenCanvas WebGL context. Actual failures included `AllowWebgl2:false`, `FEATURE_FAILURE_WEBGL_EXHAUSTED_DRIVERS`, `GLctx is undefined`, and ImageSegmenter's `kGpuService` initialization failure. Forcing Firefox WebRender/software preferences while remaining headless did not restore a context. Both actual worker and main-thread CPU calls were attempted. MediaPipe's CPU inference option still needs a graphics context for its image preprocessing/postprocessing graphs; it is not a no-WebGL fallback.

This is an execution-environment limitation, **not a claim that Firefox generally lacks support**. Capability probes inspect actual contexts, never user-agent brands. The application now returns an actionable graphics-context explanation and leaves manual swatches, colour recipes and saved collections available when no context exists.

An unprivileged Xvfb experiment resolved the environment limitation: Debian `xvfb_21.1.16-1.3+deb13u4_amd64.deb` was downloaded from the official Debian pool and extracted under `/tmp/truebeauty-xvfb/runtime`; no privileged package install was required. Xvfb display `:99` plus Mesa llvmpipe and **headed** Firefox creates real software WebGL2 contexts. Launch environment: `DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe MOZ_WEBRENDER=1`; preferences: `webgl.force-enabled=true`, `webgl.disabled=false`, `gfx.webrender.software=true`.

Actual Firefox worker inference on the bundled neutral portrait returned **478 face landmarks, 52 blendshapes, a 171x256 real hair mask and one detected hand**. Combined image inference was 287 ms in this single CPU/software-graphics sample. This is operational model-integration evidence, not a hardware FPS or hand-accuracy score.

`createVision()` now chooses a worker only when an actual OffscreenCanvas WebGL2 context is usable and retries a worker failure through a new genuine main-thread CPU pipeline with an explicit HTMLCanvas graphics surface. A deliberately failed worker transport was tested in Firefox; the fallback produced **478 actual face landmarks and a real 171x256 hair mask**. No model response was mocked in that fallback check.

Four additional unit regressions check control behavior only: blocked module-worker construction selects the main engine; a transient fallback model failure remains retryable without remounting; concurrent worker failures create only one main pipeline; disposal never triggers new fallback inference. Together with the original seven algorithm/scheduling tests, `npx vitest run packages/vision-core/src/{pipeline,fallback}.test.ts` passes **11 tests**. These mocked control regressions do not substitute for the executed Firefox model tests above.

### Final Firefox application journeys

The final headed Firefox 157 test run used the software-graphics environment described above:

```sh
TB_CROSS_BROWSER=1 TB_FIREFOX_HEADED=1 DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe MOZ_WEBRENDER=1 npx playwright test --project=firefox --output=test-results-firefox-final
```

Result: **20 passed, 1 skipped, 0 failed** in 1.7 minutes. The skipped case is the production-only offline continuity fixture; it is not asserted as Firefox offline verification here. This includes actual local skin/colour inference, held-model source switching, shared portrait continuity, late-camera cleanup, agent/memory editing, commerce, saved-look comparison, 3D product-study control, editable routines and wardrobe/canvas workflows.

An earlier source-queue fixture waited for a network intercept while the service worker supplied the actual model from cache. Its screenshot already showed genuine connected landmarks. Blocking service workers **only for that adversarial network-delay fixture** made the intercepted gate deterministic; actual model inference after releasing the gate still executes. Evidence from the independently repeated full-app check is `packages/vision-core/evidence/firefox-source-switch.json` and `.png`.

### WebKit dependency and model verification

The initial WebKit launch was blocked by missing system libraries. Privileged `install-deps` was unavailable, so nine matching Debian 13 packages were downloaded from the official Debian pool and extracted under `/tmp/true-beauty-browser-libs/runtime`. Their source URLs, sizes and SHA-256 digests are in `packages/vision-core/evidence/webkit-integration.json`. They total approximately 3.5 MB of downloads and do not modify the system package database.

Playwright's bundled MiniBrowser wrapper replaces `LD_LIBRARY_PATH`, so a local wrapper `/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh` preserves the extracted libraries along with the official browser's bundled library paths. A diagnostic launch skipped Playwright's global `ldconfig`-only precheck because it cannot see libraries loaded through a command-local path; the **actual WebKit process and subsequent model inference succeeded**, independently of that precheck. The full-suite custom-executable launch does not need that validation override.

Reproducible model check: `node packages/vision-core/scripts/verify-webkit.mjs http://127.0.0.1:5173` (requires the local wrapper). Playwright WebKit 27.2, WPE headless, Mesa llvmpipe, same CPU as above. Both HTMLCanvas and OffscreenCanvas WebGL2 contexts are usable. Two actual portrait inferences each yielded **478 landmarks, 52 blendshapes, a 16-element transformation, a 171x256 confidence hair mask and one detected hand**. Measured image batches: 449 ms cold, 188 ms subsequent. These samples validate integration, not accuracy, fairness or hardware performance.

Playwright WebKit on Linux is **not physical Safari on macOS or iOS**. Safari hardware/browser/device behavior remains a separate verification requirement.
