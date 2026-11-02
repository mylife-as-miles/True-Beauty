# Local validation workbench — round 06

This round implements an operational evaluation workflow rather than declaring unavailable device or fairness evidence complete. `apps/web/src/components/ValidationLab.tsx` is a default-export React component with optional `portraitUrl` and `look` props. `packages/evaluation/src/benchmark.ts` runs actual local MediaPipe and BeautyRenderer work. Root owns application navigation/mounting; the isolated browser harness is retained under `cook/stills/validation-r06`.

## What a run actually measures

A user explicitly chooses demo, local upload or camera, face/hair/hand workload, resolution, rendering quality and measured-cycle count. Two warm-up cycles and model loading are separate from the measured phase. The engine is disposed after each run; a camera is stopped after measurement, cancellation, backgrounding or unmount. Cancellation rejects a held model load promptly. A 45-second hard bound prevents indefinite benchmarking.

The numeric JSON report includes:

- Browser/user-agent/platform, viewport, device-pixel ratio, logical-processor count and reported graphics capabilities/renderer string. The environment class is unverified, self-reported physical device, or automated fixture; none is automatically attested as hardware.
- Model loading, inference-call latency (including worker/preprocessing overhead), model-reported latency, flushed Canvas render/readback and UI animation-frame intervals, each with count/median/p90/p95/min/max.
- Requested and actual output resolution, inference/hair input caps, active makeup/accessory workload, renderer backend, completed calls and snapshots containing geometry. Actual VIDEO prediction counts use scheduler-run deltas; IMAGE calls execute the selected full batch. Per-model run counts/rates are separate from processed-frame counters and UI animation frequency. Throughput excludes model loading/warm-up.
- Registered landmark displacement after eye-corner similarity alignment. With no labelled motion ground truth, this is residual motion and **not** model tracking accuracy.
- Optional user-provided group/lighting labels. The software does not infer a complexion cohort, gender or clinical phototype.

The default workbench measures the explicitly selected face/hair/hands workload. New body/pose/accessory performance is not established by its default run. A short still/canvas-backed stream is not sustained physical-camera/device validation. Model cards' published evaluation is source information, not new True Beauty fairness evidence.

## Ground truth and cohort handling

A user may supply a matching binary PNG annotation (white hair/black background) after an actual hair result. An explicit same-source confirmation is required and resets when the reference, source or measurement changes. A stale asynchronous annotation comparison cannot attach to a different source. The module computes foreground IoU and Dice; it reports undefined values when both masks are empty rather than awarding an artificial perfect score. The annotation pairing/quality is user-asserted and not independently validated by the app.

Numeric cohort import uses `EvaluationSampleSchema`. Records have unique `id`, optional declared `sourceId`, user/fixture/unlabelled grouping provenance, metric evidence, rights basis, defined metric unit and value. Annotated-image evidence requires a source ID; repeated metric records for that source count once for image coverage, and contradictory groups are rejected. Synthetic fixtures cannot masquerade as annotated real-image coverage. Mask IoU uses ratio units; landmark error uses normalized eye-distance units. An unlabelled benchmark cannot claim a numeric ground-truth accuracy value.

The default 20-annotated-source minimum in each of at least two groups is an explicit coverage setting, not a scientific fairness threshold. Even sufficient user-declared coverage yields **descriptive coverage only**, never `fairnessValidated:true`. Images do not establish independent-person count; group means do not establish parity, causality, inclusion or clinical reliability. No representative annotated cohort is bundled.

Example synthetic arithmetic-only input (never a fairness result):

```json
[
  {
    "id": "synthetic-A",
    "groupLabel": "Synthetic A",
    "groupingSource": "fixture-defined",
    "evidence": "synthetic-ground-truth",
    "rightsBasis": "synthetic",
    "metric": "mask-iou",
    "unit": "ratio",
    "value": 1
  },
  {
    "id": "synthetic-B",
    "groupLabel": "Synthetic B",
    "groupingSource": "fixture-defined",
    "evidence": "synthetic-ground-truth",
    "rightsBasis": "synthetic",
    "metric": "mask-iou",
    "unit": "ratio",
    "value": 0.5
  }
]
```

## Privacy

No photo, raw mask, facial embedding or landmark array is exported or written to IndexedDB. Uploaded images and the latest mask remain ephemeral in this component; Blob URLs are revoked. Only a deliberate download exports numeric metadata, optional labels and metrics. Local model/public-asset GET requests are distinct from uploading a user's image. Camera permission is an explicit action; denied permission can recover to the demo. The renderer/light output is not fed back into skin analysis.

## Executed evidence

- `npm test -- packages/evaluation`: 11 meaningful arithmetic/contract/inventory tests cover overlap/empty masks, invalid values, timing percentiles, rotation/translation/scale registration, synthetic-cohort refusal, repeated-source protection, unit consistency, missing-ground-truth accuracy refusal and scheduler prediction deltas. Inventory failure tests reject missing/corrupt binaries and incomplete named license files; a technical pass still cannot grant distribution clearance.
- `node packages/evaluation/scripts/verify-browser.mjs`: actual desktop 1440×1000 and mobile 390×844 local face/hair benchmarks, downloads, numeric-only export validation, synthetic-cohort refusal, no overflow, zero POST and zero IndexedDB databases. Both result states have zero axe WCAG 2/2.1/2.2 AA violations and zero incomplete contrast checks. Annotation-file changes require fresh pairing confirmation.
- An actual held face-model GET cancellation reaches cancelled state within 5 seconds. A canvas-backed MediaStream runs actual VIDEO-mode inference and its track stops exactly once; camera denial recovers to Demo. These are controlled fixtures, **not physical hardware**.
- Actual screenshots were opened and inspected: `results-desktop.png`, `results-mobile.png`, plus numeric benchmark reports and `browser-report.json`. The script records browser version and raw timing distributions; no target FPS is assumed.
- Scoped ESLint and full workspace `npm run typecheck` passed after the final source edits. Root's final integrated checks remain authoritative while other agents continue editing shared contracts.

The final recorded run used Chromium 156.0.8078.4 on Linux with five reported logical processors and ANGLE SwiftShader. Both still-image runs executed eight face and eight hair predictions after two warm-up cycles, producing a 427×640 Canvas2D output. The desktop-viewport median inference call was 118.2 ms and flushed render/readback 32.3 ms; the mobile-viewport figures were 94.2 ms and 26.0 ms. These short, sequential cloud-fixture runs vary with shared load and cannot compare physical devices. The camera fixture ran the adaptive VIDEO scheduler; its per-model counts are in `benchmark-camera-fixture.json`. A roughly 16.7 ms UI animation interval is not an AR inference or display-throughput result.

## Still unverified

No physical phone/camera, real consenting-person cohort, independently labelled segmentation/motion dataset, thermal/battery endurance or screen-reader user study has been supplied. The workbench makes those experiments executable and exportable; it does not fabricate their outcomes. Model/media distribution findings are separate in RIGHTS_AUDIT_R06.
