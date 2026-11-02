# Fashion, hair and commerce integration notes

Inspection date: 2026-11-02. This file reports observed evidence, not production readiness.

## Reused source

Repository: https://github.com/AryanMashalkar/SKIN_AI
Commit: `f3c0661cb0594fff07e89c80fbe129e7e5bdffa5`
License: MIT, Copyright (c) 2026 MIROIR. Full notice preserved in `packages/fashion-engine/THIRD_PARTY_LICENSE.txt` and `packages/commerce-engine/THIRD_PARTY_LICENSE.txt`.

| Source studied | Destination | Actual change and functional contribution |
|---|---|---|
| `src/lib/fashion/colourways.ts` | `packages/fashion-engine/src/colourways.ts` | Actual nearest-palette CIELAB distance, fabric hue temperature, exponential similarity ranking and explanation code adapted. Shared colour functions imported from skin-engine. Input colour validation added. Removed scan-driven redness assumptions: optional red-family avoidance is now a user preference. Output describes aesthetic contrast rather than objective beauty. |
| `src/lib/fashion/lightness.ts` | `packages/fashion-engine/src/lightness.ts` | Actual shadow-preserving target-lightness remapping reused. |
| `src/lib/fashion/recolor.ts` | `packages/fashion-engine/src/recolor.ts` | Actual HSL conversion, median-lightness histogram, background exclusion and per-pixel recolouring adapted to testable RGBA buffers. Added optional alpha mask, dimension validation and immutable source handling. DOM wrapper accepts already decoded local images and makes no network request. |
| `src/lib/cart.ts` | `packages/commerce-engine/src/bag.ts` | Shared cart line identity, immutable add/remove/change logic adapted. Variant + size keys use collision-safe JSON tuples. Quantity bounds, invalid-price checks, independent currency sums added. Invented shipping charge rules removed. |
| `scripts/colourway.test.mjs`, `scripts/cart.test.mjs` | `packages/fashion-engine/src/fashion.test.ts`, `packages/commerce-engine/src/commerce.test.ts` | Regression cases for khaki/navy/grey fabric temperature, Deep Autumn chocolate vs icy lilac, lightness preservation and variant identity adapted into Vitest assertions. New preference, input, price-truth and currency tests added. |
| `src/lib/fashion/styling.ts`, `src/lib/fashion/vto.ts`, `src/app/api/tryon/route.ts`, `src/lib/fashion/products.ts` | Research only | Studied seasonal styling, provider task polling, public-image hosting, cleanup and shared clothing objects. Did not reuse mock success behavior, older clothing endpoint, unlicensed garment photography or medical-adjacent colour claims. |

Original True Beauty code (not represented as source adaptation): `fashion-engine/src/index.ts`, `hair-engine/src/index.ts`, catalog search/comparison/price provenance modules, DressingRoom and VisualCanvas UI.

## Operational components

- Pure garment colourway ranking, palette coordination, actual source-derived lightness/recolouring algorithms.
- Local static-photo compositor with manual x/y/size/rotation/opacity. This does **not** infer body shape, draping, clothing fit or occlusion.
- Dressing Room: photo/garment uploads, transparent original sample blouse, optional recolouring, editable placement, seasonal palette selector, PNG export, named save/restore/delete in Dexie. Uploaded image retention requires an explicit photo-storage checkbox. Saving image assets plus outfit is transactional. Without consent, saved outfits retain parameters, not photos.
- Face and hand accessory anchor geometry. Missing landmarks/body anchors return null. Live integration of every accessory type is not established by these helpers.
- Hair palettes, root-to-tip/strand blending and luminance-preserving colour math; user-declared hair care routines. This is not hairstyle generation or diagnosis.
- Sample catalogue search, owned-only and budget filters, ingredient subset comparison, candidate alternatives, shade swatch distance, original generic packaging illustrations, currency-aware formatting and truthful sample-price freshness.
- Visual Canvas: pointer drag, keyboard movement/deletion, zoom, editable notes, mirror palette, sample product references, local layout persistence and JSON export. User-uploaded reference images remain session-only; persistence and exports exclude raw reference images. Look extraction is not implemented and the UI says so.

## Verification

Run `npx vitest run packages/commerce-engine packages/fashion-engine packages/hair-engine`.

Observed on 2026-11-02 in this workspace: 3 test files, **15 assertions/tests passed**. Checks include source regression cases, input validation, no image/mask mutation, masking, preserved alpha/background, user-preference-only avoidance, missing accessory anchors, sample price disclosure, no invented stock, variant/size cart identity, per-currency totals, invalid quantity rejection, no alteration outside hair mask, and hair routine disclaimers. TypeScript checking of owned files passed; full-repository Vite configuration typing was being fixed independently. Browser workflow verification remains pending at time of this note and must be recorded separately.

## Current official YouCam documentation

Fetched successfully (HTTP 200) 2026-11-02:

