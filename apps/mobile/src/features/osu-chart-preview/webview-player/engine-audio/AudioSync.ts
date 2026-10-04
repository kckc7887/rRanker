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

/** 完整预览时间轴不按回放时长截断。 */
export class AudioSync {
  private readonly schedule: readonly PendingSound[];
  private readonly inputs: AudioSyncInputs;
  private readonly ctx: AudioContext;
  private readonly songGain: GainNode;
  private readonly effectsGain: GainNode;
  private readonly synthCache = new Map<string, AudioBuffer>();
  private readonly samples: readonly ExtraSample[];
  private readonly activeEffects = new Map<AudioBufferSourceNode, GainNode | null>();
  private readonly storyboardSources = new Set<AudioBufferSourceNode>();
  private readonly sampleEndPrefix: number[];
  private readonly voices = new Map<string, { source: AudioBufferSourceNode; when: number; end: number }[]>();
  private songSource: AudioBufferSourceNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private soundIndex = 0;
  private sampleIndex = 0;
  private playing = false;
  private disposed = false;
  private generation = 0;
  private presentationStartMs = 0;
  private contextStart = 0;
  private pausedMs = 0;
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
      ? this.presentationStartMs + (this.ctx.currentTime - this.contextStart) * 1000
      : this.pausedMs;
  }


  setSongVolume(value: number): void { this.songGain.gain.value = Math.max(0, Math.min(1, value)); }
  setEffectsVolume(value: number): void { this.effectsGain.gain.value = Math.max(0, Math.min(1, value)); }

  setStoryboardEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.storyboardEnabled) return;
    this.storyboardEnabled = enabled;
    for (const source of this.storyboardSources) {
      source.onended = null;
      try { source.stop(); } catch { /** 音源可能已经结束。 */ }
      source.disconnect();
      this.activeEffects.get(source)?.disconnect();
      this.activeEffects.delete(source);
    }
    this.storyboardSources.clear();
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
      this.stopEffects();
      this.startEffects(this.currentTimeMs);
    }
  }

  async playFrom(presentationMs: number): Promise<void> {
    if (this.disposed) return;
    this.pause();
    this.pausedMs = presentationMs;
    const generation = ++this.generation;
    await this.ctx.resume();
    if (this.disposed || generation !== this.generation) return;
    this.presentationStartMs = presentationMs;
    this.contextStart = this.ctx.currentTime;
    this.playing = true;
    this.startSong(presentationMs);
    this.startEffects(presentationMs);
  }

  pause(): void {
    this.generation++;
    this.pausedMs = this.currentTimeMs;
    this.playing = false;
    if (this.songSource !== null) {
      const source = this.songSource;
      this.songSource = null;
      source.onended = null;
      try { source.stop(); } catch { /** 音源可能已经结束。 */ }
      source.disconnect();
    }
    this.stopEffects();
  }

  destroy(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.songGain.disconnect();
    this.effectsGain.disconnect();
  }

  private startSong(presentationMs: number): void {
    const buffer = this.inputs.songBuffer;
    if (!buffer) return;
    const mapMs = presentationMs + this.inputs.introOffsetMs;
    const offset = Math.max(0, mapMs / 1000);
    if (offset >= buffer.duration) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    source.connect(this.songGain);
    this.songSource = source;
    source.onended = () => {
      if (this.songSource === source) this.songSource = null;
      source.disconnect();
    };
    source.start(this.contextStart + Math.max(0, -mapMs / (1000)), offset);
  }

  private startEffects(presentationMs: number): void {
    const mapMs = presentationMs + this.inputs.introOffsetMs;
    let low = 0, high = this.schedule.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.schedule[middle]!.beatmapMs < mapMs) low = middle + 1;
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
    const anchorMap = this.presentationStartMs + this.inputs.introOffsetMs;
    const at = (mapMs: number): number => this.contextStart + (mapMs - anchorMap) / (1000);
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
      this.startEffect(sample.buffer, when, sample.volume, undefined, true);
    }
    if (this.soundIndex === this.schedule.length && this.sampleIndex === this.samples.length && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startEffect(buffer: AudioBuffer, when: number, volume: number, concurrencyKey?: string, storyboard = false): void {
    const now = this.ctx.currentTime;
    const offset = Math.max(0, (now - when));
    if (offset >= buffer.duration) return;
    const actualWhen = Math.max(now, when);
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    const amount = Math.max(0, Math.min(1, volume));
    const gain = amount === 1 ? null : this.ctx.createGain();
    if (gain) {
      gain.gain.value = amount;
      source.connect(gain);
      gain.connect(this.effectsGain);
    } else source.connect(this.effectsGain);
    this.activeEffects.set(source, gain);
    if (storyboard) this.storyboardSources.add(source);
    source.onended = () => {
      source.disconnect();
      gain?.disconnect();
      this.activeEffects.delete(source);
      this.storyboardSources.delete(source);
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

  private stopEffects(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const [source, gain] of this.activeEffects) {
      source.onended = null;
      try { source.stop(); } catch { /** 音源可能已经结束。 */ }
      source.disconnect();
      gain?.disconnect();
    }
    this.activeEffects.clear();
    this.storyboardSources.clear();
    this.voices.clear();
  }
}
