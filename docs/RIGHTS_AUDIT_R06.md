# Distribution-rights audit — round 06

Audit date: 2026-11-02. **The overall distribution gate remains blocked.** This is a source/evidence inventory, not legal advice, a commercial launch approval, or a claim that software license implies training-data, photo/model-release or personality rights. No third party was contacted, no issue/PR was posted and no assets were published by this audit.

## Concrete progress: model-specific licenses recovered

Seven official Google model-card PDFs were fetched with HTTP 200 and extracted with `pdftotext`. Each explicitly states **Apache License, Version 2.0** for the model. This is independent evidence from the actual model cards, not inference from the Apache-licensed SDK or a documentation-page footer. The official solution pages link these cards with the downloaded models.

| Downloaded artifact                | Official card evidence                                              | Status                                                                   |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `face_landmarker.task`             | BlazeFace short-range detector + Face Mesh V2 + Blendshape V2 cards | Model-specific Apache 2.0 declaration documented for bundle constituents |
| `hair_segmenter.tflite`            | Hair Segmentation card                                              | Model-specific Apache 2.0 declaration documented                         |
| `hand_landmarker.task`             | Hand Tracking Lite/Full card                                        | Model-specific Apache 2.0 declaration documented                         |
| `selfie_multiclass_256x256.tflite` | Multiclass Segmentation card                                        | Model-specific Apache 2.0 declaration documented                         |
| `pose_landmarker_lite.task`        | BlazePose GHUM 3D card                                              | Model-specific Apache 2.0 declaration documented                         |

Exact source URLs, downloaded PDF SHA-256, HTTP status and short licensing quotations are retained in `cook/evidence/rights-r06/public-source-evidence.json`. Exact versioned binary URLs/hashes remain in `apps/web/public/models/manifest.json`; all five local binaries matched those hashes in the executed inventory. Full Apache 2.0 text and attribution are retained in `docs/rights/Apache-2.0.txt` and `MEDIAPIPE_MODELS_NOTICE.md`; self-contained public copies accompany models as `apps/web/public/models/LICENSE` and `NOTICE.md`. Retain the license/upstream notices, document modifications, and provide required notices with any actual distributed build. This source inventory does not establish that an arbitrary deployment pipeline includes all required notices.

Official model-card sources:

- https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20-%20Hair%20Segmentation.pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Hand%20Tracking%20(Lite_Full)%20with%20Fairness%20Oct%202021.pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Multiclass%20Segmentation.pdf
- https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf

The PDFs' example images/training datasets are not automatically licensed by a model-weight declaration. This audit retains minimal quotations and receipts, not redistributed full PDF example photography. The cards' own out-of-scope/limitations/fairness statements remain relevant. Their historical group evaluation does not validate current True Beauty inference or authorize clinical phototype inference from selfie pixels.

## Four mandatory code sources

| Source / pinned commit                                    | Checked evidence                                                                                                                                                                                                      | Status                                                                                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OpenMakeupSDK `12c5a8023aab0fcec7eef4fbdc0d1a29cf9989dd`  | Complete MIT notice, copyright 2026 Ehsan Moradi; retained `packages/shader-library/LICENSE.OpenMakeupSDK`                                                                                                            | Code notice documented; separately unaudited upstream raster/GLB assets remain unused                                                                                          |
| MIROIR/SKIN_AI `f3c0661cb0594fff07e89c80fbe129e7e5bdffa5` | Complete MIT notice, copyright 2026 MIROIR; retained `packages/skin-engine/LICENSE.MIROIR` and other adapted packages                                                                                                 | Code notice documented; provider service terms/credentials independent                                                                                                         |
| Skyn `f4e1ffe5c1e6542cea8e18e5b50a54717f4b41d1`           | Complete MIT notice, copyright 2025 RANDON; retained `LICENSE.SKYN` in adapted packages                                                                                                                               | Code notice documented; original datasets/classifier weights remain unused/uncleared                                                                                           |
| Virtual Makeup `1d6ed5ef2b1c947dcbc144fa9fde2a26b6745fc1` | Pinned README HTTP 200 says “MIT — see LICENSE”; live GitHub `/license` HTTP 404. Full available public history fetched: 2 commits (`1d6ed5e…`, `2955d92…`), no LICENSE/LICENCE/COPYING/NOTICE path in either/history | **Unresolved full standalone copyright/permission notice.** Declaration and attribution retained; do not manufacture a missing notice or claim complete distribution clearance |

