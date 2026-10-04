/*
 * Derived from replayviewer-js src/player/hitsoundSchedule.ts
 * https://github.com/daladal/replayviewer-js
 * Source SHA-256: 49a4fe82d83e22fffc19bc080dd931c28b4049b7e0011a93997dcf59a76c9f13
 * Local changes: preview-only audio, complete media range, and identity-preserving hitsound events.
 *
 * MIT License
 *
 * Copyright (c) 2026 bog
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import type { BeatmapData, HitResult, HitSample, TimingPoint } from '../engine/types/index';
import type { ComboFrame } from '../engine/renderer/HUDRenderer';
import type { TaikoInputEvent } from '../engine/rulesets/taiko/input';
import { slideDurationMs, sliderEdgeSample } from '../engine/utils/sliderDuration';
import { upperBoundBy } from '../../../chart-preview-shared/webview-player/sorted-search';

const AUDIO_EXTS = ['.wav', '.mp3', '.ogg'];

/** 仅在 combo 从大于 20 重置为 0 时播放断连音效。 */

const COMBO_BREAK_MIN = 20;

function scheduleComboBreaks(
  sounds: PendingSound[],
  comboFrames: readonly ComboFrame[],
  oldOffsetMs: number,
  fromBeatmapMs: number,
): void {
  let prev = 0;
  for (const f of comboFrames) {
    if (f.combo === 0 && prev > COMBO_BREAK_MIN && f.time >= fromBeatmapMs - 10) {
      sounds.push({ beatmapMs: f.time + oldOffsetMs, type: 'combobreak', sampleSet: 0, sampleIndex: 0, customFile: '' });
    }
    prev = f.combo;
  }
}

const SET_NAMES: Record<number, string> = { 1: 'normal', 2: 'soft', 3: 'drum' };

const MINIMUM_SAMPLE_VOLUME = 5;

export type PendingSoundType = 'normal' | 'whistle' | 'finish' | 'clap' | 'combobreak' | 'spinnerbonus';

export type HitSoundType = Exclude<PendingSoundType, 'combobreak' | 'spinnerbonus'>;

export interface HitSoundSource {
  objectId: string;
  normalSet: number;
  additionSet: number;
}

export interface HitSoundEvent extends HitSoundSource {
  beatmapMs: number;
  sampleIndex: number;
  type: HitSoundType;
}

export interface PendingSound {
  beatmapMs: number;
  type: PendingSoundType;
  sampleSet: number;
  sampleIndex: number;
  customFile: string;

  source?: HitSoundSource;

  volume?: number;
}

export function hitsoundEventsFromSchedule(sounds: readonly PendingSound[]): HitSoundEvent[] {
  return sounds.flatMap(sound => sound.source && sound.type !== 'combobreak' && sound.type !== 'spinnerbonus'
    ? [{ ...sound.source, beatmapMs: sound.beatmapMs, sampleIndex: sound.sampleIndex, type: sound.type }]
    : []);
}

export interface HitsoundScheduleInputs {

  mode: 0 | 1 | 2 | 3;
  beatmap: BeatmapData;
  hitResults: readonly HitResult[];

  maniaSamples: ReadonlyMap<number, HitSample> | null;

  taikoGhostTaps: readonly TaikoInputEvent[] | null;

  comboFrames: readonly ComboFrame[];
  /** v5 前谱面画面迟于音频 24ms，音效随视觉命中时刻偏移。 */
  oldOffsetMs: number;

  fromBeatmapMs: number;
}

export function computeHitsoundSchedule(input: HitsoundScheduleInputs): PendingSound[] {
  const sounds: PendingSound[] = [];
  const { mode, beatmap, hitResults, maniaSamples, taikoGhostTaps, oldOffsetMs, fromBeatmapMs, comboFrames } = input;

  if (mode === 1) {
    scheduleTaiko(sounds, beatmap, hitResults, taikoGhostTaps, oldOffsetMs, fromBeatmapMs);
  } else if (mode === 3) {
    scheduleMania(sounds, beatmap, hitResults, maniaSamples, oldOffsetMs, fromBeatmapMs);
  } else if (mode === 2) {

    scheduleCatch(sounds, beatmap, hitResults, oldOffsetMs, fromBeatmapMs);
  } else {
    scheduleStd(sounds, beatmap, hitResults, oldOffsetMs, fromBeatmapMs);
  }

  scheduleComboBreaks(sounds, comboFrames, oldOffsetMs, fromBeatmapMs);

  sounds.sort((a, b) => a.beatmapMs - b.beatmapMs);
  return sounds;
}

