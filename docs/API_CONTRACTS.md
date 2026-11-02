# API and provider contracts

Local browser functions work without the API. Start optional server with `npm run dev:api` (default `127.0.0.1:3001`); Vite should proxy `/api` to it. There is no user account or authentication registration. The ephemeral API session below is a browser CSRF/task-ownership capability, not a remote identity.

## Browser/server routes

| Route | Result / requirement |
|---|---|
| `GET /api/health` | Process health only. Does not assert live provider readiness. |
| `GET /api/capabilities` | Reports skin credentials, paid enable flag and reviewed pricing plan presence separately. `liveVerified:false` is explicit until real evidence is recorded. Missing remote hair/fashion/LLM providers report configured false. |
| `GET /api/session` | HttpOnly SameSite=Strict session cookie, 30-minute expiry, JSON `{csrfToken,expiresAt}`. No login. 100-session bound. |
| `POST /api/skin/quotes` | Requires allowed Origin, session cookie and `X-CSRF-Token`. Body `{actions:string[]}`. Only exact operator-reviewed action sets allowed. Re-fetches current official SKUs and checks approved hash; returns one-use 5-minute `{quoteId,credits,unit,actions,expiresAt,pricingProvenance}` or explicit unavailable error. This performs no image upload. |
| `POST /api/skin/tasks` | Schema below. Requires exact actions matching quote, same session, unexpired quote, explicit consent and authorized credits ≥ quote. Validates JPEG/PNG magic bytes and 4MB ceiling before spending. Conservative daily budget reserved before upstream call. Quote is idempotent, so replay returns same task. |
| `GET /api/skin/tasks/:id` | Same-session ownership; returns creating/running/success/error, normalized real observations on success and next poll ≥10s. Never creates a new provider task. Results stay in this process RAM for 15 minutes. |
| `DELETE /api/skin/tasks/:id` | Same-session CSRF-protected local task deletion. Explicitly does not claim upstream deletion. |

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
2. `PUT` raw image bytes to presigned HTTPS AWS upload URL. Auth header is **not** forwarded. Redirects and non-AWS destination hosts are rejected.
3. `POST /s2s/v2.1/task/skin-analysis`, bearer auth, `{src_file_id,dst_actions,format:'json',miniserver_args:{enable_mask_overlay}}`. Returns `data.task_id`.
4. `GET /s2s/v2.1/task/skin-analysis/{task_id}`, bearer auth. `data.task_status`: running, success or error. `data.results.output` contains actual variable concern items/regions. Raw and adjusted UI score fields are separate. Unknown typed numeric concerns are retained; absent scores are absent. No local skin age or type is fabricated.
5. Pricing: `GET /s2s/v2.0/credit/feature-cost?page_size=20[&starting_token=...]`. Official skills describe `result.skus[]`, `next_token` and each SKU's `run_task_url`, `amount`, `unit`, `proc_unit`, description. Exact current response must be reviewed before a pricing plan can enable paid execution.

Provider tasks are documented queryable for 24h, with result download URLs shorter-lived. True Beauty's 15-minute RAM expiry does not override vendor retention. Provider-side deletion is not implemented or claimed. No paid request or successful live provider integration has been verified in this environment.

References:

- https://docs.perfectcorp.com/reference/ai_skin_analysis.md
- https://docs.perfectcorp.com/reference/ai_skin_analysis/v2.1.md
- https://github.com/YouCam-API/skills

## Local engine contracts

`packages/skin-engine/src/index.ts`: validated swatch conversion, `analyzeSeason({skin,hair?,eye?})`, `analyzeAppearance`, local `assessImageQuality`, `sampleAppearance(image,landmarks,hairMask?)`, `parseProviderSkinResult(unknown)` and `compareSkinResults`. Pixel metrics are descriptive. Rule confidence is not a calibrated clinical probability.

`packages/beauty-intelligence/src/index.ts`: `parseINCI`, `inspectIngredients`, `compareIngredients`, `compatibilityNotes`, Skyn-derived `encodeFeatures`/`cosineSimilarity`, `matchProducts(profile,catalog,options)` and MIROIR-derived `buildRoutine`. All recommendations identify catalogue/user inputs. Product ingredient presence is not proof of personal efficacy. Unknown prices do not become zero-cost items in a finite-budget routine.

## Verification status

24 targeted unit/security/adapter tests pass at this integration stage. All upstream network behavior in automated tests uses explicit fixtures; this verifies handling and security boundaries, **not** actual provider service completion, billing correctness or clinical accuracy. Live provider work remains blocked on credentials and an authorized reviewed pricing plan.
