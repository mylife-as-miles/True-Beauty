# Round 06 — real remote skin, hairstyle and clothing providers

Date: 2026-11-02. This document separates implemented contracts, loopback fixture evidence, authenticated provider metadata and genuine paid task completion. A mocked success is never live-provider evidence.

## Current evidence

- **Implemented and contract-verified:** credential-isolated current YouCam skin workflow; hair-transfer and cloth-v4 generation; live pricing verification; explicit rights/upload/retention/spend consent; bounded shared usage; task ownership, status polling, local stop/delete, transient generated image delivery; actual responsive application entry.
- **Live metadata verified by the integrating engineer:** authenticated balance and current feature-cost requests returned HTTP 200. Account reported 1,000 spendable API units before this round's task testing. The current hairstyle template list also returned HTTP 200, including `female_s_wave_brunette`, `female_blunt_bob` and other validated IDs. This establishes key acceptance and published price access, not image compliance, task success, output quality or billed usage.
- **Genuine task evidence:** `cook/evidence/r06-live-001/receipt.json` records the first actual three-task batch using original synthetic fixtures. Hair template transfer and cloth-v4 both returned successful generated images. Skin reached a terminal provider error, with no analysis result. The batch was not retried automatically. Hair was visually reviewed as a convincing style transformation. Clothing passed transport/output but failed the intended blouse-only styling goal: the requested `full_body` mode removed the original trousers. UI and CLI now default to `upper_body`. Subsequent genuine isolated receipts verified corrected blouse-only output and four skin predictions after an explicit framing correction; see [LIVE_PROVIDER_VERIFICATION_R06.md](LIVE_PROVIDER_VERIFICATION_R06.md) for the complete sequence and browser save/reload/delete evidence. The first failure is preserved as historical evidence, not the final skin status.
- **Billing:** the native quotes were 9+2+2=13 credits; per-task billed credits remain unverified. Later authenticated account balances and conservative reservation reconciliation are recorded in LIVE_PROVIDER_VERIFICATION_R06; account deltas are not per-task invoices. A quote or conservative local reservation is not a charge receipt.
- **Clinical/fairness validity:** unverified. A synthetic portrait can exercise API transport and image generation; it cannot validate cosmetic assessment accuracy or performance across people, complexions, lighting or hair textures.
- User authorized test spending; the integrating engineer bounded the first verification batch to 100 credits, with a three-task receipt runner default of 13 credits. These are application reservations/authorization ceilings, not evidence of actual bills.

No credential is contained in this document, the browser, the receipt tool, IndexedDB, screenshots or repository configuration. The configured server is the only actor receiving provider credentials.

## Research and current official contracts

Retrieved HTTP 200 official references and bundled OpenAPI schemas on 2026-11-02. Local research snapshots are outside the distributable application under `/workspace/research/r06-youcam/`.

| Capability          | Current upstream path                            | Important request/response fields                                                                                                                                                            |
| ------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File registration   | `POST /s2s/v2.0/file`                            | `files:[{content_type,file_name,file_size}]`; response `data.files[0].file_id` and presigned `requests[0]`. PUT raw image bytes separately, with no bearer forwarded.                        |
| Skin analysis       | `POST /s2s/v2.1/task/skin-analysis`              | `src_file_id`, `dst_actions`, `format:'json'`, `miniserver_args.enable_mask_overlay`. Poll same path plus task ID. Dynamic result parser preserves returned concerns and raw/display scores. |
| Hairstyle           | `POST /s2s/v2.1/task/hair-transfer`              | `src_file_id`, one of `ref_file_id` or `template_id`, `hair_color` (`src` or `ref`).                                                                                                         |
| Hairstyle templates | `GET /s2s/v2.1/task/template/hair-transfer`      | `page_size`, optional `starting_token`; `data.templates[{id,title,...}]`, optional `next_token`. These are actual provider identifiers, never invented styles.                               |
| Clothing            | `POST /s2s/v2.0/task/cloth-v4`                   | `src_file_id`, `ref_file_id`, `garment_category`, `change_shoes`, `filter_multi_person`. V4 schema does not offer `template_id`; garment reference is required.                              |
| Generation status   | `GET {task-path}/{task_id}`                      | `data.task_status` is `running`, `success` or `error`; successful image is `data.results.url`. HTTP 200 without valid output is not a successful preview.                                    |
| Pricing             | `GET /s2s/v2.0/credit/feature-cost?page_size=20` | `result.skus`, `next_token`; exact `run_task_url` matching and current SKU SHA256. All pages must be read within a bounded limit.                                                            |
| Credit metadata     | `GET /s2s/v1.0/client/credit`                    | `results` with `Api*` credit entries. Used only by explicit operator diagnostic.                                                                                                             |

