import type { StageContext, StageTarget } from '../../chart-preview-shared/webview-player/stage';

import { indexPgrBlocks, samplePgrBlock, type PgrBlock } from './pgr-blocks';

const VERTEX = `
attribute vec2 position;
attribute vec4 coverage;
varying vec2 uv;
varying vec4 maskValue;
void main() {
  uv = position * .5 + .5;
  maskValue = coverage;
  gl_Position = vec4(position, 0., 1.);
}`;
const MASK = `precision mediump float;
varying vec4 maskValue;
void main() { gl_FragColor = maskValue; }`;
const WARP = `precision highp float;
uniform sampler2D regions;
uniform vec2 resolution;
uniform float time;
varying vec2 uv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.3, 311.9))) * 43758.37); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 s = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), s.x),
    mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), s.x), s.y);
}
vec2 field(vec2 p) {

  vec4 m = texture2D(regions, (p + .06) / 1.12);
  return vec2(abs(m.r - m.g), abs(m.b - m.a));
}
void main() {
  vec2 quantized = floor(uv * resolution / 4.) * 4. / resolution;
  vec2 p = quantized * vec2(resolution.x / resolution.y, 1.);
  float n1 = noise(p * 53. + vec2(time * .42, -time * .65));
  float n2 = noise(p * 137. + vec2(-time * .8, time * .3));
  float n3 = noise(p * 311. + time * .7);
  vec2 displacement = vec2(n1 + n2 * .5 - .75,
    noise(p.yx * 79. - time * .4) + n3 * .5 - .75) * .045;
  vec2 sampleUv = quantized + displacement * vec2(resolution.y / resolution.x, 1.);
  vec2 center = field(sampleUv);

  center.y = field(uv).y;
  gl_FragColor = vec4(center, displacement / .09 + .5);
}`;
const EFFECT = `precision highp float;
uniform sampler2D regions;
uniform sampler2D scene;
uniform sampler2D bounds;
uniform vec2 resolution;
uniform vec2 boundsPixel;
uniform float time;
uniform bool showEffect;
uniform bool showBounds;
varying vec2 uv;
vec2 field(vec2 p) { return texture2D(regions, p).rg; }
float fleck(vec2 p) { return fract(sin(dot(p, vec2(71.7, 163.3))) * 31973.7); }
float boundaryField(vec2 p) {
  vec2 m = texture2D(bounds, (p + .06) / 1.12).rg;
  return step(.5, abs(m.r - m.g));
}
vec4 effect() {
  vec2 pixel = 1. / resolution;
  vec2 center = field(uv);
  vec2 smallMin = center, smallMax = center, wideMin = center, wideMax = center;
  float radius = max(.35, resolution.y / 2160.);
  for (int i = 0; i < 8; i++) {
    float angle = float(i) * .7853981634;
    vec2 direction = vec2(cos(angle), sin(angle)) * pixel * radius;
    vec2 nearValue = field(uv + direction);
    vec2 farValue = field(uv + direction * 4.);
    smallMin = min(smallMin, nearValue); smallMax = max(smallMax, nearValue);
    wideMin = min(wideMin, farValue); wideMax = max(wideMax, farValue);
  }
  vec2 edge = smallMax - smallMin;
  vec2 glow = wideMax - wideMin;
  float active = center.x, waiting = center.y;
  float outline = edge.x;
  float halo = glow.x;
  float grain = .85;
  float fill = max(active * .58, waiting * .55);
  float alpha = clamp(fill + outline * .75 + halo * .15, 0., .92);
  float warning = step(active + .001, waiting);
  float pulse = step(.5, waiting) * (.5 + .5 * sin(time * 38.));
  vec3 colour = mix(vec3(.24, .008, .035), vec3(.65, .15, .23) + pulse * .16, warning);
  colour = mix(colour, vec3(.95, .21, .36) * grain, clamp(outline + halo * .35, 0., 1.));
  vec2 displacement = (texture2D(regions, uv).ba - .5) * .09;
  vec2 refract = displacement * vec2(.24, 1.) * active;
  vec3 base = texture2D(scene, uv).rgb;
  vec3 scattered = max(texture2D(scene, uv + refract).rgb - base, 0.) * active;
  float speck = step(.996, fleck(floor(uv * resolution / vec2(2., 4.)) + floor(time * 24.)));
  vec3 sparks = vec3(.25, .035, .07) * speck * max(active, waiting * .4);

  float coverage = clamp(step(.001, max(active, waiting)) + outline + halo, 0., 1.);
  return vec4((mix(base, colour, alpha) + scattered * .7 + sparks) * coverage, coverage);
}
void main() {
  vec4 colour = showEffect ? effect() : vec4(0.);
  if (showBounds) {
    float low = boundaryField(uv), high = low;
    for (int i = 0; i < 8; i++) {
      float angle = float(i) * .7853981634;
      float value = boundaryField(uv + vec2(cos(angle), sin(angle)) * boundsPixel);
      low = min(low, value); high = max(high, value);
    }
    float edge = high - low;
    colour = vec4(vec3(0., 1., 1.) * edge + colour.rgb * (1. - edge), edge + colour.a * (1. - edge));
  }
  gl_FragColor = colour;
}`;
const QUAD = /* @__PURE__ */ new Float32Array([-1,-1,0,0,0,0, 1,-1,0,0,0,0, -1,1,0,0,0,0, 1,1,0,0,0,0]);

