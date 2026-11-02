# Skin Lab interaction round 05

## Brief

Make the existing Skin Lab a useful portrait workspace within the warm editorial True Beauty interface. Preserve real local inference, unprocessed source pixels, consented history, routines, currency handling and session portrait continuity. Add exploration and explicit mirror actions without inventing skin-health measurements.

## Implemented

- **Three contextual colour lenses.** Skin uses a real detected cheek landmark; eyes anchor to a detected iris landmark; hair uses the centroid of confident pixels in the actual hair mask. A region is disabled when its geometry is unavailable. The on-portrait lens buttons and a labelled keyboard/touch region rail invoke the same action.
- **Focus, zoom and reset.** Selecting a region pans and zooms its portrait view, with bounded pan, adjustable 100–300% zoom and a full-view reset. The canvas pixel buffer is untouched: CSS transforms and HTML overlays provide the visible interaction. Reduced-motion settings remove transitions. An explicit “Explore the colour regions” action connects the palette panel to the portrait on smaller screens.
- **Explainable colour context.** The focused region shows the current swatch, whether it came from the portrait or a user correction, what pixels were sampled, and why lighting/makeup/reflections or iris resolution affect the result. A correction action opens the existing editable swatch control. No face-health percentages, diagnosis, clinical phototype or fabricated concern map is added.
- **Missing inputs stay missing.** Default example hair/eye swatches no longer silently enter the season analysis when they have not been sampled or explicitly selected by the user. The existing analysis algorithm lowers confidence for missing features. Its percentage remains explicitly described as a rough, unvalidated styling guide.
- **Palette-to-mirror action.** Each labelled palette shade is a real button. Selecting it applies that exact colour to the shared lipstick layer, enables the layer, and returns to the mirror with the same temporary session portrait. No external service or paid operation is involved.
- **Hierarchy and material.** Reduced redundant outer padding, a larger portrait, a quiet warm zoom toolbar, subtle rose selection states, clearer primary local-read action and named palette swatches. No marketing KPI cards or invented performance numbers were added.

## Preserved behavior

The seven prior Skin Lab journeys remain covered: actual local inference; explicitly consented history save/reload/delete; self-reported profile and budgeted routines plus journal completion; manual colour correction and truthful provider unavailable state; late camera-permission cleanup; USD preservation and missing-currency pricing; stale-source result rejection; and portrait continuity. Some journeys combine related checks in one test. The shared portrait remains ephemeral and the store owns blob URL revocation; these new controls do not persist photographs.

## Browser verification

- `npx playwright test tests/e2e/skin.spec.ts tests/e2e/skin-lenses.spec.ts --project=chromium --project=mobile --output=test-results/skin-r05-final`: **18/18 passed**, 54.7 seconds. This covers seven existing and two new test cases at desktop and an emulated iPhone viewport.
- After adding the explicit portrait exploration link, testing direct on-image controls, and improving mobile palette readability: the two new cases passed **4/4**, 11.9 seconds.
- New region test runs actual MediaPipe inference, focuses skin/hair/eyes, exercises zoom/reset, activates a region with Enter under reduced motion, and clicks an on-image lens. It hashes the entire raw portrait pixel buffer before/after these actions and verifies the SHA256 is unchanged.
- New palette test uploads an image, corrects a swatch, selects a palette colour, verifies the actual lipstick colour control in the mirror and checks the same session portrait when returning to Skin Lab. It records zero paid skin-task requests.
- Full TypeScript checking and targeted ESLint passed after integration. No new model-performance or real-device FPS claim is made.

## Visual evidence

Actual browser screenshots:

- `cook/stills/r05/skin-colour-chromium.png`
- `cook/stills/r05/skin-colour-mobile.png`
- `cook/stills/r05/skin-lenses-chromium.png`
- `cook/stills/r05/skin-lenses-mobile.png`
- `cook/stills/r05/skin-to-mirror-chromium.png`
- `cook/stills/r05/skin-to-mirror-mobile.png`

