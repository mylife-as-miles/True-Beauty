import {
  Component,
  memo,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  BackSide,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SphereGeometry,
  Vector2,
} from "three";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  productIllustration,
  type Product,
} from "../../../../packages/commerce-engine/src";
import "./ProductViewer.css";

const INITIAL = { yaw: -0.32, pitch: 0.08, distance: 4.5 };
const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

class PreviewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Fallback({
  product,
  onRetry,
}: {
  product: Product;
  onRetry: () => void;
}) {
  return (
    <div className="product-viewer-fallback">
      <img
        src={productIllustration(product)}
        alt={`Generic ${product.form} illustration`}
      />
      <p>3D rendering is unavailable on this device.</p>
      <button type="button" onClick={onRetry}>
        Try 3D again
      </button>
    </div>
  );
}

/** Generates the studio light field locally; no downloaded environment or branded asset. */
function StudioLighting({
  distance,
  onLost,
}: {
  distance: number;
  onLost: () => void;
}) {
  const { gl, scene, camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(0, 0.2, distance);
    camera.lookAt(0, 0.03, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, distance, invalidate]);
  useEffect(() => {
    const previous = scene.environment,
      studio = new Scene();
    studio.background = new Color("#eee6dc");
    const resources: Array<Mesh> = [];
    const room = new Mesh(
      new SphereGeometry(12, 16, 12),
      new MeshBasicMaterial({ color: "#bcae9f", side: BackSide }),
    );
    studio.add(room);
    resources.push(room);
    const panel = (
      color: string,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
    ) => {
      const mesh = new Mesh(
        new PlaneGeometry(sx, sy),
        new MeshBasicMaterial({ color }),
      );
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      studio.add(mesh);
      resources.push(mesh);
    };
    panel("#fff9ef", -3, 3, 3, 3, 7);
    panel("#ffffff", 3, 2, 1, 1.6, 5);
    panel("#554538", 1, 0, -4, 3, 5);
    panel("#fffdf4", 0, 5, 0, 5, 5);
    const generator = new PMREMGenerator(gl);
    const map = generator.fromScene(studio, 0.025);
    scene.environment = map.texture;
    invalidate();
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      gl.domElement.removeEventListener("webglcontextlost", lost);
      scene.environment = previous;
      map.dispose();
      generator.dispose();
      resources.forEach((m) => {
        m.geometry.dispose();
        (m.material as MeshBasicMaterial).dispose();
      });
    };
  }, [gl, scene, invalidate, onLost]);
  return (
    <>
      <ambientLight intensity={0.65} />
      <hemisphereLight args={["#fff6eb", "#b5a28f", 1.2]} />
      <directionalLight
        position={[-3, 5, 4]}
        intensity={3.2}
        castShadow
        shadow-mapSize={[512, 512]}
        shadow-camera-left={-2}
        shadow-camera-right={2}
        shadow-camera-top={3}
        shadow-camera-bottom={-2}
        shadow-normalBias={0.02}
      />
      <pointLight position={[3, 2, -2]} intensity={16} distance={12} />
    </>
  );
}
function Cyl({
  radius,
  height,
  y,
  color,
  metalness = 0,
  roughness = 0.4,
}: {
  radius: number;
  height: number;
  y: number;
  color: string;
  metalness?: number;
  roughness?: number;
}) {
  return (
    <mesh position={[0, y, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[radius, radius, height, 64, 1]} />
      <meshPhysicalMaterial
        color={color}
        metalness={metalness}
        roughness={roughness}
        clearcoat={0.45}
        clearcoatRoughness={0.2}
      />
    </mesh>
  );
}
function Ring({
  radius,
  y,
  color = "#c3a26b",
  width = 0.018,
}: {
  radius: number;
  y: number;
  color?: string;
  width?: number;
}) {
  return (
    <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <torusGeometry args={[radius, width, 10, 64]} />
      <meshStandardMaterial color={color} metalness={0.8} roughness={0.2} />
    </mesh>
  );
}
const Packaging = memo(function Packaging({
  form,
  accent,
}: {
  form: Product["form"];
  accent: string;
}) {
  const profile = [
    new Vector2(0.36, -0.83),
    new Vector2(0.43, -0.8),
    new Vector2(0.44, -0.72),
    new Vector2(0.44, 0.35),
    new Vector2(0.42, 0.45),
    new Vector2(0.25, 0.58),
    new Vector2(0.24, 0.67),
  ];
  const matte = {
    color: "#eee6d9",
    roughness: 0.38,
    metalness: 0.03,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
  };
  if (form === "compact")
    return (
      <group rotation={[0.15, 0, 0]} position={[0, -0.93, 0]}>
        <Cyl
          radius={0.73}
          height={0.17}
          y={0}
          color="#4c3439"
          metalness={0.35}
        />
        <Cyl radius={0.67} height={0.055} y={0.1} color={accent} />
        <Ring radius={0.69} y={0.12} />
        <group position={[0, 0.12, -0.64]} rotation={[-1.12, 0, 0]}>
          <mesh position={[0, 0.07, 0.62]} castShadow>
            <cylinderGeometry args={[0.73, 0.73, 0.1, 64]} />
            <meshStandardMaterial
              color="#4c3439"
              metalness={0.45}
              roughness={0.27}
            />
          </mesh>
          <mesh position={[0, 0.012, 0.62]}>
            <cylinderGeometry args={[0.64, 0.64, 0.01, 64]} />
            <meshPhysicalMaterial
              color="#b9b8b3"
              metalness={0.93}
              roughness={0.11}
              clearcoat={1}
            />
          </mesh>
        </group>
      </group>
    );
  if (form === "jar")
    return (
      <group position={[0, -0.585, 0]}>
        <Cyl
          radius={0.68}
          height={0.66}
          y={-0.05}
          color={accent}
          roughness={0.25}
        />
        <Cyl
          radius={0.66}
          height={0.09}
          y={-0.39}
          color="#bfa989"
          metalness={0.5}
        />
        <Cyl
          radius={0.7}
          height={0.2}
          y={0.37}
          color="#e9e3d9"
          metalness={0.58}
          roughness={0.23}
        />
        <Ring radius={0.68} y={0.26} />
        <Cyl
          radius={0.687}
          height={0.018}
          y={0.48}
          color="#f6f0e6"
          metalness={0.3}
        />
      </group>
    );
  if (form === "lipstick")
    return (
      <group>
        <Cyl
          radius={0.27}
          height={0.9}
          y={-0.53}
          color="#392d30"
          metalness={0.25}
          roughness={0.23}
        />
        <Cyl
          radius={0.276}
          height={0.03}
          y={-0.94}
          color="#c7a771"
          metalness={0.8}
        />
        <Cyl
          radius={0.25}
          height={0.45}
          y={0.1}
          color="#c2a171"
          metalness={0.84}
          roughness={0.18}
        />
        <Ring radius={0.247} y={0.33} width={0.012} />
        <mesh position={[0, 0.63, 0]} castShadow>
          <capsuleGeometry args={[0.19, 0.49, 12, 48]} />
          <meshPhysicalMaterial
            color={accent}
            roughness={0.36}
            clearcoat={0.3}
            clearcoatRoughness={0.3}
          />
        </mesh>
        <group position={[0.72, -0.5, 0.15]} rotation={[0, 0, -0.14]}>
          <Cyl
            radius={0.295}
            height={0.99}
            y={0}
            color="#392d30"
            metalness={0.26}
            roughness={0.22}
          />
          <Ring radius={0.293} y={-0.43} />
        </group>
      </group>
    );
  if (form === "tube")
    return (
      <group>
        <mesh position={[0, 0.02, 0]} castShadow>
          <cylinderGeometry
            args={[0.46, 0.25, 1.58, 4, 1, false, Math.PI / 4]}
          />
          <meshPhysicalMaterial {...matte} color={accent} />
        </mesh>
        <Cyl
          radius={0.245}
          height={0.23}
          y={-0.88}
          color="#e5ddd2"
          roughness={0.28}
        />
        <mesh position={[0, 0.84, 0]}>
          <boxGeometry args={[0.66, 0.035, 0.66]} />
          <meshStandardMaterial color="#d5c9ba" roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.08, 0.266]}>
          <planeGeometry args={[0.36, 0.55]} />
          <meshStandardMaterial color="#f8f3eb" roughness={0.65} />
        </mesh>
      </group>
    );
  return (
    <group position={[0, -0.18, 0]}>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, 64]} />
        <meshPhysicalMaterial
          color={form === "dropper" ? accent : "#f1ece2"}
          roughness={form === "dropper" ? 0.21 : 0.32}
          metalness={0.03}
          transmission={form === "dropper" ? 0.15 : 0}
          thickness={0.24}
          ior={1.47}
          clearcoat={0.7}
          clearcoatRoughness={0.22}
        />
      </mesh>
      <Cyl
        radius={0.445}
        height={0.43}
        y={-0.1}
        color={form === "dropper" ? "#f3eee6" : accent}
        roughness={0.58}
      />
      <Ring radius={0.25} y={0.64} />
      {form === "dropper" ? (
        <>
          <Cyl
            radius={0.275}
            height={0.25}
            y={0.78}
            color="#d3c4ac"
            metalness={0.65}
            roughness={0.25}
          />
          <mesh position={[0, 1.05, 0]} castShadow>
            <capsuleGeometry args={[0.17, 0.24, 8, 40]} />
            <meshStandardMaterial color="#39302e" roughness={0.6} />
          </mesh>
        </>
      ) : (
        <>
          <Cyl
            radius={0.265}
            height={0.25}
            y={0.79}
            color="#e7dfd2"
            roughness={0.25}
          />
          <mesh position={[0.1, 0.99, 0]} castShadow>
            <boxGeometry args={[0.53, 0.12, 0.24]} />
            <meshPhysicalMaterial
              color="#ece5dc"
              roughness={0.3}
              clearcoat={0.5}
            />
          </mesh>
          <mesh position={[0.345, 0.96, 0]}>
            <boxGeometry args={[0.025, 0.04, 0.13]} />
            <meshStandardMaterial color="#a99a8d" roughness={0.7} />
          </mesh>
        </>
      )}
    </group>
  );
});
function ProductScene({
  product,
  yaw,
  pitch,
  distance,
  onLost,
}: {
  product: Product;
  yaw: number;
  pitch: number;
  distance: number;
  onLost: () => void;
}) {
  const accent = /^#[\da-f]{6}$/i.test(product.accent)
    ? product.accent
    : "#b48272";
  return (
    <>
      <StudioLighting distance={distance} onLost={onLost} />
      <group rotation={[pitch, yaw, 0]}>
        <Packaging form={product.form} accent={accent} />
      </group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.02, 0]}
        receiveShadow
      >
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#eee7de" roughness={0.82} />
      </mesh>
    </>
  );
}

