import { PreviewPlayback } from '../../chart-preview-shared/webview-player/playback';
import { musicPosition, type MusicPosition } from '../../chart-preview-shared/webview-player/playbackClock';
import { AudioManager, type PreparedAudioEvent } from '../engine/core/audio/AudioManager';
import { ANSWER_SOUND_BASE_OFFSET_MS } from '../engine/utils/constants';
import type { Chart } from '../engine/types';
import { SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS, createSimaiPlaybackTimeline, resolvePlaybackRange, type SimaiPlaybackTimeline } from './timeConversion';

export interface SimaiPlaybackHost {
  render(beats: number, seek?: boolean): void;
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
  readonly playback: PreviewPlayback;
  private readonly musicOffset: number;
  private range = { totalDurationMs: 0, totalBeats: 0 };
  private timeline: SimaiPlaybackTimeline;
  private musicVolume: number;
  private soundVolume: number;
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private answerGain: GainNode | null = null;
  private answers: AudioManager | null = null;
  private music: AudioBuffer | null = null;
  private resourceGeneration = 0;

  constructor(private readonly options: SimaiPlaybackOptions) {
    this.musicOffset = options.musicOffset ?? SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS;
    this.musicVolume = options.musicVolume ?? 10;
    this.soundVolume = options.soundVolume ?? 10;
    this.timeline = createSimaiPlaybackTimeline(options.charts[0]!, 0, this.musicOffset);
    this.playback = new PreviewPlayback({
      duration: () => this.totalDurationMs / 1000,
      prepare: () => this.ensureAudio().then(() => undefined),
      context: () => this.context!, music: () => this.music, output: () => this.musicGain!,
      musicOffset: () => this.timeline.musicSecondsAt(0),
      lead: .05, silentFrameClock: true,
      resetSounds: (seconds) => this.answers?.reset(seconds * 1000, true),
      rewindSounds: (seconds, when) => this.answers?.rewind(seconds * 1000, when),
      schedule: (seconds, now, speed, end) => this.answers?.schedule(options.answerEvents, seconds * 1000, speed,
        1500, now, end * 1000),
      onState: options.host.onPlayStateChange,
      onError: () => options.host.onPlaybackError?.(),
    });
    this.playback.onFrame = (seconds, seek) => options.host.render(this.beatsAtMs(seconds * 1000), seek);
    this.playback.setSpeed(options.speed ?? 1);
    this.applyRange();
  }

  get loop() { return this.playback.loop; }
  get playing() { return this.playback.playing; }
  get disposed() { return this.playback.disposed; }
  get positionBeats() { return this.beatsAtMs(this.playback.currentTime * 1000); }
  get totalBeats() { return this.range.totalBeats; }
  get totalDurationMs() { return this.range.totalDurationMs; }
  get musicDurationSeconds() { return this.music?.duration ?? null; }
  get speed() { return this.playback.speed; }
  get musicPosition(): MusicPosition { return musicPosition(this.playback.currentTime + this.timeline.musicSecondsAt(0)); }
  beatsToMs(beats: number) { return this.timeline.beatsToMs(beats); }
  beatsAtMs(ms: number) { return this.timeline.beatsAtMs(ms); }

  moveTo(beats: number): void {
    this.playback.moveTo(this.beatsToMs(Math.max(0, Math.min(this.totalBeats, beats))) / 1000);
  }

  play(): Promise<void> { return this.playback.playFrom(this.playback.currentTime); }
  pause(): void { this.playback.pause(); }
  setSpeed(speed: number): void { this.playback.setSpeed(Math.max(.1, Math.min(5, speed))); }

  async loadMusic(bytes: ArrayBuffer | null): Promise<boolean> {
    if (this.disposed) return false;
    const generation = ++this.resourceGeneration;
    this.music = null;
    try {
      const context = await this.ensureAudio(false);
      if (this.disposed || generation !== this.resourceGeneration) return false;
      const music = bytes ? await context.decodeAudioData(bytes) : null;
      if (this.disposed || generation !== this.resourceGeneration) return false;
      this.music = music;
    } catch {
      if (this.disposed || generation !== this.resourceGeneration) return false;
      this.music = null;
    }
    this.applyRange();
    return this.music !== null;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(10, volume));
    if (this.musicGain) this.musicGain.gain.value = this.musicVolume / 10;
  }

  setSoundVolume(volume: number): void {
    this.soundVolume = Math.max(0, Math.min(10, volume));
    this.answers?.setVolume(this.soundVolume / 10);
  }

  dispose(): void {
    if (this.disposed) return;
    this.playback.dispose();
    this.resourceGeneration += 1;
    this.answers?.dispose();
    this.answers = null;
    for (const node of [this.musicGain, this.answerGain]) {
      try {
        node?.disconnect();
      } catch {
      }
    }
    this.music = null;
  }

  private applyRange(): void {
    this.range = resolvePlaybackRange(this.options.charts, this.musicDurationSeconds, this.musicOffset);
    this.timeline = createSimaiPlaybackTimeline(this.options.charts[0]!, this.range.totalBeats, this.musicOffset);
    this.playback.moveTo(this.playback.currentTime);
  }

  private async ensureAudio(resume = true): Promise<AudioContext> {
    if (!this.context) {
      const context = new AudioContext({ latencyHint: 'playback' });
      this.context = context;
      this.musicGain = context.createGain();
      this.musicGain.gain.value = this.musicVolume / 10;
      this.musicGain.connect(context.destination);
      this.answerGain = context.createGain();
      this.answerGain.connect(context.destination);
      this.answers = new AudioManager({
        audioContext: context,
        outputNode: this.answerGain,
        answerSoundPath: this.options.answerSoundUrl,
        initialVolume: this.soundVolume / 10,
        initialTimingOffset: ANSWER_SOUND_BASE_OFFSET_MS,
      });
      this.answers.setEnabled(true);
      await this.answers.init();
    }
    if (resume && this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }

}
