# Research log

This log records observations, sources, licensing boundaries, experiments and remaining evidence. Research access is not operational verification. Dates use UTC.

## 2026-11-02 / R0 / repository acquisition

All requested repositories cloned successfully into `/workspace/research/`. See `cook/REFERENCES.md` for exact SHAs. Target `/workspace/True-Beauty` was an empty repository before this build; no existing product code was removed.

| Investigation | Finding | Engineering decision | Verification remaining |
|---|---|---|---|
| OpenMakeupSDK | GLSL shaders, face geometry, materials/patterns and reshaping present; MIT code | Graphics agent adapts real shaders/geometry and attributes exact paths | Shader compilation, aligned image/live rendering, asset rights and browser evidence |
| virtual-makeup | Camera studio, MediaPipe geometry, hair/OpenCV compositing code; README claims MIT, linked full LICENSE absent | Vision/graphics keep attribution and useful distinct methods; audit missing license notice | Exact adapted code/destination, cleanup/mask tests, model/asset rights |
| SKIN_AI | Color/routine/matching and provider patterns; MIT code | Skin agent adapts algorithms and verifies current official provider contracts rather than trusting old URLs | Dynamic malformed-field tests, real configured provider smoke |
| Skyn | Python preprocessing/skin/color/ML and recommender; MIT code | Migrate appropriate deterministic preprocessing/feature/cosine algorithms to TS; do not deploy unvalidated legacy classifier/uncleared data | Cross-complexion/lighting fixtures, source path/test proofs; weight/dataset clearance |
| Official YouCam skills | Current official capability/endpoint instructions available | Skin/API agent reviews official workflow and cost/schema requirements | Credentials/cost authorization and actual live request not established |

## 2026-11-02 / R0 / creator interaction references

Proofline source review: `README.md`, `LICENSE`, `AGENTS.md`, `prd.md`, `src/styles/proofline.css`, `src/components/reader/Lens.tsx`, `src/components/landing/MagnifierLens.tsx`. Selection triggers an anchored contextual lens; an explicit action becomes a question/note and answer retains the selected passage context. Keyboard selection and coarse-pointer docking are handled. Licensing explicitly excludes unidentified Gloss-derived material; **no source or asset copied**. Independent True Beauty adaptation: ingredient/face-region contextual exploration.

Common Table source review: `README.md`, `LICENSE`, `src/App.tsx`, `src/components/MenuBook.tsx`, `src/components/ImmersiveMap.tsx`, `src/components/Waiter.tsx`, map/accessibility/state inventory. Spatial map, tactile book, shared table and final plan retain the same domain state. Pointer capture/pan/zoom, keyboard/list alternatives, reduced-motion/low-power handling and controlled state-changing agent actions are instructive. Root MIT covers original source; vendor/fonts/photos retain separate rights. No source/assets copied in this research pass. Independent adaptation: preserve complete-look/selected-product state across mirror/styling/shop/routine context.

Source applications were not browser-run in this pass. Their live appearance, motion feel and production behavior remain unverified; repository README/source are evidence only of implementation intent/code.

## 2026-11-02 / R0 / Taste Skill and Cook

Read current Taste `SKILL.md` and full app-screens reference, current Cook `SKILL.md`, target/bar, loop/critics and rules. Installed compatible non-overwriting Codex symlinks following documented manual/local installation. No global instruction files overwritten.

Taste draw experiment: app builder kind, screens builder/home/detail/settings, light theme. Two styles offered; `framed-sheet` selected with palette/type preserved. Seed 890544161. Output `.taste-skill/direction.json`. Decision rationale and full constraints in `docs/DESIGN_RESEARCH.md`. No design score inferred from draw output.

Cook applied as persistent application evidence/review loop. Full creator scope takes precedence over a demo-depth/default asset rule. Local app screenshots/tests do not require a final-video approval gate. Actual publication/paid requests/private transmission retain explicit authorization constraints. Fixed screen states in `cook/SHOTS.md` and rubric in `cook/BRIEF.md`.

## 2026-11-02 / R0 / product inspiration page access

