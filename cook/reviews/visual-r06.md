# Independent visual and UX critique — R06 local application

Reviewed 2026-11-02, directly in the real Vite application at `http://127.0.0.1:5173`, Chromium 156.0.8078.4 headless Linux. Desktop 1440×1000, tablet 768×1024 and phone-sized 390×844, DPR 1. Phone capture used reduced motion. These are browser viewports, not physical devices. I did not edit product source or use an implementer's self-rating as evidence.

**Reviewed-interface judgment: 8.0/10. The ≥9 acceptance gate is not met.** This is a critique of the named local UI surfaces, not a new full-product weighted score, medical/fairness result or deployment verdict. R06 backend/publication is not established here; the public Site remains the earlier R05 static publication.

## Scope and method

Read `AGENTS.md`, `docs/DESIGN_RESEARCH.md`, current brief/ledger/scorecard/quality/remaining-work, and the R06 Remix, Beauty profile, commerce and validation reports. Exercised real UI, local model rendering, a public bundled demo photograph through the actual inspiration-upload control, region selection, colour correction, accessory toggles, garment placement, profile save, outfit save, complete-look save, archive reopen and exact commerce shades. All screenshot evidence in this report was newly captured under `cook/stills/r06-critic-visual/` and opened for visual inspection.

No provider requests, API keys, private images, paid work, deployment or remote image analysis. Main capture recorded zero POST attempts, zero page errors and zero horizontal document overflow across its 27 inspected route/state samples. This is a bounded check, not a full privacy or accessibility audit. The follow-up route/bag script performed only local UI actions. Its one uploaded image was bundled public `portrait-2.jpg`.

Scripts and raw evidence:

- `inspect.mjs` / `browser-report.json`: three viewport route captures, text and control geometry.
- `journeys.mjs` / `journeys-report.json`: actual profile/outfit/recipe journeys, correction viewport geometry and reduced-motion observations.
- `nav-and-bag.mjs` / `nav-and-bag-report.json`: active-route drawer reproduction and measured toast overlap.
- `edit-geometry.mjs` / `edit-geometry-report.json`: garment width editing with result-position geometry.

Run each from repository root with `node cook/stills/r06-critic-visual/<script>.mjs`. The initial capture-script failure looked for the visible string “Full portrait” as an exact accessible name; the app correctly names that control “Show full portrait.” That test locator was corrected. A brief Vite outage was repaired by starting `npm run dev -- --port 5173`; outage/locator errors are not product defects. The first mobile follow-up journey genuinely encountered the drawer defect below, then used an explicit drawer close to continue the rest of the review. Full-page captures sometimes include an offscreen fixed skip-link as a browser capture artifact; the viewport captures and actual geometry govern findings, and that artifact is not scored as a UI defect.

## Scores

These are subjective critic judgments out of 10, with evidence and scope limits.

| Dimension | Score | Judgment |
|---|---:|---|
| Original art direction and coherence | 8.6 | Warm pigment chrome, DM Serif/DM Sans pairing, restrained strokes and real portrait maintain a clear identity across all reviewed spaces. |
| Composition and spacing | 8.1 | Studio hierarchy is strong; the new full-page workflows spend too much vertical space above editing and saved work. |
| Typography and reading clarity | 8.3 | Headlines and labels are orderly; small metadata and dense explanatory copy become laborious on phone. |
| Pigment/accessory/garment appearance | 7.2 | Skin texture remains visible and lip pigment is restrained. Hat/watch/blouse remain visibly geometric stickers with weak material integration, honestly labelled as illustrative. |
| Editing controls and feedback | 7.4 | Region tabs, sample bounds, native controls and local success feedback are understandable; Remix/garment corrections lose their visual subject. |
| Scene and cross-space continuity | 8.0 | Actual saved recipe and outfit parameters restore. Deep-scroll handoffs undermine seeing the restored result. |
| Touch and observed reduced motion | 7.4 | Studio maintains a useful phone mirror; commerce/dressing targets are inconsistent and a transient toast covers an action. Reduced-motion capture had no computed CSS animations. This is not a full keyboard/screen-reader audit. |
| Inclusivity and truthful framing | 8.8 | User-authored skin/hair/style language, NGN and local privacy controls are thoughtful. No inferred diagnosis or realistic-fit promise is made. Representative-device/complexion performance remains unverified. |

The new pages extend the brand successfully. They do not yet match the Studio's stronger relationship between the visible face and the tool being edited. This score covers additional R06 workflows and is not a directly interchangeable before/after metric for the R05 critic's narrower set of surfaces.

## Prioritized defects and reproductions

### P2 — Remix corrections require editing without seeing the face

