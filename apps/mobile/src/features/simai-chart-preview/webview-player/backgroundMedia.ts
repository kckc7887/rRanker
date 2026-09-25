/**
 * 舞萌谱面确认背景媒体。
 * 独占图片与视频元素、就绪状态与视频回绕同步；播放状态只作为每帧输入读入，
 * 渲染器与桥回执通过宿主回调接线。
 */

import type { BpmEvent } from '../engine/types';
import { resolveBackgroundVideoFrame } from './timeConversion';
import type { ChartPreviewBackgroundMode } from './interactionScheduler';

const VIDEO_DRIFT_RESET_SECONDS = 0.3;
const VIDEO_DRIFT_TOLERANCE_SECONDS = 0.02;
const VIDEO_SEEK_TOLERANCE_SECONDS = 0.04;
const VIDEO_RATE_ADJUSTMENT = 0.1;

export interface SimaiBackgroundMediaHost {
  /** 背景就绪状态变化后重绘。 */
  render(): void;
  /** 视频背景加载结果回报播放器桥。 */
  reportVideo(result: 'success' | 'error', video?: HTMLVideoElement): void;
  readStatus(): string;
  writeStatus(message: string): void;
  /** 把背景交给各侧渲染器。 */
  setImage(image: HTMLImageElement | null): void;
  setVideo(video: HTMLVideoElement | null): void;
}

export interface SimaiBackgroundMediaOptions {
  image: HTMLImageElement;
  video: HTMLVideoElement;
  mode: ChartPreviewBackgroundMode;
  imageUrl?: string;
  videoUrl?: string;
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
}

export class SimaiBackgroundMedia {
  private readonly image: HTMLImageElement;
  private readonly video: HTMLVideoElement;
  private readonly imageUrl: string | undefined;
  private readonly videoUrl: string | undefined;
  private readonly host: SimaiBackgroundMediaHost;
  private mode: ChartPreviewBackgroundMode;
  private imageReady = false;
  private imageFailed = false;
  private imageLoading = false;
  private videoReady = false;
  private videoFailed = false;
  private videoLoading = false;
  private videoPlayPending = false;
  private videoAttached = false;
  private statusMessage = '';

  constructor(options: SimaiBackgroundMediaOptions) {
    this.image = options.image;
    this.video = options.video;
    this.imageUrl = options.imageUrl;
    this.videoUrl = options.videoUrl;
    this.mode = options.mode;
    this.host = options.host;
    this.image.addEventListener('load', this.onImageLoad);
    this.image.addEventListener('error', this.onImageError);
    this.video.addEventListener('loadeddata', this.onVideoLoaded);
    this.video.addEventListener('seeked', this.onVideoSeeked);
    this.video.addEventListener('error', this.onVideoError);
  }

  get backgroundMode(): ChartPreviewBackgroundMode {
    return this.mode;
  }

  setMode(mode: ChartPreviewBackgroundMode): void {
    this.mode = mode;
    this.clearStatus();
    if (mode === 'none') {
      this.releaseVideo();
      this.host.setImage(null);
    } else if (mode === 'image') {
      this.releaseVideo();
      this.host.setImage(this.imageReady ? this.image : null);
      this.ensureImage();
    } else {
      this.host.setImage(this.imageReady ? this.image : null);
      this.ensureImage();
      this.ensureVideo();
    }
    this.host.render();
  }

  /** 每帧把视频背景对齐到当前拍位置；图片背景无需逐帧处理。 */
  syncFrame(input: SimaiBackgroundFrameInput): void {
    if (this.mode !== 'video' || !this.videoReady || this.videoFailed) return;
    const frame = resolveBackgroundVideoFrame({
      currentBeats: input.currentBeats,
      totalBeats: input.totalBeats,
      isPlaying: input.playing,
      durationSeconds: this.video.duration,
      bpmEvents: input.bpmEvents,
      bpm: input.bpm,
      musicOffset: input.musicOffset,
      firstMs: input.firstMs,
    });
    if (!frame.active) {
      if (!this.video.paused) this.video.pause();
      if (frame.targetSeconds <= 0 && this.video.currentTime > 0) this.video.currentTime = 0;
      this.attachVideo(false);
      return;
    }

    this.attachVideo(true);
    if (input.playing) {
      this.syncPlayingVideo(input.speed, frame.targetSeconds);
      return;
    }
    if (!this.video.paused) this.video.pause();
    if (Math.abs(this.video.currentTime - frame.targetSeconds) > VIDEO_SEEK_TOLERANCE_SECONDS) {
      this.video.currentTime = frame.targetSeconds;
    }
  }

