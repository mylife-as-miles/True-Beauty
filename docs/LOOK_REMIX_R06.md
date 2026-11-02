# Look Remix — round 06

Date: 2026-11-02. Implemented an actual local, image-derived, editable appearance interpretation. It does not match filenames or user prose to canned looks, identify cosmetic products, synthesize a replacement face, perform garment segmentation, or generate hairstyles. Those broader requirements remain separate inventory items.

## API and ownership

- `packages/look-remix/src/index.ts`: `analyzeInspiration(source, options): Promise<RemixResult>`, pure `extractInspirationPixels(image, snapshot, sourceName)`, and immutable `correctRemixRegion(result, region, patch)`.
- `packages/look-remix/src/types.ts`: typed samples, normalized region bounds, pixel counts, measured versus corrected colours, confidence/quality indicators, source metadata, spatial palette, warnings, and structured `MakeupLook`.
- `apps/web/src/components/LookRemix.tsx` / `.css`: source/target interpretation workspace. Required props: `portraitUrl`, `onApply(look)`, `onReturnToMirror()`. Optional props: `referenceImageFile`, `targetSnapshot`, `onResult(result)`.
- Root App/navigation/shared-store integration belongs to the principal engineer. Component code does not import the database or shared application store.

A supplied `options.snapshot` must correspond to the **reference source**, not the target portrait. In the absence of a reference snapshot, the API creates one coordinated Vision Core engine for face, hair and hands, analyzes one bounded-resolution source canvas, and disposes the engine. The result does not include facial landmark arrays, masks or pixel buffers.

The UI independently decodes the target portrait for preview. A non-null `targetSnapshot` uses existing shared target geometry; `null` waits without loading another model; `undefined` permits one standalone target-image analysis. Source and target are distinct images, so a standalone harness uses two coordinated analyses total, one for each image. Six effects do not trigger six face models. No image is assigned to the parent's target URL.

## Actual extraction

1. Browser-decode a supported reference image; UI accepts JPEG, PNG, WebP and AVIF files under 20 MB. Reject oversized decoded sources and bound extraction to a maximum side of 1,024 pixels by default; the public resolution option is constrained to 128–2,048 pixels.
2. Verify finite, in-frame facial geometry with a nontrivial face extent. Missing or unusable geometry produces **palette-only**, with every facial and hair layer off. Cropped/turned/small faces reduce reliability or become unavailable.
3. Sample the actual outer-lip polygon **minus the inner-mouth polygon**, excluding teeth/tongue rather than reading a dominant whole-photo colour. Sample eyelid-to-brow bands minus eye polygons; sample paired landmark-anchored cheek ellipses and separate small skin-reference regions.
4. Exclude transparent/extremely clipped pixels, high-confidence hair overlap, and convex hulls of detected hands. This is an approximate hand occlusion check; glasses, veils, tools, unusual makeup and other occlusions are not comprehensively classified.
5. Accept hair pixels only above 0.85 mask confidence, outside the face, with plausible mask coverage and a usable face anchor. No mask means no inferred hair shade. An implausible full-frame mask is rejected and does not erase otherwise valid facial samples. Segmentation alone does not establish the presence of hair.
6. Use deterministic bounded colour clustering, with regional sample counts and clipped/occluded fractions. Exposure, clipping, resolution, local sharpness, geometric size/asymmetry, regional sample coverage and dominance influence warnings/heuristic quality. Quality numbers are **not calibrated probabilities** or model validation results.
7. Keep skin as an explanatory reference. It never silently becomes foundation or alters the target complexion. Natural skin texture and the target face remain supplied by the actual original image.
8. Start eyelid/cheek layers off when their measured colour has little separation from the skin-reference sample. This does not establish whether cosmetics were present. Lip highlight variation may suggest gloss at low confidence; lighting can produce the same variation. Other matte finishes are editable preview defaults, not inferred physical materials.
9. Extract a separate face-scaled crop beneath the chin as a **lower-image / possible outfit palette**. It can include arms, surroundings and shadows. With no face, the scope is explicitly the whole image. It is never described as garment segmentation or virtual try-on.
10. Construct a fresh structured look from measured/corrected lip, eyelid, cheek and hair samples. Unmeasured cosmetic layers stay off; no facial reshaping is applied. Corrections retain original `measuredColor`, pixel evidence and bounds while marking the current choice as user-corrected. Palette buttons apply to the selected cosmetic region, with an explicit target label; selecting the skin reference instead targets lips, never foundation.

## Functional interface

