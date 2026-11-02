# Quality report — active engineering checkpoint

The requested complete product acceptance is **not met**. A running local application and substantial source-adapted functionality exist. This report distinguishes tested behavior from unavailable providers, unvalidated accuracy and planned scope. The provisional weighted score is6.58/10, a prioritization judgment documented in cook/SCORECARD.md, not measured accuracy.

## Executed evidence

- TypeScript and ESLint have passed on integrated source; final command reconciliation is recorded below. A transient early portal patch syntax error was corrected before retaining source. It is not represented as a successful check.
- Final complete unit/integration run:15files/97tests passed. Includes real adversarial consent/revocation/import tests, source task queues, source-derived colour/matching routines, provider fixture/security boundaries, geometry/masks and local persistence.
- Actual local MediaPipe models:478face landmarks,52blendshapes,16transform, nonempty hair confidence masks and actual hand detections across3public demo portraits in Chromium. Real worker scheduling and camera lifecycle fixtures have separate evidence; no ground-truth hand accuracy claim.
- Real WebGL shader compile/draw/split/context-loss restoration and OpenCV masks/composite were executed. GPU-size and cross-browser regressions are added as discovered. Software fallback has an explicit finish limitation; no artificial successful API/render response.
- Desktop/mobile browser journeys exercised source editing, hair/accessories, saved recipes, real compare replay, ingredient lenses/compare, owned collections/bags, local appearance sample/profile correction/season colours, AM/PM routines/completion/editing, notes/experiments, garment composition, visual canvas, actual agent tools/budget, graph correction/deletion/export/import.
- Production offline saved-look/inventory reload:2/2actual desktop/mobile passes after correcting public asset cache matching. Development HMR offline is intentionally not the distribution target.
- Firefox actual20pass/1production-onlyskip after unprivileged Xvfb/Mesa restored real WebGL. WebKit actual local inference and final complete25-case suite verified:24passed/1production-onlyskip; renderer and modal defects were closed. Missing system-wide privileged dependency install was an environment issue, resolved locally where possible—not evidence of browser support failure.
- Dependency audit `npm audit --omit=dev`:0known production advisories at execution. Pattern scan found no known embedded credential patterns; this is not a complete security audit.
- Actual screenshots, recordings, JSON reports and independent reviews are retained in cook/ and packages/vision-core/evidence. Read evidence scripts for fixture/hardware limits.

## Independent review and defect history

Visual-r01=7.0 and visual-r02=7.7. Product-r01: local usefulness7.3, complete scope3.0; acceptance5.5. Technical rounds reproduced issues that normal build/unit tests missed. Reproduced consent write/revoke races, attributed private prose reimport, late camera acquisition, source-change stale inference, same-demo camera geometry, display split crop/zoom/resize and currency reinterpretation were fixed and independently retested. Source/retention limitations were not hidden behind mock success.

Manual accessibility review found a disabled-control focus escape even when axe reported0. Filtered traps, top-modal containment, inert background and body portals now have actual keyboard tests. Review must continue across assistive technology and real touch devices. Automated scans are a subset, not a compliance certificate.

## Performance evidence and limitations

See VISION_REPORT for exact CPU/browser/resolution/percentiles and raw logs. Worker fixture ~59.86rAFcallbacks/s was explicitly NOT59.86predictions/s; face updates were about6.2Hz under combined CPU workload. GPU/software and mask benchmarks vary under concurrent load; reports preserve both isolated and loaded values. No physical mobile30FPS, hardware60FPS, sustained thermal/allocation, broad occlusion or fairness target is declared passed. Optional3D uses demand rendering, with0idle draw calls verified in its fixture.

## Privacy/science boundaries

No login, remote profile or implicit raw-frame/face-embedding storage. Dexie is origin-local, not encrypted/synced by default. Explicit scoped consent controls sensitive memory/history/photos. Export excludes photos; optional backup uses real passphrase-derived PBKDF2/AES-GCM. API secrets are server-only; paid calls fail closed and no paid/live provider result was obtained. Colour/ROI observations are heuristic photo descriptions. Skin type/concerns are self-reported; no disease, clinical phototype, hydration percentage or causal outcome claim is inferred.

## Unpassed mandatory gates

Genuine provider skin analysis, generated hair/clothing, original full morph/pattern scope, all accessory/body tracking, advanced agent/LookRemix/digital-twin scope, representative model/fairness validation, physical performance/device testing, commercial model/media rights and production API/deployment security remain incomplete/blocked. See FEATURE_MATRIX and REMAINING_WORK. All four repositories materially contribute actual code, with licenses/notices and limits in SOURCE_INTEGRATION_MATRIX; that does not make every upstream feature complete.

## Final command reconciliation

Recorded at checkpoint2026-11-02~10:30UTC. These are separate executed runs, not one invented aggregate:

| Command / environment | Actual result |
|---|---|
| `npm run typecheck` | Pass on current integrated strict TypeScript source |
| `npm run lint` | Pass,0errors/0warnings; generated Playwright traces are explicitly excluded |
| `npm test` | **97passed,15files** |
| `npm run build` | Pass; real asset graph/offline manifest generated |
| Full Chromium+mobile snapshot, `--output=test-results-checkpoint` | **46passed,2skipped** of48; skips are production-only offline cases |
| Latest explicit-focus + roving-tab regressions, Chromium/mobile | **8passed**; includes2new arrow-key cases beyond the full snapshot |
| Latest clear-data/profile import regression, Chromium/mobile | **2passed** |
| Built production product/offline suite, `--output=test-results-production-checkpoint` | **8passed**, no skipped cases; actual offline reload included |
| Complete headed Firefox snapshot | **20passed,1production-onlyskip** |
| Current Firefox explicit-focus/arrow-tab regressions | **4passed**; not represented as a new complete Firefox run |
| Final complete WebKit27.2 suite | **24passed,1production-onlyskip** of25 |
| Axe across13states×2viewports | **26scans,0automated violations**,52incomplete contrast occurrences for manual review |
| Taste production inspector1440/768/390 | **0FAIL,6WARN**, with2explicit context-specific allowances below |
| Real renderer/OpenCV/model harnesses | Passed with exact counters/limits in their retained reports |

Initial local source/integration checkpoint: `401d254`. Subsequent local verification fixes/evidence are in the next Git commit. No remote publication or paid provider request was made.

The production build currently reports ~694.8KB main JS (~216.6KB gzip), ~907.1KB lazy generic3D chunk (~248.6KB gzip) and ~15.5MB lazy OpenCV/WASM bundle (~3.9MB gzip). Optional CV is not precached or loaded at startup. Chunk-size warnings are retained as a performance improvement task, not hidden by raising the threshold. Upstream Zod annotation/OpenCV Node-branch externalization build warnings are dependency packaging messages; actual browser integration passes, but future dependency updates must recheck them.

Taste exceptions are narrow: `icon-chips` applies to actual pigment-region controls/selected tool marks, not decorative KPI tiles; `covered-text` applies to the mobile editor's intentionally pinned mirror above an independently scrolling inspector. Actual edit controls remain usable with the portrait visible, as independent screenshots/interactions establish. The6warnings remain visible: mixed italic emphasis, tracked wordmark, warm palette, pigment/portrait color share, small-but≥11pxsupport text and editorial title size. These choices follow the explicit beauty art direction; warnings are not converted into a9/10 visual claim. Production inspector stills at all3widths were opened and inspected; settled model-ready captures are in cook/stills/r04.

No reproduced critical/high defect remains in the verified local flows at this checkpoint. That statement is bounded by the executed tests and does not close incomplete full-product engines, unseen security issues, media/model rights or device/fairness gates.
