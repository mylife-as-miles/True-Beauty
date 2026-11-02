# Graphics dependencies

- OpenMakeupSDK revision `12c5a8023aab0fcec7eef4fbdc0d1a29cf9989dd`: adapted GLSL simplex noise, Fresnel/material logic and source-coordinate registration. MIT copyright Ehsan Moradi; full notice in `../shader-library/LICENSE.OpenMakeupSDK`.
- `@techstark/opencv-js` version `5.0.0-release.1`: optional, lazily loaded actual OpenCV WASM mask and weighted-composite engine. Apache-2.0; notice copied in `LICENSE.OpenCV`, complete runtime/package retained through lockfile and package distribution.
- `otdnnc/virtual-makeup` revision `1d6ed5ef2b1c947dcbc144fa9fde2a26b6745fc1`: `apps/web/src/lib/makeup/face.ts` studied for fillPoly/GaussianBlur/addWeighted workflow. No root repository license found. Its expressive source is not copied; the OpenCV backend independently implements documented public API operations. License clearance for source-copy integration remains unresolved. This does not claim that independent algorithm implementation satisfies the user's exact mandatory source-copy condition.
- MediaPipe Tasks Vision: landmarks and hair masks are supplied by Vision Core; renderer does not bundle or duplicate tracking. See the model manifest and vision source notes for model/runtime provenance.

No upstream bitmap makeup patterns, GLB morph models, portraits or third-party accessory assets are included in these graphics packages. Accessories are original procedural Canvas geometry, explicitly approximate.