Future resolution of Virtual Makeup's notice needs authoritative upstream licensing evidence or an explicit legal/rights decision. A README declaration is recorded as evidence without silently replacing the missing text. No unvalidated Skyn classifier or scraped dataset is made commercially deployable by its code license.

## Fonts, portraits and other media

- Self-hosted DM Sans and DM Serif Display retain full SIL OFL 1.1 notices, with actual font-file hashes in the inventory. Renaming an asset file is not permission to remove reserved-font-name/license conditions or sell a font alone.
- Existing three Unsplash portraits (one duplicate filename) have CDN provenance and prior Unsplash license attribution in ASSET_PROVENANCE. Complete photographer/subject-release/personality-right review is still missing. Fresh `/license` and `/terms` fetches returned 401 challenge responses, not usable legal documents; the challenge JavaScript's own license text is **not** Unsplash photo licensing evidence. One help URL redirected to API guidelines and is not substituted as a photo license. No model release, endorsement, clinical dataset or commercial likeness permission is invented.
- Proofline's restricted MIT scope/Gloss exclusions remain; no source/assets were copied for its interaction principles. Common Table, Taste and Cook reference use is described in DESIGN_RESEARCH; original source licenses do not clear every third-party asset in those repositories.
- Generic True Beauty mark, product/garment SVGs and original UI remain project-authored. Merchant price/product facts do not grant packshot/photo or bulk-database reuse rights. Paid provider output licensing and retention must be separately checked against the applicable account terms.
- Direct installed dependency SPDX/version metadata is recorded by the inventory. This does not complete a transitive/bundled WASM/OpenCV/third-party dependency-notice audit or guarantee that production `dist` carries every required notice.

## Two additional evaluation-only full-body fixtures

Official NASA API records and media policy were fetched with HTTP 200 for `iss040e006091` (2014 Reid Wiseman treadmill stride) and `iss018e030096` (2009 Sandra Magnus harness/treadmill). Source records, photographer where actually supplied, image hashes and policy receipt are retained in `cook/evidence/rights-r06`. Images were visually inspected and supplied to the CV engineer for factual non-training pose/occlusion QA.

NASA's official policy says its content generally is not subject to US copyright and may be used factually for educational/informational purposes without implied endorsement, with attribution and explicit third-party/employee/likeness restrictions. These fixtures use that stated policy basis; they are **not labelled CC0**, not beauty marketing/demo portraits, not endorsement, not representative fairness data and not certified upstream training holdouts. Do not tune the model to these application holdouts and then call them independent evaluation. Their exact permitted purpose/limits are in `nasa-evaluation-annotation.json`.

Source policy: https://www.nasa.gov/nasa-brand-center/images-and-media/

## Reproducible technical inventory

```sh
node scripts/audit-distribution.mjs
```

The script rejects absent or hash-mismatched models, non-versioned/unofficial source URLs and missing model-card license receipts. It checks required content in retained code/font/model notices, including the adjacent public model LICENSE and NOTICE, plus actual font hashes and direct-package SPDX metadata. Isolated filesystem tests verify corruption, omission and truncated-license failure modes; their synthetic receipts are never retained as real rights evidence. The current run reports **5/5 model license/source records and 10/10 retained notices**, with no missing known notice file. A script exit 0 means its technical checks passed; its JSON explicitly keeps `distributionClearance:"blocked-with-evidence"` for the unresolved upstream notice, portrait/release and broader audit scopes. It never treats a passing test as legal clearance.

Final root integration, commercial/provider agreements, production notice packaging and any actual publication require their own evidence. No deployment/push is performed by this work.
