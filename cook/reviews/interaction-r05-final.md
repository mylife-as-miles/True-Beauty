# Independent interaction review — round 05 final

Reviewed 2026-11-02 against the running application on localhost:5173. Scope: the new studio, gallery, lighting, history, source continuity, keyboard behavior, responsive layout and related privacy handling. Read active implementation and exercised real browser behavior; did not edit source or rerun the full unit suite. Only bundled public demo portraits were used. Camera-denial checks use a controlled browser permission fixture.

## Judgment

**All five baseline findings are closed against the reviewed reproductions.** Four further concrete interaction defects were found during this round, reported, fixed and independently rechecked. No unresolved P1 or P2 defect remains from these specific cases at this checkpoint.

Provisional assessment for the reviewed interaction flows: **8/10**. This is a substantial improvement over the baseline, not a ≥9 product or AR-realism certification. The evidence below establishes usable behavior and genuine pixel changes within the tested environment. It does not establish hardware WebGL material parity, physical-camera operation, real touch devices or cross-browser accessibility.

## Baseline fixes independently verified

| Baseline issue | Final observed behavior |
|---|---|
| Reset makeup discarded hair/accessories without undo | Copper hair and enabled glasses both remain enabled after Reset makeup. Makeup reset is recorded in history and can be undone. |
| Mobile sticky mirror covered tool tabs | At 390×844, the final mirror ends at y=538.77 and the tool panel starts at y=548.77. Tabs receive pointer hits; switching Hair → Style works. |
| Laptop-height mirror and controls extended beyond viewport | At 1366×768, mirror is y=229.36–649.97, source controls y=658.97–712.97, editor ends at y=737.36 with its own scrolling. Primary controls and reflection fit together. |
| Comparison had invisible keyboard focus | ArrowRight moves split to 51%; the visible handle receives a 3 px dark outline and 7 px light halo. |
| Navigation discarded mirror view state | Zoom 115%, comparison enabled and split 51% survive The beauty edit → The studio, together with the current look and light. |

The pointer Intensity drag used twelve intermediate moves and created **one** history entry (past count 3→4). Undo restored opacity **0.78**, redo restored **0.18**. A light-direction drag likewise created one history entry and its undo moved that entry into future history. View-only operations did not discard redo history in the tested navigation case.

## New defects found, fixed and rechecked

### I05-01 — Escape and undo shortcuts were ignored inside a range input

Initial actual-browser result: Focus mode stayed enabled after Escape while Intensity owned focus. Two arrow increments changed opacity 0.55→0.57; Ctrl+Z left 0.57 unchanged. The text-input guard ran before Escape and also excluded non-text range controls from edit shortcuts.

After the fix, Ctrl+Z from Intensity changed 56→55. F entered focus and Escape from the same range exited it. Native text-editing fields retain their own editing behavior. **Closed against these cases.**

### I05-02 — Tablet CSS hid Undo/Redo

At 768×1024, the first review found `.edit-history` set to `display:none` despite an actual hair edit. A touch-only user had no visible undo control.

After the fix, Undo is visible on both tablet and mobile. The camera-denial recovery check also completes on tablet. **Closed against these cases.**

### I05-03 — Hair disclosure intercepted mobile tool-tab taps

Exact initial reproduction: reject camera permission; open Hair; enable recoloring; attempt Style. The absolute `.mirror-column > .fine-print` paragraph occupied y=522.48–579.67, over the Style button at y=538.48–577.48. `elementFromPoint` returned that paragraph, and the ordinary browser click timed out with pointer interception. This was an actual interaction blocker, not an automation timing issue or the permission alert itself.

The redundant mirror disclosure was removed while retaining the capability explanation in the inspector, and the gesture disclosure was moved into bounded normal flow. After the fix, **camera denial → Hair enable → Style → glasses checked** completes on both mobile and tablet. **Closed against these cases.**

### I05-04 — Region lens could not leave the Light inspector

Initial result: Foundation → Light → tap visible lips → Edit selected region. The lens correctly selected lipstick, but the Light heading stayed visible and Intensity did not exist. Component-local `lightingOpen` overrode shared studio mode.

