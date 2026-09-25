/**
 * 舞萌谱面确认播放会话。
 * 独占播放位置（拍）、命令代次、音源与 rAF；位置的拍/毫秒/音乐秒换算沿用 timeConversion，
 * 视图、背景与控制只通过回调接线，不各自保存播放状态。
 */

import { AudioManager, type PreparedAudioEvent } from '../engine/core/audio/AudioManager';
import { ANSWER_SOUND_BASE_OFFSET_MS } from '../engine/utils/constants';
import type { Chart } from '../engine/types';
import {
  PlaybackClock,
  audioContextTime,
  musicPosition,
  outputTime,
  type MusicPosition,
} from '../../chart-preview-shared/webview-player/playbackClock';
import { getAudioContextOutputTime } from '../../chart-preview-shared/webview-player/audioClock';
import {
  SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS,
  createSimaiPlaybackTimeline,
  resolvePlaybackRange,
  type SimaiPlaybackTimeline,
} from './timeConversion';

const SOURCE_FADE_TIME_S = 0.015;
const SOURCE_START_LEAD_TIME_S = 0.05;
const SCHEDULE_LOOKAHEAD_MS = 1500;
const SPEED_MIN = 0.1;
const SPEED_MAX = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 外部环境边界：由调用方注入，便于在不改全局对象的前提下验证会话。 */
export interface SimaiPlaybackEnvironment {
  createAudioContext(): AudioContext;
  requestFrame(callback: (timestamp: number) => void): number;
  cancelFrame(handle: number): void;
  now(): number;
}

