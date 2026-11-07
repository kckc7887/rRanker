/**
 * 许可证：对时与打击音调度语义衍生自 TeamFlos/phira（GPL-3.0，https://github.com/TeamFlos/phira），
 * 相应部分按 GPL-3.0 随本项目（AGPL-3.0）一并发布，两者兼容；来源与许可证全文见仓库根 THIRD_PARTY_NOTICES.md。
 */

import {
  HIT_SOUND_LOOKAHEAD_SECONDS,
  findHitSoundCursor,
  hitSoundScheduleDelay,
  type HitSoundEvent,
  type HitSoundKind,
} from './hit-sound';
import { PreviewPlayback } from '../../chart-preview-shared/webview-player/playback';

const HIT_SOUND_RESYNC_WINDOW_S = 0.25;

function decodeBase64DataUrl(url: string): ArrayBuffer {
  const separator = url.indexOf(',');
  const base64 = separator >= 0 ? url.slice(separator + 1) : url;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export interface PhigrosPlaybackSettings {
  playbackSpeed: number;
  volume: number;
  hitSoundVolume: number;
}

export interface PhigrosChartTimeline {
  durationSeconds: number;
  offsetSeconds: number;
}

export interface PhigrosPlaybackHost {

  render(chartTime: number, seek?: boolean): void;

  onPlayStateChange?(playing: boolean): void;

  onPlaybackError?(): void;
}

export interface PhigrosPlaybackOptions {
  settings: PhigrosPlaybackSettings;

  hitSounds?: Partial<Record<HitSoundKind, string>> | undefined;
  host: PhigrosPlaybackHost;
}

export class PhigrosPlaybackSession {
  readonly playback: PreviewPlayback;
  private readonly settings: PhigrosPlaybackSettings;
  private readonly hitSoundDataUrls: PhigrosPlaybackOptions['hitSounds'];
  private chartTimeline: PhigrosChartTimeline = { durationSeconds: 0, offsetSeconds: 0 };
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private hitSoundGain: GainNode | null = null;
  private music: AudioBuffer | null = null;
  private hitSoundBuffers: Partial<Record<HitSoundKind, AudioBuffer>> | null = null;
  private hitSoundEvents: readonly HitSoundEvent[] = [];
  private hitSoundCursor = 0;
  private lastHitSoundTime = -1e-6;
  private readonly activeHitSounds = new Map<AudioBufferSourceNode, number>();
  private resourceGeneration = 0;

  constructor(options: PhigrosPlaybackOptions) {
    this.settings = options.settings;
    this.hitSoundDataUrls = options.hitSounds;
    this.playback = new PreviewPlayback({
      duration: () => this.chartDuration,
      prepare: async () => {
        await this.ensureAudio();
        if (!this.disposed && this.hitSoundDataUrls) await this.ensureHitSoundsReady();
      },
      context: () => this.context!, music: () => this.music, output: () => this.musicGain!,
      musicOffset: () => this.chartOffset, lead: .05, silentFrameClock: true,
      resetSounds: (seconds, reason) => { this.stopActiveHitSounds(); this.resetHitSoundTimeline(seconds, reason === 'start'); },
      rewindSounds: (seconds, when) => {
        for (const [source, end] of this.activeHitSounds) {
          if (end <= when) continue;
          source.stop(when);
          this.activeHitSounds.set(source, when);
        }
        this.resetHitSoundTimeline(seconds, true);
      },
      schedule: (seconds, now, speed, end) => this.updateHitSounds(seconds, now, speed, end),
      onState: options.host.onPlayStateChange, onError: () => options.host.onPlaybackError?.(),
    });
    this.playback.onFrame = (seconds, seek) => options.host.render(seconds, seek);
    this.playback.setSpeed(this.settings.playbackSpeed);
  }

  get loop() { return this.playback.loop; }
  get playing() { return this.playback.playing; }
  get disposed() { return this.playback.disposed; }
  get chartTime() { return this.playback.currentTime; }
  get chartDuration() { return this.chartTimeline.durationSeconds; }
  get chartOffset() { return this.chartTimeline.offsetSeconds; }
  get musicDurationSeconds() { return this.music?.duration ?? null; }
  setChartTimeline(timeline: PhigrosChartTimeline): void {
    this.chartTimeline = timeline;
    this.playback.moveTo(this.chartTime);
  }
  moveTo(seconds: number): void { this.playback.moveTo(seconds); }
  async play(): Promise<void> {
    this.applySpeedChange();
    await this.playback.playFrom(this.chartTime);
  }
  pause(): void { this.playback.pause(); }
  seek(seconds: number): Promise<void> { return this.playback.seek(seconds); }
  applySpeedChange(): void { this.playback.setSpeed(this.settings.playbackSpeed); }

  setHitSoundEvents(events: readonly HitSoundEvent[]): void {
    this.hitSoundEvents = events;

    this.hitSoundCursor = 0;
    this.lastHitSoundTime = -1e-6;
  }

  async loadMusic(bytes: ArrayBuffer | null): Promise<boolean> {
    if (this.disposed) return false;
    const generation = ++this.resourceGeneration;
    this.music = null;
    if (!bytes) return false;
    try {
      const context = await this.ensureAudio(false);
      if (this.disposed || generation !== this.resourceGeneration) return false;
      const music = await context.decodeAudioData(bytes);
      if (this.disposed || generation !== this.resourceGeneration) return false;
      this.music = music;
      return true;
    } catch {
      if (!this.disposed && generation === this.resourceGeneration) this.music = null;
      return false;
    }
  }

  applyAudioSettings(): void {
    if (this.musicGain) this.musicGain.gain.value = this.settings.volume;
    if (this.hitSoundGain) this.hitSoundGain.gain.value = this.settings.hitSoundVolume;
    if (this.settings.hitSoundVolume <= 0) this.stopActiveHitSounds();
  }

  dispose(): void {
    if (this.disposed) return;
    this.playback.dispose();
    this.resourceGeneration += 1;
    this.stopActiveHitSounds();
    this.hitSoundBuffers = null;
    this.music = null;
    for (const node of [this.musicGain, this.hitSoundGain]) {
      try {
        node?.disconnect();
      } catch {

      }
    }
  }

  private async ensureAudio(resume = true): Promise<AudioContext> {
    if (!this.context) {
      const AudioContextClass = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error('浏览器不支持 Web Audio');
      const context = new AudioContextClass({ latencyHint: 'playback' });
      this.context = context;
      this.musicGain = context.createGain();
      this.musicGain.gain.value = this.settings.volume;
      this.musicGain.connect(context.destination);
      this.hitSoundGain = context.createGain();
      this.hitSoundGain.gain.value = this.settings.hitSoundVolume;
      this.hitSoundGain.connect(context.destination);
    }
    if (resume) await this.context.resume();
    return this.context;
  }

  private async ensureHitSoundsReady(): Promise<void> {
    if (this.hitSoundBuffers) return;
    const generation = this.resourceGeneration;
    if (!this.hitSoundDataUrls) throw new Error('打击音资源尚未提供');
    const context = await this.ensureAudio();
    if (this.disposed || generation !== this.resourceGeneration) return;
    const entries = await Promise.all((['click', 'drag', 'flick'] as HitSoundKind[]).map(async (kind) => {
      const dataUrl = this.hitSoundDataUrls?.[kind];
      if (!dataUrl) return [kind, undefined] as const;
      const bytes = decodeBase64DataUrl(dataUrl);
      try {
        return [kind, await context.decodeAudioData(bytes)] as const;
      } catch (error) {
        throw new Error(`${kind}.wav Web Audio 解码失败（${bytes.byteLength} bytes）：${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    if (!this.disposed && generation === this.resourceGeneration) this.hitSoundBuffers = Object.fromEntries(entries);
  }

  private resetHitSoundTimeline(time: number, inclusive = false): void {
    this.hitSoundCursor = findHitSoundCursor(this.hitSoundEvents, time, inclusive);
    this.lastHitSoundTime = time;
  }

  private playHitSound(kind: HitSoundKind, delay: number, outputNow: number): void {
    const buffer = this.hitSoundBuffers?.[kind];
    if (!buffer || !this.context || !this.hitSoundGain || this.settings.hitSoundVolume <= 0) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.hitSoundGain);

    const scheduledAt = Math.max(this.context.currentTime, outputNow + delay);
    source.addEventListener('ended', () => { this.activeHitSounds.delete(source); source.disconnect(); }, { once: true });
    this.activeHitSounds.set(source, scheduledAt + buffer.duration);
    source.start(scheduledAt);
  }

  private stopActiveHitSounds(): void {
    for (const source of this.activeHitSounds.keys()) {
      try { source.stop(); } catch {}
    }
    this.activeHitSounds.clear();
  }

  private updateHitSounds(time: number, outputNow: number, speed: number, end: number): void {
    if (!this.hitSoundBuffers || !this.context) return;
    if (time - this.lastHitSoundTime > HIT_SOUND_RESYNC_WINDOW_S) {
      this.hitSoundCursor = Math.max(this.hitSoundCursor, findHitSoundCursor(this.hitSoundEvents, time));
    }
    const horizon = time + HIT_SOUND_LOOKAHEAD_SECONDS * speed;
    while (this.hitSoundCursor < this.hitSoundEvents.length) {
      const event = this.hitSoundEvents[this.hitSoundCursor]!;
      if (event.time > horizon || event.time >= end) break;
      this.playHitSound(event.sound, hitSoundScheduleDelay(event.time, time, speed), outputNow);
      this.hitSoundCursor++;
    }
    this.lastHitSoundTime = time;
  }
}
