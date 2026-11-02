# R07 durable encrypted hosted state

`apps/edge/src/runtime/store.ts` implements the shared `HostedStore` contract for the native Worker backend. This replaces neither browser Dexie nor the local beauty profile: only explicitly authorized provider workflow state belongs here. No provider credential, real user record, paid request or Sites deployment was used in this module's verification.

## Factory and integration

```ts
const store = createHostedStore(env, now);
```

`env.DB` is the native D1 binding. `EDGE_DATA_SECRET` must be a separately generated server-only high-entropy secret of at least 32 bytes, provided through native runtime secret configuration. There is no browser key, hardcoded production key, key-return endpoint or key persisted in D1. The store hashes that secret to a 256-bit AES key, imports it nonextractably, and uses a fresh 96-bit IV and a 128-bit GCM tag for every write. It does not treat a user passphrase as a random server key.

Provider routes must await all store operations. They pass the server-derived session owner and operator authorization; those fields must never come from a model or request body. `approveQuote`, `revokeQuote` and `initializeBudget` are internal methods for independently authenticated operator routes, not public authorization mechanisms on their own.

The owner identifier is SHA-256 hashed with domain separation before SQL. Plaintext table fields are only opaque IDs, namespace, operation, costs, hashes, timestamps, approval metadata and CAS versions. Personal values are JSON-encrypted. Hashing is a data-minimization measure, not a claim that metadata is inherently anonymous. Callers must use opaque IDs and must not encode personal data into record IDs/namespaces.

The JSON boundary rejects binary buffers, Blob values, cyclic/nonplain objects, nonfinite primitives, credential fields and unsafe prototype keys. Records are bounded to 256 KB of serialized JSON. Native provider handlers must continue to keep uploaded image/base64 bytes request-local and must not pass them into a state value; the store is not an image-storage service.

## Record lifecycle and concurrency

- `get` and `list` reject expired or unrelated-owner records. Decrypted reads recheck the active row/version before returning, closing the suspended-decrypt/concurrent-delete case.
- `insert` rejects a live collision with 409. After expiry it may atomically reuse a key, with a fresh creation time, IV and version.
- `compareAndSwap` requires the exact owner, active row and returned version. It cannot revive an expired row or extend its absolute retention beyond original creation plus 15 minutes.
- Versions are **opaque globally monotonic numeric CAS tokens**, not consecutive per-record edit counts. A SQLite AUTOINCREMENT sequence survives deletion of its transient allocation rows. An old suspended lease cannot overwrite a replacement record after expiry or cleanup (the ABA case). Callers must use the returned version and never assume `revision === 1` or `revision + 1`.
- `delete` removes only the bound owner's row. `cleanup` deletes expired encrypted records/quotes and expired rate counters. Conservative spending totals and minimal reservation receipts are preserved.

AES-GCM associated data binds record identity, owner hash, version, creation and expiry. Quote associated data additionally binds operation, terms hash and both cost units. Moving ciphertext between records, changing authenticated metadata, using the wrong secret or changing the tag fails authentication. Key rotation makes earlier records unreadable unless a separately designed rotation strategy is implemented; no recovery or silent decryption fallback is claimed.

SQL DELETE removes ciphertext from active application tables. This is not a secure-erasure certificate for Cloudflare-managed backups or underlying storage; platform retention terms still apply.

## Budget reconciliation and initialization

Migrations contain **no seed rows**. `budget()` and first dispatch fail closed with 503 until the root operator reconciliation action calls:

```ts
await store.initializeBudget({
  creditsUsed: 51,
  creditsLimit: 100,
  usdMicroUsed: 111000,
  usdMicroLimit: 5000000,
}, verifiedOperatorId);
```

An equivalent exported `initializeBudget(env, values, verifiedOperatorId, now)` helper exists. These are the required carry-forward conservative reservations from the prior live pilot, not an assertion that 51 credits/US$0.111 were invoiced. Reconciliation may specify higher known prior usage within the same ceilings. SQL CHECK constraints prohibit a baseline below 51 credits or 111000 micro-USD, usage above limits, or limits above 100 credits / US$5.

Initialization is one-time/idempotent only when the existing row is identical. A different existing row returns 409; it never resets or decreases spending. There is no date-based rollover or automatic zero initialization. Preserve the logical D1 binding and budget ID across deployments. If a database is replaced or lost, reconcile **all** earlier hosted spending as well as the pilot; merely inserting the old minimum into a new database would not reconstruct later spend.

## Exact quote authorization and atomic consumption

Anonymous clients may create bounded quote metadata, but that does not authorize a provider call. `quoteAccess` requires the exact owner's quote to be active and unrevoked plus either a current server-verified operator or an active exact-quote approval. `listPendingQuotes()` returns at most 50 unconsumed/unexpired, unapproved/unrevoked summaries containing only ID, operation, amounts and expiry. It never decrypts or exposes a user's request to the operator list.

