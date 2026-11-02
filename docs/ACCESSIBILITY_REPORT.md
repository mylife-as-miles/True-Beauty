# Accessibility verification

Independent review dated 2026-11-02. This report describes executed checks and their limits; it is not a WCAG conformance certificate or a passing full-product acceptance score.

## Automated result

`@axe-core/playwright` / axe-core 4.14.0 scanned the actual application at `http://127.0.0.1:5173` in Chromium 156.0.8078.4 on Linux. Two fresh browser contexts used 1440×1000 desktop and 390×844 mobile/touch viewports. Each began with no preference/history consent or saved memories.

**26 state/viewport scans: zero automated violations** under `wcag2a`, `wcag2aa` and `wcag21aa`. The final completed artifact has no unresolved execution errors. Evidence: `cook/metrics/axe-final.json`; reproducible drivers: `cook/metrics/axe-final.mjs` and the bounded mobile supplement `axe-mobile-supplement.mjs`.

| Actual state | Desktop | Mobile |
|---|---|---|
| Studio with real portrait inference | 0 violations | 0 violations |
| Discovery catalog | 0 | 0 |
| Product detail dialog | 0 | 0 |
| Interactive 3D packaging study | 0 | 0 |
| Skin Lab color space | 0 | 0 |
| Skin Lab care space | 0 | 0 |
| Empty Journal | 0 | 0 |
| Privacy permissions dialog | 0 | 0 |
| Empty BeautyGraph dialog | 0 | 0 |
| Data/backup dialog | 0 | 0 |
| Empty local Agent dialog | 0 | 0 |
| Actual wedding budget-plan response | 0 | 0 |
| Routine editor dialog | 0 | 0 |

The scan still reports **52 incomplete node occurrences**, all `color-contrast`, across these states. These are repeated occurrences, not necessarily 52 unique components. Axe cannot establish some image/transparent-background contrast combinations automatically, particularly mirror overlays and overlapping/scrolling content. They require manual review; zero violations must not be described as “all contrast passed.” Generic-div naming warnings from earlier scans were addressed by adding `role="group"` to the Skin Lab space controls and 3D viewer controls; the final artifact has no incomplete `aria-prohibited-attr` entries.

## Keyboard defects found, corrected and independently rechecked

The initial actual-browser probe found an accessibility defect that axe did not catch: the empty Agent's Send button was disabled, but the focus trap used it as the last boundary. After six Tab presses, focus reached Dictate; the next press moved to the background footer and then the main navigation while the modal remained open. Evidence: `cook/metrics/modal-keyboard-initial.json`.

The implementation now computes actual enabled/visible focusable elements, contains focus inside the top dialog, restores focus on close and makes the background inert with scroll locking. A first version of background inertness also made workspace-rendered product/look dialogs inert because they were descendants of the workspace. Modals now render through a document-body portal, avoiding that ancestor conflict. The intermediate scan's blocked product interaction is preserved in `axe-portal-transition.json`; it is not hidden or counted as a successful run.

Independent regression command:

```sh
npx playwright test tests/e2e/accessibility.spec.ts --output=test-results-accessibility-final
```

**6/6 tests passed** across desktop and mobile. Each relevant state cycles 20 Tab and 20 Shift+Tab presses and asserts that the active element remains in the dialog. Coverage includes:

- Agent with Send initially disabled, then enabled by text entry, then disabled again after a real command finishes.
- Empty BeautyGraph with disabled preference inputs/Remember control.
- A Save Look dialog created inside a workspace view: editable name field remains interactive, the background is inert, keyboard stays inside and actual saving succeeds.
- Escape closes Agent and restores focus to its opener; background inertness is removed.

The final axe pass also performs real product-detail → 3D interaction and routine editing after the portal change, verifying that those dialogs are operable rather than only visible.

## Measured mobile targets

Earlier measurements identified undersized mobile controls. They were corrected, then measured again in the actual browser. All ten sampled controls now meet at least 44×44 CSS pixels:

- Navigation menu: 44×44.
- Before/after, hand gesture and makeup reset buttons: 44×44 each.
- Demo portrait, camera and upload buttons: approximately 109.3×44 each.
- Makeup, Hair and Style controls: 68×44, 45×44 and 52×44.

Exact values are stored as `mobileTargets` in `axe-final.json`. This is a bounded sample, not proof that every control in every workflow meets the creator's 44px target. WCAG 2.2 target-size rules were not included in this axe tag set.

## Functional follow-up checked during this pass

The final scan and `cook/metrics/feature-final-recheck.json` also establish these narrow product corrections:

- The real 3D generic packaging study responds to ArrowRight at both viewport sizes and explicitly says it does not represent the selected product's packaging, size or finish.
- The wedding request now allocates one combined illustrative NGN 20,000 ceiling: NGN 19,300 selected, NGN 700 remaining, no unrelated conditioner. Missing lipstick/eyeshadow slots remain explicit; this is not a claim that the complete eventual occasion-planning engine is finished.
- Routine name and first-step edits survive save/reload on desktop and mobile. The earlier immediate `isVisible()` read in a review driver was a synchronization error; repeating after actual save completion passes.
- A selected demo portrait passes from Mirror to Skin Lab. A new uploaded session Blob remains usable through Skin → Mirror → Skin, retaining the same source. This verifies session continuity, not saved-photo consent or cross-device storage.

## Remaining accessibility evidence

No full assistive-technology audit with VoiceOver, NVDA or JAWS was performed. Firefox/WebKit accessibility behavior, physical touch devices, text zoom/reflow through every state, forced colors/high contrast, comprehensive reduced-motion behavior, speech privacy/support, all gesture alternatives and arbitrary user-generated states remain unverified. Canvas/image content cannot be comprehensively assessed by axe. The incomplete contrast occurrences and remaining small-text/overflow observations in the visual reviews require human review at actual reading sizes.

The feature matrix retains these boundaries. Automated success and the resolved keyboard defects improve reliability but do not override missing provider engines, fairness validation or the creator's complete-product quality gates.
