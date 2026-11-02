# Interaction review — round 05 baseline

Independent browser review, 2026-11-02. This records the pre-immersive-build interaction baseline on localhost:5173. Scope is the studio editing experience, not backend feature coverage. Read current Studio, LivingMirror, store, shared controls and relevant responsive CSS; exercised the actual UI in Chromium at desktop 1366×768 and touch-layout 390×844. Used bundled public demo portraits only. No full test suite was rerun and no source was edited.

## Top five issues, in priority order

### 1. P1 — Reset makeup destroys unrelated edits and offers no undo

Actual reproduction: Hair → Copper; Style → enable glasses; select Reset makeup. Glasses changes from checked to unchecked, and Enable hair recolouring is also unchecked afterward. The handler replaces the entire structured look with defaults, including hair and accessories. The action label describes a narrower operation than its effect. There are no Undo controls or history in the baseline store/UI, so an accidental click or unwanted preset replacement cannot restore a custom look.

Make Reset affect its stated scope or label it Reset entire look, and provide one-step undo before asking users to explore freely. History should cover presets, shades, intensity, hair and accessories without requiring a save for every experiment. A long slider drag should restore as one meaningful edit.

### 2. P1 — Mobile sticky mirror covers the top of the tool panel

At 390×844, scrolling Intensity into view leaves the sticky `.mirror-column` at y=0–429.66 while `.atelier` occupies y=254.53–684.53. Thus the first approximately **175 px of the editor is underneath the mirror**, including the mode/layer/shade controls. The panel also has its own 429 px scrolling area for 884 px of content. A user editing intensity sees the mirror and lower controls but loses the controls needed to change region or switch Makeup/Hair/Style; returning requires moving the outer page back to the earlier editor position.

The screenshot demonstrates the overlap rather than a mere tight layout. Keep a stable visible tool header below the mirror, or use a viewport-sized editor with a deliberately bounded panel. Test real pointer/touch transitions from intensity back to shades and Hair without relying on Playwright auto-scroll to find hidden controls.

Evidence: `cook/stills/r05-baseline/mobile-editing.png`, `mobile-initial.png`.

### 3. P1 — Typical desktop height cannot show the preview controls and editor together

At 1366×768, the mirror begins at y=244.59 and ends at y=829.59; the source bar occupies y=842.59–886.59. The bottom compare/reset controls, camera source controls and much of the editor fall below the initial viewport. `.atelier` extends to y=986 with visible overflow. Reaching more layers and lower controls scrolls the document, moving the face away from the controls being adjusted. No focus/fullscreen control exists; the Expand-shaped control only resets zoom.

Fit the working mirror and its primary controls to available viewport height and give the editing panel an intentional independent scroll region. A focus mode can help, but a user should not need it just to perform a standard compare or source switch. Verify at 1366×768 and smaller laptop heights, not only tall screenshots.

Evidence: `cook/stills/r05-baseline/desktop-studio.png` and `desktop-current.png` are full-page captures; their full height must not be mistaken for the visible 768 px viewport.

### 4. P2 — Keyboard comparison has an almost invisible focus state

Open Compare before and after, focus the labelled range, press ArrowRight. The value correctly changes to 51, so the native keyboard operation works. However, the entire range has computed `opacity: 0.01`; this also reduces the contrast of its 2 px focus outline to nearly nothing. The visible divider handle does not communicate that the hidden range owns keyboard focus. A keyboard user can change the image while having little visible indication of the active control.

Draw a high-contrast focus treatment on the visible comparison handle/container using `:focus-visible` or `:focus-within`, and expose the current split value there. Keep normal arrow-key range operation. Test a Tab sequence rather than only setting a slider value programmatically.

Evidence: `cook/stills/r05-baseline/keyboard-compare.png`; observed value 51, opacity 0.01, activeElement equal to the range.

### 5. P2 — Navigating away discards the mirror's working view

Actual reproduction: zoom to 115%, enable before/after, open The beauty edit, return to The studio. The view resets to 100% and the comparison range disappears. The look and selected portrait persist, so the rest of the interface suggests continuity while the close-up/inspection state is lost. The same component-local state also owns the split and gesture mode.

Persist ordinary mirror view state across spaces, or retain the working mirror while opening contextual content. Preserve source, look, selected region, zoom and comparison consistently. Camera streams should still stop appropriately on navigation/backgrounding; preserving an editing view does not require keeping camera hardware active.

## Other interaction observations

- Clicking a tracked face region can select an editing layer, and equivalent explicit layer controls exist. The canvas is not keyboard-focusable and its accessible label does not advertise the pointer-region shortcut. Treat region tapping as a shortcut with visible guidance; do not make it the only route into tools.
- The region hit test hardcodes vertical object position 42%, while mobile CSS uses 38%. This is a source-inspected mismatch, not a browser-reproduced wrong-region claim in this baseline; recheck the transformed hit targets if the immersive layout changes crop/zoom.
- Source portrait continuity between studio and Skin Lab now uses shared session state, and the previously reviewed inference/camera lifecycle fixes are present. I did not reproduce the old dropped-upload or late-camera defects during this interaction pass.
- The software-GPU environment correctly exposes Natural colour preview and disables reflective finishes. That is honest fallback behavior; it should not be treated as evidence that hardware shader finishes are working or broken.
- Dialog focus containment is implemented in the shared Modal. I did not run a new exhaustive dialog/assistive-technology audit in this narrow pass.

## New-build review targets

Recheck the five reproductions after the immersive build, especially undo semantics and slider grouping, edit-to-shade transitions on touch, laptop-height fit, compare focus and navigation continuity. Then test region selection after changing zoom, crop, portrait and tool mode. A screenshot that looks larger or more immersive will not by itself establish that these interactions work.
