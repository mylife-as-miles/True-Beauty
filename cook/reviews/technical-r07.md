# Independent technical review — round07

Reviewed 2026-11-02 against engineering source `ae2445f` and the subsequent image-input fix. Scope: the native Worker entry, authentication/CSRF, encrypted durable store, reasoning and YouCam routes/adapters, current contract tests, retained runtime/provider evidence and four-source provenance. This critic changed only this report and `tests/image-input-r07.test.ts`. The integrating engineer changed application code.

**One concrete medium-severity input defect was reproduced and fixed in source. No high/critical defect was reproduced in the reviewed boundaries. The full-product ≥9 gate remains unmet.** The source fix still requires inclusion in a succeeding public release; the reviewed v4 deployment predates it.

## R07-T1 — Valid near-4 MiB image rejected by base64 regex stack overflow

**Severity: medium. Source fix independently verified; public inclusion pending at this review.**

At `ae2445f`, `apps/api/src/youcamImage.ts:8` validates base64 with a repeated grouped regular expression. An actual generated, nonpersonal **1100×1200 RGB PNG**, with proper PNG chunks and CRCs, is **3,962,473 bytes** and encodes to **5,283,300 characters**. Both sizes are within the advertised 4 MiB / 5,600,000-character limits. Passing it to the actual `imageBytes()` throws `RangeError: Maximum call stack size exceeded` before decoding. The above-4 MiB boundary also overflows before producing its intended size error.

This is reachable through ordinary upload contracts, rather than requiring malformed JSON or a custom endpoint. `apps/web/src/components/SkinLab.tsx:439` accepts original JPEG/PNG blobs through 4 MiB and preserves those original bytes for submission. The Node and Worker skin/generation routes share `imageBytes`; their catch turns the exception into an invalid-image response. The rejection occurs before reservation/upload in the reviewed Worker submit path, so this reproduction establishes a broken accepted-input contract, not leaked data or an unauthorized charge.

Independent execution:

- New `tests/image-input-r07.test.ts`: **8 passed / 2 failed** against the original source; the valid PNG fails with the exact stack error and the oversize case returns that error instead of its size error.
- Actual local **workerd**, Miniflare `5.20261101.0-beta`, compatibility `2026-11-01`, bundling the exact `ae2445f` validator: 1,000,000 and 3,000,000 decoded bytes pass; a 3,962,473-byte signature-valid buffer throws the same `RangeError`. No outbound service/provider request is made. The workerd buffer checks isolate the validator; the complete valid-PNG reproduction is in the independent test.
- The integrating engineer replaced the nested repetition with flat character/padding checks and computes decoded length before allocation. The independent suite now passes **10/10**. Current workerd decodes all three tested sizes, including 3,962,473 bytes.
- The tests also cover decoded oversize, internal/excess padding, incomplete final quartet, invalid characters, whitespace, URL-safe characters, and both permitted padding lengths. Scoped ESLint and Prettier checks pass.

Command: `npx vitest run tests/image-input-r07.test.ts`. These are parser/limit regressions, not image-content, portrait-quality or provider-accuracy tests. No photograph, provider request or paid retry was used.

## What the native implementation establishes

The hosted path now contains actual provider workflows, rather than the earlier non-dispatching boundary prototype. `apps/edge/src/worker.ts` routes to Fetch-compatible services. Its session cookie conveys ownership and CSRF; operator authorization is separate. `runtime/auth.ts` requires the exact HTTPS origin and same-origin mutation header, signs a one-hour HttpOnly/Secure/SameSite cookie, and grants owner privileges only through the server bearer or explicitly trusted allowlisted dispatch identity.

`runtime/store.ts` encrypts task/quote JSON with AES-GCM and row-bound additional authenticated data. The real SQL reservation trigger atomically consumes the exact quote and updates the conservative shared ledger. Monotonic CAS revisions prevent a late lease from overwriting a deleted/recreated record. Original task TTL bounds remain in place; quote expiry does not spuriously end an already-reserved task. These are meaningful implemented boundaries. The activity-driven cleanup is not an exact wall-clock deletion guarantee, and retained cumulative reservation metadata is not a provider invoice.

The reasoning path hashes reviewed context/tools, rechecks paid continuation, claims a durable turn, validates the actual adapter output and caches it before returning actionable calls. The YouCam path shares the actual registration→upload→create→status adapters with the Node pilot, retains one conservative reservation, distinguishes uncertain dispatch, bounds media downloads and proxies only allowed media URLs. Cancellation/deletion prevents local late writes but does not promise upstream cancellation, deletion or refunds.

