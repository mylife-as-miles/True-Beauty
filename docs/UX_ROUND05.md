# UX round 05 — a collection of real looks

Date: 2026-11-02. This is a focused design/interaction improvement round, not a claim that the full product's acceptance gate has passed. The principal engineer owns the wider Studio/mirror presentation and the graphics engineer owns new shader/lighting work. This work owns only `LookGallery.tsx`, `LookGallery.css` and these notes; isolated verification artifacts are in `cook/stills/ux-r05/`.

## Initial critique

The previous look rail placed source photographs beside names and swatches. Some photographs represented a different person from the selected mirror portrait, and the pictures did not show the actual preset outcomes. A mobile selector offered the recipes but made visual comparison difficult. The collection therefore asked the user to imagine the result rather than explore it.

The improvement should keep the current person as the persistent subject. A look becomes an editable visual object: the same portrait, the actual recipe applied to its geometry, a clear name and its pigment palette. The portrait carries the object; metadata and decorative chrome should recede.

## Implemented component

`LookGallery` exports:

```tsx
<LookGallery
  activeId={presetId}
  onSelect={applyPreset}
  portraitUrl={currentSessionPortrait}
  snapshot={sourceMatchedVisionSnapshot}
  compact={false}
/>
```

The optional snapshot contract preserves one shared live/static vision pipeline:

- `undefined`: an isolated/standalone gallery may create one vision engine and perform one still analysis.
- `null`: the parent's pipeline is pending; the gallery displays the source image and loads no model.
- A snapshot: all six thumbnails reuse its real landmarks, hair mask and hand geometry; the gallery performs no independent inference.

The principal implementation passes an ephemeral source-matched snapshot from the mirror. Source pixels load once in an image element for rendering. This component never stores images/geometry, uploads them, or revokes application-owned session Blob URLs.

Six actual images are rendered through **one temporary `BeautyRenderer`**, reusing the source/geometry across all recipes. A bounded Canvas renderer at max side 240 avoids creating six GPU contexts and leaves the expensive finishes to the main mirror. The output is copied into six display canvases, then temporary renderer/model resources are disposed. There are no CSS color filters or static “after” image substitutions. The copy explicitly calls these color studies and directs finish exploration to the mirror.

The full-width layout is a horizontal 3:4 editorial reel. A partially visible next object and real previous/next buttons make continuation discoverable. Each object carries an actual transformed portrait, name, small palette and description. Selection uses a restrained outline/check plus `aria-pressed`; hover moves only the object being considered. The compact variant preserves portrait/palette identity in a narrower vertical rail. All styles are component-scoped.

Keyboard arrows select/focus adjacent looks, Home/End reach the collection ends, and normal button activation remains available. Pointer/touch selection uses the same callback. Roving focus avoids six unnecessary tab stops. Browse/retry buttons meet 44px targets. Reduced motion disables movement and smooth scrolling.

No-face/model failures show the original photo with an explicit unavailable notice. Pending shared tracking does not silently start another model. An unreadable source asks the user to choose a portrait rather than displaying a fabricated face or transformation.

## Executed evidence

Type check: `npx tsc --noEmit` passed at the component checkpoint. Wider renderer/Studio edits continue independently, so the principal engineer must run final repository checks after integration.

Real-browser command:

```sh
node cook/stills/ux-r05/verify-gallery.mjs
```

Chromium 156.0.8078.4, Linux, desktop 1440×900; mobile 390×844. The harness is explicitly labelled component verification and imports the actual production component and actual local vision/rendering code.

| Check | Actual result |
|---|---|
| Standalone analysis | One worker analysis, one face-model request, zero main-thread fallback analyses |
| Resulting preview images | Six canvases, six distinct pixel images, source-dependent 160×240 output |
| Shared actual snapshot | Parent performs one real analysis; six distinct thumbnails reuse it; no gallery analysis |
| Parent pending (`snapshot=null`) | Zero worker/main analyses and zero model requests; loading state retained |
| Keyboard | ArrowRight selects Rose hour; End selects Studio violet; Home and browse buttons work |
| Mobile pointer selection | After hours selected, no document horizontal overflow |
| Aborted real model request | Honest original-photo fallback, no transformed-result claim; two requests reflect worker→CPU recovery attempts |
| Compact / reduced motion | Six objects present; computed transition duration 0s |
| Browser errors | None during the completed verification run |

Evidence:

- `cook/stills/ux-r05/gallery-report.json`
- `gallery-standalone-desktop.png`
- `gallery-shared-desktop.png`
- `gallery-mobile.png`
- `gallery-compact.png`
- `gallery-original-fallback.png`
- `gallery-harness.html` / `.jsx` and `verify-gallery.mjs` for reproduction.

The screenshots were opened and visually inspected at desktop/mobile/compact sizes. The darker berry, rose and warmer sheer recipes read differently on the same face; palette/name relationships stay intact. The selected object remains visible through the scroll interaction. These are color-preview checks on one supplied portrait, not a complexion-diversity or physical-finish validation set.

## Integration and remaining critique

The principal engineer should mount the gallery below the mirror as a full-width reel or use `compact` in a sufficiently wide sidebar. Passing the parent's source-matched snapshot is required in the real application to avoid duplicate face models. Do not pass a snapshot belonging to the previous source while a new portrait is loading.

The collection improves visual comparison and subject continuity. It does not establish physically realistic gloss/glitter at thumbnail scale, full live-camera quality, representative fairness, source-model redistribution clearance or provider availability. A fresh wider-Studio visual critique remains necessary after the scene lighting and new focus layout are integrated. No self-assigned 9/10 score is inferred from a successful gallery test.

## Component accessibility check

Actual component harness checked with axe-core 4.14.0 (`wcag2a`, `wcag2aa`, `wcag21aa`) at widths 1440 and 390: **zero automated violations**. Incomplete contrast entries concern partially clipped/off-screen reel text (one desktop description, four mobile names); no blanket contrast certification is inferred. Evidence: `cook/stills/ux-r05/gallery-accessibility.json`. The actual arrow/Home/End tests and mobile pointer checks above complement the automated scan. Full application integration and assistive-technology review remain separate.
