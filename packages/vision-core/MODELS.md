# MediaPipe model assets

Models are fetched directly from Google's official MediaPipe model buckets, not from the example repository's unaudited binary assets.

- Face Landmarker: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Hair Segmenter: https://storage.googleapis.com/mediapipe-models/image_segmenter/hair_segmenter/float32/1/hair_segmenter.tflite
- Hand Landmarker: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task

The MediaPipe repository and Tasks Vision package are Apache-2.0. Model downloads are official Google-hosted solutions assets; a separate model-card audit is still required before commercial distribution. Download source URLs, content hashes and retrieval date are captured in `apps/web/public/models/manifest.json`. No third-party demo portrait is bundled by this module. WASM/JS support files come from the installed `@mediapipe/tasks-vision` package and retain its package license/notice.

All inference is local and is nonmedical, appearance/interaction-only processing. Landmark coordinates are temporary visual geometry, never an identity embedding. The system does not persist camera frames or geometry.