/** 四通道分别记录启用/禁用区域及减区；MAX 使重叠区域取并集。 */
export class PgrBlockRenderer {
  private readonly gl: WebGLRenderingContext;
  private readonly maxBlend: number;
  private readonly textureLimit: number;
  private readonly shaders: WebGLShader[] = [];
  private readonly programs: WebGLProgram[] = [];
  private readonly buffer: WebGLBuffer;
  private vertices = new Float32Array(6 * 6 * 64);
  private candidates: (time: number) => PgrBlock[];
  private enabledCandidates: (time: number) => PgrBlock[];
  private disposed = false;
  private scene: StageTarget | null = null;
  private maskTarget: StageTarget | null = null;
  private warpTarget: StageTarget | null = null;

  constructor(blocks: readonly PgrBlock[], private readonly stage: StageContext) {
    this.candidates = indexPgrBlocks(blocks);
    this.enabledCandidates = indexPgrBlocks(blocks, true);
    const gl = stage.gl;
    this.gl = gl;
    this.textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const blend = gl.getExtension('EXT_blend_minmax');
    if (!blend) throw new Error('谱面区域合成不可用');
    this.maxBlend = blend.MAX_EXT;
    this.buffer = gl.createBuffer()!;
    try {
      if (!this.buffer) throw new Error('谱面区域显存分配失败');
      this.programs.push(this.program(MASK));
      this.programs.push(this.program(WARP));
      this.programs.push(this.program(EFFECT));
    } catch (error) { this.dispose(); throw error; }
  }

