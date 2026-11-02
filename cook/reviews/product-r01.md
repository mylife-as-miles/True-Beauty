# Independent Product Critic / round 1

Reviewed 2026-11-02 approximately 09:09–09:19 UTC, against the creator's full directive and `docs/PRODUCT_SPEC.md`. Reviewer did not implement Studio, Discover, Journal, SkinLab, DressingRoom or the rendering/agent/database engines. This reviewer did prepare the product/reference inventory earlier, so this is an independent implementation review, not a claim of zero prior specification context.

Build state: uncommitted working tree; no target-repository HEAD existed at review time. Application at `http://127.0.0.1:5173`. Chromium headless on Linux, desktop 1440×1000 and touch/mobile 390×844, deviceScaleFactor 1. No physical camera was available. No paid provider request was made.

## Verdict and critic scores

The current local application is useful, visually coherent, and substantially more than a landing page. It is **not the complete True Beauty product and does not pass the 9/10 acceptance gate**. The absence of genuine provider skin-concern results, generative hair/clothing workflows, validated live-device tracking and complete budgeted full-look planning are foundational gaps. Clear “not connected” and sample-data labels make those gaps honest; they do not make the missing engines operational.

These are critic judgments, not measured completion percentages:

| Product dimension | Score /10 | Reason |
|---|---:|---|
| Usefulness of available local workflows | 7.3 | Working mirror controls, real portrait inference, local collection/bag, notes, routine generation, styling and memory create practical value |
| Complete required product scope | 3.0 | Broad product surface exists, but major provider-dependent engines, advanced tracking validation, full agent tools and intelligence depth are missing |
| Cross-space continuity and task completion | 6.1 | Editable look persists; source/photo and tool state continuity is incomplete; exact full-budget request is not solved |
| Truthfulness and capability clarity | 8.0 | Strong local/sample/generated/provider distinctions; “editable” routine claim exceeds current UI controls; some early labels needed fixes |
| Desktop/mobile discoverability | 6.9 | All six top-level spaces reachable without overflow; some mobile controls live below fold/in nested scroll; canvas initially shows only part of board |
| Product acceptance judgment | 5.5 | Useful foundation, below the required breadth and depth; cannot average away missing foundational capabilities |

No weighted full-product score is asserted: this pass did not independently validate all technical/fairness/security/performance categories. All mandatory gate failures remain material regardless of these scores.

## Evidence and successful interactions

Actual screenshots, recordings and scripts reside under `cook/stills/product-r01/`. `inspect.mjs` and `supplement.mjs` are reproducible review scripts, not production test-suite replacements.

- `01-desktop-studio.png`: first visit with no login, dominant live-rendered demo canvas and “Face mesh connected.” No page error on initial load.
- `02-desktop-makeup-compare.png`: shade changed, matte selected, before/after enabled and split set to 35 through the actual range input.
- `03-desktop-hair.png`, `04-desktop-accessories.png`: copper selected, balayage mode selected, glasses/earrings toggled. These prove operation/control state and visual preview on the supplied portrait; no physical-camera or real-hair accuracy claim.
- `05-desktop-saved-look.png`: named “Critic copper rose” saved, visible after reload and reopened from Journal. Actual controls/recipe persist; no image was silently saved.
- `06-desktop-ingredient-lens.png`: real product detail and selected ingredient explanation, preserving selected product context.
- `07-desktop-bag.png`: local cleanser bag total ₦12,500. Ownership added and Wardrobe showed one owned product.
- `08-desktop-product-comparison.png`: two selected products render in comparison columns.
- `09-desktop-journal.png`: explicitly authored note saved and visible. `10-desktop-experiments.png`: experiment space reached; experiment creation/comparison was not exercised in this pass.
- `11-desktop-skin-colour.png`: real local color sampling produced a “True Winter” heuristic suggestion; source of inference, confidence limitation and user correction are disclosed. One main landmark remains after prior nested-main correction.
- `12-desktop-skin-care.png`: five routine slots render with actual candidate selection/empty slots, not invented products. Skin provider explicitly says not connected; no fake concern scores.
- `13-desktop-dressing.png`: local static-photo composition is correctly labelled; no fit/draping or generative claim.
- `14-desktop-canvas.png`: actual note object added; five board objects present. Mobile canvas has its own scrollable work area.
- `15-desktop-privacy.png`, `16-desktop-beautygraph.png`: opt-in category controls, a deliberately saved “lip finish = matte” memory with source/date/confidence/retention and correction/forget affordances.
- `17-desktop-agent.png`: exact wedding/dry-skin/₦20,000 prompt executes three real tools; saved matte preference modifies applied makeup. See budget gap below.
- `18-desktop-camera-denial.png`: missing physical camera yields “No camera was found. Upload a portrait instead.” Recovery retains demo option.
- Six `mobile-{studio,skin,wardrobe,discover,canvas,journal}.png` captures: all top-level spaces reached through the mobile menu, no document horizontal overflow. Skin/canvas captures were repeated after waiting for lazy view headings; early 200ms captures were insufficient.
- `stable-desktop-results.json`, `supplement-results.json`, `mobile-results.json`, `mobile-supplement-results.json`: recorded actual outcomes. No page errors or POST requests occurred during the successful review passes. This is not a universal no-egress proof.
- `video-stable/`: real browser interaction recording of the stable desktop pass.

### Review-environment qualification

The first extended pass was invalidated by repeated full-page reloads. Principal engineer identified Vite watching generated Playwright HTML/artifacts and Tailwind broad scanning; ignored artifact paths and explicit source scan fixed the loop. Preserve `unstable-initial-results.json` as environment evidence, not feature failures. No HMR-disabled diagnostic screenshot is used as product evidence. Two “failed” selectors in `stable-desktop-results.json` reflect updated SkinLab button semantics and an incorrect reviewer privacy-button name, not broken features; the supplement pass exercised both successfully.