The reference remains visible beside the target expression. Region swatches select a contextual inspector and real source sampling bounds. Users can correct shade, opacity, finish and layer inclusion; the preview renders through the actual `BeautyRenderer`, including its labelled approximate Canvas material behavior. Comparison uses the renderer's real original/edited split; its boundary follows the contained image, preserving aspect ratio and target framing. Apply calls the provided callback with the actual edited look. Return calls the mirror callback. Neither action claims that a look has been saved.

The original reference-informed design follows Proofline's anchored selection→context→return behavior and Common Table's continuity between selected physical objects and their actions. The implementation is original. Previously audited reference paths: Proofline `src/components/reader/Lens.tsx` at `0681aeef8f51c3c81b8b548db2d9e58fcb4d5710`, Common Table `src/components/{ImmersiveMap,MenuBook,Waiter}.tsx` at `47b6488aa1895eeff405b0732022316d958ac996`. No restricted Proofline code/assets or Common Table vendor assets are copied. See `CANVAS_UX_ROUND05.md` and `DESIGN_RESEARCH.md` for full licensing distinctions. Taste/Cook's reference, interaction, actual-capture and repeat-critique workflow is applied here.

## Privacy and rights

The component creates session object URLs for uploaded references, revokes only URLs it owns, cancels stale results, and releases them on replacement/unmount. It does not revoke the parent-owned target URL. It never requests a camera, sends a photograph, invokes a paid provider, writes IndexedDB, or stores images/face geometry in the result. Local models/WASM load from the application's origin; model downloads are not image uploads. `onResult` contains derived appearance colours and a source filename and must remain ephemeral unless the parent obtains the applicable save consent.

The two existing demo photos are `/images/portrait-2.jpg` (Unsplash `photo-1524504388940-b1c1722653e1`) and `/images/portrait-3.jpg` (Unsplash `photo-1531123897727-8f129e1688ce`). The target is the existing latter portrait. Their Unsplash license permits image use/modification but independent model-release/publicity metadata remains unresolved. These are evaluation references, not a licensed model-validation dataset, user transformation evidence, endorsements or training data. Commission released references or complete the rights review before a public product launch. Full URLs and limitations remain in `ASSET_PROVENANCE.md`.

The extraction module is original project code using existing internal source-adapted utilities:

| Utility | Existing source provenance | Reuse in this module |
|---|---|---|
| `skin-engine/src/sampling.ts::clusterColors` | Skyn `f4e1ffe5c1e6542cea8e18e5b50a54717f4b41d1`, MIT, notice retained in source | Deterministic regional colour clustering |
| `skin-engine/src/color.ts` | MIROIR `f3c0661cb0594fff07e89c80fbe129e7e5bdffa5`, MIT, notice retained | sRGB/hex and CIELAB colour separation |
| `face-tracking`, `vision-core`, `ar-renderer` | Existing audited Virtual Makeup / OpenMakeupSDK hybrid; see `SOURCE_INTEGRATION_MATRIX.md` | Actual shared face/hair/hand inference and actual target makeup compositing |

No additional model weights, image-generation projects, datasets or third-party assets are introduced by Look Remix.

## Executed evidence

`npx vitest run packages/look-remix/src/remix.test.ts`: **17 fixture cases pass**. Synthetic tests verify lip polygon versus dominant blue background, white-mouth exclusion, real regional colours, separated hair/outfit sampling, no-face fallback, absent and implausible hair masks, hand-covered lips, dark-image uncertainty, immutable corrections/validation, skin-reference preservation, malformed/cropped geometry, and six synthetic skin-reference colours. These test algorithm behavior, **not** model accuracy/fairness across people.

`node cook/stills/remix-r06/verify-remix.mjs`: actual Chromium 156 on desktop 1,440×1,000 and mobile-sized 390×844 with reduced motion. Evidence in `cook/stills/remix-r06/remix-report.json`:

- Genuine source analysis sampled lips `#B16E6F` (897 pixels), eyelids `#805B4B` (742), cheeks `#B48370` (1,339), skin reference `#D1A291` (88), hair `#3D2E20` (559) for the torso-framed reference. No preset look was selected.
- One worker analysis for the target plus one for the reference; zero main-thread fallback runs in that capture. Source interpretation took about 1.35 seconds in this warm-asset virtual environment.
- Actual target canvas pixels differ after extraction. The target URL remains `/images/portrait-neutral.jpg`. Correcting lips to `#943356` with gloss produces that exact applied callback state; comparison and return callbacks execute.
- A private synthetic PNG without a face remains whole-image-palette-only, with facial/hair layers off. **Zero POST requests**, zero IndexedDB databases created in the isolated component context, no document overflow and no uncaught page errors.
- Automated WCAG A/AA/2.1 AA checks returned zero violations. Follow-up inspection found two unsupported generic-div labels in incomplete checks; explicit group/region roles were added. Source overlay contrast is manually inspectable against its opaque pale label background; automated image-background checks may remain incomplete.

