import {
  assertChartPreviewGifFramePixels,
  assertChartPreviewTexturePixels,
  CHART_PREVIEW_MAX_TEXTURE_PIXELS,
} from '../chart-preview-resource-budget';

export interface StageMediaHost {
  releaseImage(source: CanvasImageSource): void;
  invalidateImage(source: CanvasImageSource): void;
  onInvalidate?: () => void;
}

export type VideoStatus = 'empty' | 'loading' | 'ready' | 'error';
export type VideoSource = string | Blob | (() => Promise<string | null>) | null;
export interface StageVideoOptions {
  element?: HTMLVideoElement;
  onStatus?: (status: VideoStatus) => void;
  onDuration?: () => void;
}
export interface VideoFrame {
  time: number;
  active: boolean;
  playing: boolean;
  rate: number;
  seek?: boolean;
}

export class StageVideo {
  readonly element: HTMLVideoElement;
  status: VideoStatus = 'empty';
  private version = 0;
  private source: VideoSource = null;
  private ownedUrl: string | null = null;
  private generation = 0;
  private disposed = false;
  private loadFinished?: (ready: boolean) => void;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private frameCallback?: number;
  private frameCount = -1;
  private mediaTime = -1;
  private playRequest = 0;
  private playPending = false;
  private desired: VideoFrame = { time: 0, active: false, playing: false, rate: 1 };

  constructor(
    private readonly stage: StageMediaHost,
    private readonly options: StageVideoOptions = {},
    private readonly onDispose: () => void = () => {},
  ) {
    this.element = options.element ?? document.createElement('video');
    this.element.muted = true;
    this.element.playsInline = true;
    this.element.preload = 'auto';
    this.element.addEventListener('loadedmetadata', this.metadata);
    this.element.addEventListener('durationchange', this.durationChanged);
    this.element.addEventListener('loadeddata', this.decoded);
    this.element.addEventListener('seeked', this.decoded);
    this.element.addEventListener('error', this.failed);
    this.element.addEventListener('emptied', this.emptied);
  }

  get duration(): number {
    return Number.isNaN(this.element.duration) ? 0 : Math.max(0, this.element.duration);
  }

  get ready(): boolean {
    return this.status === 'ready' && this.element.readyState >= 2 && !this.element.seeking &&
      this.element.videoWidth > 0 && this.element.videoHeight > 0;
  }

  get revision(): number {
    if (this.ready && typeof this.element.requestVideoFrameCallback !== 'function') {
      const count = this.element.getVideoPlaybackQuality?.().totalVideoFrames;
      if ((count ?? 0) > 0 ? count !== this.frameCount : this.element.currentTime !== this.mediaTime) {
        this.frameCount = count ?? -1;
        this.mediaTime = this.element.currentTime;
        this.version++;
      }
    }
    return this.version;
  }

  setSource(source: VideoSource): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const generation = ++this.generation;
    this.finishLoad(false);
    this.stopSource();
    this.source = source;
    this.frameCount = this.mediaTime = -1;
    this.changed();
    this.setStatus(source === null ? 'empty' : 'loading');
    if (source === null) return Promise.resolve(false);