Read-only fetches returned HTTP 200 on all six pages. HTML snapshots for source reading reside outside the product under `/workspace/research/{clear,clinikally,skinsort,glamar,haut,revieve}.html`; none are product assets. Findings are vendor/product claims and are not scientific/clinical/performance validation.

| URL | Observed capability emphasis | Adopted product principle |
|---|---|---|
| https://www.ycombinator.com/companies/clear | “unbiased AI and data layer for skin health” | Link journal/progress and feedback to attributed evidence; qualify observations |
| https://www.clinikally.com/ | Skin/hair commerce, consultations, routine-oriented discovery | Assisted discovery connected to the user's actual task; no clinical claim reuse |
| https://skinsort.com/ | Ingredient checker, routine creator, compare products, dupes | Concrete ingredient exploration/comparison and editable routines |
| https://www.glamar.io/ | AR visualization, category-specific try-on, 360 viewer, commerce | Named preview technology and product/variant handoff |
| https://haut.ai/ | Skin analysis, advice and generative skin simulations | Explicitly distinguish cosmetic observations from simulations |
| https://www.revieve.com/ | Connected skin/makeup/hair/commerce intelligence | Shared scene/profile context across engines |

No UI copying, proprietary model reuse or asset downloads were performed. These pages establish product ideas only.

## Research escalation ledger

Each blocker should produce: precise limitation → official docs/source search → alternative GitHub/research/math → isolated experiment → measured comparison → integration decision → exact provenance/license/evidence. Failed approaches are not endlessly repeated; missing capabilities retain feature-matrix entries.

Open investigations delegated to engine owners:

- Current Perfect Corp input/task/poll/result schemas; supported concern list; image lifetime and provider cost contract.
- CatVTON, IDM-VTON, Leffa software/model/data licenses before use; usable commercial provider alternatives.
- Model distribution terms and origin for MediaPipe face, hair and hand artifacts independent of package source license.
- OpenCV.js masking versus WebGL compositing hybrid quality/performance.
- Live camera/device/cross-complexion/lighting tracking and mask quality.
- Worker/off-main-thread scheduling and WebGPU only after measured experiments.

No benchmark or live API success is claimed here. Record actual experiment commands and measurements in the implementing package notes, Cook round and quality report when performed.

## 2026-11-02 / R0 / independent import-validation probe

Read-only package review found that the initial portable backup schema validated record IDs and a few memory discriminators but not the complete MemoryNode shape. Isolated reproduction used `node --import tsx --input-type=module`, `fake-indexeddb/auto`, a fresh `BeautyDatabase('qa-invalid-import-'+Date.now())`, allowed `memory.preferences` consent and all `tableNames` in a backup. A memory record with valid id/subjectId/type/key/confidence/consentScope/updatedAt/value but no createdAt/evidenceRefs/retentionPolicy was accepted (`import accepted records: 1`), then `retrieveMemories('',{},database)` threw `RangeError: Invalid time value`. Test database deleted afterwards. No product data modified.

The concrete repro was sent to the memory implementation owner. Required correction: per-table required-field validation before transaction, atomic rejection, tests for malformed graph/episode/profile/routine shapes; review deletion/revocation cascade into attributed episode prose. This is an actual observed defect in the initial concurrent implementation, not a claim about the final state. Resolution must be evidenced by the owner's tests and a repeated isolated probe before the import/privacy gates can pass.

Resolution / independent recheck at approximately 09:06 UTC: memory owner added full required-field schemas for graph/episode/profile/routine/collection records, recursive credential-field detection and centralized attributed-episode cascades. Repeated the original isolated malformed-memory backup plus a valid unrelated journal row: import rejected with Error before writing; `memoryNodes: 0`, `journalEntries: 0`. Re-ran `npm test -- packages/local-database packages/beauty-memory packages/agent-runtime`: 3 files / 26 tests passed. This resolves the reproduced malformed import/atomicity defect; browser backup/restore UX and broader privacy behavior remain separate evidence requirements.

Independent domain check at 09:06 UTC: `npm test -- packages/commerce-engine packages/hair-engine packages/fashion-engine`: 3 files / 15 tests passed. Algorithm/contract evidence does not establish full UI, real segmentation/VTO or real merchant stock/price availability.
