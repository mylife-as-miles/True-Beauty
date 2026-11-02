import { useEffect, useRef, useState } from "react";
import { createVision } from "../../../../packages/vision-core/src";
import { BeautyRenderer } from "../../../../packages/ar-renderer/src";
import { normalizeLook } from "../../../../packages/makeup-engine/src";
import type { SavedLook } from "../../../../packages/local-database/src";
export default function LookComparison({ looks }: { looks: SavedLook[] }) {
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);
  const [status, setStatus] = useState("Preparing your two looks…");
  useEffect(() => {
    let active = true;
    const pipeline = createVision();
    const renderers: BeautyRenderer[] = [];
    const img = new Image();
    img.onload = async () => {
      try {
        const useHair = looks.some((l) => normalizeLook(l.look).hair.enabled);
        const snapshot = await pipeline.analyzeImage(img, {
          face: true,
          hair: useHair,
        });
        if (!active) return;
        looks.forEach((look, i) => {
          const canvas = canvases.current[i];
          if (!canvas) return;
          const renderer = new BeautyRenderer(canvas);
          renderers.push(renderer);
          renderer.render({
            source: img,
            landmarks: snapshot.landmarks,
            hairMask: snapshot.hairMask,
            look: normalizeLook(look.look),
          });
        });
        setStatus(
          "Replayed on the same demo portrait. Your saved photos are not used.",
        );
      } catch {
        if (active)
          setStatus(
            "Comparison could not load. Your saved colour recipes are unchanged.",
          );
      }
    };
    img.src = "/images/portrait-neutral.jpg";
    return () => {
      active = false;
      pipeline.dispose();
      renderers.forEach((r) => r.dispose());
    };
  }, [looks]);
  return (
    <>
      <p className="comparison-note" role="status">
        {status}
      </p>
      <div className="saved-compare-grid">
        {looks.map((l, i) => (
          <div key={l.id}>
            <canvas
              width="600"
              height="900"
              ref={(el) => {
                canvases.current[i] = el;
              }}
              aria-label={`Replayed preview of ${l.name}`}
            />
            <h3>{l.name}</h3>
            <div className="mini-swatches">
              {[
                normalizeLook(l.look).lipstick.color,
                normalizeLook(l.look).blush.color,
                normalizeLook(l.look).eyeshadow.color,
              ].map((c, n) => (
                <i style={{ background: c }} key={n} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="fine-print">
        The colour comparison uses one photographic subject and identical
        framing. Cosmetics, lighting, displays and skin texture affect how a
        look appears. Reflective finishes are approximated; detail varies by preview mode.
      </p>
    </>
  );
}
