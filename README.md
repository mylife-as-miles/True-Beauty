# True Beauty

An original, local-first beauty studio with a Living Mirror, editable makeup/hair previews, Skin Lab colour exploration, products and routines, wardrobe, inspiration canvas, and a tool-using beauty companion with editable BeautyGraph memory.

This repository is an active engineering build. **The complete product acceptance gate is not met.** Implemented local workflows are real; live YouCam skin analysis, generative clothing/hairstyles, broad device/fairness validation and remaining scope are tracked explicitly. See [feature status](docs/FEATURE_MATRIX.md), [quality evidence](docs/QUALITY_REPORT.md), and [remaining work](docs/REMAINING_WORK.md).

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

API defaults to http://127.0.0.1:3001. Missing provider configuration is an explicit unavailable state. Do not put any credential in a `VITE_*` variable. [API contracts and configuration](docs/API_CONTRACTS.md) document exact server-only controls. Paid calls are disabled by default and were not executed during verification.

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

Checkpoint verification:97unit/integration tests pass. A complete Chromium/mobile snapshot passed46cases with2production-onlyskips; the actual built-product/offline suite passed8/8. WebKit's final complete run passed24cases with1production-onlyskip. Firefox's earlier complete run passed20cases with1skip, followed by all4current keyboard regressions. Exact command boundaries, fixtures and limits are in QUALITY_REPORT; these are not one synthetic aggregate.

Use a separate test output directory if running independent Playwright processes. Browser recordings/screenshots and independent review findings live in `cook/`. Device/clinical/model accuracy is not established by these synthetic browser tests.

## Source integration and rights

Actual source-derived algorithms and shaders from OpenMakeupSDK, Virtual Makeup, SKIN_AI/MIROIR and Skyn are identified with pinned commits, destination files, tests and notices in [SOURCE_INTEGRATION_MATRIX](docs/SOURCE_INTEGRATION_MATRIX.md). Code, model weights, datasets, photos and fonts have separate rights considerations. Outstanding commercial redistribution/model-release checks are recorded; no claim of complete clearance is made. Demo photography is credited to Unsplash; self-hosted fonts retain SIL OFL notices. Product prices/ingredient subsets are explicitly sample data with provenance.

## Continue engineering

Read `AGENTS.md`, `cook/BRIEF.md`, the latest two entries in `cook/ROUNDS.md`, `cook/SCORECARD.md` and `docs/REMAINING_WORK.md`. Preserve tested work and reproduce the weakest unresolved gate before changing it. Do not replace genuine provider failure with a mock result or promote planned capabilities to complete.
