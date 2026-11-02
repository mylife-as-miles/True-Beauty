# Technical review — round 03

Independent targeted follow-up, 2026-11-02. Scope: queued still-image inference, source-epoch protection and camera-to-still transitions. Earlier product-wide limitations and the verified round-02 privacy fixes remain in force.

## Verdict

**HIGH T06 is closed against its original actual-browser reproduction.** Initial model loading no longer causes an uploaded photo's inference to be silently dropped. No new HIGH/CRITICAL defect was reproduced in this targeted follow-up. A narrower MEDIUM source-return defect was found during this review, fixed and independently rechecked: selecting the same demo URL after camera mode now performs fresh still inference.

These checks improve reliability; they do not establish the ≥9 finished-product gate. Provisional technical assessment remains approximately **6.4/10**, limited by incomplete engines and the unverified real-device, fairness and operational gates documented in rounds 01–02.

## Executed evidence

`npx vitest run packages/vision-core tests/critic-regressions.test.ts` — **12/12 tests in 3 files passed**, including the new queue scheduling/recovery cases and the three independent privacy regressions.

Actual Chromium browser checks:

| Check | Observed result |
|---|---|
| Hold the real face model response during initial demo startup; upload valid neutral portrait; release response | While held: `Mapping facial contours…`; after release: `Face mesh connected`, source label `Your photo`. PASS. Previously this permanently reported no face. |
| Upload another valid portrait after queued initialization | `Face mesh connected`. PASS. |
| Start camera using a real canvas-generated MediaStream of another portrait, then Stop camera | Still source returns to `Face mesh connected`; camera track is `ended`. PASS. |
| Return via source-bar Demo portrait | Active worker adapter performs a fresh still analysis. PASS. |
| Return via chooser Warm portrait when its URL equals the prior demo URL | After the follow-up fix, one fresh still analysis starts and completes; camera track ends and current image tracks. PASS; see T07 below. |

The held-response test uses Playwright browser-context routing to delay actual local model bytes. It does not mock face results. The camera check uses a controlled `getUserMedia` fixture returning a real MediaStream; it is not physical-camera verification.

Evidence images:

- `cook/stills/technical-r03/queued-upload-after-held-model.png`
- `cook/stills/technical-r03/camera-stop-to-still.png`
- `cook/stills/technical-r03/same-demo-chooser-fixed.png`

Source inspection confirms explicit still-image calls now queue rather than return an unrelated current snapshot. Video frames may still be dropped while busy, which is appropriate for this scheduled stream. The mirror uses source epochs to discard late image/video/hair results and clears prior snapshot state on the main source transitions. The prior Skin Lab post-inference source-epoch gap was separately fixed and browser-tested by its owning agent; I did not independently repeat that separate Skin Lab case in this round.

## MEDIUM T07 — Same-URL demo chooser return; fixed and verified

The source-bar and portrait-chooser handlers have different return semantics. To reproduce:

1. Let the initial Warm portrait finish tracking.
2. Open camera with a different valid portrait video fixture and let it track.
3. Open Choose a demo portrait and select Warm portrait.

At the reviewed revision, the chooser calls `setSourceUrl` with the already selected URL and does not increment the retry/analysis trigger. The still-image effect therefore does not run. Camera tracks end, but `snapshotRef` retains the last camera geometry and the status still says `Face mesh connected` while displaying the initial still photograph.

I instrumented the **actual active Vite module instance** of `VisionWorkerClient.analyzeImage` after initial setup. Result after choosing the same demo: `{stillInferenceCalls:0, stream:'ended', status:'Face mesh connected'}`. Clicking the source-bar Demo portrait afterward produced `stillInferenceCalls:1` and a fresh result. This distinguishes a truthful fresh still analysis from a status label that merely remained unchanged.

This was reported immediately. The chooser now invalidates the source epoch, clears the snapshot, stops the camera and explicitly increments the refresh trigger even when the URL is unchanged. I repeated the actual-browser counter case after the fix: `{stillInferenceCalls:1, stillInferenceCompletions:1, stream:'ended', status:'Face mesh connected'}`. **T07 is closed against this reproduction.** The screenshot listed above records the corrected return.

## Acceptance limits

No live provider analysis, paid billing, provider retention/deletion, representative-person fairness evaluation, physical-camera tracking/gesture benchmark, real-mobile GPU/thermal measurement, multi-hour resource stability, Firefox/WebKit coverage or production offline journey was established in this round. The source integration is real and traced, but separate notices/model/data rights and full mandatory feature coverage remain unresolved. No whole-project build was repeated in this narrow follow-up.