At 390×844: open Look Remix, upload bundled `portrait-2.jpg`, Interpret this reference, select Hair, change its colour and presence. At the actual Hair presence editing viewport, the target canvas is at `y=-519`, height `215`; the inspector is at `y=269`. Neither face is visible. The desktop suffers the same separation: target stage at `y=-471`, only the bottom 99px of the photographs remains at the top while the inspector is around `y=505`. Applying requires an additional trip to the mirror to inspect the effect.

Evidence: `mobile-remix-correction-viewport.png`, `desktop-remix-correction-viewport.png`, and corresponding entries in `journeys-report.json`. The side-by-side reference/result composition looks calm at rest, but the visual feedback is absent at the moment the user makes a correction. Keep a meaningful result preview visible while editing or move the inspector beside/over a bounded preview. On phone, a compact persistent result with the region tools beneath would preserve context.

### P2 — Saved-look → Open outfit opens below the restored result

Save “Critic midnight study” in Dressing room with colour `#293b43`, width `0.72` and rotation `5`; save a complete look in Beauty profile paired with that study; scroll to its archive row and choose Open outfit. The study restores the correct name/colour/placement, but the old page depth is carried to the destination. On phone the destination is at `scrollY=1713`, with its canvas `y=-1239` and height `483`: the entire result is above the viewport. The user sees seasonal palette/name/save/archive controls instead of the composition just opened. The desktop capture similarly opens near the bottom of the composition.

Evidence: `mobile-profile-open-outfit.png`, `desktop-profile-open-outfit.png`, `mobile-outfit-route-position` in `journeys-report.json`. Focus and scroll the destination composition/heading into view as part of the handoff, while retaining its scene parameters. This matters to the actual Common Table continuity principle: restoring state should produce a visibly understandable destination.

### P2 — Re-selecting the active mobile route leaves navigation over the work

At 390×844, stay in The studio, open navigation, then tap The studio in the drawer. It remains `nav-rail extended-rail open`; Close navigation is still visible. Attempting to activate Light afterward is intercepted by the drawer. The selected item looks like a completed navigation action but leaves the overlay in place.

Evidence: `mobile-reselect-active-route.png`, `nav-and-bag-report.json`; the first mobile `journeys.mjs` run reproduced the pointer interception. `App.tsx` closes the menu in the `[space]` effect, which does not run for a same-route selection. Close on every route action as well as genuine route changes.

### P2 — Garment editing loses sight of the garment on phone

Open My wardrobe → Dressing room on 390×844 and move to Width/Rotation. The portrait is an earlier full-width block; the composition controls follow below it and are not accompanied by a compact persistent preview. The browser must scroll away from the garment to reach the controls. First arrival at desktop also uses a tall stage that puts the default garment below the 1000px fold, so the visible “Dressing room” is mostly a face until the user scrolls.

Evidence: `mobile-dressing-width-viewport.png`, `desktop-dressing.png`, `mobile-dressing.png`, `edit-geometry-report.json`. Keep the composition bounded and visible through placement adjustments. The existing static-photo qualification is clear and should remain; the gap is the correction workflow, independent of any future generative VTO.

### P2 — Mobile bag toast completely covers the merchant-source action

At 390×844, open O FACE Satin Lipstick, Add to bag, close product dialog and promptly open Your bag. For the 5.5-second notification window, the toast occupies `y=767.8–829`; the “Check reviewed merchant sources” button occupies `y=769–811`. Its full 42px height is covered. After the toast expires, the button appears and works as a normal visible action. This is a real viewport overlap, not a full-page screenshot artifact.

Evidence: `mobile-bag-toast-overlap.png`, `mobile-bag-after-toast.png`, exact intersection in `nav-and-bag-report.json`. Use dialog-local feedback or a placement that does not cover the modal's actions.

### P2 — R06 touch geometry is less generous outside Studio

Measured at phone size: bag close/remove buttons are 34×34px; quantities are 50×24.5px. Dressing swatches are 30×30px, custom garment colour is 25×25px, and export/reset are 34×34px. These can be used, but are materially less forgiving than the design's stated 44px phone target. Several catalogue favourite/owned shortcuts are 28×28px. Raw input range track height alone is not treated as proof of a failed target, and these measurements are not automatically WCAG failures; parent-label/spacing semantics matter.

Evidence: `browser-report.json` control rectangles; `mobile-bag.png`, `mobile-dressing-width-viewport.png`, `mobile-commerce.png`. Increase actual hit areas while retaining the current small visual marks.

### P3 — Beauty profile front-loads a long introduction before common tasks

The mobile profile is roughly 5507px tall after one save. Its first viewport shows the title/export/large portrait; the “Your preferences / Create a complete look / Return to a saved look” anchors are themselves farther down, after explanatory text. A returning user enters through another full editorial introduction before reaching their saved work. The profile form has useful labels and reliable local saves; the information order is the friction.

