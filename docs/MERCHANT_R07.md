# Round 07 — native Worker merchant routes

Current deployment reconciliation: native public version5 and scoped genuine hosted verification are recorded in DEPLOYMENT.md and LIVE_PROVIDER_VERIFICATION_R07.md. Local fixture proofs below remain separate from those public results; earlier implementation-checkpoint limits are historical.


2026-11-02. This completes a native route implementation and bounded local runtime verification. It does not by itself establish public deployment, a current live merchant quote, merchant partnership, shipping availability or checkout.

## Mounted contract

`apps/edge/src/routes/merchant.ts` exports `handleMerchant(request, context): Promise<Response | null>`. The principal owns the Worker bootstrap/mount, registered anonymous sessions and IP-level limits. The route preserves the actual existing browser contract:

| Endpoint | Behavior |
| --- | --- |
| `GET /api/merchants/sources` | Fixed reviewed registry and policy, no outbound request or account requirement |
| `POST /api/merchants/refresh` | Strict `{sourceId, referenceId}` only; explicit user action; factual public observations or unavailable state |
| `POST /api/merchants/resolve` | Strict `{url}` resolves only an exact listed official HTTPS page to its existing source/reference IDs; it never fetches the supplied URL |

Free source actions need a live registered anonymous same-origin session and CSRF, with no paid/operator grant or login. The handler itself checks exact secure origin, live context session, CSRF and an atomic 12-action/session/minute limit. The bootstrap must authenticate/register the context and apply its independent IP/session-creation policy; the standalone fixture does not replace that integration verification.

The existing source IDs (`nuban`, `boj`, `ordinary`), four reference IDs, canonical URLs, currencies, product-size distinction and JSON-LD provenance fields are unchanged. No general user feed or arbitrary fetch path was added. Product prices, stock, merchant identity, source date and SKU continue to be parsed through the same `packages/commerce-engine/src/merchant.ts` implementation.

## Shared implementation and transport

`apps/api/src/merchantProvider.ts` now contains the transport-independent robots matching, streaming document cap, native fetch controls and reviewed-reference parsing. The Fastify wrapper imports it and re-exports `robotsAllows` for backwards compatibility. Its Node-only inherited-proxy bootstrap remains solely in `apps/api/src/merchant.ts`; the Worker does not import that module.

The Worker imports the pure merchant file directly, avoiding the commerce package barrel and its database graph. The actual workerd bundle dependency audit contains no Dexie, local-database module, Fastify transport or Node HTTP import.

Outbound requests are fixed public HTTPS GETs with credentials omitted, an identified user agent, manual redirect rejection, a 15-second deadline, supported text MIME checks, 100KB robots and 2.5MB streamed product caps. Rejected response bodies are cancelled. Robots is checked before fetching the product. JSON-LD is parsed, never executed. Missing currency/price/stock and unsupported offers cannot create fabricated facts. No images, profile, session cookie, budget, INCI, history, merchant credentials or paid provider calls enter this workflow.

## Durable cache and concurrency

Public state uses the common encrypted D1 store, owner `public-merchant-v1`, namespace `merchant-observation` with key `sourceId:referenceId`, and namespace `merchant-robots` with key `sourceId`.

- Successful observations and robots policies remain for at most 15 minutes from initial lease creation. Cache timestamps preserve the actual document fetch date; a cached reply is explicitly marked cached.
- Failed lookups and failed robots retrievals are cached as unavailable for one minute, without inferred prices or availability. A valid robots prohibition likewise produces unavailable product observations.
- A 45-second CAS lease covers each public key. Same-isolate requests coalesce; across isolates only one holder dispatches and a contender receives factual HTTP409 with `Retry-After: 3`. The existing UI exposes the recoverable error, without pretending a result was obtained.
- A known contention/failure releases only its own revision, permitting immediate retry after the competing policy check completes. A crashed isolate leaves a bounded expiring lease. Completion uses CAS and cannot overwrite a successor.
- Store revisions are opaque globally monotonic SQLite tokens. During review, expired-key revision reset was identified as an ABA risk: a suspended old lease could otherwise match a replacement revision. The store owner fixed that with SQLite AUTOINCREMENT epochs, including after expiry/deletion. Merchant code never assumes a numeric `+1` revision or resets it.
- No record can extend the common store's original 15-minute absolute retention. Actual local D1 evidence verifies encryption, hashed public owner, TTL and reuse by a separate isolate. These public records contain bounded policy text/facts rather than raw product HTML.

The Node Fastify route retains its previous local-memory cache behavior, one-hour robots cache and independent IP limit. The native shared policy is capped at 15 minutes to fit the common hosted retention contract. There is no silently shared personal browser database.

## Verification and exact evidence

`npx vitest run tests/merchant-edge.test.ts tests/merchant-api.test.ts packages/commerce-engine/src/merchant.test.ts`

**21 tests passed in 897ms.** Existing Fastify/parser cases still pass. New native fixtures cover secure Origin/live session/CSRF, public registry, strict shapes and SSRF rejection, exact URL resolve without fetch, independent-handler cache, cross-handler CAS, same-handler coalescing, shared-policy contention retry, robots failure caching, redirects/MIME/declared and streamed body caps/cancellation, unknown fields, unavailable retry and session rate limits. These are explicitly local fixtures, not genuine merchant observations.

`node apps/edge/experiments/run-merchant-native-probe.mjs /workspace/research/edge-r06-tooling`

**10 assertions passed** in actual local workerd/Miniflare, with two independent route isolates, the real `createHostedStore`, generated Drizzle migrations and actual local D1. A separate internal document Worker serves explicitly scripted fixture JSON-LD. Native service subrequests execute robots then the reviewed page; the second route isolate reuses the encrypted cache. Simultaneous new-reference calls yield one200/one409, not duplicate source dispatch. Advancing the controlled test clock expires the cache and updates provenance only on the next explicit action. The encrypted D1 rows contain authenticated ciphertext rather than the clear fixture offer and all expiry intervals are bounded.

Evidence: `apps/edge/evidence/merchant-native-workerd.json`. The probe recorded five internal scripted document requests, **zero external merchant requests, zero paid calls and zero personal images**. It is not public-hosting or full-bootstrap session-registration verification. The generated fixture bundle is in the isolated tooling directory and is not a production endpoint. The injection seam `createMerchantHandler({fetcher})` is used only by local tests; mounted `handleMerchant` uses native global fetch.

Round-06 genuine HTTP and browser receipts remain in `cook/evidence/merchant-r06/` and are described in `docs/MERCHANT_R06.md`. They prove those historical fetches through the Node API. They are not relabelled as fresh Worker-origin observations.

## Remaining verification

The principal owns full bootstrap/security integration, hosted build/deployment, public-origin browser session/CSRF and current real official-source fetch verification. Official origins may reject a cloud egress address or change robots/schema; the correct runtime result is unavailable with evidence. A native fixture response is never a live price receipt. Larger feeds, licensing/terms expansion, cross-merchant exact-equivalent price comparison, shipping, payment, stock reservation and checkout remain outside this bounded route.
