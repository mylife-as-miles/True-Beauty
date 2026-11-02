# Technical, security and fairness review — round 01

Independent review, 2026-11-02. Scope: PRODUCT_SPEC, active UI, persistence/memory, renderer, vision lifecycle, provider boundary, source notes, tests and production build. This is a development checkpoint, not product acceptance.

## Verdict

The product does not meet the ≥9.0 acceptance gate. My provisional technical score is **6.0/10**, with **privacy/reliability below the gate**. There is substantial real local functionality, real MediaPipe inference and actual source-derived algorithms. Successful unit tests do not establish camera safety across the whole UI, live API operation, diverse-person accuracy, realistic AR, or offline reload reliability.

The baseline `npm test` passed **79/79 tests in 12 files**. `npm run build` passed. The initial JS bundle was **670.05 kB / 209.21 kB gzip**, plus the vision worker and lazy chunks; this excludes large model/WASM assets. Rollup emitted benign annotation and mixed static/dynamic import warnings. I added three independent privacy regressions in `tests/critic-regressions.test.ts`; at the last intermediate run two concurrent-revocation tests passed after concurrent implementation fixes, while the attributed-backup-history test still failed. Final fix verification belongs in a follow-up entry.

## Reproduced defects

### HIGH T01 — Concurrent writes survived permission revocation

At the initial inspected revision, `rememberPreference` and `saveMedia` checked consent before their write transaction. With real Dexie plus fake-indexeddb:

```ts
await Promise.allSettled([
  rememberPreference('private', 'value', { consented: true }, database),
  setConsent('memory.preferences', false, database),
]);
// Both fulfilled; consent false; memoryNodes count 1.
```

The same sequence for `saveMedia` and `media.photos` left one photograph after revocation completed. A user can trigger this across tabs or during slow storage operations. Permission checks and writes must share a transaction locking the consent table. Related retrieval updates and consultation logging need the same discipline. Reported immediately to the implementation lead. Independent regression cases are included. The first two regressions subsequently passed while fixes were being made; full follow-up verification remains necessary.

### HIGH T02 — Import restored revoked private prose through consultation history

Enable preference and consultation memory, create a private preference, store an episode whose `memoryRefs` includes it and a message/tool summary containing the value. Export. Revoke preference memory: all the linked records correctly disappear. Import the old backup while consultation-history permission remains enabled. At the reviewed revision the preference node stayed excluded, but the episode/message/tool prose returned. Observed output: `memoryNodes=0`, `agentEpisodes=1`, and the private message remained readable.

`importLocalData` gated each table separately; it cleaned dangling edges/revisions but did not gate attributed episodes by surviving permitted nodes or messages/tool runs by surviving episodes. This defeats the revocation cascade and the import UI's promise to preserve current permissions. The third independent regression reproduces it. Fix underway at report time.

### HIGH T03 — Skin Lab leaked a late camera stream after unmount

Actual Chromium UI reproduction with a controlled delayed `getUserMedia` that resolves to a real `canvas.captureStream()` MediaStream:

1. Open Skin & rituals, select Camera.
2. Navigate Back to your mirror before permission resolves.
3. Resolve the permission request.
4. Result: `{ lateTrack: 'live', skinStillMounted: false }`.

`SkinLab.openCamera` used a separate raw camera lifecycle without the request invalidation implemented by `useCamera`. Cleanup ran before the stream existed; the late result then assigned the unmounted ref. Repeated camera opens could similarly overwrite an existing stream. A shared lifecycle or epoch/mounted check must stop every late/superseded stream. The existing camera lifecycle evidence tests the reusable hook and therefore did not cover this UI path. Reported immediately; follow-up verification required.

### MEDIUM T04 — Before/after divider and rendered boundary use different coordinates

LivingMirror supplies the frame-relative slider fraction directly as the renderer's source-image split. CSS then applies `object-fit: cover`, and optional zoom scales the media while the divider remains fixed to the frame. A landscape upload in actual Chromium at viewport 1100×950 produced a 960×720 canvas displayed in 542×550. At split 25%, the DOM divider was **135.5 px** from the frame left; the rendered before/after source boundary mapped to **87.67 px**: **47.8 px mismatch**. At zoom >1 the discrepancy also affects portrait sources.

Convert the visible split through crop/zoom into source coordinates, or perform comparison after display-space cropping. The source-space smoke test's exact pixel comparison cannot catch this UI transform mismatch.

### MEDIUM T05 — Skin Lab silently treats every saved budget as NGN

