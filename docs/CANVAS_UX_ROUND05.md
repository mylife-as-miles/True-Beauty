# Canvas UX round 05 — follow a detail without losing the scene

Date: 2026-11-02. Scope: original interaction improvements in `apps/web/src/components/VisualCanvas.tsx` and `VisualCanvas.css`, with `tests/e2e/canvas-ux.spec.ts`. The creator specifically reinforced Proofline and Common Table as inspiration. Their actual source was revisited, not merely their README descriptions. No reference source code, styling or assets were copied.

## Reference and licensing audit

| Reference | Pinned commit / exact paths revisited | Observed interaction | Original True Beauty behavior |
|---|---|---|---|
| Proofline | `0681aeef8f51c3c81b8b548db2d9e58fcb4d5710`; `src/components/reader/Lens.tsx`, `LICENSE` | Selecting a passage opens contextual actions while retaining its anchor; previous highlights reopen context; coarse-pointer controls can dock | Selecting an object opens its own inspector. Palette shades have actual actions, a live applied-color result and a return to the same mirror. Notes stay editable in place rather than becoming an unrelated form. Mobile gets a closable contextual sheet. |
| Common Table | `47b6488aa1895eeff405b0732022316d958ac996`; `src/components/ImmersiveMap.tsx` | Pointer capture, bounded spatial pan, zoom/reset and keyboard/list alternatives | Drag empty board space to pan the real scroll surface. Focused-board arrows pan, +/- zoom, Home fits objects, 0 restores actual size. An object index focuses and reveals individual objects without precision dragging. |
| Common Table | Same commit; `src/components/MenuBook.tsx` | Tactile objects, explicit manipulation, bounded motion and reduced-motion/low-power handling | Photo/note/palette/product objects retain their physical composition, selected edges and direct drag movement; reduced motion disables cosmetic movement rather than disabling the task. |
| Common Table | Same commit; `src/components/Waiter.tsx` | Selected context follows the task; stale context is cleared; generated prose does not become application authority | Product navigation carries the actual catalog product ID, category and selected shade. Palette interaction changes a real shared mirror layer through explicit user action. No image has been silently “remixed,” analyzed or sent to an agent. |

Proofline is **not wholly MIT**. Its root license expressly excludes unidentified Gloss-derived material and restricts the grant to the creator's original contributions. Its code/assets are therefore not reused. Common Table's original source is MIT, copyright Osita Miles; vendor/font/photo rights remain separate. This implementation independently authors the interaction behavior and uses the existing True Beauty assets/domain engines. It does not transfer the references' source or third-party assets.

## What changed

The previous canvas offered object dragging and zoom but had no direct empty-space pan, reliable phone overview, contextual product/shade handoff or functional palette swatches. Exploring a product simply opened the catalog. The update connects those interactions:

- The board has real pointer pan with capture/release and native scroll bounds. Object drag remains separate; touching controls does not start a drag. Keyboard equivalents preserve the existing five-pixel object movement and note editing.
- Fit all calculates the object composition's bounds, while actual-size reset and selected-object focus provide useful alternate views. Phone users can fit the complete composition and then focus an object through the index.
- The inspector changes with the selected palette, product, note or photo. It offers only relevant actions rather than another global menu. Desktop retains spatial context beside the board; the phone sheet has a visible 44px Close control and Escape returns focus to the board.
- Palette swatches are actual buttons. A chosen shade applies to lipstick, blush or eyeshadow in the shared mirror state. The inspector reports the actual applied color and target, and “See it in my mirror” returns to that edit. The board selection/view context is retained locally.
- Product inspection exposes its actual sample variants. “Explore this product” passes its exact product ID and chosen color to the existing discovery context. The principal engineer extended that receiving contract and Discover opens the matching detail/variant; the browser test verifies the actual modal rather than merely a category filter.
- Notes remain editable through the original in-place path, preserving existing persistence and keyboard behavior. The inspector displays a quoted excerpt; it does not claim to derive a look or sentiment from the note.

View metadata uses a separate local setting; the original `visual-canvas` object-array format is preserved. View writes are triggered by actual interactions, without a deferred timer that could revive old state after a clear operation. Uploaded reference images remain session URLs in memory, never image data in the board records or exports. Remove/reset/unmount release owned URLs. The component never starts image analysis, remote reasoning or generative Look Remix.

## Executed verification

Actual application: `http://127.0.0.1:5173`, Chromium desktop and iPhone-sized mobile context. Commands:

```sh
npx tsc --noEmit
npx eslint apps/web/src/components/VisualCanvas.tsx
npx playwright test tests/e2e/canvas-ux.spec.ts tests/e2e/fashion-commerce.spec.ts \
  -g 'Canvas|canvas|palette|selected product|reference uploads|board pointer' \
  --output=test-results-canvas-r05-fixed
```

**10/10 browser tests passed**: eight new desktop/mobile cases plus the two existing note move/edit/reload compatibility cases. They establish actual pointer and keyboard pan, fit bounds, reduced-motion styling, real mirror blush application/return, retained palette selection, exact product/variant handoff, and upload/export exclusion with zero media-asset records.

The initial pointer probe incorrectly used a point below the physical viewport when the board extended below the fold. The corrected probe scrolls the board into view before sending input. An initial legacy note lookup also matched both the board note and its new inspector excerpt; the inspector now uses a distinct quoted presentation, preserving the old workflow/test. Neither failure is hidden as a passing result.

A product critic then identified a genuine mobile issue: the global palette-application toast obscured the sheet's mirror action. That redundant toast was removed; the existing inline live status gives feedback inside the lens. The targeted desktop/mobile palette workflow passed again after the fix (`test-results-canvas-toast-fixed`). Escape-to-board handling was added to the sheet. The source was then frozen for the principal's whole-app captures.

Screenshots were captured and opened for visual inspection:

- `cook/stills/canvas-r05/overview-{chromium,mobile}.png`
- `palette-lens-{chromium,mobile}.png`
- `product-lens-{chromium,mobile}.png`
- `entry-{1440,390}.png` and `context-{1440,390}.png` for actual viewport framing.

Axe-core 4.14.0 scanned the actual palette/context state at 1440×1000 and 390×844 using WCAG A/AA/2.1 AA tags: **zero automated violations** and no document horizontal overflow. Two decorative signature-text nodes per viewport remained incomplete contrast checks because of their transformed background. Evidence: `cook/stills/canvas-r05/accessibility.json`. These bounded checks do not certify full accessibility or physical-device performance.

## Boundaries and next critique

The phone lens deliberately overlays part of the board and its object index; Close/Escape returns to the composition. Its content has independent scrolling on shorter screens. Palette status now stays within that context rather than covering its action with a second notification. This interaction should continue to be checked with real assistive technology and physical touch devices.

Fit-all can make object text small on a phone. The object index, selected-object focus and readable inspector are the accessible exploration paths, not a claim that miniature notes become legible. No clinically meaningful analysis, generated try-on, automatic inspiration extraction, live merchant availability or hidden photo persistence is introduced. The change strengthens the creator's reference-informed interaction philosophy while preserving original branding and the product's scientific/privacy boundaries.

Final focused rechecks: the mobile pan case now sends real browser touch-start/move/end input through CDP rather than treating a mouse as a finger; desktop pointer and mobile touch cases both passed. A separate actual mobile keyboard probe confirmed that Escape closes the inspector and focuses the board (`keyboard-close.json`). The toast-fixed palette workflows passed again at both viewport sizes. Final TypeScript and scoped ESLint checks passed. Source remained frozen after those interaction fixes for the principal's integrated review.
