# R07 genuine public merchant journey

Public origin: https://true-beauty-miles.myles4miles.chatgpt.site

Executed 2026-11-02 in actual headless Chromium 156.0.8078.4. Desktop 1440×1000 and mobile 390×844 viewport layouts were inspected. Fresh browser contexts required no login. No response interception, mocks, paid/provider actions, credentials, private images, purchases, orders or Sites management calls were used.

## Genuine source results

The first public UI run returned uncached HTTP200 from the native merchant API for both explicit source checks:

| Source / canonical URL | Real observed offer | Source fetch timestamp, UTC |
| --- | --- | --- |
| [Nuban Beauty](https://nubanbeauty.com/products/seal-it-makeup-fixing-spray) | SEAL IT! 105ml, SKU **SI-MFS**, **NGN 11,950**, explicit merchant InStock, source validity 2026-12-02 | 2026-11-02T16:48:24.223Z |
| [Beauty of Joseon](https://beautyofjoseon.com/products/glow-serum-propolis-niacinamide) | Glow Serum SKU **82BS006**, **USD 15.30**, explicit merchant InStock; source validity 2026-11-03 | 2026-11-02T16:48:29.751Z |
| Same official BOJ page | Separate SKU **82BS030**, **USD 27.20**, explicit merchant InStock; source validity 2026-11-03 | 2026-11-02T16:48:29.751Z |

These are dated source observations. Final checkout prices, tax/shipping, Nigerian delivery and lasting inventory are not established. The UI displays source, original date, SKU/currency, observed stock state, official verification link and the difference from its sample catalogue. No product description/media was scraped or bundled by this probe.

`live-browser.json` retains the original genuine request/response bodies. Only `{sourceId,referenceId}` was sent in each of its two POSTs; session/CSRF headers and values were deliberately excluded. All actual page/console/failed-request error lists were empty.

## Corrected exact-SKU replay

The first harness incorrectly assumed that API response order matched Dexie-rendered row order. Screenshot review caught that its `added[]` annotation wrote BOJ 82BS006/USD 15.30 while the actual clicked/rendered bag held 82BS030/USD 27.20. The first response receipts and bag screenshots are genuine; that inferred annotation and its generic “exact added lines” check must **not** be cited as exact-selection proof. No product defect or data loss was reproduced: the UI correctly added its clicked row.

The error was reported immediately and corrected in a separate run, preserving all first-run records. Use **`verified-replay.mjs`** and **`verified-replay/live-browser.json`** for exact selection evidence. It locates each row by its explicit SKU label and checks the actual bag SKU, currency and amount before reload.

The independent fresh-context replay at 16:50:33–16:50:40 UTC received genuine cached HTTP200 responses with the original 16:48 fetch times, then:

- Selected **SI-MFS / NGN 11,950** and **82BS006 / USD 15.30** by explicit SKU.
- Verified those exact quoted amounts and SKU/currency labels in the actual bag.
- Reloaded the app and verified unchanged complete bag text with separate NGN/USD totals.
- Recalled source history from local storage without another refresh.
- Measured mobile close/remove targets 44×44px and quantity fields 54×44px.
- Recorded **zero** browser errors, console errors, failed requests or provider/unrelated mutation requests.

All **nine** corrected replay checks passed. Its two refresh responses were explicitly `cached:true`; they are not relabelled as new merchant fetches. Across both runs there were four user-equivalent refresh POSTs: two uncached initial observations and two cached replays. No further network check was needed.

## Inspected captures and recording

The original desktop source/price/bag captures and video are alongside this summary. Corrected desktop/mobile viewport captures and actual video are under `verified-replay/`:

- `desktop-nuban-ngn.png`, `desktop-boj-usd.png`
- `desktop-bag.png`, `desktop-bag-reloaded.png`
- `mobile-bag.png`, `mobile-source-recalled.png`
- `video/*.webm`

The corrected screenshots were opened and visually reviewed. The observed source amount/SKU/date is legible, the bag retains separate currency totals, and mobile controls remain usable. Viewport emulation does not establish physical-device/Safari behavior or a comprehensive accessibility audit.

Reproduce with `node cook/evidence/merchant-r07/verified-replay.mjs`. It performs genuine public source checks and may receive cached, changed or unavailable data; it never substitutes a fixture price. All edits in this task are confined to this new evidence directory. Prior R06 records and application/provider code were untouched.