  releaseVideo(): void {
    if (!this.video.paused) this.video.pause();
    if (this.video.hasAttribute('src')) {
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.videoReady = false;
    this.videoFailed = false;
    this.videoLoading = false;
    this.videoPlayPending = false;
    this.attachVideo(false);
  }

  dispose(): void {
    this.releaseVideo();
    this.image.removeEventListener('load', this.onImageLoad);
    this.image.removeEventListener('error', this.onImageError);
    this.video.removeEventListener('loadeddata', this.onVideoLoaded);
    this.video.removeEventListener('seeked', this.onVideoSeeked);
    this.video.removeEventListener('error', this.onVideoError);
  }

  private syncPlayingVideo(speed: number, targetSeconds: number): void {
    const drift = this.video.currentTime - targetSeconds;
    if (Math.abs(drift) > VIDEO_DRIFT_RESET_SECONDS) this.video.currentTime = targetSeconds;
    const nextRate = drift < -VIDEO_DRIFT_TOLERANCE_SECONDS
      ? speed + VIDEO_RATE_ADJUSTMENT
      : drift > VIDEO_DRIFT_TOLERANCE_SECONDS
        ? Math.max(0.1, speed - VIDEO_RATE_ADJUSTMENT)
        : speed;
    if (Math.abs(this.video.playbackRate - nextRate) > 0.01) this.video.playbackRate = nextRate;
    if (this.video.paused && !this.videoPlayPending) {
      this.videoPlayPending = true;
      void this.video.play()
        .then(() => {
          this.videoPlayPending = false;
        })
        .catch(() => {
          this.videoPlayPending = false;
          this.videoReady = false;
          this.videoFailed = true;
          this.host.reportVideo('error', this.video);
          this.attachVideo(false);
          this.setStatus(this.imageReady
            ? '视频背景不可用，已显示图片背景。'
            : '背景暂时不可用。');
        });
    }
  }

  private attachVideo(attached: boolean): void {
    if (this.videoAttached === attached) return;
    this.videoAttached = attached;
    this.host.setVideo(attached ? this.video : null);
  }

  private ensureImage(): void {
    if (this.imageReady || this.imageLoading) return;
    if (!this.imageUrl) {
      this.imageFailed = true;
      if (this.mode === 'image') this.setStatus('图片背景暂时不可用。');
      return;
    }
    this.imageFailed = false;
    this.imageLoading = true;
    this.image.src = this.imageUrl;
  }

  private ensureVideo(): void {
    if (this.videoReady || this.videoLoading) return;
    if (!this.videoUrl) {
      this.videoFailed = true;
      this.host.reportVideo('error');
      this.setStatus(this.imageReady
        ? '视频背景不可用，已显示图片背景。'
        : '背景暂时不可用。');
      return;
    }
    this.videoFailed = false;
    this.videoLoading = true;
    this.video.src = this.videoUrl;
    this.video.load();
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

  private readonly onImageLoad = (): void => {
    this.imageLoading = false;
    this.imageReady = true;
    this.imageFailed = false;
    if (this.mode !== 'none') this.host.setImage(this.image);
    if (this.mode === 'image') this.clearStatus();
    this.host.render();
  };

  private readonly onImageError = (): void => {
    this.imageLoading = false;
    this.imageReady = false;
    this.imageFailed = true;
    this.host.setImage(null);
    if (this.mode === 'image') this.setStatus('图片背景暂时不可用。');
    if (this.mode === 'video' && this.videoFailed) this.setStatus('背景暂时不可用。');
    this.host.render();
  };

  private readonly onVideoLoaded = (): void => {
    this.videoLoading = false;
    this.videoReady = true;
    this.videoFailed = false;
    this.host.reportVideo('success', this.video);
    this.clearStatus();
    this.host.render();
  };

  private readonly onVideoSeeked = (): void => {
    if (this.mode === 'video') this.host.render();
  };

  private readonly onVideoError = (): void => {
    if (this.mode !== 'video') return;
    this.videoLoading = false;
    this.videoReady = false;
    this.videoFailed = true;
    this.host.reportVideo('error', this.video);
    this.attachVideo(false);
    this.ensureImage();
    this.setStatus(this.imageReady
      ? '视频背景不可用，已显示图片背景。'
      : this.imageFailed
        ? '背景暂时不可用。'
        : '视频背景不可用，正在加载图片背景…');
    this.host.render();
  };
}