    return new Promise<boolean>((resolve) => {
      this.loadFinished = resolve;
      const attach = (resource: string | Blob | null) => {
        if (this.disposed || generation !== this.generation) return;
        if (resource === null) { this.failed(); return; }
        const url = typeof resource === 'string' ? resource : URL.createObjectURL(resource);
        this.ownedUrl = typeof resource === 'string' ? null : url;
        if (/^https?:/i.test(url)) this.element.crossOrigin = 'anonymous';
        else this.element.removeAttribute('crossorigin');
        this.element.src = url;
        this.loadTimer = setTimeout(this.failed, 8000);
        this.watchFrames();
        this.element.load();
      };
      try {
        if (typeof source === 'function') {
          void source().then(attach, () => {
            if (!this.disposed && generation === this.generation) this.failed();
          });
        } else attach(source);
      } catch {
        if (generation === this.generation) this.failed();
      }
    });
  }

  sync(frame: VideoFrame): boolean {
    if (this.disposed) return false;
    const previous = this.desired;
    const retry = frame.active && (!previous.active || (frame.playing && !previous.playing));
    this.desired = { ...frame, seek: frame.seek || frame.time < previous.time - .001 };
    if (this.status === 'error' && retry && this.source !== null) void this.setSource(this.source);
    return this.apply();
  }

  private apply(): boolean {
    const video = this.element, frame = this.desired;
    const active = frame.active && frame.time >= 0 && frame.time < this.duration;
    if (!active || !frame.playing || this.status === 'error') this.pause();
    if (!active || this.status === 'error' || video.readyState < 1) return false;
    if (video.playbackRate !== frame.rate) video.playbackRate = frame.rate;
    const tolerance = frame.playing && !frame.seek ? .25 : .001;
    if (Math.abs(video.currentTime - frame.time) > tolerance && (!video.seeking || frame.seek)) {
      video.currentTime = frame.time;
    }
    this.desired.seek = false;
    if (frame.playing && video.paused && !this.playPending) {
      const request = ++this.playRequest, generation = this.generation;
      this.playPending = true;
      void video.play().then(() => {
        if (this.disposed || generation !== this.generation) return;
        if (!this.desired.active || !this.desired.playing ||
          this.desired.time < 0 || this.desired.time >= this.duration) { this.pause(); return; }
        if (request !== this.playRequest) return;
        this.playPending = false;
      }).catch((error: unknown) => {
        if (this.disposed || generation !== this.generation || request !== this.playRequest) return;
        this.playPending = false;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        this.failed();
      });
    }
    return this.ready;
  }

  private pause(): void {
    this.playRequest++;
    this.playPending = false;
    if (!this.element.paused) this.element.pause();
  }

  private finishLoad(ready: boolean, clearTimer = true): void {
    if (clearTimer) {
      if (this.loadTimer !== undefined) clearTimeout(this.loadTimer);
      this.loadTimer = undefined;
    }
    const finish = this.loadFinished;
    this.loadFinished = undefined;
    finish?.(ready);
  }

  private setStatus(status: VideoStatus): void {
    if (status === this.status) return;
    this.status = status;
    this.options.onStatus?.(status);
  }

  private changed(): void {
    this.version++;
    this.stage.invalidateImage(this.element);
    this.stage.onInvalidate?.();
  }

  private readonly metadata = (): void => {
    if (this.disposed || this.source === null || this.status === 'error' || this.element.readyState < 1) return;
    this.finishLoad(true, false);
    this.options.onDuration?.();
    this.apply();
    this.changed();
  };

  private readonly durationChanged = (): void => {
    if (this.disposed || this.source === null) return;
    this.options.onDuration?.();
    this.stage.onInvalidate?.();
  };

  private readonly decoded = (): void => {
    if (this.disposed || this.source === null || this.status === 'error' || this.element.readyState < 2) return;
    this.finishLoad(true);
    this.setStatus('ready');
    this.apply();
    this.changed();
  };

  private readonly failed = (): void => {
    if (this.disposed || this.source === null || this.status === 'error') return;
    this.pause();
    this.finishLoad(false);
    this.setStatus('error');
    this.stage.releaseImage(this.element);
    this.changed();
  };

  private readonly emptied = (): void => {
    if (this.disposed) return;
    this.stage.releaseImage(this.element);
    this.changed();
  };

  private watchFrames(): void {
    if (this.frameCallback !== undefined || typeof this.element.requestVideoFrameCallback !== 'function') return;
    this.frameCallback = this.element.requestVideoFrameCallback((_time, metadata) => {
      this.frameCallback = undefined;
      if (this.disposed || this.source === null) return;
      if (this.mediaTime !== metadata.mediaTime || this.frameCount !== metadata.presentedFrames) {
        this.mediaTime = metadata.mediaTime;
        this.frameCount = metadata.presentedFrames;
        this.version++;
        if (this.desired.active && !this.desired.playing) this.stage.onInvalidate?.();
      }
      this.watchFrames();
    });
  }

  private stopSource(): void {
    this.pause();
    if (this.frameCallback !== undefined) this.element.cancelVideoFrameCallback(this.frameCallback);
    this.frameCallback = undefined;
    this.stage.releaseImage(this.element);
    if (this.element.hasAttribute('src')) {
      this.element.removeAttribute('src');
      this.element.load();
    }
    if (this.ownedUrl) URL.revokeObjectURL(this.ownedUrl);
    this.ownedUrl = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.finishLoad(false);
    this.element.removeEventListener('loadedmetadata', this.metadata);
    this.element.removeEventListener('durationchange', this.durationChanged);
    this.element.removeEventListener('loadeddata', this.decoded);
    this.element.removeEventListener('seeked', this.decoded);
    this.element.removeEventListener('error', this.failed);
    this.element.removeEventListener('emptied', this.emptied);
    this.stopSource();
    this.source = null;
    this.status = 'empty';
    this.version++;
    this.onDispose();
  }
}

type ImageAsset = { image: HTMLImageElement; url: string | null; pixels: number };
type ImageRequest = {
  promise: Promise<HTMLImageElement | undefined>;
  active: boolean;
  start: () => void;
  cancel: () => void;
};

export class StageImages {
  revision = 0;
  private readonly images = new Map<string, ImageAsset>();
  private readonly pending = new Map<string, ImageRequest>();
  private readonly fixed = new Set<string>();
  private readonly failed = new Set<string>();
  private visible = new Set<string>();
  private ahead = new Set<string>();
  private pixels = 0;
  private disposed = false;
  private pumping = false;
  private running = 0;

  constructor(
    private readonly stage: StageMediaHost,
    private readonly resolve: (key: string) => string | Blob | undefined,
    private readonly onError?: (key: string) => void,
    private readonly onDispose: () => void = () => {},
  ) {}

  get(key: string): HTMLImageElement | undefined {
    const asset = this.images.get(key);
    if (!asset) return;
    this.images.delete(key);
    this.images.set(key, asset);
    return asset.image;
  }

