# Genuine provider execution — round06

Reviewed 2026-11-02. These are actual authenticated remote operations, separate from contract fixtures. Original synthetic adult/person/garment images were generated for this test; no personal image, stock subject or private history was transmitted. They establish execution and error behavior, not clinical accuracy, demographic fairness, garment fit or identity preservation.

## Exact evidence

| Operation | Actual result | Retained evidence |
|---|---|---|
| YouCam skin SD: texture, pore, redness, moisture | First image rejected; second diagnostic request identified `error_src_face_too_small`. No scores were displayed or fabricated. | `cook/evidence/r06-live-001/receipt.json`, `cook/evidence/r06-skin-002/receipt.json` |
| YouCam skin SD after explicit local framing | Success; four genuine predictions dynamically parsed, adjusted display scores and raw scores separate, confidence unavailable. | `cook/evidence/r06-skin-003/receipt.json`, `framing.json` |
| YouCam hair-transfer v2.1, `female_s_wave_brunette` preset | Success; genuine JPEG downloaded and SHA256 recorded. Visually inspected: longer styled hair replaces the original bob. | `cook/evidence/r06-live-001/generated-hair.jpg` and receipt |
| YouCam cloth-v4, blouse with `full_body` | Protocol success but semantic failure: lower trousers were removed. This result is retained as a defect example. | `cook/evidence/r06-live-001/generated-clothing.jpg` |
| YouCam cloth-v4, same blouse with `upper_body` | Success; genuine result visually inspected: burgundy blouse with original navy trousers and shoes retained. | `cook/evidence/r06-clothing-002/receipt.json`, `generated-clothing.jpg` |
| Native Claude Messages, `claude-haiku-4-5-20251001` | Three actual model turns; validated `setLipColor` and `setHairColor` executed against the mounted app store. Final controls matched `#B35B6B` and `#A35C36`; zero page errors. | `cook/evidence/r06-claude-live-001/receipt.json`, review/actions screenshots |

The native Claude test used the real context-review/quote/consent interface and transparent HTTP forwarding to the actual local API. No response was scripted. Its context was `{}` and persistence was disabled. Provider guidance was displayed separately from actual action summaries. Token usage reported by the provider was 4,291 input and 253 output tokens. Reviewed standard rates of US$1/MTok input and US$5/MTok output imply approximately US$0.005556; this arithmetic is not an invoice. The server conservatively reserved US$0.111, and account billing remains unverified.

## Spending, consent and retention

The user explicitly authorized paid testing. The operator selected conservative initial limits: 100 YouCam credit reservations and US$5 Claude reservations. Exact current SKU hashes and quotes were validated before image upload. The first batch was bounded to 13 credits; isolated diagnostic skin and corrected clothing runs were bounded to nine and two credits respectively. Reservations are not automatically refunded on uncertain failure. Authenticated metadata showed1,000units initially,996after the first two successful generations, and985after all completed experiments. The15-unit total delta is consistent with three2-credit generations and one9-credit skin completion. It is aggregate account metadata, not a verified per-task invoice. Conservative reservations were33credits, including failed skin attempts, andUS$0.111 for Claude.

Keys were supplied only through hidden stdin to process-local server configuration and native secret settings. Keys are absent from source, browser configuration, IndexedDB and receipts. The supplied RSA-formatted value was not required by the documented bearer-key workflow and was not used.

Official general retention documentation states uploaded and generated files/tasks remain for up to **30 days**, and download URLs last two hours. Some task pages still say 24 hours. UI consent conservatively discloses the longer 30-day period. Local temporary tasks expire after 15 minutes. Local cancellation/deletion does not promise provider deletion or refunds. Receipts redact presigned download URLs, CSRF/session credentials and image bytes.

## Corrections driven by real results

- Terminal skin failures now expose only documented allowlisted codes and specific recovery advice. Arbitrary upstream text is discarded.
- Skin-only and clothing-only operator modes avoid rerunning already successful tasks. No charged retry happens automatically.
- Garment category is explicit and defaults to `upper_body`; a blouse must not silently request replacement of an entire outfit.
- Generated source provenance persists through mirror edits and offers restoration of the original source. Generated images cannot be submitted as personal skin evidence.
- The original face occupied too little of the image width. An explicit local crop from 478 actual landmarks produced a 724×809 JPEG with 71.96% detected face width and no upscaling. The operator visually reviewed the exact crop before an isolated nine-credit request; skin analysis then succeeded with four dynamically parsed concerns. This verifies execution on this synthetic fixture, not skin physiology, clinical hydration, fair accuracy or concern-map overlays. The optional user-facing framing preview is separately browser-tested before release.

## Hosting boundary

Public URL: https://true-beauty-miles.myles4miles.chatgpt.site . Public availability is confirmed separately from provider execution. The currently published static release has no remote API backend. Native Cloudflare Node HTTP succeeds, but the application's current Fastify router fails workerd's code-generation restriction. `docs/EDGE_R06.md` records the real failure and a 21-assertion D1 paid-boundary proof. The prototype intentionally has no provider dispatch. Durable workflow storage, production owner authorization and the actual hosted adapter remain required before paid public features are enabled.

## Current official references

- https://docs.perfectcorp.com/reference/ai_skin_analysis.md
- https://docs.perfectcorp.com/reference/ai_hairstyle.md
- https://docs.perfectcorp.com/reference/ai_clothes.md
- https://docs.perfectcorp.com/develop/file_retention_period.md
- https://platform.claude.com/docs/en/about-claude/pricing.md

All five returned HTTP200 during this round. Earlier guessed `/develop/skin-analysis.md`, `/develop/ai-hairstyle.md` and `/develop/ai-clothes.md` returned404; the supported reference pages above were then used. Exact model availability was checked through authenticated metadata before the native Messages run.
