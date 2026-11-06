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
import { lowerBoundBy, upperBoundBy } from '../../../chart-preview-shared/webview-player/sorted-search';
import { PreviewPlayback } from '../../../chart-preview-shared/webview-player/playback';

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
  durationSeconds?: number;
  mode: 0 | 1 | 2 | 3;
  schedule: readonly PendingSound[];
  extraSamples?: readonly ExtraSample[];
}

const FLUSH_HORIZON_S = 2;
const SAMPLE_CONCURRENCY = 2;
type Effect = { gain: GainNode | null; when: number; end: number; cut: number; rate: number; sample?: ExtraSample; key?: string };

/** 完整预览时间轴不按回放时长截断。 */
export class AudioSync {
  readonly playback: PreviewPlayback;
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
  private readonly voices = new Map<string, AudioBufferSourceNode[]>();
  private soundIndex = 0;
  private sampleIndex = 0;
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
    this.playback = new PreviewPlayback({
      duration: () => inputs.durationSeconds ?? Infinity,
      prepare: () => this.ctx.resume(),
      context: () => this.ctx, music: () => inputs.songBuffer,
      output: () => this.songGain, musicOffset: () => inputs.introOffsetMs / 1000,
      resetSounds: (seconds, reason) => {
        this.resetEffects(reason === 'speed', seconds);
        if (reason !== 'stop') this.seekEffects(seconds, reason === 'start');
      },
      rewindSounds: (seconds, when) => {
        for (const [source, effect] of this.activeEffects) {
          if (effect.end > when && effect.cut > when) {
            source.stop(when);
            effect.cut = when;
          }
        }
        this.voices.clear();
        this.storyboardSources.clear();
        this.seekEffects(seconds, true);
      },
      schedule: (seconds, contextTime, speed, end) => this.flush(seconds, contextTime, speed, end),
    });
  }

  private get speed() { return this.playback.speed; }
  private get activeSounds(): Map<string, AudioBuffer> {
    return this.beatmapHitsounds ? this.inputs.mergedSounds : this.inputs.skinSounds;
  }

  get currentTimeMs(): number { return this.playback.scheduledTime * 1000; }
  get outputTimeMs(): number { return this.playback.currentTime * 1000; }
  get running(): boolean { return this.playback.playing; }
  setSpeed(speed: number): void { this.playback.setSpeed(speed); }
  setSongVolume(value: number): void { this.songGain.gain.value = Math.max(0, Math.min(1, value)); }
  setEffectsVolume(value: number): void { this.effectsGain.gain.value = Math.max(0, Math.min(1, value)); }

  setStoryboardEnabled(enabled: boolean): void {
    if (this.playback.disposed || enabled === this.storyboardEnabled) return;
    this.storyboardEnabled = enabled;
    if (enabled) {
      this.playback.rescheduleSounds();
    } else {
      for (const [source, effect] of this.activeEffects) if (effect.sample) this.stopEffect(source);
      this.sampleIndex = this.samples.length;
    }
  }

  setBeatmapHitsounds(on: boolean): void {
    if (on === this.beatmapHitsounds) return;
    this.beatmapHitsounds = on;
    if (this.playback.playing) {
      for (const [source, effect] of this.activeEffects) if (!effect.sample) this.stopEffect(source);
      this.voices.clear();
      this.playback.rescheduleSounds();
    }
  }

  playFrom(presentationMs: number): Promise<void> { return this.playback.playFrom(presentationMs / 1000); }
  pause(): void { this.playback.pause(); }

  destroy(): void {
    if (this.playback.disposed) return;
    this.playback.dispose();
    this.songGain.disconnect();
    this.effectsGain.disconnect();
  }

  private seekEffects(seconds: number, inclusive: boolean): void {
    const mapMs = seconds * 1000 + this.inputs.introOffsetMs;
    const search = inclusive ? lowerBoundBy : upperBoundBy;
    this.soundIndex = search(this.schedule, mapMs, sound => sound.beatmapMs);
    this.sampleIndex = this.storyboardEnabled ? upperBoundBy(this.sampleEndPrefix, mapMs, time => time) : this.samples.length;
  }

  private flush(seconds: number, contextTime: number, speed: number, endSeconds: number): void {
    const anchorMap = seconds * 1000 + this.inputs.introOffsetMs;
    const horizon = contextTime + FLUSH_HORIZON_S;
    const end = endSeconds * 1000 + this.inputs.introOffsetMs;
    const at = (mapMs: number): number => contextTime + (mapMs - anchorMap) / (1000 * speed);
    while (this.soundIndex < this.schedule.length) {
      const sound = this.schedule[this.soundIndex]!;
      if (sound.beatmapMs >= end) break;
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
      this.startEffect(buffer, when, contextTime, 1, sound.volume ?? 1, key);
    }
    while (this.sampleIndex < this.samples.length) {
      const sample = this.samples[this.sampleIndex]!;
      if (sample.timeMs >= end) break;
      const when = at(sample.timeMs);
      if (when > horizon) break;
      this.sampleIndex++;
      if (!this.storyboardSources.has(sample)) this.startEffect(sample.buffer, when, contextTime, speed, sample.volume, undefined, sample);
    }
  }

  private startEffect(buffer: AudioBuffer, when: number, anchor: number, rate: number, volume: number, concurrencyKey?: string, sample?: ExtraSample): void {
    const actualWhen = Math.max(anchor, this.ctx.currentTime, when);
    const offset = Math.max(0, (actualWhen - when) * rate);
    if (offset >= buffer.duration) return;
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
    this.activeEffects.set(source, { gain, when: actualWhen, end: actualWhen + (buffer.duration - offset) / rate, cut: Infinity, rate, sample, key: concurrencyKey });
    if (sample) this.storyboardSources.set(sample, source);
    source.onended = () => {
      source.disconnect();
      gain?.disconnect();
      this.activeEffects.delete(source);
      if (sample && this.storyboardSources.get(sample) === source) this.storyboardSources.delete(sample);
    };
    if (concurrencyKey) {
      const voices = (this.voices.get(concurrencyKey) ?? []).filter(voice => {
        const effect = this.activeEffects.get(voice);
        return effect && Math.min(effect.end, effect.cut) > actualWhen;
      });
      if (voices.length >= SAMPLE_CONCURRENCY) {
        const victim = voices.shift()!;
        this.activeEffects.get(victim)!.end = actualWhen;
        victim.stop(actualWhen);
      }
      voices.push(source);
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
    if (effect?.sample && this.storyboardSources.get(effect.sample) === source) this.storyboardSources.delete(effect.sample);
    this.activeEffects.delete(source);
  }

  private resetEffects(keepPlaying: boolean, seconds: number): void {
    this.storyboardSources.clear();
    this.voices.clear();
    const now = this.ctx.currentTime;
    for (const [source, effect] of this.activeEffects) {
      if (!keepPlaying || effect.when > now) {
        this.stopEffect(source);
        continue;
      }
      if (effect.end <= now || effect.cut <= now) continue;
      if (effect.sample) {
        const expectedOffset = seconds + (this.inputs.introOffsetMs - effect.sample.timeMs) / 1000;
        const offset = effect.sample.buffer.duration - (effect.end - now) * effect.rate;
        if (Math.abs(offset - expectedOffset) > .001) {
          this.stopEffect(source);
          continue;
        }
        this.storyboardSources.set(effect.sample, source);
        effect.end = now + (effect.end - now) * effect.rate / this.speed;
        effect.rate = this.speed;
        source.playbackRate.setValueAtTime(this.speed, now);
      } else if (effect.key) {
        const voices = this.voices.get(effect.key) ?? [];
        voices.push(source);
        this.voices.set(effect.key, voices);
      }
      if (effect.cut < Infinity) {
        /* Web Audio 的下一次 stop 会覆盖尚未生效的循环截断。 */
        source.stop(effect.end);
        effect.cut = effect.end;
      }
    }
  }
}
