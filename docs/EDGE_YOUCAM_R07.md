# Native hosted YouCam boundary — Round07

Current deployment reconciliation: native public version5 and scoped genuine hosted verification are recorded in DEPLOYMENT.md and LIVE_PROVIDER_VERIFICATION_R07.md. Local fixture proofs below remain separate from those public results; earlier implementation-checkpoint limits are historical.


`apps/edge/src/routes/youcam.ts` implements native Fetch routes using the actual shared YouCam provider adapters. It does not depend on Fastify, filesystem state, process-local job maps or a synchronous ledger. Root Worker authentication/CSRF/operator verification and encrypted durable `HostedStore` are separate dependencies. This file alone does not assert a public deployment or live hosted task success.

## Shared implementation and client compatibility

The actual MIROIR-derived skin adapter moved into `apps/api/src/youcamSkinProvider.ts`. The Node pilot's `provider.ts` re-exports its previous class/constants and retains its Node hash helper. `youcamImage.ts` provides identical signature/4MB validation without Buffer; `contracts.ts` preserves the same imageBytes export. The generation adapter stays shared. Both adapters accept an optional asynchronous guard immediately before their paid task POST; native routes use it to recheck exact quote authorization, current pricing and cancellation after file upload. Legacy callers retain their previous behavior. Existing 28 skin/API/generation tests passed after extraction.

`handleYouCam(request,ctx)` returns Response or null for unrelated routes. Its optional third argument is an internal transport injection used by loopback contract tests; no request field or public environment variable selects an upstream URL. `youcamCapabilities(ctx)` asynchronously returns `skinAnalysis`, `hairGeneration`, `fashionGeneration`, `retention` and authorization fields for the root capabilities response.

Existing browser routes and request bodies are preserved:

- Skin quote/create/status/delete under `/api/skin`.
- Generation capabilities, actual hairstyle templates, quote/create/list/status/image/cancel/delete under `/api/generation`.
- Safe skin concern-mask proxy under `/api/skin/tasks/:id/masks/:observation/:mask` replaces upstream signed URLs in returned normalized skin results.
- Extra quote authorization metadata tells the client whether this exact quote has owner approval. Public sessions may request metadata quotes; they cannot spend operator keys without a valid exact-quote grant.

## Durable state machine and spending

1. Validate strict settings and current reviewed plan. Exact current provider SKU hash is WebCrypto SHA256 of `JSON.stringify(SKU)`, matching existing reviewed hashes; canonical quote terms use the shared hashValue helper.
2. Create a five-minute session-owned quote containing only settings, credits and pricing provenance.
3. Validate per-task upload/retention/credit consent, maximum credits, MIME signature and decoded 4MB limit; two-image JSON is bounded to 12MiB before JSON parsing.
4. Atomically consume the exact approved quote, reserve the shared skin/hair/clothing credits, and create encrypted task metadata. **Task ID equals quote ID**.
5. Claim `pending → dispatching` with compare-and-swap. Only the winner can submit. Check current plan/SKU, continuation authorization and task cancellation before uploads and again immediately before the paid task POST.
6. Await the real provider task creation within a 35-second dispatch deadline. Persist the actual upstream task ID before returning. Another isolate resumes status from encrypted storage rather than uploading or creating again.
7. Coalesce polling with a durable CAS token/lease, no sooner than 10 seconds. Preserve genuine normalized skin output, typed safe failure or a generated-image URL. Images are fetched only through the allowlisted proxy.

A crashed/expired dispatch lease becomes `uncertain`, maps to a truthful error state and keeps its conservative reservation. It is never automatically dispatched again. A task POST replay returns the existing task, including after isolate recreation. Deleted consumed quotes cannot produce another paid submission. An ambiguous external side effect cannot be made exactly once without provider idempotency: the architecture deliberately favors no automatic repeat and an operator review of the provider account.

## Privacy and retention

Source JPEG/PNG bytes and base64 stay in request memory and the explicitly authorized provider upload only. They are never written to D1 or R2. Decoded byte arrays are zeroed in finally; JavaScript strings/framework buffers remain subject to garbage collection, so no cryptographic-erasure claim is made. Generated image bytes are also delivered transiently rather than persisted in the task database.

`HostedStore` encrypts task settings/results, upstream IDs and signed URLs; the route never returns raw upstream IDs or signed media URLs. All records use the original 15-minute TTL. No new local profile identity is created: session ownership is an ephemeral hosted API capability, while personal records stay in browser Dexie.

Output and mask URLs must pass the shared narrow YouCam S3 HTTPS allowlist. Credentials go only to the fixed official API host, never the presigned media hosts. JSON/media are bounded; redirects are refused; result bytes are validated as PNG/JPEG/WebP. Query parameters cannot turn the image route into a generic proxy.

Cancellation/deletion clears local metadata, blocks a not-yet-started paid POST through the durable guard, and prevents late poll results restoring a cancelled scene. An already submitted remote task may continue, charge and retain media. No upstream cancellation, deletion or refund is promised. Dedicated current provider documentation says 30-day media/task retention and two-hour signed download links; the UI retains that conservative disclosure.

## Verification state

The new test suite uses a real loopback HTTP upstream and the production encrypted-store implementation over actual Node24 SQLite tables/triggers. It does not call a live provider or spend credits. Test coverage includes public quote versus approved spend, owner separation, encrypted records, cross-context resume, one dispatch under replay, revocation during upload, price changes, exact settings/consent/image limits, shared budget, crash uncertainty, dynamic skin parsing and masks, safe failure codes, output URL refusal, cancellation races, deletion and TTL.

Executed evidence: **13/13 native YouCam tests pass** against the actual encrypted store and production SQLite triggers. The combined native plus legacy skin/API/generation run passes **41/41**. The route/helpers pass targeted ESLint, and the browser-target esbuild bundle succeeds without Node built-ins (791.0KB unminified at the measured checkpoint). Cross-context resume explicitly works after the original five-minute quote expires; an in-flight image download cannot deliver bytes after cancellation. The initial near-ceiling fixture incorrectly attempted to reset the global budget; the store correctly refused. Its corrected setup uses direct fixture SQL to establish prior usage and preserves the production no-reset rule.

Current workspace typechecking has no errors in these provider modules; an unrelated reasoning-edge fixture was still adapting to new HostedStore methods at this checkpoint. Actual hosted Worker/live evidence belongs to the integrating engineer after root mounting. No deployment, genuine hosted success or comprehensive security validation is asserted from source compilation or loopback fixtures alone.
