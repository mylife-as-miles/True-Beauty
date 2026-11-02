import { FRAGMENT_SHADER, VERTEX_SHADER } from "../../shader-library/src";
import { createDefaultLook, type MakeupLook } from "../../makeup-engine/src";
import { FaceMaskAtlas, MASK_ORDER } from "./masks";
import {
  faceMetrics,
  hexRgb,
  maskBounds,
  validFace,
  type Landmark,
} from "./geometry";
export * from "./geometry";
export interface HairMask {
  width: number;
  height: number;
  data?: Float32Array | Uint8Array;
  confidence?: Float32Array;
  timestamp?: number;
}
export interface RenderFrame {
  source: CanvasImageSource;
  landmarks?: readonly Landmark[];
  look?: MakeupLook;
  hairMask?: HairMask | null;
  compare?: number | null;
  beforeAfter?: number | null;
  time?: number;
  hands?: ReadonlyArray<{
    landmarks: readonly Landmark[];
    confidence?: number;
  }>;
}
const sourceSize = (source: CanvasImageSource): [number, number] => {
  if ("videoWidth" in source) return [source.videoWidth, source.videoHeight];
  if ("naturalWidth" in source)
    return [source.naturalWidth, source.naturalHeight];
  if ("displayWidth" in source)
    return [source.displayWidth, source.displayHeight];
  return [Number(source.width), Number(source.height)];
};
/** Source-space shared makeup renderer. No model inference or image transmission occurs here. */
export class BeautyRenderer {
  readonly mode: "webgl2" | "canvas2d";
  fallbackReason?: string;
  readonly gpuRenderer?: string;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gpu: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private textures: WebGLTexture[] = [];
  private atlas: FaceMaskAtlas;
  private hairCanvas: HTMLCanvasElement;
  private hairAlphaCanvas: HTMLCanvasElement;
  private accessoryCanvas: HTMLCanvasElement;
  private lightingCanvas: HTMLCanvasElement;
  private lastHair: HairMask | null = null;
  private hairBounds: [number, number, number, number] = [0, 0, 1, 1];
  private fallbackCanvas: HTMLCanvasElement;
  private occlusionCanvas: HTMLCanvasElement;
  private occlusionAlphaCanvas: HTMLCanvasElement;
  private lastHands: RenderFrame["hands"];
  private maskRequestVersion = 0;
  private maskRevision = 0;
  private fallbackCache = new Map<
    string,
    { key: string; canvas: HTMLCanvasElement }
  >();
  private fallbackHair: {
    mask: HairMask | null;
    key: string;
    canvas: HTMLCanvasElement;
  } | null = null;
  private texturesDirty = true;
  private contextLost = false;
  private disposed = false;
  constructor(
    canvas: HTMLCanvasElement,
    private readonly options: {
      maxSide?: number;
      forceCanvas?: boolean;
      forceWebGL?: boolean;
    } = {},
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("The mirror requires Canvas 2D support.");
    this.ctx = ctx;
    this.gpu = document.createElement("canvas");
    this.hairCanvas = document.createElement("canvas");
    this.hairAlphaCanvas = document.createElement("canvas");
    this.accessoryCanvas = document.createElement("canvas");
    this.lightingCanvas = document.createElement("canvas");
    this.lightingCanvas.width = 2;
    this.lightingCanvas.height = 1;
    this.fallbackCanvas = document.createElement("canvas");
    this.atlas = new FaceMaskAtlas();
    this.occlusionCanvas = document.createElement("canvas");
    this.occlusionAlphaCanvas = document.createElement("canvas");
    this.occlusionCanvas.width = 1;
    this.occlusionCanvas.height = 1;
    this.gpu.addEventListener("webglcontextlost", this.onLost);
    this.gpu.addEventListener("webglcontextrestored", this.onRestored);
    try {
      this.gl = this.options.forceCanvas
        ? null
        : this.gpu.getContext("webgl2", {
            alpha: false,
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
          });
      if (this.gl) {
        const info = this.gl.getExtension("WEBGL_debug_renderer_info");
        this.gpuRenderer = info
          ? String(this.gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
          : String(this.gl.getParameter(this.gl.RENDERER));
        if (
          !this.options.forceWebGL &&
          /swiftshader|llvmpipe|software/i.test(this.gpuRenderer)
        ) {
          this.fallbackReason =
            "Software GPU detected; using responsive Canvas2D preview. Gloss and glitter require hardware WebGL2.";
          this.gl.getExtension("WEBGL_lose_context")?.loseContext();
          this.gl = null;
        } else this.initialize();
      }
    } catch (error) {
      this.fallbackReason =
        error instanceof Error ? error.message : "WebGL initialization failed";
      this.gl = null;
    }
    this.mode = this.gl ? "webgl2" : "canvas2d";
  }
  private onLost = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
  };
  private onRestored = () => {
    this.contextLost = false;
    this.textures = [];
    this.uniforms.clear();
    try {
      this.initialize();
    } catch {
      this.contextLost = true;
    }
  };
  private uniform(name: string) {
    if (!this.uniforms.has(name))
      this.uniforms.set(name, this.gl!.getUniformLocation(this.program!, name));
    return this.uniforms.get(name)!;
  }
  private initialize() {
    this.texturesDirty = true;
    const gl = this.gl!;
    const compile = (type: number, code: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, code);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error || "Shader compilation failed");
      }
      return shader;
    };
    const v = compile(gl.VERTEX_SHADER, VERTEX_SHADER),
      f = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    gl.deleteShader(v);
    gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(p) || "Shader link failed");
    this.program = p;
    gl.useProgram(p);
    const buffer = gl.createBuffer();
    this.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const a = gl.getAttribLocation(p, "aPosition");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    [
      "uSource",
      "uMasks0",
      "uMasks1",
      "uMasks2",
      "uMasks3",
      "uHair",
      "uOcclusion",
    ].forEach((name, i) => {
      const texture = gl.createTexture()!;
      this.textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(this.uniform(name), i);
    });
  }
  private upload(index: number, source: TexImageSource) {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + index);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[index]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }
  private updateOcclusion(
    hands: RenderFrame["hands"],
    width: number,
    height: number,
  ) {
    if (hands === this.lastHands) return;
    this.lastHands = hands;
    const c = this.occlusionCanvas;
    const scale = Math.min(1, 640 / Math.max(width, height));
    c.width = Math.round(width * scale);
    c.height = Math.round(height * scale);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, c.width, c.height);
    if (!hands?.length) return;
    ctx.fillStyle = "white";
    ctx.strokeStyle = "white";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.filter = "blur(2px)";
    for (const hand of hands) {
      if (
        (hand.confidence !== undefined && hand.confidence < 0.5) ||
        hand.landmarks.length < 21
      )
        continue;
      const p = hand.landmarks;
      const palm = Math.hypot(
        (p[5].x - p[17].x) * c.width,
        (p[5].y - p[17].y) * c.height,
      );
      ctx.lineWidth = palm * 0.22;
      ctx.beginPath();
      [0, 1, 2, 5, 9, 13, 17].forEach((id, i) => {
        if (i) ctx.lineTo(p[id].x * c.width, p[id].y * c.height);
        else ctx.moveTo(p[id].x * c.width, p[id].y * c.height);
      });
      ctx.closePath();
      ctx.fill();
      for (const chain of [
        [0, 1, 2, 3, 4],
        [5, 6, 7, 8],
        [9, 10, 11, 12],
        [13, 14, 15, 16],
        [17, 18, 19, 20],
      ]) {
        ctx.beginPath();
        chain.forEach((id, i) => {
          if (i) ctx.lineTo(p[id].x * c.width, p[id].y * c.height);
          else ctx.moveTo(p[id].x * c.width, p[id].y * c.height);
        });
        ctx.stroke();
      }
    }
    const a = this.occlusionAlphaCanvas;
    a.width = c.width;
    a.height = c.height;
    const image = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < image.data.length; i += 4)
      image.data[i + 3] = image.data[i];
    a.getContext("2d")!.putImageData(image, 0, 0);
  }
  private updateHair(mask: HairMask | null | undefined) {
    if (mask === this.lastHair) return;
    this.lastHair = mask || null;
    const c = this.hairCanvas;
    const data = mask?.data || mask?.confidence;
    if (!mask || !data) {
      c.width = 1;
      c.height = 1;
      const d = c.getContext("2d")!;
      d.fillStyle = "black";
      d.fillRect(0, 0, 1, 1);
      return;
    }
    this.hairBounds = maskBounds(data, mask.width, mask.height);
    c.width = mask.width;
    c.height = mask.height;
    const ctx = c.getContext("2d")!;
    const image = ctx.createImageData(c.width, c.height);
    const byte = data instanceof Uint8Array;
    for (let i = 0; i < Math.min(data.length, c.width * c.height); i++) {
      const confidence = byte ? data[i] / 255 : data[i];
      const value = Math.round(
        Math.max(0, Math.min(1, (confidence - 0.18) / 0.65)) * 255,
      );
      image.data[i * 4] = value;
      image.data[i * 4 + 1] = value;
      image.data[i * 4 + 2] = value;
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const alpha = this.hairAlphaCanvas;
    alpha.width = c.width;
    alpha.height = c.height;
    for (let i = 0; i < image.data.length; i += 4)
      image.data[i + 3] = image.data[i];
    alpha.getContext("2d")!.putImageData(image, 0, 0);
  }
  render(frame: RenderFrame): void {
    if (this.disposed) return;
    const [sourceWidth, sourceHeight] = sourceSize(frame.source);
    if (!sourceWidth || !sourceHeight) return;
    const scale = Math.min(
      1,
      (this.options.maxSide ?? 960) / Math.max(sourceWidth, sourceHeight),
    );
    const width = Math.round(sourceWidth * scale),
      height = Math.round(sourceHeight * scale);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    // A JSX canvas can already have the desired intrinsic dimensions. Its separate
    // WebGL surface still starts at300x150 and must be resized independently;
    // otherwise the viewport clips the source before drawImage stretches it.
    if (this.gpu.width !== width || this.gpu.height !== height) {
      this.gpu.width = width;
      this.gpu.height = height;
    }
    const points = frame.landmarks || [];
    const look = frame.look || createDefaultLook();
    const hasFace = validFace(points);
    const masksChanged = this.atlas.update(
      points,
      sourceWidth,
      sourceHeight,
      new Set(
        MASK_ORDER.filter(
          (name) => look[name].enabled && look[name].opacity > 0,
        ),
      ),
    );
    if (masksChanged) this.maskRevision++;
    this.updateHair(frame.hairMask);
    this.updateOcclusion(frame.hands, sourceWidth, sourceHeight);
    const compare = frame.compare ?? frame.beforeAfter ?? -1;
    if (this.gl && !this.contextLost && this.program) {
      try {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.viewport(0, 0, width, height);
        this.upload(0, frame.source as TexImageSource);
        if (masksChanged || this.texturesDirty) {
          this.atlas.atlases.forEach((c, i) => this.upload(i + 1, c));
          this.texturesDirty = false;
        }
        this.upload(5, this.hairCanvas);
        this.upload(6, this.occlusionCanvas);
        const colors: number[] = [],
          finishes: number[] = [];
        MASK_ORDER.forEach((name) => {
          const l = look[name];
          colors.push(...hexRgb(l.color), l.enabled && hasFace ? l.opacity : 0);
          finishes.push(
            ["matte", "gloss", "shimmer", "glitter"].indexOf(l.finish),
          );
        });
        gl.uniform4fv(this.uniform("uColors[0]"), colors);
        gl.uniform1fv(this.uniform("uFinish[0]"), finishes);
        gl.uniform3fv(this.uniform("uHairColor"), hexRgb(look.hair.color));
        gl.uniform3fv(
          this.uniform("uHairSecond"),
          hexRgb(look.hair.secondaryColor),
        );
        gl.uniform4fv(this.uniform("uHairBounds"), this.hairBounds);
        gl.uniform1f(
          this.uniform("uHairOpacity"),
          look.hair.enabled ? look.hair.opacity : 0,
        );
        gl.uniform1f(
          this.uniform("uHairMode"),
          ["solid", "ombre", "highlights", "balayage"].indexOf(look.hair.mode),
        );
        gl.uniform2f(this.uniform("uTexel"), 1 / sourceWidth, 1 / sourceHeight);
        gl.uniform1f(this.uniform("uCompare"), compare);
        gl.uniform1f(this.uniform("uTime"), frame.time || 0);
        const metrics = hasFace ? faceMetrics(points, 1, 1) : null;
        gl.uniform2f(
          this.uniform("uFaceCenter"),
          metrics?.center.x || 0.5,
          metrics?.center.y || 0.5,
        );
        gl.uniform2f(
          this.uniform("uFaceSize"),
          metrics?.eyeDistance || 0.2,
          metrics?.height || 0.5,
        );
        gl.uniform1f(this.uniform("uReshape"), hasFace ? look.reshape : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.drawImage(this.gpu, 0, 0, width, height);
      } catch (error) {
        this.fallbackReason =
          error instanceof Error ? error.message : "WebGL frame failed";
        this.contextLost = true;
        this.drawFallback(frame, look, hasFace, compare);
      }
    } else this.drawFallback(frame, look, hasFace, compare);
    if (hasFace)
      this.drawAccessories(points, look, width, height, compare, frame.source);
    if (frame.hands?.length) {
      const c = this.fallbackCanvas,
        mask = this.occlusionAlphaCanvas;
      c.width = mask.width;
      c.height = mask.height;
      const d = c.getContext("2d")!;
      d.globalCompositeOperation = "source-over";
      d.drawImage(frame.source, 0, 0, c.width, c.height);
      d.globalCompositeOperation = "destination-in";
      d.drawImage(mask, 0, 0);
      this.ctx.drawImage(c, 0, 0, width, height);
    }
  }
  private drawFallback(
    frame: RenderFrame,
    look: MakeupLook,
    hasFace: boolean,
    compare: number,
  ) {
    const ctx = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(frame.source, 0, 0, w, h);
    ctx.save();
    if (compare >= 0) {
      ctx.beginPath();
      ctx.rect(compare * w, 0, (1 - compare) * w, h);
      ctx.clip();
    }

    MASK_ORDER.forEach((name, i) => {
      const l = look[name];
      if (!hasFace || !l.enabled || l.opacity <= 0) return;
      const key = `${this.maskRevision}-${l.color}`;
      let cached = this.fallbackCache.get(name);
      if (!cached || cached.key !== key) {
        const c = cached?.canvas || document.createElement("canvas");
        c.width = this.atlas.atlases[0].width;
        c.height = this.atlas.atlases[0].height;
        const d = c.getContext("2d")!;
        d.drawImage(this.atlas.layerMasks[i], 0, 0);
        d.globalCompositeOperation = "source-in";
        d.fillStyle = l.color;
        d.fillRect(0, 0, c.width, c.height);
        cached = { key, canvas: c };
        this.fallbackCache.set(name, cached);
      }
      ctx.globalCompositeOperation = [
        "eyeliner",
        "mascara",
        "brows",
        "lipliner",
      ].includes(name)
        ? "multiply"
        : "soft-light";
      ctx.globalAlpha = l.opacity;
      ctx.drawImage(cached.canvas, 0, 0, w, h);
      ctx.globalAlpha = 1;
    });
    if (look.hair.enabled && this.lastHair) {
      const key = JSON.stringify(look.hair);
      let cache = this.fallbackHair;
      if (!cache || cache.mask !== this.lastHair || cache.key !== key) {
        const hc = this.hairCanvas,
          hp = hc.getContext("2d")!.getImageData(0, 0, hc.width, hc.height),
          c = cache?.canvas || document.createElement("canvas");
        c.width = hc.width;
        c.height = hc.height;
        const d = c.getContext("2d")!,
          image = d.createImageData(c.width, c.height);
        const first = hexRgb(look.hair.color),
          second = hexRgb(look.hair.secondaryColor);
        for (let j = 0; j < c.width * c.height; j++) {
          const x = j % c.width,
            y = Math.floor(j / c.width),
            hy = Math.max(
              0,
              Math.min(
                1,
                (y / c.height - this.hairBounds[1]) /
                  Math.max(0.01, this.hairBounds[3] - this.hairBounds[1]),
              ),
            );
          let f = 0;
          if (look.hair.mode === "ombre")
            f = Math.max(0, Math.min(1, (hy - 0.15) / 0.7));
          if (look.hair.mode === "highlights")
            f = (Math.sin(x * 0.15 + Math.sin(y * 0.01)) * 0.5 + 0.5) ** 4;
          if (look.hair.mode === "balayage")
            f = hy * (0.65 + 0.35 * Math.sin(x * 0.1));
          for (let k = 0; k < 3; k++)
            image.data[j * 4 + k] = (first[k] * (1 - f) + second[k] * f) * 255;
          image.data[j * 4 + 3] = hp.data[j * 4] * look.hair.opacity * 0.85;
        }
        d.putImageData(image, 0, 0);
        cache = { key, mask: this.lastHair, canvas: c };
        this.fallbackHair = cache;
      }
      ctx.globalCompositeOperation = "soft-light";
      ctx.drawImage(cache.canvas, 0, 0, w, h);
    }
    ctx.restore();
    ctx.globalCompositeOperation = "source-over";
  }
  private drawAccessories(
    points: readonly Landmark[],
    look: MakeupLook,
    w: number,
    h: number,
    compare: number,
    source: CanvasImageSource,
  ) {
    if (
      !look.accessories.glasses &&
      !look.accessories.earrings &&
      !look.accessories.necklace
    )
      return;
    const layer = this.accessoryCanvas;
    if (layer.width !== w || layer.height !== h) {
      layer.width = w;
      layer.height = h;
    }
    const ctx = layer.getContext("2d")!;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    const metrics = faceMetrics(points, w, h)!,
      unit = metrics.eyeDistance,
      rotation = metrics.rotation;
    // Skin brightness balances a restrained metallic highlight. This is an approximate
    // source-light cue, not a reconstructed environment map or physical fit model.
    let lightBias = 0;
    try {
      const d = this.lightingCanvas.getContext("2d")!,
        [sw, sh] = sourceSize(source);
      for (const [i, sign] of [
        [0, -1],
        [1, 1],
      ]) {
        const x = Math.max(
            0,
            Math.min(
              sw - 1,
              Math.round(((metrics.center.x + unit * 0.2 * sign) / w) * sw),
            ),
          ),
          y = Math.max(
            0,
            Math.min(
              sh - 1,
              Math.round(((metrics.center.y + unit * 0.2) / h) * sh),
            ),
          );
        d.drawImage(source, x, y, 1, 1, i, 0, 1, 1);
      }
      const p = d.getImageData(0, 0, 2, 1).data;
      lightBias = (p[0] + p[1] + p[2] - p[4] - p[5] - p[6]) / 765;
    } catch {
      /* Tainted sources keep neutral preview lighting. */
    }
    const gold = (x0: number, y0: number, x1: number, y1: number) => {
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, "#765333");
      gradient.addColorStop(0.22, "#c7a76b");
      gradient.addColorStop(
        Math.max(0.35, Math.min(0.65, 0.49 + lightBias * 0.3)),
        "#fff1c2",
      );
      gradient.addColorStop(0.73, "#bb9254");
      gradient.addColorStop(1, "#614027");
      return gradient;
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (look.accessories.glasses) {
      const cx = metrics.center.x,
        cy = metrics.center.y;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      const lensW = unit * 0.225,
        lensH = unit * 0.16;
      const lens = (center: number) => {
        ctx.beginPath();
        ctx.moveTo(center - lensW * 0.86, -lensH * 0.65);
        ctx.bezierCurveTo(
          center - lensW * 0.74,
          -lensH * 1.08,
          center + lensW * 0.75,
          -lensH * 1.08,
          center + lensW * 0.94,
          -lensH * 0.58,
        );
        ctx.bezierCurveTo(
          center + lensW * 1.13,
          lensH * 0.15,
          center + lensW * 0.67,
          lensH * 0.98,
          center + lensW * 0.16,
          lensH,
        );
        ctx.bezierCurveTo(
          center - lensW * 0.66,
          lensH * 1.12,
          center - lensW * 1.1,
          lensH * 0.45,
          center - lensW * 0.86,
          -lensH * 0.65,
        );
        ctx.closePath();
      };
      // Temples sit behind the front rim and follow tracked cheek/temple anchors.
      ctx.strokeStyle = gold(-unit * 0.6, -unit * 0.1, unit * 0.6, unit * 0.1);
      ctx.lineWidth = Math.max(1, unit * 0.012);
      for (const [sign, id] of [
        [-1, 127],
        [1, 356],
      ] as const) {
        const p = points[id],
          dx = p.x * w - cx,
          dy = p.y * h - cy;
        const x = dx * Math.cos(rotation) + dy * Math.sin(rotation),
          y = -dx * Math.sin(rotation) + dy * Math.cos(rotation);
        ctx.beginPath();
        ctx.moveTo(sign * unit * 0.47, -unit * 0.04);
        ctx.quadraticCurveTo(
          sign * unit * 0.55,
          -unit * 0.08,
          x,
          y - unit * 0.035,
        );
        ctx.stroke();
      }
      for (const sign of [-1, 1]) {
        const center = sign * unit * 0.25;
        lens(center);
        ctx.fillStyle = "rgba(165,185,185,.065)";
        ctx.fill();
        ctx.shadowColor = "rgba(47,25,12,.25)";
        ctx.shadowBlur = unit * 0.014;
        ctx.shadowOffsetY = unit * 0.009;
        ctx.strokeStyle = "#705336";
        ctx.lineWidth = Math.max(1.4, unit * 0.018);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = gold(center - lensW, -lensH, center + lensW, lensH);
        ctx.lineWidth = Math.max(1, unit * 0.012);
        ctx.stroke();
        ctx.save();
        lens(center);
        ctx.clip();
        ctx.strokeStyle = "rgba(255,255,255,.31)";
        ctx.lineWidth = Math.max(0.7, unit * 0.005);
        ctx.beginPath();
        ctx.moveTo(center - lensW * 0.64, -lensH * 0.48);
        ctx.bezierCurveTo(
          center - lensW * 0.2,
          -lensH * 0.78,
          center + lensW * 0.45,
          -lensH * 0.82,
          center + lensW * 0.72,
          -lensH * 0.52,
        );
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = gold(
        -unit * 0.06,
        -unit * 0.06,
        unit * 0.06,
        unit * 0.06,
      );
      ctx.lineWidth = Math.max(1.1, unit * 0.014);
      ctx.beginPath();
      ctx.moveTo(-unit * 0.035, -unit * 0.018);
      ctx.bezierCurveTo(
        -unit * 0.018,
        -unit * 0.065,
        unit * 0.018,
        -unit * 0.065,
        unit * 0.035,
        -unit * 0.018,
      );
      ctx.stroke();
      // Small nose pads and hinge pins ground the otherwise floating rim.
      for (const sign of [-1, 1]) {
        ctx.fillStyle = "rgba(225,206,165,.52)";
        ctx.beginPath();
        ctx.ellipse(
          sign * unit * 0.045,
          unit * 0.048,
          unit * 0.009,
          unit * 0.022,
          -sign * 0.2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.fillStyle = "#f0d89c";
        ctx.beginPath();
        ctx.arc(
          sign * unit * 0.468,
          -unit * 0.035,
          unit * 0.009,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    }
    if (look.accessories.earrings) {
      for (const [id, other] of [
        [132, 361],
        [361, 132],
      ] as const) {
        const p = points[id];
        if ((p.z ?? 0) - (points[other].z ?? 0) > 0.045) continue;
        const x = p.x * w,
          y = p.y * h + unit * 0.025,
          rx = unit * 0.043,
          ry = unit * 0.074;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rotation * 0.55);
        ctx.shadowColor = "rgba(35,23,12,.32)";
        ctx.shadowBlur = unit * 0.012;
        ctx.shadowOffsetX = unit * 0.007;
        ctx.shadowOffsetY = unit * 0.008;
        ctx.beginPath();
        ctx.ellipse(0, ry * 0.68, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "#765238";
        ctx.lineWidth = Math.max(1.6, unit * 0.022);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = gold(-rx, -ry, rx, ry * 1.6);
        ctx.lineWidth = Math.max(1, unit * 0.015);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,246,214,.9)";
        ctx.lineWidth = Math.max(0.5, unit * 0.004);
        ctx.beginPath();
        ctx.ellipse(
          -unit * 0.003,
          ry * 0.68,
          rx * 0.98,
          ry * 0.98,
          0,
          Math.PI * 1.04,
          Math.PI * 1.64,
        );
        ctx.stroke();
        const stud = ctx.createRadialGradient(
          -unit * 0.005,
          -ry * 0.34 - unit * 0.005,
          unit * 0.002,
          0,
          -ry * 0.34,
          unit * 0.019,
        );
        stud.addColorStop(0, "#fff8dc");
        stud.addColorStop(0.35, "#e6cb8d");
        stud.addColorStop(0.8, "#a97d42");
        stud.addColorStop(1, "#72522c");
        ctx.fillStyle = stud;
        ctx.beginPath();
        ctx.arc(0, -ry * 0.34, unit * 0.018, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (look.accessories.necklace) {
      const chin = points[152],
        x = chin.x * w,
        y = chin.y * h;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation * 0.25);
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(-unit * 0.43, unit * 0.12);
        ctx.quadraticCurveTo(0, unit * 0.85, unit * 0.43, unit * 0.12);
      };
      path();
      ctx.shadowColor = "rgba(30,19,12,.25)";
      ctx.shadowBlur = unit * 0.018;
      ctx.shadowOffsetY = unit * 0.012;
      ctx.strokeStyle = "#6f4b2d";
      ctx.lineWidth = Math.max(1.3, unit * 0.015);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.strokeStyle = gold(
        -unit * 0.43,
        unit * 0.15,
        unit * 0.43,
        unit * 0.65,
      );
      ctx.lineWidth = Math.max(0.8, unit * 0.009);
      ctx.stroke();
      const py = unit * 0.485;
      ctx.fillStyle = gold(-unit * 0.025, py, unit * 0.025, py + unit * 0.09);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.bezierCurveTo(
        -unit * 0.055,
        py + unit * 0.045,
        -unit * 0.035,
        py + unit * 0.085,
        0,
        py + unit * 0.095,
      );
      ctx.bezierCurveTo(
        unit * 0.035,
        py + unit * 0.085,
        unit * 0.055,
        py + unit * 0.045,
        0,
        py,
      );
      ctx.fill();
      ctx.fillStyle = "rgba(255,247,214,.76)";
      ctx.beginPath();
      ctx.ellipse(
        -unit * 0.011,
        py + unit * 0.054,
        unit * 0.007,
        unit * 0.016,
        -0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // Shared hair confidence masks hide temples/earrings behind hair without
    // replacing recolored hair pixels. Hand occlusion is applied after this layer.
    if (this.lastHair) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(this.hairAlphaCanvas, 0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    }
    this.ctx.save();
    if (compare >= 0) {
      this.ctx.beginPath();
      this.ctx.rect(compare * w, 0, (1 - compare) * w, h);
      this.ctx.clip();
    }
    this.ctx.drawImage(layer, 0, 0, w, h);
    this.ctx.restore();
  }
  /** Optional WASM mask refinement. Loading is explicit and failure leaves Canvas masks operational. */
  async setMaskBackend(backend: "canvas" | "opencv"): Promise<void> {
    const version = ++this.maskRequestVersion;
    if (this.disposed) throw new Error("Mirror renderer has been disposed.");
    if (backend === "canvas") {
      this.atlas.setBackend(null);
      return;
    }
    const { OpenCvBackend } = await import("./opencv");
    const engine = await OpenCvBackend.load();
    if (this.disposed || version !== this.maskRequestVersion) return;
    this.atlas.setBackend(engine);
  }
  get maskBackend() {
    return this.atlas.backend;
  }
  get maskBackendStats() {
    return this.atlas.backendStats;
  }
  /** Returns a local image only when the caller explicitly saves or downloads it. */
  get activeMode() {
    return this.gl && !this.contextLost ? "webgl2" : "canvas2d";
  }
  snapshot(type = "image/png"): string {
    return this.canvas.toDataURL(type);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gpu.removeEventListener("webglcontextlost", this.onLost);
    this.gpu.removeEventListener("webglcontextrestored", this.onRestored);
    if (this.gl) {
      this.textures.forEach((t) => this.gl!.deleteTexture(t));
      if (this.program) this.gl.deleteProgram(this.program);
      if (this.buffer) this.gl.deleteBuffer(this.buffer);
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    this.gpu.width = 1;
    this.gpu.height = 1;
    this.hairCanvas.width = 1;
    this.hairCanvas.height = 1;
    for (const c of [
      this.accessoryCanvas,
      this.lightingCanvas,
      this.hairAlphaCanvas,
      this.occlusionCanvas,
      this.occlusionAlphaCanvas,
    ]) {
      c.width = 1;
      c.height = 1;
    }
    [...this.atlas.atlases, ...this.atlas.layerMasks].forEach((c) => {
      c.width = 1;
      c.height = 1;
    });
    this.fallbackCache.clear();
    this.fallbackHair = null;
  }
}
