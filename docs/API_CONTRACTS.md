# API and provider contracts

Local browser functions work without the API or an account. `npm run dev:api` starts the optional Fastify pilot (default `127.0.0.1:3001`); Vite proxies `/api` to it. R07 also provides native Fetch Worker equivalents under the same browser paths, with encrypted D1 temporary state and durable accounting. Anonymous API sessions establish CSRF/task ownership, without creating remote beauty profiles. The tables/configuration below first describe the compatible Node pilot; the final R07 section identifies native differences. The full Worker/SPA is publicly deployed as native version5; scoped genuine hosted operation evidence and limits are in LIVE_PROVIDER_VERIFICATION_R07.

## Node pilot browser/server routes

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

The dedicated current retention page documents uploaded/generated media and file/task IDs retained for **30 days**, with download URLs valid for **2 hours**. Older task text says 24 hours; True Beauty discloses the more conservative 30-day value and links the dedicated source. Neither the Node pilot's 15-minute RAM expiry nor the native Worker's 15-minute task access limit overrides vendor retention. Provider-side deletion/cancellation is not implemented or claimed. Authenticated balance and pricing HTTP 200 were genuinely verified in Round06; genuine hair/template and cloth-v4 image-task success is recorded in `cook/evidence/r06-live-001/receipt.json`; the initial skin task failed and initial full_body blouse output changed too much. Subsequent isolated framed-skin and upper_body runs succeeded; actual skin history save/reload/delete also passed. Complete real evidence is in LIVE_PROVIDER_VERIFICATION_R06.md. See [Round06 provider evidence](REMOTE_PROVIDERS_R06.md).

References:

- https://docs.perfectcorp.com/reference/ai_skin_analysis.md
- https://docs.perfectcorp.com/reference/ai_skin_analysis/v2.1.md
- https://github.com/YouCam-API/skills
- https://docs.perfectcorp.com/develop/file_retention_period.md

## Local engine contracts

`packages/skin-engine/src/index.ts`: validated swatch conversion, `analyzeSeason({skin,hair?,eye?})`, local `assessImageQuality`, `sampleAppearance(image,landmarks,hairMask?)`, `parseProviderSkinResult(unknown)` and `compareSkinResults`. Pixel metrics are descriptive. Rule confidence is not a calibrated clinical probability.

`packages/beauty-intelligence/src/index.ts`: `parseINCI`, `inspectIngredients`, `compareIngredients`, `compatibilityNotes`, Skyn-derived `encodeFeatures`/`cosineSimilarity`, `matchProducts(profile,catalog,options)` and MIROIR-derived `buildRoutine`. All recommendations identify catalogue/user inputs. Product ingredient presence is not proof of personal efficacy. Unknown prices do not become zero-cost items in a finite-budget routine.

## Verification status

The focused backend/CLI suite passes **34/34**: 6 existing API, 11 generation, 11 sanitized skin-error and 6 receipt-runner tests. Browser generation passes 8/8 desktop/mobile, with six explicitly labelled contract fixtures and two actual App local-preparation journeys; the corrected upper_body default additionally passes 2/2 targeted browser cases. Automated upstream tests are loopback fixtures and do not establish service completion or billing. Separate genuine first-batch receipts record successful hair and clothing outputs, a skin error, and no automatic retry. Subsequent framed skin and corrected upper_body execution succeeded, including actual skin browser save/reload/delete; see LIVE_PROVIDER_VERIFICATION_R06.md. Per-task billing and scientific validity remain unverified.

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

## Native hosted continuation (Round07)

The Node pilot above remains compatible. Native Fetch equivalents in `apps/edge/src/routes/youcam.ts` share the actual provider adapters, use encrypted durable HostedStore/CAS tasks and asynchronous atomic credits, require operator or exact-quote approval, and persist upstream task IDs for another isolate to resume. They never persist source images/base64 in D1/R2. See [EDGE_YOUCAM_R07.md](EDGE_YOUCAM_R07.md) for complete state transitions, native fixture evidence and current deployment limits. Root Worker owns same-origin/CSRF/operator verification; a route-unit context does not establish that boundary by itself.

### Runtime, ownership and configuration

`apps/edge/src/worker.ts` is the native application entry. It serves the built SPA through `ASSETS` and composes native YouCam, reasoning and merchant handlers for `/api/*`; it does not register Fastify in workerd. Pure `youcamSkinProvider.ts`, `youcamImage.ts`, `generationProvider.ts`, `youcamTransport.ts`, `reasoningProvider.ts` and `merchantProvider.ts` retain actual shared implementations. Node compatibility exports remain available.

The Worker uses the exact configured HTTPS `SITE_ORIGIN`. `GET /api/session` returns `{csrfToken,expiresAt,hosted:true,operator}` and a signed `__Host-tb_cloud` cookie with Secure, HttpOnly, SameSite=Strict and one-hour expiry. First-visit read-only capability/source discovery may establish this anonymous cookie too. All mutations require its valid owner capability, exact Origin and matching `X-CSRF-Token`. Cookie renewal changes temporary ownership; it is not cross-device identity or a way to recover another session's tasks. Independent IP/session rate limits apply.

