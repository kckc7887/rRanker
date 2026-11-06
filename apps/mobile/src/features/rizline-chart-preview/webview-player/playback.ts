import { PreviewPlayback } from '../../chart-preview-shared/webview-player/playback';
import { hitEvents, type PreparedChart } from './chart-prepare';
import { RizlineRenderer } from './renderer';
import { HitSoundScheduler, createHitBuffer } from './hitsounds';
import { normalizeRizlineChartPreviewSettings, type RizlineChartPreviewSettings } from '../configuration';

let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  return audioContext ??= new AudioContext({ latencyHint: 'playback' });
}

export class PreviewSession {
  readonly playback: PreviewPlayback;
  readonly duration: number;
  private readonly musicGain: GainNode;
  private readonly hitGain: GainNode;
  private readonly hits: HitSoundScheduler;
  settings: RizlineChartPreviewSettings;

  constructor(readonly chart: PreparedChart, readonly renderer: RizlineRenderer, music: AudioBuffer,
    settings: RizlineChartPreviewSettings, onFrame?: () => void) {
    const context = getAudioContext();
    this.musicGain = context.createGain();
    this.hitGain = context.createGain();
    this.musicGain.connect(context.destination);
    this.hitGain.connect(context.destination);
    this.settings = settings;
    this.duration = Math.max(music.duration, chart.durationSeconds + chart.delaySeconds + .25);
    this.hits = new HitSoundScheduler(context, createHitBuffer(context, 1760), createHitBuffer(context, 1180),
      hitEvents(chart), this.hitGain);
    this.playback = new PreviewPlayback({
      duration: () => this.duration,
      prepare: () => { if (context.state !== 'running') return context.resume(); },
      context: () => context, music: () => music, output: () => this.musicGain, musicOffset: () => 0,
      resetSounds: (seconds, reason) => {
        if (reason === 'stop') this.hits.stop();
        else this.hits.reset(seconds - chart.delaySeconds, reason === 'start');
      },
      rewindSounds: (seconds, when) => this.hits.rewind(seconds - chart.delaySeconds, when),
      schedule: (seconds, now, rate, end) => this.hits.schedule(seconds - chart.delaySeconds, now,
        this.settings.hitSound, rate, end - chart.delaySeconds),
    });
    this.playback.onFrame = seconds => {
      this.renderer.render(chart, seconds - chart.delaySeconds);
      onFrame?.();
    };
    this.setSettings(settings);
  }

  get loop() { return this.playback.loop; }
  get playing() { return this.playback.playing; }
  get ended() { return this.playback.ended; }
  get disposed() { return this.playback.disposed; }
  get currentTime() { return this.playback.currentTime; }
  get chartTime() { return this.currentTime - this.chart.delaySeconds; }

  setSettings(partial: Partial<RizlineChartPreviewSettings>): void {
    this.settings = normalizeRizlineChartPreviewSettings({ ...this.settings, ...partial });
    this.musicGain.gain.value = this.settings.volume;
    this.hitGain.gain.value = this.settings.hitSound ? this.settings.hitSoundVolume : 0;
    this.renderer.setUserSpeed(this.settings.userSpeed);
    if (!this.settings.hitSound) this.hits.stop();
    this.playback.setSpeed(this.settings.playbackSpeed);
    if (!this.playing) this.draw();
  }

  draw(): void { if (!this.disposed) this.renderer.render(this.chart, this.chartTime); }
  playFrom(seconds: number): Promise<void> { return this.playback.playFrom(seconds); }
  seek(seconds: number): Promise<void> { return this.playback.seek(seconds); }
  pause(): void { this.playback.pause(); }

  dispose(): void {
    if (this.disposed) return;
    this.playback.dispose();
    this.musicGain.disconnect();
    this.hitGain.disconnect();
  }
}

export async function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer> {
  return getAudioContext().decodeAudioData(bytes.slice(0));
}
