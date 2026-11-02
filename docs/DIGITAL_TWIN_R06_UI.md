# Beauty profile / Digital Twin UI — round 06

Date: 2026-11-02. UI scope: `apps/web/src/components/DigitalTwin.tsx`, `DigitalTwin.css`, `tests/e2e/digital-twin.spec.ts`. The principal engineer owns the `digital-twin` contracts/domain, database changes, shared scene restoration, App route and navigation. This report distinguishes UI evidence from domain/integration work.

## Implemented interface

The `Beauty profile` navigation route opens an editorial, local-first profile with a display-only session portrait, self-described preferences and an editable complete-look recipe. Its copy explicitly describes a cosmetic preference profile, not a biometric reconstruction, medically complete digital twin or inferred phenotype. No analysis model runs in this component, and its portrait does not become saved profile media.

Default component props: `portraitUrl`, `look`, `lighting`, `onApplyComplete(saved)`, `onOpenOutfit(id)`, `onOpenMirror()`. All data actions invoke the real domain functions: `loadDigitalTwin`, `saveTwinProfile`, `saveCompleteLook`, `deleteCompleteLook`, `exportDigitalTwin`, `readComposition`. A Dexie live query subscribes to the actual local snapshot. Drafts are preserved while unrelated live data changes; the profile/revision hydration key avoids overwriting a submitted draft with a stale snapshot.

Users can edit their name/nickname, self-reported skin type, budget/currency including NGN, cosmetic concerns, product preferences, hair texture/length/goals, style goals, preferred finish, ingredient preferences and up to twelve favourite colours. An empty optional nickname uses “You.” Lists are trimmed/deduplicated but are **not silently truncated**: excess entries produce a contextual error and retain the whole draft. Field limits and six-digit colour values align with the domain boundary. Skin/ingredient language does not imply diagnosis or allergy safety.

The separate complete-look form uses the actual supplied mirror recipe, including enabled makeup, hair settings, accessory selections and creative scene lighting. Users give it a name/occasion and optionally attach actual owned-product IDs and a saved outfit ID. It does not manufacture ownership or product availability. Empty wardrobes and missing outfit choices are explained. Saving persists the recipe/references without a portrait. The archive displays only enabled saved pigment layers, name, occasion, date and reference count. Reopen calls the principal's atomic apply callback and then the actual mirror-navigation callback. Delete uses the actual engine function; export downloads the actual engine-generated JSON.

Save/export/error feedback appears beside the relevant workflow, avoiding a floating notification over mobile controls. In-page anchors connect the introduction, profile, composer and archive. Forms, swatches and actions use native controls, visible focus, responsive layout, explicit contextual select names, 44px colour/remove controls and reduced-motion behavior.

## Consent and image handling

Preference memory and look-history memory are separate optional controls. They are disabled without the relevant existing consent; this component never calls a consent-grant API. Permission text explains where to enable it. Live consent revocation clears/disables the extra-use checkbox. The domain enforces permission again when saving. Ordinary local profile/complete-look saves remain explicit user actions without secretly enabling agent memory.

The component renders the parent-owned portrait URL without copying it into records, exporting it or revoking it. It creates no image blobs, camera captures, facial geometry, API tasks or image uploads. The only Blob it creates is the requested JSON export, whose temporary object URL is released after initiating the download. IndexedDB remains origin-scoped storage, not inherently encrypted; this limitation is stated in the UI. Existing Privacy and settings controls own broader consent inspection/deletion/backups.

No new images or model weights were added. The displayed demo portrait remains covered by `ASSET_PROVENANCE.md` and its outstanding independent subject/model-release metadata audit. The UI uses the existing licensed DM fonts/Lucide package and original project code. Proofline's anchored context and Common Table's scene continuity inform the profile→recipe→reopen flow; no code/assets from those references are copied. Their earlier pinned licensing audit remains in `DESIGN_RESEARCH.md` / `CANVAS_UX_ROUND05.md`.

## Executed verification

Actual application: `http://127.0.0.1:5173`, Chromium 156, desktop and iPhone-sized mobile context. The current suite includes four journeys per viewport. **Six cases have passing evidence; two new outfit-receiver cases remain pending the independent DressingRoom integration described below.**

Commands executed:

```sh
npx playwright test tests/e2e/digital-twin.spec.ts --workers=1 --output=test-results-twin-r06
npx playwright test tests/e2e/digital-twin.spec.ts \
  -g 'complete-look recipe|preference memory requires' \
  --workers=1 --output=test-results-twin-r06-fixed
npx eslint apps/web/src/components/DigitalTwin.tsx tests/e2e/digital-twin.spec.ts
npx tsc --noEmit
node cook/stills/twin-r06/verify-ui.mjs
```

Passing UI behaviors:

