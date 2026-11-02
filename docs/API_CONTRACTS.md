# API and provider contracts

Local browser functions work without the API. Start optional server with `npm run dev:api` (default `127.0.0.1:3001`); Vite should proxy `/api` to it. There is no user account or authentication registration. The ephemeral API session below is a browser CSRF/task-ownership capability, not a remote identity.

## Browser/server routes

| Route                        | Result / requirement                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/health`            | Process health only. Does not assert live provider readiness.                                                                                                                                                                                                                                                                                           |
| `GET /api/capabilities`      | Reports skin, hairstyle, clothing and reasoning readiness separately, including credential, operator enable, budget and reviewed-plan gates. `liveVerified:false` is conservative without a genuine task receipt; authenticated metadata alone does not prove task completion.                                                                          |
| `GET /api/session`           | HttpOnly SameSite=Strict session cookie, 30-minute expiry, JSON `{csrfToken,expiresAt}`. No login. 100-session bound.                                                                                                                                                                                                                                   |
| `POST /api/skin/quotes`      | Requires allowed Origin, session cookie and `X-CSRF-Token`. Body `{actions:string[]}`. Only exact operator-reviewed action sets allowed. Re-fetches current official SKUs and checks approved hash; returns one-use 5-minute `{quoteId,credits,unit,actions,expiresAt,pricingProvenance}` or explicit unavailable error. This performs no image upload. |
| `POST /api/skin/tasks`       | Schema below. Requires exact actions matching quote, same session, unexpired quote, explicit consent and authorized credits ≥ quote. Validates JPEG/PNG magic bytes and 4MB ceiling before spending. Conservative daily budget reserved before upstream call. Quote is idempotent, so replay returns same task.                                         |
| `GET /api/skin/tasks/:id`    | Same-session ownership; returns creating/running/success/error, normalized real observations on success and next poll ≥10s. Never creates a new provider task. Results stay in this process RAM for 15 minutes.                                                                                                                                         |
| `DELETE /api/skin/tasks/:id` | Same-session CSRF-protected local task deletion. Explicitly does not claim upstream deletion.                                                                                                                                                                                                                                                           |

Task body:

```ts
{
  quoteId: string; // UUID from the current session
  imageBase64: string; // JPEG/PNG bytes, no data URL, max decoded 4MB
  contentType: 'image/jpeg' | 'image/png';
  actions: string[]; // validated official enum, no mixed SD/HD plan
  overlay?: boolean;
  maxCredits: number;
  consent: {
    uploadImage: true;
    externalProcessing: true;
    providerRetentionAcknowledged: true;
  };
}
```

No API key is returned, logged, included in frontend environment variables, or stored in IndexedDB. Request logging is disabled to avoid recording image bodies. Provider errors are summarized without exposing upstream credentials, signed URLs or raw image contents. Byte buffers are zeroed after task creation; the original request body is held only during the request. MIME declarations are checked against magic bytes; actual image compliance is also validated by the provider. This is not a malware scanner or a full image-decoding validation service.

## Optional server-only configuration

- `YOUCAM_API_KEY`: server credential. Never prefix with `VITE_`.
- `YOUCAM_ENABLE_PAID=true`: explicit operator switch, disabled by default.
- `YOUCAM_MAX_DAILY_CREDITS`: positive hard ceiling for conservative reservations.
- `YOUCAM_SKIN_PLAN_JSON`: reviewed plan `{actions,credits,skuHash,reviewedAt}`. `actions` must be exact, unique, same-tier official actions. `credits` is an operator-reviewed upper bound for that exact action set. `skuHash` is SHA256 of JSON of the exact current pricing SKU returned by the official API; a mismatch fails closed. Plan review expires after 30 days. Configure only after verifying actual tier/billing terms in the provider account. The application does not infer tier cost from ambiguous SKU prose.
- `YOUCAM_USAGE_PATH`: persistent usage ledger path, default `.runtime/usage.json`. Contains dates/credits, no photos or keys. Failed/uncertain submissions conservatively keep the reservation to avoid overspend. Do not run multiple API processes against this ledger: multi-instance production requires an atomic budget service.
- `API_ALLOWED_ORIGINS`: exact comma-separated browser origins, default localhost/127.0.0.1 port 5173.
- `API_PORT`, `API_HOST`: defaults 3001 and 127.0.0.1. Public production operation requires HTTPS, reverse proxy, trusted forwarded-protocol configuration and hardened deployment settings; publication has not been performed.

## Upstream official contracts

Verified by fetching official docs on 2026-11-02. Base: `https://yce-api-01.makeupar.com`.

