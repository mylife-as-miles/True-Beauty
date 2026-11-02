# Round 06 — one portrait, one complete styling scene

Implementation date: 2026-11-02. This records the local Dressing Room integration, not a claim of photorealistic garment draping or live clothing AR.

## Connected behavior

Dressing Room now uses the same session portrait as the Living Mirror. It no longer silently substitutes a separate sample person. Uploading a portrait here updates the shared session source; its Blob URL remains owned by the application and stays usable when returning to the mirror. No photograph is persisted by that navigation.

“Include current mirror look” defaults on. The actual BeautyRenderer processes the original person image with the current makeup, hair, accessories and creative lighting, then the existing garment compositor places the selected garment over that processed person canvas. Switching the checkbox off uses the original portrait. The original source image is never modified or replaced by this creative output, and Skin Lab continues to read the original pixels.

The garment remains a manually positioned static overlay. The initial placement starts below detected facial geometry when available, without claiming body shape, sizing or fit inference. Position/size/rotation/opacity controls remain available. Hair, jewellery, makeup and lighting follow their actual renderer/model capabilities; this integration does not upgrade them into medically validated or photorealistic predictions.

## Shared vision and lifecycle

- A matching `portraitVision` snapshot is reused for the shared portrait.
- Missing optional model results are requested through one coordinated still-image VisionEngine. Face inference is not repeated just to obtain hair, hand, body or pose data.
- A separate uploaded source receives one face inference. Cached geometry and masks support subsequent makeup, colour and garment edits without running face detection for every render.
- Source-keyed cache entries are bounded, model work is serialized, stale source/lifecycle results are rejected, and the engine/renderer are disposed on unmount. There is no continuous animation/inference loop for this static workflow.
- Live camera clothing fit is not implemented by this compositor. Its source is a session portrait, and its technology label remains “Static photo composition.”

## Saved complete-look receiver

The principal architect’s `activeOutfitId` now drives actual restoration in Dressing Room. The selected saved study is loaded once with validated colour/placement metadata. Async restoration checks the selected ID and source before applying results. Missing or malformed records retain the current portrait rather than silently switching subjects.

The shared portrait remains the target unless the user explicitly reopens an outfit with a retained, consented portrait asset. Blob URLs transferred to shared application state are not revoked by Dressing Room’s unmount. Garment URLs owned only by this view are released.

Saving an outfit sets its active scene ID. Editing garment parameters clears that saved identity until the user saves again, so a complete look does not silently link to outdated garment placement. Saving retains parameters by default; photo blobs require the explicit photo-storage option and current scoped consent in the same transaction. No raw camera frame, landmark snapshot or render canvas is written to IndexedDB.

The output canvas exposes inspection attributes for reproducible tests: `data-active-outfit`, `data-portrait-source`, `data-face-source`, `data-local-inferences`, `data-face-inferences` and `data-mirror-look`. The inference counters report local work at this component boundary; they are not a model-accuracy or FPS metric.

## Actual verification

All checks below ran against real Chromium browser rendering/model paths on cloud Linux, at desktop and iPhone viewport emulation. They do not establish performance or interaction quality on a physical phone/camera.

- Original Dressing Room upload/manual composition/save-without-photos/reload/restore/delete workflow: **2 passed**, desktop/mobile, 12.9 s.
- Designer’s Digital Twin → exact saved outfit receiver: **2 passed**, desktop/mobile, 5.1 s. Verified saved name “Midnight blue study,” colour #24395b, selected outfit ID and unchanged shared portrait.
- `tests/e2e/dressing-scene-r06.spec.ts`: **4 passed**, 31.9 s. Actual makeup, Copper hair, glasses and Golden lighting affected rendered pixels; disabling the current mirror look changed more than 1,000 pixels. Shared-source face inference remained zero through garment edits. A separate uploaded portrait incurred one face inference and remained usable on returning to the mirror. Skin’s canvas was compared channel-by-channel against a fresh original-image draw and had **zero differences** after creative grading.

