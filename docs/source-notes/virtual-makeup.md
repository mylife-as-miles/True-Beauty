# Virtual Makeup implementation audit

Source: https://github.com/otdnnc/virtual-makeup
Pinned commit: `1d6ed5ef2b1c947dcbc144fa9fde2a26b6745fc1`
Inspected 2026-11-02.

## Source paths studied

- `apps/web/src/hooks/useCamera.ts`: stream lifecycle, default constraints, cleanup.
- `apps/web/src/hooks/useMediaPipeVision.ts`: `FilesetResolver`, FaceLandmarker, ImageSegmenter construction and disposal.
- `apps/web/src/hooks/useMakeupRenderer.ts`: current video time gate, rAF scheduling, resource release.
- `apps/web/src/components/CameraStudio.tsx`: video binding and model readiness overlay.
- `apps/web/src/components/ImageStudio.tsx`: static portrait mode.
- `apps/web/src/lib/makeup/landmarks.ts`: normalized-to-pixel conversion and facial contour topology.
- `apps/web/src/lib/makeup/hair.ts`: category-mask-based recolouring and Gaussian edge blur.
- `apps/web/src/lib/makeup/face.ts`: OpenCV polygon masks, blur and compositing.
- `apps/web/src/lib/makeup/palettes.ts`: colour collections.

## Actual reuse / adaptation

1. `packages/vision-core/src/useCamera.ts` adapts the actual React stream lifecycle: state, stream ref, getUserMedia, opening state, close and unmount cleanup. Improvements: invalidated in-flight opens prevent leaks; camera switching; separate permission-denied/no-device errors; background track stop and pending-permission invalidation; no automatic camera restart; pagehide cleanup.
2. `packages/vision-core/src/pipeline.ts` (re-exported by `src/index.ts`) adapts actual MediaPipe model construction, running modes and cleanup, and its duplicate-video-frame check. Improvements: one reusable model per feature; shared face geometry/blendshapes/transformation; independent face/hair/hand inference cadence; safe result-copy lifetime; lazy model load/retry; explicit error states; CPU baseline; no inference while hidden; still-image mode without a camera.
3. `packages/face-tracking/src/index.ts` adapts `normalizedToPixel` from landmarks.ts and canonical region topology. Improvements: accepts exact 0/1 edge coordinates, rejects NaN/invalid dimensions; mirrored screen conversion; time-aware temporal smoothing.
4. `packages/hair-segmentation/src/index.ts` adapts the segmented colour-blending method into confidence-weighted, luminance-preserving recolouring. Improvements: no flat paint over texture, temporal confidence smoothing, stale-mask reset, a separable renderer mask contract and edge feather utility. The original modulo/category assumption is replaced with the actual confidence output of the official model.

No demo portrait, third-party textures or original binary model files are copied. MediaPipe models are downloaded directly from official Google sources with SHA-256 recorded.

## Integration contract

```ts
const pipeline = new VisionPipeline({ delegate: 'CPU' })
await pipeline.load({ face: true, hair: true, hands: true })
const imageScene = await pipeline.analyzeImage(image, { face: true, hair: true })
// rAF, after the video has loaded:
const scene = await pipeline.analyzeVideo(video, performance.now(), {
  face: true, hair: true, hands: true,
})
// scene.landmarks is unmirrored, normalized source-image coordinates.
// scene.hairMask.data is Float32Array confidence in [0,1].
pipeline.dispose()
```

`useCamera()` exposes `{stream,error,isOpening,open,close,switchCamera}`. Camera images are never stored or uploaded by these modules.

## Verification

- `packages/vision-core/src/pipeline.test.ts` covers normalized boundary handling, landmark jitter/loss, temporal mask stability/staleness, feathering, texture-preserving recolouring and stable gesture debouncing.
- Actual model execution requires a real browser with WebAssembly, local model/WASM assets, and the app or browser test. Do not infer successful detection from the unit tests alone.
- Camera alignment, occlusion, varied complexions/hair, glasses, real gestures, midrange mobile performance, Safari/WebKit and low-memory behavior require device evidence before they can be marked verified.
- Inference is bounded by independent adaptive cadence; dedicated worker/OffscreenCanvas inference is now operational and browser-verified; exact evidence is in docs/VISION_REPORT.md.
- Hair-style generation, optical flow and skeletal hair tracking are not implemented by the segmentation mask.

## Licence evidence

README explicitly states `MIT — see [LICENSE](./LICENSE).` Author listed: `otdnnc@gmail.com`.
The standalone LICENSE linked by the upstream README is absent at the pinned commit. Existing declaration and attribution are retained in `packages/vision-core/THIRD_PARTY_NOTICE.md`; a commercial distribution audit must resolve the missing full copyright/permission notice. Do not label the missing file as inspected.

Models and WASM have a separate audit in `packages/vision-core/MODELS.md` and `apps/web/public/models/manifest.json`.
