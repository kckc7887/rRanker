import {
  arcSteps,
  identity,
  inverse,
  multiply,
  point,
  strokeTriangles,
  triangulate,
  type Contour,
  type Matrix,
  type XY,
} from './stage-geometry';
import { rgba, StageGradient, stageFragment, stageProgram, stageVertex, type Color } from './stage-material';
import { releaseTracks } from './stage-track';
import { StageTiming } from './stage-timing';

const SCREEN_PIXELS = 2_500_000;
const IMAGE_PIXELS = 32 * 1024 * 1024;
const limits = new WeakMap<WebGLRenderingContext, { width: number; height: number; texture: number }>();
function deviceLimits(gl: WebGLRenderingContext) {
  let limit = limits.get(gl);
  if (!limit) {
    const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const texture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    limit = { width: Math.min(dims[0]!, texture), height: Math.min(dims[1]!, texture), texture };
    limits.set(gl, limit);
  }
  return limit;
}
function boundedSize(w: number, h: number, scale: number, pixels: number, maxW: number, maxH: number) {
  w = Math.max(1, w);
  h = Math.max(1, h);
  const ratio = Math.min(scale, Math.sqrt(pixels / (w * h)), maxW / w, maxH / h);
  const width = Math.max(1, Math.min(Math.floor(pixels), Math.floor(w * ratio)));
  const height = Math.max(1, Math.min(Math.floor(pixels / width), Math.floor(h * ratio)));
  return { width, height };
}
export function stagePixels(cssWidth: number, cssHeight: number, gl?: WebGLRenderingContext) {
  const limit = gl && deviceLimits(gl);
  return boundedSize(
    cssWidth,
    cssHeight,
    Math.min(2, globalThis.devicePixelRatio || 1),
    SCREEN_PIXELS,
    limit?.width ?? Infinity,
    limit?.height ?? Infinity,
  );
}
export type StageTarget = { width: number; height: number; texture: WebGLTexture; framebuffer: WebGLFramebuffer };
export type StageContext = CanvasRenderingContext2D &
  Pick<
    Stage,
    | 'gl'
    | 'beginFrame'
    | 'flush'
    | 'dispose'
    | 'tint'
    | 'drawMask'
    | 'imageTexture'
    | 'invalidateImage'
    | 'acquireTarget'
    | 'bindTarget'
    | 'releaseTarget'
    | 'drawTarget'
    | 'restoreTarget'
    | 'currentTarget'
    | 'clipDepth'
    | 'releaseImage'
    | 'effectScale'
  >;

type Paint = string | StageGradient;
type Rect = [number, number, number, number];
type Clip = { parent: Clip | null; rect: Rect | null; vertices: XY[] };
type ImageEntry = {
  texture: WebGLTexture;
  width: number;
  height: number;
  dirty: boolean;
  mediaTime: number;
  videoFrame: number;
  cancel?: () => void;
};
type Label = {
  texture: WebGLTexture;
  pixels: number;
  width: number;
  height: number;
  left: number;
  top: number;
  advance: number;
};
const white: Color = [1, 1, 1, 1];
const contexts = new WeakMap<HTMLCanvasElement, Stage>();
const quad = [0, 1, 2, 0, 2, 3];
const blendModes: Partial<Record<GlobalCompositeOperation, [number, number]>> = {
  'source-over': [1, 0x0303],
  lighter: [1, 1],
  'destination-out': [0, 0x0303],
  'destination-in': [0, 0x0302],
  'source-in': [0x0304, 0],
  'destination-over': [0x0305, 1],
  copy: [1, 0],
};
function imageSize(source: CanvasImageSource): XY {
  const s = source as HTMLImageElement & HTMLVideoElement & VideoFrame;
  return [
    s.videoWidth || s.naturalWidth || s.displayWidth || Number(s.width),
    s.videoHeight || s.naturalHeight || s.displayHeight || Number(s.height),
  ];
}

export function createStageContext(canvas: HTMLCanvasElement): StageContext {
  const previous = contexts.get(canvas);
  if (previous) return previous as unknown as StageContext;
  const stage = new Stage(canvas);
  contexts.set(canvas, stage);
  return stage as unknown as StageContext;
}

