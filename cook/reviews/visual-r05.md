# Independent visual review — round 05

**Subjective visual/interaction judgment: 8.4/10. The 9.0 bar is not met.** This is an independent appearance and interaction review, not a functional-completeness, tracking, security, fairness, or performance certification.

Reviewed the running app at `http://127.0.0.1:5173` in Chromium at desktop **1440×900**, laptop **1366×768**, tablet **768×1024**, and mobile **390×844**. Operated the controls and inspected actual screenshots using `view_image`. Compared the supplied round-04 desktop/mobile/edit screenshots with round-05 supplied and independent captures. No round-04 written visual review was present, so no previous numeric score is invented. No implementation source was read or edited.

The app changed during this review. Findings below distinguish the final verified state from defects fixed during the inspection. Final captures and interaction evidence are in `cook/stills/r05-visual/`.

## What the final UI achieves

The original cream, wine, fine-border and editorial-serif identity remains coherent. It is now recognizably an interactive beauty workspace rather than merely an attractive landing page. The portrait leads; the selected complete look, pigment controls, material studies and anchored face lens give the surrounding UI a specific purpose. Lighting is restrained image treatment, without a generic neon glow or excessive glass effects.

Compared with round 04, the first mobile frame gives substantially more space to the working mirror and tools, and the gallery is a real six-look interaction rather than an unexplained count. **F enters Focus; Escape leaves it.** The same scene remains available with the navigation/header removed. This is a useful immersive mode, not just a larger decorative image.

The final six-look gallery has visible previous/next arrows. On mobile, Next now keeps the sheet open, applies the next look with a visible selected card, and leaves **See in the mirror** available. The earlier modal-closing arrow behavior and toast covering this CTA were both fixed and rechecked. See `mobile-gallery-final.png`. The six looks are also reachable through the native selector; Studio violet was applied in the actual app.

Tapping the portrait's lip region opens a small anchored lens showing the pigment, `55% · Gloss`, an edit affordance, and close control. This connects the object being changed to its tools. See `desktop-context-lens.png`.

All four Light modes were selected. The direction pad appears for a non-Original mode; dragging it and pressing ArrowLeft changed the reported direction from **(-35, -45) to (50, 40)**. The portrait stayed visible during mobile light adjustment. The creative-preview limitation is stated. See `light-{daylight,golden,moonlight}.png` and `mobile-light-direction.png`.

Mobile shade 5, intensity **88%**, and Glitter were operated with the portrait still visible. The independent tool scrolling is functional. Default document widths matched each viewport; no horizontal document overflow was observed in these four sizes. These are viewport checks, not physical-device validation.

The newly added **Full portrait / Fill mirror** control works. Full portrait restores the hair and clothing context previously cropped from desktop/laptop views. See `laptop-full-portrait-final.png` and `mobile-full-portrait-final.png`. The access problem is resolved; the proportional tradeoff remains below.

Skin Lab now preserves the same subject as Studio. Local color reading completed, produced editable sampled swatches and a labeled styling suggestion, and its skin/hair/eyes lenses changed the zoom and region context. The corrected eye ring appears centered on the iris in the final mobile and centered desktop captures. This supersedes the earlier upper-lid marker defect. See `skin-eyes-mobile-final.png` and `skin-eyes-centered-final.png`.

## Scores — subjective, not acceptance measurements

| Facet | /10 | Reason |
| --- | ---: | --- |
| Original editorial identity | 8.8 | Coherent, calm and clearly beauty-specific |
| Composition and proportions | 8.6 | Strong portrait hierarchy; full-portrait letterboxing and a heavy overlay toolbar remain |
| Typography and legibility | 8.3 | Good display/body distinction; compact metadata and panel affordances still need attention |
| Immersion and contextual interaction | 8.8 | Working Focus mode, face lens, light direction and persistent subject |
| Six-look discovery and state clarity | 8.5 | Working previews/selection; strongest differences are still difficult to compare in small desktop thumbnails |
| Responsive editing | 8.5 | Actual edit/preview loop works across checked sizes; nested scrolling needs clearer cues |
| Detailed cosmetic appearance | 7.8 | Real pigment/material changes, but mask-edge and reflection realism remain below premium photographic work |
| Balanced cosmetic appearance | 6.9 | Useful approximation; backend hue divergence currently affects shade confidence |

## Strongest remaining weaknesses, in priority order

1. **The same pigment changes shade family between rendering modes.** In the actual app, `#AE4C8B` at 90% reads brick/red in Balanced mode and vivid purple in Detailed materials. Compare `balanced-matte.png` with `detailed-matte.png`. This is more than a difference in reflective detail. It affects the promise that a selected shade represents the same look across modes/devices. Match the pigment hue/tone behavior before treating finish approximation as the only difference. Earlier files named `shader-*.png` captured this Balanced path despite their filename; the correctly named `balanced-*.png` copies are the comparison evidence.

2. **Detailed cosmetics are visibly processed at stronger settings.** The purple lip has a crisp, relatively uniform boundary and flatter upper-lip shading than the surrounding textured photograph. Gloss adds a plausible textured lower-lip reflection; Glitter shows fine speckles; Shimmer is much less distinct. These are real differences, but the material swatch thumbnails suggest a richer range than the actual facial result. Refine edge feathering, lip-volume/light response and material differentiation. The supplied macro sheet supports this observation, and it was also independently reproduced in the app.

