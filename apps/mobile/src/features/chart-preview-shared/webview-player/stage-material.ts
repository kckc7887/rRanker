import { type Matrix, inverse, point } from './stage-geometry';

export type Color = [number, number, number, number];
const colors = new Map<string, Color>();
export function rgba(css: string): Color {
  let c = colors.get(css);
  if (c) return c;
  const name = css.trim().toLowerCase();
  const named: Record<string, string> = {
    white: '#fff',
    black: '#000',
    transparent: '#0000',
    red: '#f00',
    blue: '#00f',
    green: '#008000',
    yellow: '#ff0',
    cyan: '#0ff',
  };
  let value = named[name] ?? name;
  if (value[0] === '#') {
    value = value.slice(1);
    if (value.length === 3 || value.length === 4)
      value = value
        .split('')
        .map((ch) => ch + ch)
        .join('');
    const channel = (p: number) => Number.parseInt(value.slice(p, p + 2), 16) / 255;
    c = [channel(0), channel(2), channel(4), value.length === 8 ? channel(6) : 1];
  } else {
    const fields = value.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?%?/gi) ?? [];
    const channel = (i: number) => Number.parseFloat(fields[i] ?? '0') / (fields[i]?.endsWith('%') ? 100 : 255);
    if (value.startsWith('hsl')) {
      const h = (((Number.parseFloat(fields[0] ?? '0') / 360) % 1) + 1) % 1,
        s = Number.parseFloat(fields[1] ?? '0') / 100,
        l = Number.parseFloat(fields[2] ?? '0') / 100;
      const rgb = (n: number) => {
        const k = (n + h * 12) % 12;
        return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      };
      c = [rgb(0), rgb(8), rgb(4), 1];
    } else c = [channel(0), channel(1), channel(2), 1];
    if (fields[3]) c[3] = Number.parseFloat(fields[3]) / (fields[3].endsWith('%') ? 100 : 1);
  }
  if (colors.size >= 1024) colors.clear();
  colors.set(css, c);
  return c;
}

export class StageGradient implements CanvasGradient {
  readonly stops: { offset: number; color: Color; css: string }[] = [];
  private key?: string;
  readonly unmap: Matrix;
  constructor(
    readonly radial: boolean,
    readonly x: number,
    readonly y: number,
    readonly x2: number,
    readonly y2: number,
    readonly r0: number,
    readonly r1: number,
    transform: Matrix,
  ) {
    this.unmap = inverse(transform);
  }
  addColorStop(offset: number, css: string): void {
    const previous = this.stops.at(-1);
    this.stops.push({ offset, color: rgba(css), css });
    if (previous && previous.offset > offset) this.stops.sort((a, b) => a.offset - b.offset);
    this.key = undefined;
  }
  get textureKey(): string {
    return (this.key ??= this.stops.map((s) => s.offset + ':' + s.css).join('|'));
  }
  uv(px: number, py: number): [number, number] {
    const [x, y] = point(this.unmap, px, py);
    if (this.radial) return [(x - this.x) / Math.max(0.00001, this.r1), (y - this.y) / Math.max(0.00001, this.r1)];
    const dx = this.x2 - this.x,
      dy = this.y2 - this.y;
    return [((x - this.x) * dx + (y - this.y) * dy) / (dx * dx + dy * dy || 1), 0.5];
  }
  pixels(): Uint8Array {
    const bytes = new Uint8Array(256 * 4),
      stops = this.stops;
    if (!stops.length) return bytes;
    let index = 0;
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      while (index + 1 < stops.length && stops[index + 1]!.offset <= t) index++;
      const a = stops[index]!,
        b = stops[Math.min(index + 1, stops.length - 1)]!;
      const f = Math.max(0, Math.min(1, (t - a.offset) / (b.offset - a.offset || 1)));
      const alpha = a.color[3] + (b.color[3] - a.color[3]) * f;
      for (let c = 0; c < 3; c++)
        bytes[i * 4 + c] = Math.round(255 * alpha * (a.color[c]! + (b.color[c]! - a.color[c]!) * f));
      bytes[i * 4 + 3] = Math.round(alpha * 255);
    }
    return bytes;
  }
}

export function stageProgram(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('无法建立谱面着色程序');
  const shaders: WebGLShader[] = [];
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('无法建立谱面着色器');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(shader) ?? '谱面着色器编译失败');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? '谱面着色器链接失败');
    return program;
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

export const stageVertex = `
attribute vec2 position;
attribute vec2 uv;
attribute vec4 color;
attribute vec3 shape;
uniform vec2 size;
varying vec2 texCoord;
varying vec4 tintColor;
varying vec3 shapeMode;
void main() {
  gl_Position=vec4(position/size*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
  texCoord=uv; tintColor=color; shapeMode=shape;
}`;

export const stageFragment = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D images[8];
uniform vec2 blurStep;
varying vec2 texCoord;
varying vec4 tintColor;
varying vec3 shapeMode;
vec4 sampleImage(vec2 uv){
  if(shapeMode.z<.5)return texture2D(images[0],uv);
  if(shapeMode.z<1.5)return texture2D(images[1],uv);
  if(shapeMode.z<2.5)return texture2D(images[2],uv);
  if(shapeMode.z<3.5)return texture2D(images[3],uv);
  if(shapeMode.z<4.5)return texture2D(images[4],uv);
  if(shapeMode.z<5.5)return texture2D(images[5],uv);
  if(shapeMode.z<6.5)return texture2D(images[6],uv);
  return texture2D(images[7],uv);
}
void main(){
  vec2 uv=texCoord;
  if(shapeMode.x>1.5){
    float d=length(uv);
    float outer=clamp((1.-d)*shapeMode.y,0.,1.);
    float inner=clamp((d-(shapeMode.x-2.))*shapeMode.y+1.,0.,1.);
    gl_FragColor=tintColor*outer*inner;return;
  }
  if(shapeMode.x>.5)uv=vec2(clamp((length(uv)-shapeMode.y)/max(.00001,1.-shapeMode.y),0.,1.),.5);
  vec4 pixel=sampleImage(uv);
  if(blurStep.x!=0. || blurStep.y!=0.){
    pixel*=.227027;
    pixel+=.316216*(sampleImage(uv+blurStep*1.384615)+sampleImage(uv-blurStep*1.384615));
    pixel+=.070270*(sampleImage(uv+blurStep*3.230769)+sampleImage(uv-blurStep*3.230769));
  }
  if(shapeMode.x<-.5)pixel=vec4(pixel.a);
  gl_FragColor=pixel*tintColor;
}`;