Official base: `https://yce-api-01.makeupar.com`.

Sources:

- https://docs.perfectcorp.com/reference/ai_skin_analysis.md
- https://docs.perfectcorp.com/reference/ai_hairstyle.md
- https://docs.perfectcorp.com/reference/ai_clothes.md
- https://docs.perfectcorp.com/_bundle/reference/ai_skin_analysis.yaml
- https://docs.perfectcorp.com/_bundle/reference/ai_hairstyle.yaml
- https://docs.perfectcorp.com/_bundle/reference/ai_clothes.yaml
- https://docs.perfectcorp.com/develop/file_retention_period.md
- https://github.com/YouCam-API/skills at `51c0d360adf5b5fa0abf3aa942e3b9a2bcfa19f9`.

The official skill repository was studied as documentation; its unknown-license helper scripts were not copied into the app. The metadata→presigned-upload→task pattern continues the actual MIT MIROIR integration, whose notice is retained in `apps/api/LICENSE.MIROIR`. Current endpoints and added security code are adapted to True Beauty's server boundary. No remote model weight or third-party image asset was added through this integration.

### Retention discrepancy and resolution

Older task/skill text says task lookup lasts 24 hours. The current dedicated **File Retention Period** page expressly says uploaded files, generated media and their file/task identifiers are retained for **30 days**, while each retrieved download URL is valid for **2 hours**. The product therefore requires acknowledging 30-day provider retention and links that source. Its local task expiry is only 15 minutes and cannot override upstream retention. No documented upstream cancellation/deletion endpoint was found; the UI does not promise either.

## Module boundaries

- `apps/api/src/youcamTransport.ts`: fixed API origin; bounded JSON/media streaming; HTTPS allowlist for YouCam S3 bucket hosts; redirect refusal; timeouts; image magic checks; no credentials forwarded to upload/output hosts. Browser clients cannot choose fetch targets, headers or provider task URLs.
- `provider.ts`: existing skin adapter uses that transport; original exports remain compatible.
- `generationContracts.ts`: strict Zod contracts, precise options, image MIME/size limits, rights/upload/retention authorization, typed generated output, retention constants.
- `generationProvider.ts`: actual file upload, exact current task bodies, actual template lookup, task polling and image download.
- `generation.ts`: registered routes, pricing/quote authorization, session-owned transient jobs, shared ledger, polling, deletion and cancellation semantics.
- `youcamDiagnostics.ts`: safe setup metadata and optional authenticated free metadata inspection.
- `apps/web/src/components/RemoteStudio.tsx` / `.css`: actual upload previews, hairstyle/clothing controls, template lookup, setup state, current quote, credit maximum, explicit consent, task progress, typed result, download/use, local stop/delete and recent-task resume.
- `apps/api/scripts/verifyYouCam.ts`: keyless local-API receipt runner, described below.

The remote studio is labelled an **AI-generated image** experience. Live makeup/hair tint AR, static garment compositing and generative clothing remain distinct. Selecting an image never submits it automatically. No demo portrait is automatically uploaded. A locally shared session photo may be explicitly selected only through a button and still requires image-use permission and upload consent.

## Local API contract

Root server mounts `registerGenerationRoutes(app,{getSessionId,ledger,dailyCredits,...})` under the existing Origin, HttpOnly SameSite session, rate-limit and CSRF boundary. There is no user registration or remote identity.

| Local route                                            | Behavior                                                                                                                                                                                                                                             |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/generation/capabilities`                     | Separate credential, operator paid-enable, budget and reviewed-plan readiness. Includes 15-minute local and 30-day provider retention. `liveVerified:false` remains conservative without a separately recorded paid task receipt.                    |
| `GET /api/generation/templates/hair?startingToken=...` | Actual bounded provider template metadata. No image upload or generation.                                                                                                                                                                            |
| `POST /api/generation/quotes`                          | Strict `{spec}`. Exact reviewed settings, fresh current SKU hash and shared daily budget check. One-use, session-bound, five-minute quote. Sends no image.                                                                                           |
| `POST /api/generation/tasks`                           | Strict body below. Same session/quote/spec; sufficient per-call maximum; rights/upload/retention consent; validated JPEG/PNG max 4MB each; reserves credits before upload. Returns 202 with local task ID; real upstream work begins asynchronously. |
| `GET /api/generation/tasks`                            | Session's temporary tasks only; useful for resuming without another paid submission.                                                                                                                                                                 |
| `GET /api/generation/tasks/:id`                        | Coalesced polling, no sooner than 10 seconds. Real result metadata and same-origin image path only after provider success. No new paid task.                                                                                                         |
| `GET /api/generation/tasks/:id/image`                  | Same-session completed task only; fixed allowlisted upstream result; bounded 8MB image; response `no-store`; no arbitrary URL query.                                                                                                                 |
| `POST /api/generation/tasks/:id/cancel`                | Stops local upload/poll/download and clears local media. Provider may already be processing/charging. Does not claim upstream cancellation or refund.                                                                                                |
| `DELETE /api/generation/tasks/:id`                     | Clears local task/result. Does not claim upstream deletion or refund. Consumed quote cannot create another task.                                                                                                                                     |

```ts
type Spec =
  | { feature: "hair"; hairColor: "src" | "ref"; templateId?: string }
  | {
      feature: "clothing";
      garmentCategory:
        "full_body" | "lower_body" | "upper_body" | "shoes" | "auto" | "outer";
      changeShoes: boolean;
      filterMultiPerson: "normal" | "strict";
    };
