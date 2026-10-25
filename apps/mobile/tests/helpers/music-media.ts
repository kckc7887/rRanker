import { vi } from 'vitest';

type MediaOptions = {
  duration: number;
  deferLoad: boolean;
  deferPlay: boolean;
  deferSeek: boolean;
};

export class FakeMusicMedia extends EventTarget {
  src = '';
  preload = '';
  preservesPitch = false;
  duration = NaN;
  paused = true;
  seeking = false;
  ended = false;
  private position = 0;
  private anchor = 0;
  private rate = 1;
  private advancing = false;
  private pendingPlay: { resolve(): void; reject(error: Error): void }[] = [];

  constructor(private readonly context: { currentTime: number }, readonly options: MediaOptions) { super(); }

  get currentTime(): number {
    if (!this.advancing) return this.position;
    const time = this.position + (this.context.currentTime - this.anchor) * this.rate;
    if (Number.isFinite(this.duration) && time >= this.duration) {
      this.position = this.duration;
      this.advancing = false;
      this.paused = true;
      this.ended = true;
      queueMicrotask(() => this.dispatchEvent(new Event('ended')));
      return this.duration;
    }
    return time;
  }

  set currentTime(value: number) {
    this.position = value;
    this.anchor = this.context.currentTime;
    this.seeking = true;
    this.ended = false;
    this.dispatchEvent(new Event('seeking'));
    if (!this.options.deferSeek) queueMicrotask(() => this.finishSeek());
  }

  get playbackRate(): number { return this.rate; }
  set playbackRate(value: number) {
    this.position = this.currentTime;
    this.anchor = this.context.currentTime;
    this.rate = value;
  }

  load(): void {
    if (!this.src) { this.pause(); this.duration = NaN; return; }
    const source = this.src;
    if (!this.options.deferLoad) queueMicrotask(() => { if (this.src === source) this.finishLoad(); });
  }

  finishLoad(duration = this.options.duration): void {
    this.duration = duration;
    this.dispatchEvent(new Event('loadedmetadata'));
  }

  play(): Promise<void> {
    this.paused = false;
    const result = new Promise<void>((resolve, reject) => this.pendingPlay.push({ resolve, reject }));
    if (!this.options.deferPlay) queueMicrotask(() => this.finishPlay());
    return result;
  }

  finishPlay(): void {
    this.paused = false;
    this.advancing = true;
    this.anchor = this.context.currentTime;
    this.dispatchEvent(new Event('playing'));
    this.pendingPlay.splice(0).forEach(pending => pending.resolve());
  }

  rejectPlay(error = new Error('media play failed')): void {
    this.pause();
    this.pendingPlay.splice(0).forEach(pending => pending.reject(error));
  }

  finishSeek(): void {
    this.seeking = false;
    this.dispatchEvent(new Event('seeked'));
  }

  pause(): void {
    this.position = this.currentTime;
    this.advancing = false;
    this.paused = true;
  }

  wait(): void {
    this.position = this.currentTime;
    this.advancing = false;
    this.dispatchEvent(new Event('waiting'));
  }

  end(): void {
    this.position = this.duration;
    this.advancing = false;
    this.paused = true;
    this.ended = true;
    this.dispatchEvent(new Event('ended'));
  }

  fail(): void { this.dispatchEvent(new Event('error')); this.rejectPlay(new Error('media error')); }
  removeAttribute(name: string): void { if (name === 'src') this.src = ''; }
}

export function installMusicMedia(context: { currentTime: number }, settings: Partial<MediaOptions> = {}) {
  const options: MediaOptions = { duration: 30, deferLoad: false, deferPlay: false, deferSeek: false, ...settings };
  const media: FakeMusicMedia[] = [];
  const urls = new Map<string, Blob>();
  let serial = 0;
  vi.stubGlobal('Audio', class extends FakeMusicMedia {
    constructor() { super(context, options); media.push(this); }
  });
  const BaseURL = URL;
  vi.stubGlobal('URL', class extends BaseURL {
    static createObjectURL(blob: Blob): string { const url = `blob:music-${++serial}`; urls.set(url, blob); return url; }
    static revokeObjectURL(url: string): void { urls.delete(url); }
  });
  Object.defineProperty(context, 'createMediaElementSource', {
    configurable: true,
    value: () => ({ connect() {}, disconnect() {} }),
  });
  return { media, urls, options };
}
