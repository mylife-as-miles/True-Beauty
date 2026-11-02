# Independent product review — round 05

Reviewed 2026-11-02 against the actual application at `http://127.0.0.1:5173`, HEAD `f8295f3` plus the active round-05 working tree. Chromium headless on Linux; 1366×768 desktop and 390×844 touch/mobile emulation, reduced motion. The reviewer used bundled demo portraits and a controlled camera-permission rejection. No real person image was uploaded remotely, no paid call ran, and no physical camera or phone was available.

This reviewer did not implement the round-05 studio, lighting, Skin Lab lens or redesigned spatial canvas. The reviewer did author an earlier fashion/commerce scaffold and initial board in round 01; this is an independent review of the later implementation, not a claim of zero project context. No application code was edited during this review.

## Judgment

The available local experience is materially more useful and immersive than round 04. The improvement comes from connected actions: the same portrait can be explored, graded, edited, compared and used as the context for colour and product exploration. The spatial canvas now leads somewhere useful instead of being a board of disconnected objects. This is a substantial application, not a decorative landing page.

**The full True Beauty acceptance bar remains unmet.** A polished local editor does not supply genuine provider skin-concern analysis, generative clothing/hairstyle models, the complete accessory set, validated live-device vision or the rest of the full directive. No ≥9 full-product or shader-realism certification follows from this review.

These are qualitative critic judgments, not measured completion or accuracy percentages:

| Product dimension | Score /10 | Basis |
|---|---:|---|
| Usefulness of available local UX | 8.4 | Immediate demo, actual look/material/light controls, recoverable exploration, contextual colour and exact-product handoffs |
| Discoverability and task clarity | 8.3 | Explicit source/framing/focus controls, all six looks, named region alternatives and useful canvas object index; some nested inspector scrolling remains |
| Cross-space continuity | 8.5 | Same portrait and editable scene, actual palette→correct makeup layer, exact product/variant context and restored canvas selection; Skin handoff defect was fixed and rechecked |
| Immersive exploration | 8.3 | Dominant mirror, meaningful focus, contextual region reading and functional pan/zoom/object lens; mobile lens still requires a dismissal before some object-index taps |
| Capability honesty | 8.8 | Local sampling, heuristic confidence, cosmetic previews, original packaging illustrations, sample prices and unavailable providers are distinguished |
| Complete original directive scope | 3.5 | Foundational remote/generative, advanced vision/accessory, commerce-data and complete agent/planning capabilities remain incomplete or externally blocked |

These local scores must not be combined to hide the full-scope gate failure. Hardware material realism, fairness, physical-camera performance and the weighted engineering score are outside this product-only assessment.

## Comparison with the round-04 capture

I inspected `cook/stills/r04/studio-desktop.png` alongside the current first-visit captures. The old capture is a taller full-page image, so this is a qualitative comparison, not a same-viewport pixel score. The earlier studio offered four prominent preset rows and a close fixed crop; the new studio exposes all six subject-aligned colour studies and explicit Full portrait / Focus controls. In the old software-renderer capture Glossy/Shimmer/Glitter were visibly unavailable; the current finish/detail interaction produces visible cosmetic output in the tested path. That is an improvement in what a user can do, while physical material fidelity remains a separate unverified bar. The current laptop-height capture places source controls and the bounded inspector alongside the reflection, improving the actual editing task over simply making the portrait larger.

## Actual workflows exercised

### First visit and look exploration

A fresh browser enters a functioning portrait mirror without account creation. The portrait source is labelled, local processing is disclosed, and Open camera / Upload photo are visible. Six look objects use the same current portrait; selecting After hours changes the visible applied look. Full portrait changes framing, and Fill mirror restores the closer working view.

At laptop height the portrait and primary source controls can be used together, unlike the recorded round-05 baseline. The bounded inspector is scrollable; it no longer requires taking the whole portrait away to reach a finish. The later visible “More controls below” cue makes the intentional scroll region clearer.

On mobile, The look edit opens a real gallery. Next look selects Rose hour, the dialog remains available for further browsing, and See in the mirror explicitly closes it. This is useful progressive disclosure rather than eleven competing navigation tabs.

### Materials, light and focus

Actual Enhance detail, Glitter and Golden light controls were operated. The portrait visibly changed, and the UI exposes the selected finish/light. Full portrait versus Fill mirror gives a meaningful composition choice. Focus mirror works; Escape while Intensity owns focus exits it. The F shortcut was separately exercised against actual button labels.

These observations establish usable controls and visible effects, not realistic light transport, hardware parity or a numerical shader-quality score. Root was still checking material hue parity during this review; earlier captures must not be presented as certification of that final engine fix.

### Camera denial and reversible experimentation

A controlled browser rejection yields: “Camera permission was declined. Allow camera access in browser settings, or use a portrait instead.” The interface remains usable; Demo portrait returns to Face mesh connected. This was independently repeated on desktop and mobile. No physical live-camera success is claimed.

In the desktop actual UI: Copper hair + glasses + 31% lip intensity → Reset makeup kept both hair and glasses enabled. Undo restored the intensity to 31. This closes the earlier destructive-scope product problem: exploration is now recoverable without saving a named look before every change.

### Skin lens → palette → mirror

Read my colours locally processes the portrait, and the Hair region lens opens a readable explanation of what was sampled and what can affect it. The explicit Look closer region controls provide a useful alternative to precise clicking. Correctable swatches and the description of heuristic confidence remain visible; no ordinary photograph is presented as a clinical skin diagnosis.

