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
import { sliderNestedEvents } from '../../src/features/osu-chart-preview/webview-player/engine/utils/sliderDuration';

describe('indexed render candidates', () => {
  it('does not parse or mutate a pre-cancelled auto preparation', async () => {
    const controller = new AbortController();
    const reason = new Error('already cancelled');
    controller.abort(reason);
    const beatmap = parseBeatmap(fixtureOsu(0, 'Native'));
    Object.defineProperty(beatmap, 'mode', { get() { throw new Error('read after cancellation'); } });
    await assert.rejects(buildAutoReplay(beatmap, '', controller.signal), error => error === reason);
  });
  it('cancels native taiko auto generation between drumroll ticks', async () => {
    const beatmap = parseBeatmap(fixtureOsu(1, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,0,L|300:192,128,100'));
    const controller = new AbortController();
    const reason = new Error('drumroll preparation cancelled');
    const timer = setTimeout(() => controller.abort(reason), 0);
    try { await assert.rejects(buildAutoReplay(beatmap, '', controller.signal), error => error === reason); }
    finally { clearTimeout(timer); }
  });
  it('cancels slider autoplay while preparation is in progress', async () => {
    const beatmap = parseBeatmap(fixtureOsu(0, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,0,L|300:192,128,100'));
    const controller = new AbortController();
    const reason = new Error('preparation cancelled');
    const timer = setTimeout(() => controller.abort(reason), 0);
    try { await assert.rejects(buildAutoReplay(beatmap, '', controller.signal), error => error === reason); }
    finally { clearTimeout(timer); }
  });
  it.each([0, 1, 2, 3] as const)('keeps batched and synchronous auto input identical in mode %s', async mode => {
    const text = fixtureOsu(mode, 'Hard');
    assert.deepEqual(await buildAutoReplay(new TextEncoder().encode(text), 'hash', new AbortController().signal),
      buildAutoReplay(new TextEncoder().encode(text), 'hash'));
  });
  it('orders slider ticks, repeats and tails for stable and lazer', () => {
    const beatmap = parseBeatmap(fixtureOsu(0, 'Native').replace(/\[HitObjects\][\s\S]*$/, '[HitObjects]\n256,192,1000,2,0,L|300:192,2,100'));
    const slider = beatmap.hitObjects[0]!;
    if (slider.type !== 'slider') throw new Error('slider required');
    beatmap.sliderTickRate = 2;
    for (const lazer of [false, true]) assert.deepEqual([...sliderNestedEvents(beatmap, slider, 500, lazer)], [
      { t: 1250, kind: 'tick' }, { t: 1500, kind: 'repeat' },
      { t: 1750, kind: 'tick' }, { t: 2000, kind: 'tail' },
    ]);
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
  it('shows reversal arrows until the corresponding repeat, including reverse seeks', () => {
    for (const [time, tail, head] of [[0, true, true], [600, true, true], [750, false, true], [1000, false, false], [500, true, true]] as const) {
      assert.equal(shouldShowTailArrow(3, time, 500, 250), tail);
      assert.equal(shouldShowHeadArrow(3, time, 500, 250), head);
    }
    assert.equal(shouldShowTailArrow(1, 0, 500, 250), false);
    assert.equal(shouldShowHeadArrow(1, 0, 500, 250), false);
  });
  it('fades drumroll tint after hits and missed ticks and restores it on seek', () => {
    const roll: TaikoDrumRoll = { kind: 'drumroll', time: 1000, endTime: 1400, tickInterval: 100,
      tickCount: 5, sourceIndex: 0, isStrong: false, hitSound: 0 };
    const hits = [1000, 1100].map(time => ({ objectIndex: 0, judgement: 300, time, x: 0, y: 0, hitSound: 0, comboIgnore: true } as HitResult));
    for (const [time, tint] of [[999, 'rgb(238, 170, 0)'], [1050, 'rgb(235, 163, 0)'],
      [1200, 'rgb(224, 143, 0)'], [1300, 'rgb(228, 150, 0)'], [1500, 'rgb(238, 170, 0)'], [1050, 'rgb(235, 163, 0)']] as const) {
      assert.equal(computeDrumrollTint(roll, hits, time), tint);
    }
  });
  it('displays judgements in painter order and respects delayed display and seek', () => {
    const results = [
      { time: 100, judgement: 100 },
      { time: 200, judgement: 300 },
      { time: 300, judgement: 100, isSliderSub: true },
      { time: 400, judgement: 100, comboIgnore: true },
      { time: 0, displayTime: 500, judgement: 100 },
    ] as HitResult[];
    assert.deepEqual(visibleJudgements(results, 600, false, 1100), [results[0], results[3], results[4]]);
    assert.deepEqual(visibleJudgements(results, 600, true, 1100), [results[0], results[1], results[2], results[4]]);
    assert.deepEqual(visibleJudgements(results, 100, false, 1100), [results[0]]);
    assert.deepEqual(visibleJudgements(results, 1601, false, 1100), []);
  });

  it('includes taps and intersecting holds in their original order across seeks', () => {
    const objects = [
      { kind: 'hold', startTime: 0, endTime: 2000 },
      { kind: 'note', time: 100 },
      { kind: 'note', time: 600 },
      { kind: 'hold', startTime: 500, endTime: 1000 },
    ] as ManiaHitObject[];
    assert.deepEqual(visibleManiaObjects(objects, 550, 650), [objects[0], objects[2], objects[3]]);
    assert.deepEqual(visibleManiaObjects(objects, 0, 0), [objects[0]]);
    assert.deepEqual(visibleManiaObjects(objects, -100, -1), []);
    assert.deepEqual(visibleManiaObjects(objects, 2001, 3000), []);
    assert.deepEqual(visibleManiaObjects(objects, 100, 100), [objects[0], objects[1]]);
  });

  it('extends taiko lookback to cover rolls and swells', () => {
    const objects = [{ kind: 'hit', time: 0 }, { kind: 'drumroll', time: 300, endTime: 900 }, { kind: 'swell', time: 500, endTime: 2000 }] as TaikoHitObject[];
    assert.equal(taikoLookback(objects), 2000);
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