`consumeQuoteAndCreate` verifies the immutable quote/owner/operation/terms hash and authenticated encrypted quote metadata. It then inserts the encrypted task record and financial reservation in **one D1 batch transaction**. A schema trigger on the reservation:

1. Checks exact owner, operation, terms hash, amounts, quote freshness and nonconsumption.
2. Checks current operator authorization or the current exact grant, and checks revocation again inside SQL.
3. Checks the inserted record's owner, ID, namespace and active expiry.
4. Requires an already initialized global budget row.
5. Atomically increments both credit and micro-USD usage only within their limits.
6. Marks the quote consumed and records the exact task-scoped authorization until its original record TTL.

Any failure rolls back the record, reservation, quote change and budget update. Concurrent calls using the same quote and target record recover one stable receipt and one actual record; no second charge or dispatch right is created. A different target ID/namespace, owner, operation or terms hash is rejected. Reservation receipt IDs are deterministic quote IDs; `StoredQuote.consumedBy` is the target record ID. No automatic refunds are issued after an uncertain provider outcome.

Initial operator start creates an exact task-scoped grant for that owner. `assertContinuation` requires the original reservation, active record and current unrevoked grant. It does not re-charge or require remaining unreserved budget, so a fully reserved task may poll/complete its authorized reasoning turns. The original short quote expiry does not terminate an already authorized 15-minute task. Revocation blocks continuation even when the caller is currently an operator; only a new explicit operator reapproval restores it within the remaining record lifetime.

`getQuote` itself rejects original quote expiry. Provider status routes should use `assertContinuation` plus `get(taskNamespace, taskId, owner)` instead of depending on the short-lived quote value. Deleting the task record or reaching its absolute TTL blocks continuation. Generic record reads alone do not prove provider authorization; route handlers must perform the continuation check at every relevant dispatch/status boundary.

## Migrations and metadata

The production schema is separate from the frozen R06 prototype:

- `drizzle/schema.ts`, `drizzle.config.ts`
- `drizzle/0000_dashing_sentry.sql`: five base tables, indexes/checks, and the custom atomic-consumption SQLite trigger appended before any hosted application.
- `drizzle/0001_hesitant_dagger.sql`: schema-only CAS epoch table with AUTOINCREMENT.
- Generated `drizzle/meta/_journal.json`, `0000_snapshot.json`, `0001_snapshot.json`.

Generated with Drizzle Kit 0.31.10 / ORM 0.45.2 from isolated tooling. The custom trigger is schema DDL; Drizzle snapshots describe tables/indexes/checks and do not represent the trigger body. There is no runtime schema creation. Apply migrations in journal order through the Sites build workflow. Once hosted, these files are immutable; later changes require new migrations.

Generation used:

```sh
NODE_PATH=/workspace/research/edge-r06-tooling/node_modules \
node /workspace/research/edge-r06-tooling/node_modules/drizzle-kit/bin.cjs \
  generate --config /workspace/True-Beauty/drizzle.config.ts
```

## Executed evidence

`tests/helpers/edge-d1.ts` supplies real Node 24 SQLite statements, triggers and transactional batches; it does not mock the store's authorization or crypto logic. `tests/edge-store.test.ts` passes 13 cases covering encryption/owner isolation, IV/authentication failure, TTL, concurrent-delete reads, CAS and ABA, no seed/reset, exact quote authorization, concurrent starts, rollback on quota/collision, final-transaction revocation, fully reserved continuation and rate limits.

`apps/edge/experiments/run-hosted-store-probe.mjs` executes the actual production store and migrations in workerd with **two distinct Worker services and one shared D1 database**. Evidence `apps/edge/evidence/hosted-store-r07.json` records 18 passing assertions: 16 simultaneous starts create/reserve once; independent credit/USD races honor ceilings; encrypted values can be decrypted only by the bound owner on the other service; CAS ABA is prevented; revocation/quote expiry/TTL/rate counters behave as specified; cleanup removes expired ciphertext and never resets spend. Its final 85-credit / 3111000-microUSD ledger is entirely synthetic fixture accounting, not actual spending. No provider calls or real user data were used.

Reproduce:

```sh
npx vitest run tests/edge-store.test.ts
node apps/edge/experiments/run-hosted-store-probe.mjs /workspace/research/edge-r06-tooling
```

The experiment method-dispatch Worker is local-test-only and must never be packaged as the application entrypoint. The authenticated native Worker routes, Sites build, hosted D1 migration, actual owner/operator trust boundary and live provider journeys remain separate integration/publication gates owned by the root task. A local workerd proof is not a hosted release claim or a full security certification.
