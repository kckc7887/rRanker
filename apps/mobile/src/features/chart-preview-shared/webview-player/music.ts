import { PlaybackClock, audioContextTime, musicPosition } from './playbackClock';

function waitForMedia(media: HTMLAudioElement, event: string, signal: AbortSignal, ready: () => boolean): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (ready()) return Promise.resolve(true);
  return new Promise((resolve, reject) => {
    const clear = () => {
      media.removeEventListener(event, success);
      media.removeEventListener('error', fail);
      signal.removeEventListener('abort', abort);
    };
    const success = () => { if (ready()) { clear(); resolve(true); } };
    const fail = () => { clear(); reject(new Error('音乐无法播放')); };
    const abort = () => { clear(); resolve(false); };
    media.addEventListener(event, success);
    media.addEventListener('error', fail);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function completeWhileCurrent(pending: Promise<void>, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) { void pending.catch(() => undefined); return Promise.resolve(false); }
  return new Promise((resolve, reject) => {
    const abort = () => resolve(false);
    signal.addEventListener('abort', abort, { once: true });
    pending.then(() => {
      signal.removeEventListener('abort', abort);
      resolve(!signal.aborted);
    }, error => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) resolve(false);
      else reject(error);
    });
  });
}

export class MusicPlayback {
  onStateChange: (() => void) | undefined;
  private media: HTMLAudioElement | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private url: string | null = null;
  private loadController: AbortController | null = null;
  private playController: AbortController | null = null;
  private introTimer: ReturnType<typeof setTimeout> | null = null;
  private length = 0;
  private position = 0;
  private readonly clock = new PlaybackClock();
  private speed = 1;
  private running = false;
  private pending = false;
  private mediaClock = false;
  private disposed = false;

  constructor(private readonly context: AudioContext, private readonly output: AudioNode) {}

  get duration(): number { return this.length; }
  get playing(): boolean { return this.running; }
  get waiting(): boolean { return this.pending; }

  get currentTime(): number {
    if (!this.running || this.pending) return this.position;
    if (this.mediaClock && this.media) return this.media.currentTime;
    const time = this.clock.positionAt(audioContextTime(this.context.currentTime));
    return this.media && this.position < 0 ? Math.min(0, time) : time;
  }

  async load(bytes: ArrayBuffer | null, mimeType = ''): Promise<boolean> {
    if (this.disposed) return false;
    this.pause();
    this.loadController?.abort();
    this.releaseMedia();
    this.length = 0;
    this.position = 0;
    if (!bytes) return false;
    const controller = new AbortController();
    this.loadController = controller;
    try {
      const media = new Audio();
      this.media = media;
      media.preload = 'auto';
      media.preservesPitch = true;
      this.url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
      const ready = waitForMedia(media, 'loadedmetadata', controller.signal, () => Number.isFinite(media.duration));
      media.src = this.url;
      media.load();
      if (!(await ready) || this.disposed || this.media !== media) return false;
      if (!(media.duration > 0)) throw new Error('音乐时长不可用');
      this.length = media.duration;
      this.source = this.context.createMediaElementSource(media);
      this.source.connect(this.output);
      media.addEventListener('waiting', this.onWaiting);
      media.addEventListener('seeking', this.onWaiting);
      media.addEventListener('playing', this.onPlaying);
      media.addEventListener('ended', this.onEnded);
      media.addEventListener('error', this.onError);
      return true;
    } catch {
      if (this.loadController === controller) { this.releaseMedia(); this.length = 0; }
      return false;
    } finally {
      if (this.loadController === controller) this.loadController = null;
    }
  }

  async playFrom(positionSeconds: number, speed = 1): Promise<void> {
    if (this.disposed) return;
    this.pause();
    const controller = new AbortController();
    this.playController = controller;
    this.position = positionSeconds;
    this.speed = speed;
    this.mediaClock = false;
    this.changeState(true, true);
    try {
      if (this.context.state !== 'running'
        && !(await completeWhileCurrent(this.context.resume(), controller.signal))) return;
      if (controller.signal.aborted || this.disposed) return;
      if (this.media && this.position >= 0 && this.position < this.length) {
        await this.startMedia(controller);
      } else {
        this.clock.set(audioContextTime(this.context.currentTime), musicPosition(this.position), this.speed);
        this.changeState(true, false);
        this.scheduleIntro(controller);
      }
    } catch (error) {
      if (!controller.signal.aborted) { this.pause(); throw error; }
    }
  }

