# Independent security/privacy review — round06

Review date: 2026-11-02. Scope: the optional local Fastify skin/generation/reasoning API, its provider transports, and the documented edge prototype boundary. **No demonstrated high or critical defect was found in the reviewed local owner-operator configuration. Public paid API readiness remains blocked.** This is a bounded review, not a production security certification or a full-product acceptance pass.

## Executed evidence

New independent regression suite: `tests/r06-security-review.test.ts`. It mounts the actual `createApi()` server and drives its real Fastify `inject()` routes. Provider responses, image bytes, prices and decisions are explicitly scripted fixtures; all adapters receive injected fixture transports. No credential files or process-environment values were inspected. No paid request, remote network request, private-image upload, deployment or Sites mutation occurred.

`npx vitest run tests/r06-security-review.test.ts`: **17/17 passed**, one file, final run 1.17s after Prettier formatting. `npx eslint tests/r06-security-review.test.ts`: passed. `npm run typecheck`: passed on the integrated checkout during this review. These checks do not establish a full-suite or hosted deployment pass.

The 17 cases demonstrate:

- Exact Origin enforcement, including missing, `null` and suffix-confused origins; CSRF required across real root-mounted mutation routes; cookie/CSRF binding and forged-cookie rejection.
- Generation/reasoning quote ownership, generation task/image ownership, denial of another session's cancellation/deletion, and an empty other-session task list.
- Ten concurrent generation-quote replays cause one dispatch/reservation; simultaneous skin/generation submissions share the last available credit reservation; eight reasoning session starts reserve once. These are **single-process** ordering tests, not distributed-ledger evidence.
- Reasoning payload/persistence/scope changes fail before reservation; parallel turns do not dispatch twice; cancellation aborts the provider signal and discards a late response while retaining the conservative spend reservation.
- Generation stop immediately zeroes held source/reference buffers; late creation cannot restore a cancelled task. Deletion during image download aborts the signal, zeroes late returned bytes and prevents task resurrection through a consumed quote. Expiry zeroes cached result bytes and stops result delivery. Responses use `no-store`.
- Result URLs cannot reach loopback, link-local metadata, lookalike hosts, unrelated AWS buckets, credential-bearing URLs or alternate ports. The real media transport disables redirects and sends no provider authentication to result hosts; the root result route refuses an unsafe scripted provider URL before an image fetch.
- The real generation adapter discards arbitrary provider error text. The native reasoning adapter returns static upstream errors and rejects exact configured-credential reflection. These tests use fake credential strings, never actual secrets.

No high/critical finding with a reproducible exploit remains from this scoped run. Existing independent Digital Twin/import/export privacy regressions are outside this new suite; their evidence must retain its own test count rather than being added to these 17 cases.

## Public paid API blocker

The last regression deliberately demonstrates the deployment boundary: an anonymous client can obtain `/api/session`, submit an enabled reviewed reasoning quote, reserve budget and dispatch a scripted turn without an operator identity. CSRF and task ownership correctly constrain that browser session; they do not determine who may spend the operator's funds. This behavior fits the current loopback owner-operator pilot, whose default host is `127.0.0.1` (`apps/api/src/server.ts`). Publishing the same paid routes would expose the configured budget to arbitrary visitors who create their own valid sessions. Do not describe same-origin cookies/CSRF as public spending authorization.

The current public Site remains the static R05 product. This review did not change or independently exercise its hosting. Its lack of a published paid backend is not evidence that the local paid API has been hardened for public access.

The existing credit/USD file ledgers use synchronous single-process reservation, and sessions, quote ownership, transcripts, in-flight state and idempotency live in Maps. The passing concurrency cases establish behavior within one API process only. They do not validate multiple Node processes, isolate restarts or cross-region reservation/ownership continuity. The local ledgers also implement daily windows; they cannot stand in for the edge proposal's persistent total US$5/100-credit ceiling or reconcile earlier real expenditure automatically.

`docs/EDGE_R06.md` accurately preserves these blockers. Source inspection confirms `apps/edge/src/paid-boundary.ts` declares `prototype: true` and `providerDispatch: false`; it has no integrated provider-dispatch path. The retained workerd evidence reports 21 assertions and zero stored private images. That existing artifact was inspected, not rerun or relabelled as this review's independent proof. Its asynchronous D1/voucher reservation is useful evidence for that isolated boundary, not a completed migration of the Fastify workflows. Trusted Sites identity-header behavior, durable provider workflow integration, earlier spend reconciliation and the final hosted route remain unverified and must be resolved before enabling public paid operations.

## Practical limits

Cancellation/deletion here stops local work and clears reachable application buffers/state. It does not establish provider-side cancellation, deletion or a refund; the tested notices state that limitation. Byte-array zeroing does not promise cryptographic erasure of JavaScript strings, HTTP allocations or copies already transmitted to a provider. Live provider billing, upstream retention enforcement, representative devices and broad prompt-injection/reasoning quality were not evaluated by these fixtures.

Verdict: **the tested local pilot boundaries pass this bounded adversarial review; public paid API activation remains blocked.**
