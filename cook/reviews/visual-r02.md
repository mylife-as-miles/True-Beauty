# Independent visual critique — round 02

Date: 2026-11-02. **Subjective visual judgment: 7.7/10, improved from 7.0 in round 01. The 9.0 bar is not met.** These are appearance/usability judgments, not functionality, tracking, security, or performance measurements.

Requirements consulted: previously read `cook/BRIEF.md` and `docs/PRODUCT_SPEC.md`. This round inspected actual supplied `cook/stills/r02/studio-desktop.png` and `studio-mobile-edit.png`, then the running app at `http://127.0.0.1:5173` with Playwright. No implementation source was read. The latest running app was used to verify the sticky behavior rather than assuming that the supplied mobile still represented the latest CSS.

## Improvements verified in the running app

- At **390×844**, selected lip shade 5 and dragged intensity to **87%**. The compact mirror stayed approximately **y5–334**, with its portrait chooser at y22.75, while the editing controls remained visible below it. This fixes the major round-01 edit/observe separation. See `cook/stills/critic-visual-r02/mobile-shade.png` and `mobile-slider.png`.
- The mobile **six-look selector exists and works**. Selected Golden muse; the select value became `golden`, lip color changed to `#A16247`, intensity became 56%, and the applied-look confirmation appeared. Desktop now says “6 looks” rather than the inconsistent `01 — 06` count.
- The portrait chooser exposes **Warm portrait, Soft portrait, Editorial light**. The warm default is much more useful for shade appraisal than the saturated blue image. See `demo-chooser.png`.
- Accessory appearance improved substantially: glasses now have shaped rims/bridge/temples and highlight variation; earrings have a stud and dimensional hoop; the necklace has more material variation. See `accessories-desktop.png`. This is meaningful progress over plain yellow outlines.
- The renderer fallback is disclosed in the UI, and unsupported reflective finishes are disabled in this browser. This is a useful, truthful limitation, not evidence that those finishes have been visually validated.
- Studio, product catalog, Skin, privacy, and BeautyGraph share the cream/wine/serif design language. Settings body text is comfortably more readable than the tiny metadata in the studio.

| Dimension | Subjective score /10 | Evidence / limitation |
| --- | ---: | --- |
| Desktop composition and spacing | 8.4 | Strong editorial sheet, portrait hierarchy, consistent whitespace |
| Typography and legibility | 7.6 | Useful improvement; some small muted metadata still weak |
| Pigment/accessory appearance | 7.1 | Better default light and accessory detail; occlusion and reflective-material evidence remain weak |
| Interaction clarity | 7.8 | Working look selector and chooser; fallback selected-state ambiguity remains |
| Cross-space visual continuity | 6.8 | Brand consistent, but Skin changes the actual person/portrait |
| Mobile usability | 8.2 | Actual shade/slider edit loop works with visible portrait; secondary overflow affordances need attention |

## Strongest remaining weaknesses and five next fixes

1. **Preserve the selected portrait across spaces.** In the same browser session the Studio showed the warm portrait of a dark-skinned person, then Skin displayed the old blue-lit portrait of a different person. This also reproduced after loading Studio afresh and entering Skin. Compare `accessories-desktop.png` / supplied `studio-desktop.png` with `skin-desktop.png`. For a system centered on a persistent subject-specific look, this is a serious continuity break. Carry the selected portrait and source identity into Skin and back; intentionally unretouched inspection should still show the same person. The blue-lit default is also especially unsuitable for the color-reading task displayed beside it.

2. **Finish accessory occlusion and physical placement.** In `accessories-desktop.png`, the necklace at approximately x737–961/y751–827 runs visibly across the foreground hand and white collar instead of passing behind them. Rim highlights and shaped glasses are better, but do not resolve depth. The portrait has substantial three-quarter pose, skin texture, and foreground objects; the overlay must respect these. Add hand/clothing occlusion where supported, or hide the invalid necklace segment with an honest limitation rather than drawing through it. Obtain face/ear occlusion evidence under head turns before crediting premium live AR.

3. **Make fallback finish selection describe the effect actually visible.** In supplied `studio-desktop.png` and `mobile-slider.png`, Glossy retains the light selected capsule even though reflective choices are disabled and the note says natural color preview. That mixes requested state and applied state. Show the applied fallback as the selected finish, or explicitly show “Glossy requested · color-only preview active.” The present fallback is honest in prose, but the control state is visually contradictory. Separately capture supported-hardware before/after evidence for gloss, shimmer and glitter: this review encountered the fallback, so those material qualities remain unverified and cannot receive a premium realism score.

4. **Give the product edit stronger, differentiated visual identity.** In `products-desktop.png`, most cards are the same flat bottle silhouette with a different fill and two short white strokes. The large repeated illustration fields dominate the catalog; they look like a coherent wireframe illustration set rather than a rich beauty shopping experience. Original illustration disclosure is good. Improve distinctive proportions, packaging structures, textures and shade representation, or use licensed accurate product imagery when available. Preserve the sample-price and illustration labels. Product titles carry identity today, while the largest visual area contributes very little product-specific information.

5. **Finish small-text and overflow affordances.** In Studio, sample/source details, processing status, shade metadata, and slider endpoint labels are still small and pale relative to the strong display text. In `memory-mobile.png`, the last settings tab is visibly cut off as “Data & ba…” at the right edge without an obvious continuation cue; the long form also needs vertical scrolling to reveal its action/empty state. Add a clear overflow hint or a mobile tab selector, maintain readable contrast for secondary instructions, and provide a visible way to understand the independent scrolling tool area on mobile. Disabled finish labels may remain muted, but their status must remain understandable.

## Inspection boundaries

Independent captures are in `cook/stills/critic-visual-r02/`: `mobile-entry.png`, `mobile-shade.png`, `mobile-slider.png`, `demo-chooser.png`, `accessories-desktop.png`, `products-desktop.png`, `skin-desktop.png`, `privacy-desktop.png`, `memory-desktop.png`, and `memory-mobile.png`.

Skin was captured after its content finished loading; the initial loading frame was replaced. BeautyGraph was inspected as an empty-state dialog, with preference memory off, without saving invented personal data. The mobile preset selection and lipstick controls were operated; real camera tracking, hands, active hair recoloring, configured external skin analysis, speech, keyboard flow, reduced motion, product comparison, persistent graph edits, and paid/generative providers were not verified here. The standalone millisecond label is not an FPS result. No missing operational capability is treated as validated by the polished frame.

The next visual evidence should prioritize a same-subject Studio → Skin → Studio transition, the necklace behind the foreground hand/collar, actual supported-material before/after close-ups, and the revised product art. The mobile mirror issue is substantially resolved in the running app and should no longer be the principal visual blocker.
