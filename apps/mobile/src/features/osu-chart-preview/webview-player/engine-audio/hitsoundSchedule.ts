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
// Pure hitsound-schedule pieces shared by live playback (AudioSync) and offline mixdown
// consumers. Two halves, both free of live-playback / AudioContext-clock state:
//   - computeHitsoundSchedule(): walks the judged results into a sorted PendingSound[]
//     queue, creating no audio nodes (the "what plays and when, in beatmap time" layer).
//   - resolveSample(): the custom-file → skin → lazer-default → synth lookup cascade,
//     returning the AudioBuffer for one resolved sample identity.
// The flush/clock machinery (look-ahead windowing, ctx anchoring, concurrency cap)
// stays in AudioSync — it depends on live-playback state that has no offline meaning.

import type { BeatmapData, HitResult, HitSample, TimingPoint } from '../engine/types/index';
import type { ComboFrame } from '../engine/renderer/HUDRenderer';
import type { TaikoInputEvent } from '../engine/rulesets/taiko/input';
import { slideDurationMs } from '../engine/utils/sliderDuration';

const AUDIO_EXTS = ['.wav', '.mp3', '.ogg'];

// osu!'s combo-break sample (ComboEffects.onComboChange) plays only when the combo just reset
// to 0 AND was greater than this immediately before — NewValue == 0 && OldValue > 20. Breaks at
// a low combo are silent, and a miss streak sounds once (every later miss sees OldValue 0).
// Lazer's optional AlwaysPlayFirstComboBreak setting is intentionally not implemented — it
// only ever adds the first low-combo break back, and this rule already errs toward silence.
const COMBO_BREAK_MIN = 20;

// Combobreak is a ScoreProcessor-level effect in osu!, not a per-object hit sample: the shared,
// ruleset-agnostic ComboEffects component fires it once whenever the *displayed* combo resets to
// 0 from > COMBO_BREAK_MIN. So it is emitted here by walking the displayed-combo timeline
// (already ruleset-correct, threaded in as comboFrames) for every mode, rather than being tied
// to each ruleset's hit-sample loop. Honours the same fromBeatmapMs window + oldOffsetMs
// shift as the hit samples.
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

/** Floor applied to hit-object sample volume (DrawableHitObject.MINIMUM_SAMPLE_VOLUME = 5). */
const MINIMUM_SAMPLE_VOLUME = 5;

/** Kind of sound in the schedule: the four hit-sample stems, plus the two skin-only effects. */
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

/**
 * One scheduled sound: when (beatmap ms, `oldOffsetMs` already applied) plus the resolved
 * sample identity (`type`/`sampleSet`/`sampleIndex`/`customFile`) to look up at play time.
 * Identity-only — holds no AudioBuffer, so the same schedule works live and offline.
 */
export interface PendingSound {
  beatmapMs: number;
  type: PendingSoundType;
  sampleSet: number;
  sampleIndex: number;
  customFile: string;
  /** Shared by the layers of one hit; chords and slider edges retain distinct identities. */
  source?: HitSoundSource;
  // Playback gain 0..1. Undefined ⇒ full (1). Set for every hit sample (object/
  // timing-point sample volume with a 5% floor); combobreak leaves it full.
  volume?: number;
}

export function hitsoundEventsFromSchedule(sounds: readonly PendingSound[]): HitSoundEvent[] {
  return sounds.flatMap(sound => sound.source && sound.type !== 'combobreak' && sound.type !== 'spinnerbonus'
    ? [{ ...sound.source, beatmapMs: sound.beatmapMs, sampleIndex: sound.sampleIndex, type: sound.type }]
    : []);
}

