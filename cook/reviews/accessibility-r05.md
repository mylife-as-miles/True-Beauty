# Round 05: accessibility, privacy and interaction review

Independent read-only review of the Studio, Living Mirror and Skin Lab at `http://127.0.0.1:5173`. Production source was not edited by this reviewer. The implementation owner repaired the defects below; this report distinguishes the initial findings from the final frozen recheck.

**Final outcome:** no unresolved critical or medium WCAG/functional defect found in the inspected interaction set. **Provisional score: 9.0/10 for these surfaces**, not a full-product accessibility certification or a claim that True Beauty's overall acceptance gate has passed.

## Executed scope and evidence

Chromium 154 on Linux, desktop **1440×1000**, mobile viewport **390×844**, tablet **768×1024**. Each viewport covered default Studio, Light, focused mirror, gallery modal, contextual facial-region lens, and Skin Lab's actual model-based region lens: **18 axe scans** using WCAG 2 A/AA, WCAG 2.1 A/AA, WCAG 2.2 AA and best-practice tags. The desktop gallery modal was reached through a legitimate mobile-width resize/open/desktop-width resize, checking responsive continuity as well.

- [Final axe, layout, keyboard and privacy data](../stills/r05-accessibility/final/review-data.json): **zero violations in all 18 states**; all **24 functional/privacy checks passed**.
- [Keyboard visibility and scheduling measurements](../stills/r05-accessibility/final/focus-performance.json).
- [Frozen source commit and file hashes](../stills/r05-accessibility/final/source-state.json). Commit was `f8295f34aa41ab2aea70f7ce0243744b1a346e84` with the reviewed working-tree changes separately hashed.
- [Desktop default](../stills/r05-accessibility/final/desktop-default.png), [mobile default](../stills/r05-accessibility/final/mobile-default.png), [tablet default](../stills/r05-accessibility/final/tablet-default.png).
- [Desktop Light](../stills/r05-accessibility/final/desktop-light.png), [mobile focus](../stills/r05-accessibility/final/mobile-focus.png), [gallery modal](../stills/r05-accessibility/final/desktop-gallery.png), [mobile Skin lens](../stills/r05-accessibility/final/mobile-skin-lens.png).

The initial findings and images remain in the parent `r05-accessibility/` directory; the first recheck is under `recheck/`; the final successful evidence is under `final/`.

## Defects found and independently rechecked

| Finding | Initial evidence | Final result |
|---|---|---|
| **Medium: visible labels differed from accessible names.** The portrait source button, gallery captions, wordmark/tagline and text avatar failed WCAG 2.5.3. The new editing cue also initially used a different override name. | Initial `review-data.json`, axe `label-content-name-mismatch`. Gallery caption name/description lacked a matching text separator; hiding visible words from assistive technology alone did not resolve label-in-name. | **Resolved.** Actual visible names now match; gallery name/description have an explicit separator; the avatar uses an icon; the editing cue uses its natural label. Zero final label-name violations. |
| **Medium: contextual Edit moved mobile keyboard focus to a fully clipped intensity slider.** | [Initial mobile focused slider](../stills/r05-accessibility/mobile-edit-from-makeup.png): target y925–931, visible inspector y549–819, inspector scroll position zero. | **Resolved.** The final slider is focused at y781–787 inside y556–788, after inspector scroll position moves to 152. [Final mobile focus](../stills/r05-accessibility/final/mobile-edit-from-makeup.png). |
| **Medium: F could hide the currently focused navigation control and leave focus on BODY.** The global single-letter shortcut also lacked a disable/remap/focus-scope mechanism. | Initial `focus-performance.json`; W3C [WCAG 2.1.4](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html). | **Resolved.** F outside the editor is ignored; F on editor controls enters focus; Escape exits. Origin focus is retained/restored and modal Escape does not double-toggle the mirror. |
| **Moderate semantic issues:** multiple unnamed complementary landmarks and h1→h3 order after mobile headings were visually removed or Light was selected. | Initial axe `landmark-unique` and `heading-order` results. These are axe best-practice findings, not fabricated WCAG failures. | **Resolved.** Named asides and retained h2 hierarchy; no final semantic violations. |
| **New mobile controls below the product's 44px target.** Focus, gallery opening and contextual action controls were affected. | Initial mobile target rectangles: Focus 36px high; gallery opener 18px high; contextual actions 30×36px. | **Resolved at 390px.** Focus/undo/gallery are 44px high; contextual actions are 44×44px. Geometry exceptions below remain explicitly recorded. |

## Functional accessibility and continuity

- Golden lighting changed real mirror pixels; the direction slider changed its reported value using ArrowRight. Its keyboard focus indicator is visible; Chromium supplies a 1px automatic outline. Skin region controls have a visible 2px solid outline.
- F/Escape preserve the Light panel and selected scene state. Focus is not a navigation/remount operation.
- Gallery arrow keys select a real look; repeated Tab and Shift+Tab remain inside the modal; Escape closes it. A separate [nested-focus check](../stills/r05-accessibility/final/nested-focus.json) entered focus, opened the gallery, closed only the gallery on the first Escape, then exited focus and restored the Focus mirror control on the second Escape.
- Skin Lab's local model actually supplies region coordinates. The skin-region control changes the focused region and zoom, has a keyboard alternative to touching the image, and displays the corresponding reading.
- No horizontal document overflow occurred in any of the 18 final states.
- Reduced motion was requested in all review contexts. Skin portrait transforms have zero transition duration; no running DOM animations remained in the sampled reduced-motion state. The mirror and gallery transitions also measure 0s, and gallery navigation requests `scrollIntoView({behavior:"auto"})`; see `final/reduced-motion.json`.

## Privacy and camera regression

Across all three contexts, the tested local operations issued **zero POST requests**. IndexedDB counts stayed at **zero** for `mediaAssets`, `savedLooks`, `skinScans`, `skinObservations`, `agentEpisodes` and `memoryNodes`. Selecting lights, entering focus, browsing looks and reading local colours did not silently store raw photos or analysis history.

The existing actual-UI delayed-camera-result regression was also executed on Chromium desktop and the mobile project: **2/2 passed** in 11.0 seconds. After leaving Skin Lab, the delayed fixture track was stopped exactly once. Artifacts are under `camera-regression/`. This is a controlled permission/track fixture, not a physical-camera hardware claim.

## Performance observation and remaining limits

The actual rendered mode was **Canvas2D, adaptive quality**. In short 1.2-second idle/Light samples on desktop and mobile, rAF interval p50 was **16.7ms** and p95 **16.7ms**; the final samples recorded no long tasks. These are main-thread scheduling observations, **not an AR frame-rate benchmark**, moving-face inference rate or mobile hardware result.

Recorded geometry exceptions: desktop/tablet contextual buttons remain 30×36px; the tablet gallery opener is 94×18px; the full-width editing cue is 25px high on desktop/tablet and 28px on mobile. Axe's WCAG 2.2 minimum-target/spacing rule found no violation. These dimensions must not be described as universally meeting a 44px product target; extending the larger touch geometry to tablet remains a useful improvement.

This review used one supplied demo portrait and browser viewport emulation. Physical touch devices, VoiceOver/NVDA behavior, zoomed operating-system text, arbitrary user-photo contrast, sustained camera performance and the other product spaces are not certified by this evidence.
