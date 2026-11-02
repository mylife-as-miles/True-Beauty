# Design research and interaction direction

Research date: 2026-11-02. The references were cloned and studied at pinned commits. Findings below are from source and written product documentation unless explicitly called browser-verified. No screenshot or live interaction proof is claimed for a reference application that has not been run.

## Creator references

### Proofline

Source: https://github.com/mylife-as-miles/proofline at `0681aeef8f51c3c81b8b548db2d9e58fcb4d5710`.

Studied: `AGENTS.md`, `README.md`, `LICENSE`, `prd.md`, `src/styles/proofline.css`, `src/components/reader/Lens.tsx`, `src/components/landing/MagnifierLens.tsx` and reader/landing component inventory.

The product is organized around reading rather than menus. Selecting text opens an anchored lens; the lens offers explanation, investigation, definition, simplification, fact checking, connection and counterargument, or becomes a question/note field. The response remains associated with the selected passage in the margin. A highlight can reopen the same context. The implementation watches pointer selection and keyboard selection, distinguishes short words from passages, docks actions at the bottom on coarse pointers, and keeps the lens anchored through layout/scroll. The landing magnifier only follows actual text and restores the normal pointer over empty areas and inputs. These choices make exploration contextual rather than a trip to an unrelated screen.

Appearance in source: paper and ink tones, purposeful reading serif plus clear sans, highlighter and pen as semantic color, warm/light/dark theme tokens, material bookshelf/bookplate artifacts, calm copy. This is evidence of the creator's material and contextual preferences, not permission to reproduce a palette or layout.

**License boundary:** root `LICENSE` explicitly says the repository is not wholly MIT. Only original contributions authored by Osita Miles are granted under the limited MIT notice; unidentified Gloss-derived material remains excluded. No Proofline code or assets are copied into True Beauty. The adaptation is an independently authored interaction principle: selecting an ingredient or face region reveals a contextual lens while retaining the current scene.

### Common Table

Source: https://github.com/mylife-as-miles/common-table at `47b6488aa1895eeff405b0732022316d958ac996`.

Studied: `LICENSE`, `README.md`, `src/App.tsx`, `src/components/MenuBook.tsx`, `src/components/ImmersiveMap.tsx`, `src/components/GeographicMap.tsx` search results, `src/components/Waiter.tsx`, experience/state/style inventory.

The same selected venue and planning state crosses a spatial atlas, physical-feeling menu book, shared table and printable plan. The spatial interface has pointer capture, bounded pan, zoom/reset and keyboard alternatives, plus a venue list for equivalent exploration. The menu's page-turn is a deliberate action with controlled pointer tilt, animation cleanup and reduced-motion/low-power modes. Navigation interrupts pending transitions and focuses the new heading. The contextual Waiter receives actual selected state and uses explicit commands; generated text does not silently become application authority. Interaction sound is opt-in, never autoplay.

**License boundary:** root MIT, copyright 2026 Osita Miles. Vendor files, fonts and photos have independent notices. No source/assets are copied for this research task; original True Beauty UI can adopt the state continuity and tactile-control principles. If future code reuse occurs, the exact file and notices must be entered in the source matrix independently.

## True Beauty's original interaction language

The subject inventory is specific: the living reflection; pigment applied to facial geometry; a shade's changing finish; a user's owned products; a beauty ritual remembered over time; approved evidence; a local memory graph; complete looks across makeup/hair/clothing; Nigerian budget planning; private camera imagery; the act of comparing before and after.

**Design idea:** a complete editable beauty look becomes the persistent object through which the user explores color, products, evidence and routines. The face/portrait remains spatially continuous while the surrounding tools change with intent.

The first-screen question is: “What would this look feel like on me?” The largest element answers it with the actual mirror/portrait. A narrow contextual control surface is secondary; the saved look, current palette and action to try a camera or photo are immediately visible. The assistant modifies that same scene, so its work can be seen and inspected.

Recommended behavior:

- Select lips/eyes/hair or a named region control to open the relevant tray; never require precision face clicking.
- Use one before/after splitter with a keyboard/range equivalent. Label the source and preview truthfully.
- Make palette swatches represent actual pigment choices and finishes, with names and selected state.
- Present saved looks as portrait/palette objects with reopen/compare actions rather than abstract KPI tiles.
- Keep a product context when transitioning from shade preview to ingredients, inventory or bag.
- Highlight or activate an ingredient to open its source, uncertainty and comparison context.
- Keep approved memory evidence one action from recommendation explanations.
- Put phone editing in a bottom sheet/stacked controls while preserving a useful portrait region. Every gesture has standard controls.

