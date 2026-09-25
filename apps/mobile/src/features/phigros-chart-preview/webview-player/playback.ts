/**
 * Phigros / Phira 谱面确认播放会话。
 * 独占播放位置（谱面秒）、命令代次、音乐音源、打击音调度与 rAF；
 * 设置对象由宿主持有（拨轮与持久化），会话只读取当前值。
 *
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
import {
  PlaybackClock,
  audioContextTime,
  musicPosition,
  outputTime,
  type MusicPosition,
} from '../../chart-preview-shared/webview-player/playbackClock';
import { getAudioContextOutputTime } from '../../chart-preview-shared/webview-player/audioClock';

const SOURCE_START_LEAD_TIME_S = 0.05;
const SOURCE_FADE_TIME_S = 0.015;
const MUSIC_END_EPSILON_S = 0.05;
const CHART_END_EPSILON_S = 0.25;
const HIT_SOUND_RESYNC_WINDOW_S = 0.25;
const RESTART_TAIL_S = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function decodeBase64DataUrl(url: string): ArrayBuffer {
  const separator = url.indexOf(',');
  const base64 = separator >= 0 ? url.slice(separator + 1) : url;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

/** 外部环境边界：由调用方注入，便于在不改全局对象的前提下验证会话。 */
export interface PhigrosPlaybackEnvironment {
  createAudioContext(): AudioContext;
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(handle: number): void;
  now(): number;
}

export const defaultPhigrosPlaybackEnvironment: PhigrosPlaybackEnvironment = {
  createAudioContext: () => {
    const AudioContextClass = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) throw new Error('浏览器不支持 Web Audio');
    return new AudioContextClass({ latencyHint: 'interactive' });
  },
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

/** 播放设置由宿主持有，会话只读取当前值，不另存副本。 */
export interface PhigrosPlaybackSettings {
  playbackSpeed: number;
  volume: number;
  hitSoundVolume: number;
}

/** 谱面时间轴：解析完成后由宿主提供，位置与音乐时间的偏移归会话使用。 */
export interface PhigrosChartTimeline {
  durationSeconds: number;
  offsetSeconds: number;
}

export interface PhigrosPlaybackHost {
  /** 位置或播放状态变化后重绘（渲染器、HUD 与时间轴）。 */
  render(chartTime: number): void;
  /** 播放状态变化：开始、暂停与播放结束都会通知。 */
  onPlayStateChange?(playing: boolean): void;
  /** 音频无法启动时的错误出口。 */
  onPlaybackError?(): void;
}

export interface PhigrosPlaybackOptions {
  settings: PhigrosPlaybackSettings;
  /** 打击音的 Base64 数据；缺失时按无打击音播放。 */
  hitSounds?: Partial<Record<HitSoundKind, string>> | undefined;
  environment?: PhigrosPlaybackEnvironment;
  host: PhigrosPlaybackHost;
}

export class PhigrosPlaybackSession {
  private readonly clock = new PlaybackClock();
  private readonly settings: PhigrosPlaybackSettings;
  private readonly hitSoundDataUrls: Partial<Record<HitSoundKind, string>> | undefined;
  private readonly environment: PhigrosPlaybackEnvironment;
  private readonly host: PhigrosPlaybackHost;
  private chartTimeline: PhigrosChartTimeline = { durationSeconds: 0, offsetSeconds: 0 };
  private chartTimePosition = 0;
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private hitSoundGain: GainNode | null = null;
  private music: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private sourcePlaying = false;
  private hitSoundBuffers: Partial<Record<HitSoundKind, AudioBuffer>> | null = null;
  private hitSoundEvents: readonly HitSoundEvent[] = [];
  private hitSoundCursor = 0;
  private lastHitSoundTime = -1e-6;
  private readonly activeHitSounds = new Set<AudioBufferSourceNode>();
  private command = 0;
  private frame: number | null = null;
  private lastFrameTimestamp = 0;
  /** 播放状态与释放状态由会话内部改写，宿主只读。 */
  playing = false;
  disposed = false;

