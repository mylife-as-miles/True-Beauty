# Skyn source integration

- Repository: https://github.com/Randon-Myntra-HackerRamp-21/Skyn
- Inspected commit: `f4e1ffe5c1e6542cea8e18e5b50a54717f4b41d1`
- Software license: MIT, Copyright (c) 2025 RANDON; full notice in `packages/skin-engine/LICENSE.SKYN` and `packages/beauty-intelligence/LICENSE.SKYN`.

| Original path | Actual destination | Reused algorithm and improvements |
|---|---|---|
| `backend/models/skin_tone/skin_detection.py` | `packages/skin-engine/src/sampling.ts` | Migrated K-means colour clustering loop and dominant cluster selection to bounded deterministic TypeScript. Original HSV/YCrCb hardcoded thresholds could exclude complexions; replaced region membership with actual MediaPipe landmark-defined facial ROIs and excluded clipped pixels only. Skin/hair pixel clusters remain descriptive photo colours, not skin type, ethnicity, clinical phototype or identity. Hair requires an actual segmentation mask. |
| `backend/models/recommender/rec.py` | `packages/beauty-intelligence/src/recommendations.ts` | Migrated source one-hot skin-type/concern encoding and cosine similarity ranking from Python/pandas/sklearn to pure TypeScript. Fixed source indexing confusion that treated acne as a skin type. Added finite-vector validation, deterministic ordering, user-attributable explanations, explicit avoid-ingredient exclusion, owned-product priority, known-currency pricing and combined-routine budget accounting. |
| `backend/models/skin_tone/skin_tone_knn.py`, `backend/app.py`, `backend/tests.py` | Research only | Reviewed selfie/tone classifier acquisition and route patterns. Did not deploy the KNN or models as reliable predictors. User self-report and manual correction are authoritative in Skin Lab. |
| `backend/models/acne_model/`, `backend/models/skin_model/` | Not deployed | TensorFlow model files are present in the source. Independent training-data consent/license, evaluation, demographic performance and calibration evidence was not established. A code license alone does not validate or separately clear model weights/data. |
| `backend/models/recommender/final.csv`, `makeup_final.csv`, tone dataset CSV | Not copied | Data provenance, merchant freshness and dataset rights not independently established. Adapted recommender accepts True Beauty's explicitly labelled sample catalogue instead of reusing these scraped records. |

## Verification

`packages/skin-engine/src/skin.test.ts` checks deterministic dominant-cluster recovery for both deep and light colour fixtures, no inference without face geometry, quality flags for dark/blurred images and no clinical classifier output. Additional synthetic light/deep warm/cool colour fixtures at 0.5× and 1.3× exposure demonstrate finite arithmetic and materially changed colour descriptors; this documents lighting sensitivity rather than claiming invariance. `packages/beauty-intelligence/src/intelligence.test.ts` checks source-derived cosine semantics and one-hot encoding, owned priority, avoidance filtering, zero-budget owned-only routine assembly, missing-currency exclusion and combined budget ceilings.

These tests verify code behavior on synthetic fixtures. They do not constitute validation of real-world skin segmentation across people, diverse camera hardware, illumination, makeup or skin conditions. Live appearance classifier deployment remains blocked on independently licensed data and evaluation.

## Operational UI contribution

Skin Lab invokes the adapted clustering on actual detected facial regions, lets users correct the resulting swatches, builds actual local routines using the adapted recommender, saves explicitly approved no-photo observations and supports local history deletion. No raw camera frame or face embedding is persisted by these functions.
