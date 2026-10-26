/*
 * Derived from replayviewer-js src/player/AudioSync.ts
 * https://github.com/daladal/replayviewer-js
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
import { lookupSkinSound, resolveSample } from './hitsoundSchedule';
import type { PendingSound } from './hitsoundSchedule';
import { PlaybackClock, audioContextTime, musicPosition, outputTime } from '../../../chart-preview-shared/webview-player/playbackClock';
import { getAudioContextOutputTime } from '../../../chart-preview-shared/webview-player/audioClock';

export interface ExtraSample {
  timeMs: number;
  buffer: AudioBuffer;
  volume: number;
}

export interface AudioSyncInputs {
  ctx: AudioContext;
  songBuffer: AudioBuffer | null;
  skinSounds: Map<string, AudioBuffer>;
  mergedSounds: Map<string, AudioBuffer>;
  beatmapHitsounds?: boolean;
  introOffsetMs: number;
  mode: 0 | 1 | 2 | 3;
  schedule: readonly PendingSound[];
  extraSamples?: readonly ExtraSample[];
}

const FLUSH_HORIZON_S = 2;
const FLUSH_INTERVAL_MS = 500;
const SAMPLE_CONCURRENCY = 2;
type Effect = { gain: GainNode | null; when: number; sample?: ExtraSample };

/** 完整预览时间轴不按回放时长截断。 */
export class AudioSync {
  private readonly clock = new PlaybackClock();
  private readonly schedule: readonly PendingSound[];
  private readonly inputs: AudioSyncInputs;
  private readonly ctx: AudioContext;
  private readonly songGain: GainNode;
  private readonly effectsGain: GainNode;
  private readonly synthCache = new Map<string, AudioBuffer>();
  private readonly samples: readonly ExtraSample[];
  private readonly activeEffects = new Map<AudioBufferSourceNode, Effect>();
  private readonly storyboardSources = new Map<ExtraSample, AudioBufferSourceNode>();
  private readonly sampleEndPrefix: number[];
  private readonly voices = new Map<string, { source: AudioBufferSourceNode; when: number; end: number }[]>();
  private songSource: AudioBufferSourceNode | null = null;
  private songWhen = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private soundIndex = 0;
  private sampleIndex = 0;
  private playing = false;
  private disposed = false;
  private generation = 0;
  private pausedMs = 0;
  private speed = 1;
  private beatmapHitsounds: boolean;
  private storyboardEnabled = true;

  constructor(inputs: AudioSyncInputs) {
    this.inputs = inputs;
    this.ctx = inputs.ctx;
    this.beatmapHitsounds = inputs.beatmapHitsounds ?? true;
    this.songGain = this.ctx.createGain();
    this.effectsGain = this.ctx.createGain();
    this.songGain.connect(this.ctx.destination);
    this.effectsGain.connect(this.ctx.destination);
    this.schedule = inputs.schedule;
    this.samples = [...(inputs.extraSamples ?? [])].sort((a, b) => a.timeMs - b.timeMs);
    let end = -Infinity;
    this.sampleEndPrefix = this.samples.map(sample => end = Math.max(end, sample.timeMs + sample.buffer.duration * 1000));
  }

  private get activeSounds(): Map<string, AudioBuffer> {
    return this.beatmapHitsounds ? this.inputs.mergedSounds : this.inputs.skinSounds;
  }

  get currentTimeMs(): number {
    return this.playing
      ? this.clock.positionAt(audioContextTime(this.ctx.currentTime)) * 1000 - this.inputs.introOffsetMs
      : this.pausedMs;
  }

  get outputTimeMs(): number {
    return this.playing
      ? this.clock.positionAt(outputTime(getAudioContextOutputTime(this.ctx))) * 1000 - this.inputs.introOffsetMs
      : this.pausedMs;
  }

  get running(): boolean { return this.playing; }

