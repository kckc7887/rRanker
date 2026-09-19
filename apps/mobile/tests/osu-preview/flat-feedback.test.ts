import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { CIRCLE_FEEDBACK_MS, drawFlatCircleFeedback, drawFlatInputDrum } from '../../src/features/osu-chart-preview/webview-player/flat-feedback';
import { buildAutoReplay } from '../../src/features/osu-chart-preview/webview-player/autoplay';
import { computeModDifficulty, parseBeatmap, type SkinAssets } from '../../src/features/osu-chart-preview/webview-player/engine';
import { taikoRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/index';
import { catchRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/catch/index';
import { maniaRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/mania/index';
import type { RenderOptions } from '../../src/features/osu-chart-preview/webview-player/engine/renderer/Renderer';
import { fixtureOsu } from './fixtures';

type Bitmap = ImageBitmap & { label: string };
type Draw = { kind: 'image' | 'arc'; label?: string; x: number; y: number; width: number; height: number; alpha: number; mirrored?: boolean };
const bitmap = (label: string, width = 90, height = 200) => ({ label, width, height, close() {} }) as Bitmap;

function recorder() {
  const draws: Draw[] = [];
  let state = { tx: 0, ty: 0, sx: 1, sy: 1, globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const stack: typeof state[] = [];
  const ctx = new Proxy({
    save() { stack.push({ ...state }); },
    restore() { state = stack.pop()!; },
    translate(x: number, y: number) { state.tx += x * state.sx; state.ty += y * state.sy; },
    scale(x: number, y: number) { state.sx *= x; state.sy *= y; },
    arc(x: number, y: number, radius: number) {
      draws.push({ kind: 'arc', x: state.tx + x * state.sx, y: state.ty + y * state.sy, width: radius, height: radius, alpha: state.globalAlpha });
    },
    drawImage(image: Bitmap, ...args: number[]) {
      const [x, y, width = image.width, height = image.height] = args.length === 8 ? args.slice(4) : args;
      draws.push({ kind: 'image', label: image.label, x: state.tx + x! * state.sx, y: state.ty + y! * state.sy,
        width: width! * state.sx, height: height! * state.sy, alpha: state.globalAlpha, mirrored: state.sx < 0 });
    },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    getTransform() { return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; },
    measureText() { return { width: 0 }; },
  }, {
    get(target, key) { return key in state ? Reflect.get(state, key) : Reflect.get(target, key) ?? (() => {}); },
    set(target, key, value) { return Reflect.set(key in state ? state : target, key, value); },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
}

class CanvasStub {
  label = 'tinted';
  constructor(readonly width: number, readonly height: number) {}
  getContext() {
    const ctx = recorder().ctx;
    ctx.drawImage = ((image: Bitmap) => { this.label = image.label; }) as typeof ctx.drawImage;
    return ctx;
  }
}
const originalCanvas = globalThis.OffscreenCanvas;
beforeAll(() => { globalThis.OffscreenCanvas = CanvasStub as unknown as typeof OffscreenCanvas; });
afterAll(() => {
  if (originalCanvas) globalThis.OffscreenCanvas = originalCanvas;
  else Reflect.deleteProperty(globalThis, 'OffscreenCanvas');
});

function skin(stems: string[] = []): SkinAssets {
  return {
    images: new Map(stems.map(stem => [`${stem}.png`, bitmap(stem)])), spinnerImages: new Map(), sounds: new Map(),
    config: { version: '2.7', comboColors: ['#80ead5'], maniaSections: [], hitCirclePrefix: 'default', scorePrefix: 'score', comboPrefix: 'combo' },
  } as unknown as SkinAssets;
}
const options = { showJudgement: false, showKeyOverlay: false, modHidden: false, modFlashlight: false, maniaScrollSpeed: 20 } as RenderOptions;
function input(mode: 0 | 1 | 2 | 3, objects: string) {
  const text = fixtureOsu(mode, 'Easy').replace(/\[HitObjects\][\s\S]*$/, `[HitObjects]\n${objects}\n`);
  const beatmap = parseBeatmap(text);
  const replay = buildAutoReplay(new TextEncoder().encode(text), '');
  return { beatmap, replay, mod: computeModDifficulty(beatmap, replay) };
}

describe('local flat feedback', () => {
  it('fades a standard hit at its fixed position without exceeding its original circle', () => {
    const { ctx, draws } = recorder();
    for (const age of [-1, 0, 40, 80, 159, CIRCLE_FEEDBACK_MS, 240]) drawFlatCircleFeedback(ctx, 420, 280, 64, '#fff', age);
    assert.equal(draws.length, 4);
    for (const draw of draws) assert.deepEqual([draw.x, draw.y, draw.width], [420, 280, 57.5]);
    for (const [index, expected] of [0.6, 0.45, 0.3, 0.00375].entries()) assert.ok(Math.abs(draws[index]!.alpha - expected) < 1e-12);
    assert.equal(ctx.globalAlpha, 1);
    assert.equal(ctx.globalCompositeOperation, 'source-over');
  });

  it('aligns each taiko input to its exact half-drum without the legacy skin offsets', () => {
    const images = skin(['taiko-drum-inner', 'taiko-drum-outer']).images;
    // Deliberately use @2x and a different texture size: display geometry must remain fixed.
    images.set('taiko-drum-inner@2x.png', bitmap('inner-hires', 180, 400));
    const idle = { LeftCentre: -Infinity, RightCentre: -Infinity, LeftRim: -Infinity, RightRim: -Infinity };
    for (const action of ['LeftCentre', 'RightCentre', 'LeftRim', 'RightRim'] as const) {
      const { ctx, draws } = recorder();
      drawFlatInputDrum(ctx, { ...idle, [action]: 1000 }, 1015, images, 0, 260, 180, 200);
      assert.equal(draws.length, 1);
      const draw = draws[0]!;
      const right = action.startsWith('Right');
      assert.deepEqual([draw.x, draw.y, draw.width, draw.height, draw.alpha], [right ? 180 : 0, 260, right ? -90 : 90, 200, 0.75]);
      assert.equal(draw.label, action.endsWith('Centre') ? 'inner-hires' : 'taiko-drum-outer');
      assert.equal(ctx.globalAlpha, 1);
    }
    const { ctx, draws } = recorder();
    for (const now of [999, 1060, 2000]) drawFlatInputDrum(ctx, { ...idle, LeftCentre: 1000 }, now, images, 0, 260, 180, 200);
    assert.equal(draws.length, 0, 'seeking before or after a press cannot leave stale light');
  });

  it('preserves native taiko note travel, removes post-hit copies and keeps drum feedback', () => {
    const { beatmap, replay, mod } = input(1, '256,192,1000,1,0,0:0:0:0:');
    const session = taikoRuleset.build(beatmap, replay, mod, skin(['taiko-drum-inner', 'taiko-drum-outer', 'taiko-hit300', 'taiko-glow']), 1);
    assert.equal(session.hitResults[0]!.judgement, 300);
    const before = recorder();
    taikoRuleset.draw(before.ctx, session, 900, options);
    assert.ok(before.draws.some(draw => draw.kind === 'arc' && draw.x > 256 && draw.y === 360 && draw.width === 45));
    const after = recorder();
    taikoRuleset.draw(after.ctx, session, 1015, options);
    assert.equal(after.draws.filter(draw => draw.kind === 'arc').length, 0, 'no note should enter a flying-hit pass');
    assert.deepEqual(after.draws.filter(draw => draw.kind === 'image').map(draw => draw.label), ['taiko-drum-inner']);
    const later = recorder();
    taikoRuleset.draw(later.ctx, session, 1250, options);
    assert.equal(later.draws.length, 0, 'no delayed explosion or gravity arc');
  });

  it('keeps only the current catcher position after a rapid catch, without plate fruit, trails or splashes', () => {
    const { beatmap, replay, mod } = input(2, '32,192,1000,1,0,0:0:0:0:\n480,192,1120,1,0,0:0:0:0:');
    const session = catchRuleset.build(beatmap, replay, mod, skin(['fruit-catcher-idle', 'fruit-pear', 'fruit-grapes', 'scoreboard-explosion-1', 'scoreboard-explosion-2']), 1);
    assert.equal(session.hitResults.filter(result => result.judgement > 0).length, 2);
    for (const time of [1121, 1140, 1180, 1300, 1500]) {
      const { ctx, draws } = recorder();
      catchRuleset.draw(ctx, session, time, options);
      const images = draws.filter(draw => draw.kind === 'image');
      assert.ok(images.length > 0);
      assert.ok(images.every(draw => draw.label === 'fruit-catcher-idle'));
      // The original hyperdash red tint may overlay the body, at exactly the same position.
      assert.equal(new Set(images.map(({ x, y, width, height }) => JSON.stringify([x, y, width, height]))).size, 1);
      assert.equal(draws.filter(draw => draw.kind === 'arc').length, 0);
    }
  });

  it('keeps mania key presses and hold heads while suppressing all three lighting layers', () => {
    const { beatmap, replay, mod } = input(3, '64,192,1000,128,0,1500:0:0:0:0:');
    const assets = skin(['lightingn', 'lightingl', 'mania-stage-light', 'mania-key1', 'mania-key1d', 'mania-note1', 'mania-note1h', 'mania-note1l']);
    const session = maniaRuleset.build(beatmap, replay, mod, assets, 1);
    for (const time of [1001, 1050, 1200, 1501, 1600]) {
      const { ctx, draws } = recorder();
      maniaRuleset.draw(ctx, session, time, options);
      assert.ok(draws.some(draw => draw.kind === 'image'), 'gameplay must still render');
      assert.ok(!draws.some(draw => ['lightingn', 'lightingl', 'mania-stage-light'].includes(draw.label ?? '')));
      if (time < 1500) assert.ok(draws.some(draw => draw.label === 'mania-key1d'), 'held key must still use pressed art');
    }
  });
});

