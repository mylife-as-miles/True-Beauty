# Independent technical review — round 06

Date: 2026-11-02. Scope: the new digital-twin domain, actual Dexie v2→v3 bag migration, portable backup identity/freshness boundaries, consent transactions, graph deletion and image-free twin export. This reviewer wrote tests only; implementation fixes were made by the root/domain owners. No provider calls, merchant requests, credentials or private photographs were used.

## Checkpoint judgment

The independent tests exposed real export-projection, price-freshness and concurrent-read defects. Their fixes now pass the independent reproductions. The final targeted result is **20/20 tests passed in 2 files**. No reproduced high/critical defect remains open in these tested paths. This is contract-level development evidence, not a product completion or ≥9 quality claim.

## Findings and reproductions

### R06-T1 — Portable twin export included imported images and arbitrary record fields

The initial implementation exported saved `look`, `ownedProducts` and `profile` objects directly. A valid portable backup could carry an unrecognized `portraitDataUrl` field inside a complete look or owned-product record; after `importLocalData`, `exportDigitalTwin` copied the image URI into its output despite the explicit “No photograph, face geometry…” notice.

The independent regressions use a generated one-pixel PNG data URI, never a person's photograph. Additional tests cover an unknown profile image/face-geometry field and malformed nested look fields: invalid color/finish/opacity, null layer, nested hair image and nonboolean accessory state.

**Verified fix:** export projects known profile/owned-product fields, normalizes structured look controls, and excludes image references from text serialization. The imported unknown fields and nested image payloads no longer appear in the twin export. Valid ordinary text and valid look colors remain available. Malformed known profile fields are rejected before any unrelated backup row is written.

### R06-T2 — Key whitelisting alone still allowed image objects in outfit scalar fields

An extension of the first finding survived the first fix: imported `outfit.name={image:…}` and `outfit.color={rawFrame:…}` were copied under otherwise allowed keys. A generic record's TypeScript shape did not validate those runtime values.

**Verified fix:** name, color and technology now receive typed scalar projection/fallbacks. Optional owned-product `note` and `openedAt` fields likewise exclude object-shaped payloads. All corresponding export regressions pass. This is a distinct bypass of the first projection attempt, not a separate claimed exploit of the camera pipeline.

### R06-T3 — Imported/future generic price snapshots were described as fresh verified quotes

`importLocalData` correctly set `imported:true`, but `getPriceState` ignored that marker and returned `fresh:true`, `verified:true`, label `Merchant quote` for a just-imported verified-kind record. A timestamp two days in the future was also clamped to age zero and treated as fresh.

The existing Merchant Sources UI already had a wrapper-level import guard; the reproduced defect was in the exported generic price-state helper. No live quote or stock was checked.

**Verified fix:** imported records require refresh and are not fresh/verified; invalid/far-future observation dates cannot be fresh. The independent tests cover the actual database import path and a deterministic future-date case. Bag imports also downgrade `priceKind:'verified'` to `priceKind:'imported'` while preserving source and variant identity.

### R06-T4 — Concurrent deletion can return an invalid successful twin snapshot

Actual Dexie/fake-indexeddb reproduction:

```ts
await Promise.allSettled([
  loadDigitalTwin(database),
  clearLocalData(database),
]);
// At the inspected revision: load fulfilled, but profile was undefined.
```

The initial existence probe sees a profile; deletion then commits before the read transaction. The new read transaction correctly reads the current profile, but its non-null assertion turns absence into an invalid fulfilled `TwinSnapshot`. A caller can then fail while rendering/accessing `snapshot.profile`.

**Verified fix:** the read transaction now rejects with an actionable profile-cleared error when the current profile is absent. The independent test accepts either a valid profile or a recoverable Error; it rejects a fulfilled snapshot without a profile. The final rerun passes. This is the deletion edge of snapshot consistency, beyond merely moving the original profile read under the transaction.

## Independent tests

Command:

```sh
npx vitest run packages/digital-twin/src/adversarial.test.ts packages/local-database/src/r06-bag-boundaries.test.ts
```

Files owned by this reviewer:

- `packages/digital-twin/src/adversarial.test.ts` — 14 tests.
- `packages/local-database/src/r06-bag-boundaries.test.ts` — 6 tests.

Meaningful covered behaviors beyond simple initialization:

- Opens a real persisted Dexie database with the complete frozen historical v2 schema, legacy `&productId` bag index and data, then upgrades it through the actual `BeautyDatabase` v3 migration. Checks canonical defaults, original quantity/time, no invented price, preserved profile/revoked consent, removed product-only uniqueness and enforced canonical-line uniqueness.
- Imports five same-product lines separated by shade, currency, source and size despite identical forged input keys; verifies keys are recomputed from the tuple. Importing a matching tuple replaces its prior identifier without deleting a different source's line.
- Rejects negative-price backup data atomically before an otherwise valid journal entry can be restored.
- Denied profile memory rolls back the entire edit. An explicit local profile/composition with memory disabled creates no permissions or graph records. Concurrent history revocation leaves no remembered nodes, revisions or edges.
- Invalid owned-product or outfit attachments do not leave partial looks or graph writes.
- Deleting one complete look removes its look-memory revisions and attributed consultation prose, while another look sharing the product/outfit retains both relationships. Every remaining edge has existing endpoints.
- Complete-look-before-first-profile-save preserves the baseline revision and uses a distinct next revision for the first edited profile. This guards a root-identified issue; it is not counted as a new independently discovered defect.
- Exercises the export/freshness attacks and concurrent deletion case documented above through actual database operations.

## Known fixes reviewed without inflated claims

The root also moved profile retrieval into the same read transaction as document/wardrobe/memory data and persisted the previously not-set profile revision when composing the first complete look. The revision regression passes. The initial profile-snapshot issue is not counted as a new finding; R06-T4 records the remaining deletion-specific consequence found in the independent check.

## Limits and production work not established here

Fake-indexeddb runs real Dexie migrations/transactions but is not a real-browser quota, eviction, crash or cross-tab migration benchmark. Large historical databases, interrupted upgrades, storage-full recovery and actual Safari/WebKit IndexedDB behavior were not evaluated in this round. The domain tests do not establish the Digital Twin UI's complete browser journey or recommendation quality. The twin remains an editable cosmetic profile, not a biometric reconstruction or medical assessment.

The export checks establish typed projection/redaction for the tested data shapes; they are not a general content-classification system for arbitrary free text. No live merchant price, stock, provider accuracy, paid service, retention policy or external transmission was verified. Broader build/lint/E2E results belong to the root's final validation and should not be inferred from these targeted tests.