class Stage {
  readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly solid: WebGLTexture;
  private readonly attrs: number[];
  private readonly size: WebGLUniformLocation | null;
  private readonly blur: WebGLUniformLocation | null;
  private readonly sampler: WebGLUniformLocation | null;
  private vertices = new Float32Array(66 * 256);
  private used = 0;
  private texture: WebGLTexture | null = null;
  private slot = 0;
  private readonly textures: WebGLTexture[] = [];
  private readonly bound: (WebGLTexture | undefined)[] = [];
  private readonly units = new Int32Array([0, 1, 2, 3, 4, 5, 6, 7]);
  private surfaceWidth = 0;
  private surfaceHeight = 0;
  private blend: GlobalCompositeOperation = 'source-over';
  private blurX = 0;
  private blurY = 0;
  private readonly targets = new Map<StageTarget, WebGLRenderbuffer | null>();
  private readonly idleTargets = new Map<StageTarget, number>();
  private frame = 0;
  private readonly timing = new StageTiming();
  get effectScale() {
    return this.timing.scale;
  }
  private readonly maxAttribs: number;
  private targetPixels = 0;
  currentTarget: StageTarget | null = null;
  private readonly images = new Map<CanvasImageSource, ImageEntry>();
  private imagePixels = 0;
  private readonly gradients = new Map<string, WebGLTexture>();
  private readonly labels = new Map<string, Label>();
  private labelPixels = 0;
  private glyphCanvas?: HTMLCanvasElement;
  private glyphContext?: CanvasRenderingContext2D;
  private blurTarget: StageTarget | null = null;
  private blurAge = 0;
  private dead = false;
  private reportedLoss = false;
  private paths: Contour[] = [];
  private disk: { x: number; y: number; r: number; m: Matrix } | null = null;
  private clips: Clip | null = null;
  private appliedClip: Clip | null | undefined = undefined;
  clipDepth = 0;
  private matrix: Matrix = identity();
  private tintColor: Color = [1, 1, 1, 1];
  private stack: ReturnType<Stage['state']>[] = [];
  fillStyle: Paint = '#000';
  strokeStyle: Paint = '#000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  miterLimit = 10;
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = 'source-over';
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  filter = 'none';
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = 'low';

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      stencil: true,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('无法创建谱面 WebGL 舞台');
    if (!gl.getContextAttributes()?.stencil) throw new Error('谱面裁切缓冲不可用');
    this.gl = gl;
    this.maxAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
    this.program = stageProgram(gl, stageVertex, stageFragment);
    this.attrs = ['position', 'uv', 'color', 'shape'].map((s) => gl.getAttribLocation(this.program, s));
    this.size = gl.getUniformLocation(this.program, 'size');
    this.blur = gl.getUniformLocation(this.program, 'blurStep');
    this.sampler = gl.getUniformLocation(this.program, 'images[0]');
    this.buffer = gl.createBuffer()!;
    this.solid = this.newTexture();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([255, 255, 255, 255]),
    );
    canvas.addEventListener('webglcontextlost', this.lost);
    this.bindTarget(null);
  }
  private lost = () => {
    if (this.dead || this.reportedLoss) return;
    this.reportedLoss = true;
    const host = (window as Window & { ReactNativeWebView?: { postMessage(text: string): void } })
      .ReactNativeWebView;
    host?.postMessage(JSON.stringify({ type: 'error', message: '谱面图形上下文已丢失，请重新加载' }));
  };
  private state() {
    return {
      matrix: this.matrix,
      clips: this.clips,
      tintColor: this.tintColor,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      miterLimit: this.miterLimit,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      filter: this.filter,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      imageSmoothingEnabled: this.imageSmoothingEnabled,
    };
  }
  save() {
    this.stack.push(this.state());
  }
  restore() {
    const previous = this.stack.pop();
    if (previous) Object.assign(this, previous);
  }
  tint(r: number, g: number, b: number) {
    this.tintColor = [r, g, b, 1];
  }
  setTransform(a: number | DOMMatrix2DInit = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
    this.matrix =
      typeof a === 'number' ? [a, b, c, d, e, f] : [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
  }
  getTransform() {
    return new DOMMatrix(this.matrix);
  }
  resetTransform() {
    this.matrix = identity();
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.matrix = multiply(this.matrix, a, b, c, d, e, f);
  }
  translate(x: number, y: number) {
    this.transform(1, 0, 0, 1, x, y);
  }
  rotate(a: number) {
    const s = Math.sin(a),
      c = Math.cos(a);
    this.transform(c, s, -s, c, 0, 0);
  }
  scale(x: number, y: number) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  private get width() {
    return this.currentTarget?.width ?? this.gl.drawingBufferWidth;
  }
  private get height() {
    return this.currentTarget?.height ?? this.gl.drawingBufferHeight;
  }
  private newTexture() {
    const gl = this.gl,
      t = gl.createTexture();
    if (!t) throw new Error('谱面纹理分配失败');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    this.bound[0] = t;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  beginFrame() {
    if (this.gl.isContextLost()) this.lost();
    if (this.dead || this.reportedLoss) throw new Error('谱面图形上下文不可用');
    this.timing.sample();
    this.frame++;
    for (const [target, lastUsed] of this.idleTargets) {
      if (
        !this.timing.continuous ||
        this.frame - lastUsed > 1 ||
        this.targetPixels > this.gl.drawingBufferWidth * this.gl.drawingBufferHeight * 2
      )
        this.deleteTarget(target);
    }
    if (this.blurTarget && (!this.timing.continuous || ++this.blurAge > 2)) {
      this.releaseTarget(this.blurTarget);
      this.blurTarget = null;
    }
    if (this.currentTarget || this.surfaceWidth !== this.width || this.surfaceHeight !== this.height)
      this.bindTarget(null);
    else this.applyClip();
  }
  private pipeline() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (let i = 0; i < 4; i++) {
      const a = this.attrs[i]!;
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, [2, 2, 4, 3][i]!, gl.FLOAT, false, 44, [0, 8, 16, 32][i]!);
    }
    gl.uniform2f(this.size, this.width, this.height);
    gl.uniform1iv(this.sampler, this.units);
  }
  private drain() {
    if (!this.used) return;
    const gl = this.gl;
    for (let i = 0; i < this.units.length; i++) {
      const texture = this.textures[i] ?? this.solid;
      if (this.bound[i] === texture) continue;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      this.bound[i] = texture;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(this.blur, this.blurX, this.blurY);
    const blend = blendModes[this.blend];
    if (!blend) throw new Error('不支持的谱面混合模式 ' + this.blend);
    gl.blendFunc(blend[0], blend[1]);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.used), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.used / 11);
    this.used = 0;
    this.textures.length = 0;
  }
  flush() {
    this.drain();
    this.applyClip();
  }
  private batch(texture: WebGLTexture, op = this.globalCompositeOperation, blurX = 0, blurY = 0) {
    this.applyClip();
    if (op !== this.blend || blurX !== this.blurX || blurY !== this.blurY) {
      this.drain();
      this.blend = op;
      this.blurX = blurX;
      this.blurY = blurY;
    }
    this.chooseSlot(texture);
  }
  private chooseSlot(texture: WebGLTexture) {
    this.texture = texture;
    this.slot = this.textures.indexOf(texture);
    if (this.slot >= 0) return;
    if (this.textures.length === this.units.length) this.drain();
    this.slot = this.textures.length;
    this.textures.push(texture);
  }
  private vertex(x: number, y: number, u: number, v: number, color: Color, mode = 0, param = 0) {
    if (this.used + 11 > this.vertices.length) {
      this.drain();
      this.chooseSlot(this.texture ?? this.solid);
    }
    const a = this.vertices,
      i = this.used;
    a[i] = x;
    a[i + 1] = y;
    a[i + 2] = u;
    a[i + 3] = v;
    a[i + 4] = color[0];
    a[i + 5] = color[1];
    a[i + 6] = color[2];
    a[i + 7] = color[3];
    a[i + 8] = mode;
    a[i + 9] = param;
    a[i + 10] = this.slot;
    this.used += 11;
  }
  private color(paint: Color): Color {
    const alpha = paint[3] * Math.min(1, Math.max(0, this.globalAlpha));
    const factor = this.filter.startsWith('brightness(')
      ? Number.parseFloat(this.filter.slice(11)) * (this.filter.includes('%') ? 0.01 : 1)
      : 1;
    return [
      paint[0] * this.tintColor[0] * factor * alpha,
      paint[1] * this.tintColor[1] * factor * alpha,
      paint[2] * this.tintColor[2] * factor * alpha,
      alpha,
    ];
  }
  private rectPoints(x: number, y: number, w: number, h: number): XY[] {
    const m = this.matrix;
    return [point(m, x, y), point(m, x + w, y), point(m, x + w, y + h), point(m, x, y + h)];
  }
  private drawQuad(
    corners: XY[],
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    color: Color,
    mode = 0,
    param = 0,
  ) {
    for (const i of quad) {
      const p = corners[i]!;
      this.vertex(p[0], p[1], i === 1 || i === 2 ? u1 : u0, i >= 2 ? v1 : v0, color, mode, param);
    }
  }
  private gradientTexture(g: StageGradient) {
    let texture = this.gradients.get(g.textureKey);
    if (texture) return texture;
    if (this.gradients.size >= 128) {
      this.drain();
      const key = this.gradients.keys().next().value!;
      this.gl.deleteTexture(this.gradients.get(key)!);
      this.gradients.delete(key);
    }
    texture = this.newTexture();
    const gl = this.gl;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, g.pixels());
    this.gradients.set(g.textureKey, texture);
    return texture;
  }
  private paint(points: readonly XY[], style: Paint) {
    if (!points.length) return;
    if (
      this.globalAlpha <= 0 &&
      (this.globalCompositeOperation === 'source-over' || this.globalCompositeOperation === 'lighter')
    )
      return;
    if (style instanceof StageGradient) {
      const color = this.color(white);
      this.batch(this.gradientTexture(style));
      for (const [x, y] of points) {
        const [u, v] = style.uv(x, y);
        this.vertex(x, y, u, v, color, style.radial ? 1 : 0, style.r0 / style.r1);
      }
    } else {
      const color = this.color(rgba(style));
      this.batch(this.solid);
      for (const [x, y] of points) this.vertex(x, y, 0, 0, color);
    }
  }
  createLinearGradient(x: number, y: number, x2: number, y2: number) {
    return new StageGradient(false, x, y, x2, y2, 0, 1, this.matrix);
  }
  createRadialGradient(x: number, y: number, r: number, x2: number, y2: number, r2: number) {
    return new StageGradient(true, x, y, x2, y2, r, r2, this.matrix);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const corners = this.rectPoints(x, y, w, h);
    this.paint(
      quad.map((i) => corners[i]!),
      this.fillStyle,
    );
  }
  clearRect(x: number, y: number, w: number, h: number) {
    const m = this.matrix;
    if (
      !this.clips &&
      m[1] === 0 &&
      m[2] === 0 &&
      m[0] * x + m[4] <= 0 &&
      m[3] * y + m[5] <= 0 &&
      m[0] * (x + w) + m[4] >= this.width &&
      m[3] * (y + h) + m[5] >= this.height
    ) {
      this.flush();
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      return;
    }
    this.batch(this.solid, 'destination-out');
    this.drawQuad(this.rectPoints(x, y, w, h), 0, 0, 1, 1, white);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    this.strokePath({ points: this.rectPoints(x, y, w, h), closed: true });
  }
  beginPath() {
    this.paths = [];
    this.disk = null;
  }
  moveTo(x: number, y: number) {
    this.expandDisk();
    this.paths.push({ points: [point(this.matrix, x, y)], closed: false });
  }
  lineTo(x: number, y: number) {
    this.expandDisk();
    const p = this.paths.at(-1);
    if (!p) {
      this.moveTo(x, y);
      return;
    }
    p.points.push(point(this.matrix, x, y));
  }
  closePath() {
    const p = this.paths.at(-1);
    if (p) p.closed = true;
  }
  rect(x: number, y: number, w: number, h: number) {
    this.expandDisk();
    this.paths.push({ points: this.rectPoints(x, y, w, h), closed: true });
  }
  arc(x: number, y: number, r: number, start: number, end: number, ccw = false) {
    if (!(r > 0)) return;
    const tau = 2 * Math.PI,
      raw = end - start;
    let delta = Math.abs(raw) >= tau && (ccw ? raw < 0 : raw > 0) ? (ccw ? -tau : tau) : raw % tau;
    if (ccw && delta > 0) delta -= tau;
    else if (!ccw && delta < 0) delta += tau;
    const onlyCircle = !this.disk && !this.paths.length && Math.abs(delta) >= tau - 1e-7;
    if (onlyCircle) {
      this.disk = { x, y, r, m: this.matrix };
      return;
    }
    this.expandDisk();
    this.addArc(x, y, r, start, delta, this.matrix);
  }
  private addArc(x: number, y: number, r: number, start: number, delta: number, m: Matrix) {
    let path = this.paths.at(-1);
    if (!path || path.closed) {
      path = { points: [], closed: false };
      this.paths.push(path);
    }
    const steps = arcSteps(r * Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])), delta);
    for (let i = 0; i <= steps; i++) {
      const a = start + (delta * i) / steps;
      path.points.push(point(m, x + r * Math.cos(a), y + r * Math.sin(a)));
    }
  }
  private expandDisk() {
    const d = this.disk;
    if (!d) return;
    this.disk = null;
    this.addArc(d.x, d.y, d.r, 0, Math.PI * 2, d.m);
  }
  private drawDisk(style: Paint, stroke: boolean) {
    const d = this.disk!;
    if (style instanceof StageGradient) {
      this.expandDisk();
      return false;
    }
    const m = d.m,
      s = Math.max(0.00001, Math.min(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])));
    const radius = d.r + (stroke ? this.lineWidth / 2 : 0) + 0.5 / s,
      inner = stroke ? Math.max(0, d.r - this.lineWidth / 2 + 0.5 / s) : 0;
    const box = [
      point(m, d.x - radius, d.y - radius),
      point(m, d.x + radius, d.y - radius),
      point(m, d.x + radius, d.y + radius),
      point(m, d.x - radius, d.y + radius),
    ];
    this.batch(this.solid);
    this.drawQuad(box, -1, -1, 1, 1, this.color(rgba(style)), 2 + inner / radius, radius * s);
    return true;
  }
  fill() {
    if (this.disk && this.drawDisk(this.fillStyle, false)) return;
    for (const p of this.paths) this.paint(triangulate(p.points), this.fillStyle);
  }
  stroke() {
    if (this.disk && this.drawDisk(this.strokeStyle, true)) return;
    for (const p of this.paths) this.strokePath(p);
  }
  private strokePath(p: Contour) {
    if (this.lineWidth <= 0) return;
    const m = this.matrix,
      unmap = inverse(m);
    const local: Contour = { closed: p.closed, points: p.points.map(([x, y]) => point(unmap, x, y)) };
    this.paint(
      strokeTriangles(local, this.lineWidth / 2, this.lineCap, this.lineJoin, this.miterLimit).map(([x, y]) =>
        point(m, x, y),
      ),
      this.strokeStyle,
    );
  }
  clip() {
    this.expandDisk();
    let rect: Rect | null = null;
    const p = this.paths[0]?.points;
    if (
      this.paths.length === 1 &&
      p?.length === 4 &&
      ((p[0]![0] === p[1]![0] && p[1]![1] === p[2]![1] && p[2]![0] === p[3]![0] && p[3]![1] === p[0]![1]) ||
        (p[0]![1] === p[1]![1] && p[1]![0] === p[2]![0] && p[2]![1] === p[3]![1] && p[3]![0] === p[0]![0]))
    ) {
      rect = [
        Math.min(p[0]![0], p[2]![0]),
        Math.min(p[0]![1], p[2]![1]),
        Math.max(p[0]![0], p[2]![0]),
        Math.max(p[0]![1], p[2]![1]),
      ];
    }
    this.clips = {
      parent: this.clips,
      rect,
      vertices: rect ? [] : this.paths.flatMap((s) => triangulate(s.points)),
    };
  }
  private applyClip() {
    if (this.clips === this.appliedClip) return;
    this.drain();
    const gl = this.gl;
    this.appliedClip = this.clips;
    this.clipDepth = 0;
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    if (!this.clips) return;
    const chain: Clip[] = [];
    for (let c: Clip | null = this.clips; c; c = c.parent) chain.push(c);
    let rect: Rect | null = null;
    for (const c of chain.reverse()) {
      if (c.rect) {
        const [x, y, r, b] = c.rect;
        rect = rect
          ? [Math.max(rect[0], x), Math.max(rect[1], y), Math.min(rect[2], r), Math.min(rect[3], b)]
          : [x, y, r, b];
        continue;
      }
      if (this.currentTarget && !this.targets.get(this.currentTarget)) this.addStencil(this.currentTarget);
      gl.enable(gl.STENCIL_TEST);
      gl.stencilMask(0x7f);
      if (!this.clipDepth) {
        gl.clearStencil(0);
        gl.clear(gl.STENCIL_BUFFER_BIT);
      }
      gl.stencilFunc(gl.EQUAL, this.clipDepth, 0x7f);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
      gl.colorMask(false, false, false, false);
      this.chooseSlot(this.solid);
      this.blend = 'source-over';
      this.blurX = this.blurY = 0;
      for (const [x, y] of c.vertices) this.vertex(x, y, 0, 0, white);
      this.drain();
      this.clipDepth++;
    }
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    if (this.clipDepth) gl.stencilFunc(gl.EQUAL, this.clipDepth, 0x7f);
    if (rect) {
      gl.enable(gl.SCISSOR_TEST);
      const [x, y, r, b] = rect.map(Math.round);
      gl.scissor(x, this.height - b, Math.max(0, r - x), Math.max(0, b - y));
    }
  }
  private upload(source: CanvasImageSource, entry: ImageEntry, w: number, h: number) {
    const gl = this.gl,
      limit = deviceLimits(gl).texture;
    const size = boundedSize(w, h, 1, Math.min(4096 * 4096, IMAGE_PIXELS), limit, limit);
    let input = source as TexImageSource;
    if (size.width !== w || size.height !== h) {
      const scratch = document.createElement('canvas');
      scratch.width = size.width;
      scratch.height = size.height;
      const context = scratch.getContext('2d');
      if (!context) throw new Error('无法取样谱面纹理');
      context.drawImage(source, 0, 0, size.width, size.height);
      input = scratch;
    }
    const nextSize = size.width * size.height;
    this.imagePixels -= entry.width * entry.height;
    while (this.imagePixels + nextSize > IMAGE_PIXELS && this.images.size > 1) {
      const stale = this.images.keys().next().value!;
      if (stale === source) break;
      this.releaseImage(stale);
    }
    this.drain();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    this.bound[0] = entry.texture;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (size.width === entry.width && size.height === entry.height)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, input);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, input);
    entry.width = size.width;
    entry.height = size.height;
    entry.dirty = false;
    this.imagePixels += nextSize;
    if (input !== source && input instanceof HTMLCanvasElement) input.width = input.height = 0;
  }
  imageTexture(source: CanvasImageSource): WebGLTexture {
    const [w, h] = imageSize(source);
    if (!(w > 0 && h > 0)) throw new Error('谱面纹理无可用画面');
    let entry = this.images.get(source);
    if (!entry) {
      entry = { texture: this.newTexture(), width: 0, height: 0, dirty: true, mediaTime: -1, videoFrame: -1 };
      if (
        typeof HTMLVideoElement !== 'undefined' &&
        source instanceof HTMLVideoElement &&
        typeof source.requestVideoFrameCallback === 'function'
      ) {
        const owned = entry;
        let handle = 0;
        const next = (_: number, info: VideoFrameCallbackMetadata) => {
          owned.dirty = true;
          owned.mediaTime = info.mediaTime;
          handle = source.requestVideoFrameCallback(next);
        };
        handle = source.requestVideoFrameCallback(next);
        const seeked = () => {
          owned.dirty = true;
        };
        source.addEventListener('seeked', seeked, true);
        source.addEventListener('loadeddata', seeked, true);
        owned.cancel = () => {
          source.cancelVideoFrameCallback(handle);
          source.removeEventListener('seeked', seeked, true);
          source.removeEventListener('loadeddata', seeked, true);
        };
      }
    } else this.images.delete(source);
    this.images.set(source, entry);
    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement && !entry.cancel) {
      const count = source.getVideoPlaybackQuality?.().totalVideoFrames;
      if ((count || 0) > 0) {
        entry.dirty ||= entry.videoFrame !== count;
        entry.videoFrame = count!;
      } else {
        entry.dirty ||= entry.mediaTime !== source.currentTime;
        entry.mediaTime = source.currentTime;
      }
    }
    if (entry.dirty) this.upload(source, entry, w, h);
    return entry.texture;
  }
  invalidateImage(source: CanvasImageSource) {
    const entry = this.images.get(source);
    if (entry) entry.dirty = true;
  }
  releaseImage(source: CanvasImageSource) {
    const entry = this.images.get(source);
    if (!entry) return;
    this.drain();
    entry.cancel?.();
    this.gl.deleteTexture(entry.texture);
    this.imagePixels -= entry.width * entry.height;
    this.images.delete(source);
  }
  drawImage(source: CanvasImageSource, ...args: number[]) {
    this.drawSprite(source, args);
  }
  drawMask(source: CanvasImageSource, color: string, ...args: number[]) {
    this.drawSprite(source, args, rgba(color));
  }
  private drawSprite(source: CanvasImageSource, args: number[], mask?: Color) {
    if (
      this.globalAlpha <= 0 &&
      (this.globalCompositeOperation === 'source-over' || this.globalCompositeOperation === 'lighter')
    )
      return;
    const [iw, ih] = imageSize(source);
    if (!(iw > 0 && ih > 0)) return;
    const [sx, sy, sw, sh, dx, dy, dw, dh] =
      args.length === 8
        ? args
        : args.length === 4
          ? [0, 0, iw, ih, ...args]
          : [0, 0, iw, ih, args[0], args[1], iw, ih];
    if (!dw || !dh || !sw || !sh) return;
    /** 超出图集边缘的源矩形只画交集。 */
    const left = Math.max(0, sx!),
      top = Math.max(0, sy!),
      right = Math.min(iw, sx! + sw),
      bottom = Math.min(ih, sy! + sh);
    if (left >= right || top >= bottom) return;
    const box = this.rectPoints(
      dx! + ((left - sx!) * dw) / sw,
      dy! + ((top - sy!) * dh) / sh,
      ((right - left) * dw) / sw,
      ((bottom - top) * dh) / sh,
    );
    if (!this.visibleQuad(box)) return;
    this.imageQuad(this.imageTexture(source), box, left / iw, top / ih, right / iw, bottom / ih, mask);
  }
  private visibleQuad(box: readonly XY[]): boolean {
    let x = 0,
      y = 0,
      right = this.width,
      bottom = this.height;
    for (let clip = this.clips; clip; clip = clip.parent) {
      if (!clip.rect) continue;
      x = Math.max(x, clip.rect[0]);
      y = Math.max(y, clip.rect[1]);
      right = Math.min(right, clip.rect[2]);
      bottom = Math.min(bottom, clip.rect[3]);
    }
    return (
      !box.every((p) => p[0] <= x) &&
      !box.every((p) => p[0] >= right) &&
      !box.every((p) => p[1] <= y) &&
      !box.every((p) => p[1] >= bottom)
    );
  }
  private imageQuad(texture: WebGLTexture, box: XY[], u0: number, v0: number, u1: number, v1: number, mask?: Color) {
    const color = this.color(mask ?? white), mode = mask ? -1 : 0;
    const radius = this.filter.startsWith('blur(') ? Number.parseFloat(this.filter.slice(5)) : 0;
    if (!(radius > 0)) {
      this.batch(texture);
      this.drawQuad(box, u0, v0, u1, v1, color, mode);
      return;
    }
    const width = Math.max(1, Math.hypot(box[1]![0] - box[0]![0], box[1]![1] - box[0]![1]));
    const height = Math.max(1, Math.hypot(box[3]![0] - box[0]![0], box[3]![1] - box[0]![1]));
    const size = boundedSize(
      width,
      height,
      Math.min(1, 2 / radius) * this.effectScale,
      1_048_576,
      deviceLimits(this.gl).width,
      deviceLimits(this.gl).height,
    );
    if (!this.blurTarget || this.blurTarget.width !== size.width || this.blurTarget.height !== size.height) {
      if (this.blurTarget) this.releaseTarget(this.blurTarget);
      this.blurTarget = this.acquireTarget(size.width, size.height);
    }
    this.blurAge = 0;
    const target = this.blurTarget,
      previous = this.currentTarget,
      clip = this.clips;
    this.clips = null;
    this.bindTarget(target);
    this.batch(texture, 'copy', ((u1 - u0) * radius) / (1.64 * width), 0);
    this.drawQuad(
      [
        [0, 0],
        [target.width, 0],
        [target.width, target.height],
        [0, target.height],
      ],
      u0,
      v0,
      u1,
      v1,
      white,
    );
    this.flush();
    this.clips = clip;
    this.bindTarget(previous);
    this.batch(target.texture, this.globalCompositeOperation, 0, radius / (1.64 * height));
    this.drawQuad(box, 0, 1, 1, 0, color, mode);
  }
  private addStencil(target: StageTarget) {
    const gl = this.gl,
      r = gl.createRenderbuffer();
    if (!r) throw new Error('无法分配谱面裁切缓冲');
    gl.bindRenderbuffer(gl.RENDERBUFFER, r);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, target.width, target.height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, r);
    this.targets.set(target, r);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('谱面裁切缓冲不可用');
  }
  acquireTarget(width: number, height: number, stencil = false): StageTarget {
    this.flush();
    const gl = this.gl,
      limit = deviceLimits(gl),
      budget = gl.drawingBufferWidth * gl.drawingBufferHeight * 2;
    const requested = boundedSize(width, height, 1, Math.min(SCREEN_PIXELS, budget), limit.width, limit.height);
    for (const spare of this.idleTargets.keys()) {
      if (
        spare.width === requested.width &&
        spare.height === requested.height &&
        (!stencil || this.targets.get(spare))
      ) {
        this.idleTargets.delete(spare);
        return spare;
      }
    }
    for (const spare of this.idleTargets.keys()) {
      if (this.targetPixels + requested.width * requested.height <= budget) break;
      this.deleteTarget(spare);
    }
    const remaining = budget - this.targetPixels;
    if (remaining < 1) throw new Error('谱面特效超出像素预算');
    const size = boundedSize(width, height, 1, Math.min(SCREEN_PIXELS, remaining), limit.width, limit.height);
    const texture = this.newTexture(),
      framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      gl.deleteTexture(texture);
      throw new Error('无法分配谱面特效缓冲');
    }
    const target = { ...size, texture, framebuffer };
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.width, size.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.targets.set(target, null);
      if (stencil) this.addStencil(target);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('谱面特效缓冲不可用');
      this.targetPixels += size.width * size.height;
      return target;
    } catch (error) {
      gl.deleteRenderbuffer(this.targets.get(target) ?? null);
      this.targets.delete(target);
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw error;
    } finally {
      this.restoreTarget();
    }
  }
  bindTarget(target: StageTarget | null) {
    this.drain();
    this.currentTarget = target;
    this.restoreTarget();
  }
  restoreTarget() {
    const gl = this.gl;
    this.bound.length = 0;
    this.surfaceWidth = this.width;
    this.surfaceHeight = this.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentTarget?.framebuffer ?? null);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.colorMask(true, true, true, true);
    for (let i = 0; i < this.maxAttribs; i++) if (!this.attrs.includes(i)) gl.disableVertexAttribArray(i);
    this.pipeline();
    this.appliedClip = undefined;
    this.applyClip();
  }
  releaseTarget(target: StageTarget) {
    if (!this.targets.has(target) || this.idleTargets.has(target)) return;
    this.drain();
    if (this.currentTarget === target) this.bindTarget(null);
    if (this.timing.continuous) this.idleTargets.set(target, this.frame);
    else this.deleteTarget(target);
  }
  private deleteTarget(target: StageTarget) {
    if (this.currentTarget === target) this.bindTarget(null);
    const gl = this.gl;
    gl.deleteRenderbuffer(this.targets.get(target) ?? null);
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
    this.targets.delete(target);
    this.idleTargets.delete(target);
    this.targetPixels -= target.width * target.height;
  }
  drawTarget(target: StageTarget, x: number, y: number, w: number, h: number) {
    if (this.currentTarget === target) throw new Error('不能采样正在绘制的谱面缓冲');
    this.imageQuad(target.texture, this.rectPoints(x, y, w, h), 0, 1, 1, 0);
  }
  private textContext() {
    if (!this.glyphContext) {
      this.glyphCanvas = document.createElement('canvas');
      this.glyphContext = this.glyphCanvas.getContext('2d') ?? undefined;
      if (!this.glyphContext) throw new Error('谱面字形不可用');
    }
    this.glyphContext.font = this.font;
    return this.glyphContext;
  }
  measureText(text: string) {
    return this.textContext().measureText(text);
  }
  private drawText(text: string, x: number, y: number, stroke: boolean, maxWidth?: number) {
    if (!text) return;
    const paint = stroke ? this.strokeStyle : this.fillStyle;
    const m = this.matrix,
      ratio = Math.min(3, Math.max(1, Math.ceil(Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])))));
    const key = [this.font, this.textBaseline, stroke ? this.lineWidth : 0, this.lineJoin, ratio, text].join('|');
    let label = this.labels.get(key);
    if (!label) {
      const c = this.textContext(),
        scratch = this.glyphCanvas!;
      c.textAlign = 'left';
      c.textBaseline = this.textBaseline;
      const metrics = c.measureText(text),
        pad = stroke ? Math.ceil(this.lineWidth / 2) + 2 : 2;
      const left = Math.ceil(metrics.actualBoundingBoxLeft) + pad,
        top = Math.ceil(metrics.actualBoundingBoxAscent) + pad;
      const w = Math.max(1, Math.ceil(metrics.actualBoundingBoxRight) + left + pad),
        h = Math.max(1, Math.ceil(metrics.actualBoundingBoxDescent) + top + pad);
      const max = deviceLimits(this.gl).texture;
      const size = boundedSize(w, h, ratio, 1_048_576, max, max);
      scratch.width = size.width;
      scratch.height = size.height;
      c.scale(size.width / w, size.height / h);
      c.font = this.font;
      c.textBaseline = this.textBaseline;
      c.textAlign = 'left';
      c.lineWidth = this.lineWidth;
      c.lineJoin = this.lineJoin;
      c.strokeStyle = c.fillStyle = '#fff';
      if (stroke) c.strokeText(text, left, top);
      else c.fillText(text, left, top);
      while (
        this.labels.size &&
        (this.labelPixels + scratch.width * scratch.height > 1_048_576 || this.labels.size >= 256)
      ) {
        this.drain();
        const oldest = this.labels.keys().next().value!,
          old = this.labels.get(oldest)!;
        this.gl.deleteTexture(old.texture);
        this.labels.delete(oldest);
        this.labelPixels -= old.pixels;
      }
      const gl = this.gl,
        texture = this.newTexture();
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
      label = {
        texture,
        pixels: scratch.width * scratch.height,
        width: w,
        height: h,
        left,
        top,
        advance: metrics.width,
      };
      this.labels.set(key, label);
      this.labelPixels += label.pixels;
    }
    const scale = maxWidth === undefined ? 1 : Math.min(1, maxWidth / (label.advance || 1));
    let offset = 0;
    if (this.textAlign === 'center') offset = label.advance / 2;
    else if (this.textAlign === 'right' || this.textAlign === 'end') offset = label.advance;
    this.batch(label.texture);
    this.drawQuad(
      this.rectPoints(x - (offset + label.left) * scale, y - label.top, label.width * scale, label.height),
      0,
      0,
      1,
      1,
      this.color(typeof paint === 'string' ? rgba(paint) : white),
    );
  }
  fillText(text: string, x: number, y: number, width?: number) {
    this.drawText(text, x, y, false, width);
  }
  strokeText(text: string, x: number, y: number, width?: number) {
    this.drawText(text, x, y, true, width);
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.used = 0;
    this.clips = null;
    this.stack = [];
    this.canvas.removeEventListener('webglcontextlost', this.lost);
    for (const source of this.images.keys()) this.releaseImage(source);
    for (const target of this.targets.keys()) this.deleteTarget(target);
    releaseTracks(this as unknown as StageContext);
    const gl = this.gl;
    for (const t of this.gradients.values()) gl.deleteTexture(t);
    for (const l of this.labels.values()) gl.deleteTexture(l.texture);
    this.gradients.clear();
    this.labels.clear();
    gl.deleteTexture(this.solid);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    if (this.glyphCanvas) this.glyphCanvas.width = this.glyphCanvas.height = 0;
    contexts.delete(this.canvas);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