  constructor(options: PhigrosPlaybackOptions) {
    this.settings = options.settings;
    this.hitSoundDataUrls = options.hitSounds;
    this.environment = options.environment ?? defaultPhigrosPlaybackEnvironment;
    this.host = options.host;
  }

  get chartTime(): number {
    return this.chartTimePosition;
  }

  get chartDuration(): number {
    return this.chartTimeline.durationSeconds;
  }

  get chartOffset(): number {
    return this.chartTimeline.offsetSeconds;
  }

  get musicDurationSeconds(): number | null {
    return this.music ? this.music.duration : null;
  }

  setChartTimeline(timeline: PhigrosChartTimeline): void {
    this.chartTimeline = timeline;
    this.chartTimePosition = clamp(this.chartTimePosition, 0, timeline.durationSeconds);
  }

  setHitSoundEvents(events: readonly HitSoundEvent[]): void {
    this.hitSoundEvents = events;
    // 谱面加载后从时间轴起点开始：允许负时间事件在首帧被调度（与既有行为一致）。
    this.hitSoundCursor = 0;
    this.lastHitSoundTime = -1e-6;
  }

  /** 解码音乐；失败时进入静音看谱。 */
  async loadMusic(bytes: ArrayBuffer | null): Promise<boolean> {
    this.music = null;
    if (!bytes) return false;
    try {
      const context = await this.ensureAudio(false);
      this.music = await context.decodeAudioData(bytes);
      return true;
    } catch {
      this.music = null;
      return false;
    }
  }

  moveTo(chartTime: number): void {
    this.chartTimePosition = clamp(chartTime, 0, this.chartTimeline.durationSeconds);
  }

  async play(): Promise<void> {
    if (this.disposed) return;
    const command = ++this.command;
    try {
      await this.ensureAudio();
      try {
        await this.ensureHitSoundsReady();
      } catch {
        /* 打击音解码失败不影响播放 */
      }
    } catch {
      this.host.onPlaybackError?.();
      return;
    }
    // 等待期间发生暂停、跳转或释放时，本次播放不再启动音源与帧循环。
    if (this.disposed || command !== this.command) return;
    if (this.chartTimePosition >= this.chartTimeline.durationSeconds - RESTART_TAIL_S) {
      this.chartTimePosition = 0;
    }
    this.playing = true;
    this.host.onPlayStateChange?.(true);
    this.lastFrameTimestamp = 0;
    this.resetHitSoundTimeline(this.chartTimePosition);
    const musicSeconds = this.chartTimePosition + this.chartTimeline.offsetSeconds;
    if (this.music && musicSeconds < this.music.duration - MUSIC_END_EPSILON_S) {
      await this.startSource(musicSeconds, command);
    } else {
      this.stopSource(true);
      this.lastFrameTimestamp = this.environment.now();
    }
    if (this.disposed || command !== this.command) return;
    this.cancelFrame();
    this.frame = this.environment.requestFrame(this.tick);
  }

  pause(): void {
    this.command += 1;
    this.playing = false;
    this.host.onPlayStateChange?.(false);
    if (this.sourcePlaying) {
      this.clock.setOffset(this.musicTime());
      this.stopSource(false);
    }
    this.stopActiveHitSounds();
    this.resetHitSoundTimeline(this.chartTimePosition);
    this.cancelFrame();
    this.lastFrameTimestamp = 0;
    this.host.render(this.chartTimePosition);
  }