  setSpeed(speed: number): void {
    if (this.disposed || speed === this.speed) return;
    this.speed = speed;
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    const position = this.clock.positionAt(audioContextTime(now)) * 1000 - this.inputs.introOffsetMs;
    this.clock.appendSegment(audioContextTime(now), speed);
    if (this.songSource && this.songWhen > now) {
      this.stopSong();
      this.startSong(position, now);
    } else this.songSource?.playbackRate.setValueAtTime(speed, now);
    this.stopEffects(true);
    for (const source of this.storyboardSources.values()) source.playbackRate.setValueAtTime(speed, now);
    this.startEffects(position, false);
  }

  setSongVolume(value: number): void { this.songGain.gain.value = Math.max(0, Math.min(1, value)); }
  setEffectsVolume(value: number): void { this.effectsGain.gain.value = Math.max(0, Math.min(1, value)); }

  setStoryboardEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.storyboardEnabled) return;
    this.storyboardEnabled = enabled;
    for (const source of this.storyboardSources.values()) this.stopEffect(source);
    this.sampleIndex = enabled ? this.firstLiveSample(this.currentTimeMs + this.inputs.introOffsetMs) : this.samples.length;
    if (this.playing) {
      this.flush();
      this.ensureTimer();
    }
  }

  private firstLiveSample(mapMs: number): number {
    let low = 0, high = this.sampleEndPrefix.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.sampleEndPrefix[middle]! <= mapMs) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  setBeatmapHitsounds(on: boolean): void {
    if (on === this.beatmapHitsounds) return;
    this.beatmapHitsounds = on;
    if (this.playing) {
      for (const [source, effect] of this.activeEffects) if (!effect.sample) this.stopEffect(source);
      this.voices.clear();
      this.startEffects(this.currentTimeMs, false);
    }
  }

  async playFrom(presentationMs: number): Promise<void> {
    if (this.disposed) return;
    this.pause();
    this.pausedMs = presentationMs;
    const generation = ++this.generation;
    try { await this.ctx.resume(); }
    catch (error) {
      if (this.disposed || generation !== this.generation) return;
      throw error;
    }
    if (this.disposed || generation !== this.generation) return;
    const now = this.ctx.currentTime;
    this.clock.set(audioContextTime(now), musicPosition((presentationMs + this.inputs.introOffsetMs) / 1000), this.speed);
    this.playing = true;
    this.startSong(presentationMs, now);
    this.startEffects(presentationMs);
  }

  pause(): void {
    this.generation++;
    this.pausedMs = this.outputTimeMs;
    this.playing = false;
    this.stopSong();
    this.stopEffects();
  }

  destroy(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.songGain.disconnect();
    this.effectsGain.disconnect();
  }

  private stopSong(): void {
    const source = this.songSource;
    if (!source) return;
    this.songSource = null;
    source.onended = null;
    try { source.stop(); } catch { /** 音源可能已经结束。 */ }
    source.disconnect();
  }

  private startSong(presentationMs: number, now: number): void {
    const buffer = this.inputs.songBuffer;
    if (!buffer) return;
    const mapMs = presentationMs + this.inputs.introOffsetMs;
    const offset = Math.max(0, mapMs / 1000);
    if (offset >= buffer.duration) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = this.speed;
    source.connect(this.songGain);
    this.songSource = source;
    source.onended = () => {
      if (this.songSource === source) this.songSource = null;
      source.disconnect();
    };
    this.songWhen = now + Math.max(0, -mapMs / (1000 * this.speed));
    source.start(this.songWhen, offset);
  }

  private startEffects(presentationMs: number, inclusive = true): void {
    const mapMs = presentationMs + this.inputs.introOffsetMs;
    let low = 0, high = this.schedule.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (inclusive ? this.schedule[middle]!.beatmapMs < mapMs : this.schedule[middle]!.beatmapMs <= mapMs) low = middle + 1;
      else high = middle;
    }
    this.soundIndex = low;
    this.sampleIndex = this.storyboardEnabled ? this.firstLiveSample(mapMs) : this.samples.length;
    this.flush();
    this.ensureTimer();
  }

  private ensureTimer(): void {
    if (this.timer === null && (this.soundIndex < this.schedule.length || this.sampleIndex < this.samples.length)) {
      this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  private flush(): void {
    if (!this.playing) return;
    const now = this.ctx.currentTime;
    const horizon = now + FLUSH_HORIZON_S;
    const anchorMap = this.clock.positionAt(audioContextTime(now)) * 1000;
    const at = (mapMs: number): number => now + (mapMs - anchorMap) / (1000 * this.speed);
    while (this.soundIndex < this.schedule.length) {
      const sound = this.schedule[this.soundIndex]!;
      const when = at(sound.beatmapMs);
      if (when > horizon) break;
      this.soundIndex++;
      const buffer = sound.type === 'combobreak' || sound.type === 'spinnerbonus'
        ? lookupSkinSound(this.activeSounds, sound.type)
        : resolveSample(sound.type, sound.sampleSet, sound.sampleIndex, this.beatmapHitsounds ? sound.customFile : '', {
          mode: this.inputs.mode,
          skinSounds: this.activeSounds,
          synthCache: this.synthCache,
          ctx: this.ctx,
        });
      if (!buffer) continue;
      const key = `${sound.type}|${sound.sampleSet}|${sound.sampleIndex}|${sound.customFile}`;
      this.startEffect(buffer, when, sound.volume ?? 1, key);
    }
    while (this.sampleIndex < this.samples.length) {
      const sample = this.samples[this.sampleIndex]!;
      const when = at(sample.timeMs);
      if (when > horizon) break;
      this.sampleIndex++;
      if (!this.storyboardSources.has(sample)) this.startEffect(sample.buffer, when, sample.volume, undefined, sample);
    }
    if (this.soundIndex === this.schedule.length && this.sampleIndex === this.samples.length && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.clock.prune(outputTime(getAudioContextOutputTime(this.ctx)));
  }

  private startEffect(buffer: AudioBuffer, when: number, volume: number, concurrencyKey?: string, sample?: ExtraSample): void {
    const now = this.ctx.currentTime;
    const rate = sample ? this.speed : 1;
    const offset = Math.max(0, (now - when) * rate);
    if (offset >= buffer.duration) return;
    const actualWhen = Math.max(now, when);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const amount = Math.max(0, Math.min(1, volume));
    const gain = amount === 1 ? null : this.ctx.createGain();
    if (gain) {
      gain.gain.value = amount;
      source.connect(gain);
      gain.connect(this.effectsGain);
    } else source.connect(this.effectsGain);
    this.activeEffects.set(source, { gain, when: actualWhen, sample });
    if (sample) this.storyboardSources.set(sample, source);
    source.onended = () => {
      source.disconnect();
      gain?.disconnect();
      this.activeEffects.delete(source);
      if (sample) this.storyboardSources.delete(sample);
    };
    if (concurrencyKey) {
      const voices = (this.voices.get(concurrencyKey) ?? []).filter(voice => voice.end > actualWhen);
      if (voices.length >= SAMPLE_CONCURRENCY) {
        const victim = voices.shift()!;
        try { victim.source.stop(actualWhen); } catch { /** 音源可能已经结束。 */ }
      }
      voices.push({ source, when: actualWhen, end: actualWhen + (buffer.duration - offset) });
      this.voices.set(concurrencyKey, voices);
    }
    source.start(actualWhen, offset);
  }

  private stopEffect(source: AudioBufferSourceNode): void {
    const effect = this.activeEffects.get(source);
    source.onended = null;
    try { source.stop(); } catch { /** 音源可能已经结束。 */ }
    source.disconnect();
    effect?.gain?.disconnect();
    if (effect?.sample) this.storyboardSources.delete(effect.sample);
    this.activeEffects.delete(source);
  }

  private stopEffects(futureOnly = false): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const [source, effect] of this.activeEffects) {
      if (!futureOnly || effect.when > this.ctx.currentTime) this.stopEffect(source);
    }
    for (const [key, voices] of this.voices) {
      const remaining = voices.filter(voice => this.activeEffects.has(voice.source));
      if (remaining.length) this.voices.set(key, remaining);
      else this.voices.delete(key);
    }
  }
}