  load(key: string): Promise<HTMLImageElement | undefined> {
    if (this.disposed) return Promise.resolve(undefined);
    this.fixed.add(key);
    this.failed.delete(key);
    return this.request(key);
  }

  prepare(visible: readonly string[], ahead: readonly string[] = []): void {
    if (this.disposed) return;
    for (const key of [...visible, ...ahead]) if (!this.wanted(key)) this.failed.delete(key);
    this.visible = new Set(visible);
    this.ahead = new Set(ahead);
    for (const [key, request] of this.pending) if (!this.wanted(key)) request.cancel();
    this.trim();
    this.pump();
  }

  async settled(): Promise<void> {
    while (!this.disposed && this.pending.size) {
      await Promise.all([...this.pending.values()].map(request => request.promise));
    }
  }

  private wanted(key: string): boolean {
    return this.fixed.has(key) || this.visible.has(key) || this.ahead.has(key);
  }

  private request(key: string): Promise<HTMLImageElement | undefined> {
    const existing = this.get(key);
    if (existing) return Promise.resolve(existing);
    if (this.failed.has(key)) return Promise.resolve(undefined);
    const queued = this.pending.get(key);
    if (queued) return queued.promise;
    const image = new Image();
    let url: string | null = null, finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveResult!: (value: HTMLImageElement | undefined) => void;
    const promise = new Promise<HTMLImageElement | undefined>(resolve => { resolveResult = resolve; });
    const finish = (success: boolean, report = false) => {
      if (finished) return;
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
      if (request.active) this.running--;
      this.pending.delete(key);
      if (success && !this.disposed && this.wanted(key)) {
        const pixels = image.naturalWidth * image.naturalHeight;
        this.images.set(key, { image, url, pixels });
        this.pixels += pixels;
        this.revision++;
        resolveResult(image);
        this.trim();
        this.stage.onInvalidate?.();
      } else {
        image.removeAttribute('src');
        if (url) URL.revokeObjectURL(url);
        if (report && !this.disposed) { this.failed.add(key); this.onError?.(key); }
        resolveResult(undefined);
      }
      this.pump();
    };
    const failed = () => finish(false, true);
    const loaded = () => {
      void image.decode().then(() => {
        if (finished) return;
        try {
          const pixels = image.naturalWidth * image.naturalHeight;
          if (!pixels) throw new Error('图片无可用画面');
          if (/\.gif$/i.test(key)) assertChartPreviewGifFramePixels(pixels);
          else assertChartPreviewTexturePixels(pixels);
          finish(true);
        } catch { failed(); }
      }, failed);
    };
    const request: ImageRequest = {
      promise,
      active: false,
      cancel: () => finish(false),
      start: () => {
        request.active = true;
        this.running++;
        image.addEventListener('load', loaded);
        image.addEventListener('error', failed);
        timer = setTimeout(failed, 8000);
        try {
          const source = this.resolve(key);
          if (source === undefined) { failed(); return; }
          url = typeof source === 'string' ? null : URL.createObjectURL(source);
          const uri = url ?? source as string;
          if (/^https?:/i.test(uri)) image.crossOrigin = 'anonymous';
          image.src = uri;
        } catch { failed(); }
      },
    };
    this.pending.set(key, request);
    this.pump();
    return promise;
  }

  private pump(): void {
    if (this.disposed || this.pumping) return;
    this.pumping = true;
    try {
      for (const key of [...this.visible, ...this.fixed, ...this.ahead]) {
        if (this.running >= 4) return;
        if (this.images.has(key) || this.pending.get(key)?.active || this.failed.has(key)) continue;
        if (!this.visible.has(key) && !this.fixed.has(key) &&
          (this.running || this.pixels >= CHART_PREVIEW_MAX_TEXTURE_PIXELS)) return;
        if (!this.pending.has(key)) void this.request(key);
        this.pending.get(key)?.start();
      }
    } finally {
      this.pumping = false;
    }
  }

  private trim(): void {
    if (this.pixels <= CHART_PREVIEW_MAX_TEXTURE_PIXELS) return;
    for (const keep of [new Set([...this.visible, ...this.ahead]), this.visible]) {
      for (const key of this.images.keys()) {
        if (this.pixels <= CHART_PREVIEW_MAX_TEXTURE_PIXELS) return;
        if (!this.fixed.has(key) && !keep.has(key)) {
          this.ahead.delete(key);
          this.release(key);
        }
      }
    }
  }

  private release(key: string): void {
    const asset = this.images.get(key);
    if (!asset) return;
    this.stage.releaseImage(asset.image);
    asset.image.removeAttribute('src');
    if (asset.url) URL.revokeObjectURL(asset.url);
    this.images.delete(key);
    this.pixels -= asset.pixels;
    this.revision++;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const request of this.pending.values()) request.cancel();
    for (const key of this.images.keys()) this.release(key);
    this.fixed.clear();
    this.failed.clear();
    this.visible.clear();
    this.ahead.clear();
    this.onDispose();
  }
}
