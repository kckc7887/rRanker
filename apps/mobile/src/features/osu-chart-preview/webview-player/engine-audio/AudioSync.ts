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
import { MusicPlayback } from '../../../chart-preview-shared/webview-player/music';
import { lookupSkinSound, resolveSample, type PendingSound } from './hitsoundSchedule';

export type MusicAsset = { bytes: ArrayBuffer; duration: number };
export interface ExtraSample {
  timeMs: number;
  audio: MusicAsset;
  volume: number;
}
export interface AudioSyncInputs {
  ctx: AudioContext;
  song: MusicAsset | null;
  skinSounds: Map<string, AudioBuffer>;
  mergedSounds: Map<string, AudioBuffer>;
  beatmapHitsounds?: boolean;
  introOffsetMs: number;
  mode: 0 | 1 | 2 | 3;
  schedule: readonly PendingSound[];
  extraSamples?: readonly ExtraSample[];
  onWarning?(message: string): void;
}

const FLUSH_HORIZON_S = 2;
const FLUSH_INTERVAL_MS = 500;
const SAMPLE_CONCURRENCY = 2;

export class AudioSync {
  private readonly songGain: GainNode;
  private readonly effectsGain: GainNode;
  private readonly music: MusicPlayback;
  private readonly synthCache = new Map<string, AudioBuffer>();
  private readonly samples: readonly ExtraSample[];
  private readonly activeEffects = new Map<AudioBufferSourceNode, GainNode | null>();
  private readonly storyboard = new Map<ExtraSample, { music: MusicPlayback; gain: GainNode; pending: boolean }>();
  private readonly sampleEndPrefix: number[];
  private readonly voices = new Map<string, { source: AudioBufferSourceNode; end: number }[]>();
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

  constructor(private readonly inputs: AudioSyncInputs) {
    this.beatmapHitsounds = inputs.beatmapHitsounds ?? true;
    this.songGain = inputs.ctx.createGain();
    this.effectsGain = inputs.ctx.createGain();
    this.songGain.connect(inputs.ctx.destination);
    this.effectsGain.connect(inputs.ctx.destination);
    this.music = new MusicPlayback(inputs.ctx, this.songGain);
    this.music.onStateChange = () => {
      if (!this.playing) return;
      this.stopEffects();
      if (!this.music.playing) {
        this.pausedMs = this.currentTimeMs;
        this.playing = false;
        this.inputs.onWarning?.('音乐暂时无法播放，请重试');
        return;
      }
      if (this.music.waiting) this.pausedMs = this.currentTimeMs;
      else this.startEffects(this.pausedMs);
    };
    this.samples = [...(inputs.extraSamples ?? [])].sort((a, b) => a.timeMs - b.timeMs);
    let end = -Infinity;
    this.sampleEndPrefix = this.samples.map(sample => end = Math.max(end, sample.timeMs + sample.audio.duration * 1000));
  }

  async load(): Promise<void> {
    if (!await this.music.load(this.inputs.song?.bytes ?? null) && this.inputs.song && !this.disposed) {
      this.inputs.onWarning?.('歌曲音频无法播放，仍可观看谱面');
    }
  }

  private get activeSounds(): Map<string, AudioBuffer> {
    return this.beatmapHitsounds ? this.inputs.mergedSounds : this.inputs.skinSounds;
  }

  get currentTimeMs(): number {
    return this.playing ? this.music.currentTime * 1000 - this.inputs.introOffsetMs : this.pausedMs;
  }

  get running(): boolean { return this.playing; }
  get advancing(): boolean { return this.playing && !this.music.waiting; }
  setSongVolume(value: number): void { this.songGain.gain.value = Math.max(0, Math.min(1, value)); }
  setEffectsVolume(value: number): void { this.effectsGain.gain.value = Math.max(0, Math.min(1, value)); }

