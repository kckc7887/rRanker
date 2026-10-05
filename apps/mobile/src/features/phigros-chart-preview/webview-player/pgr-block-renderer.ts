/** PGR region masks and procedural edge lighting. No external shader or texture assets. */
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
  // A padded mask preserves offscreen geometry without inventing a screen-edge outline.
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
  // Warning rectangles keep their geometric boundary; only enabled areas distort.
  center.y = field(uv).y;
  gl_FragColor = vec4(center, displacement / .09 + .5);
}`;
const EFFECT = `precision highp float;
uniform sampler2D regions;
uniform sampler2D scene;
uniform vec2 resolution;
uniform float time;
varying vec2 uv;
vec2 field(vec2 p) { return texture2D(regions, p).rg; }
float fleck(vec2 p) { return fract(sin(dot(p, vec2(71.7, 163.3))) * 31973.7); }
void main() {
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
  // Preserve the original canvas outside the effect, including its full pixel resolution.
  float coverage = clamp(step(.001, max(active, waiting)) + outline + halo, 0., 1.);
  gl_FragColor = vec4((mix(base, colour, alpha) + scattered * .7 + sparks) * coverage, coverage);
}`;

/** Four channels: enabled normal/subtract, disabled normal/subtract. MAX keeps overlaps a union. */
export class PgrBlockRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly gl: WebGLRenderingContext;
  private readonly maxBlend: number;
  private readonly textureLimit: number;
  private readonly shaders: WebGLShader[] = [];
  private readonly programs: WebGLProgram[] = [];
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly warped: WebGLTexture;
  private readonly scene: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  private vertices = new Float32Array(6 * 6 * 64);
  private candidates: (time: number) => PgrBlock[];
  private width = 0;
  private height = 0;
  private disposed = false;
  lastCandidateCount = 0;
  lastDrawnCount = 0;

  constructor(blocks: readonly PgrBlock[]) {
    this.candidates = indexPgrBlocks(blocks);
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true,
      antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('谱面区域特效需要 WebGL');
    this.gl = gl;
    this.textureLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const blend = gl.getExtension('EXT_blend_minmax');
    if (!blend) { gl.getExtension('WEBGL_lose_context')?.loseContext(); throw new Error('谱面区域合成不可用'); }
    this.maxBlend = blend.MAX_EXT;
    this.buffer = gl.createBuffer()!;
    this.texture = gl.createTexture()!;
    this.warped = gl.createTexture()!;
    this.scene = gl.createTexture()!;
    this.framebuffer = gl.createFramebuffer()!;
    try {
      if (!this.buffer || !this.texture || !this.warped || !this.scene || !this.framebuffer) throw new Error('谱面区域显存分配失败');
      this.programs.push(this.program(MASK));
      this.programs.push(this.program(WARP));
      this.programs.push(this.program(EFFECT));
      for (const texture of [this.texture, this.warped, this.scene]) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
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

  private geometry(time: number, aspect: number): number {
    const candidates = this.candidates(time);
    this.lastCandidateCount = candidates.length;
    this.lastDrawnCount = 0;
    const capacity = Math.max(36, candidates.length * 36);
    if (this.vertices.length < capacity) this.vertices = new Float32Array(2 ** Math.ceil(Math.log2(capacity)));
    let cursor = 0;
    for (const block of candidates) {
      const sample = samplePgrBlock(block, time, aspect);
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
      this.lastDrawnCount++;
    }
    return cursor;
  }

  draw(context: CanvasRenderingContext2D, time: number, width: number, height: number, pixelWidth: number, pixelHeight: number): void {
    if (this.disposed) return;
    const gl = this.gl;
    if (gl.isContextLost()) throw new Error('谱面区域图形上下文已丢失，请重新加载');
    if (pixelWidth > this.textureLimit || pixelHeight > this.textureLimit) {
      throw new Error('谱面区域画面尺寸超出图形设备限制');
    }
    const cursor = this.geometry(time, width / height);
    if (!cursor) return;
    // Bound the auxiliary framebuffer independently of device DPR.
    const scale = Math.min(1, Math.sqrt(1_048_576 / (pixelWidth * pixelHeight)));
    const w = Math.max(1, Math.round(pixelWidth * scale)), h = Math.max(1, Math.round(pixelHeight * scale));
    if (w !== this.width || h !== this.height) {
      this.width = this.canvas.width = w; this.height = this.canvas.height = h;
      for (const texture of [this.texture, this.warped]) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('谱面区域缓冲区不可用');
      }
    }
    gl.viewport(0, 0, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    this.bind(this.programs[0]!);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, cursor), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND); gl.blendEquation(this.maxBlend); gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, cursor / 6);
    gl.disable(gl.BLEND);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.warped, 0);
    const warp = this.programs[1]!;
    this.bind(warp);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,0,0,0,0, 1,-1,0,0,0,0, -1,1,0,0,0,0, 1,1,0,0,0,0]), gl.STREAM_DRAW);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(gl.getUniformLocation(warp, 'regions'), 0);
    gl.uniform2f(gl.getUniformLocation(warp, 'resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(warp, 'time'), time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const effect = this.programs[2]!;
    this.bind(effect);
    gl.bindTexture(gl.TEXTURE_2D, this.warped);
    gl.uniform1i(gl.getUniformLocation(effect, 'regions'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, context.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(gl.getUniformLocation(effect, 'scene'), 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(gl.getUniformLocation(effect, 'resolution'), w, h);
    gl.uniform1f(gl.getUniformLocation(effect, 'time'), time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    context.save(); context.globalAlpha = 1;
    context.drawImage(this.canvas, 0, 0, width, height); context.restore();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    this.programs.forEach(program => gl.deleteProgram(program));
    this.shaders.forEach(shader => gl.deleteShader(shader));
    this.programs.length = 0;
    this.shaders.length = 0;
    gl.deleteBuffer(this.buffer); gl.deleteTexture(this.texture); gl.deleteTexture(this.warped); gl.deleteTexture(this.scene); gl.deleteFramebuffer(this.framebuffer);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 0;
    this.vertices = new Float32Array(0);
    this.candidates = () => [];
  }
}
