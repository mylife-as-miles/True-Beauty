# Round 06 — real merchant observations, exact bag variants and owned products

Date: 2026-11-02. Scope: implementation and bounded verification in the current round-06 working tree. This is not a claim of complete commerce, a merchant partnership, current checkout prices, licensing of a retail feed, or completion of True Beauty’s original acceptance gates.

## What is operational

- An actual browser → local API → official public product page path. The user explicitly requests a source check. No personal photo, profile, budget, routine, or beauty history is sent to a merchant.
- A reviewed registry of three official brand storefronts and four specific product pages, including an actual Nigerian manufacturer with explicitly published NGN prices.
- Exact Product/Offer JSON-LD parsing: source currency, price, SKU, explicit stock state, validity date where provided, canonical source URL, actual fetch timestamp and unavailable/unknown states. No stock, currency, price, exchange rate, shipping, diagnosis or checkout success is inferred.
- Reactive Dexie price snapshots, a bounded five-observation-time history per reference, local recall after reload, stale/expired and imported-record disclosures.
- A variant-, size-, currency- and source-aware local planning bag with transactional updates, separate currency totals and exact-line quantity/removal. There is no checkout or stock reservation.
- A real user-owned product form: name, brand, category, labelled shade/size, user-provided INCI with packaging/page attribution, optional reference URL, opened date and notes. Records can be edited, inspected and deleted. Raw label text is retained alongside parsed ingredient names; no full ingredient formula or price is invented. Reference URLs supplied by users are saved only and are not fetched.

## Current sources and observed evidence

The following were read over genuine HTTP through the configured session proxy. The facts below describe the recorded fetches, not a promise of lasting prices or stock.

| Official source | Canonical product page | Observation in real contract capture, approximately 13:22 UTC |
|---|---|---|
| Nuban Beauty, Nigeria | https://nubanbeauty.com/products/seal-it-makeup-fixing-spray | SEAL IT! fixing spray 105 ml, SKU SI-MFS: **NGN 11,950**, explicit InStock |
| Nuban Beauty, Nigeria | https://nubanbeauty.com/products/pro-gloss-mini-lipsticks | Five explicit SKU offers: #scandal NGN 3,600; #bliss/#lily/#sleek/#noble NGN 2,400; all explicitly OutOfStock |
| Beauty of Joseon | https://beautyofjoseon.com/products/glow-serum-propolis-niacinamide | SKU 82BS006 USD 15.30 and 82BS030 USD 27.20, explicit InStock; source price-valid-until 2026-11-03 |
| The Ordinary, US storefront | https://theordinary.com/en-us/natural-moisturizing-factors-ha-moisturizer-100435.html | Explicit 30 ml SKU, USD 6.70, InStock. This is **not** the sample catalogue’s 100 ml entry; the UI keeps these records separate and discloses the size difference. |

`cook/evidence/merchant-r06/live-contract.json` records seven genuine outgoing HTTP 200 requests: three robots policies and four product pages. The reproducible `.mts` script invokes the route in process with Fastify inject, but its fetch wrapper calls real native HTTP; no response is mocked.

`cook/evidence/merchant-r06/live-browser.json` independently records the actual running browser/API path at approximately 13:38 UTC, with no route interception: Nuban NGN 11,950 and the two BOJ USD offers, separate-currency bag creation, source recall after reload and zero page errors. Its request records contain only sourceId/referenceId. API session headers/tokens are intentionally excluded. Screenshots and an actual browser recording are under `cook/stills/r06-commerce/`.

## Access, rights and robots decisions