  pause(): void {
    this.position = this.currentTime;
    this.playController?.abort();
    this.playController = null;
    this.clearIntro();
    this.mediaClock = false;
    this.media?.pause();
    this.changeState(false, false);
  }

  setSpeed(speed: number): void {
    if (this.disposed) return;
    this.position = this.currentTime;
    this.speed = speed;
    this.clock.set(audioContextTime(this.context.currentTime), musicPosition(this.position), this.speed);
    if (this.media) this.media.playbackRate = speed;
    if (this.playController && !this.mediaClock) this.scheduleIntro(this.playController);
  }

  async seek(positionSeconds: number): Promise<void> {
    if (this.disposed) return;
    if (this.running) return this.playFrom(positionSeconds, this.speed);
    this.pause();
    this.position = positionSeconds;
  }

  dispose(): void {
    if (this.disposed) return;
    this.pause();
    this.disposed = true;
    this.loadController?.abort();
    this.loadController = null;
    this.releaseMedia();
    this.onStateChange = undefined;
  }

  private changeState(playing: boolean, waiting: boolean): void {
    const changed = playing !== this.running || waiting !== this.pending;
    this.running = playing;
    this.pending = waiting;
    if (changed) this.onStateChange?.();
  }

  private clearIntro(): void {
    if (this.introTimer !== null) clearTimeout(this.introTimer);
    this.introTimer = null;
  }

  private scheduleIntro(controller: AbortController): void {
    this.clearIntro();
    if (!this.media || !this.running || controller.signal.aborted || this.currentTime >= this.length) return;
    const remaining = -this.currentTime / this.speed;
    this.introTimer = setTimeout(() => {
      this.introTimer = null;
      if (controller.signal.aborted || this.disposed) return;
      if (this.currentTime < 0) { this.scheduleIntro(controller); return; }
      this.position = 0;
      void this.startMedia(controller).catch(() => { if (!controller.signal.aborted) this.pause(); });
    }, Math.max(0, remaining * 1000));
  }

  private async startMedia(controller: AbortController): Promise<void> {
    const media = this.media;
    if (!media || controller.signal.aborted || this.disposed) return;
    this.mediaClock = true;
    this.changeState(true, true);
    if (controller.signal.aborted) return;
    media.playbackRate = this.speed;
    if (media.currentTime !== this.position) {
      media.currentTime = this.position;
      if (!(await waitForMedia(media, 'seeked', controller.signal, () => !media.seeking))) return;
    }
    if (controller.signal.aborted || this.disposed) return;
    const playing = media.play();
    void playing.then(() => {
      if (controller.signal.aborted && !this.running) media.pause();
    }, () => undefined);
    if (!(await completeWhileCurrent(playing, controller.signal))) return;
    if (this.disposed || this.media !== media) return;
    this.position = media.currentTime;
    this.changeState(true, false);
  }

  private readonly onWaiting = (): void => {
    if (!this.running || !this.mediaClock || !this.media) return;
    if (!this.pending) this.position = this.media.currentTime;
    this.changeState(true, true);
  };

  private readonly onPlaying = (): void => {
    if (!this.running || !this.mediaClock || !this.media || this.media.paused || this.media.seeking) return;
    this.position = this.media.currentTime;
    this.changeState(true, false);
  };

  private readonly onEnded = (): void => {
    if (!this.running || !this.mediaClock || !this.media?.ended) return;
    this.position = this.length;
    this.clock.set(audioContextTime(this.context.currentTime), musicPosition(this.position), this.speed);
    this.mediaClock = false;
    this.changeState(true, false);
  };

  private readonly onError = (): void => {
    this.position = this.currentTime;
    this.clearIntro();
    this.mediaClock = false;
    this.media?.pause();
    this.changeState(false, false);
  };

  private releaseMedia(): void {
    if (this.media) {
      this.media.pause();
      this.media.removeEventListener('waiting', this.onWaiting);
      this.media.removeEventListener('seeking', this.onWaiting);
      this.media.removeEventListener('playing', this.onPlaying);
      this.media.removeEventListener('ended', this.onEnded);
      this.media.removeEventListener('error', this.onError);
      this.media.removeAttribute('src');
      this.media.load();
    }
    this.source?.disconnect();
    this.source = null;
    this.media = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