/** Inputs to `computeHitsoundSchedule`. All times are beatmap ms. */
export interface HitsoundScheduleInputs {
  // 0 = std, 1 = taiko, 2 = catch, 3 = mania. Non-std modes own their own hitsound timeline.
  mode: 0 | 1 | 2 | 3;
  beatmap: BeatmapData;
  hitResults: readonly HitResult[];
  // Mania-only: objectIndex → HitSample (HoldNote heads aren't in beatmap.hitObjects).
  maniaSamples: ReadonlyMap<number, HitSample> | null;
  // Taiko-only: presses that hit no object (bare don/kat for empty/warm-up taps).
  taikoGhostTaps: readonly TaikoInputEvent[] | null;
  // Displayed combo timeline — drives the ruleset-agnostic combo-break sound (all modes),
  // emitted on osu!'s "combo reset to 0 from > 20" rule.
  comboFrames: readonly ComboFrame[];
  // Pre-v5 maps: visuals run 24ms behind audio; shift hitsounds forward to match the visual hit.
  oldOffsetMs: number;
  // Only schedule sounds at/after this beatmap time (live playback skips the past). Pass
  // a very negative value (e.g. -Infinity) to get the full schedule for offline export.
  fromBeatmapMs: number;
}

/**
 * Build the sorted hitsound queue for a replay. Pure: no audio nodes, no AudioContext,
 * no instance state. Dispatches by mode; the result is sorted ascending by beatmapMs so
 * both the live flush loop and the offline mixdown can consume it in time order.
 */
export function computeHitsoundSchedule(input: HitsoundScheduleInputs): PendingSound[] {
  const sounds: PendingSound[] = [];
  const { mode, beatmap, hitResults, maniaSamples, taikoGhostTaps, oldOffsetMs, fromBeatmapMs, comboFrames } = input;

  if (mode === 1) {
    scheduleTaiko(sounds, beatmap, hitResults, taikoGhostTaps, oldOffsetMs, fromBeatmapMs);
  } else if (mode === 3) {
    scheduleMania(sounds, beatmap, hitResults, maniaSamples, oldOffsetMs, fromBeatmapMs);
  } else if (mode === 2) {
    // Catch: one sample per caught palpable object. Handled before the std slider-edge
    // walk so a catch map's JuiceStreams don't spray phantom edges.
    scheduleCatch(sounds, beatmap, hitResults, oldOffsetMs, fromBeatmapMs);
  } else {
    scheduleStd(sounds, beatmap, hitResults, oldOffsetMs, fromBeatmapMs);
  }

  // Combobreak is ruleset-agnostic in osu! (the shared ComboEffects component); emit it for
  // every mode from the displayed combo timeline.
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
    // Sub-results (ticks/repeats/tail) and combo-breaking misses produce no object hit sample;
    // their combo reset, if any, is sounded centrally by scheduleComboBreaks.
    if (result.isSliderSub) continue;
    if (result.comboBreak) continue;
    if (result.time < fromBeatmapMs - 10) continue;

    const beatmapMs = result.time + oldOffsetMs;
    const obj  = beatmap.hitObjects[result.objectIndex];
    const tp   = activeTimingPoint(beatmap, result.time);

    // Slider head uses edgeSounds[0] (may differ from hitSound).
    const bitmask = (obj?.type === 'slider')
      ? (obj.edgeSounds[0] ?? obj.hitSound)
      : (obj?.hitSound ?? result.hitSound);

    const hs = obj?.hitSample ?? { normalSet: 0, additionSet: 0, index: 0, volume: 0, filename: '' };
    const edgeSet = obj?.type === 'slider' ? obj.edgeSets[0] : undefined;
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

  // Slider edge completions (slides 1..N); slide 0 covered by hitResults.
  for (const [objectIndex, obj] of beatmap.hitObjects.entries()) {
    if (obj.type !== 'slider') continue;
    const slideDur = slideDurationMs(beatmap, obj);

    for (let n = 1; n <= obj.slides; n++) {
      const edgeBeatmapMs = obj.time + slideDur * n;
      if (edgeBeatmapMs < fromBeatmapMs - 10) continue;

      const beatmapMs = edgeBeatmapMs + oldOffsetMs;
      const tp      = activeTimingPoint(beatmap, edgeBeatmapMs);
      const bitmask = obj.edgeSounds[n] ?? obj.hitSound;
      const edgeSet = obj.edgeSets[n] ?? { normalSet: 0, additionSet: 0 };

      const normalSet   = edgeSet.normalSet   || obj.hitSample.normalSet   || tp.sampleSet   || 1;
      const additionSet = edgeSet.additionSet || obj.hitSample.additionSet || normalSet;
      const sampleIndex = obj.hitSample.index || tp.sampleIndex || 0;
      const customFile  = obj.hitSample.filename;
      // .osu slider node samples carry no per-node volume; use the object's
      // sample volume, falling back to the timing point.
      const volume      = sampleGain(obj.hitSample.volume, tp.volume);
      const source = { objectId: `std:${objectIndex}:edge:${n}`, normalSet, additionSet };

      sounds.push({ beatmapMs, type: 'normal', sampleSet: normalSet, sampleIndex, customFile, volume, source });
      if (bitmask & 2) sounds.push({ beatmapMs, type: 'whistle', sampleSet: additionSet, sampleIndex, customFile, volume, source });
      if (bitmask & 4) sounds.push({ beatmapMs, type: 'finish',  sampleSet: additionSet, sampleIndex, customFile, volume, source });
      if (bitmask & 8) sounds.push({ beatmapMs, type: 'clap',    sampleSet: additionSet, sampleIndex, customFile, volume, source });
    }
  }

  // Spinner bonus: the `spinnerbonus` sample fires once per bonus spin (the same instants
  // the on-screen bonus popup increments). Silent if the skin ships no spinnerbonus file
  // (handled at the flush site, like combobreak — no synth proxy).
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

// Mania per-press hitsound. Each Note or HoldNote head fires its hitSample at result.time
// (= press time); body subResults are silent; tail subResults are silent on native maps
// (HoldNote.CreateDefaultNodeSamples returns empty for node 1). Misses produce no hit sample;
// the combo-break sound is emitted centrally (scheduleComboBreaks), not per result. No stereo
// panning (lazer pans by column/totalColumns; not implemented here).
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

    // ManiaLegacySkinTransformer.GetSample silences the auto-layered hitnormal on
    // mania-native maps (lazer's LegacyBeatmapDecoder layers a hitnormal under every
    // addition; mania-native plays only the addition). Mirror that: when whistle/clap/
    // finish is set, suppress normal — otherwise play normal as the sole sample.
    const hasAddition = (bitmask & (2 | 4 | 8)) !== 0;
    if (!hasAddition) {
      sounds.push({ beatmapMs, type: 'normal', sampleSet: normalSet, sampleIndex, customFile, volume, source });
    }
    if (bitmask & 2) sounds.push({ beatmapMs, type: 'whistle', sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 4) sounds.push({ beatmapMs, type: 'finish',  sampleSet: additionSet, sampleIndex, customFile, volume, source });
    if (bitmask & 8) sounds.push({ beatmapMs, type: 'clap',    sampleSet: additionSet, sampleIndex, customFile, volume, source });
  }
}