  setSpeed(speed: number): void {
    if (speed === this.speed || this.disposed) return;
    this.speed = speed;
    this.stopHitsounds();
    this.music.setSpeed(speed);
    for (const voice of this.storyboard.values()) voice.music.setSpeed(speed);
    if (this.advancing) this.startEffects(this.currentTimeMs);
  }

  setStoryboardEnabled(enabled: boolean): void {
    if (this.disposed || enabled === this.storyboardEnabled) return;
    this.storyboardEnabled = enabled;
    this.stopStoryboard();
    this.sampleIndex = enabled ? this.firstLiveSample(this.currentTimeMs + this.inputs.introOffsetMs) : this.samples.length;
    if (this.advancing) {
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
    if (this.advancing) {
      this.stopEffects();
      this.startEffects(this.currentTimeMs);
    }
  }

  async playFrom(presentationMs: number): Promise<void> {
    if (this.disposed) return;
    this.pause();
    this.pausedMs = presentationMs;
    const generation = ++this.generation;
    try {
      await this.music.playFrom((presentationMs + this.inputs.introOffsetMs) / 1000, this.speed);
      if (this.disposed || generation !== this.generation) return;
      if (!this.music.playing) throw new Error('音乐暂时无法播放，请重试');
      this.playing = true;
      if (!this.music.waiting) this.startEffects(presentationMs);
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.inputs.onWarning?.('音乐暂时无法播放，请重试');
      throw error;
    }
  }

  pause(): void {
    this.generation++;
    this.pausedMs = this.currentTimeMs;
    this.playing = false;
    this.music.pause();
    this.stopEffects();
  }

  destroy(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.music.onStateChange = undefined;
    this.music.dispose();
    this.songGain.disconnect();
    this.effectsGain.disconnect();
  }

  private startEffects(presentationMs: number): void {
    const mapMs = presentationMs + this.inputs.introOffsetMs;
    let low = 0, high = this.inputs.schedule.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.inputs.schedule[middle]!.beatmapMs < mapMs) low = middle + 1;
      else high = middle;
    }
    this.soundIndex = low;
    this.sampleIndex = this.storyboardEnabled ? this.firstLiveSample(mapMs) : this.samples.length;
    this.flush();
    this.ensureTimer();
  }

  private ensureTimer(): void {
    if (this.timer === null && (this.soundIndex < this.inputs.schedule.length || this.sampleIndex < this.samples.length || this.storyboard.size > 0)) {
      this.timer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  private flush(): void {
    if (!this.advancing) return;
    const now = this.inputs.ctx.currentTime;
    const horizon = now + FLUSH_HORIZON_S;
    const mapMs = this.music.currentTime * 1000;
    const at = (timeMs: number): number => now + (timeMs - mapMs) / (1000 * this.speed);
    for (const [sample, voice] of this.storyboard) {
      if (mapMs >= sample.timeMs + sample.audio.duration * 1000) {
        voice.music.dispose();
        voice.gain.disconnect();
        this.storyboard.delete(sample);
      } else if (!voice.pending && !voice.music.waiting && Math.abs(voice.music.currentTime - (mapMs - sample.timeMs) / 1000) > .15) {
        this.syncSample(sample, voice);
      }
    }
    while (this.soundIndex < this.inputs.schedule.length) {
      const sound = this.inputs.schedule[this.soundIndex]!;
      const when = at(sound.beatmapMs);
      if (when > horizon) break;
      this.soundIndex++;
      const buffer = sound.type === 'combobreak' || sound.type === 'spinnerbonus'
        ? lookupSkinSound(this.activeSounds, sound.type)
        : resolveSample(sound.type, sound.sampleSet, sound.sampleIndex, this.beatmapHitsounds ? sound.customFile : '', {
          mode: this.inputs.mode, skinSounds: this.activeSounds, synthCache: this.synthCache, ctx: this.inputs.ctx,
        });
      if (buffer) this.startEffect(buffer, when, sound.volume ?? 1, `${sound.type}|${sound.sampleSet}|${sound.sampleIndex}|${sound.customFile}`);
    }
    while (this.sampleIndex < this.samples.length) {
      const sample = this.samples[this.sampleIndex]!;
      if (at(sample.timeMs) > horizon) break;
      this.sampleIndex++;
      if (mapMs < sample.timeMs + sample.audio.duration * 1000) this.startSample(sample);
    }
    if (this.soundIndex === this.inputs.schedule.length && this.sampleIndex === this.samples.length && this.storyboard.size === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private startSample(sample: ExtraSample): void {
    if (this.storyboard.has(sample)) return;
    const gain = this.inputs.ctx.createGain();
    gain.gain.value = sample.volume;
    gain.connect(this.effectsGain);
    const music = new MusicPlayback(this.inputs.ctx, gain);
    const voice = { music, gain, pending: true };
    this.storyboard.set(sample, voice);
    void music.load(sample.audio.bytes).then(loaded => {
      if (this.storyboard.get(sample) !== voice) return;
      if (!loaded) throw new Error('故事板音效无法播放');
      this.syncSample(sample, voice);
    }).catch(() => {
      if (this.storyboard.get(sample) !== voice) return;
      this.storyboard.delete(sample);
      music.dispose();
      gain.disconnect();
      this.inputs.onWarning?.('部分故事板音效无法播放，已保留其它谱面内容');
    });
  }

  private syncSample(sample: ExtraSample, voice: { music: MusicPlayback; gain: GainNode; pending: boolean }): void {
    const offset = this.music.currentTime - sample.timeMs / 1000;
    if (!this.advancing || offset >= sample.audio.duration) {
      this.storyboard.delete(sample);
      voice.music.dispose();
      voice.gain.disconnect();
      return;
    }
    voice.pending = true;
    void voice.music.playFrom(offset, this.speed).then(() => {
      if (this.storyboard.get(sample) === voice && !voice.music.playing) throw new Error('故事板音效无法播放');
    }).catch(() => {
      if (this.storyboard.get(sample) !== voice) return;
      this.storyboard.delete(sample);
      voice.music.dispose();
      voice.gain.disconnect();
      this.inputs.onWarning?.('部分故事板音效无法播放，已保留其它谱面内容');
    }).finally(() => { voice.pending = false; });
  }

  private startEffect(buffer: AudioBuffer, when: number, volume: number, concurrencyKey: string): void {
    const now = this.inputs.ctx.currentTime;
    const offset = Math.max(0, now - when);
    if (offset >= buffer.duration) return;
    const actualWhen = Math.max(now, when);
    const source = this.inputs.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 1;
    const amount = Math.max(0, Math.min(1, volume));
    const gain = amount === 1 ? null : this.inputs.ctx.createGain();
    if (gain) {
      gain.gain.value = amount;
      source.connect(gain);
      gain.connect(this.effectsGain);
    } else source.connect(this.effectsGain);
    this.activeEffects.set(source, gain);
    source.onended = () => {
      source.disconnect();
      gain?.disconnect();
      this.activeEffects.delete(source);
    };
    const voices = (this.voices.get(concurrencyKey) ?? []).filter(voice => voice.end > actualWhen);
    if (voices.length >= SAMPLE_CONCURRENCY) {
      const victim = voices.shift()!;
      try { victim.source.stop(actualWhen); } catch { /** 音源可能已经结束。 */ }
    }
    voices.push({ source, end: actualWhen + buffer.duration - offset });
    this.voices.set(concurrencyKey, voices);
    source.start(actualWhen, offset);
  }

  private stopStoryboard(): void {
    for (const voice of this.storyboard.values()) {
      voice.music.dispose();
      voice.gain.disconnect();
    }
    this.storyboard.clear();
  }

  private stopEffects(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.stopHitsounds();
    this.stopStoryboard();
  }

  private stopHitsounds(): void {
    for (const [source, gain] of this.activeEffects) {
      source.onended = null;
      try { source.stop(); } catch { /** 音源可能已经结束。 */ }
      source.disconnect();
      gain?.disconnect();
    }
    this.activeEffects.clear();
    this.voices.clear();
  }
}