## Taste Skill application

Source: https://github.com/Leonxlnx/taste-skill at `12af471f627f866411b4bd785b19646d3672784c`, MIT. Read the current `skills/taste-skill/SKILL.md`, the complete `references/app-screens.md`, and compatible installation instructions. Installed with its `install.sh --codex design-taste-frontend` non-overwriting symlink workflow. Draw output is stored in `.taste-skill/direction.json`.

App draw: kind `builder`, screens `builder,home,detail,settings`, light theme, seed `890544161`. Available styles were `framed-sheet` and `achromatic-ledger`; selected `framed-sheet` because this is an editor with long-lived visual work, not a financial ledger. Palette/type were explicitly kept for original beauty branding. No redraw was used.

The useful move is a quiet shared chrome tint, one inset light work surface and little resting shadow; portrait/pigment carries visual richness. Brand-specific adaptation uses a low-chroma pigment tint for the frame and a deliberate brand/heading face, with clear sans controls. A custom original beauty mark and the mirror itself prevent a stock-kit appearance. The graph-builder node/table templates are not copied into the mirror: their assumptions do not match the product object.

Taste checks to run after UI exists: real loaded fonts, one h1, quiet chrome, consistent edges/radii/gutters, body/control contrast, readable labels and error states, ≥44px phone touch targets, no mobile overflow, folded navigation, screenshots at 1440/768/390. The literal app-screen chart color budget must not classify photographic complexions/pigments as decorative chrome. The mirror is the application's data.

## Cook adaptation

Source: https://github.com/Leonxlnx/cook at `b23cac6fd9439dfddcab61b14808e7bf72549b46`, MIT. Read `SKILL.md`, `references/loop-and-critics.md`, `references/target-and-bar.md`, `references/rules.md`, and install instructions. Installed at the documented Codex manual location via non-overwriting symlink.

Applied process: persist the brief, fixed screenshot states, reference notes and rounds; run the real application; capture interaction evidence; use fresh visual, technical and product critics; fix the weakest evidence-backed area and repeat. Source screenshots are not yet available, so the first actual application captures become a reproducible baseline. Comparison to source implementation principles is qualitative until reference screenshots are obtained. No fabricated similarity percentages.

The user's application brief governs: licensed models and imagery are allowed, all product scope is preserved, and no arbitrary eight-hour demonstration floor replaces actual engineering gates. Cook's final costly-video-export approval rule has no bearing on local app development or screenshots. Deployment/publication and paid/private-provider operations retain their explicit user authorization boundaries.

## Public product research

Read-only page fetches returned HTTP 200 for all six inspiration sources on 2026-11-02. These are product/vendor claims, not independent validation of accuracy, performance or clinical benefit. No UI, assets or proprietary implementation was copied.

| Source | Observed emphasis | True Beauty implication |
|---|---|---|
| Clear / YC | “unbiased AI and data layer for skin health” | Keep progress/feedback and evidence separate from inferred causal claims |
| Clinikally | Skin/hair care shopping, consultation and routine-oriented discovery | Connect discovery to user intent and explicit cosmetic limits; do not borrow clinical claims |
| SkinSort | Ingredient checker, routine creator, compare products, skincare dupes | Give ingredients a usable comparison context, not an unsupported score |
| GlamAR | AR visualization, 360 product viewer, personalized commerce | Connect preview directly to product/variant and name the preview technology |
| Haut.AI | Skin analysis, advice/routines, generative skin simulations | Distinguish observed/predicted/generated results and retain source/consent |
| Revieve | Connected skin/makeup/hair/commerce intelligence and advice | Shared context across engines rather than disconnected feature routes |

## Evidence still needed

No source application was browser-run in this research pass. Reference screenshot/recording study remains unverified. True Beauty visuals require real screenshot review at desktop/tablet/phone and material/AR alignment inspection. Camera/gesture realism, complexion coverage and low-light behavior require actual camera/fixture and device evidence; source reading alone proves none of these.