// Catch per-object hitsound: one sample per CAUGHT palpable object, at its catch
// time. Tiny droplets are silent; bananas play `catch-banana`; fruit + droplets sound
// their source object's hitSound (normal + additions). Missed objects make no per-object sound
// (a combo reset they cause is sounded centrally by scheduleComboBreaks).
// Known approximation: the droplet "slidertick" bank is played as the object's normal sample.
function scheduleCatch(
  sounds: PendingSound[],
  beatmap: BeatmapData,
  hitResults: readonly HitResult[],
  oldOffsetMs: number,
  fromBeatmapMs: number,
): void {
  for (const [resultIndex, result] of hitResults.entries()) {
    if (result.time < fromBeatmapMs - 10) continue;
    if (result.judgement === 0) continue;             // miss → no sound
    if (result.catchType === 'tinyDroplet') continue; // tiny droplets are silent

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

// Note-tied drum hitsounds (matches osu!stable, which taiko players expect). Each
// judged result sounds at its press time with the colour the mapper gave the object:
// hitSound bit 1 (whistle) or bit 3 (clap) → Kat → 'clap', else Don → 'normal'.
// A finisher (finish bit, 4) overlays the BIG-note boom — and taiko has two distinct
// ones: big-don → 'finish', big-kat → 'whistle' (lazer's DrumSampleTriggerSource maps
// centre→finish, rim→whistle; the default taiko skin ships both as separate sounds).
// Overlaying 'finish' on every strong note makes big kats play the don boom — the
// "all strong hits sound the same" bug. Drum-roll/swell ticks carry the pressed key's
// colour (set in hitJudge), not the object's additions, so a finish-tagged roll doesn't
// stamp finish on every tick. Auto-misses carry no press, so skip them.
//
// Then a second pass plays a bare don/kat for ghost taps — presses that hit no object
// at all (empty sections, warm-up taps). Stable sounds the drum on any key press, so
// these are audible too; they're scored nowhere (not in hitResults).
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

    // Swell completion (comboIgnore + strong) lands on the same frame as the
    // last swell tick, which already sounds; stable plays no object sample on
    // completion, so don't double up.
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
    // Strong (finish bit, 4) overlays the finisher boom: big-kat → 'whistle',
    // big-don → 'finish' (taiko's two distinct finisher sounds).
    if ((result.hitSound & 4) !== 0) {
      sounds.push({ beatmapMs, type: isKat ? 'whistle' : 'finish', sampleSet: additionSet, sampleIndex, customFile, volume, source });
    }
  }

  // Ghost taps: no object, so the sample bank comes from the active timing point and
  // the colour from the pressed key (centre → Don/'normal', rim → Kat/'clap').
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
  let sampleSet   = 1;
  let sampleIndex = 0;
  let volume      = 100;
  for (const tp of tps) {
    if (tp.time > beatmapMs) break;
    sampleSet   = tp.sampleSet   || 1; // 0=auto → normal (1)
    sampleIndex = tp.sampleIndex;
    volume      = tp.volume;
  }
  return { sampleSet, sampleIndex, volume };
}

