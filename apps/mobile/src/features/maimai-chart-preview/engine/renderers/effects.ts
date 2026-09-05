/** MajdataViewX prefabs, animation curves and MaimaiColorEffect shader adapted to Canvas 2D.
 * Copyright MajdataViewX contributors; GPL-3.0. Modified by rRanker 2026-09-05.
 * See THIRD_PARTY_NOTICES.md and scripts/maimai-reference/Effects. */
import { EFFECT_CURVES } from './effectCurves.generated';
import { EFFECT_SCENES, EFFECT_SPRITES, HOLD_PARTICLES, type EffectNode } from './effectSprites.generated';
import type { ChartPreviewSkin } from './skinAtlas';

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
  private tinted = new Map<string, HTMLCanvasElement>();
  private shaderFrames: HTMLCanvasElement[] | null = null;
  private shaderCanvas: HTMLCanvasElement | null = null;
  constructor(private skin: ChartPreviewSkin) {}
  prepare() { if (!this.shaderFrames) this.firework(0, 0); }
  private sprite(name: string) {
    const image = this.skin.get(`ViewXEffects/${name}`);
    if (!image) throw new Error(`Missing effect sprite: ${name}`);
    return image;
  }
  private colorSprite(name: string, color: string) {
    const key = `${name}:${color}`, cached = this.tinted.get(key); if (cached) return cached;
    const image = this.sprite(name), canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = color; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(image, 0, 0);
    if (this.tinted.size >= 32) this.tinted.delete(this.tinted.keys().next().value!);
    this.tinted.set(key, canvas); return canvas;
  }
  private firework(alpha: number, time: number): HTMLCanvasElement {
    if (!this.shaderFrames) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(this.sprite('Firework.png'), 0, 0, 512, 512);
      const original = ctx.getImageData(0, 0, 512, 512);
      this.shaderFrames = Array.from({ length: 5 }, (_, phase) => {
        const frame = document.createElement('canvas'); frame.width = frame.height = 512;
        const context = frame.getContext('2d')!, pixels = context.createImageData(512, 512);
        for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
          let angle = Math.atan2(255.5 - y, x - 255.5); if (angle <= 0) angle += Math.PI * 2;
          const hue = Math.ceil(((angle / 6.28 * 3 + phase * 0.2) % 1) * 5) / 5;
          const index = (y * 512 + x) * 4;
          for (let c = 0; c < 3; c++) {
            const v = clamp(Math.abs((hue * 6 + [0, 4, 2][c]) % 6 - 3) - 1);
            pixels.data[index + c] = original.data[index + c] * (1 - 0.545 + 0.545 * v * v * (3 - 2 * v));
          }
          pixels.data[index + 3] = original.data[index + 3];
        }
        context.putImageData(pixels, 0, 0); return frame;
      });
      this.shaderCanvas = canvas;
    }
    const canvas = this.shaderCanvas!, ctx = canvas.getContext('2d')!;
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(this.shaderFrames[((Math.ceil(time * 0.5 * 5) % 5) + 5) % 5], 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, Math.sqrt(2) * 256);
    // Canvas interpolates radial stops; dense samples reproduce the shader's squared-radius ramps.
    for (let i = 0; i <= 128; i++) {
      const radius = Math.min(1, (i / 128) ** 2 * 2) * alpha;
      const opacity = clamp((radius - 0.018) / (0.054 - 0.018)) * clamp((0.429 - radius) / (0.429 - 0.36));
      gradient.addColorStop(i / 128, `rgba(255,255,255,${opacity})`);
    }
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 512); return canvas;
  }
  draw(ctx: CanvasRenderingContext2D, kind: 'tap' | 'touch' | 'hold' | 'firework', ageMs: number, isBreak: boolean, timeMs: number, color?: string) {
    if (kind === 'hold') {
      const state = holdParticleState(ageMs); ctx.globalAlpha *= state.alpha;
      const image = this.colorSprite('Circle.png', color ?? (isBreak ? '#ffbe50' : '#ffb7e8'));
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
      if (!active(node) || curve(node, 'm_Enabled', 1) < 0.5) continue;
      ctx.save(); transform(node);
      const alpha = curve(node, node.shader ? 'material._Alpha' : 'm_Color.a', node.color?.a ?? 1);
      ctx.globalAlpha *= clamp(alpha);
      const color = ['r', 'g', 'b'].map(c => Math.round(clamp(curve(node, `m_Color.${c}`, node.color?.[c as 'r' | 'g' | 'b'] ?? 1)) * 255));
      const image = node.shader ? this.firework(alpha, timeMs / 1000) : this.colorSprite(node.sprite!, `rgb(${color.join(',')})`);
      const sprite = EFFECT_SPRITES[node.sprite!], width = sprite.width / sprite.ppu, height = sprite.height / sprite.ppu;
      ctx.drawImage(image, -width * sprite.pivot.x, -height * (1 - sprite.pivot.y), width, height);
      ctx.restore();
    }
  }
}
