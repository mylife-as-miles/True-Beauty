# Connected beauty reasoning — round06

## Current implementation and evidence boundary

True Beauty now has a configurable **native Anthropic Messages** reasoning adapter, an optional OpenAI-compatible Chat Completions adapter, a secure local API workflow, an exact context-review UI, and a bounded tool-execution loop. The local deterministic assistant remains the default and works without a provider or account.

Contract tests use explicitly labelled local HTTP provider fixtures and scripted decisions. Separately, a genuine authenticated Claude Haiku4.5 run completed three native Messages turns and two actual mirror actions on 2026-11-02: lipstick `#B35B6B`, hair control `#A35C36`. The real context-review interface, quote and consent were used with no personal context or images; both mounted app control values were checked. Receipt, token usage and screenshots are in `cook/evidence/r06-claude-live-001`; billing is unverified. The US$0.111 reservation was within the operator's initial US$5 ceiling. This verifies a bounded tool loop, not broad reasoning quality or public deployment. See `LIVE_PROVIDER_VERIFICATION_R06.md`.

## Official protocol research

Reviewed on 2026-11-02:

- [Create a Message](https://platform.claude.com/docs/en/api/messages/create.md): native `POST /v1/messages`, required `max_tokens`, `tools.input_schema`, `tool_use` output and `usage.input_tokens/output_tokens`. Current official example and current SDK use `anthropic-version: 2026-10-21`; the implementation uses that verified version.
- [Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls.md): assistant `tool_use` blocks followed by user `tool_result` blocks carrying the matching ID. The implementation returns actual local tool results in that protocol.
- [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing.md): model-specific USD input/output rates, tool overhead, tokenization changes and separate caching/feature prices. No rates or model availability are assumed from an old model name. Operators select an exact available model and review its current standard token rates.
- [Official SDK source](https://github.com/anthropics/anthropic-sdk-typescript/blob/cb5fba419808e3844fa6407e59577ab7ba346b79/src/client.ts) was read to cross-check the current version header; repository HEAD was recorded as `cb5fba419808e3844fa6407e59577ab7ba346b79`. No SDK source or model weights were copied.
- [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create): optional compatible adapter uses `tools`, `tool_calls`, `max_completion_tokens`, `parallel_tool_calls:false` and `store:false`. Compatibility with a chosen third-party endpoint remains unverified until actually tested.

Initial HTML requests to several Claude documentation URLs returned 403; the official `.md` endpoints and official SDK source were then fetched successfully. This was a documentation-access issue, not an API credential test. Native reasoning does not enable extended thinking, prompt caching, server tools, search or other separately priced provider features.

## Architecture and authentication

`apps/api/src/reasoning.ts` exports `registerReasoningRoutes(app, options)` and the native/compatible provider classes. It mounts into the existing API's exact-Origin, same-site HttpOnly local session, CSRF and rate-limit boundary. Every mutating route also requires the injected **validated current** session identifier. No remote identity/login is introduced.

The API owns provider credentials, endpoint configuration, reviewed prices and the spending ledger. Browser input cannot choose an endpoint, supply an API key, add a system prompt, execute code, add a tool or initiate a paid image API. Provider fetches disable redirects and bound response bytes. Upstream error bodies and headers are not returned or logged. Responses containing the configured credential string are rejected.

Native Claude uses a server-only `x-api-key` header. `ANTHROPIC_API_KEY` must never be a `VITE_` variable or a database setting. The optional OpenAI-compatible path similarly uses server-only `OPENAI_API_KEY`. No secret file is read by application code to discover credentials.

## Configuration

Use server environment variables, supplied through the managed environment or an ignored operator-owned `.env.server` file:

| Variable | Meaning |
| --- | --- |
| `ANTHROPIC_API_KEY` | Native Claude credential; server-only |
| `TB_REASONING_PROVIDER` | `anthropic` (default) or `openai-compatible` |
| `TB_REASONING_MODEL` | Exact model identifier available to the configured account |
| `TB_REASONING_PRICING_JSON` | JSON object with `model`, positive `inputUsdPerMillion`, positive `outputUsdPerMillion`, ISO `reviewedAt`, official HTTPS `sourceUrl` |
| `TB_REASONING_ENABLE_PAID` | Must be exactly `true` |
| `TB_REASONING_DAILY_USD` | Positive daily conservative reservation ceiling |
| `TB_REASONING_MAX_REQUEST_USD` | Positive per-request conservative ceiling |
| `TB_REASONING_USAGE_PATH` | Optional durable usage ledger path; default `.runtime/reasoning-usage.json` |
| `TB_REASONING_ENDPOINT` | Optional operator-controlled HTTPS endpoint; never accepted from a browser |

The model in the price plan must match the configured model. Price review expires after 30 days and cannot be future-dated beyond one minute. A key alone does not enable paid calls. No example key or fabricated model price is included in this document.

The current managed environment requires the inherited HTTP proxy. An actual nonpaid Node fetch of the official docs failed without proxy activation and succeeded with `NODE_USE_ENV_PROXY=1` on Node 24. Preserve proxy and CA settings:

```sh
NODE_USE_ENV_PROXY=1 npm run dev:api
```

If using an operator-owned environment file instead of injected variables:

```sh
NODE_USE_ENV_PROXY=1 node --env-file=.env.server --import=tsx apps/api/src/index.ts
```

`.env.*` and `.runtime/` are already ignored. Do not print credentials, place them in commands/screenshots, disable TLS verification, or bypass the proxy. The root API also initializes Node's environment-aware proxy transport where supported.

## Exact context and consent workflow

1. Select Connected reasoning; configuration status is fetched without transmitting a request or personal records.
2. Type a request. The app opens a review rather than sending it.
3. Select optional context categories. By default **none** are selected. Personal context additionally requires the persisted `remote.history` permission. Images, frames, landmarks, biometric embeddings and binary payloads are rejected by this text adapter.
4. Prepare a local exact preview containing the request, selected snapshot and approved tool names. Preferences are consent-filtered; history requires its storage permission. The preview is bounded to 12 KB and hashed using SHA-256.
5. Request a quote. Only the payload hash, context-category names, tool permissions and token/turn limits are sent for quoting; no goal text or records are sent at this stage.
6. Review the maximum USD amount, operator-reviewed pricing source, retention notice and exact payload. Explicit transmission and provider-retention acknowledgements are required. Local saving/routine creation is an independent opt-in.
7. Authorize the quote and run. The server binds the exact canonical payload hash, owner, tool set, scopes and persistence permission to a one-use quote.

Permission and selected-record validity are checked again immediately before transmission, including after CSRF-session acquisition, before tool execution, and before further feedback. Changed/deleted memories or inventory and revoked context permission stop the loop. Cancellation requests abort in-flight fetches and remove API conversation content; a provider may still bill or retain already-dispatched work. The UI makes no provider-side deletion promise.

Remote product/routine tools read only the **approved snapshot**, not fresh unreviewed profile or inventory data. Product catalog data is the explicitly supplied public sample catalogue. The model cannot discover private records through unrestricted local tools. Memory writes/deletion, scan-history access, image analysis, purchases and external provider generation are absent from the remote allowlist.

## Cost and execution bounds

The quote reserves an integer micro-USD ceiling for every authorized turn: maximum input-token bound times reviewed input rate, plus maximum output tokens times reviewed output rate. Input is bounded using its UTF-8 serialized size with a conservative envelope/tool-overhead allowance. The default input ceiling is 32,000 tokens, with an optional typed operator override. This is an operator-reviewed conservative bound, **not** a live provider pricing lookup.

At most four model turns, one tool per turn, 1,600 output tokens per turn, 25 seconds per upstream call and 90 seconds per client session are allowed. No automatic paid retry is issued. Identical repeated step IDs return the cached bounded response; concurrent steps and repeated tool IDs cannot trigger duplicate actions. Malformed/truncated/unapproved tool output fails before an action executes. Actual tool failures are sent as failed feedback for recovery within the remaining bound.

The full session ceiling is reserved once before model dispatch and is not automatically refunded on cancellation, output truncation or uncertain upstream failure. The durable ledger stores only date and aggregate micro-USD reservations, never prompts or images. It is designed for a single API process; multi-process/multi-region deployment requires an atomic shared reservation service before production scaling.

Actual action summaries come from application tool results. Provider prose is labelled separately as model guidance and cannot create a successful tool state. A response claiming to save something without a corresponding tool call does not save anything or produce a success badge. Partial failures preserve already-completed action evidence.

## API contracts

| Route | Behavior |
| --- | --- |
| `GET /api/reasoning/capabilities` | Configuration/readiness, model, limits, image rejection and retention; no key or prompt |
| `POST /api/reasoning/quotes` | Hash/scopes/tools/persistence/turn/token metadata → expiring conservative USD quote |
| `POST /api/reasoning/sessions` | Exact reviewed payload + consent + sufficient quote authorization → session; reserves budget once |
| `POST /api/reasoning/sessions/:id/step` | Unique step ID + exact pending actual tool feedback → validated next tool call or guidance |
| `DELETE /api/reasoning/sessions/:id` | Owner-checked cancellation and volatile context removal |

JSON schemas and typed browser contracts live in `packages/agent-runtime/src/reasoning-protocol.ts`. The browser executor/review builder is `remote.ts`. The registration returns a `capabilities()` function for the root consolidated API inventory.

## Executed verification and remaining gates

Scoped unit/HTTP tests cover native tool-use/tool-result protocol, output truncation, exact quote hash, ownership, root Origin/session/CSRF enforcement, duplicate-step safety, bounded spending, cancellation, unapproved tools/arguments, actual local callbacks, partial failures, default no-context behavior, late revocation/CSRF delay and bounded loops. The localhost HTTP fixture is a real HTTP exchange with scripted responses; it is not Anthropic verification.

`tests/e2e/reasoning-review.spec.ts` exercises real desktop/mobile UI review, exact payload display, disabled personal context by default, quote-before-consent gating, actual mirror control mutation via a fixture model decision, feedback and unconfigured-to-local fallback. Screenshots are in `cook/stills/r06/reasoning-review-*`.

Executed scoped verification: **32 tests passed across 3 Vitest files** (`tests/reasoning-api.test.ts`, `packages/agent-runtime/src/remote.test.ts`, existing `agent.test.ts`); strict TypeScript and scoped ESLint passed. Latest UI run: **4 Playwright cases passed** across desktop Chromium/mobile emulation in `test-results-reasoning-r06-polished` (9.8 seconds). The initial desktop fixture run found an ambiguous substring selector after the studio gained a second companion link; it was corrected to an exact accessible-name selector and both projects rerun. Native protocol, real local actions and consent state changes were exercised; no fixture count is evidence of a paid live result. Physical Safari/device evaluation remains separate.

Remaining gates: production durable workflow storage and deployment audit; adversarial prompt-injection evaluation beyond bounded contracts; broad reasoning quality/fairness evaluation; full advanced tool scope and longitudinal memory planning. Actual account model availability, current pricing and one credential-backed Claude workflow are now verified separately from fixture tests. `openRemix` is wired to the real local Remix space in both application contexts. The Digital Twin's future context projection must remain explicitly selected and reviewed; it is not silently sent. The D1 boundary prototype is tested but cannot dispatch providers; current public hosting remains static.