Native runtime configuration uses `DB`, `EDGE_SESSION_SECRET` and a separate `EDGE_DATA_SECRET`, supplied through server-only secret bindings; `SITE_ORIGIN` and a stable `EDGE_BUDGET_ID` identify the deployment boundary. Provider credentials, reviewed YouCam plans and reasoning model/rate ceilings remain server-side. `EDGE_OPERATOR_TOKEN` is a server tooling credential; platform operator identity is accepted only with an explicitly trusted dispatch identity and configured operator ID. No request JSON field, ordinary anonymous cookie, model output or browser-visible key grants operator status. Runtime revision5 has platform identity trust enabled only after actual public spoof probes before/after activation stripped both claimed identity headers. Exact normalized owner email with a nonempty trusted ID is an optional server allowlist fallback. Independent public metadata probes confirm anonymous budget denial; actual owner browser mapping remains unverified. See LIVE_PROVIDER_VERIFICATION_R07 for genuine operations and limitations.

### Hosted access and sponsored cost routes

| Route | Native requirement / result |
| --- | --- |
| `GET /api/health` | Native service health/version only; no provider success assertion |
| `GET /api/operator/status` | Current hosted operator/trusted-dispatch status; no secret or user record |
| `GET /api/access/quotes/:id` | Same-owner exact quote authorization state; no paid call |
| `POST /api/access/requests/:id` | Same-owner active quote check/request state; does not approve spending or send a provider request |
| `GET /api/operator/approvals` | Verified operator only; bounded pending ID/operation/cost/expiry summaries, without decrypting another user's prompt or image |
| `POST /api/operator/approvals/:id/approve` or `/revoke` | Verified operator plus same-origin/CSRF; changes only the exact quote/task authorization |
| `GET` / `POST /api/operator/budget` | Verified operator only; reads or performs one-time cumulative reconciliation, never resets/decreases an existing budget |

Anonymous users may request bounded quote metadata, but dispatch additionally requires explicit upload/text/retention/cost consent and current operator or exact-quote approval. Paid task/session creation atomically consumes that quote, creates the encrypted record and reserves both credit and integer micro-USD units. A database trigger rechecks owner, terms, approval/revocation and remaining shared budget in the same transaction. Conservative reservations remain after uncertain failures or deletion; no automatic refund is claimed.

Migrations contain no spending seed. Operator reconciliation must carry at least the existing conservative 51-credit and 111000-microUSD reservations within the 100-credit/US$5 global ceilings. These amounts are prior authorized reservations, not verified invoices. There is no automatic daily rollover, zero reset or budget restoration by deleting task content/restarting a Worker. Stable database/budget identity must survive deployment. See [HOSTED_STORE_R07.md](HOSTED_STORE_R07.md).

### Native task and reasoning behavior

Skin/generation paths and strict body shapes above are preserved. Native task ID equals quote ID. CAS admits one dispatch winner, persists the actual upstream task ID and lets another isolate resume polling after the short quote expires within the original task lifetime. Replayed creation recovers that task/reservation. Ambiguous dispatch is labelled `uncertain` and never automatically resubmitted. Cancellation/deletion blocks later local delivery and unstarted paid submission; it cannot cancel an already submitted provider job or delete the provider copy. `GET /api/skin/tasks/:id/masks/:observation/:mask` is an owner-checked bounded media proxy; raw signed upstream URLs are not returned.

| Reasoning route | Contract |
| --- | --- |
| `GET /api/reasoning/capabilities` | Configured adapter/model, bounded readiness and retention; no inference |
| `POST /api/reasoning/quotes` | Exact approved text/context hash, selected tools/scopes, persistence choice and step/token ceilings; no prompt sent to a model |
| `POST /api/reasoning/sessions` | Exact quoted payload, explicit transmission/retention/USD consent and quote approval; one atomic reservation/encrypted session |
| `POST /api/reasoning/sessions/:id/step` | Same-owner approved continuation; stable step ID and actual tool feedback, validated tool schemas and bounded steps; CAS prevents concurrent model dispatch |
| `DELETE /api/reasoning/sessions/:id` | Removes this API's temporary conversation state; provider billing/retention and accounting receipts remain separate |

Reasoning accepts no images. The browser reviews the exact selected context; local memory is not implicitly synchronized. Full transcript content is cleared on completion/cancellation, while bounded encrypted step responses remain accessible until cancellation or the original 15-minute access expiry for retry safety. A failed/uncertain tool or provider call cannot become a fabricated completed action. Store access expires on time; physical pruning occurs on later activity, not a guaranteed wall-clock erasure job. Native image bodies stay request-local; D1 stores metadata/results/approved text, never image/base64 bytes or API secrets. Platform backup and external provider retention terms remain separate.

### Native public merchant routes

`GET /api/merchants/sources`, `POST /api/merchants/refresh` (`{sourceId,referenceId}`) and `POST /api/merchants/resolve` (`{url}`) preserve existing IDs and browser contracts. Resolve validates the exact fixed official URL without fetching it. Free refreshes require same-origin session/CSRF and their own 12-action/session/minute limit, with no paid/operator grant. Robots-first GETs, redirect/MIME/stream limits and explicit JSON-LD currency/SKU/stock provenance are shared with the Node adapter. The shared encrypted public cache lasts up to 15 minutes, failures one minute; cross-isolate lease contention returns 409 with `Retry-After: 3`. These are factual observations or unavailable states, never orders, merchant partnerships or checkout promises. See [MERCHANT_R07.md](MERCHANT_R07.md).

### R07 verification boundary

Native local evidence includes 18 actual two-isolate workerd/D1 store assertions, 10 actual workerd/D1/internal-scripted-merchant assertions, six actual workerd scripted reasoning-protocol assertions, native YouCam loopback/real-SQLite tests and the principal's successful full Worker/SPA build. These probes use no new paid provider calls or personal images. The R06 genuine provider/merchant receipts remain historical local-path evidence. Deployment, full public-origin session/operator security, fresh genuine hosted sources/provider tasks, actual billing and comprehensive security validation remain unverified at this checkpoint.