Privacy settings support NGN/USD/GBP/EUR, and the database/profile and routine engine carry currencies. SkinLab reads `profile.budget` without its currency, displays that number as NGN, builds a routine with hardcoded NGN and writes `currency:'NGN'` in `saveProfile`. For example, a USD 100 preference appears as a ₦100 budget and saving unrelated skin preferences changes the profile currency. Carry profile currency through labels, routine matching and persistence. The agent recommendation implementation also applies an NGN ceiling without consistently reconciling the profile currency; unpriced/non-NGN products can bypass the stated budget filter. Currency safety is operationally incomplete despite the engine's currency-aware unit tests.

## Security assessment

No exposed provider credential was found in the targeted source/artifact text search. The API keeps the key server-side, defaults to localhost, requires allowed Origin + HttpOnly SameSite session + CSRF for mutations, isolates task ownership, bounds image bytes and tasks, suppresses API caching, and uses conservative durable spend reservations. Provider paths are fixed; presigned uploads require HTTPS and an AWS hostname suffix; redirects are rejected and provider Authorization is not forwarded to storage. I found no demonstrated user-controlled SSRF path.

The cost boundary is a deliberately operator-reviewed exact-action plan, not automatic billing correctness: it verifies a SKU hash, not a live independently derived fee. The durable budget file is explicitly single-process. No credentials, quote, provider billing SKU, paid analysis or real provider retention/deletion was verified. PNG/JPEG checks validate signatures/size rather than successful image decoding/dimensions; a malformed or unsupported-resolution image can still reach the paid boundary. These limitations must remain visible in acceptance reporting.

Encrypted exports use fresh salt/IV, PBKDF2-SHA256 and AES-GCM. Local IndexedDB is correctly described as unencrypted. Top-level photo references are excluded from portable exports. This is useful privacy engineering; it did not prevent the concurrency/import defects above.

## Correctness, integration and fairness limits

- Source contributions are real: OpenMakeup-derived GLSL noise/material response is invoked by BeautyRenderer; Virtual Makeup-derived lifecycle/model construction powers the mirror; MIROIR-derived colour/season/provider/routine code is invoked by SkinLab/API; Skyn-derived clustering and cosine recommendation code is called from local sampling/routines. Pinned revisions and retained notices exist. Virtual Makeup's missing standalone upstream MIT notice and separate model/dataset/asset rights remain disclosed gaps. No code license establishes model accuracy or fairness.
- Shared source coordinates, bounded frame preparation, real segmentation masks, typed structured looks, adaptive inference cadence and explicit unavailable-provider states are sound foundations. The app's actual worker has separate disposal/bitmap lifetime logic; camera correctness was inconsistent between spaces.
- The recorded worker fixture reports about **6.2 face updates/s**, despite ~60 rAF callbacks/s. These are different measurements. Full-app physical-camera FPS, frame-time percentiles, long-run memory, real mobile thermals and source-change stability are not established. Software-GPU static renderer timings are not a desktop/mobile camera performance pass.
- Skin observations distinguish provider predictions, raw/display scores and local colour heuristics. No fabricated live API result or clinical phototype/diagnosis was found in inspected paths. The seasonal confidence is explicitly uncalibrated. However, when local hair/eye sampling is missing the UI substitutes prior/example swatches before analysis, so the algorithm can receive three apparent inputs although some were not measured; uncertainty and provenance should follow each swatch, rather than treating examples as sampled features.
- Real-world fairness is **unverified**. Two synthetic colour fixtures and three portraits do not validate complexion, age, gender expression, hair texture, glasses, facial occlusion or variable-lighting performance. No labelled error-rate or calibration benchmark is supplied. This prevents a ≥9 scientific/tracking assessment.
- Offline service-worker caching exists, and persistence is real IndexedDB. I did not establish production offline cold reload, lazy-space availability after network loss, update consistency, quota recovery or multi-tab deletion completion. The offline banner alone is not journey-J evidence. Firefox/WebKit, actual iOS/Android and assistive-technology operation were not independently verified in this review.
- Mandatory provider skin analysis and realistic hair/fashion generation are unavailable; broad assistant tool coverage, full accessories and physically plausible AR remain incomplete. Those are explicit product acceptance blockers even when honest unavailable labels make the local subset usable.

## Required next evidence

Re-run the independent regressions and late-camera UI case after fixes; verify the split at different aspect ratios and zoom; preserve currency end to end. Then run actual production offline journeys and browser/platform coverage, followed by consented diverse-person and real-device tracking/render measurements. No ≥9 overall score is supportable from the present evidence.