Screenshots were opened for actual visual review: `remix-desktop-result.png`, `remix-desktop-corrected.png`, `remix-mobile-result.png`, `remix-mobile-corrected.png`, `remix-mobile-no-face.png`. Supporting text was raised to at least 11px and mobile upload/demo controls to at least 44px after critique. Reference and target bounding overlays preserve their contained aspect ratios.

Environment: Linux x86-64 virtual KVM container, five exposed AMD EPYC 9V74 CPU cores, Chromium 156 headless. These are still-image timings, not physical-phone benchmarks or real-time FPS claims. Firefox/WebKit/physical-device verification is not established by this evidence.

## Defects found and corrected

The initial private no-face PNG test exposed a real segmentation failure: the model labelled a flat colour image as hair. Extraction now requires a usable face anchor and plausible mask coverage before using hair results. A regression fixture preserves this case. An initial browser selector exposed an ambiguous native select label; the finish and presence controls now have explicit contextual accessible names. No failed attempt is counted as successful evidence.

## Remaining limits

This is an appearance-based colour interpretation with explicit correction, not validated reverse rendering, source makeup identification, learned material estimation, artistic pattern extraction, hairstyle reconstruction, clothing reconstruction or generative complete-look transfer. Strong lighting, textured products, hair overlap, occlusion and complex editorial makeup can still produce inaccurate swatches. The palette's crop is not semantic garment detection. The original complete product acceptance gate remains unmet until the broader matrix and independent quality gates are satisfied; this round does not certify a 9/10 product.

Main-application route, mirror-state handoff and unavailable-model coverage are recorded in `tests/e2e/remix.spec.ts`; execution results will be appended once the principal's App route is integrated. The isolated component evidence above is not substituted for that integration check.

## Actual application integration result

The principal integrated the real `Look Remix` navigation route and Studio entry, forwarding existing source-matched target geometry where present. Apply updates the shared mirror look while leaving Remix open; the separate return action opens the makeup atelier. Personal source/result data is not automatically saved.

`npx playwright test tests/e2e/remix.spec.ts --workers=1 --output=test-results-remix-r06` established **six passing normal cases** across desktop/mobile: real image-derived extraction/correction/apply/return, unchanged target image, actual visible mirror shade/finish, private image non-retention/zero POST, and selected-region palette handoff. Assertions inspect the rendered target, real mirror source attribute and visible colour/finish controls; they do not dynamically import a potentially different HMR store instance as application-state evidence.

The initial two forced missing-model cases did not block models because the application's service worker served them outside Playwright's page-route interception. This was a test setup failure, not proof that the offline fallback failed. The failure boundary now explicitly blocks service workers for those two cases and routes model requests at the browser-context level. `npx playwright test tests/e2e/remix.spec.ts -g 'unavailable local models' --workers=1 --output=test-results-remix-r06-fallback` passed **both cases**. All eight intended desktop/mobile workflows therefore have passing evidence; the failing first attempt remains recorded in its original output directory.

Actual-app screenshots: `cook/stills/remix-r06/app-desktop-corrected.png` and `app-mobile-corrected.png`. The isolated capture report and `axe-details.json` remain distinct from full-app evidence. A final compared desktop state has one incomplete image-background contrast category for the comparison labels; the un-compared result state and reduced-motion mobile state have zero incomplete categories. No automated violations were found. Incomplete checks are not counted as passed.

`verify-remix-edges.mjs` additionally analyzed the second real portrait and a genuinely blocked-model source. The second reference produced different measured region colours, lower quality on its turned face, and no POST requests. Low-quality derived layers start off until reviewed. Its results are evidence of source dependence, not accuracy validation. Blocked models produce unavailable facial/hair samples, a whole-image palette and a truthful local-tracking warning. See `remix-edges.json`, `remix-second-portrait.png` and `remix-missing-models.png`.

Final scoped ESLint and full TypeScript checks pass; 17 algorithm fixture tests pass. The full product's independent acceptance gate remains separate and unmet by this isolated capability.