I read the current store, Worker-boundary, reasoning and YouCam tests. I did **not** rerun their full suites. `hosted-store-r07.json` records **18 actual two-service/shared-D1 assertions**. `reasoning-default-fetch-workerd.json` and `youcam-default-fetch-workerd.json` record **13 and 17 assertions** using actual native global fetch with scripted outbound services. Their old receiver-bound fetch negative controls reproduce `Illegal invocation` before dispatch; current wrappers avoid that receiver bug. Manual redirects reject scripted 3xx without following Location. These artifacts are stronger than an injected Node fetch-only test, but they remain local scripted runtime evidence, not genuine provider calls. I reviewed them and independently executed only the focused image-input workerd probe above.

## Independent public observations and retained genuine receipts

My anonymous read-only GETs at `https://true-beauty-miles.myles4miles.chatgpt.site`, with redirects disabled, returned:

| Path | Independently observed |
| --- | --- |
| `/api/health` | 200, `true-beauty-cloud`, `r07`, `durable:true` |
| `/api/operator/status` | 200, `operator:false`, `trustedIdentity:true`, neither dispatch ID nor email present |
| `/api/capabilities` | 200, skin requires a verified quote, reasoning ready, exact quote approval required; both provider `liveVerified` fields remain false |

No operator credential, provider call, image, private history or native Site mutation was used. The security critic separately records caller-header stripping probes; my three GETs do not independently prove every hostname or real owner recognition.

I inspected the retained genuine hosted receipts rather than repeating charged requests:

- **Claude002:** three completed model turns, two actual successful local tools and mounted lip/hair controls reflecting the requested values. No selected personal context or image. This establishes a real bounded tool loop, not advanced reasoning quality or broad tool coverage.
- **Skin003:** four genuine provider predictions and their limitations reached the public UI. Its harness times out waiting for a manual polling control after automatic polling already delivered results. There is no completed history/save/reload/delete record in that receipt. Treat that as an incomplete hosted journey, not a failed provider result or a passing persistence test. The follow-up harness correction is not a rerun of the complete journey.
- **Generation002:** both tasks report success, and separately measured natural dimensions, nonempty decoded pixel distributions and screenshots establish rendered images. The receipt's `image.bytes:0` and `e3b0c442…` values are the hash of an empty HTTP-body capture and **cannot attest generated-output bytes**. The original receipt is preserved; its adjacent `REVIEW.md` now states this correctly. The future local-Blob capture fix was reviewed but not used for a new charged run. No valid output-byte hash is established for Generation002 by that correction alone.
- **Merchant verified replay:** nine recorded checks include exact clicked SKU/currency/amount in the bag, separate NGN/USD totals, reload and local recall. Those are dated public structured-data observations through the native service, not reserved stock, checkout or a merchant partnership. I inspected this artifact; I did not repeat merchant requests.

`cook/evidence/r07-hosted/deployment.json` was initially stale v3/environment4 and has been reconciled to reported **v4/environment5**, engineering `ae2445f`, Site source `b4ebc97d7ea5dbc8a6480abd750898b227a05af0`, successful deployment and archive/Worker fingerprints. Public health exposes the release family, not a build hash, so my metadata checks cannot independently bind the public bytes to that SHA. The newly verified image fix needs a subsequent deployment record. Actual billing and provider-side retention/deletion enforcement remain unverified.

## Engine integration, source provenance and remaining gates

The four mandatory repositories materially contribute source. I inspected the active OpenMakeup simplex/material code in `shader-library/src/index.ts`, the Virtual Makeup-derived lifecycle/scheduler in `vision-core/src/{useCamera,pipeline}.ts`, MIROIR's actual colour/provider adaptations and the Skyn-derived clustering in `skin-engine/src/sampling.ts`. The pinned SHA/path/license matrix and retained notices describe real reuse; no Skyn clinical classifier or dataset is being credited as deployed validated medicine. The native migration retains the shared MIROIR provider implementations instead of substituting canned results. Common Table's separately licensed build plugin is additional tooling reuse, not a replacement for one of those four contributions.

Technical integration does not settle the absent Virtual Makeup standalone notice, model/media/output distribution rights, physical mobile/desktop performance, representative-person fairness or calibrated cosmetic/clinical accuracy. Historical worker rAF cadence cannot stand in for prediction FPS. This review provides no new hardware, renderer-realism, fairness or thermal benchmark.

The necessary next gate is to publish and bind the image-input fix to the public build, retain the corrected generation evidence qualification and finish the hosted skin persistence journey without inventing a passing result. The broader 219-capability/ten-journey inventory, advanced agent/occasion-plan work, physical-device measurements and rights/scientific gates remain outside this bounded backend improvement. Neither the root's larger passing test counts nor these genuine provider successes establish ≥9 acceptance.