- https://docs.perfectcorp.com/reference/ai_clothes.md — current clothing task path `POST /s2s/v2.0/task/cloth-v4`, sample request `src_file_url`, `ref_file_url`, `garment_category: "full_body"`. This differs from MIROIR's older `/task/cloth` code.
- https://docs.perfectcorp.com/reference/ai_hairstyle.md — current hairstyle path `/s2s/v2.1/task/hair-transfer`, templates and reference photo options.
- https://docs.perfectcorp.com/reference/ai_hair_color.md — colour task path `/s2s/v2.0/task/hair-color`.
- Official skills reviewed: `clothes-tryon-studio/SKILL.md` and `hair-color-style-advisor/SKILL.md`, at YouCam-API/skills `51c0d360adf5b5fa0abf3aa942e3b9a2bcfa19f9`.

No paid operation was initiated. No credentials are configured. Reading public API documentation is not evidence of a successful live generation. The provider interface remains separate from local static compositing; remote consent, quote authorization, temporary image handling and actual live testing are required before marking generation verified.

## Alternative VTO research and licenses

| Candidate | Evidence inspected | Decision |
|---|---|---|
| CatVTON | `https://raw.githubusercontent.com/Zheng-Chong/CatVTON/main/LICENSE` returned HTTP 200: CC BY-NC-SA 4.0 | Commercial product reuse is blocked pending separate rights/permission. No code or weights incorporated. |
| IDM-VTON | `https://raw.githubusercontent.com/yisol/IDM-VTON/main/LICENSE.txt` and README returned HTTP 200. README says code and checkpoints CC BY-NC-SA 4.0. | No code or weights incorporated. The initial `LICENSE` path returned 404; corrected to `LICENSE.txt`. |
| Leffa | GitHub LICENSE: MIT, copyright 2024 Zijian Zhou. Hugging Face model card (`franciszzj/Leffa`) declares `license: mit`; describes weights trained on DressCode, VITON-HD and DeepFashion, and SCHP/DensePose preprocessing. | Promising optional inference service candidate. Model-card label alone is insufficient to establish rights for every upstream model/dataset/person image. No weights downloaded; upstream assets, dataset terms, GPU runtime and quality across garment/body/skin variation require a separate audit and benchmark. Model card reports A100 timing; it is not a measured True Beauty performance claim. |

No noncommercial models, source garment photos, or third-party generative outputs are bundled.

## Catalogue provenance limitations

The catalogue is explicitly **sample data**. NGN/USD amounts are illustrative budget figures, not quotes or converted exchange rates. Ingredient lists are illustrative subsets, not verified full current INCI labels. No claims of stock, order creation, purchase completion, formulation equivalence or genuine dupes are made. The catalogue links to brand reference homepages, not checkout sessions. Manufacturer reference reachability observed:

- HTTP 200: The Ordinary (redirects to `/en-us`), e.l.f., Beauty of Joseon, SheaMoisture (redirects to `/us/en/home.html`).
- CeraVe, Maybelline and NYX returned HTTP 403 in this environment; public brand hostname knowledge does not establish a successful content audit. These remain unverified source content and the UI must preserve the sample label.

A real retail feed, current full ingredient labels and verified Nigerian merchant stock/prices are outstanding. Scientific compatibility and physical shade equivalence cannot be inferred from shared ingredient names or RGB swatches.

## Browser verification update

After fixing the test helper to wait for the React shell and after the principal agent fixed a Vite/Tailwind watcher feedback loop caused by generated test artifacts:

`npx playwright test tests/e2e/fashion-commerce.spec.ts --output=test-results-fashion`

Observed result: **4 passed in 11.8 seconds**, Chromium desktop and iPhone 13 viewport emulation. The two workflows each ran in both viewports:

1. Open Dressing Room; upload an original sample-blouse PNG generated locally; change width and rotation; save named outfit without photo retention; verify Dexie contains placement and no image assets; reload; restore saved parameters; receive truthful missing-upload guidance; delete saved outfit.
2. Open Visual Canvas; focus a note; move it with the keyboard; edit text; save on blur; reload; verify text and position persisted.

Screenshots captured and visually inspected:

- `cook/stills/r01/dressing-room-chromium.png`
- `cook/stills/r01/dressing-room-mobile.png`
- `cook/stills/r01/visual-canvas-chromium.png`
- `cook/stills/r01/visual-canvas-mobile.png`

The garment overlay is visibly a manual, flat composition. It is not photorealistic draping, generative VTO or a fit prediction and is labelled accordingly. Mobile controls wrap into two columns; the board supports horizontal scrolling and zoom, with a fit-to-viewport improvement recommended. Desktop and mobile are emulated in headless Chromium on cloud hardware; physical device touch, Safari/WebKit, real camera interactions and calibrated garment rendering remain unverified. No FPS claim is inferred from these tests.