3. **Framing now offers access but not yet an ideal contextual composition.** Fill mirror gives a strong face crop but excludes the top of the hair and much of the accessories/clothing context, particularly on laptop. Full portrait restores the subject but leaves a narrow central image inside a very wide frame: in `laptop-full-portrait-final.png`, the image occupies roughly x525–805 inside x317–1013. The large cream control bar still crosses the lower portrait. Consider a more purposeful full-look frame or task-sensitive framing, with a lighter toolbar treatment, while retaining the user's framing choice.

4. **Laptop and mobile secondary controls rely on scrolling that is easy to miss.** In `laptop-final.png`, the right panel ends around intensity; Finish, More layers and preview quality are below the independently scrolling panel. In `mobile-final.png`, the second pigment row is clipped at the panel boundary. These controls are reachable, and scrolling preserves the mirror, but the UI needs a stronger continuation cue. A subtle persistent scroll hint or clearly bounded tool tray would make progressive disclosure feel intentional. Desktop small look previews are also weak tools for comparing subtle finish changes; retain the larger sheet as the primary comparison view.

5. **Lens activation must keep the selected feature visible.** During the final inspection, selecting Eyes from below the portrait could leave the zoomed eye above the viewport; `skin-eyes-final.png` records the actual scrolled result. `skin-eyes-centered-final.png` was captured after explicitly scrolling the portrait into view and proves the corrected marker placement. Automatically bring the selected region into view after lens activation. The implementer indicated that this cleanup was in progress; it is not credited as verified until recaptured without the reviewer's manual scroll.

## Rendering evidence and limits

The review initially encountered the adaptive **Balanced Canvas** path, including in a browser where WebGL2 was available. This was deliberate software-GPU adaptation, not evidence of a broken shader integration. Opened Preview quality, selected **Detailed materials**, and independently verified `.mirror-frame` reported **`data-renderer="webgl2"`** before and after capturing all four materials. The near-Finish **Enhance detail** affordance is now present, improving discovery.

Independent verified WebGL2 captures: `detailed-{matte,glossy,shimmer,glitter}.png`, selected `#AE4C8B`, 90% intensity. Chromium used ANGLE SwiftShader flags; the software rendering resolution was bounded, so softness in those large screenshots must not be generalized to hardware rendering. The supplied `cook/stills/r05-materials/shader-finishes.png`, `canvas-finishes.png`, `before-after.png`, and `lighting-presets.png` were also inspected. The macro shader sheet clearly demonstrates pigment and material differences; it does not by itself establish live tracking accuracy, natural motion, or performance.

No real camera session, physical mobile device, hair recoloring under motion, hand gesture reliability, external provider, keyboard audit, reduced-motion audit, or full cross-browser test was performed for this visual review. The millisecond label is not FPS evidence. None of these unverified areas is assigned a passing quality score.

## Separate preliminary canvas observation

The current inspiration canvas has a materially richer, tactile composition: original portrait, note, palette and illustrative product are arranged as spatial paper objects with an adjacent contextual area. `canvas-desktop-current.png` is a preliminary capture. The design agent was still integrating pan/lens work; its final interaction quality is excluded from the final Studio/Skin judgment above. No similarity to unseen source-app frames is claimed.

## Bounded final recheck — 2026-11-02, 12:01 UTC

**Overall subjective judgment remains 8.4/10.** This addendum supersedes the now-resolved findings below; the earlier captures remain a record of the reviewed intermediate state.

- **Backend hue divergence is resolved in the supplied actual-app comparison.** Visually inspected `cook/stills/r05-materials/app-parity/{balanced-matte,detailed-matte}.png`: both now show the same purple shade family for `#AE4C8B` at 90%. The accompanying report records a maximum sampled RGB-channel difference of approximately 1.095/255; that figure is supplied measurement evidence, not independently recomputed here. This retires weakness 1 and its hue-related penalty. Balanced cosmetic appearance is now approximately **7.7/10** subjectively. Reflective detail and high-opacity edge realism still differ from premium photographic makeup.
- **Eyes activation now keeps the feature visible.** Independently repeated local reading and Eyes activation at 1366×768, with no subsequent manual scroll. The eye region remained inside the viewport, around y498–542. See `skin-eyes-auto-visible-recheck.png`. Also inspected the supplied desktop/mobile in-viewport captures. This retires weakness 5.
- **The large lower mirror bar is replaced by separated floating capsules.** `laptop-bounded-recheck.png` confirms substantially less portrait obstruction. Full-portrait letterboxing remains a composition tradeoff rather than an access defect.
- **The scrolling continuation cue works.** Clicked More controls below; after its scroll animation, Finish was visible around y496–568 while the mirror stayed in place. See `laptop-controls-cue-recheck.png`. This addresses the main discoverability complaint in weakness 4.
- **Final canvas visual evidence is stronger than the preliminary capture.** Inspected `cook/stills/canvas-r05/` overview, palette-lens and product-lens screenshots at desktop/mobile. The spatial paper composition and contextual shade/product controls are coherent and beauty-specific. Mobile Fit all still makes objects and text small inside a tall, mostly open board; zoom and focus are necessary for inspection. These screenshots support visual assessment, not an independently repeated complete canvas workflow.

The remaining quality limits are principally material/edge realism, deliberate framing proportions, small-preview comparison, and the mobile canvas overview scale. The fixed hue, visibility and scrolling defects should no longer be presented as current blockers. No new performance, tracking, physical shade-accuracy or cross-browser claim is added by this recheck.