export default function ProductViewer({ product }: { product: Product }) {
  const [view, setView] = useState(INITIAL),
    [lost, setLost] = useState(false),
    [generation, setGeneration] = useState(0);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const instructions = useId();
  const lostHandler = useRef(() => setLost(true));
  const change = (yaw: number, pitch = 0) =>
    setView((v) => ({
      ...v,
      yaw: v.yaw + yaw,
      pitch: clamp(v.pitch + pitch, -0.7, 0.7),
    }));
  const zoom = (amount: number) =>
    setView((v) => ({ ...v, distance: clamp(v.distance + amount, 3.1, 6) }));
  const reset = () => setView({ ...INITIAL });
  const retry = () => {
    setLost(false);
    setGeneration((n) => n + 1);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (lost) return;
    const handlers: Record<string, () => void> = {
      ArrowLeft: () => change(-0.2),
      ArrowRight: () => change(0.2),
      ArrowUp: () => change(0, -0.12),
      ArrowDown: () => change(0, 0.12),
      Home: reset,
      r: reset,
      R: reset,
      "+": () => zoom(-0.3),
      "=": () => zoom(-0.3),
      "-": () => zoom(0.3),
    };
    if (handlers[e.key]) {
      e.preventDefault();
      handlers[e.key]();
    }
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || lost || (e.target as HTMLElement).closest("button"))
      return;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (!p || p.id !== e.pointerId) return;
    change((e.clientX - p.x) * 0.008, (e.clientY - p.y) * 0.006);
    pointer.current = { id: p.id, x: e.clientX, y: e.clientY };
  };
  const release = (e: PointerEvent<HTMLDivElement>) => {
    pointer.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const fallback = <Fallback product={product} onRetry={retry} />;
  return (
    <section className="product-viewer" aria-label="Generic 3D packaging study">
      <div className="product-viewer-caption">
        <span>Material study</span>
        <span>Original generic 3D model</span>
      </div>
      <div
        className="product-viewer-stage"
        role="group"
        tabIndex={0}
        aria-label={`Rotate generic ${product.form} model`}
        aria-describedby={instructions}
        onKeyDown={key}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        data-yaw={view.yaw.toFixed(3)}
        data-pitch={view.pitch.toFixed(3)}
        data-distance={view.distance.toFixed(1)}
      >
        {lost ? (
          fallback
        ) : (
          <PreviewBoundary
            key={generation}
            fallback={fallback}
            onError={lostHandler.current}
          >
            <Canvas
              shadows
              frameloop="demand"
              dpr={[1, 1.5]}
              camera={{
                position: [0, 0.2, INITIAL.distance],
                fov: 36,
                near: 0.1,
                far: 30,
              }}
              gl={{
                antialias: true,
                alpha: false,
                powerPreference: "low-power",
              }}
              fallback={fallback}
            >
              <color attach="background" args={["#eee7de"]} />
              <fog attach="fog" args={["#eee7de", 5, 8]} />
              <ProductScene
                product={product}
                {...view}
                onLost={lostHandler.current}
              />
            </Canvas>
          </PreviewBoundary>
        )}
        {!lost && (
          <span className="product-viewer-gesture" aria-hidden="true">
            Drag to turn
          </span>
        )}
      </div>
      <div className="product-viewer-controls" role="group" aria-label="3D model controls">
        <div>
          <button
            type="button"
            disabled={lost}
            onClick={() => change(-0.2)}
            aria-label="Rotate model left"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            disabled={lost}
            onClick={() => change(0.2)}
            aria-label="Rotate model right"
          >
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            disabled={lost}
            onClick={() => change(0, -0.12)}
            aria-label="Tilt model up"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            disabled={lost}
            onClick={() => change(0, 0.12)}
            aria-label="Tilt model down"
          >
            <ChevronDown size={16} />
          </button>
        </div>
        <div>
          <button
            type="button"
            onClick={() => zoom(0.3)}
            aria-label="Zoom model out"
            disabled={lost || view.distance >= 6}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            onClick={() => zoom(-0.3)}
            aria-label="Zoom model in"
            disabled={lost || view.distance <= 3.1}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="product-viewer-reset"
            disabled={lost}
            onClick={reset}
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      </div>
      <p id={instructions} className="product-viewer-instructions">
        {lost
          ? "Retry 3D, or continue exploring the generic illustration."
          : "Drag or use arrow keys to rotate. + / − to zoom. Home to reset."}
      </p>
      <p className="product-viewer-disclaimer">
        An unbranded {product.form} model for exploring light and material. This
        is not the selected product’s packaging, size, or finish.
      </p>
    </section>
  );
}