export const defaultSimaiPlaybackEnvironment: SimaiPlaybackEnvironment = {
  createAudioContext: () => new AudioContext(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  now: () => performance.now(),
};

/** 会话向播放器界面派发的事件出口。 */
export interface SimaiPlaybackHost {
  /** 位置或播放状态变化后重绘（含背景视频同步、时间轴与信息栏）。 */
  render(beats: number): void;
  /** 播放状态变化：开始、暂停与自然结束都会通知。 */
  onPlayStateChange?(playing: boolean): void;
  /** 播到循环区间终点时返回回绕位置，null 表示不循环。 */
  loopTarget?(beats: number): number | null;
}

export interface SimaiPlaybackOptions {
  /** 参与播放范围计算的谱面；第一份是位置换算的主谱。 */
  charts: readonly Chart[];
  answerEvents: readonly PreparedAudioEvent[];
  answerSoundUrl: string;
  speed?: number;
  /** 0～10，与设置面板一致。 */
  musicVolume?: number;
  /** 0～10，与设置面板一致。 */
  soundVolume?: number;
  musicOffset?: number;
  environment?: SimaiPlaybackEnvironment;
  host: SimaiPlaybackHost;
}

export class SimaiPlaybackSession {
  private readonly clock = new PlaybackClock();
  private readonly charts: readonly Chart[];
  private readonly answerEvents: readonly PreparedAudioEvent[];
  private readonly answerSoundUrl: string;
  private readonly musicOffset: number;
  private readonly environment: SimaiPlaybackEnvironment;
  private readonly host: SimaiPlaybackHost;
  private range = { totalDurationMs: 0, totalBeats: 0 };
  private timeline: SimaiPlaybackTimeline;
  private beatsPosition = 0;
  private playbackSpeed: number;
  private musicVolume: number;
  private soundVolume: number;
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private answerGain: GainNode | null = null;
  private answers: AudioManager | null = null;
  private music: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private sourceGain: GainNode | null = null;
  private audioClockRunning = false;
  private command = 0;
  private frame: number | null = null;
  private lastFrameTimestamp = 0;
  /** 播放状态与释放状态由会话内部改写，宿主只读。 */
  playing = false;
  disposed = false;

  constructor(options: SimaiPlaybackOptions) {
    this.charts = options.charts;
    this.answerEvents = options.answerEvents;
    this.answerSoundUrl = options.answerSoundUrl;
    this.musicOffset = options.musicOffset ?? SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS;
    this.playbackSpeed = options.speed ?? 1;
    this.musicVolume = options.musicVolume ?? 10;
    this.soundVolume = options.soundVolume ?? 10;
    this.environment = options.environment ?? defaultSimaiPlaybackEnvironment;
    this.host = options.host;
    this.timeline = createSimaiPlaybackTimeline(this.charts[0]!, 0, this.musicOffset);
    this.applyRange();
  }

  get positionBeats(): number {
    return this.beatsPosition;
  }

  get totalBeats(): number {
    return this.range.totalBeats;
  }

  get totalDurationMs(): number {
    return this.range.totalDurationMs;
  }

  get musicDurationSeconds(): number | null {
    return this.music ? this.music.duration : null;
  }

  get speed(): number {
    return this.playbackSpeed;
  }

  get musicPosition(): MusicPosition {
    return this.getMusicTime();
  }

  /** 拍 → 谱面毫秒：视图绘制与信息栏与会话共用同一时间轴。 */
  beatsToMs(beats: number): number {
    return this.timeline.beatsToMs(beats);
  }

  /** 谱面毫秒 → 拍：拖动定位等视图输入复用同一时间轴。 */
  beatsAtMs(ms: number): number {
    return this.timeline.beatsAtMs(ms);
  }

  /**
   * 载入预览曲并在此之后确定播放范围。
   * 解码失败进入静音看谱；范围仍按谱尾与音乐结尾的较晚者计算。
   */
  async loadMusic(bytes: ArrayBuffer | null): Promise<boolean> {
    this.music = null;
    try {
      const context = await this.ensureAudio(false);
      if (bytes) this.music = await context.decodeAudioData(bytes);
    } catch {
      this.music = null;
    }
    this.applyRange();
    return this.music !== null;
  }

  /** 只移动位置，不改动音源与时钟；播放中跳转应改用 play()。 */
  moveTo(beats: number): void {
    this.beatsPosition = clamp(beats, 0, this.range.totalBeats);
  }

  async play(): Promise<void> {
    if (this.disposed) return;
    const command = ++this.command;
    await this.ensureAudio();
    if (command !== this.command || this.disposed) return;
    this.playing = true;
    this.host.onPlayStateChange?.(true);
    this.lastFrameTimestamp = 0;
    const musicSeconds = this.timeline.musicSecondsAt(this.beatsPosition);
    this.answers?.reset(this.timeline.beatsToMs(this.beatsPosition), true);
    if (this.music && musicSeconds < this.music.duration) {
      await this.startSource(musicSeconds, command);
    } else {
      this.stopSource(true);
      this.lastFrameTimestamp = this.environment.now();
    }
    if (command !== this.command || this.disposed) return;
    this.cancelFrame();
    this.frame = this.environment.requestFrame(this.tick);
  }

  pause(): void {
    this.command += 1;
    this.playing = false;
    this.host.onPlayStateChange?.(false);
    if (this.audioClockRunning) {
      const musicTime = this.getMusicTime();
      this.beatsPosition = this.timeline.beatsAtMusicSeconds(musicTime);
      this.clock.setOffset(musicTime);
      this.stopSource();
    }
    this.answers?.reset(this.timeline.beatsToMs(this.beatsPosition), true);
    this.cancelFrame();
    this.lastFrameTimestamp = 0;
    this.host.render(this.beatsPosition);
  }

  setSpeed(speed: number): void {
    if (this.audioClockRunning) {
      this.beatsPosition = this.timeline.beatsAtMusicSeconds(this.getMusicTime());
    }
    this.playbackSpeed = clamp(speed, SPEED_MIN, SPEED_MAX);
    this.answers?.reset(this.timeline.beatsToMs(this.beatsPosition), true);
    if (!this.audioClockRunning || !this.context) return;
    if (this.getMusicTime() < 0) {
      void this.play();
      return;
    }
    if (this.source) {
      const startTime = audioContextTime(this.context.currentTime);
      this.source.playbackRate.setValueAtTime(this.playbackSpeed, startTime);
      this.clock.appendSegment(startTime, this.playbackSpeed);
      return;
    }
    const heardAt = outputTime(getAudioContextOutputTime(this.context));
    this.clock.set(heardAt, this.clock.positionAt(heardAt), this.playbackSpeed);
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = clamp(volume, 0, 10);
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume / 10;
  }

  setSoundVolume(volume: number): void {
    this.soundVolume = clamp(volume, 0, 10);
    this.answers?.setVolume(this.soundVolume / 10);
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.answers?.dispose();
    this.answers = null;
    for (const node of [this.source, this.musicGain, this.answerGain]) {
      try {
        node?.disconnect();
      } catch {
        /* 已断开 */
      }
    }
    this.source = null;
    this.sourceGain = null;
    this.music = null;
    this.disposed = true;
  }

  private applyRange(): void {
    this.range = resolvePlaybackRange(this.charts, this.musicDurationSeconds, this.musicOffset);
    this.timeline = createSimaiPlaybackTimeline(this.charts[0]!, this.range.totalBeats, this.musicOffset);
    this.beatsPosition = Math.min(this.beatsPosition, this.range.totalBeats);
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
      this.musicGain.gain.value = this.musicVolume / 10;
      this.musicGain.connect(context.destination);
      this.answerGain = context.createGain();
      this.answerGain.connect(context.destination);
      this.answers = new AudioManager({
        audioContext: context,
        outputNode: this.answerGain,
        answerSoundPath: this.answerSoundUrl,
        initialVolume: this.soundVolume / 10,
        initialTimingOffset: ANSWER_SOUND_BASE_OFFSET_MS,
      });
      this.answers.setEnabled(true);
      await this.answers.init();
    }
    if (resume && this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

  private stopSource(immediate = false): void {
    const source = this.source;
    const gain = this.sourceGain;
    this.source = null;
    this.sourceGain = null;
    this.audioClockRunning = false;
    this.clock.clear();
    if (!source) return;
    try {
      if (!immediate && this.context && gain) {
        const now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + SOURCE_FADE_TIME_S);
        source.stop(now + SOURCE_FADE_TIME_S + 0.01);
      } else {
        source.stop();
      }
    } catch {
      /* 已停止 */
    }
    try {
      source.disconnect();
      gain?.disconnect();
    } catch {
      /* 已断开 */
    }
  }

  private getMusicTime(): MusicPosition {
    if (!this.context || !this.audioClockRunning) return this.clock.offset;
    const heardAt = outputTime(getAudioContextOutputTime(this.context));
    this.clock.prune(heardAt);
    return this.clock.positionAt(heardAt);
  }

  private async startSource(positionSec: number, command: number): Promise<void> {
    if (!this.music) return;
    const context = await this.ensureAudio();
    if (!this.musicGain || command !== this.command || this.disposed) return;
    this.stopSource(true);
    const buffer = this.music;
    const clamped = clamp(positionSec, 0, buffer.duration);
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = this.playbackSpeed;
    const introDelay = Math.max(0, -positionSec) / this.playbackSpeed;
    const startTime = context.currentTime + SOURCE_START_LEAD_TIME_S + introDelay;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + SOURCE_FADE_TIME_S);
    source.connect(gain);
    gain.connect(this.musicGain);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        this.sourceGain = null;
        source.disconnect();
        gain.disconnect();
        // 音频自然结束后保留公共时钟，剩余谱面继续沿同一时间轴播放。
      }
    };
    source.start(startTime, clamped);
    this.source = source;
    this.sourceGain = gain;
    this.audioClockRunning = true;
    const audibleAt = outputTime(getAudioContextOutputTime(context) + SOURCE_START_LEAD_TIME_S);
    this.clock.set(audibleAt, musicPosition(Math.min(positionSec, clamped)), this.playbackSpeed);
  }

  private scheduleAnswers(currentMs: number): void {
    if (!this.answers || !this.playing) return;
    this.answers.schedule(
      this.answerEvents,
      currentMs,
      this.clock.schedulingSpeed(this.playbackSpeed),
      SCHEDULE_LOOKAHEAD_MS,
    );
  }

  private readonly tick = (timestamp: number): void => {
    this.frame = null;
    if (this.disposed || !this.playing) return;
    let beats = this.beatsPosition;
    if (this.music && this.audioClockRunning && this.context) {
      beats = this.timeline.beatsAtMusicSeconds(this.getMusicTime());
    } else if (this.lastFrameTimestamp > 0) {
      const deltaMs = timestamp - this.lastFrameTimestamp;
      beats = this.timeline.beatsAtMs(this.timeline.beatsToMs(beats) + deltaMs * this.playbackSpeed);
    }
    this.lastFrameTimestamp = timestamp;

    if (beats >= this.range.totalBeats && !this.source) {
      this.playing = false;
      this.stopSource(true);
      this.answers?.reset(undefined, true);
      this.beatsPosition = this.range.totalBeats;
      this.host.onPlayStateChange?.(false);
      this.host.render(this.beatsPosition);
      return;
    }

    this.beatsPosition = Math.min(beats, this.range.totalBeats);
    const loopTarget = this.host.loopTarget?.(this.beatsPosition) ?? null;
    if (loopTarget !== null) {
      this.beatsPosition = clamp(loopTarget, 0, this.range.totalBeats);
      this.host.render(this.beatsPosition);
      void this.play();
      return;
    }
    this.host.render(this.beatsPosition);
    this.scheduleAnswers(this.timeline.beatsToMs(this.beatsPosition));
    this.frame = this.environment.requestFrame(this.tick);
  };
}
