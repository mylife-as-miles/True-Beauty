# MIROIR / SKIN_AI integration

- Repository: https://github.com/AryanMashalkar/SKIN_AI
- Inspected commit: `f3c0661cb0594fff07e89c80fbe129e7e5bdffa5`
- Audit date: 2026-11-02
- Software license: MIT, Copyright (c) 2026 MIROIR. Full notice retained in `packages/skin-engine/LICENSE.MIROIR`, `packages/beauty-intelligence/LICENSE.MIROIR`, and `apps/api/LICENSE.MIROIR`.

## Source studied and adapted

| Source path                                                                                                | Destination                                                          | Actual contribution and modifications                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/color.ts`                                                                                         | `packages/skin-engine/src/color.ts`                                  | Retained sRGB→linear→XYZ D65→CIELAB conversion, colour descriptors, twelve season definitions/palettes and heuristic lookup. Added strict hex validation. Removed source comments implying palettes or complexion heuristics were clinically validated. No inference of Fitzpatrick phototype.                                                                                                     |
| `src/lib/season.ts`                                                                                        | `packages/skin-engine/src/season.ts`                                 | Retained three-axis hue/value/chroma dominance algorithm, hair/eye feature contrast and reduced confidence when features are missing. Replaced Next.js aliases with package-local imports. UI labels confidence as an unvalidated heuristic, not a calibrated probability.                                                                                                                         |
| `src/lib/appearance-sample.ts`, `src/lib/white-balance.ts`, `src/lib/tone-crosscheck.ts`                   | `packages/skin-engine/src/sampling.ts`, Skin Lab                     | Studied iris-ring sampling, region rejection and correction concepts. Implemented landmark face-region skin sampling and iris annulus sampling. Hair is sampled only within a real segmentation mask; no assumption that the band above the forehead is hair. No invented white-balance correction where there is no known reference patch.                                                        |
| `src/lib/skin.ts`                                                                                          | `packages/skin-engine/src/provider.ts`                               | Adapted wrapped output and regional concern parsing. Kept unknown typed metrics. Deliberately removed missing-score defaults (78), inferred skin age, inferred skin type and invented fallback profiles. Supports actual typed API output and nested `score_info` structures. Raw and provider-adjusted UI scores remain distinct.                                                                 |
| `src/lib/matching.ts`                                                                                      | `packages/beauty-intelligence/src/recommendations.ts`                | Adapted ordered AM/PM routine slots, explainable catalogue concern matching and unique-product basket totals. Added owned-product priority, exact avoid-ingredient filtering, currency-aware prices and a combined budget across both routines.                                                                                                                                                    |
| `src/lib/perfectcorp.ts`, `src/app/api/skin/analyze/route.ts`, `src/lib/rate-limit.ts`                     | `apps/api/src/provider.ts`, `server.ts`, `contracts.ts`, `budget.ts` | Retained metadata registration→presigned upload→task create→status flow. Corrected outdated host/file path against current official docs. Removed mock fallbacks. Added runtime schemas, CSRF/Origin/session isolation, one-use pricing quotes, explicit upload/retention/credit consent, image signature/size checks, task ownership/expiry and durable conservative daily spending reservations. |
| `src/lib/fashion/vto.ts`, `src/lib/fashion/recolor.ts`, `src/lib/fashion/colourways.ts`, `src/lib/cart.ts` | See fashion/commerce agent note                                      | Studied as cross-engine integration context; fashion/commerce engineer owns the actual adaptation.                                                                                                                                                                                                                                                                                                 |

## Operational and verified

- Pure colour conversion, palette classification, missing-feature uncertainty and invalid swatch rejection pass Vitest fixtures.
- Source-derived dynamic provider parser passes wrapped, nested HD, region-specific, unknown metric, invalid/absent field and like-for-like progress comparison tests.
- Routine builder and ingredient context pass budget, currency, owned-only, explicit avoidance and ingredient comparison tests.
- API security/adapter tests pass using explicit contract fixtures. These tests **are not live provider verification**.
- Skin Lab integrates the algorithms and reactive local history/profile/routines. Browser verification is recorded separately by QA.

## Official API research and discrepancies

Accessed actual official documents on 2026-11-02:

- https://docs.perfectcorp.com/reference/ai_skin_analysis.md
- https://docs.perfectcorp.com/reference/ai_skin_analysis/v2.1.md
- https://docs.perfectcorp.com/reference/ai_skin_analysis/v2.1/paths/~1s2s~1v2.1~1task~1skin-analysis/post.md
- https://docs.perfectcorp.com/reference/ai_skin_analysis/v2.1/paths/~1s2s~1v2.1~1task~1skin-analysis~1%7Btask_id%7D/get.md
- https://github.com/YouCam-API/skills at `51c0d360adf5b5fa0abf3aa942e3b9a2bcfa19f9`, skin-analysis-expert skill, API fallback snapshot and pricing scripts.

Current documented base is `https://yce-api-01.makeupar.com`. File registration is `POST /s2s/v2.0/file`, replacing MIROIR's `/s2s/v2.1/file/skin-analysis`. Task creation/polling remains `/s2s/v2.1/task/skin-analysis`. SD and HD action sets cannot be mixed. Sixteen concern families are listed; the parser does not hardcode an expected result count. SD requires a short side ≥480 pixels, HD ≥1080 pixels, long side ≤2560. The adapter sends `format=json`. Official task docs recommend polling around 10 seconds when webhooks are unavailable.

