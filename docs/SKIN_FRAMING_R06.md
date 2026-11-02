# Skin scan framing recovery — round 06

The actual provider returned `error_src_face_too_small` for the original synthetic skin fixture. Official recovery guidance asks for a frontal, complete face occupying **more than 60% of image width**, with forehead and chin visible. This change adds an explicit local preparation action; it does not silently change the session photograph, upload pixels, spend credits or save an image.

## Implemented workflow

In **Skin & care → Provider skin analysis**, upload an original session photograph and choose **Prepare scan framing**. The existing SkinLab vision engine supplies actual matching face landmarks, reusing the current observation when its source URL, epoch and image object match, or running face-only inference through that same engine on this user action. Missing/uncertain landmarks produce manual capture guidance. No second model pipeline or fabricated face geometry is created.

`packages/skin-engine/src/framing.ts` exports `planScanFraming({width,height,landmarks,targetFaceWidthRatio?})`. Successful plans contain integer, source-clamped crop bounds, output dimensions, observed face bounds/width fraction, resizing disclosure and limitations. Default target is 72% face width, with 12.5% of observed face height as vertical margin where the source permits it. Output short edge is at least 480 px and long edge at most 2560 px. Missing/nonfinite landmarks, clipped face edges, impossible aspect ratios and enlargement beyond 2× fail with specific guidance. Permitted enlargement is explicitly labelled as adding no skin detail. Cropping does not validate frontality, recover missing pixels or guarantee provider acceptance.

The browser draws the selected rectangle into a temporary JPEG canvas. It shows the **exact encoded image selected for upload**, labelled **Temporary cropped upload preview**, before the credit quote/consent controls. The preview's data URL and the submitted `imageBase64` are the same encoding. The main session image and local-colour sampling canvas remain unchanged. A **Use original upload image** action restores the original encoded selection. Reset is disabled during an in-flight provider operation.

Preparing/resetting/changing source invalidates the quote, both transmission/retention consents and credit authorization. Quotes bind to the current image revision/source epoch. Delayed crop encoding, model results and quote/task responses are discarded after source changes or unmount. Generated styling pixels remain excluded. The generated-source recovery button says **Restore original photograph** only when an original is actually available; otherwise it says **Use studio portrait**. Neither crop nor original is implicitly stored in IndexedDB.

## Executed evidence

- **16/16** skin-engine unit tests passed across two files, including four new numeric crop tests covering 72% framing, forehead/chin retention, source-edge clamping, malformed/missing landmarks, clipped edges, insufficient original detail, downscaling, enlargement disclosure and immutable input geometry.
- **8/8** new desktop/mobile Playwright tests passed. These execute actual local MediaPipe inference and isolate provider traffic with an explicitly mocked transport. They check preview/submission byte identity, output dimension bounds, unchanged source, quote/consent reset, late JPEG and quote source races, generated-source exclusion/restore, actual no-face inference/manual guidance, and no implicit media storage. They do not claim successful live API generation.
- **12/12** combined new framing and existing skin-region/lens/source-pixel regression cases passed. An expanded generated-source case also passed 2/2 desktop/mobile checks for a restored generated image with no associated original: it offers Use studio portrait, never a false reconstruction action.
- Whole-project TypeScript checking, scoped ESLint and owned-file whitespace checks passed. Screenshots were inspected at desktop/mobile sizes.

The parent operator independently reused this exact helper with 478 real detected landmarks on the original synthetic fixture. The plan cropped to 724×809 px without enlargement and observed a face width fraction of 0.71956845. Its explicitly authorized 9-credit provider retry **succeeded**, returning four genuine provider predictions (pore, redness, texture and moisture). This is execution/recovery evidence on a synthetic image, **not human skin accuracy, fairness, clinical validation or proof of actual physiology**. The receipt leaves actual billed credits unknown and billing unverified. No paid call was made by this implementation agent.

- [Live framing plan](../cook/evidence/r06-skin-003/framing.json)
- [Live operator receipt](../cook/evidence/r06-skin-003/receipt.json)
- [Desktop exact-crop UI](../cook/stills/skin-framing/prepared-chromium.png)
- [Mobile exact-crop UI](../cook/stills/skin-framing/prepared-mobile.png)
- [Browser contract tests](../tests/e2e/skin-framing.spec.ts)

```sh
npx vitest run packages/skin-engine/src
npx playwright test tests/e2e/skin-framing.spec.ts tests/e2e/skin-lenses.spec.ts --project=chromium --project=mobile
npx tsc --noEmit
npx eslint apps/web/src/components/SkinLab.tsx packages/skin-engine/src/framing.ts packages/skin-engine/src/framing.test.ts tests/e2e/skin-framing.spec.ts
```

Official error guidance: https://docs.perfectcorp.com/develop/error_codes.md. Provider source/licensing/retention and the independent paid execution remain documented in `docs/REMOTE_PROVIDERS_R06.md`; no model/medical assurance is inferred from one accepted task.
