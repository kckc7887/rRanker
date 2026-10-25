import { PlaybackLoop } from '../../chart-preview-shared/webview-player/playback-loop';
import { AudioManager, type PreparedAudioEvent } from '../engine/core/audio/AudioManager';
import { ANSWER_SOUND_BASE_OFFSET_MS } from '../engine/utils/constants';
import type { Chart } from '../engine/types';
import {
  musicPosition,
  type MusicPosition,
} from '../../chart-preview-shared/webview-player/playbackClock';
import { MusicPlayback } from '../../chart-preview-shared/webview-player/music';
import {
  SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS,
  createSimaiPlaybackTimeline,
  resolvePlaybackRange,
  type SimaiPlaybackTimeline,
} from './timeConversion';

const SCHEDULE_LOOKAHEAD_MS = 1500;
const SPEED_MIN = 0.1;
const SPEED_MAX = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export interface SimaiPlaybackHost {
  render(beats: number): void;
  onPlayStateChange?(playing: boolean): void;
  onPlaybackError?(): void;
}

export interface SimaiPlaybackOptions {
  /** 第一份谱面提供播放时间轴。 */
  charts: readonly Chart[];
  answerEvents: readonly PreparedAudioEvent[];
  answerSoundUrl: string;
  speed?: number;
  /** 音量范围 0～10。 */
  musicVolume?: number;
  /** 音量范围 0～10。 */
  soundVolume?: number;
  musicOffset?: number;
  host: SimaiPlaybackHost;
}

export class SimaiPlaybackSession {
  readonly loop = new PlaybackLoop();
  private readonly charts: readonly Chart[];
  private readonly answerEvents: readonly PreparedAudioEvent[];
  private readonly answerSoundUrl: string;
  private readonly musicOffset: number;
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
  private music: MusicPlayback | null = null;
  private hasMusic = false;
  private command = 0;
  private frame: number | null = null;
  playing = false;
  disposed = false;
  private resourceGeneration = 0;

  constructor(options: SimaiPlaybackOptions) {
    this.charts = options.charts;
    this.answerEvents = options.answerEvents;
    this.answerSoundUrl = options.answerSoundUrl;
    this.musicOffset = options.musicOffset ?? SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS;
    this.playbackSpeed = options.speed ?? 1;
    this.musicVolume = options.musicVolume ?? 10;
    this.soundVolume = options.soundVolume ?? 10;
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
    return this.hasMusic ? this.music!.duration : null;
  }

  get speed(): number {
    return this.playbackSpeed;
  }

  get musicPosition(): MusicPosition {
    return this.getMusicTime();
  }

  beatsToMs(beats: number): number {
    return this.timeline.beatsToMs(beats);
  }

  beatsAtMs(ms: number): number {
    return this.timeline.beatsAtMs(ms);
  }

  async loadMusic(bytes: ArrayBuffer | null): Promise<boolean> {
    if (this.disposed) return false;
    const generation = ++this.resourceGeneration;
    this.hasMusic = false;
    try {
      await this.ensureAudio(false);
      if (this.disposed || generation !== this.resourceGeneration) return false;
      const loaded = await this.music!.load(bytes);
      if (this.disposed || generation !== this.resourceGeneration) return false;
      this.hasMusic = loaded;
    } catch {
      if (this.disposed || generation !== this.resourceGeneration) return false;
      this.hasMusic = false;
    }
    this.applyRange();
    return this.hasMusic;
  }

  moveTo(beats: number): void {
    if (!this.playing) {
      this.command += 1;
      this.music?.pause();
    }
    this.beatsPosition = clamp(beats, 0, this.range.totalBeats);
  }

