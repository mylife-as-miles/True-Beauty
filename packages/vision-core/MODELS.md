# MediaPipe model assets

The application downloads pinned official Google MediaPipe solution models. Source URLs, exact bytes, SHA-256 and download dates are in [manifest.json](../../apps/web/public/models/manifest.json). Run `npm run models` before an offline install.

| Artifact | Use | Bytes |
|---|---|---:|
| `face_landmarker.task` | Shared 478-point face, expressions, transform | 3,758,596 |
| `hair_segmenter.tflite` | Dedicated two-class hair inference when body is not requested | 781,618 |
| `hand_landmarker.task` | Two hands and debounced interaction gestures | 7,819,105 |
| `selfie_multiclass_256x256.tflite` | Background, hair, body-skin, face-skin, clothes, other | 16,371,837 |
| `pose_landmarker_lite.task` | Single-person 33-point image-plane pose | 5,777,746 |

Each model has an **explicit Apache License, Version 2.0 declaration in its official model card**. The Face Landmarker bundle's detector, mesh and expression components have separate cards. Exact card sources, hashes, licensing quotations and bundle mapping were independently audited in [RIGHTS_AUDIT_R06.md](../../docs/RIGHTS_AUDIT_R06.md) and [public-source-evidence.json](../../cook/evidence/rights-r06/public-source-evidence.json). This replaces the earlier unresolved model-card status; it does not clear upstream training datasets, model-card example photography, portrait likeness rights or every product-distribution dependency.

Full Apache text and attribution live in [docs/rights](../../docs/rights/). The download script copies `LICENSE` and `NOTICE.md` beside public model files. WASM/JS support files come from the installed `@mediapipe/tasks-vision` package and retain its license/notice. Models are unmodified; True Beauty changes the surrounding scheduler, temporal filtering, semantic compositing and geometric projections.

When body segmentation is requested, its real hair channel supplies the hair renderer, avoiding a second hair model invocation. Body and pose are lazy optional capabilities; explicit failures are reported and core cosmetic controls remain usable. Their behavior, model-card limitations, actual CPU evidence and unverified physical-device/fairness scopes are in [VISION_R06.md](../../docs/VISION_R06.md).

All inference is local appearance/interaction processing. Temporary face, hand and pose coordinates are not identity embeddings. This pipeline does not persist or transmit photographs, camera frames, geometry or masks.
