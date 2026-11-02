# WebKit camera and Remix diagnostics — round 06

Environment: Playwright WebKit 27.2, Linux WPE MiniBrowser, local unprivileged dependency wrapper, `LIBGL_ALWAYS_SOFTWARE=1`. No physical-camera or Safari/macOS/mobile-device validation is implied. Diagnostic browser contexts blocked every `/api/**` service route; no provider call or application source change was made during diagnosis.

## Camera failure was a fixture override lifetime issue

The original test installed an own `getUserMedia` override on the current `navigator.mediaDevices` object. In the actual WebKit run, installation succeeded without error and secure context/canvas capture support were present. After real model initialization, a later lookup returned the native method; the fixture had zero invocations and no stream was created. The app therefore received a real denied native camera request. This was not evidence that a created stream failed to play.

Installing the same fixture on `Object.getPrototypeOf(navigator.mediaDevices)` retained it. The actual controlled canvas MediaStream had a live video track, the real HTMLVideoElement reached readyState 3, and stopping the mirror ended the track. The unchanged provenance/camera assertions then passed the targeted WebKit test. Only the test override target changed; assertions for real stream/playback/cleanup and generated-image provenance were preserved. This does not grant or bypass permission for a physical camera.

Evidence:

- `packages/vision-core/evidence/r06/webkit-camera-diagnostic.json` — original per-instance override loss.
- `packages/vision-core/evidence/r06/webkit-camera-prototype-diagnostic.json` — retained override, actual stream/playback/cleanup.
- `test-results-r06-webkit-prototype` — targeted provenance test passed 1/1.

## Remix exposed a genuine returned-snapshot lifetime bug

A standalone same-source matrix compared HTMLImage, ordinary canvas, `willReadFrequently` canvas and ImageBitmaps from image/canvas. All five had the same decoded pixel SHA-256. Both factory and explicit main engines produced 478 face points, one hand and the same mean hair confidence 0.1947190896. Input conversion was therefore not the demonstrated fault.

Runtime instrumentation of the actual Remix workflow showed real worker hair initialization failing for that graphics context, followed by a genuine CPU main-thread fallback. The main call returned 478 landmarks. `analyzeInspiration` then called `engine.dispose()` in `finally` before passing the snapshot to region extraction. Main `VisionPipeline.dispose()` called `resetTracking()`, which cleared fields on that same returned object. A direct real-model test confirmed:

| Returned main snapshot | Before dispose | After dispose |
|---|---:|---:|
| Face landmarks |478 |0 |
| Hair mask present |true |false |
| Hands |1 |0 |

The returned object was still the current internal snapshot (`isSameCurrentSnapshot:true`). This explains real model success followed by palette-only extraction in the main fallback path. The original worker disposal path replaces its internal snapshot object and did not exhibit this aliasing problem. Both actual Remix tests continued to fail unchanged before the fix.

Proposed application correction, reported to the parent before any source edit: reset/dispose should replace internal snapshot state, preserving previously returned observations. A model-input rewrite or weaker test assertion would not address this defect.

Evidence:

- `packages/vision-core/evidence/r06/webkit-canvas-diagnostic.json` — matching source variants and actual model outputs.
- `packages/vision-core/evidence/r06/webkit-canvas-disposal-before-fix.json` — preserved real-model before/after mutation proof.
- `packages/vision-core/evidence/r06/webkit-remix-diagnostic.json` and `webkit-remix-fast-diagnostic.json` — actual runtime worker/main paths.
- `test-results-r06-webkit-remix-recheck` — two unchanged Remix tests failed before correction.

The historical pre-fix evidence is retained above. Approval, the bounded correction and its post-fix evidence follow below; the isolated model matrix alone does not establish a complete WebKit product gate.

## Approved fix and post-fix verification

After the parent approved the demonstrated defect, the only application change was `VisionPipeline.resetTracking()` replacing its internal snapshot object with empty geometry rather than clearing fields on the previously returned object. Face/hair/hand/body/pose references held by the engine are released; temporal filters/scheduler reset as before; disposal still closes all task models and clears the engine's remaining resources/status. Source epochs, source queues, inference, masks, model inputs and rendering were unchanged.

The teardown contract now preserves previously returned observations. **Engine disposal does not erase caller-owned observations or copies.** Consumers remain responsible for releasing their own references and deleting any explicitly retained records. This is not a memory-zeroization promise or permission to retain camera data.

`packages/vision-core/src/snapshot-lifetime.test.ts` uses explicitly mocked model results to exercise the real pipeline API. Two regression cases verify that returned 478-point face geometry, hair data and hand observations survive reset/disposal, while the internal snapshot is different and empty and each task model is closed. These are lifecycle contract tests, not model-accuracy evidence.

Final targeted results:

- **18/18** vision-core unit tests passed across five files.
- **3/3 actual WebKit browser tests passed**: generated-provenance camera workflow with real controlled MediaStream/playback/ended tracks, genuine-model Look Remix region extraction/edit/application, and selected-region palette changes preserving original measurement evidence. The original assertions were retained.
- Whole-project TypeScript and scoped ESLint passed.
- No service API call was initiated by diagnostics. The application fix contains no new transmission, persistence or paid call.

Targeted command:

```sh
TB_WEBKIT=1 TB_WEBKIT_EXECUTABLE=/tmp/true-beauty-browser-libs/pw_run_with_local_libs.sh LIBGL_ALWAYS_SOFTWARE=1 npx playwright test tests/e2e/remix.spec.ts tests/e2e/accessories-r06.spec.ts --grep 'Look Remix measures|a selected region|generated-photo' --project=webkit --output=test-results-r06-webkit-snapshot-fix
```

The parent is rerunning Chrome/Firefox source/lifetime regressions and the production build. This targeted closure does not certify every WebKit workflow, physical Safari hardware, medical accuracy or long-run performance.