  async play(): Promise<void> {
    if (this.disposed) return;
    const command = ++this.command;
    this.playing = false;
    this.music?.pause();
    this.cancelFrame();
    this.beatsPosition = this.loop.target(this.beatsPosition) ?? this.beatsPosition;
    try {
      await this.ensureAudio();
      if (command !== this.command || this.disposed) return;
      await this.music!.playFrom(this.timeline.musicSecondsAt(this.beatsPosition), this.playbackSpeed);
    } catch {
      if (command === this.command && !this.disposed) {
        this.host.onPlayStateChange?.(false);
        this.host.onPlaybackError?.();
      }
      return;
    }
    if (command !== this.command || this.disposed) return;
    if (!this.music!.playing) {
      this.host.onPlayStateChange?.(false);
      this.host.onPlaybackError?.();
      return;
    }
    this.playing = true;
    this.host.onPlayStateChange?.(true);
    this.answers?.reset(this.timeline.beatsToMs(this.beatsPosition), true);
    this.frame = requestAnimationFrame(this.tick);
  }

  pause(): void {
    if (this.disposed) return;
    if (this.playing && this.music) this.beatsPosition = this.timeline.beatsAtMusicSeconds(this.music.currentTime);
    this.command += 1;
    this.playing = false;
    this.host.onPlayStateChange?.(false);
    this.music?.pause();
    this.answers?.reset(this.timeline.beatsToMs(this.beatsPosition), true);
    this.cancelFrame();
    this.host.render(this.beatsPosition);
  }

  setSpeed(speed: number): void {
    if (this.playing) {
      this.beatsPosition = this.timeline.beatsAtMusicSeconds(this.getMusicTime());
    }
    this.playbackSpeed = clamp(speed, SPEED_MIN, SPEED_MAX);
    this.answers?.reset(this.timeline.beatsToMs(this.beatsPosition), true);
    this.music?.setSpeed(this.playbackSpeed);
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
    this.resourceGeneration += 1;
    this.music?.dispose();
    this.answers?.dispose();
    this.answers = null;
    for (const node of [this.musicGain, this.answerGain]) {
      try {
        node?.disconnect();
      } catch {
      }
    }
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
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private async ensureAudio(resume = true): Promise<AudioContext> {
    if (!this.context) {
      const context = new AudioContext();
      this.context = context;
      this.musicGain = context.createGain();
      this.musicGain.gain.value = this.musicVolume / 10;
      this.musicGain.connect(context.destination);
      const music = new MusicPlayback(context, this.musicGain);
      this.music = music;
      music.onStateChange = () => {
        this.answers?.reset(this.timeline.beatsToMs(this.timeline.beatsAtMusicSeconds(music.currentTime)), true);
        if (this.playing && !music.playing && !music.waiting) {
          this.pause();
          this.host.onPlaybackError?.();
        }
      };
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

  private getMusicTime(): MusicPosition {
    return musicPosition(this.playing && this.music ? this.music.currentTime : this.timeline.musicSecondsAt(this.beatsPosition));
  }

  private scheduleAnswers(currentMs: number): void {
    if (!this.answers || !this.playing || this.music?.waiting) return;
    this.answers.schedule(
      this.answerEvents,
      currentMs,
      this.playbackSpeed,
      SCHEDULE_LOOKAHEAD_MS,
      this.context!.currentTime,
    );
  }

  private readonly tick = (): void => {
    this.frame = null;
    if (this.disposed || !this.playing) return;
    const beats = this.timeline.beatsAtMusicSeconds(this.getMusicTime());

    const loopTarget = this.loop.target(beats);
    if (loopTarget !== null) {
      this.beatsPosition = clamp(loopTarget, 0, this.range.totalBeats);
      this.host.render(this.beatsPosition);
      void this.play();
      return;
    }

    if (beats >= this.range.totalBeats) {
      this.playing = false;
      this.music?.pause();
      this.answers?.reset(undefined, true);
      this.beatsPosition = this.range.totalBeats;
      this.host.onPlayStateChange?.(false);
      this.host.render(this.beatsPosition);
      return;
    }

    this.beatsPosition = Math.min(beats, this.range.totalBeats);
    this.host.render(this.beatsPosition);
    this.scheduleAnswers(this.timeline.beatsToMs(this.beatsPosition));
    this.frame = requestAnimationFrame(this.tick);
  };
}
