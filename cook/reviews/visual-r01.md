# Independent visual critique — round 01

Date: 2026-11-02. **Subjective visual judgment: 7.0/10. The 9.0 visual bar is not met.** This is a UI/appearance review, not a measurement of functionality, tracking, privacy, performance, or full scope completion.

Read only `cook/BRIEF.md` and `docs/PRODUCT_SPEC.md` for requirements. Inspected the actual supplied desktop/mobile screenshots with `view_image`; opened the running app at `http://127.0.0.1:5173` in Playwright at 1440×1000 and 390×844, visited Hair and Style, and switched the three accessory previews on. No implementation source or self-assessment was read. Additional captures are in `cook/stills/critic-visual/`.

## What works

The cream sheet, muted wine accent, restrained borders, fine icons, and expressive serif heading create a coherent editorial beauty identity. Desktop hierarchy is clear: portrait first, looks second, active tools third. The main portrait is a real photographic asset with visible skin texture, rather than a generic illustration. Selected lip shade and selected finish are visually identifiable. Hair and Style reuse the same scene and panel structure, and labels honestly acknowledge the absent hairstyle-generation provider and illustrative accessory fit.

| Dimension | Subjective score /10 | Evidence / limit |
| --- | ---: | --- |
| Desktop composition and spacing | 8.3 | Calm three-column sheet; substantial portrait; consistent margins |
| Typography and legibility | 7.0 | Strong display type; numerous tiny low-contrast support labels |
| Pigment and accessory appearance | 6.2 | Existing photograph looks good; dramatic colored lighting impairs shade judgment; accessory drawing is visibly schematic |
| Interaction clarity | 7.2 | Clear panel groups and states, but numerous small mirror icons and a hidden-on-mobile look selector |
| Cross-space visual consistency | 8.1 | Studio Makeup/Hair/Style inspected; wider product spaces were not reviewed |
| Mobile usability | 5.8 | Clean stack with no visible horizontal clipping, but editing and preview are separated by a large scroll distance |

## Five highest-priority fixes

1. **Keep the portrait visible while adjusting mobile controls.** In `cook/stills/r01/studio-mobile.png`, the mirror occupies approximately y248–759; the shade grid begins near y1195, intensity near y1380, and finish near y1490. At a 390×844 viewport, neither the swatches nor intensity can be used while seeing the result. The mobile layout preserves desktop sections but loses the core edit/observe loop. Use a compact sticky portrait or a bottom sheet over the mirror, with tool controls sized for touch; test the visible result during slider drag.

2. **Restore mobile access to the complete look presets.** The desktop's four portrait cards at x109–303/y310–661 establish the signature complete-look object. That whole selector is absent from `studio-mobile.png`; Playwright also found no `Soft glowEveryday, elevated` button after switching to the mobile viewport. Put a current-look chip and an accessible preset tray beside the mobile mirror. Preserve a visible selected state. Also reconcile the desktop `01 — 06` counter with only four displayed cards, or make the additional two accessible and explained.

3. **Improve actual accessory appearance before describing the visual experience as premium AR.** In `cook/stills/critic-visual/accessories-on.png`, approximately x669–905/y421–592, glasses are uniformly thin yellow ellipses, earrings simple open hoops, and the necklace an unshaded line. They sit on a richly lit photograph without matching its depth, lighting, material response, or occlusion. The blue-lit glasses are still a flat yellow outline. Existing illustrative labels are appropriate, but do not make the rendering convincing. Add better product geometry/materials, proper bridge/temple placement, face/ear occlusion, and light-aware tone; otherwise present these as explicitly schematic accessory planning rather than polished try-on.

4. **Use a color-neutral default portrait for judging cosmetic changes, and capture real before/after evidence.** In both supplied screenshots, roughly half the face is saturated blue and the background is lavender. That is attractive campaign photography, but makes subtle foundation, blush and lip shades difficult to assess against the palette. The selected wine lip shade at 55% reads as a subtle warm natural lip under that lighting. A still cannot establish how much is source photography versus applied makeup. Supply a neutral-lit demo, preferably varied complexions, retain the editorial image as a selectable alternate, and show paired before/after captures at the same crop. No shader or material realism score of 9 is supported by this frame alone.

5. **Increase secondary text and small-control legibility.** In `studio-desktop.png`, look subtitles at x175/y357 onward, swatch metadata at x1139/y644, slider endpoint text near y743, source note near x109/y998, and the device-processing line at x329/y901 are very small and pale. The mobile frame improves primary controls but retains tiny pale processing text at y831 and low-contrast helper text throughout. Raise practical body/help text to a readable scale, strengthen muted colors, and give compact mirror icons larger hit areas and visible explanations on focus/tap. The desktop view reads beautifully at a distance, but the actionable details require scrutiny.

## Evidence and unverified areas

- Supplied evidence: `cook/stills/r01/studio-desktop.png`, `cook/stills/r01/studio-mobile.png`.
- Independently captured: `cook/stills/critic-visual/hair-desktop.png`, `style-desktop.png`, `accessories-on.png`.
- Hair panel explicitly says the generative hairstyle provider is not configured. No generated hairstyle evidence exists in these inspected states.
- Accessory states were switched on and visually inspected. Hair recoloring, makeup material changes, live camera tracking, hand gestures, skin-provider output, saved-state persistence, keyboard navigation, and reduced motion were not validated in this visual review.
- A green dot and “Face mesh connected” label do not demonstrate anchor accuracy or temporal stability. The displayed millisecond value is not an FPS measurement.
- No visual score here claims similarity to source-app screenshots; the brief states those frames were not obtained.

The next visual review should include the mobile editor while actively changing a shade, neutral-lit before/after makeup, close-up accessory occlusion, active hair recoloring, and one complete-look transition across product spaces. These captures are needed to judge improvement rather than crediting the polished shell for unseen behavior.