type Image = { base64: string; contentType: "image/jpeg" | "image/png" };
type TaskBody = {
  quoteId: string;
  spec: Spec;
  source: Image;
  reference?: Image; // required unless using a hairstyle template
  maxCredits: number;
  consent: {
    uploadImages: true;
    rightsConfirmed: true;
    externalProcessing: true;
    providerRetentionAcknowledged: true;
  };
};
```

No secrets, source photos or generated images are written to IndexedDB by this component. Inputs/results live in transient memory. Blob URLs are revoked on replacement/unmount. Server cleanup zeroes decoded input/result buffers on cancellation, deletion, expiry and close; JavaScript strings/HTTP framework allocations rely on garbage collection and are not promised cryptographic erasure. Local task lists, signed provider URLs and provider IDs are not durable; restarting the pilot process loses resumable in-memory jobs. A job must be checked in the provider account before any separately authorized retry after an ambiguous failure.

Bounds: 60 live quotes; 20 temporary tasks; 4 concurrent creations; 4MB each source/reference; 8MB each generated result; 32MB combined transient result cache; 15-minute task expiry. No automatic paid retries, follow-up generations or refunds. The durable single-process budget ledger conservatively keeps reservations on failed/uncertain requests. Multi-process production needs an atomic shared usage ledger; this pilot file ledger is not a distributed spending service.

## Configure without leaking keys

The server-only configuration extends the existing skin plan:

- `YOUCAM_API_KEY`: native secret / secure process input; never browser configuration.
- `YOUCAM_ENABLE_PAID=true`: explicit operator switch, disabled by default.
- `YOUCAM_MAX_DAILY_CREDITS`: positive shared ceiling for skin + hair + clothing.
- `YOUCAM_SKIN_PLAN_JSON`: existing exact action-set reviewed plan.
- `YOUCAM_GENERATION_PLANS_JSON`: array of `{spec,credits,skuHash,reviewedAt}`. Each exact spec requires review; a different hair colour source, template or garment category cannot reuse another spec's authorization.
- `YOUCAM_USAGE_PATH`: durable credit-only reservation ledger; default `.runtime/usage.json`.

Plans expire after 30 days. Quotes re-fetch current pricing and fail closed if the reviewed SKU hash is missing or changed. No exchange rates, cash totals or costs are inferred from unreviewed prose.

Read-only local setup check:

```sh
npx tsx apps/api/src/youcamDiagnostics.ts
```

With the server credential safely supplied to that process, an operator may explicitly add `--check-connection` for authenticated balance/SKU metadata. This diagnostic does not register media or create tasks. Never print a key or copy one into command history. Managed environments should keep their configured network proxy and CA trust (`NODE_USE_ENV_PROXY=1` where required); do not disable TLS validation.

### Authenticated pricing snapshot from integration

These values were actually read by the integrating engineer on 2026-11-02. They are evidence of that observation, not permanent prices or default authorization for other specs.

| Reviewed capability   | Credits | Exact SKU hash                                                     |
| --------------------- | ------: | ------------------------------------------------------------------ |
| Skin SD, 1–4 concerns |       9 | `ecae18b742c1e1a48ca086d8e0d20fbd7d09f39b56c43d1a691ade23636c3bf4` |
| Hair custom reference |       2 | `5e7a09d3514d3c81cb060f4637ef1e5659ed7fc5464437a80155a7d55f2594bc` |
| Clothes V4            |       2 | `c139268f7aa7f64f9c66f449f5404b4642c2c74aee4609a11f6f10fd22ba4037` |

The integrating engineer separately verified a current hairstyle preset SKU: 2 credits, hash `882c29deaf8e49de0ebcb6f1d5ccd1cf4efe0770975f438dedfe858e6802dd1e`. The exact preset specification still needs its own reviewed plan; do not reuse the custom-reference SKU hash for template mode.

## Genuine receipt runner

Prepare three original rights-cleared synthetic JPEG/PNG fixtures: close-framed face for skin/hair source, full/upper body person for clothing and garment reference. A current provider hairstyle template can avoid a separate hairstyle reference. Custom-reference mode instead needs a fourth original fixture. Skin SD docs require the short edge≥480px, long edge≤2560px and a large enough frontal face. The runner validates MIME signatures and 4MB limits, but provider compliance is determined by the actual service.

With the already-configured local API running:

```sh
npx tsx apps/api/scripts/verifyYouCam.ts \
  --api http://127.0.0.1:3001 \
  --portrait /absolute/portrait.jpg \
  --person /absolute/person.jpg \
  --hair-template female_s_wave_brunette \
  --garment /absolute/garment.jpg \
  --max-credits 13 --rights-confirmed --synthetic \
  --output cook/evidence/r06-live-001