Evidence: `mobile-profile.png`, `mobile-profile-full.png`, `mobile-profile-archive.png`, profile geometry in `journeys-report.json`. Bring the task anchors to the top, surface the saved profile/last look earlier, and consider grouping optional preference fields behind clear disclosure. Preserve self-description and privacy choices.

### P3 — Illustrative accessories and blouse limit immersion

The watch is a small flat dial/strap pasted onto the visible wrist; the hat is a clean beige vector with little hair/contact response; the sample blouse has transparent flat planes over the existing patterned clothing. They demonstrate placement and colour, but do not convincingly join the photographic scene. The current honesty copy is good; it cannot make the rendering visually realistic.

Evidence: `desktop-style-full-portrait.png`, `desktop-style-details.png`, `desktop-dressing-full.png`, `mobile-dressing-edited.png`. Stronger contact/occlusion, believable proportions and material response would improve the quality bar. Motion/occlusion on real people and real devices was not examined here, so no tracking-accuracy claim follows.

## Verified strengths worth keeping

- The Studio remains the strongest visual workspace: a dominant real face, quiet chrome, actual pigment swatches, named tools and visible cosmetic texture. Full portrait reveals head/wrist details without pretending that dimensions are measured.
- The expanded Style list has actual glasses/earring/necklace/ring/bracelet/watch/hat actions and readable status explaining available anchors. I enabled glasses/earrings/necklace/ring/hat in the main captures and bracelet/watch/hat in the follow-up. It does not silently report all tracking as physically calibrated fit.
- Remix uses actual upload/analysis, spatial source samples, named region tabs, editable colour/presence and explicit sample quality limitations. The public second portrait yielded the displayed measured region data; Hair correction retained the measured value alongside the user's replacement. Source/target remain clearly distinguished.
- Saving an actual outfit and attaching it to an actual complete-look recipe worked. “Open outfit” restored `#293b43`, width `0.72`, rotation `5`, and name. The mobile restored canvas reported `faceSource=shared`, `localInferences=0`, `faceInferences=0`.
- I deliberately changed saved lip `#943356` to `#223344` and Golden light to Original, then reopened the complete recipe. Visible controls restored `#943356` and Golden on desktop and phone. This is real restoration, not an unchanged scene mistaken for it.
- Commerce preserved distinct Soft rose and Berry muse rows with correct sample NGN totals. The bag states clearly that it is a planning collection, with no order/stock reservation/currency conversion claim. Product artwork is labelled original illustration/sample reference.
- Reduced-motion phone Remix reported no elements with non-`none` computed CSS animation names. The default desktop page uses a short 0.5s entry animation. I did not assess live-camera motion, long-session performance, screen readers, physical touch ergonomics or vestibular user response.

## Reference assessment and remaining boundaries

The Proofline/Common Table comparison is about documented interaction principles; their applications were not run or visually screenshot-compared in this review. True Beauty's original paper/pigment identity is coherent rather than a copied reference skin. The mirror's retained face and contextual controls embody the references well. New Remix/garment pages weaken contextual editing by separating adjustment from the subject; the outfit handoff restores state but misses destination orientation.

No amount of these UI captures establishes licensed provider availability, body/hand tracking under motion, garment drape, physical shade accuracy, equitable performance across complexions, real-device 30/60 FPS, a complete digital twin, or full-product acceptance. Local source/renderer evidence and truthful copy are useful foundations; the listed editing/navigation defects and realism gaps keep the reviewed experience below 9/10.

## Independent frozen-source recheck — 2026-11-02, 14:47 UTC onward

The principal requested a fresh review after the reported fixes. I re-ran the current real app at 5173 with **one Chromium page, sequential viewports**, alongside the principal's separately running suite. No product source was edited, no requests were mocked, and no provider/source-refresh action was invoked. The current captures are under `cook/stills/r06-critic-visual/recheck/`, separate from all original evidence above. I opened the new screenshots and checked actual UI geometry, canvas pixels and a real action hit test. The retained original critique remains the before state.

**Revised reviewed-interface judgment: 8.2/10.** The mobile correction and outfit handoff improvements are visible and useful. Wider-screen Remix editing, remaining touch geometry, ordinary-session hair-preview readiness and illustrative material quality still keep this scope below 9. This does not revise the full-product weighted score or establish publication/provider/device gates.

### Fixed or materially improved in this recheck

