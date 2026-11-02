import { Sun, Moon, Circle, Sunrise, Move } from "lucide-react";
import { LIGHTING_PRESETS } from "../../../../packages/ar-renderer/src";
import { useApp } from "../state/store";

/** A scene light, never an input to Skin Lab's original-image sampling. */
export default function LightControl() {
  const light = useApp((s) => s.lighting),
    setLight = useApp((s) => s.setLighting);
  const begin = () => useApp.getState().beginEdit(),
    end = () => useApp.getState().endEdit();
  const icons = [Circle, Sun, Sunrise, Moon];
  return (
    <section className="scene-light" aria-label="Creative studio lighting">
      <div className="light-heading">
        <div>
          <h2>Set the light.</h2>
          <p>A different mood. The same you.</p>
        </div>
        <Sun size={18} />
      </div>
      <div className="light-presets">
        {LIGHTING_PRESETS.map((p, i) => {
          const Icon = icons[i];
          return (
            <button
              key={p.id}
              aria-pressed={light.preset === p.id}
              title={p.description}
              onClick={() => setLight({ preset: p.id })}
            >
              <Icon size={17} />
              <span>{["Original", "Daylight", "Golden", "Moonlight"][i]}</span>
            </button>
          );
        })}
      </div>
      {light.preset !== "neutral" && (
        <div className="light-adjustments">
          <div
            className="light-orbit"
            role="slider"
            tabIndex={0}
            aria-label="Light direction"
            aria-valuemin={-100}
            aria-valuemax={100}
            aria-valuenow={Math.round(light.direction.x * 100)}
            aria-valuetext={`Horizontal ${Math.round(light.direction.x * 100)}, vertical ${Math.round(light.direction.y * 100)}. Arrow keys move the light.`}
            onKeyDown={(e) => {
              if (
                ![
                  "ArrowLeft",
                  "ArrowRight",
                  "ArrowUp",
                  "ArrowDown",
                  "Home",
                ].includes(e.key)
              )
                return;
              e.preventDefault();
              const d = { ...light.direction };
              if (e.key === "Home") {
                d.x = -0.35;
                d.y = -0.45;
              } else if (e.key === "ArrowLeft") d.x -= 0.1;
              else if (e.key === "ArrowRight") d.x += 0.1;
              else if (e.key === "ArrowUp") d.y -= 0.1;
              else d.y += 0.1;
              setLight({
                direction: {
                  x: Math.max(-1, Math.min(1, d.x)),
                  y: Math.max(-1, Math.min(1, d.y)),
                },
              });
            }}
            onPointerDown={(e) => {
              begin();
              e.currentTarget.setPointerCapture(e.pointerId);
              const b = e.currentTarget.getBoundingClientRect();
              setLight({
                direction: {
                  x: Math.max(
                    -1,
                    Math.min(1, (2 * (e.clientX - b.left)) / b.width - 1),
                  ),
                  y: Math.max(
                    -1,
                    Math.min(1, (2 * (e.clientY - b.top)) / b.height - 1),
                  ),
                },
              });
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const b = e.currentTarget.getBoundingClientRect();
              setLight({
                direction: {
                  x: Math.max(
                    -1,
                    Math.min(1, (2 * (e.clientX - b.left)) / b.width - 1),
                  ),
                  y: Math.max(
                    -1,
                    Math.min(1, (2 * (e.clientY - b.top)) / b.height - 1),
                  ),
                },
              });
            }}
            onPointerUp={end}
            onLostPointerCapture={end}
          >
            <div className="light-orbit-axis" />
            <i
              style={{
                left: `${(light.direction.x + 1) * 50}%`,
                top: `${(light.direction.y + 1) * 50}%`,
              }}
            >
              <Sun size={14} />
            </i>
            <Move size={16} />
          </div>
          <div className="light-strength">
            <label htmlFor="light-strength">
              Light strength <span>{Math.round(light.intensity * 100)}%</span>
            </label>
            <input
              id="light-strength"
              type="range"
              min={0}
              max={100}
              value={light.intensity * 100}
              onPointerDown={begin}
              onPointerUp={end}
              onBlur={end}
              onChange={(e) =>
                setLight({ intensity: Number(e.target.value) / 100 })
              }
            />
            <p>Drag the light or use arrow keys.</p>
          </div>
        </div>
      )}
      <p className="light-disclosure">
        Creative preview only. Skin Lab reads your original photo.
      </p>
    </section>
  );
}