```

The CLI accepts **no provider key**. It uses only loopback API origins, receives its own local cookie/CSRF token in memory, verifies all three quotes before any upload, rejects combined cost above the authorized ceiling, submits each exactly once, stores each local task ID immediately and polls that existing ID. It does not automatically retry an ambiguous paid submission. Existing receipts prevent a silent rerun into the same output directory. Defaults are skin `texture,pore,redness,moisture`, source hair colour, and clothing upper_body/strict/unchanged shoes. `--garment-category` accepts only the current documented category enum; an exact reviewed pricing spec is still required. The first preserved receipt accurately records the earlier `full_body` request and is not rewritten. Choose exactly one of `--hair-template ID` or `--hair-ref PATH`; the exact template is sent in both the quote and task spec and recorded in the receipt, with no hairstyle reference read or uploaded in template mode. Unknown/duplicate options and consent flags with values are rejected before network work. Use `--skin-actions` only if the operator reviewed that exact action set.

Output contains file names/SHA256, consent declaration, exact quotes, local task IDs, genuine returned normalized skin observations, output image bytes/SHA256 and status/error. It excludes source image bytes, bearer/session/CSRF credentials and signed media URLs. A receipt leaves `actualBilledCredits:null` and `billingVerified:false` until actual provider-account usage is checked. Synthetic fixture results must not be described as validated human skin assessments. A task timeout leaves a receipt and does not authorize resubmission.

## Verification and visual review

Backend tests use a real **loopback HTTP fixture server**. A test-only injected transport redirects the fixed provider hosts to that server. It is not reachable as a browser request parameter and performs no live external call. The keyless runner additionally tests combined-ceiling rejection before any task, both reference/template modes, exactly one submission per operation, safe receipts and invalid-option rejection before any network call. The backend tests exact file registration/PUT/task/status/result schema, auth isolation, current price change rejection, credit/consent checks, owner isolation, quote replay/deletion, shared budget, result allowlist, bounded bytes, template selection, aborted buffer cleanup and actual root CSRF/session mount.

Commands:

```sh
npx vitest run tests/api.test.ts tests/generation.test.ts tests/youcam-receipt.test.ts
npx playwright test tests/e2e/remote-studio.spec.ts --project=chromium --project=mobile
```

The focused backend/CLI suite now passes **34/34** (6 existing API, 11 generation, 11 sanitized skin-error and 6 keyless runner tests). The browser run passed **8/8**: three explicitly labelled provider-contract fixtures per viewport, plus actual Dressing Room→RemoteStudio entry and local-only preparation per viewport. No paid request occurred. The fixture result screenshot visibly carries a persistent **CONTRACT FIXTURE** banner, including the mobile result view. Test data is never presented as genuine generation.

Captured and visually inspected desktop/mobile evidence:

- `cook/stills/r06/remote-actual-app-entry-{chromium,mobile}.png`: actual App, generation not ready, locally prepared images only.
- `cook/stills/r06/remote-unconnected-fixture-{chromium,mobile}.png`: isolated setup fallback and local preparation.
- `cook/stills/r06/remote-result-CONTRACT-FIXTURE-{chromium,mobile}.png`: labelled test output, download/use/delete controls and retention warning.
- `cook/stills/r06/remote-clothing-stopped-fixture-{chromium,mobile}.png`: local-stop semantics.

Desktop uses a two-column preparation/result surface; mobile stacks controls before result. Quote, consent, credit maximum, result actions and warnings remain accessible without gesture/camera requirements. These images demonstrate UI and fixture workflows, not provider realism. Genuine generated output must be separately inspected and linked after its receipt is recorded.

## Remaining gates

1. Preserve all genuine first-batch and isolated recovery receipts. Framed skin, corrected upper_body clothing and the full skin browser journey subsequently passed (LIVE_PROVIDER_VERIFICATION_R06). Do not repeat successful charged experiments merely for screenshots. Check per-task billing rather than treating quotes or aggregate balances as invoices.
2. Root integrated persistent generated-source provenance and original-source restore in the mirror, plus a guard against analyzing a generated source as skin evidence. Browser verification of those cross-space safeguards belongs to the integrating engineer.
3. Live provider error, compliance, billing and output-host differences must be resolved from actual evidence without broadening to an unchecked fetch proxy.
4. Broader representative real-device, fairness, haircut/fit realism, accessibility and mobile performance studies remain separate product gates. Fixture success and synthetic tasks cannot satisfy them.
5. Provider retention/deletion contract needs service-owner confirmation before making any stronger deletion promise. No upstream delete/cancel implementation is asserted.

## Terminal skin error diagnosis and isolated verification

The first genuine skin task ended in `error`. Its old status route discarded the engine code and returned only a generic photo suggestion; the receipt cannot establish the actual cause. No concern score, image-quality cause or medical conclusion can be recovered from that generic message. The task was not automatically repeated.

Current official `SkinAnalysisResponseV2` uses `data.error` for an engine code and `data.error_message` for arbitrary free text. The skin overview adds explicit resolution/framing/lighting codes beyond the shared engine enum. `apps/api/src/skinProviderFailure.ts` now maps only documented exact codes to static `code`, `known`, `summary`, `recovery`, `nextStep` and `automaticRetry:false`. The adapter removes free-form messages before returning an error status. The root GET status route supplies `providerFailure` and a safe display message; unknown fields/codes become `unrecognized_provider_error` with operator-review guidance. It never guesses a photo defect from unknown text, forwards raw error_message, exposes upstream task IDs, or starts a retry.

Known cases distinguish resolution, face-width/framing, dark lighting, absent/obscured face, decode failures, unsupported parameters, provider internal errors, result delivery and policy errors. For example, `error_src_face_too_small` explains the provider's >60%-of-image-width framing requirement. An internal pipeline error instead directs operator/provider review; it does not claim a skin observation or that brightening the photo will fix it. Official sources retrieved 2026-11-02: skin bundled schema/overview above and https://docs.perfectcorp.com/develop/error_codes.md.

Isolate a newly authorized skin attempt without repeating successful hair or clothing:

```sh
npx tsx apps/api/scripts/verifyYouCam.ts \
  --api http://127.0.0.1:3002 --skin-only \
  --portrait /absolute/original-synthetic-portrait.png \
  --max-credits 9 --rights-confirmed --synthetic \
  --output cook/evidence/r06-skin-002
