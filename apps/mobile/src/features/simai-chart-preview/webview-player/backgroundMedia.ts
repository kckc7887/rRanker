import type { StageContext, StageImages, StageVideo } from '../../chart-preview-shared/webview-player/stage';
import type { BpmEvent } from '../engine/types';
import { resolveBackgroundVideoFrame } from './timeConversion';
import type { ChartPreviewBackgroundMode } from './interactionScheduler';

export interface SimaiBackgroundMediaHost {
  render(): void;
  reportVideo(result: 'success' | 'error', video?: HTMLVideoElement): void;
  loadVideo(): Promise<string | null>;
  readStatus(): string;
  writeStatus(message: string): void;
  setImage(image: HTMLImageElement | null): void;
  setVideo(video: HTMLVideoElement | null): void;
}

export interface SimaiBackgroundMediaOptions {
  stage: StageContext;
  video: HTMLVideoElement;
  mode: ChartPreviewBackgroundMode;
  imageUrl?: string;
  host: SimaiBackgroundMediaHost;
}

export interface SimaiBackgroundFrameInput {
  currentBeats: number;
  totalBeats: number;
  playing: boolean;
  speed: number;
  bpmEvents: readonly BpmEvent[] | null;
  bpm: number;
  musicOffset: number;
  firstMs?: number;
  seek?: boolean;
}

export class SimaiBackgroundMedia {
  private readonly video: StageVideo;
  private readonly images: StageImages;
  private readonly host: SimaiBackgroundMediaHost;
  private mode: ChartPreviewBackgroundMode;
  private videoAttached = false;
  private statusMessage = '';
  private disposed = false;

  constructor(options: SimaiBackgroundMediaOptions) {
    this.mode = options.mode;
    this.host = options.host;
    this.images = options.stage.createImages(() => options.imageUrl);
    this.video = options.stage.createVideo({
      element: options.video,
      onStatus: status => {
        if (this.disposed || this.mode !== 'video') return;
        if (status === 'loading') this.setStatus('正在加载视频背景…');
        else if (status === 'ready') {
          this.host.reportVideo('success', this.video.element);
          this.clearStatus();
        } else if (status === 'error') {
          this.host.reportVideo('error', this.video.element);
          this.attachVideo(false);
          this.videoFallbackStatus();
        }
      },
    });
  }

  get backgroundMode(): ChartPreviewBackgroundMode { return this.mode; }

  setMode(mode: ChartPreviewBackgroundMode): void {
    if (this.disposed) return;
    this.mode = mode;
    this.clearStatus();
    if (mode !== 'video') this.releaseVideo();
    if (mode === 'none') this.host.setImage(null);
    else {
      this.host.setImage(this.images.get('background') ?? null);
      void this.images.load('background').then(image => {
        if (this.disposed || this.mode === 'none') return;
        this.host.setImage(image ?? null);
        if (this.mode === 'image') {
          if (image) this.clearStatus();
          else this.setStatus('图片背景暂时不可用。');
        } else if (this.video.status === 'error') this.videoFallbackStatus();
        this.host.render();
      });
      if (mode === 'video' && (this.video.status === 'empty' || this.video.status === 'error')) {
        void this.video.setSource(() => this.host.loadVideo());
      }
    }
    this.host.render();
  }

  syncFrame(input: SimaiBackgroundFrameInput): void {
    if (this.disposed || this.mode !== 'video') return;
    const frame = resolveBackgroundVideoFrame({
      currentBeats: input.currentBeats, totalBeats: input.totalBeats, isPlaying: input.playing,
      durationSeconds: this.video.duration || Infinity, bpmEvents: input.bpmEvents, bpm: input.bpm,
      musicOffset: input.musicOffset, firstMs: input.firstMs,
    });
    this.attachVideo(this.video.sync({
      time: frame.targetSeconds, active: frame.active, playing: input.playing, rate: input.speed, seek: input.seek,
    }));
  }

  releaseVideo(): void {
    void this.video.setSource(null);
    this.attachVideo(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.attachVideo(false);
    this.video.dispose();
    this.images.dispose();
  }

  private attachVideo(attached: boolean): void {
    if (this.videoAttached === attached) return;
    this.videoAttached = attached;
    this.host.setVideo(attached ? this.video.element : null);
  }

  private videoFallbackStatus(): void {
    this.setStatus(this.images.get('background') ? '视频背景不可用，已显示图片背景。' : '背景暂时不可用。');
  }

  private setStatus(message: string): void {
    const current = this.host.readStatus();
    if (!current || current === this.statusMessage) this.host.writeStatus(message);
    this.statusMessage = message;
  }

  private clearStatus(): void {
    if (this.host.readStatus() === this.statusMessage) this.host.writeStatus('');
    this.statusMessage = '';
  }
}