  private program(fragment: string): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram();
    if (!program) throw new Error('谱面区域着色器不可用');
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('谱面区域着色器不可用');
        this.shaders.push(shader);
        gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`谱面区域着色器编译失败：${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(program, shader);
      }
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('谱面区域着色器链接失败');
      return program;
    } catch (error) { gl.deleteProgram(program); throw error; }
  }

  private bind(program: WebGLProgram): void {
    const gl = this.gl;
    gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 24, 0);
    const coverage = gl.getAttribLocation(program, 'coverage');
    if (coverage >= 0) { gl.enableVertexAttribArray(coverage); gl.vertexAttribPointer(coverage, 4, gl.FLOAT, false, 24, 8); }
  }

  private geometry(time: number, aspect: number, enabledOnly = false): number {
    const candidates = (enabledOnly ? this.enabledCandidates : this.candidates)(time);
    const capacity = Math.max(36, candidates.length * 36);
    if (this.vertices.length < capacity) this.vertices = new Float32Array(2 ** Math.ceil(Math.log2(capacity)));
    let cursor = 0;
    for (const block of candidates) {
      const sample = samplePgrBlock(block, time, aspect, enabledOnly);
      if (!sample || sample.corners.some(point => !point.every(Number.isFinite))) continue;
      if (sample.corners.every(p => p[0] < -.05) || sample.corners.every(p => p[0] > 1.05)
        || sample.corners.every(p => p[1] < -.05) || sample.corners.every(p => p[1] > 1.05)) continue;
      const channel = (sample.enabled ? 0 : 2) + (sample.subtract ? 1 : 0);
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const point = sample.corners[index]!;
        this.vertices[cursor++] = (point[0] + .06) / 1.12 * 2 - 1;
        this.vertices[cursor++] = (point[1] + .06) / 1.12 * 2 - 1;
        for (let c = 0; c < 4; c++) this.vertices[cursor++] = c === channel ? sample.opacity : 0;
      }
    }
    return cursor;
  }

  private mask(cursor: number, target: StageTarget): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.bind(this.programs[0]!);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, cursor), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND); gl.blendEquation(this.maxBlend); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, cursor / 6);
    gl.disable(gl.BLEND);
  }

  private releaseTargets(): void {
    for (const target of [this.scene, this.maskTarget, this.warpTarget]) if (target) this.stage.releaseTarget(target);
    this.scene = this.maskTarget = this.warpTarget = null;
  }

  prepare(time: number, width: number, height: number, showEffect: boolean, showBounds: boolean): { count: number; scene: StageTarget } | null {
    if (this.disposed) return null;
    const count = showEffect ? this.geometry(time, width / height) : 0;
    if (!count && (!showBounds || !this.enabledCandidates(time).some(b => time >= b.enable && time < b.disable))) {
      this.releaseTargets(); return null;
    }
    const w = this.stage.canvas.width, h = this.stage.canvas.height;
    if (this.scene && (this.scene.width !== w || this.scene.height !== h)) this.releaseTargets();
    this.scene ??= this.stage.acquireTarget(w, h);
    return { count, scene: this.scene };
  }

  draw(scene: StageTarget, region: { count: number }, time: number, width: number, height: number, showBounds: boolean): void {
    const cursor = region.count, gl = this.gl;
    if (gl.isContextLost()) throw new Error('谱面区域图形上下文已丢失，请重新加载');
    const scale = Math.min(Math.SQRT1_2, Math.sqrt(1_048_576 / (scene.width * scene.height)), this.textureLimit / Math.max(scene.width, scene.height)) * this.stage.effectScale;
    const w = Math.max(1, Math.floor(scene.width * scale)), h = Math.max(1, Math.floor(scene.height * scale));
    if (this.maskTarget && (this.maskTarget.width !== w || this.maskTarget.height !== h)) {
      this.stage.releaseTarget(this.maskTarget); this.maskTarget = null;
      if (this.warpTarget) { this.stage.releaseTarget(this.warpTarget); this.warpTarget = null; }
    }
    const mask = this.maskTarget ??= this.stage.acquireTarget(w, h);
    if (!cursor && this.warpTarget) { this.stage.releaseTarget(this.warpTarget); this.warpTarget = null; }
    const warped = cursor ? (this.warpTarget ??= this.stage.acquireTarget(w, h)) : null;
    try {
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
      gl.viewport(0, 0, w, h);
      if (cursor) {
        this.mask(cursor, mask);
        gl.bindFramebuffer(gl.FRAMEBUFFER, warped!.framebuffer);
        const warp = this.programs[1]!;
        this.bind(warp);
        gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STREAM_DRAW);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, mask.texture);
        gl.uniform1i(gl.getUniformLocation(warp, 'regions'), 0);
        gl.uniform2f(gl.getUniformLocation(warp, 'resolution'), w, h);
        gl.uniform1f(gl.getUniformLocation(warp, 'time'), time);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (showBounds) this.mask(this.geometry(time, width / height, true), mask);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, scene.width, scene.height);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      const effect = this.programs[2]!;
      this.bind(effect);
      gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STREAM_DRAW);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, (warped ?? mask).texture);
      gl.uniform1i(gl.getUniformLocation(effect, 'regions'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, scene.texture);
      gl.uniform1i(gl.getUniformLocation(effect, 'scene'), 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, mask.texture);
      gl.uniform1i(gl.getUniformLocation(effect, 'bounds'), 2);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(gl.getUniformLocation(effect, 'resolution'), w, h);
      gl.uniform2f(gl.getUniformLocation(effect, 'boundsPixel'), 1 / width, 1 / height);
      gl.uniform1f(gl.getUniformLocation(effect, 'time'), time);
      gl.uniform1i(gl.getUniformLocation(effect, 'showEffect'), cursor ? 1 : 0);
      gl.uniform1i(gl.getUniformLocation(effect, 'showBounds'), showBounds ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } finally {
      this.stage.bindTarget(null);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseTargets();
    const gl = this.gl;
    this.programs.forEach(program => gl.deleteProgram(program));
    this.shaders.forEach(shader => gl.deleteShader(shader));
    this.programs.length = 0;
    this.shaders.length = 0;
    gl.deleteBuffer(this.buffer);
    this.vertices = new Float32Array(0);
    this.candidates = () => [];
    this.enabledCandidates = () => [];
  }
}
