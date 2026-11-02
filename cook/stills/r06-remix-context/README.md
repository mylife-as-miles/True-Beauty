# Round 06 contextual preview / source provenance correction

The independent visual critic found that phone users editing/applying a Remix could no longer see the target face. The product critic also found that a generated source entering Beauty profile lost its AI label. These are actual corrections to existing functional surfaces, not new generation or analysis claims.

Source changes are limited to LookRemix.tsx/.css and DigitalTwin.tsx/.css. Root passes the optional typed `portraitProvenance` prop into the latter.

- Mobile Remix retains a sticky head-detail view during region corrections and Apply. It copies pixels from the already-composed target canvas, bounded by existing target geometry when available. It starts no renderer or vision model. Original/missing-model states are labelled honestly.
- The detail uses the same before/after state and split as the full preview. Full preview moves focus/scroll back to the original target canvas; comparison survives. Keyboard focus in controls scrolls below the pinned surface rather than becoming obscured.
- The existing sheet's `overflow:hidden` would trap sticky positioning. The component stylesheet uses scoped `overflow:clip` for the sheet containing Remix, preserving rounded clipping without making another scroll container. Desktop/tablet do not show the compact surface.
- Generated profile portraits have a permanent attached source label, provider, still-image/session description and correct image alternative text. The caption follows hair/clothing metadata rather than describing generated output only as the user's portrait. Export remains image-free.

`verify.mjs` exercises the actual application at 390×844, 1440×1000 and 834×1112, using reduced motion. `report.json` shows actual sticky y=12, changed detail pixels after a hair correction, unchanged worker image/video request count (3→3) across editing/comparison/return, retained split state, no overflow or page errors and zero POST requests. The compact-control and generated-profile Axe scans have zero WCAG A/AA/2.1 AA violations or incomplete checks. These are Chromium checks, not a claim of all-browser or physical-device verification.

The generated-profile check uses the existing genuinely received synthetic-fixture output `cook/evidence/r06-live-001/generated-hair.jpg` and its metadata boundary. It does not call a provider, spend credits, upload a private photograph or claim to generate a new image. It downloads the actual profile export and verifies that image/Blob data is absent.

Screenshots were opened and inspected: `mobile-hair-correction.png`, `mobile-apply-comparison.png`, `mobile-return-full-preview.png`, `mobile-generated-profile.png`, plus desktop/tablet controls and desktop generated profile. The new sticky view keeps the actual face beside corrections and above Apply; the full-sized source/target composition remains accessible.

The existing Remix and Digital Twin browser suites are run as regression evidence separately. No quality score or full-product acceptance claim is assigned by this implementation report.

Regression result: 14/16 existing Remix/Twin browser cases passed in `test-results-r06-context`. Two desktop cases were interrupted by confirmed App/Studio/Discover/LivingMirror/style hot updates and a route reset during ongoing parallel source work; their original traces remain available. After source freeze, both affected cases passed in `test-results-r06-context-stable` (20.3s). All sixteen intended regression cases therefore have passing evidence, including actual outfit restoration, and the initial interruptions are not hidden. Scoped ESLint and full TypeScript checks passed before the regression run.
