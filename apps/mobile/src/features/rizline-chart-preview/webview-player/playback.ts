import { PlaybackClock, audioContextTime, musicPosition, outputTime } from '../../chart-preview-shared/webview-player/playbackClock';
import { getAudioContextOutputTime } from '../../chart-preview-shared/webview-player/audioClock';
import { hitEvents, type PreparedChart } from './chart-prepare';
import { RizlineRenderer } from './renderer';
import { HitSoundScheduler, createHitBuffer } from './hitsounds';
import { normalizeRizlineChartPreviewSettings, type RizlineChartPreviewSettings } from '../configuration';

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  return audioContext ??= new AudioContext();
}

/** 外部环境边界：默认走全局 Web Audio 与帧循环，可注入以便验证会话。 */
export interface PreviewSessionEnvironment {
  getAudioContext(): AudioContext;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(handle: number): void;
}

export const defaultPreviewSessionEnvironment: PreviewSessionEnvironment = {
  getAudioContext,
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
};

export class PreviewSession {
  readonly clock = new PlaybackClock();
  playing = false;
  ended = false;
  disposed = false;
  duration: number;
  private position = 0;
  private frame: number | null = null;
  private command = 0;
  private source: AudioBufferSourceNode | null = null;
  private readonly musicGain: GainNode;
  private readonly hitGain: GainNode;
  private readonly hits: HitSoundScheduler;
  private readonly environment: PreviewSessionEnvironment;
  settings: RizlineChartPreviewSettings;

  constructor(
    readonly chart: PreparedChart,
    readonly renderer: RizlineRenderer,
    readonly music: AudioBuffer,
    settings: RizlineChartPreviewSettings,
    environment: PreviewSessionEnvironment = defaultPreviewSessionEnvironment,
  ) {
    this.environment = environment;
    const context = this.environment.getAudioContext();
    this.musicGain = context.createGain();
    this.hitGain = context.createGain();
    this.musicGain.connect(context.destination);
    this.hitGain.connect(context.destination);
    this.settings = normalizeRizlineChartPreviewSettings(settings);
    this.musicGain.gain.value = this.settings.volume;
    this.hitGain.gain.value = this.settings.hitSound ? this.settings.hitSoundVolume : 0;
    this.duration = Math.max(music.duration, chart.durationSeconds + 0.25);
    this.hits = new HitSoundScheduler(
      context,
      createHitBuffer(context, 1760),
      createHitBuffer(context, 1180),
      hitEvents(chart),
      this.hitGain,
    );
    this.renderer.setUserSpeed(this.settings.userSpeed);
    this.clock.setOffset(musicPosition(0));
    this.draw();
  }

  get currentTime(): number {
    if (!this.playing) return this.position;
    const context = this.environment.getAudioContext();
    return Math.max(0, Math.min(this.duration, this.clock.positionAt(outputTime(getAudioContextOutputTime(context)))));
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
    if (this.playing && this.source && this.settings.playbackSpeed !== previousSpeed) {
      const context = this.environment.getAudioContext();
      this.source.playbackRate.value = this.settings.playbackSpeed;
      this.clock.appendSegment(audioContextTime(context.currentTime), this.settings.playbackSpeed);
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
    if (this.currentTime >= this.duration) {
      this.pause();
      this.position = this.duration;
      this.ended = true;
      this.clock.setOffset(musicPosition(this.duration));
      this.draw();
      return;
    }
    const context = this.environment.getAudioContext();
    this.hits.schedule(
      this.chartTime,
      getAudioContextOutputTime(context),
      this.settings.hitSound,
      this.settings.playbackSpeed,
    );
    this.draw();
    this.frame = this.environment.requestFrame(this.tick);
  };

  private stopSource(): void {
    if (!this.source) return;
    try { this.source.stop(); } catch { /* already stopped */ }
    this.source.disconnect();
    this.source = null;
  }

  async playFrom(seconds: number): Promise<void> {
    if (this.disposed) return;
    this.pause();
    if (this.disposed) return;
    const generation = ++this.command;
    this.position = Math.max(0, Math.min(seconds, this.duration));
    if (this.position >= this.duration) this.position = 0;
    const context = this.environment.getAudioContext();
    if (context.state !== 'running') await context.resume();
    if (this.disposed || generation !== this.command) return;
    this.stopSource();
    const startOffset = Math.min(this.position, Math.max(0, this.music.duration - 0.001));
    if (this.position < this.music.duration) {
      const source = context.createBufferSource();
      source.buffer = this.music;
      source.playbackRate.value = this.settings.playbackSpeed;
      source.connect(this.musicGain);
      source.start(0, startOffset);
      this.source = source;
    }
    this.clock.set(audioContextTime(context.currentTime), musicPosition(this.position), this.settings.playbackSpeed);
    this.hits.reset(this.position - this.chart.delaySeconds);
    this.playing = true;
    this.ended = false;
    this.draw();
    this.frame = this.environment.requestFrame(this.tick);
  }

  pause(): void {
    this.command += 1;
    if (!this.playing) {
      this.stopSource();
      this.hits.stop();
      if (this.frame != null) this.environment.cancelFrame(this.frame);
      this.frame = null;
      return;
    }
    this.position = this.currentTime;
    this.playing = false;
    this.clock.setOffset(musicPosition(this.position));
    this.stopSource();
    this.hits.stop();
    if (this.frame != null) this.environment.cancelFrame(this.frame);
    this.frame = null;
    this.draw();
  }

  async seek(seconds: number): Promise<void> {
    if (this.disposed) return;
    const wasPlaying = this.playing;
    const generation = ++this.command;
    if (wasPlaying) {
      await this.playFrom(seconds);
      if (this.disposed || generation !== this.command) return;
      return;
    }
    if (this.disposed || generation !== this.command) return;
    this.position = Math.max(0, Math.min(seconds, this.duration));
    this.ended = this.position >= this.duration;
    this.clock.setOffset(musicPosition(this.position));
    this.hits.reset(this.position - this.chart.delaySeconds);
    this.draw();
  }

  dispose(): void {
    this.disposed = true;
    this.pause();
    this.musicGain.disconnect();
    this.hitGain.disconnect();
  }
}

export async function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const context = getAudioContext();
  if (context.state !== 'running') await context.resume();
  return context.decodeAudioData(bytes.slice(0));
}