- Nuban and BOJ public product HTML is allowed by the observed robots policies. Their Shopify instructions distinguish public reading from transactional cart/checkout interfaces. This adapter reads public product-page facts only and does not call cart, account, checkout, AJAX cart or order endpoints.
- The Ordinary robots policy permits these product pages while restricting cart/checkout and variation/search endpoints. The adapter reads one fixed product URL.
- BeautyHut returned 403; BeautyHub returned 404. No access-control bypass or user-agent impersonation was attempted.
- The old BOJ Relief Sun product URL returned 404. It was not silently used as a current merchant quote. The illustrative catalogue entry remains labelled sample.
- BuyBetter’s automated-use/bot policy was not chosen as an enabled source. Zaron’s reachable site is a client-rendered shell without the reviewed static product facts; no internal API was reverse-engineered for this adapter. House of Tara’s product/API restrictions were not used as a route to retrieve product data.
- This is a tiny, user-initiated factual lookup, not a bulk catalogue scrape. No merchant photographs, product descriptions, customer reviews, theme code or model assets are bundled. Raw inspected pages were moved outside the distributable application into `/workspace/research/merchant-r06`; `research-manifest.json` retains hashes and provenance. Repository evidence retains factual prices/SKUs/source URLs/statuses and original code/tests.
- A public page and robots allowance do not establish a commercial feed license or a partnership. Expanding or publishing a large retail integration requires a separate terms/licensing review. No feed credential or merchant account exists here.

## API contract and boundaries

Implementation: `apps/api/src/merchant.ts`, mounted by the principal API server.

- `GET /api/merchants/sources` returns the reviewed registry and lookup policy.
- `POST /api/merchants/refresh` accepts exactly `{ sourceId, referenceId }`. Caller-provided URLs and extra fields are rejected. It returns observations, their original fetch time, cache status and next refresh time.
- `POST /api/merchants/resolve` accepts exactly `{ url }` and resolves only the exact listed HTTPS product pages. Unknown origins/paths, credentials, query strings and fragments are rejected without requesting that URL.
- The actual server’s Origin, anonymous same-site session and CSRF protections apply to POST routes; this is an anonymous API safety boundary, not an account/login system.

Safety controls:

- Fixed HTTPS source/product registry; no arbitrary URL fetching or private-network destination input.
- Native redirects are rejected rather than followed. A changed official URL needs registry review.
- Fresh robots policy check before product retrieval, cached for one hour. A policy denial or unavailable policy produces no price.
- Identified reference-lookup user agent; credentials omitted from outbound requests. Browser session cookies and tokens are not forwarded to merchants.
- 15-second request deadline; 2.5 MB streamed page limit; 100 KB robots limit; body cancellation for rejected responses. Scripts are parsed as JSON and never executed.
- Successful source checks cached for 15 minutes; failures for one minute; concurrent checks for a reference share one request; 12 refresh actions per IP per minute within the API’s broader limit.
- Bounded schema traversal/offer count. Unsupported aggregate ranges and absent currency/price fields do not become exact prices. Missing or unfamiliar availability remains unknown.
- Known source identity is revalidated before rendering saved observations. Imported snapshot/bag records are marked unverified by the principal database import path; they cannot regain a fresh “verified” claim through a backup.
- Node 24’s supported `http.setGlobalProxyFromEnv()` uses inherited proxy configuration when present. No proxy/credential value is printed, and TLS verification stays enabled. Direct native fetch initially failed in this isolated executor; enabling the inherited proxy fixed the actual HTTP path.

## Local persistence and exact identity

The principal architect owns the version-3 Dexie migration and import validation. The shared `bagLineIdentity(productId, size, variantId, currency, sourceKey)` is a five-part JSON identity. Existing commerce utilities delegate to it; old remove/change callers must resolve uniquely and cannot silently edit a different currency/source.

Legacy product-only bag entries migrate as variant `default` (displayed as **Shade or size not recorded**), NGN and sample source. The migration does not invent a historical shade choice. New entries preserve exact variants, currency, unit-price snapshot, sample/observed/imported kind, source and price date. Public merchant references use their own product IDs rather than overwriting sample products or pretending a different size is equivalent.

`persistent-bag.ts` reuses the existing adapted cart quantity/identity operations within Dexie transactions. Concurrent additions and quantity changes operate on the selected five-part identity. Totals use rounded minor units and stay separate by currency. Unknown prices are excluded and labelled, never displayed as free products. A planning total is not an order amount or payment result.

User product records are independently typed and validated. Empty ingredient knowledge remains empty. Overlong ingredient labels are rejected rather than silently truncated. Source links are never automatically fetched. Imported malformed user-product shapes are ignored safely by the inventory renderer. Removing a custom record also removes its wardrobe, variant and bag references; general history/memory retention is still governed by its own explicit controls.

