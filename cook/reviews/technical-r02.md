# Technical, security and fairness review — round 02

Independent targeted follow-up, 2026-11-02. Scope: the round-01 privacy, camera, comparison and currency fixes. This does not supersede the unverified product-wide gates in round 01.

## Verdict

The original three HIGH privacy/lifecycle defects are closed against the independent reproductions below. The comparison-coordinate and Skin Lab currency fixes also pass targeted checks. **A newly reproduced HIGH source-transition defect remains open at this checkpoint:** uploading while the initial demo inference is busy can permanently skip inference for the uploaded photo. A ≥9 acceptance score remains unsupported. Provisional technical assessment: **6.3/10**, with substantial remaining product/evaluation work.

## Verified fixes

| Round-01 finding | Independent result |
|---|---|
| T01 concurrent preference/photo writes survive revocation | PASS. Both independent concurrent save/revoke cases now leave permission false and zero retained records. |
| T02 old backup restores revoked preference text through attributed consultations | PASS. Nodes, episodes, messages and tool records remain absent after importing the old backup under revoked preference permission. |
| T03 late Skin Lab camera stream survives unmount | PASS in actual Chromium UI with a delayed permission fixture returning a real MediaStream. Camera → Back to mirror → resolve pending permission now yields `{lateTrack:'ended', skinStillMounted:false}`. |
| T04 rendered split differs from divider under crop/zoom | PASS after both the coordinate conversion and ResizeObserver fixes. Exact metrics below. |
| T05 Skin Lab reinterprets/overwrites saved currency | PASS in actual UI. USD 100 appears as USD 100; Save my preferences preserves `{currency:'USD', budget:100}`; routine result is `US$48.00 sample total · no exchange conversion`. |

Executed independently: `npx vitest run tests/critic-regressions.test.ts packages/local-database packages/beauty-memory packages/agent-runtime` — **34/34 tests in 4 files passed**. An intermediate run exposed an existing recommendation-fixture failure during the allocator changes; the final targeted rerun passed. These are local contract tests, not live API evidence. A new whole-project build was not repeated in this targeted follow-up; round 01's build passed before these fixes.

The revised consent implementation now locks consent reads with writes. Import derives eligible node IDs, then attributed episodes, then child messages/tools in the same transaction. Originating remember operations also attribute their new node to the consultation, closing the prior provenance omission.

### Display-space split evidence

Actual Chromium, uploaded 1200×900 landscape image, renderer canvas 960×720. I instrumented the actual renderer module instance to record the supplied `beforeAfter` source fraction, then mapped that boundary through the DOM's real cover/zoom geometry. This establishes coordinate consistency; it does not establish cosmetic realism or detection accuracy on that padded image.

| Case | Source split supplied | DOM divider | Mapped rendered boundary |
|---|---:|---:|---:|
| 1100×950 viewport; frame 542×550; split 25%; zoom 100% | 0.31522727 | 135.5 px | 135.500 px |
| Same; zoom 130% | 0.35786713 | 135.5 px | 135.500 px |
| Resize to 850×950; frame 465×570; zoom 130%, after ResizeObserver fix | 0.38233806 | 116.25 px | 116.250 px |

Before the ResizeObserver fix, the final case still diverged by 24.18 px; its corrected rerun passes. Evidence:

- `cook/stills/technical-r02/compare-landscape-25.png`
- `cook/stills/technical-r02/compare-landscape-zoom130.png`
- `cook/stills/technical-r02/compare-after-resize-fixed.png` (also visually inspected)
- `cook/stills/technical-r02/currency-usd100.png`

## New open HIGH T06 — Uploaded source inference is dropped while another analysis is busy

Deterministic actual-browser reproduction, without mocking model results:

1. Use a Playwright **browser-context** route to hold the real `/models/face_landmarker.task` response during initial demo startup.
2. Once the request begins, upload the valid bundled `portrait-neutral.jpg` through the real upload control.
3. The UI immediately reports `No face found. Try a clear, front-facing portrait.`
4. Release the real model response; wait 2.5 seconds. The UI still reports no face, with no completed upload inference.
5. Upload a different valid `portrait-2.jpg` after the worker becomes idle: the UI reports `Face mesh connected`.

`VisionWorkerClient.analyzeImage` returns its existing snapshot when busy, and the mirror treats that as the requested image's result. The original demo effect's eventual result is discarded after source change. The uploaded source is never queued or retried. A similar fast source swap can accept geometry belonging to a previous image. This makes the immediate-upload journey unreliable and can detach effects from the selected photo.

Required fix: serialize still-image inference or queue/retry the latest selected source with an epoch; discard snapshots whose source epoch no longer matches the visible source. Re-run the delayed-initial-model reproduction and rapid source-swap case. Reported immediately to the implementation lead. **This finding is not closed by the 34 passing persistence/agent tests.**

Related source-inspected gap, not independently browser-reproduced here: `SkinLab.inspectLocal` captures an image before awaiting inference, checks only component lifetime afterward and can apply old-image swatches after a new upload. The new file-read epoch guard should also gate local inference results. Upload controls remain active while local inference is busy.

## Remaining acceptance limits

The consolidated `docs/SOURCE_INTEGRATION_MATRIX.md` now links pinned commits, actual active contributions, verification artifacts and separate license/model/data gaps. That is useful traceability, and the earlier review confirmed real use of all four source contributions. I did not independently execute every newly listed optional OpenCV backend in this follow-up.

No exposed key or demonstrated user-controlled SSRF was found in the earlier targeted security inspection. This follow-up found no new API security defect, but did not verify a live provider, billing SKU, provider deletion/retention or commercial model rights.

Provider skin analysis and realistic hair/fashion generation remain unconfigured. Fairness/accuracy across representative people, physical-camera tracking, mobile performance/thermals, Firefox/WebKit, long-run resource stability, and production offline journeys remain unverified. The original missing-input swatch provenance/uncertainty concern remains open. A consented, honestly labelled local subset is useful; it is not evidence that all mandatory engines and journeys meet the finished-product gate.
