/** MajdataViewX prefabs, animation curves and MaimaiColorEffect shader.
 * Copyright MajdataViewX contributors; GPL-3.0. Modified by rRanker 2026-09-05.
 * See THIRD_PARTY_NOTICES.md and scripts/maimai-reference/Effects. */
import { EFFECT_CURVES } from './effectCurves.generated';
import { EFFECT_SCENES, EFFECT_SPRITES, HOLD_PARTICLES, type EffectNode } from './effectSprites.generated';
import type { ChartPreviewSkin } from './skinAtlas';
import type { StageContext } from '../../../chart-preview-shared/webview-player/stage';

function sample(keys: (number | null)[][], seconds: number): number {
  if (seconds <= keys[0][0]!) return keys[0][1]!;
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i]; if (seconds > b[0]!) continue;
    const a = keys[i - 1], span = b[0]! - a[0]!, t = (seconds - a[0]!) / span;
    if (a[3] === null || b[2] === null) return a[1]!;
    return (2 * t ** 3 - 3 * t ** 2 + 1) * a[1]! + (t ** 3 - 2 * t ** 2 + t) * span * a[3]! + (-2 * t ** 3 + 3 * t ** 2) * b[1]! + (t ** 3 - t ** 2) * span * b[2]!;
  }
  return keys[keys.length - 1][1]!;
}
export function effectCurve(name: string, path: string, field: string, seconds: number, fallback = 1): number {
  const keys = EFFECT_CURVES[name]?.curves[`${path}:${field}`];
  return keys?.length ? sample(keys, seconds) : fallback;
}
export const holdRipplePhase = (nowMs: number, startMs: number) => Math.max(0, nowMs - startMs) / (HOLD_PARTICLES.lifetime * 1000);
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function holdParticleState(ageMs: number) {
  const phase = holdRipplePhase(ageMs, 0), keys = HOLD_PARTICLES.alpha;
  let alpha = keys[keys.length - 1][1];
  for (let i = 1; i < keys.length; i++) if (phase <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i]; alpha = a[1] + (b[1] - a[1]) * clamp((phase - a[0]) / (b[0] - a[0])); break;
  }
  return { size: sample(HOLD_PARTICLES.size, phase) * HOLD_PARTICLES.sizeMultiplier, alpha: phase >= 1 ? 0 : alpha };
}
export class EffectRenderer {
  private shader: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private readonly vertices = new Float32Array(16);
  constructor(private skin: ChartPreviewSkin) {}
  dispose(ctx: StageContext) {
    if (this.shader) ctx.gl.deleteProgram(this.shader);
    if (this.buffer) ctx.gl.deleteBuffer(this.buffer);
    this.shader = null; this.buffer = null;
  }
  private sprite(name: string) {
    const image = this.skin.get(`ViewXEffects/${name}`);
    if (!image) throw new Error(`Missing effect sprite: ${name}`);
    return image;
  }
  private firework(ctx: StageContext, sprite: HTMLImageElement, x: number, y: number, w: number, h: number, alpha: number, time: number) {
    const gl = ctx.gl;
    ctx.flush();
    if (!this.shader) {
      const program = gl.createProgram()!;
      const vertex = 'attribute vec4 vertex; varying vec2 uv; void main(){gl_Position=vec4(vertex.xy,0.,1.);uv=vertex.zw;}';
      const fragment = `precision mediump float;
varying vec2 uv; uniform sampler2D sprite; uniform vec3 effect;
void main() {
  vec2 p = uv - .5;
  float angle = atan(-p.y,p.x); if (angle <= 0.) angle += 6.2831853;
  float hue = ceil(fract(angle/6.28*3.+effect.x*.2)*5.)/5.;
  vec3 v = clamp(abs(mod(hue*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);
  float radius = min(1.,dot(p,p)*4.)*effect.y;
  float a = clamp((radius-.018)/.036,0.,1.) * clamp((.429-radius)/.069,0.,1.) * effect.z;
  vec4 color = texture2D(sprite,uv);
  gl_FragColor = vec4(color.rgb * mix(vec3(1.), v*v*(3.-2.*v), .545),color.a)*a;
}`;
      try {
        for (const [kind, source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const) {
          const shader = gl.createShader(kind)!;
          try {
            gl.shaderSource(shader, source); gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('烟花着色器编译失败');
            gl.attachShader(program, shader);
          } finally { gl.deleteShader(shader); }
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('烟花着色器链接失败');
      } catch (error) { gl.deleteProgram(program); throw error; }
      this.shader = program;
      this.buffer = gl.createBuffer();
    }
    const transform = ctx.getTransform();
    const vertices = this.vertices;
    for (let i = 0; i < 4; i++) {
      const u = i % 2, v = i >> 1, px = x + u*w, py = y + v*h;
      vertices[i*4] = (transform.a*px + transform.c*py + transform.e) * 2 / ctx.canvas.width - 1;
      vertices[i*4+1] = 1 - (transform.b*px + transform.d*py + transform.f) * 2 / ctx.canvas.height;
      vertices[i*4+2] = u; vertices[i*4+3] = v;
    }
    const texture = ctx.imageTexture(sprite);
    gl.useProgram(this.shader);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    const attr = gl.getAttribLocation(this.shader, 'vertex');
    gl.enableVertexAttribArray(attr); gl.vertexAttribPointer(attr, 4, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(this.shader, 'sprite'), 0);
    gl.uniform3f(gl.getUniformLocation(this.shader, 'effect'), Math.ceil(time*.0025) % 5, alpha, ctx.globalAlpha);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.restoreTarget();
  }
  draw(ctx: StageContext, kind: 'tap' | 'touch' | 'hold' | 'firework', ageMs: number, isBreak: boolean, timeMs: number) {
    if (kind === 'hold') {
      const state = holdParticleState(ageMs); ctx.globalAlpha *= state.alpha;
      const image = this.sprite('Circle.png'); ctx.tint(1, 245 / 255, 93 / 255);
      ctx.drawImage(image, -state.size / 2, -state.size / 2, state.size, state.size); return;
    }
    const name = isBreak && kind === 'tap' ? 'break' : kind, t = ageMs / 1000 * (name === 'break' ? 0.9 : 1);
    const nodes = EFFECT_SCENES[name], curve = (node: EffectNode, field: string, fallback: number) => effectCurve(name, node.path, field, t, fallback);
    const active = (node: EffectNode): boolean => curve(node, 'm_IsActive', 1) >= 0.5 && (node.parent === null || active(nodes.find(n => n.path === node.parent)!));
    const transform = (node: EffectNode) => {
      if (node.parent !== null) transform(nodes.find(n => n.path === node.parent)!);
      ctx.translate(curve(node, 'position.x', node.position.x), -curve(node, 'position.y', node.position.y));
      ctx.rotate(-curve(node, 'rotation.z', node.angle) * Math.PI / 180);
      ctx.scale(curve(node, 'scale.x', node.scale.x), curve(node, 'scale.y', node.scale.y));
    };
    for (const node of [...nodes].filter(n => n.sprite).sort((a, b) => a.order - b.order)) {
      if ((name !== 'break' && node.sprite === 'Star_Perfect.png') || node.sprite === 'TouchEffectStar_1.png' || node.sprite === 'TouchEffectStar_2.png') continue;
      if (!active(node) || curve(node, 'm_Enabled', 1) < 0.5) continue;
      ctx.save(); transform(node);
      const alpha = curve(node, node.shader ? 'material._Alpha' : 'm_Color.a', node.color?.a ?? 1);
      ctx.globalAlpha *= clamp(alpha);
      const image = this.sprite(node.sprite!);
      const sprite = EFFECT_SPRITES[node.sprite!], width = sprite.width / sprite.ppu, height = sprite.height / sprite.ppu;
      const x = -width * sprite.pivot.x, y = -height * (1 - sprite.pivot.y);
      if (node.shader) this.firework(ctx, image, x, y, width, height, alpha, timeMs);
      else {
        const color = (c: 'r' | 'g' | 'b') => clamp(curve(node, 'm_Color.' + c, node.color?.[c] ?? 1));
        ctx.tint(color('r'), color('g'), color('b'));
        ctx.drawImage(image, x, y, width, height);
      }
      ctx.restore();
    }
  }
}
