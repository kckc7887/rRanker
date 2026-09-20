import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { maniaRenderSession, resolveTrackOpacity, taikoLookback, visibleJudgements, visibleManiaObjects, type PreviewRenderOptions } from '../../src/features/osu-chart-preview/webview-player/engine-performance';
import { buildAutoReplay } from '../../src/features/osu-chart-preview/webview-player/autoplay';
import { computeModDifficulty, parseBeatmap, type HitResult, type SkinAssets } from '../../src/features/osu-chart-preview/webview-player/engine';
import { maniaRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/mania/index';
import { taikoRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/index';
import type { ManiaHitObject } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/mania/types';
import type { TaikoHitObject } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/types';
import type { RenderOptions } from '../../src/features/osu-chart-preview/webview-player/engine/renderer/Renderer';
import { fixtureOsu } from './fixtures';

describe('indexed render candidates', () => {
  it('matches the original judgement filters and painter order, including delayed displays and reverse seeks', () => {
    const results = Array.from({ length: 180 }, (_, index) => ({
      time: index * 27, displayTime: index % 5 ? undefined : index * 27 + 800,
      judgement: index % 3 ? 300 : 100, isSliderSub: index % 9 === 0, comboIgnore: index % 7 === 0,
    })) as HitResult[];
    for (const time of [2000, 0, 1800, 4200, 27, 9999, 1100, 2800]) for (const taiko of [true, false]) {
      const expected = results.filter(result => !(taiko ? result.comboIgnore : result.isSliderSub || result.judgement === 300))
        .filter(result => time >= (result.displayTime ?? result.time) && time - (result.displayTime ?? result.time) <= 1100);
      assert.deepEqual(visibleJudgements(results, time, taiko, 1100), expected);
    }
  });

  it('returns the same ordered mania taps and intersecting holds as a full scan, without a long-hold scan per frame', () => {
    const values = Array.from({ length: 12000 }, (_, index) => index % 17 === 0
      ? { kind: 'hold', startTime: index * 10, endTime: index * 10 + (index === 0 ? 150000 : 500) }
      : { kind: 'note', time: index * 10 }) as ManiaHitObject[];
    let reads = 0;
    const objects = new Proxy(values, { get(target, key, receiver) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++; return Reflect.get(target, key, receiver); } });
    for (const [min, max] of [[60000, 60400], [0, 0], [-100, -1], [115000, 115500], [500, 2000], [150000, 160000]]) {
      const expected = values.filter(object => (object.kind === 'note' ? object.time : object.startTime) <= max!
        && (object.kind === 'note' ? object.time : object.endTime) >= min!);
      assert.deepEqual(visibleManiaObjects(objects, min!, max!), expected);
    }
    reads = 0;
    visibleManiaObjects(objects, 60000, 60400);
    assert.ok(reads < 100, `only visible objects should be read after index preparation, got ${reads}`);
  });

  it('caches the same taiko lookback over the immutable object list', () => {
    let reads = 0;
    const objects = [{ kind: 'hit', time: 0 }, { kind: 'drumroll', time: 300, endTime: 900 }, { kind: 'swell', time: 500, endTime: 2000 }] as TaikoHitObject[];
    const tracked = new Proxy(objects, { get(target, key, receiver) { if (typeof key === 'string' && /^\d+$/.test(key)) reads++; return Reflect.get(target, key, receiver); } });
    assert.equal(taikoLookback(tracked), 2000);
    reads = 0;
    assert.equal(taikoLookback(tracked), 2000);
    assert.equal(reads, 0);
    assert.equal(taikoLookback([]), 1000);
  });
});

type Bitmap = ImageBitmap & { label: string };
type Draw = { label: string; args: number[]; alpha: number };
function recorder() {
  const draws: Draw[] = [];
  let alpha = 1;
  const stack: number[] = [];
  const ctx = new Proxy({
    get globalAlpha() { return alpha; }, set globalAlpha(value: number) { alpha = value; },
    save() { stack.push(alpha); }, restore() { alpha = stack.pop()!; },
    drawImage(image: Bitmap, ...args: number[]) { draws.push({ label: image.label, args, alpha }); },
    fillRect(...args: number[]) { draws.push({ label: 'fill', args, alpha }); },
    getTransform() { return { a: 1, d: 1 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  }, { get(target, key) { return Reflect.get(target, key) ?? (() => {}); } }) as unknown as CanvasRenderingContext2D;
  return { ctx, draws };
}
class CanvasStub {
  label = 'tint';
  constructor(readonly width: number, readonly height: number) {}
  getContext() { const ctx = recorder().ctx; ctx.drawImage = ((image: Bitmap) => { this.label = image.label; }) as typeof ctx.drawImage; return ctx; }
}
const originalCanvas = globalThis.OffscreenCanvas;
beforeAll(() => { globalThis.OffscreenCanvas = CanvasStub as unknown as typeof OffscreenCanvas; });
afterAll(() => { if (originalCanvas) globalThis.OffscreenCanvas = originalCanvas; else Reflect.deleteProperty(globalThis, 'OffscreenCanvas'); });

const renderOptions = (extra: PreviewRenderOptions = {}) => ({ showJudgement: false, showKeyOverlay: false, modHidden: false, modFlashlight: false, maniaScrollSpeed: 10, ...extra }) as RenderOptions;
const skin = (stems: string[]) => ({
  images: new Map(stems.map(label => [`${label}.png`, { label, width: 64, height: 64 }])),
  spinnerImages: new Map(), sounds: new Map(), config: { version: '2.7', maniaSections: [], comboColors: ['#fff'] },
}) as unknown as SkinAssets;
function sessionInput(mode: 1 | 3) {
  const objects = mode === 3 ? '64,192,2000,1,0,0:0:0:0:\n192,192,2200,128,0,2600:0:0:0:0:' : '256,192,2000,1,0,0:0:0:0:';
  const text = fixtureOsu(mode, 'Easy').replace(/\[HitObjects\][\s\S]*$/, `1500,-50,4,1,0,100,0,0\n\n[HitObjects]\n${objects}\n`);
  const beatmap = parseBeatmap(text), replay = buildAutoReplay(new TextEncoder().encode(text), '');
  return { beatmap, replay, mod: computeModDifficulty(beatmap, replay) };
}

describe('visual render settings', () => {
  it('normalizes opacity without treating zero as absent', () => {
    assert.equal(resolveTrackOpacity({}, 'mania'), 1);
    assert.equal(resolveTrackOpacity({ maniaTrackOpacity: 0 }, 'mania'), 0);
    assert.equal(resolveTrackOpacity({ maniaTrackOpacity: -1 }, 'mania'), 0);
    assert.equal(resolveTrackOpacity({ maniaTrackOpacity: 2 }, 'mania'), 1);
    assert.equal(resolveTrackOpacity({ taikoTrackOpacity: NaN }, 'taiko'), 1);
  });

  it('toggles fixed mania scroll in the same renderer session while preserving judgement/input/map identities', () => {
    const { beatmap, replay, mod } = sessionInput(3);
    const session = maniaRuleset.build(beatmap, replay, mod, skin(['mania-note1', 'mania-note2', 'mania-note2h', 'mania-note2l', 'mania-key1', 'mania-key2', 'mania-key2d']), 1);
    const before = JSON.stringify(session.hitResults);
    const flat = maniaRenderSession(session, { maniaIgnoreSV: true });
    assert.equal(maniaRenderSession(session, { maniaIgnoreSV: true }), flat);
    assert.equal(maniaRenderSession(session, {}), session);
    for (const key of ['objects', 'hitResults', 'holdStates', 'replay', 'beatmap', 'inputEvents', 'pressIntervals'] as const) assert.equal(flat[key], session[key]);
    assert.deepEqual(flat.scroll, { times: [0], multipliers: [1], cumRaw: [0] });
    assert.ok(session.scroll.multipliers.includes(2));
    const draw = (ignore: boolean, time: number) => { const r = recorder(); maniaRuleset.draw(r.ctx, session, time, renderOptions({ maniaIgnoreSV: ignore })); return r.draws; };
    const normal = draw(false, 1700), fixed = draw(true, 1700);
    assert.ok(normal.some(d => d.label === 'mania-note1') && fixed.some(d => d.label === 'mania-note1'));
    assert.notDeepEqual(normal.find(d => d.label === 'mania-note1')?.args, fixed.find(d => d.label === 'mania-note1')?.args);
    assert.deepEqual(draw(false, 1700), normal, 'toggling back must restore the original exact drawing commands');
    const heldNormal = draw(false, 2300).find(d => d.label === 'mania-note2h');
    const heldFixed = draw(true, 2300).find(d => d.label === 'mania-note2h');
    assert.ok(heldNormal && heldFixed);
    assert.deepEqual(heldFixed?.args, heldNormal?.args, 'a held head remains pinned to the same receptor');
    assert.equal(JSON.stringify(session.hitResults), before);
  });

  it('fades only mania track pieces, preserving note and receptor draw commands', () => {
    const { beatmap, replay, mod } = sessionInput(3);
    const assets = skin(['mania-note1', 'mania-note2', 'mania-key1', 'mania-key2', 'mania-stage-left', 'mania-stage-right', 'mania-stage-bottom']);
    const session = maniaRuleset.build(beatmap, replay, mod, assets, 1);
    const a = recorder(), b = recorder();
    maniaRuleset.draw(a.ctx, session, 1700, renderOptions());
    maniaRuleset.draw(b.ctx, session, 1700, renderOptions({ maniaTrackOpacity: 0 }));
    const gameplay = (draws: Draw[]) => draws.filter(draw => /mania-(?:key|note)/.test(draw.label));
    assert.ok(gameplay(a.draws).length > 0);
    assert.deepEqual(gameplay(b.draws), gameplay(a.draws));
    assert.ok(b.draws.filter(draw => !/mania-(?:key|note)/.test(draw.label)).every(draw => draw.alpha === 0));
    assert.equal(b.ctx.globalAlpha, 1);
  });

  it('fades taiko lane and bar lines while retaining the input drum, targets and notes', () => {
    const { beatmap, replay, mod } = sessionInput(1);
    const assets = skin(['taiko-bar-left', 'taiko-bar-right', 'taiko-barline', 'taikohitcircle', 'taikohitcircleoverlay', 'taikobigcircle']);
    const session = taikoRuleset.build(beatmap, replay, mod, assets, 1);
    const a = recorder(), b = recorder();
    taikoRuleset.draw(a.ctx, session, 1900, renderOptions());
    taikoRuleset.draw(b.ctx, session, 1900, renderOptions({ taikoTrackOpacity: 0 }));
    const isTrack = (draw: Draw) => ['taiko-bar-right', 'taiko-barline'].includes(draw.label);
    assert.ok(b.draws.some(isTrack));
    assert.ok(b.draws.filter(isTrack).every(draw => draw.alpha === 0));
    assert.deepEqual(b.draws.filter(draw => !isTrack(draw)), a.draws.filter(draw => !isTrack(draw)));
    assert.ok(b.draws.some(draw => draw.label === 'taiko-bar-left' && draw.alpha === 1));
    assert.equal(b.ctx.globalAlpha, 1);
  });
});