A genuine stale-context defect was found: Foundation → Light → Golden → Skin → palette shade initially returned to the Light inspector while the toast told the user to adjust finish/intensity. This was reported immediately. The principal agent changed the handoff, and this reviewer independently repeated it on desktop and mobile. **Closed:** Makeup is pressed, the Lip colour heading appears, and Intensity is visible after choosing the palette shade. The same portrait remains the context.

### Canvas palette → mirror, exact product and return

On both desktop and mobile: select Colour palette from Objects on your board → Cheeks → #B76C63 → See it in my mirror. Actual UI shows Makeup selected, Blush as the current layer and #B76C63 in the control. The handoff preserves the intended target, not just a colour value.

Select O FACE Satin Lipstick → Berry muse → Explore this product. The actual product dialog opens the named product with Berry muse selected, rather than a generic catalogue. Its price is explicitly a sample budget price, ingredients an illustrative subset, packaging an original illustration, and the lack of a cheaper reference is stated rather than inventing a dupe. Returning to the canvas restores the selected product and shade. This is meaningful continuity.

The new object index is valuable: a user can reach a small or off-screen object through a named control. Fit all, zoom and empty-space/keyboard pan were separately exercised; recorded results are in `spatial.json`: desktop fit 95% → zoom 105%, keyboard horizontal scroll 55→125, pointer drag 125→75; mobile fit 35% → zoom 45%, keyboard scroll 49→119, pointer drag 119→69. They should be judged from actual board scroll/view changes, not by assuming every pan changes a CSS transform.

## Findings and remaining friction

### P2 — Skin palette returned to the wrong inspector — closed

Before: the applied lip shade returned into Light, making the suggested finish/intensity adjustment undiscoverable. After: actual desktop/mobile DOM now opens Makeup → Lip colour with Intensity available. Evidence: `09-skin-shade-mirror.png` preserves the defect; `desktop-final-skin-palette-fixed.png` and `mobile-final-skin-palette-fixed.png` preserve the corrected state. Do not use the older image as the final result.

### P2 — Mobile colour toast covered the next action — fix independently rechecked

The first mobile palette capture shows the global “applied to your blush” toast lying over the bottom See it in my mirror button. This was reported immediately. The designer removed the redundant toast in favour of the lens’s existing inline applied-colour status. The final mobile spatial/feedback probe found **zero global toasts** after the colour action, and the action itself received the centre pointer hit with text “See it in my mirror.” The final screenshot was visually inspected. **Closed against this reproduction.** See `mobile-final-palette-feedback.png` and `spatial.json`; earlier palette captures intentionally preserve the defect.

### P3 — Mobile inspector covers part of the object index — recoverable friction remains

At 390×844, returning from the mirror restores the open palette sheet. A direct attempt to select O FACE Satin Lipstick in the object index is intercepted by the sheet. An actual pointer hit at the product index centre returned “Selected object inspector.” Closing the visible inspector makes the product reachable, and the full product handoff then succeeds. This is not a dead end or an inaccessible close control, but it interrupts the otherwise fluid “one detail leads to another” exploration. A collapsed sheet state or accessible object switcher above the sheet would reduce the extra step.

### P3 — Camera-error recovery could be more specific

The permission error ends with Retry tracking. The separate Open camera action remains clear and usable, so this is not a blocker, but “retry tracking” is weaker guidance for a rejected permission than retrying the camera or explicitly returning to portrait. Keep the successful portrait alternative prominent.

## Reference principles

Compared with the source-studied Proofline philosophy, the strongest implementation is selecting a region/object and receiving its explanation/actions in place, with a named control alternative. Skin’s region reading and the canvas’s palette/product lens now perform that work. Proofline code/assets were not copied, and this review did not browser-run the source application.

Compared with Common Table’s source-studied spatial/state continuity, pan/zoom alone would be insufficient. The actual palette→mirror→canvas and product→detail→canvas journeys now retain intent, selected object and shade, which makes the spatial surface useful. The mobile sheet interruption is the remaining weak point in that connection. No screenshot similarity score is assigned to a reference application that was not run.

## Evidence and limits

Evidence directory: `cook/stills/r05-product/`.

- First visit, After hours, full portrait, enhanced finish, Golden light, focus, camera denial and Skin lens: numbered stills plus final desktop/mobile captures.
- Canvas palette, target makeup layer, product lens, exact product dialog and restored context: `desktop-*` / `mobile-*` stills and `context.json`.
- Skin fix, mobile gallery, camera denial and Focus/Escape: `final-recheck.json` and corresponding final stills.
- Spatial fit/zoom/pan, F shortcut and final mobile colour feedback: `spatial.json` and spatial/final-feedback stills.
- Actual session recordings in `video/`; exploratory inspection scripts retained alongside evidence.

The early exploratory `flows.mjs` dynamically imported a separate stale HMR store module. Those default debug values were excluded from `flows.json` and are **not** used to establish scene changes or persistence. Findings and final checks use actual rendered DOM controls, screenshots and browser interactions. One initial locator assumed tabs after the controls were correctly changed to a button group; that script error is not an application defect. An initial spatial probe watched CSS transforms although panning uses board scroll offsets; the corrected probe records offsets.

No whole test-suite/build/lint claim is made by this reviewer. No live paid API, physical camera, physical iOS/Android device, calibrated complexion/lighting evaluation, hardware WebGL benchmark, browser accessibility certification or full-product gate is inferred from the local interactions. No nonfunctional button was found among the final actions exercised here, with the mobile index obstruction and recovery documented above.

## Product priority after this UX pass

Connect a complete occasion/look plan to real user-owned products, exact variants, editable routine, total budget and inspectable permitted evidence in one saved artifact. Preserve the new mirror/canvas continuity. Genuine provider activation, licensed generative inference and physical-device/representative validation remain separate foundational work; additional visual polish cannot substitute for them.