1. `POST /s2s/v2.0/file`, bearer auth, body `{files:[{content_type,file_name,file_size}]}`. Response `data.files[0].file_id`, `requests[0].{method,url,headers}`.
2. `PUT` raw image bytes to presigned HTTPS AWS upload URL. Auth header is **not** forwarded. Redirects and destination hosts outside the narrow documented YouCam S3 bucket family are rejected; arbitrary AWS customer buckets are not accepted.
3. `POST /s2s/v2.1/task/skin-analysis`, bearer auth, `{src_file_id,dst_actions,format:'json',miniserver_args:{enable_mask_overlay}}`. Returns `data.task_id`.
4. `GET /s2s/v2.1/task/skin-analysis/{task_id}`, bearer auth. `data.task_status`: running, success or error. `data.results.output` contains actual variable concern items/regions. Raw and adjusted UI score fields are separate. Unknown typed numeric concerns are retained; absent scores are absent. No local skin age or type is fabricated.
5. Pricing: `GET /s2s/v2.0/credit/feature-cost?page_size=20[&starting_token=...]`. Official skills describe `result.skus[]`, `next_token` and each SKU's `run_task_url`, `amount`, `unit`, `proc_unit`, description. Exact current response must be reviewed before a pricing plan can enable paid execution.

The dedicated current retention page documents uploaded/generated media and file/task IDs retained for **30 days**, with download URLs valid for **2 hours**. Older task text says 24 hours; True Beauty discloses the more conservative 30-day value and links the dedicated source. Its 15-minute RAM expiry does not override vendor retention. Provider-side deletion/cancellation is not implemented or claimed. Authenticated balance and pricing HTTP 200 were genuinely verified in Round06; genuine hair/template and cloth-v4 image-task success is recorded in `cook/evidence/r06-live-001/receipt.json`; skin ended in a terminal error with no result. Clothing full_body output changed more than the intended blouse, so corrected upper_body styling needs separate live verification. See [Round06 provider evidence](REMOTE_PROVIDERS_R06.md).

References:

- https://docs.perfectcorp.com/reference/ai_skin_analysis.md
- https://docs.perfectcorp.com/reference/ai_skin_analysis/v2.1.md
- https://github.com/YouCam-API/skills
- https://docs.perfectcorp.com/develop/file_retention_period.md

## Local engine contracts

`packages/skin-engine/src/index.ts`: validated swatch conversion, `analyzeSeason({skin,hair?,eye?})`, local `assessImageQuality`, `sampleAppearance(image,landmarks,hairMask?)`, `parseProviderSkinResult(unknown)` and `compareSkinResults`. Pixel metrics are descriptive. Rule confidence is not a calibrated clinical probability.

`packages/beauty-intelligence/src/index.ts`: `parseINCI`, `inspectIngredients`, `compareIngredients`, `compatibilityNotes`, Skyn-derived `encodeFeatures`/`cosineSimilarity`, `matchProducts(profile,catalog,options)` and MIROIR-derived `buildRoutine`. All recommendations identify catalogue/user inputs. Product ingredient presence is not proof of personal efficacy. Unknown prices do not become zero-cost items in a finite-budget routine.

## Verification status

The focused backend/CLI suite passes **34/34**: 6 existing API, 11 generation, 11 sanitized skin-error and 6 receipt-runner tests. Browser generation passes 8/8 desktop/mobile, with six explicitly labelled contract fixtures and two actual App local-preparation journeys; the corrected upper_body default additionally passes 2/2 targeted browser cases. Automated upstream tests are loopback fixtures and do not establish service completion or billing. Separate genuine first-batch receipts record successful hair and clothing outputs, a skin error, and no automatic retry. Actual billing and skin success remain unverified.

## Round06 generation contracts