// Sample playback gain 0..1. The object's own sample volume wins when > 0, else the
// timing point's (SampleControlPoint.ApplyTo fallback — not a multiply), floored at
// 5% (DrawableHitObject.MINIMUM_SAMPLE_VOLUME). Shared by all mode paths.
function sampleGain(hitSampleVolume: number, tpVolume: number): number {
  const effectiveVol = hitSampleVolume > 0 ? hitSampleVolume : tpVolume;
  return Math.max(effectiveVol, MINIMUM_SAMPLE_VOLUME) / 100;
}

/** Dependencies for `resolveSample`. Pure lookups plus a mutable synth cache; usable live or offline. */
export interface SampleResolverDeps {
  // 0 = std, 1 = taiko, 2 = catch, 3 = mania. Taiko uses a taiko-prefixed-only lookup.
  mode: 0 | 1 | 2 | 3;
  skinSounds: ReadonlyMap<string, AudioBuffer>;
  // Lazer-default hitsounds (the ppy/osu-resources wavs); cascade fallback below
  // skin lookups, above synth. Null when not loaded.
  lazerDefaultSounds: ReadonlyMap<string, AudioBuffer> | null;
  // Synthesised-fallback cache (keyed by type). Mutated in place across calls.
  synthCache: Map<string, AudioBuffer>;
  // AudioContext or OfflineAudioContext — only used to allocate synth fallback buffers.
  ctx: BaseAudioContext;
}

/** Look up `${basename}{.wav|.mp3|.ogg}` in a sound map; null if none present. */
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

/** The resource loader and audible resolver must search the same identities, in the same order. */
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

/**
 * Resolve one sample identity to an AudioBuffer. Lookup order: custom file →
 * {set}-hit{type}{idx} → {set}-hit{type} → hit{type}{idx} → lazer-default → synth
 * (never returns null — the synth fallback always produces a buffer).
 */
export function resolveSample(
  type: 'normal' | 'whistle' | 'finish' | 'clap',
  sampleSet: number,
  sampleIndex: number,
  customFile: string,
  deps: SampleResolverDeps,
): AudioBuffer {
  const { mode, skinSounds, lazerDefaultSounds, synthCache, ctx } = deps;

  const setName = SET_NAMES[sampleSet] ?? 'normal';
  for (const name of sampleLookupNames(type, sampleSet, sampleIndex, customFile, mode)) {
    const buffer = lookupSkinSound(skinSounds, name);
    if (buffer !== null) return buffer;
  }
  const lz = customFile === '' && mode !== 1 ? lazerDefaultSounds?.get(`${setName}-hit${type}.wav`) : undefined;
  if (lz !== undefined) return lz;

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