These are real application captures, not generated interface images. Early screenshot captures made while the page was scrolled showed a fixed skip-link capture artifact; the capture now starts from page top before the full-page still. No product element was hidden to improve the still.

## Review limits and next checks

- Skin/hair/eye colour estimation remains sensitive to source lighting, makeup, image resolution and segmentation quality. It is a styling aid with user correction, not a clinical assessment or calibrated colour instrument.
- The hair lens is based on a segmentation mask, not skeletal hair tracking or a hairstyle model.
- Browser tests verify interaction and pixel preservation on supplied portraits. They do not validate demographic accuracy or performance on physical mobile devices.
- Provider skin analysis remains unavailable without credentials, reviewed pricing and explicit per-request consent. This round does not claim live provider integration.
- Overall product quality still requires independent visual/product/technical review. Passing these tests is not a 9/10 product score.

## Independent iris-marker correction

The visual critic correctly found the eye marker above the visible iris. Source inspection showed that iris sampling already uses actual centres 468/473 and points 60% of the way towards their surrounding limbus landmarks (469–472 and 474–477). The sampling code was not moved. The display bug was that a flex button centred its combined ring, gap and label at the landmark; the ring itself therefore sat above the anchor.

The marker now has a fixed 44px interaction box whose ring is absolutely centred at the exact landmark, while the caption sits separately below it. No anatomical coordinate was shifted to make the screenshot look better. This also corrects the skin/hair marker stack alignment.

The region browser test now captures genuine returned MediaPipe landmark 468, projects it through the actual source canvas rectangle, and compares that target with the rendered eye ring's centre at both 100% and 240% zoom. Both views must be within **1.5 CSS pixels**. This regression and the palette-to-mirror case passed **4/4 desktop/mobile**, 14.9 seconds. Raw source pixels remain unchanged. Updated stills are the existing `cook/stills/r05/skin-colour-*.png` and `skin-lenses-*.png`; they were inspected and show the ring centred within the visible iris.

This verifies display alignment with the actual landmark output; it does not claim iris segmentation accuracy under occlusion or replace user correction of the colour sample.

## Selected-region viewport correction

A second independent visual review found that activating a region from the rail below the portrait could leave the selected feature above the viewport. The previous action scrolled the whole portrait synchronously before its new pose/context committed. The action now waits for that commit, checks the selected ring against the actual visual viewport with a 48px comfort margin, and recentres the marker only when it is outside that area. A feature already in view does not cause a scroll. Reduced motion uses an immediate scroll.

The real browser test now requires both eye and hair rings to be fully within the viewport after their rail actions (`toBeInViewport({ratio:1})`), rather than checking selected state alone. It also selects an already-visible on-image eye lens and verifies that document scroll changes by no more than 1 CSS pixel. Region and palette cases passed **4/4 desktop/mobile**, 21.3 seconds. TypeScript and targeted ESLint passed.

`cook/stills/r05/skin-eyes-in-viewport-chromium.png` and `skin-eyes-in-viewport-mobile.png` capture the actual viewport immediately after the rail-driven eye selection, before the later full-page screenshot reset. They demonstrate the selected feature in view rather than inferring visibility from its stored state.

## Palette editor handoff correction

Product review found that applying a Skin Lab palette shade while the studio's Light inspector was selected returned to that unrelated inspector. The shade action now explicitly selects the lipstick layer and Makeup studio mode alongside applying the colour; it preserves the portrait and lighting scene.

The palette browser case now starts by selecting Foundation, then Light → Golden, before opening Skin Lab. After applying a palette shade it verifies that Makeup is active, the visible “Enable Lip colour” checkbox is checked, the exact shade is in the colour control, and the same session portrait remains. Chromium desktop and mobile passed **2/2**, 6.1 seconds. No shared-store implementation was changed for this correction.