`apps/api/src/generationContracts.ts` defines strict hair/clothing settings, images, quotes, upload permission, retention and per-call spending authorization. `registerGenerationRoutes` is mounted inside the root server's existing session/Origin/CSRF boundary and shares the skin credit ledger. Source/reference JPEG/PNG files are limited to 4MB each. Result delivery is a session-owned, fixed-host bounded proxy, never an arbitrary browser URL fetch.

| Route                                   | Result / requirement                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/generation/capabilities`      | Separate provider connection, paid switch, budget, exact reviewed-spec readiness, 15-minute local retention and 30-day provider retention. No upload or generation.                                                                         |
| `GET /api/generation/templates/hair`    | Actual provider template metadata; session required. No invented IDs.                                                                                                                                                                       |
| `POST /api/generation/quotes`           | `{spec}` exact reviewed settings, fresh current SKU hash, shared budget check. Session/Origin/CSRF; one-use five-minute quote. No image sent.                                                                                               |
| `POST /api/generation/tasks`            | Quote, exact spec, source/reference, maxCredits and explicit consent below. Reserves shared budget before actual upstream upload. Returns 202 local task. Quote replay returns its same task; deleted consumed quote cannot create another. |
| `GET /api/generation/tasks`             | Same-session transient jobs; resume an existing task without another paid request.                                                                                                                                                          |
| `GET /api/generation/tasks/:id`         | Same-session status, coalesced upstream polling at least 10s apart; successful typed AI-generated result only from real provider output.                                                                                                    |
| `GET /api/generation/tasks/:id/image`   | Same-session completed task; allowlisted HTTPS output, 8MB bound, MIME signature check, no-store response.                                                                                                                                  |
| `POST /api/generation/tasks/:id/cancel` | Aborts local processing and clears local media; provider may continue/charge. No refund or upstream cancellation promise.                                                                                                                   |
| `DELETE /api/generation/tasks/:id`      | Removes local transient task/result only; does not delete the provider's 30-day copy.                                                                                                                                                       |

```ts
type GenerationSpec =
  | { feature: "hair"; hairColor: "src" | "ref"; templateId?: string }
  | {
      feature: "clothing";
      garmentCategory:
        "full_body" | "lower_body" | "upper_body" | "shoes" | "auto" | "outer";
      changeShoes: boolean;
      filterMultiPerson: "normal" | "strict";
    };
type GenerationTask = {
  quoteId: string;
  spec: GenerationSpec;
  source: { base64: string; contentType: "image/jpeg" | "image/png" };
  reference?: { base64: string; contentType: "image/jpeg" | "image/png" };
  maxCredits: number;
  consent: {
    uploadImages: true;
    rightsConfirmed: true;
    externalProcessing: true;
    providerRetentionAcknowledged: true;
  };
};
```

A reference is required unless selecting a hairstyle template; template plus reference is rejected. Cloth-v4 requires a garment reference and does not reuse the old cloth/template schema. Hair transfer is `/s2s/v2.1/task/hair-transfer`; clothes are `/s2s/v2.0/task/cloth-v4`. `YOUCAM_GENERATION_PLANS_JSON` configures an array of exact `{spec,credits,skuHash,reviewedAt}` plans, expiring after 30 days. Current actual SKU hashes, configuration diagnostics, official references, retention discrepancy, known pilot limits and keyless verification command are documented in [REMOTE_PROVIDERS_R06.md](REMOTE_PROVIDERS_R06.md).

## Sanitized skin failures and single-feature receipts

Current official terminal errors use `data.error` (engine code) plus untrusted `data.error_message`. Only exact documented allowlisted codes survive through `skinProviderFailure.ts`; free-form provider text is discarded. `GET /api/skin/tasks/:id` may return `providerFailure:{code,known,summary,recovery,nextStep,automaticRetry:false}` alongside its safe display `error`. An unknown code becomes a static `unrecognized_provider_error`; no image defect or skin conclusion is inferred. Client code must never automatically resubmit a failed paid task.

The keyless receipt CLI supports `--skin-only` and `--clothing-only`, rejects unrelated input options, and saves a distinct receipt without repeating other successful engines. Clothing defaults to `upper_body`; `--garment-category` is validated against the exact current enum. Commands, first genuine batch semantics and status limitations are in [REMOTE_PROVIDERS_R06.md](REMOTE_PROVIDERS_R06.md).