  async seek(chartTime: number): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.command;
    if (this.playing) {
      this.moveTo(chartTime);
      await this.play();
      return;
    }
    if (this.disposed || generation !== this.command) return;
    this.moveTo(chartTime);
    this.stopActiveHitSounds();
    this.resetHitSoundTimeline(this.chartTimePosition);
    this.clock.setOffset(musicPosition(this.chartTimePosition + this.chartTimeline.offsetSeconds));
    this.host.render(this.chartTimePosition);
  }

  /** 音量或打击音音量变化后同步增益，并在关闭打击音时停掉在途音源。 */
  applyAudioSettings(): void {
    if (this.musicGain) this.musicGain.gain.value = this.settings.volume;
    if (this.hitSoundGain) this.hitSoundGain.gain.value = this.settings.hitSoundVolume;
    if (this.settings.hitSoundVolume <= 0) this.stopActiveHitSounds();
  }

  /** 播放中改变倍速：采样级同步，不打断当前声源。 */
  applySpeedChange(): void {
    if (!this.playing || !this.sourcePlaying || !this.context || !this.source) return;
    const now = audioContextTime(this.context.currentTime);
    this.source.playbackRate.setValueAtTime(this.settings.playbackSpeed, now);
    this.clock.appendSegment(now, this.settings.playbackSpeed);
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.stopActiveHitSounds();
    this.hitSoundBuffers = null;
    this.music = null;
    for (const node of [this.musicGain, this.hitSoundGain]) {
      try {
        node?.disconnect();
      } catch {
        /* 已断开 */
      }
    }
    this.disposed = true;
  }

  private cancelFrame(): void {
    if (this.frame === null) return;
    this.environment.cancelFrame(this.frame);
    this.frame = null;
  }

  private async ensureAudio(resume = true): Promise<AudioContext> {
    if (!this.context) {
      const context = this.environment.createAudioContext();
      this.context = context;
      this.musicGain = context.createGain();
      this.musicGain.gain.value = this.settings.volume;
      this.musicGain.connect(context.destination);
      this.hitSoundGain = context.createGain();
      this.hitSoundGain.gain.value = this.settings.hitSoundVolume;
      this.hitSoundGain.connect(context.destination);
    }
    if (resume) {
      try {
        await this.context.resume();
      } catch {
        // 尚无用户手势授权时保持 suspended；点击开始播放会再次 resume。
      }
    }
    return this.context;
  }

  private musicTime(): MusicPosition {
    if (!this.context || !this.sourcePlaying) return this.clock.offset;
    const heardAt = outputTime(getAudioContextOutputTime(this.context));
    this.clock.prune(heardAt);
    return this.clock.positionAt(heardAt);
  }

  private stopSource(fade: boolean): void {
    const source = this.source;
    const gain = this.sourceGain;
    this.source = null;
    this.sourceGain = null;
    this.sourcePlaying = false;
    if (!source) return;
    if (fade && this.context && gain) {
      const now = this.context.currentTime;
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + SOURCE_FADE_TIME_S);
        source.stop(now + SOURCE_FADE_TIME_S + 0.01);
      } catch {
        /* 已停止 */
      }
    } else {
      try { source.stop(); } catch { /* 已停止 */ }
    }
    try { source.disconnect(); } catch { /* 已断开 */ }
    try { gain?.disconnect(); } catch { /* 已断开 */ }
  }

  private async startSource(musicSeconds: number, command: number): Promise<void> {
    if (!this.music) return;
    const context = await this.ensureAudio();
    if (!this.musicGain || command !== this.command || this.disposed) return;
    this.stopSource(true);
    const buffer = this.music;
    const clamped = clamp(musicSeconds, 0, Math.max(0, buffer.duration - 0.01));
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = this.settings.playbackSpeed;
    const startTime = context.currentTime + SOURCE_START_LEAD_TIME_S;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + SOURCE_FADE_TIME_S);
    source.connect(gain);
    gain.connect(this.musicGain);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        this.sourceGain = null;
        this.sourcePlaying = false;
        this.clock.clear();
      }
    };
    source.start(startTime, clamped);
    this.source = source;
    this.sourceGain = gain;
    this.sourcePlaying = true;
    const audibleAt = outputTime(getAudioContextOutputTime(context) + SOURCE_START_LEAD_TIME_S);
    this.clock.set(audibleAt, musicPosition(clamped), this.settings.playbackSpeed);
  }

  private async ensureHitSoundsReady(): Promise<void> {
    if (this.hitSoundBuffers) return;
    if (!this.hitSoundDataUrls) throw new Error('打击音资源尚未提供');
    const context = await this.ensureAudio();
    const entries = await Promise.all((['click', 'drag', 'flick'] as HitSoundKind[]).map(async (kind) => {
      const dataUrl = this.hitSoundDataUrls?.[kind];
      if (!dataUrl) throw new Error(`缺少打击音 ${kind}`);
      const bytes = decodeBase64DataUrl(dataUrl);
      try {
        return [kind, await context.decodeAudioData(bytes)] as const;
      } catch (error) {
        throw new Error(`${kind}.wav Web Audio 解码失败（${bytes.byteLength} bytes）：${error instanceof Error ? error.message : String(error)}`);
      }
    }));
    this.hitSoundBuffers = Object.fromEntries(entries);
  }

  private resetHitSoundTimeline(time: number): void {
    this.hitSoundCursor = findHitSoundCursor(this.hitSoundEvents, time);
    this.lastHitSoundTime = time;
  }

  private playHitSound(kind: HitSoundKind, delay: number, outputNow: number): void {
    const buffer = this.hitSoundBuffers?.[kind];
    if (!buffer || !this.context || !this.hitSoundGain || this.settings.hitSoundVolume <= 0) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.hitSoundGain);
    // 与舞萌正解音调度一致：以输出端时间为参考，且不早于当前调度时刻。
    const scheduledAt = Math.max(this.context.currentTime, outputNow + delay);
    source.addEventListener('ended', () => this.activeHitSounds.delete(source), { once: true });
    this.activeHitSounds.add(source);
    source.start(scheduledAt);
  }

  private stopActiveHitSounds(): void {
    this.activeHitSounds.forEach((source) => {
      try { source.stop(); } catch { /* 可能已经结束 */ }
    });
    this.activeHitSounds.clear();
  }

  private updateHitSounds(time: number): void {
    if (!this.playing || !this.hitSoundBuffers || !this.context) return;
    if (!Number.isFinite(this.lastHitSoundTime)
      || time < this.lastHitSoundTime
      || time - this.lastHitSoundTime > HIT_SOUND_RESYNC_WINDOW_S) {
      this.stopActiveHitSounds();
      this.resetHitSoundTimeline(time);
      return;
    }
    const outputNow = getAudioContextOutputTime(this.context);
    const speed = this.clock.schedulingSpeed(this.settings.playbackSpeed);
    const horizon = time + HIT_SOUND_LOOKAHEAD_SECONDS * speed;
    while (this.hitSoundCursor < this.hitSoundEvents.length
      && this.hitSoundEvents[this.hitSoundCursor]!.time <= horizon) {
      const event = this.hitSoundEvents[this.hitSoundCursor]!;
      this.playHitSound(event.sound, hitSoundScheduleDelay(event.time, time, speed), outputNow);
      this.hitSoundCursor += 1;
    }
    this.lastHitSoundTime = time;
  }

  private finishPlayback(): void {
    this.playing = false;
    this.stopSource(true);
    this.stopActiveHitSounds();
    this.chartTimePosition = this.chartTimeline.durationSeconds;
    this.host.onPlayStateChange?.(false);
    this.lastFrameTimestamp = 0;
    this.host.render(this.chartTimePosition);
  }

  private readonly tick = (timestamp: number): void => {
    this.frame = null;
    if (this.disposed || !this.playing) return;
    let chartTime = this.chartTimePosition;
    if (this.music && this.sourcePlaying && this.context) {
      const musicTime = this.musicTime();
      if (musicTime >= this.music.duration - MUSIC_END_EPSILON_S) {
        this.stopSource(true);
      } else {
        chartTime = Math.max(0, musicTime - this.chartTimeline.offsetSeconds);
      }
    } else {
      if (this.lastFrameTimestamp > 0) {
        chartTime += ((timestamp - this.lastFrameTimestamp) / 1000) * this.settings.playbackSpeed;
      }
      this.lastFrameTimestamp = timestamp;
    }
    if (chartTime >= this.chartTimeline.durationSeconds + CHART_END_EPSILON_S) {
      this.finishPlayback();
      return;
    }
    this.chartTimePosition = chartTime;
    this.updateHitSounds(chartTime);
    this.host.render(chartTime);
    this.frame = this.environment.requestFrame(this.tick);
  };
}