Evidence: `cook/stills/r06-fashion/`, plus retained Playwright failure artifacts for the initial test-only decimal spelling correction. The first test attempt used `.fill(".65")`; native range filling requires `0.65`. That locator/value error was fixed; it was not an application failure. The final checks above all passed.

The compositor’s flat sample blouse and lack of draping/occlusion are visible in the captured images. They are not presented as generative VTO. Original screenshots and actual pixel checks were inspected; a successful build is not substituted for this workflow evidence.

## Critic-driven UX follow-up

The mobile placement controls now have a compact sticky canvas showing the current composition. It copies the actual output after compositing; it creates no additional renderer or vision model. Width/Rotation edits remain visible alongside the preview. A “View full composition” control returns to the full portrait. Opening or restoring a study reveals the full composition once after a ready draw; slider changes do not repeatedly scroll the page.

The current session’s generated-source provenance appears beside the main portrait and in the sticky preview. The provider footer now accurately distinguishes this manual canvas from the separate clothing-generation consent workflow.

Final scoped regression: **12 passed in 1.5 minutes**, desktop/mobile Chromium, including four new UX cases, four existing shared-scene/upload tests, two complete-look receivers and two variant/currency bag tests. TypeScript and owned ESLint checks passed. `tests/e2e/dressing-ux-r06.spec.ts` verifies that the mobile preview exactly matches a scaled draw of the main canvas, inference counters do not change on placement edits, generated-source labels survive edits/restoration, the portrait becomes visible after restoration, and no POST/image upload occurs during that provenance check. The provenance test uses already-generated synthetic receipt bytes and the actual app state entry; it is not a new provider request or evidence of a live submission journey.

Actual captures were opened and compared with the independent critic’s earlier mobile dressing captures: `cook/stills/r06-ux-followup/mobile-{width,rotation}.png` and `restored-{chromium,mobile}.png`. See `cook/reviews/r06-ux-followup.md` for the bounded verification record.

### Generated image export and retained-photo provenance

A generated-source PNG now includes a compact visible footer: **“AI-generated source · styled in True Beauty.”** Ordinary-source PNG output remains unchanged. The generated footer was opened and visually inspected in `cook/stills/r06-ux-followup/generated-composition-export-{chromium,mobile}.png`.

When the user explicitly grants local photo storage and saves a generated person asset, its provenance is stored as a strict closed object containing only `kind`, `provider`, `feature`, and ISO `createdAt`. Parameters-only saves include neither a person asset nor its source provenance. Restoring a retained photo validates the closed object before reopening it; malformed or expanded provenance rejects restoration instead of laundering that image into an ordinary original. Reopening a retained generated image uses the application’s `{restored:true}` source path, with no associated original. The fallback is explicitly “Use studio portrait.” Skin Lab continues to show its generated-image limitation and disables provider framing for this source.

Additional final targeted verification: **2 passed in 24.5s**, desktop/mobile. Tests prove ordinary PNG bytes match the canvas export exactly, generated PNG height adds the 56px disclosure with visible ink, exact provenance is saved beside one explicitly permitted photo, reload/restore retains its label with `originalPortraitUrl:null`, Skin framing is disabled, studio fallback is explicit, expanded metadata is rejected, and all those actions produce zero POSTs. These tests use the existing synthetic generated receipt bytes; no paid request, private-photo upload, provider or database module change occurs. The first attempt reached the Skin guard and then timed out on a stale test-only tab name; the corrected locator passed both final cases.

## Remaining work

Learned garment segmentation/matting, draping, fit, cloth lighting, body-aware occlusion and generative VTO remain separate engines and requirements. Scene metadata does not create a physically complete digital twin. Physical-device/representative-person rendering and performance evaluation remain unverified. The full product acceptance threshold remains unmet.