## Verification

Automated checks are fixture/domain evidence unless explicitly labelled real outbound above.

- Parser/API tests cover exact offer identity, explicit stock/currency, unavailable fields, malformed JSON-LD, aggregate ranges, stale/expired/imported states, URL/SSRF rejection, robots precedence, redirect rejection, bounded response bodies and inherited API Origin/CSRF guards.
- Persistent-bag tests cover distinct shades/currencies, concurrent additions, exact quantity/removal and rejecting imported/expired source quotes.
- User-product tests cover actual owned relationships, source-attributed parsed INCI, editing/deletion, retained original label data, input bounds and malformed import shapes.
- `tests/e2e/commerce-r06.spec.ts`: six desktop Chromium/iPhone-viewport cases passed in the first complete successful run (28.7 s): variant/currency bag reload/quantity/removal; user INCI source/edit/delete; and explicitly labelled synthetic source-contract UI/privacy. The fixture response visibly says TEST FIXTURE and is not live verification.
- Real browser source verification is separate: `live-browser.mjs` has no mock/interception and captured actual Nuban/BOJ source responses, bag totals and local reload.
- TypeScript and owned-file lint were run; final exact command results are recorded in the handoff after the last cleanup. No physical-device, screen-reader, cross-browser merchant run, shipping, availability guarantee or production checkout claim is made.

## Remaining commerce work

- Multiple merchants quoting the **same exact SKU/size/shade** before genuine comparative-price claims; currency conversion only with a sourced exchange rate.
- Verified full current INCI/formulation data, supported licensed feeds, Nigerian shipping/local stock rules and freshness monitoring; no equivalence/dupe claim from shared ingredient names.
- A broader approved registry or an operator-reviewed feed onboarding flow. User-supplied links outside the reviewed pages currently fail closed.
- Integrating new user-entered inventory into every agent/routine/complete-look planner; manual records exist now, but not every advanced recommendation tool consumes them.
- Durable multi-instance caching/rate policy and a production security/terms audit before public API hosting. This session did not publish an updated merchant service or place orders.

## Final bounded check update

- The final commerce browser rerun passed **6/6** desktop/mobile cases in **17.5 s**, after the screenshot-driven mobile heading/ingredient-spacing improvements.
- Own commerce/user-product/merchant API tests plus the independent database bag-boundary regressions passed **31 tests in 6 files** (1.32 s). This includes a newly reproduced and fixed generic freshness boundary: `getPriceState` now rejects imported flags/kinds, invalid timestamps and future-dated records as fresh/verified. The independent critic’s just-imported price regression passes.
- Generic catalogue snapshot freshness and actual merchant observations are different contracts. Live merchant observations expire after 24 hours or the source’s earlier validity deadline. Imported observations require a fresh source check; a generic backup cannot confer merchant verification.
- Full strict TypeScript checking and owned-file lint were rerun at the final freeze. Exact output is recorded in the engineering handoff; the root agent owns the later global regression run.
- Broader public API hosting remains a separate deployment issue. These genuine merchant calls were verified through the running local Fastify service, not falsely represented as an already deployed public merchant backend.

## Critic-driven touch and notification repair

Mobile bag close/remove controls and quantity fields now provide targets at least 44px in both dimensions. The merchant notebook and bag reserve space below the dialog for the global receipt notification, keeping “Add planning quote” and “Check reviewed merchant sources” visible and clickable while that receipt is present. This is scoped commerce CSS; no global toast, provider or database behavior was changed.

The final combined desktop/mobile regression passed **12/12** cases in **1.5 minutes**. The four new UX cases include actual DOM target bounds and `elementFromPoint` checks proving that both source actions remain unobscured, plus persistent selected variants/currencies in the existing bag regression. Source-layout checks use an explicitly labelled **TEST FIXTURE** response and do not replace the separately recorded genuine merchant HTTP evidence. Inspected captures: `cook/stills/r06-ux-followup/{merchant-action,bag,bag-source-action}-{chromium,mobile}.png`. TypeScript and owned-file ESLint passed.
