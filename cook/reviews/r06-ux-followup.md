# Round 06 — bounded UX repair evidence

2026-11-02. Implementer verification following independent product/visual findings; this is not an independent critic score or a full product acceptance result.

## Changes verified

| Finding | Repair | Browser evidence |
| --- | --- | --- |
| Mobile garment controls lose the portrait | Sticky 180px-wide copied composition canvas, displayed at 100×148 CSS pixels, with full-composition return control | Width and Rotation are simultaneously in view with the preview; thumbnail pixels exactly equal a scaled main-canvas draw |
| Reopened outfit inherits deep scroll | One-time reveal after the selected study’s ready composition draw | Restored portrait starts within the top 160 CSS pixels on desktop and mobile |
| Generated source loses its label in Dressing Room | Current store provenance beside main canvas and sticky preview | Actual generated synthetic receipt image retains AI-generated hair/provider disclosure after edits and restore; zero POSTs |
| Generated export and retained photo lose source context | Visible PNG footer; strict four-field provenance only with consented person asset; restored-generated source path | Ordinary PNG bytes unchanged; labelled generated PNG inspected; reload preserves label without inventing an associated original; expanded metadata rejected; Skin framing disabled |
| Footer falsely declares generation unavailable | Factual manual-canvas / separate provider-consent wording | Exact text checked in the running app |
| Mobile bag controls are too small | Scoped 44px close/remove and 54×44px minimum quantity controls | Actual target bounds meet 44px minima |
| Receipt obscures commerce CTAs | Reserved notification area below merchant notebook and bag | Toast is geometrically below both actions; pointer-centre hit resolves to each actual button |

## Execution

`npx playwright test tests/e2e/dressing-ux-r06.spec.ts tests/e2e/dressing-scene-r06.spec.ts tests/e2e/digital-twin.spec.ts tests/e2e/commerce-r06.spec.ts --grep 'composition stays|bag touch|shared mirror|separately uploaded|a complete look opens|bag keeps exact' --workers=1 --output=test-results/fashion-ux-final-r06`

**12 passed (1.5m)** against the running local app. Desktop Chrome and iPhone 13 Chromium emulation. Existing regression also confirms original Skin input has zero pixel differences after creative grading, matching shared geometry avoids additional face inference, a separately uploaded source incurs one face inference, and exact shades/currencies survive bag reload and quantity/removal.

`npx tsc --noEmit` and owned ESLint for DressingRoom/new UX tests passed. No provider or database module was changed. There is no additional model or rendering engine for the thumbnail.

After the principal requested completion of the remaining export/retained-photo boundary, the focused `--grep 'generated photo consent' --output=test-results/fashion-provenance-final-r06` run passed **2/2 in 24.5s**, desktop/mobile. It checks PNG byte/dimension/visible-ink facts, exact closed metadata beside one permitted asset, actual reload/restore with no associated original, Skin’s generated-source guard, explicit studio fallback, invalid expanded-metadata rejection, and zero POSTs. One initial test-only obsolete tab locator timed out after successful save/reload assertions; it was corrected to the actual “Skin & care” label. No failed attempt is counted as passed.

## Captures inspected

Before: independent `cook/stills/r06-critic-visual/mobile-dressing-edited.png`, plus the product critic’s generated-source findings. After: `cook/stills/r06-ux-followup/mobile-width.png`, `mobile-rotation.png`, `restored-{chromium,mobile}.png`, `merchant-action-{chromium,mobile}.png`, `bag-{chromium,mobile}.png`, `bag-source-action-{chromium,mobile}.png`, and visibly labelled `generated-composition-export-{chromium,mobile}.png`. The initial follow-up inspection exposed the remaining bag CTA collision; the reserved area was extended to the bag and the full scoped run then passed.

The source-layout response is visibly labelled TEST FIXTURE. Generated-image provenance uses already-generated receipt bytes and actual app state; it makes no new paid request and does not establish the full provider submission UI. Main and thumbnail images remain static manual garment compositions, with flat illustrative cloth rather than simulated draping.

## Boundaries left open

No physical mobile, Safari/WebKit, assistive-technology or sustained-device performance claim follows from viewport emulation. The generated source remains a simulation, including after edits/export/reopen; these passing checks do not establish physical fit, medically useful skin inference or faithful image-generation semantics. The wider full-product quality gates remain open.
