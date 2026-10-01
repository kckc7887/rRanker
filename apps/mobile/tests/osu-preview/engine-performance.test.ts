import assert from 'node:assert/strict';
import { afterAll, beforeAll, describe, it, vi } from 'vitest';
import * as catchInput from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/catch/input';
import { catchRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/catch/index';
import { maniaRenderSession, resolveTrackOpacity, taikoLookback, visibleJudgements, visibleManiaObjects, type PreviewRenderOptions } from '../../src/features/osu-chart-preview/webview-player/engine-performance';
import { buildAutoReplay } from '../../src/features/osu-chart-preview/webview-player/autoplay';
import { computeModDifficulty, parseBeatmap, type HitResult, type SkinAssets } from '../../src/features/osu-chart-preview/webview-player/engine';
import { maniaRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/mania/index';
import { taikoRuleset } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/index';
import type { ManiaHitObject } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/mania/types';
import type { TaikoHitObject , TaikoDrumRoll } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/types';
import type { RenderOptions } from '../../src/features/osu-chart-preview/webview-player/engine/renderer/Renderer';
import { fixtureOsu } from './fixtures';
import { computeDrumrollTint } from '../../src/features/osu-chart-preview/webview-player/engine/rulesets/taiko/Playfield';
import { shouldShowHeadArrow, shouldShowTailArrow } from '../../src/features/osu-chart-preview/webview-player/engine/renderer/HitObjectRenderer';
import { applyStacking } from '../../src/features/osu-chart-preview/webview-player/engine/utils/stacking';
import { computeHitResults } from '../../src/features/osu-chart-preview/webview-player/engine/utils/hitJudge';
import { computeScoreTimeline } from '../../src/features/osu-chart-preview/webview-player/engine/utils/scoreProcessor';
import { sliderNestedEvents } from '../../src/features/osu-chart-preview/webview-player/engine/utils/sliderDuration';

describe('indexed render candidates', () => {
  it('streams every stable and lazer tick, repeat and tail in the original order', () => {
    const beatmap = parseBeatmap(fixtureOsu(0, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,0,L|300:192,5,100'));
    const slider = beatmap.hitObjects[0]!;
    if (slider.type !== 'slider') throw new Error('slider required');
    for (const tickRate of [0, 1, 3, 11]) for (const duration of [0, 500, 501, 501.001, 1733.33]) for (const lazer of [false, true]) {
      beatmap.sliderTickRate = tickRate;
      const interval = 500 / tickRate;
      const expected: { t: number; kind: 'tick' | 'repeat' | 'tail' }[] = [];
      if (Number.isFinite(interval)) for (let slide = 0; slide < slider.slides; slide++) {
        const start = slider.time + slide * duration;
        if (lazer) {
          for (let k = 1; k * interval <= duration - 1; k++) expected.push({ t: start + k * interval, kind: 'tick' });
        } else {
          for (let t = start + interval; t < start + duration - 1; t += interval) expected.push({ t, kind: 'tick' });
        }
      }
      for (let edge = 1; edge < slider.slides; edge++) expected.push({ t: slider.time + duration * edge, kind: 'repeat' });
      expected.sort((a, b) => a.t - b.t);
      expected.push({ t: slider.time + duration * slider.slides, kind: 'tail' });
      assert.deepEqual([...sliderNestedEvents(beatmap, slider, duration, lazer)], expected);
    }
    slider.slides = 1e9;
    const events = sliderNestedEvents(beatmap, slider, 500, false);
    for (let i = 0; i < 20; i++) assert.equal(events.next().done, false);
    events.return(undefined);
  });
  it('does not expand a full slider timeline just to classify scoring results', () => {
    const beatmap = parseBeatmap(fixtureOsu(0, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,0,L|300:192,1000000000,100'));
    const replay = buildAutoReplay(new TextEncoder().encode(fixtureOsu(0, 'Native')), '');
    let reads = 0;
    Object.defineProperty(beatmap.hitObjects[0], 'slides', { get() {
      assert.ok(++reads < 20, 'scoring must not pre-expand every nested event'); return 1e9;
    } });
    assert.deepEqual(computeScoreTimeline([], beatmap, computeModDifficulty(beatmap, replay)), []);
  });
  it('aims auto inputs at the same stacked positions as the rendered chart', () => {
    const text = fixtureOsu(0, 'Stack').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n'
      + Array.from({ length: 24 }, (_, i) => `256,192,${1000 + i * 60},1,0,0:0:0:0:`).join('\n'));
    const beatmap = parseBeatmap(text);
    const replay = buildAutoReplay(new TextEncoder().encode(text), '');
    const difficulty = computeModDifficulty(beatmap, replay);
    applyStacking(beatmap, difficulty);
    const judged = computeHitResults(beatmap, replay, difficulty);
    assert.equal(judged.results.length, 24);
    assert.ok(judged.results.every(result => result.judgement === 300));
  });
  it('computes slider reversal arrows without scanning repeats, including endpoints and reverse seeks', () => {
    for (const slides of [1, 2, 3, 4, 17, 100]) for (const duration of [0, 1, 123.5, -1]) {
      for (const time of [10000, 0, 700, 500, 623.5, 747, 500 + duration * (slides - 1)]) {
        const reference = (parity: number) => Array.from({ length: slides - 1 }, (_, k) => k)
          .some(k => k % 2 === parity && time < 500 + duration * (k + 1));
        assert.equal(shouldShowTailArrow(slides, time, 500, duration), reference(0));
        assert.equal(shouldShowHeadArrow(slides, time, 500, duration), reference(1));
      }
    }
    let comparisons = 0;
    // Instrument numeric comparisons rather than asserting machine-dependent elapsed time.
    const time = { valueOf: () => { assert.ok(++comparisons < 20, 'must not visit every repeat'); return 1e15; } } as unknown as number;
    assert.equal(shouldShowTailArrow(1e9, time, 500, 100), false);
    assert.equal(shouldShowHeadArrow(1e9, time, 500, 100), false);
  });
  it('matches tick-by-tick drumroll tint for overlaps, missed ticks, fades and seeks', () => {
    const roll: TaikoDrumRoll = { kind: 'drumroll', time: 1000, endTime: 6000, tickInterval: 100,
      tickCount: 51, sourceIndex: 0, isStrong: false, hitSound: 0 };
    const hits = [950, 1050, 1100, 1149, 1250, 1260, 1451, 2500, 5000, 5100, 5200].map(time => ({
      objectIndex: 0, judgement: 300, time, x: 0, y: 0, hitSound: 0, comboIgnore: true,
    } as HitResult));
    const reference = (now: number) => {
      let rolling = 0, previous = 0, last = -Infinity, hitIndex = 0;
      for (let tick = 0; tick < roll.tickCount; tick++) {
        const time = roll.time + tick * roll.tickInterval;
        while (hitIndex < hits.length && hits[hitIndex]!.time < time - 50) hitIndex++;
        const hit = hitIndex < hits.length && hits[hitIndex]!.time <= time + 50;
        const event = hit ? hits[hitIndex++]!.time : time + 50;
        if (event > now) break;
        const next = hit ? Math.min(5, rolling + 1) : Math.max(0, rolling - 1);
        if (next !== rolling) { previous = rolling; last = event; }
        rolling = next;
      }
      const fade = Number.isFinite(last) ? Math.max(0, Math.min(1, (now - last) / 100)) : 1;
      const f = (previous + (rolling - previous) * fade) / 5;
      return `rgb(${Math.round(238 - 34 * f)}, ${Math.round(170 - 68 * f)}, 0)`;
    };
    for (const time of Array.from({ length: 180 }, (_, index) => 6500 - index * 37)) {
      assert.equal(computeDrumrollTint(roll, hits, time), reference(time), `tint at ${time}`);
    }
  });

  it('skips silent drumroll intervals and preserves tint across reverse seeks', () => {
    let reads = 0;
    const roll: TaikoDrumRoll = { kind: 'drumroll', time: 0, endTime: 1e12, tickInterval: 100,
      get tickCount() { assert.ok(++reads < 1000, 'must not scan all historical ticks'); return 1e10; },
      sourceIndex: 0, isStrong: false, hitSound: 0 };
    const hits = [0, 100, 200, 300, 400, 999999999900].map(time => ({
      objectIndex: 0, judgement: 300, time, x: 0, y: 0, hitSound: 0, comboIgnore: true,
    } as HitResult));
    assert.equal(computeDrumrollTint(roll, hits, 1e12), 'rgb(231, 156, 0)');
    assert.equal(computeDrumrollTint(roll, hits, 400), 'rgb(211, 116, 0)');
    assert.equal(computeDrumrollTint(roll, hits, -1), 'rgb(238, 170, 0)');
    assert.equal(computeDrumrollTint(roll, hits, 10000), 'rgb(238, 170, 0)');
  });
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
function sessionInput(mode: 1 | 2 | 3) {
  const objects = mode === 3 ? '64,192,2000,1,0,0:0:0:0:\n192,192,2200,128,0,2600:0:0:0:0:' : '256,192,2000,1,0,0:0:0:0:';
  const text = fixtureOsu(mode, 'Easy').replace(/\[HitObjects\][\s\S]*$/, `1500,-50,4,1,0,100,0,0\n\n[HitObjects]\n${objects}\n`);
  const beatmap = parseBeatmap(text), replay = buildAutoReplay(new TextEncoder().encode(text), '');
  return { beatmap, replay, mod: computeModDifficulty(beatmap, replay) };
}

describe('visual render settings', () => {
  it('judges catch misses once without diagnostic trajectory resampling or console output', () => {
    const { beatmap, replay, mod } = sessionInput(2);
    replay.frames = [{ timeDelta: 0, x: 0, y: 0, keys: 0 }];
    const samples = vi.spyOn(catchInput, 'sampleCatcherX');
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const session = catchRuleset.build(beatmap, replay, mod, skin([]), 1);
      assert.equal(session.hitResults.length, 1);
      assert.equal(session.hitResults[0]!.judgement, 0);
      assert.equal(session.accFrames.at(-1)!.acc, 0);
      assert.equal(samples.mock.calls.length, session.objects.length);
      assert.equal(output.mock.calls.length, 0);
    } finally { samples.mockRestore(); output.mockRestore(); }
  });

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