The official overview expressly describes `ui_score` as adjusted towards more favorable consumer-facing results. The UI therefore does not call it a measured hydration percentage, confidence score or clinical health score. Both raw and display fields are preserved without converting one to the other.

## Blockers / unverified work

- Original integration checkpoint lacked credentials and spending authorization. Round06 has genuine authenticated balance/pricing HTTP200 evidence and approved bounded test spending; the actual original-synthetic first batch now has successful hairstyle and cloth-v4 outputs plus a terminal skin error. The first clothing request used full_body for a blouse and changed more than intended; corrected upper_body remains separately unverified. Skin success is still unverified. See [Round06 provider evidence](../REMOTE_PROVIDERS_R06.md).
- Live billing SKUs are tiered. An operator must review an exact-action plan against the current official pricing SKU, configure its SHA256 and credit ceiling, and refresh it within 30 days. A changed SKU disables payment requests. This is a single-process pilot spending ledger; multi-instance deployment requires an atomic shared budget store.
- Real provider fairness/accuracy across complexions is unverified. Colour fixtures demonstrate bounded deterministic processing, not validation on people or a skin assessment accuracy benchmark.
- No MIROIR third-party asset, photograph, scraped product dataset or model weight was copied by this engineer. MIT source coverage does not clear external assets, vendor API rights or datasets.

## Currency regression review

Independent technical review found Skin Lab previously reinterpreted a saved USD budget as NGN and overwrote its currency on profile save. The component now preserves the profile's NGN/USD/GBP/EUR selection and computes routines only from prices in that same currency. It does not convert prices. If a finite-budget routine has no priced or owned products in the selected currency, it states that no catalogue prices were selected instead of displaying a misleading zero-cost total.

A real UI regression test in `tests/e2e/skin.spec.ts` sets USD100 in profile settings, saves care preferences through Skin Lab, reopens settings to verify USD100 was retained, builds an actual sample-USD48 routine, then selects GBP and verifies the unavailable-price state. This test passed Chromium desktop and emulated mobile (2/2). Existing NGN scenario remains independently covered.

## Source lifecycle regression review

Skin Lab invalidates portrait and inspection epochs when an upload changes the source, immediately clears the previous image reference, clears prior map/swatches/canvas state, and requires the current portrait to load before inspection. Async inspection results, errors and completion handlers check the source epoch, exact image identity and inspection generation. A late old result cannot overwrite a newer photo or manual swatch correction.

The real browser regression `a delayed local inspection cannot apply an old portrait result over a newer source` delays the return of actual MediaPipe inference, uploads a different portrait, verifies old preview state was cleared, completes actual inference of the new image, then releases the old result and checks that the new swatches remain. It passed Chromium desktop and emulated mobile (2/2). The delayed return is test instrumentation; the inference itself is genuine, with no invented landmark result.

## Session portrait continuity

Skin Lab and Living Mirror share an ephemeral Zustand portrait URL. Choosing a demo or explicitly uploading/capturing a photo carries that same source between spaces. The store owns blob URL revocation on replacement; Skin Lab does not revoke it on route unmount. This state is not written to IndexedDB and resets with the session unless the user follows a separate consented save path. Profile preferences and budget are independent of portrait changes.

A real UI test chooses Soft portrait in the mirror, checks the identical Skin Lab source, uploads a visually different blue-light portrait in Skin Lab, returns to the mirror and checks actual background canvas pixels against the uploaded image. It verifies the blob is still valid after route unmount and that returning to Skin Lab retains the same URL. Chromium and emulated mobile passed (2/2). The source-change/delayed-result regressions also passed after this integration.

## Round06 provider modernization

The MIT metadata-registration→presigned-upload→task pattern now lives in shared `apps/api/src/youcamTransport.ts`; `provider.ts` continues the actual skin implementation. Added bounded streaming, timeouts, narrow YouCam S3 host validation, refusal of redirects and no bearer forwarding to media hosts. `generationProvider.ts` implements current hair-transfer v2.1 and cloth-v4 schemas researched from official OpenAPI; it does not expose server credentials or borrow unlicensed scripts. All generation inputs require explicit image-use permission, upload/retention consent and quoted spend authorization.

Current dedicated provider retention documentation contradicts older 24-hour task text: it states 30-day media and task/file retention, 2-hour download links. UI and contracts therefore use 30-day conservative disclosure; local expiry/deletion never claims upstream deletion. Official source: https://docs.perfectcorp.com/develop/file_retention_period.md (retrieved 2026-11-02). The complete contract and separate fixture/live-evidence state are in [REMOTE_PROVIDERS_R06.md](../REMOTE_PROVIDERS_R06.md).