- Self-described profile, hair/style/finish/favourite colour persist after actual page reload. Real downloaded export contains the chosen values and excludes portrait URL, image data and Blob URLs. No agent preference consent is auto-granted, no memory nodes are silently created, and no POST requests occur.
- A named complete recipe retains the actual lip shade, creative light, selected owned-product ID and saved outfit ID in the real JSON export. Reopening reaches the real mirror with its saved colour; deleting removes the actual archive entry. Fixture-owned product/outfit rows are explicit test setup, not claimed merchant or VTO evidence.
- Thirteen hair goals produce a helpful limit error without discarding/truncating the draft. The user explicitly enables preference permission in the real Privacy UI, then opts into the separate profile-memory save; the actual attributed BeautyGraph node is created. Revoking permission clears/disables the extra-use checkbox again.

The first run found one real action mismatch: “Reopen in mirror” applied the saved state without navigating because the root callback deliberately separates apply from navigation. The UI now invokes both callbacks for that action. The consent test's first assertion also matched the existing global permission toast; it now scopes status assertions to the actual profile. Original failed artifacts remain in the first output directory and are not counted as passes.

Actual screenshot review found and fixed a portrait action that could overlap its privacy caption. The action is now anchored to an image wrapper rather than the entire stretched figure. Placeholder contrast was strengthened, favourite controls enlarged and a platform-dependent emoji replaced with an SVG. Screenshots were opened for desktop viewport and mobile archive inspection, not inferred from CSS.

`cook/stills/twin-r06/ui-report.json` records the final application capture: desktop 1440×1000 and mobile 390×844 with reduced motion. Scoped Axe WCAG A/AA/2.1 AA checks report **zero violations and zero incomplete checks**. There is no horizontal overflow, no uncaught page error and zero POST requests. Reduced-motion animation is `none`. These scans concern the profile surface; they do not certify the whole application, screen-reader behavior or physical-device performance.

Evidence:

- `cook/stills/twin-r06/twin-{desktop,mobile}-viewport.png`
- `twin-{desktop,mobile}-full.png`
- `twin-{desktop,mobile}-archive.png`
- `test-results-twin-r06*/.../profile-saved.png` and `complete-look-saved.png`

Environment: Linux x86-64 virtual container, Chromium 156 headless; mobile viewport emulation is not a physical handset benchmark. No real-time FPS or clinical/fairness-model accuracy claim follows from a user-authored profile editor.

## Integration checkpoint and remaining work

The archive/composer's “Open outfit” callback currently depends on the fashion engineer's receiving implementation in DressingRoom. The principal wires `activeOutfitId`; the fashion engineer is implementing actual saved-study restoration and shared-portrait rendering. Until that lands, merely navigating to DressingRoom is not evidence of opening the selected study.

The pending test `a complete look opens its actual saved outfit study without replacing the shared portrait` uses fixture `twin-fixture-outfit`, name `Midnight blue study`, colour `#24395b`, and a valid bounded placement with width/height/opacity. It asserts the actual name/colour and renderer `data-active-outfit` / `data-portrait-source`. The fashion engineer has this exact contract. Resume with:

```sh
npx playwright test tests/e2e/digital-twin.spec.ts \
  -g 'actual saved outfit study' --workers=1 --output=test-results-twin-r06-outfit
```

Do not mark those two cases verified until their actual output passes. Domain revision/graph/export tests are principal-owned and must be reported independently. The mobile preference form is intentionally comprehensive and long; in-page anchors reduce navigation cost, but further progressive-disclosure critique may improve it. This UI does not establish a physically complete twin, generated hairstyle, scientific appearance assessment, or the full product's 9/10 acceptance gate.

## Strengthened restoration check

The complete-look desktop/mobile cases now save actual Golden-hour light and lip `#943356`, return to the mirror, deliberately change it to Original light and `#223344`, then reopen the saved recipe. Visible mirror controls confirm restoration to Golden and `#943356`; this establishes actual restoration rather than leaving an unchanged scene in place. The targeted four restoration/consent cases pass again in `test-results-twin-r06-restore`.

An unsaved-profile notice now appears beside the composer when relevant: the look uses the last saved profile revision until the user saves their draft. The over-limit draft test verifies this notice. The principal was also informed of the domain edge where a look created before the first stored profile document could otherwise reuse the later first profile's revision number; the revision/evidence fix and its domain tests are principal-owned.

## Verified Dressing Room receiver follow-up

After notifying the design owner and freezing application edits, the receiving integration was verified on desktop Chromium and mobile viewport emulation. The targeted “a complete look opens its actual saved outfit study without replacing the shared portrait” test passed **2/2** (5.1 s): exact saved name, colour #24395b, `data-active-outfit='twin-fixture-outfit'` and unchanged shared source.

Dressing Room now renders the actual current cosmetics/hair/accessories/light on the shared portrait before its explicitly manual garment layer. Four additional real browser checks passed (31.9 s): changed pixels when excluding the current mirror look, no repeated face inference for shared-source edits, one inference for a new uploaded source, preserved source when returning to Mirror, and pixel-identical original Skin input after creative grading. See `docs/FASHION_R06.md`, `tests/e2e/dressing-scene-r06.spec.ts` and `cook/stills/r06-fashion/`. These results do not establish photorealistic draping, live clothing AR or physical-device performance.
