# True Beauty

An original, local-first beauty studio with a Living Mirror, editable makeup/hair previews, Skin Lab colour exploration, products and routines, wardrobe, inspiration canvas, and a tool-using beauty companion with editable BeautyGraph memory.

This repository is an active engineering build. **The complete product acceptance gate is not met.** The public native backend genuinely executes YouCam skin/hair/clothing and Claude mirror tools with server-only credentials, exact sponsored-credit approval and separate consent. Independent product judgment is7.24/10; visual editing8.3. Broad device/fairness validation, complete occasion planning and remaining scope are tracked explicitly. See [feature status](docs/FEATURE_MATRIX.md), [quality evidence](docs/QUALITY_REPORT.md), and [remaining work](docs/REMAINING_WORK.md).

Public Site: https://true-beauty-miles.myles4miles.chatgpt.site . Native version5 is public; see [deployment provenance](docs/DEPLOYMENT.md) and [genuine hosted verification](docs/LIVE_PROVIDER_VERIFICATION_R07.md). Core local features need no account. Remote requests need a reviewed quote, owner sponsorship and explicit transmission/spending consent.

## Run locally

Node22+ (tested Node24.19), npm11, modern browser with WebAssembly. Camera requires localhost or HTTPS.

```sh
npm ci
npm run models
npm run dev
```

Open http://localhost:5173. No account, API key or camera permission is needed for the demo. Models/WASM download from official Google sources and installed MediaPipe with hashes recorded. Download them once for local inference. For the optional API capability/status service, in another terminal:

```sh
npm run dev:api
```

API defaults to http://127.0.0.1:3001. Missing provider configuration is an explicit unavailable state. Do not put any credential in a `VITE_*` variable. [API contracts and configuration](docs/API_CONTRACTS.md) document exact server-only controls. Paid calls remain disabled by default. Genuine manually authorized verification is documented separately in [LIVE_PROVIDER_VERIFICATION_R06](docs/LIVE_PROVIDER_VERIFICATION_R06.md); automatic tests never require paid credentials.

Production/offline:

```sh
npm run build
npm run preview -- --port 4173
```

The production service worker precaches the UI/recipe/wardrobe/routine shell. Models are cached after use; a first offline visit cannot download a model. IndexedDB stays within this browser origin; changing port creates a different local store. Photos are not silently stored. Encryption applies to optional exported backups, not IndexedDB itself.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run test:production
```

Additional actual model/renderer harnesses:

```sh
node packages/vision-core/scripts/verify-browser.mjs http://127.0.0.1:5173
node packages/vision-core/scripts/verify-worker.mjs http://127.0.0.1:5173
node packages/vision-core/scripts/verify-lifecycle.mjs http://127.0.0.1:5173
GRAPHICS_TEST_ORIGIN=http://127.0.0.1:5173 node packages/ar-renderer/scripts/smoke.mjs
```

Final R06 unit snapshot:269tests/41files; completeChrome/mobile132passed+2production-onlyskips; finalproduction/offline8/8, selectedFirefox12/12andWebKit12/12. Whole-browser, production/offline and cross-browser evidence is reconciled in QUALITY_REPORT rather than inferred from a build. Earlier R05 cross-browser results remain historical; they do not certify new R06 model features.

Use a separate test output directory if running independent Playwright processes. Browser recordings/screenshots and independent review findings live in `cook/`. Device/clinical/model accuracy is not established by these synthetic browser tests.

## Source integration and rights

Actual source-derived algorithms and shaders from OpenMakeupSDK, Virtual Makeup, SKIN_AI/MIROIR and Skyn are identified with pinned commits, destination files, tests and notices in [SOURCE_INTEGRATION_MATRIX](docs/SOURCE_INTEGRATION_MATRIX.md). Code, model weights, datasets, photos and fonts have separate rights considerations. Outstanding commercial redistribution/model-release checks are recorded; no claim of complete clearance is made. Demo photography is credited to Unsplash; self-hosted fonts retain SIL OFL notices. Catalogue price/ingredient subsets remain labelled samples. Explicit merchant-source refreshes separately retrieve genuine attributed prices/stock with timestamps; imported observations cannot become fresh verified prices.

## Continue engineering

Read `AGENTS.md`, `cook/BRIEF.md`, the latest two entries in `cook/ROUNDS.md`, `cook/SCORECARD.md` and `docs/REMAINING_WORK.md`. Preserve tested work and reproduce the weakest unresolved gate before changing it. Do not replace genuine provider failure with a mock result or promote planned capabilities to complete.

## Immersive editing

The Living Mirror now has six rendered look studies, undo/redo, selected-face context lenses, full-portrait/fill framing and creative studio lighting. “Enhance detail” selects actual WebGL materials; Balanced mode uses approximate reflections on software graphics. These are cosmetic previews, not calibrated physical shade matches. Skin Lab continues to sample the original image.

Use the Focus mirror button, or F while an editor control has focus; Escape leaves focus after closing any open dialog. Ctrl/Command Z undoes parameter edits. The visual canvas supports pointer/touch panning, keyboard movement, fit/reset and contextual palettes/products that modify or reopen the same scene. Reference study and current verification are in [DESIGN_RESEARCH](docs/DESIGN_RESEARCH.md), [CANVAS_UX_ROUND05](docs/CANVAS_UX_ROUND05.md) and [QUALITY_REPORT](docs/QUALITY_REPORT.md).