```

Isolate a separately authorized blouse-only check:

```sh
npx tsx apps/api/scripts/verifyYouCam.ts \
  --api http://127.0.0.1:3002 --clothing-only \
  --person /absolute/original-synthetic-person.png \
  --garment /absolute/original-synthetic-blouse.png \
  --garment-category upper_body --max-credits 2 \
  --rights-confirmed --synthetic \
  --output cook/evidence/r06-clothing-002
```

The single-feature modes are explicit, mutually exclusive and reject unrelated source/settings arguments before any file or network work. Skin-only loads only the portrait and contacts only skin endpoints. Clothing-only loads only person/garment and contacts only generation endpoints, with an exact clothing spec. Both quote before upload, record the actual requested spec and submit exactly once. A distinct output directory prevents overwriting evidence or silently retrying a consumed operation. The CLI now captures sanitized providerFailure on both immediate and polled terminal errors.

An optional operator diagnostic should consume only the typed sanitized failure from an explicitly synthetic-fixture run. No raw provider-response logging or additional generic upstream proxy is necessary. This engineer did not restart the configured API or make any paid call while adding these diagnostics. The integrating engineer controls any process refresh and subsequent real test.

## Round07 hosted continuation

Subsequent genuine local pilot recovery is authoritative in [LIVE_PROVIDER_VERIFICATION_R06.md](LIVE_PROVIDER_VERIFICATION_R06.md): detected face-too-small was corrected with an explicit locally reviewed crop, skin returned four actual predictions, corrected upper_body retained trousers, and actual skin history save/reload/delete completed without photo storage. These do not establish scientific validity. The native Fetch/durable hosted continuation is documented in [EDGE_YOUCAM_R07.md](EDGE_YOUCAM_R07.md); source compilation and local fixtures are distinct from actual public deployment.