| Original finding | Actual current result | New evidence |
|---|---|---|
| Mobile Remix loses the face while editing/applying | A genuine cropped target detail stays at `y=12`, with a visible 108×137px canvas during Hair correction; with comparison enabled it becomes 108×155px and remains visible at Apply. Full preview returns to the main target at `y=290`. The face is large enough to orient a correction, and the shortcut makes the full result reachable. | `mobile-remix-hair-correction.png`, `mobile-remix-compare.png`, `mobile-remix-apply.png`, `mobile-remix-full-preview.png`; matching geometry in `report.json` |
| Garment sliders separate the result from its controls | The new sticky composition stays at `y=0`, with a 100×148px canvas at `y=11`, while Width/Rotation controls remain visible below. This works at both 390 and 768 widths. The copied canvas changes after actual width/rotation/colour edits (hash `2766764964` → `3837084513`). It is useful live feedback rather than a frozen thumbnail. | `mobile-dressing-width.png`, `mobile-dressing-rotation.png`, `tablet-dressing-width.png`; `mobile-dressing-live-copy` in `report.json` |
| Open outfit retains the archive's deep scroll | The real saved-study handoff now lands on the composition: stage `y=12`, actual canvas `y=55`, 322×483px, fully visible on the phone. It no longer opens among the lower save/palette controls. | `mobile-profile-open-outfit.png`; corresponding geometry in `report.json` |
| Re-selecting The studio leaves the drawer open | Opening navigation and selecting the active Studio item closes the drawer; its class no longer contains `open`, and Close navigation is not visible. | `mobile-active-route-reselected.png`; `active-mobile-route-reselection` in `report.json` |
| Recent-added toast covers bag merchant CTA | With the toast still visible at `y=767.8–829`, the source button is at `y=651–693`. `elementFromPoint` at its center resolves to that button. A real click opens Merchant source notebook. No “Check current source” action was performed. | `mobile-bag-source-hit-tested.png`, `mobile-merchant-source-opened.png`; hit-test and opened-dialog records in `report.json` |
| Bag close/remove/quantity controls are undersized | Actual close and remove hit rectangles are now 44×44px; quantity is 54×44px. The bag is substantially easier to operate. | `mobile-bag-source-hit-tested.png`; `mobile-bag-targets` in `report.json` |

The default whole-page mobile garment entry still starts with a tall portrait; the new sticky working preview resolves the more consequential adjustment problem. Its 100px-wide image is sufficient for placement direction and colour, with the explicit full-composition action retaining a way to inspect detail.

### Still open, and a newly isolated hair readiness gap

1. **P2, wider-screen Remix correction context remains open.** The new detail panel is hidden above the 760px breakpoint. At tablet 768 the main target stage is `y=-308`, height 320: only its bottom 12px remains, while the inspector is visible at `y=405`. At desktop 1440 the image's lower face/torso can remain at the top of the viewport, but the hair/eyes being corrected are outside the viewport; there is no persistent detail panel. `tablet-remix-correction.png` and `desktop-remix-correction.png` show the actual current state. The mobile fix should not be reported as closure of the original all-viewport finding.

2. **P2, touch-size finding is only partially closed.** Bag close/remove/quantity are fixed. Dressing swatches still measure 30×30px, custom garment colour 25×25px, export/reset 34×34px. The bag source button is still 42px high. New sticky Remix Full preview is a 36px-minimum control, and comparison is compact. These remain usability/44px-design-target gaps; the measurements alone are not a claim of WCAG failure. Earlier catalogue shortcuts were not rescored in this focused recheck.

3. **P2, fresh Studio → Remix can offer included Hair without a target hair mask.** I first opened the ordinary default Studio, waited for the real face result, then went directly into Remix, uploaded the bundled reference and edited Hair to purple at 75%. The persistent target copy remained pixel-identical (`1982264171` before and after). It truthfully displayed “Original hair · mask unavailable.” This is not a CPU/model timeout, and the preview is not universally frozen: in a second real journey I first enabled Copper in the Studio's Hair editor, then returned to Remix. The target hair mask was then available; the same correction changed the persistent image hash from `261312905` to `3909539716`, with “Aligned colour preview” visible. This isolates an unmet target-feature preparation path when a shared snapshot contains face geometry but no hair mask. The enabled Hair inspector should obtain the missing local target feature or make the unavailable correction state clearer before the user edits/applies it. Preserve the honest disclosure. Evidence: `mobile-remix-hair-correction.png`, `mobile-remix-hair-with-mask.png`, and both live-copy records in `report.json`.

The earlier P3 profile information order and geometric accessory/garment material assessment are not closed by this focused pass. No real-device, moving-person, complexion-fairness or provider behavior was retested, and no inference/render FPS claim is made.

Recheck scripts: `recheck/recheck.mjs` and `recheck/bag-hair.mjs`; raw results are in `recheck/report.json`. The first script's bag hit-test initially used the nonexistent selector `.modal-overlay` for a computed-style read; this was a capture-script error, corrected to the app's `.modal-backdrop`. The independent bag-only follow-up then completed the real hit test/action successfully. All completed app observations recorded zero page errors and zero POST requests. Opening the local source notebook did not fetch merchant facts.
