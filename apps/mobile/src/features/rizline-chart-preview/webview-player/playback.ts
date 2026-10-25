import { PlaybackLoop } from '../../chart-preview-shared/webview-player/playback-loop';
import { MusicPlayback } from '../../chart-preview-shared/webview-player/music';
import { hitEvents, type PreparedChart } from './chart-prepare';
import { RizlineRenderer } from './renderer';
import { HitSoundScheduler, createHitBuffer } from './hitsounds';
import { normalizeRizlineChartPreviewSettings, type RizlineChartPreviewSettings } from '../configuration';

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  return audioContext ??= new AudioContext();
}

export class PreviewSession {
  readonly loop = new PlaybackLoop();
  playing = false;
  ended = false;
  disposed = false;
  duration: number;
  private frame: number | null = null;
  private command = 0;
  private readonly music: MusicPlayback;
  private readonly musicGain: GainNode;
  private readonly hitGain: GainNode;
  private readonly hits: HitSoundScheduler;
  settings: RizlineChartPreviewSettings;

  constructor(
    readonly chart: PreparedChart,
    readonly renderer: RizlineRenderer,
    settings: RizlineChartPreviewSettings,
  ) {
    const context = getAudioContext();
    this.musicGain = context.createGain();
    this.hitGain = context.createGain();
    this.musicGain.connect(context.destination);
    this.hitGain.connect(context.destination);
    this.music = new MusicPlayback(context, this.musicGain);
    this.settings = normalizeRizlineChartPreviewSettings(settings);
    this.musicGain.gain.value = this.settings.volume;
    this.hitGain.gain.value = this.settings.hitSound ? this.settings.hitSoundVolume : 0;
    this.duration = Math.max(0, chart.durationSeconds + chart.delaySeconds + 0.25);
    this.hits = new HitSoundScheduler(
      context,
      createHitBuffer(context, 1760),
      createHitBuffer(context, 1180),
      hitEvents(chart),
      this.hitGain,
    );
    this.music.onStateChange = () => {
      if (!this.music.playing && this.playing) {
        this.playing = false;
        if (this.frame != null) cancelAnimationFrame(this.frame);
        this.frame = null;
        this.draw();
      }
      if (this.music.waiting || !this.music.playing) this.hits.stop();
      else this.hits.reset(this.chartTime);
    };
    this.renderer.setUserSpeed(this.settings.userSpeed);
    this.draw();
  }

  async loadMusic(bytes: ArrayBuffer): Promise<void> {
    if (!await this.music.load(bytes, 'audio/mp4')) {
      if (!this.disposed) throw new Error('music-load-failed');
      return;
    }
    this.duration = Math.max(this.duration, this.music.duration);
  }

  get currentTime(): number {
    return Math.max(0, Math.min(this.duration, this.music.currentTime));
  }

  get chartTime(): number {
    return this.currentTime - this.chart.delaySeconds;
  }

  setSettings(partial: Partial<RizlineChartPreviewSettings>): void {
    const previousSpeed = this.settings.playbackSpeed;
    this.settings = normalizeRizlineChartPreviewSettings({ ...this.settings, ...partial });
    this.musicGain.gain.value = this.settings.volume;
    this.hitGain.gain.value = this.settings.hitSound ? this.settings.hitSoundVolume : 0;
    this.renderer.setUserSpeed(this.settings.userSpeed);
    if (!this.settings.hitSound) this.hits.stop();
    if (this.settings.playbackSpeed !== previousSpeed) {
      this.music.setSpeed(this.settings.playbackSpeed);
      this.hits.reset(this.chartTime);
    }
    if (!this.playing) this.draw();
  }

  draw(): void {
    if (this.disposed) return;
    this.renderer.render(this.chart, this.chartTime);
  }

  private tick = (): void => {
    this.frame = null;
    if (this.disposed || !this.playing) return;
    const loopTarget = this.loop.target(this.currentTime);
    if (loopTarget !== null) {
      void this.playFrom(loopTarget);
      return;
    }
    if (this.currentTime >= this.duration) {
      this.pause();
      this.ended = true;
      this.draw();
      return;
    }
    const context = getAudioContext();
    this.hits.schedule(
      this.chartTime,
      context.currentTime,
      this.settings.hitSound && !this.music.waiting,
      this.settings.playbackSpeed,
    );
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  };

  async playFrom(seconds: number): Promise<void> {
    if (this.disposed) return;
    this.pause();
    const generation = ++this.command;
    let position = Math.max(0, Math.min(seconds, this.duration));
    position = this.loop.target(position) ?? position;
    if (position >= this.duration) position = 0;
    await this.music.playFrom(position, this.settings.playbackSpeed);
    if (this.disposed || generation !== this.command || !this.music.playing) return;
    this.hits.reset(this.chartTime);
    this.playing = true;
    this.ended = false;
    this.draw();
    this.frame = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.command += 1;
    if (!this.playing) {
      this.music.pause();
      this.hits.stop();
      if (this.frame != null) cancelAnimationFrame(this.frame);
      this.frame = null;
      return;
    }
    this.playing = false;
    this.music.pause();
    this.hits.stop();
    if (this.frame != null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.draw();
  }

  async seek(seconds: number): Promise<void> {
    if (this.disposed) return;
    if (this.playing) return this.playFrom(seconds);
    this.pause();
    const position = Math.max(0, Math.min(seconds, this.duration));
    this.ended = position >= this.duration;
    await this.music.seek(position);
    if (this.disposed) return;
    this.hits.reset(this.chartTime);
    this.draw();
  }

  dispose(): void {
    this.disposed = true;
    this.pause();
    this.music.dispose();
    this.musicGain.disconnect();
    this.hitGain.disconnect();
  }
}