function scheduleStd(
  sounds: PendingSound[],
  beatmap: BeatmapData,
  hitResults: readonly HitResult[],
  oldOffsetMs: number,
  fromBeatmapMs: number,
): void {
  for (const [resultIndex, result] of hitResults.entries()) {

    if (result.isSliderSub) continue;
    if (result.comboBreak) continue;
    if (result.time < fromBeatmapMs - 10) continue;

    const beatmapMs = result.time + oldOffsetMs;
    const obj  = beatmap.hitObjects[result.objectIndex];
    const tp   = activeTimingPoint(beatmap, result.time);

    const bitmask = (obj?.type === 'slider')
      ? sliderEdgeSample(obj, 0).hitSound
      : (obj?.hitSound ?? result.hitSound);

    const hs = obj?.hitSample ?? { normalSet: 0, additionSet: 0, index: 0, volume: 0, filename: '' };
    const edgeSet = obj?.type === 'slider' ? sliderEdgeSample(obj, 0) : undefined;
    const normalSet   = edgeSet?.normalSet || hs.normalSet || tp.sampleSet || 1;
    const additionSet = edgeSet?.additionSet || hs.additionSet || normalSet;
    const sampleIndex = hs.index       || tp.sampleIndex || 0;
    const customFile  = hs.filename;
    const volume      = sampleGain(hs.volume, tp.volume);
    const source = { objectId: `std:${result.objectIndex}:hit:${resultIndex}`, normalSet, additionSet };

    sounds.push({ beatmapMs, type: 'normal', sampleSet: normalSet, sampleIndex, customFile, volume, source });
    if (bitmask & 2) sounds.push({ beatmapMs, type: 'whistle', sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 4) sounds.push({ beatmapMs, type: 'finish',  sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 8) sounds.push({ beatmapMs, type: 'clap',    sampleSet: additionSet, sampleIndex, customFile, volume, source });
  }

  for (const [objectIndex, obj] of beatmap.hitObjects.entries()) {
    if (obj.type !== 'slider') continue;
    const slideDur = slideDurationMs(beatmap, obj);

    const firstEdge = slideDur > 0 && Number.isFinite(fromBeatmapMs)
      ? Math.max(1, Math.floor((fromBeatmapMs - 10 - obj.time) / slideDur) - 1)
      : 1;
    for (let n = firstEdge; n <= obj.slides; n++) {
      const edgeBeatmapMs = obj.time + slideDur * n;
      if (edgeBeatmapMs < fromBeatmapMs - 10) continue;

      const beatmapMs = edgeBeatmapMs + oldOffsetMs;
      const tp      = activeTimingPoint(beatmap, edgeBeatmapMs);
      const edgeSet = sliderEdgeSample(obj, n);
      const bitmask = edgeSet.hitSound;

      const normalSet   = edgeSet.normalSet   || obj.hitSample.normalSet   || tp.sampleSet   || 1;
      const additionSet = edgeSet.additionSet || obj.hitSample.additionSet || normalSet;
      const sampleIndex = obj.hitSample.index || tp.sampleIndex || 0;
      const customFile  = obj.hitSample.filename;

      const volume      = sampleGain(obj.hitSample.volume, tp.volume);
      const source = { objectId: `std:${objectIndex}:edge:${n}`, normalSet, additionSet };

      sounds.push({ beatmapMs, type: 'normal', sampleSet: normalSet, sampleIndex, customFile, volume, source });
      if (bitmask & 2) sounds.push({ beatmapMs, type: 'whistle', sampleSet: additionSet, sampleIndex, customFile, volume, source });
      if (bitmask & 4) sounds.push({ beatmapMs, type: 'finish',  sampleSet: additionSet, sampleIndex, customFile, volume, source });
      if (bitmask & 8) sounds.push({ beatmapMs, type: 'clap',    sampleSet: additionSet, sampleIndex, customFile, volume, source });
    }
  }

  for (const result of hitResults) {
    const bonusTimes = result.spinnerBonusTimes;
    if (bonusTimes === undefined) continue;
    for (const t of bonusTimes) {
      if (t < fromBeatmapMs - 10) continue;
      const tp = activeTimingPoint(beatmap, t);
      sounds.push({
        beatmapMs: t + oldOffsetMs, type: 'spinnerbonus',
        sampleSet: 0, sampleIndex: 0, customFile: '', volume: sampleGain(0, tp.volume),
      });
    }
  }
}

function scheduleMania(
  sounds: PendingSound[],
  beatmap: BeatmapData,
  hitResults: readonly HitResult[],
  maniaSamples: ReadonlyMap<number, HitSample> | null,
  oldOffsetMs: number,
  fromBeatmapMs: number,
): void {
  for (const [resultIndex, result] of hitResults.entries()) {
    if (result.time < fromBeatmapMs - 10) continue;
    if (result.subResult === 'body') continue;
    if (result.subResult === 'tail') continue;
    if (result.judgement === 0) continue;

    const beatmapMs = result.time + oldOffsetMs;
    const sample    = maniaSamples?.get(result.objectIndex);
    const tp        = activeTimingPoint(beatmap, result.time);
    const hs: HitSample = sample
      ?? { normalSet: 0, additionSet: 0, index: 0, volume: 0, filename: '' };
    const normalSet   = hs.normalSet   || tp.sampleSet   || 1;
    const additionSet = hs.additionSet || normalSet;
    const sampleIndex = hs.index       || tp.sampleIndex || 0;
    const customFile  = hs.filename;
    const bitmask     = result.hitSound;
    const volume      = sampleGain(hs.volume, tp.volume);
    const source = { objectId: `mania:${result.objectIndex}:hit:${resultIndex}`, normalSet, additionSet };

    /** 原生 mania 有附加音效时不叠加 hitnormal。 */

    const hasAddition = (bitmask & (2 | 4 | 8)) !== 0;
    if (!hasAddition) {
      sounds.push({ beatmapMs, type: 'normal', sampleSet: normalSet, sampleIndex, customFile, volume, source });
    }
    if (bitmask & 2) sounds.push({ beatmapMs, type: 'whistle', sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 4) sounds.push({ beatmapMs, type: 'finish',  sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 8) sounds.push({ beatmapMs, type: 'clap',    sampleSet: additionSet, sampleIndex, customFile, volume, source });
  }
}

/** tiny 无音效，香蕉用 catch-banana；水滴暂用普通命中音效代替 slidertick。 */

function scheduleCatch(
  sounds: PendingSound[],
  beatmap: BeatmapData,
  hitResults: readonly HitResult[],
  oldOffsetMs: number,
  fromBeatmapMs: number,
): void {
  for (const [resultIndex, result] of hitResults.entries()) {
    if (result.time < fromBeatmapMs - 10) continue;
    if (result.judgement === 0) continue;
    if (result.catchType === 'tinyDroplet') continue;

    const beatmapMs = result.time + oldOffsetMs;
    const tp = activeTimingPoint(beatmap, result.time);

    if (result.catchType === 'banana') {
      const volume = sampleGain(0, tp.volume);
      sounds.push({ beatmapMs, type: 'normal', sampleSet: 0, sampleIndex: 0, customFile: 'catch-banana', volume,
        source: { objectId: `catch:${result.objectIndex}:banana:${resultIndex}`, normalSet: 0, additionSet: 0 } });
      continue;
    }

    const obj = beatmap.hitObjects[result.objectIndex];
    const hs  = obj?.hitSample ?? { normalSet: 0, additionSet: 0, index: 0, volume: 0, filename: '' };
    const bitmask     = result.hitSound;
    const normalSet   = hs.normalSet   || tp.sampleSet   || 1;
    const additionSet = hs.additionSet || normalSet;
    const sampleIndex = hs.index       || tp.sampleIndex || 0;
    const customFile  = hs.filename;
    const volume      = sampleGain(hs.volume, tp.volume);
    const source = { objectId: `catch:${result.objectIndex}:hit:${resultIndex}`, normalSet, additionSet };

    sounds.push({ beatmapMs, type: 'normal', sampleSet: normalSet, sampleIndex, customFile, volume, source });
    if (bitmask & 2) sounds.push({ beatmapMs, type: 'whistle', sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 4) sounds.push({ beatmapMs, type: 'finish',  sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 8) sounds.push({ beatmapMs, type: 'clap',    sampleSet: additionSet, sampleIndex, customFile, volume, source });
  }
}

/** taiko 强中心音叠加 finish，强边缘音叠加 whistle；空按也播放鼓声。 */

function scheduleTaiko(
  sounds: PendingSound[],
  beatmap: BeatmapData,
  hitResults: readonly HitResult[],
  taikoGhostTaps: readonly TaikoInputEvent[] | null,
  oldOffsetMs: number,
  fromBeatmapMs: number,
): void {
  for (const [resultIndex, result] of hitResults.entries()) {
    const obj = beatmap.hitObjects[result.objectIndex];
    const objTime = obj?.time ?? result.time;
    if (result.judgement === 0 && result.time > objTime + 0.5) continue;

    /** swell 完成与最后一次 tick 同帧，避免重复播放。 */

    if (result.comboIgnore && result.strong === true) continue;

    if (result.time < fromBeatmapMs - 10) continue;

    const beatmapMs = result.time + oldOffsetMs;
    const tp = activeTimingPoint(beatmap, result.time);
    const hs = obj?.hitSample ?? { normalSet: 0, additionSet: 0, index: 0, volume: 0, filename: '' };
    const normalSet   = hs.normalSet   || tp.sampleSet   || 1;
    const additionSet = hs.additionSet || normalSet;
    const sampleIndex = hs.index       || tp.sampleIndex || 0;
    const customFile  = hs.filename;
    const volume      = sampleGain(hs.volume, tp.volume);
    const source = { objectId: `taiko:${result.objectIndex}:hit:${resultIndex}`, normalSet, additionSet };

    const isKat = (result.hitSound & (2 | 8)) !== 0;
    if (isKat) {
      sounds.push({ beatmapMs, type: 'clap', sampleSet: additionSet, sampleIndex, customFile, volume, source });
    } else {
      sounds.push({ beatmapMs, type: 'normal', sampleSet: normalSet, sampleIndex, customFile, volume, source });
    }

    if ((result.hitSound & 4) !== 0) {
      sounds.push({ beatmapMs, type: isKat ? 'whistle' : 'finish', sampleSet: additionSet, sampleIndex, customFile, volume, source });
    }
  }

  if (taikoGhostTaps !== null) {
    for (const [tapIndex, ev] of taikoGhostTaps.entries()) {
      if (ev.time < fromBeatmapMs - 10) continue;
      const isRim = ev.action === 'LeftRim' || ev.action === 'RightRim';
      const tp    = activeTimingPoint(beatmap, ev.time);
      sounds.push({
        beatmapMs: ev.time + oldOffsetMs,
        type: isRim ? 'clap' : 'normal',
        sampleSet: tp.sampleSet || 1,
        sampleIndex: tp.sampleIndex || 0,
        customFile: '',
        source: { objectId: `taiko:ghost:${tapIndex}`, normalSet: tp.sampleSet || 1, additionSet: tp.sampleSet || 1 },
        volume: sampleGain(0, tp.volume),
      });
    }
  }
}

function activeTimingPoint(
  beatmap: BeatmapData,
  beatmapMs: number,
): Pick<TimingPoint, 'sampleSet' | 'sampleIndex' | 'volume'> {
  const tps = beatmap.timingPoints;
  const tp = tps[upperBoundBy(tps, beatmapMs, point => point.time) - 1];
  return { sampleSet: tp?.sampleSet || 1, sampleIndex: tp?.sampleIndex ?? 0, volume: tp?.volume ?? 100 };
}

/** 物件音量优先，否则取时间点音量；下限为 5%，两者不相乘。 */

function sampleGain(hitSampleVolume: number, tpVolume: number): number {
  const effectiveVol = hitSampleVolume > 0 ? hitSampleVolume : tpVolume;
  return Math.max(effectiveVol, MINIMUM_SAMPLE_VOLUME) / 100;
}

export interface SampleResolverDeps {

  mode: 0 | 1 | 2 | 3;
  skinSounds: ReadonlyMap<string, AudioBuffer>;


  synthCache: Map<string, AudioBuffer>;

  ctx: BaseAudioContext;
}

export function lookupSkinSound(
  skinSounds: ReadonlyMap<string, AudioBuffer>,
  basename: string,
): AudioBuffer | null {
  for (const name of audioLookupNames(basename)) {
    const direct = skinSounds.get(name);
    if (direct !== undefined) return direct;
    for (const [key, value] of skinSounds) {
      if (normalizeSamplePath(key) === name) return value;
    }
  }
  return null;
}

function normalizeSamplePath(name: string): string {
  return name.replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

function audioLookupNames(stem: string): string[] {
  const name = normalizeSamplePath(stem);
  return AUDIO_EXTS.some(ext => name.endsWith(ext)) ? [name] : AUDIO_EXTS.map(ext => `${name}${ext}`);
}

export function sampleLookupNames(
  type: HitSoundType,
  sampleSet: number,
  sampleIndex: number,
  customFile: string,
  mode: 0 | 1 | 2 | 3,
): string[] {
  if (customFile !== '') return audioLookupNames(customFile);
  const setName = SET_NAMES[sampleSet] ?? 'normal';
  const suffix = sampleIndex >= 2 ? String(sampleIndex) : '';
  const prefix = mode === 1 ? 'taiko-' : '';
  const stems = [`${prefix}${setName}-hit${type}${suffix}`];
  if (suffix !== '') stems.push(`${prefix}${setName}-hit${type}`);
  stems.push(mode === 1 ? `taiko-hit${type}` : `hit${type}${suffix}`);
  return stems.flatMap(audioLookupNames);
}

export function resolveSample(
  type: 'normal' | 'whistle' | 'finish' | 'clap',
  sampleSet: number,
  sampleIndex: number,
  customFile: string,
  deps: SampleResolverDeps,
): AudioBuffer {
  const { mode, skinSounds, synthCache, ctx } = deps;

  for (const name of sampleLookupNames(type, sampleSet, sampleIndex, customFile, mode)) {
    const buffer = lookupSkinSound(skinSounds, name);
    if (buffer !== null) return buffer;
  }

  return synthBuffer(type, ctx, synthCache);
}

function synthBuffer(
  type: string,
  ctx: BaseAudioContext,
  synthCache: Map<string, AudioBuffer>,
): AudioBuffer {
  const cached = synthCache.get(type);
  if (cached !== undefined) return cached;

  const sr  = ctx.sampleRate;
  let   buf: AudioBuffer;

  switch (type) {
    case 'normal':  buf = synthDecaySine(ctx, sr, 800,  0.080, 40); break;
    case 'whistle': buf = synthDecaySine(ctx, sr, 1480, 0.140, 20); break;
    case 'finish':  buf = synthDecaySine(ctx, sr, 440,  0.220, 12); break;
    case 'clap':    buf = synthNoise    (ctx, sr,        0.090, 35); break;
    default:        buf = synthDecaySine(ctx, sr, 800,  0.080, 40); break;
  }

  synthCache.set(type, buf);
  return buf;
}

function synthDecaySine(
  ctx: BaseAudioContext,
  sr: number,
  freqHz: number,
  durationS: number,
  decay: number,
): AudioBuffer {
  const len  = Math.floor(sr * durationS);
  const buf  = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  const twoPiF = 2 * Math.PI * freqHz;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    data[i] = Math.sin(twoPiF * t) * Math.exp(-decay * t) * 0.25;
  }
  return buf;
}

function synthNoise(
  ctx: BaseAudioContext,
  sr: number,
  durationS: number,
  decay: number,
): AudioBuffer {
  const len  = Math.floor(sr * durationS);
  const buf  = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    data[i] = (Math.random() * 2 - 1) * Math.exp(-decay * t) * 0.15;
  }
  return buf;
}