## Findings and required changes

### High-impact unmet workflow: total-budget complete look

Reproduction: enable/save “lip finish = matte”; ask “Soft glam for a wedding, dry skin, ₦20,000.” Actual tools apply Soft glow, build a basic AM routine and find four catalog options. Suggestions include cleanser ₦12,500, moisturizer ₦11,500, conditioner ₦14,500 and foundation ₦15,500. These are unrelated individual options and exceed the total occasion budget if combined. The assistant explicitly says “individual options, not a bundled purchase plan,” so it does not fabricate a total; the exact requested complete-look journey is nevertheless unmet.

Required: use a consistent total budget, distinguish owned/no-purchase items, select relevant routine/cosmetic slots, exclude irrelevant haircare unless requested, expose which desired items could not fit, and coordinate/save a complete occasion plan. Add an E2E assertion that the priced unique purchase set stays within ₦20,000. Current per-product budget ceiling must not be presented as that implementation.

### Missing editing affordance despite “editable routine” message

Agent says it created an “editable AM routine.” Journal routine UI provides completion and removal, but no routine name, step/order or product editor was present in the reviewed implementation. The user cannot perform the advertised edit.

Required: implement a real routine editor (with persistent changes and meaningful product/step controls) or soften the current message while keeping editing in the feature backlog. A database record being technically mutable does not make it user-editable.

### Saved-look selected preset misrepresented the restored scene (observed, implementation subsequently changed)

Reproduction in stable pass: save a custom copper/rose/accessory composition, reload, open Journal, choose “Back to this feeling.” Scene controls restore, but active preset label was “Soft glow / Everyday elevated,” because local preset state reset independently. This can confuse a user about the saved look.

Principal engineer changed Studio to derive selected preset from actual scene equality rather than independent local selection. Independent follow-up probe in `context-fix-recheck.json` passed: custom shade selection produced zero active preset cards, removing the false Soft glow indication. Restored source-photo/transient UI continuity still needs separate testing.

### Shade-match action initially dropped context (observed, implementation subsequently changed)

The original “Find your real-world match” action opened an unfiltered catalog without shade/category context. That wording overstated product matching. Principal changed it to “Explore similar shade references” and added `discoveryContext`. Independent follow-up capture `19-shade-context-recheck.png` and JSON passed: the lip-color context narrowed the catalog to one relevant lipstick product. Catalog shades remain illustrative references, not verified physical shade matches.

### Additional scope/quality gaps

- Live provider skin-concern analysis has no configured credential/cost plan and no live result evidence. Local seasonal color is a styling heuristic and does not satisfy this engine.
- Real hairstyle generation, generative clothing VTO, detailed accessories beyond the current geometric subset and full-look garment coordination remain incomplete.
- Gesture controls have unit/fixture evidence; no physical-camera gesture accuracy or measured real-device latency was demonstrated. Principal added an enabled/active guard after a code-review concern about stale hand snapshots; physical gesture behavior remains unverified.
- The agent implements a useful limited local planner; many requested typed tools and broad natural-language reasoning, look remix/inspiration extraction and model integration remain incomplete.
- Current product data/prices/ingredients are deliberately sample references/subsets. Live availability, verified multi-merchant pricing, affordable equivalent-product evidence and external checkout completion are not established.
- Mobile no-overflow is verified for six routes; full touch/keyboard/screen-reader access is not. Small labels, nested atelier scrolling and board discovery deserve further independent access review.
- Full progress comparisons, editable digital twin, experiment-linked outcome evaluation, shoppable complete looks and multi-engine saved scene reconstruction need deeper completion evidence.

## Journey gate assessment

| Journey | Current evidence | Assessment |
|---|---|---|
| A first visit | Actual no-login functioning demo | Verified for tested Chromium viewports |
| B live mirror | Static image inference/edit/save verified; physical camera unavailable | Partial, live journey unverified |
| C hands | Unit/worker/lifecycle fixtures in VISION_REPORT; no actual gesture performance review | Unverified end-to-end |
| D provider skin | Accurate unavailable state; no real provider result | Blocked with configuration/live-evidence gap |
| E routine | Generation/rendering/completion infrastructure; no reviewed edit control | Partial |
| F fashion | Honest static-photo composition | Verified local static workflow; generative/live expansion incomplete |
| G discovery | Detail/ingredients/comparison/owned/bag exercised | Verified for sample catalog; alternative efficacy/live data unverified |
| H agent | Three real tools/memory; total-budget full-look request not fulfilled | Partial |
| I BeautyGraph | Explicit preference save + actual agent use; unit correction/deletion evidence | Partial in this pass; full revise/delete/revisit browser evidence elsewhere required |
| J offline | Not exercised independently in this pass | Unverified here; do not infer from IndexedDB alone |

## Next product priority

Complete the real occasion/routine/owned-products workflow before expanding more surface area. Its state model should connect selected look, products, total budget, routine edits and permitted memory in one saved artifact. Genuine skin-provider activation and device-level vision quality remain separate foundational blockers; do not trade them for polish or a high aggregate score.

## Final bounded test update

At 09:21 UTC independently executed `npm test -- packages/skin-engine packages/beauty-intelligence tests/api.test.ts`: 3 files / 24 tests passed. Together with earlier independent 15 commerce/fashion/hair and 26 database/memory/agent tests this reviewer reran 65 tests. These are domain/fixture results; no live paid API evidence is implied. Feature matrix reconciled conservatively to this review and VISION_REPORT.
