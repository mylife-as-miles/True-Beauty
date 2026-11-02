# Sites / Cloudflare edge research and prototype — frozen round06

This is an executable **prototype and compatibility investigation**, not a published backend. The public R05 Site remains unchanged. No Sites native mutation, deployment, provider request, real credential access, user image upload or production D1 migration was performed by this task.

## Result

Cloudflare's native Node HTTP bridge works in actual workerd. The current application Fastify dependency does **not** run unchanged: both `Fastify.inject()` and `Fastify.listen()` through the Node HTTP bridge fail during route registration because `find-my-way` calls `new Function` from `compilePrefixMatch`, which the Worker runtime rejects. A transparent shim is therefore not a verified migration path.

A Fetch-native paid-operation boundary was implemented separately under `apps/edge/src`. Its D1 trigger atomically validates/consumes an owner-issued voucher and reserves both spending units under one statement. Actual workerd tests with two Worker services sharing one D1 database passed **21 assertions**, including concurrent reservations, idempotency, ownership and consent. It intentionally cannot call a provider. The proof does not make the existing reasoning, skin or generation handlers durable or hosted.

## Sources reviewed

- [Cloudflare Node HTTP API](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), fetched successfully 2026-11-02: `httpServerHandler` / `handleAsNodeRequest` in `cloudflare:node`; HTTP server support enabled with `nodejs_compat` and compatibility date >=2025-09-01. Current docs state Node compatibility becomes default on dates >=2026-08-04. Native Node sockets and connection APIs still differ from an ordinary Node process.
- [Cloudflare Node compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/): supported APIs versus stubs are explicit; importing a module is not proof every method works.
- [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/) and [SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/): prepared statements, atomic SQL, D1 bindings and migration boundaries.
- Sites [storage skill reference](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/references/storage.md): logical D1/R2 bindings in the hosting manifest; schema-owned migrations must be applied through the hosting workflow, never from request handlers.
- Sites [identity/secrets reference](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/references/identity-and-secrets.md): public Sites can have anonymous visitors; signed-in visitors receive dispatch-owned identity headers. Identity and same-origin sessions are separate from authorization. A public write endpoint needs authorization.
- Sites [Worker ESM starter](skill://plugin_connector_1p_689987207de08191979cf68eca2941c6/sites/templates/worker-esm-starter/README.md) and Vinext starter README were read. The minimal ESM starter copies only its Worker entry and hosting manifest; it is not a drop-in Vite asset migration. The maintained Vinext/Sites build integration and asset packaging must be preserved when preparing a real hosted artifact.

No restricted reference assets or third-party model weights were reused. Fastify was imported as an actual installed dependency for the compatibility experiment, not copied into authored source.

## Actual compatibility evidence

`apps/edge/evidence/fastify-workerd.json` records the current run:

| Probe | Actual local workerd result |
| --- | --- |
| Native `node:http` + `httpServerHandler` | GET/POST 200; ~594-byte bundled fixture; cold ~222ms and warm median ~6.15ms in the recorded run |
| Current Fastify `inject()` | GET/POST 500; `EvalError` at `find-my-way.compilePrefixMatch` |
| Current Fastify `listen()` + `handleAsNodeRequest` | GET/POST 500 at the same router compilation |

Runtime: Wrangler 4.156.1, Miniflare 5.20261101.0-beta, compatibility date 2026-11-01, actual root Fastify 5.12.7 / find-my-way 9.10.0. The earlier isolated tooling install also contains Fastify 5.6.2, but esbuild resolves the application's actual root version; the evidence records that distinction.

The successful fixture uses a real workerd Node HTTP bridge. The measurements are loaded local-process observations, not production edge latency or hardware benchmarks. Error responses have no reported warm-performance score. The ~2.05MB Fastify bundles were only test artifacts outside the application checkout.

Initial experiments exposed ordinary ESM/CJS bundling issues (`require`, then unavailable `import.meta.url`); an explicit builtin `createRequire('/index.mjs')` shim allowed the actual runtime failure to be isolated. An early partially initialized inject path also produced a `ServerResponse` class-constructor error; that follow-on error was not independently isolated from the primary route-registration failure. No unsafe-eval capability was enabled to conceal incompatibility.

## Why the existing full API is not deployable through an adapter

Even a patched Fastify router would leave these material blockers:

1. Existing file ledgers are synchronous Node filesystem state. Worker filesystem state is not a cross-isolate durable spending ledger.
2. D1 is asynchronous. **Do not cast an asynchronous D1 reservation into the existing synchronous `BudgetLedger.reserve()` interfaces.** Every dispatch site must explicitly await a durable reservation before any provider request.
3. Current sessions, quotes, task ownership, reasoning transcripts and in-flight deduplication use process-local Maps. Different edge isolates will not share them; request routing cannot be assumed sticky.
4. Existing same-origin session + CSRF checks protect browser mutation but do not authorize spending on a public Site. Any anonymous visitor can create their own valid session.
5. Worker runtime bindings must be passed explicitly to pure provider/configuration logic. Server environment/process bootstrap and root local credential injection are not a hosted secret implementation.
6. The actual Sites build/asset/migration artifact and platform identity-header boundary still need hosted verification. Node compatibility alone proves none of these properties.

Recommended migration: extract typed provider workflows, parsers and cost-plan validation into Fetch-compatible application services; retain Fastify as a local adapter if useful; implement a native Worker router with asynchronous D1 stores. Reuse current provider contracts and genuine workflow behavior rather than creating a second pretend API. A maintained edge-native router is also reasonable if its exact runtime is tested.

## Paid boundary prototype

Files:

- `apps/edge/src/paid-boundary.ts`: native Fetch handler, signed ephemeral session, CSRF, operator gate, voucher issuance, atomic reservation and receipt ownership.
- `apps/edge/migrations/0001_paid_boundary.sql`: schema-only D1 tables and a single-statement trigger. This has only been applied to an isolated local test database. It is not yet a Sites migration with Drizzle snapshots/journal metadata.
- `apps/edge/src/index.ts`: prototype-only Worker entry.
- `apps/edge/experiments/run-paid-boundary-probe.mjs`: actual multi-service workerd/D1 proof.

The default global budget is **US$5 total plus 100 provider credits, with no automatic reset**, shared across all sessions and isolates using one D1 binding/budget identifier. The test ledger's values are synthetic reservations, not money or provider credits actually spent. Production activation must first reconcile genuine local provider expenditure into the correct global ledger; resetting deployment or issuing another voucher must not recreate the budget.

Public visitors can obtain a stateless HMAC-signed HttpOnly/Secure/SameSite session; that alone has no paid capability. The public core remains anonymous/local-first. Operator voucher issuance additionally requires:

- exact canonical HTTPS request URL and same-origin mutation;
- valid signed session and CSRF capability;
- the configured Site operator's dispatch-owned ChatGPT identity;
- an explicit `SITES_IDENTITY_TRUSTED=true` configuration after verifying the platform's trusted-header boundary.

The prototype defaults fail closed without that trust flag, operator identity, canonical origin or a server-held session signing secret. The signing secret must be independently generated and kept in a Sites runtime secret. No production value exists in source or test artifacts.

The opaque one-use voucher is bound to the exact quote hash, operation, ephemeral session, USD/credit amounts and five-minute expiry. Only its hash is stored. It is a transient runtime capability; never place it in URLs, public source, IndexedDB, localStorage or logs. Operator-controlled delegation can target an existing anonymous session without requiring an account for local functionality.

A single D1 insert trigger validates the voucher, checks both global ceilings, increments the budget and marks the voucher consumed. Trigger abort rolls back the entire statement. Duplicate reservation IDs recover the same receipt only when all immutable fields match. Concurrent reuse under another ID cannot consume the voucher or budget again. No automatic refund is provided for uncertain provider outcomes.

Reasoning reservations require explicit text-transmission, cost and provider-retention acknowledgement. Image-provider reservations require explicit upload, cost and provider-retention consent. These are metadata guards; **a reservation is not a provider request, an analysis result, or a proof of pricing validation**. Real handler integration must independently revalidate a current official provider quote and bind its amount/actions/hash before consuming authorization.

No prompt, raw image, face landmarks, embeddings, profile, transcript or provider credential is stored by this boundary. D1 stores only voucher/reservation hashes, units, operation, ephemeral ownership hashes and timestamps. R2 is not needed for this metadata proof and is not declared or used.

## Workerd/D1 proof

`apps/edge/evidence/paid-boundary-workerd.json` records **21 passing assertions**, seven unique synthetic reservations, zero provider calls and zero private images:

- anonymous visitor cannot issue vouchers or spend with an arbitrary voucher;
- claimed owner header fails closed without trusted-dispatch configuration;
- actual boundary rejects mismatched Origin, noncanonical URL, invalid CSRF and forged cookie;
- quote hash, amount, ownership and expiry are enforced;
- 12 concurrent identical reservations across two Worker services consume once;
- independent races cannot exceed US$5 or 100 credits;
- missing per-request image consent is rejected before consumption;
- receipts remain readable on the other Worker service only by the bound session;
- failed and duplicate transactions leave no extra reservation artifacts.

Miniflare's own `/cdn-cgi` transport rejects nonlocal Origin headers before user code. The probe therefore uses HTTPS `localhost` / `127.0.0.1` aliases and asserts the application's exact JSON errors for Origin/URL mismatch. This is a local multi-service runtime proof, not verification of hosted Sites dispatch authentication, multi-region latency or a production D1 deployment. The first migration attempt incorrectly used newline-oriented `D1.exec`; the driver now applies each schema-owned statement with one `prepare()` and uses explicit statement breakpoints so the trigger body remains one compound SQL statement.

## Reproduce without deployment or secrets

Install tooling in an isolated directory, outside the root workspace dependency graph:

```sh
npm install --prefix /workspace/research/edge-r06-tooling --no-audit --no-fund wrangler@4.156.1
node apps/edge/experiments/run-fastify-probe.mjs /workspace/research/edge-r06-tooling
node apps/edge/experiments/run-paid-boundary-probe.mjs /workspace/research/edge-r06-tooling
```

Wrangler supplies the matching Miniflare/esbuild tooling. Root application dependencies must already be installed. These commands run local fixtures only and never call a publish/deploy command. D1 schema application happens only in the isolated test driver, not in the request handler.

## Production gates still open

- Verify Sites dispatch strips/replaces caller-supplied identity headers, the correct Site-scoped operator ID, and that direct Worker aliases cannot bypass dispatch; do not enable the trust flag merely to force a test to pass.
- Integrate durable asynchronous sessions, quote ownership, task state/idempotency, cancellation and actual provider handlers. Private reasoning state needs genuine encryption/key management and bounded retention if persisted; do not place plaintext personal history in D1 just to obtain cross-isolate continuity.
- Reconcile earlier actual spending and preserve a single operator budget across all public requests/isolates.
- Integrate schema/migration metadata and assets through the supported Sites build, preserving the public audience and local no-login experience.
- Independently test genuine provider operations through the hosted origin with explicit consent/cost approval, unknown-user denial, retries, isolate restart, expiry, deletion and spending-race cases.
- Confirm resource ceilings, abuse/rate protection, dependency and deployment security; 21 fixture assertions do not establish production readiness.

**Freeze:** leave public paid endpoints disabled. Root owns any proper migration and publication; this prototype is not to be deployed as a partial backend.

## Small associated handoff correction

The previously optional `openRemix` agent callback is now connected to the actual `remix` space in both AgentPanel contexts, and the local planner understands “Open Remix.” An actual browser run verified successful tool feedback followed by the real “A mood. Made yours.” screen after closing the agent. No model call, photo upload or paid request was involved.