After moving Light into the shared tool mode, repeating the sequence shows Intensity, removes the Light heading and sets `document.activeElement.id` to `intensity`. **Closed against this case.**

## Genuine rendering and source evidence

The application reported **`data-renderer="canvas2d"`** in the tested headless Chromium adaptive path. These measurements establish real output changes in that path, not hardware WebGL verification.

| Actual UI action | Observed canvas change |
|---|---:|
| Default look → After hours | 11,306 / 540,000 pixels changed; mean RGB-channel difference 0.150 on an 8-bit scale |
| After hours → Golden lighting | 513,696 / 540,000 pixels changed; mean channel difference 4.963 |
| Golden → Moonlight | 534,987 / 540,000 pixels changed; mean channel difference 10.051 |

Changed-pixel counts use a summed RGB difference greater than 3. These numbers prove the controls affect actual rendering; they are not a realism, efficacy or perceptual-quality metric.

Matte, Glossy, Shimmer and Glitter each produced a distinct SHA-256 of the rendered canvas through the real controls. Their physical plausibility and consistency with hardware rendering were not scored by the hash comparison.

After Golden lighting, navigating to Skin Lab produced an original 600×900 portrait canvas with **zero differing channels** versus a freshly decoded original image drawn at the same dimensions. Creative grading therefore did not contaminate that tested analysis input.

The gallery reaches its ready state using `data-vision-source="shared"` and the mirror's 478-point snapshot. Source inspection confirms the gallery waits for the supplied snapshot rather than creating its own tracker in this mode. Browser worker accounting after edits/navigation showed **one active vision worker**; five were created over the run, including remount/StrictMode lifetimes, and the others closed. This is scoped evidence of sharing and cleanup, not a long-run memory or whole-application inference benchmark.

## Responsive, gallery and privacy checks

- Final 320, 360 and 390 px layouts have document widths equal to their viewport widths. Save stays inside the visible sheet. The mirror/editor gap is 10 px and the editor ends at y≈819 within the tested 844 px height. The two smaller layouts use five shade columns with at least 44 px column widths; 390 px uses six columns around 45.5 px.
- At 390×667, ordinary document scrolling is still necessary to reach the bottom of the bounded tool panel. No pointer-blocking overlap was found in that shorter-height case, but the whole workspace does not fit without scrolling.
- The full gallery modal remains open after Next look and Apply. See in the mirror explicitly closes it. This avoids losing the browsing surface after every selection.
- The face hit test now reads the actual CSS object position, covering the earlier source-inspected 42%/38% mismatch. Computed lip points at 130% zoom hit the canvas on desktop and mobile; the later Foundation → Light → lips sequence also confirms actual region selection changes the editing context.
- Deleting local data through the actual settings flow clears past/future/editStart, restores default makeup/source and disables Undo. Undo cannot resurrect the tested edits afterward. The history snapshots contain look controls and lighting, not raw source photographs. This is a targeted regression check, not a renewed audit of every persistence/consent boundary.

## Evidence

All files are under `cook/stills/r05-technical/`:

- `desktop-initial.png`, `desktop-light.png`, `compare-keyboard.png`
- `mobile-editing.png`, `tablet-editing.png`, `short-mobile-editing.png`
- `mobile-camera-denial-hair.png` records the discovered blocker
- `mobile-denial-recovered.png`, `tablet-denial-recovered.png` record corrected behavior
- `region-edit-while-light.png` records the discovered context failure; `region-light-fixed.png` records correction
- `final-mobile-320.png`, `final-mobile-360.png`, `final-mobile-390.png`
- `skin-original-after-golden.png`, `privacy-history-cleared.png`

Some evidence captures intentionally preserve a defect before its fix. Use the corrected files and final outcomes above when judging the final build.

## Limits of this review

No full unit/build/lint rerun was performed by this reviewer; the root agent owns those final checks. This review used headless Chromium and layout/touch emulation, not actual iOS/Android, Firefox/WebKit, assistive technology or a physical camera. Detailed hardware WebGL finishes, GPU/thermal cost, lighting realism across complexions, and long-duration frame/resource stability remain unverified here. Those limits prevent a ≥9 claim from this interaction evidence alone.
