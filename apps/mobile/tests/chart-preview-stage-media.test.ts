import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StageImages,
  StageVideo,
  type StageMediaHost,
} from '@rranker/sdk/features/chart-preview-shared/webview-player/stage-media';
import type { StageContext } from '@rranker/sdk/features/chart-preview-shared/webview-player/stage';
import { SimaiBackgroundMedia } from '@rranker/chart-simai/features/simai-chart-preview/webview-player/backgroundMedia';

class Video extends EventTarget {
  src = '';
  crossOrigin: string | null = null;
  muted = false;
  playsInline = false;
  preload = '';
  duration = NaN;
  readyState = 0;
  videoWidth = 0;
  videoHeight = 0;
  seeking = false;
  paused = true;
  currentTime = 0;
  playbackRate = 1;
  playResult = () => Promise.resolve();
  callbacks = new Map<number, VideoFrameRequestCallback>();
  private handle = 0;
  play() { this.paused = false; return this.playResult(); }
  pause() { this.paused = true; }
  hasAttribute(name: string) { return name === 'src' && !!this.src; }
  removeAttribute(name: string) {
    if (name === 'src') this.src = '';
    if (name === 'crossorigin') this.crossOrigin = null;
  }
  load() { this.readyState = 0; this.duration = NaN; }
  metadata(duration = 10) {
    this.duration = duration; this.readyState = 1;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
  decoded(event = 'loadeddata') {
    this.readyState = 4; this.videoWidth = 128; this.videoHeight = 72;
    this.seeking = false;
    this.dispatchEvent(new Event(event));
  }
  requestVideoFrameCallback(callback: VideoFrameRequestCallback) {
    this.callbacks.set(++this.handle, callback); return this.handle;
  }
  cancelVideoFrameCallback(handle: number) { this.callbacks.delete(handle); }
  present(time: number, frames: number) {
    const callbacks = [...this.callbacks.values()]; this.callbacks.clear();
    for (const callback of callbacks) callback(0, { mediaTime: time, presentedFrames: frames } as VideoFrameCallbackMetadata);
  }
}

class Image extends EventTarget {
  static items: Image[] = [];
  src = '';
  crossOrigin: string | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  decoding = Promise.resolve();
  constructor() { super(); Image.items.push(this); }
  decode() { return this.decoding; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  loaded(width = 32, height = 32) {
    this.naturalWidth = width; this.naturalHeight = height;
    this.dispatchEvent(new Event('load'));
  }
}

const frame = (time: number, playing = false) => ({ time, playing, active: true, rate: 1 });
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const owned = new Set<string>();
const live: { dispose(): void }[] = [];
let invalidated = false;
let released: Set<CanvasImageSource>;
let host: StageMediaHost;

beforeEach(() => {
  invalidated = false;
  released = new Set();
  Image.items = [];
  owned.clear();
  host = {
    releaseImage: image => { released.add(image); },
    invalidateImage() {},
    onInvalidate: () => { invalidated = true; },
  };
  vi.stubGlobal('Image', Image);
  let url = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
    const value = 'blob:media-' + ++url; owned.add(value); return value;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(value => { owned.delete(value); });
});
afterEach(() => {
  for (const media of live.splice(0)) media.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function video() {
  const element = new Video();
  const media = new StageVideo(host, { element: element as unknown as HTMLVideoElement });
  live.push(media);
  return { element, media };
}
function images(resolve: (key: string) => string | Blob | undefined = key => 'file:///' + key) {
  const pool = new StageImages(host, resolve);
  live.push(pool);
  return pool;
}
async function ready(media: StageVideo, element: Video) {
  const loading = media.setSource('file:///video.mp4');
  element.metadata(); element.decoded(); await loading;
}

describe('共享视频状态', () => {
  it('只有元数据而一直没有可绘首帧时结束加载状态', async () => {
    vi.useFakeTimers();
    const { media, element } = video();
    const loading = media.setSource('file:///incomplete.mp4');
    element.metadata();
    expect(await loading).toBe(true);
    await vi.advanceTimersByTimeAsync(8000);
    expect(media.status).toBe('error');
    expect(media.ready).toBe(false);
    element.decoded();
    expect(media.status).toBe('error');
  });
  it('加载期间保存最新暂停位置，元数据和解码分别就绪', async () => {
    const { media, element } = video();
    const loading = media.setSource('https://example.test/video.mp4');
    media.sync(frame(2, true)); media.sync(frame(4));
    expect(element.crossOrigin).toBe('anonymous');
    element.metadata();
    expect(await loading).toBe(true);
    expect(media.ready).toBe(false);
    expect(element.currentTime).toBe(4);
    expect(element.paused).toBe(true);
    element.decoded();
    expect(media.status).toBe('ready');
    expect(media.sync(frame(4))).toBe(true);
  });

  it('切换来源立即结束旧等待，迟到回复不会覆盖新来源', async () => {
    const { media, element } = video();
    const old = Promise.withResolvers<string | null>();
    const pending = media.setSource(() => old.promise);
    const replacement = media.setSource(new Blob(['video']));
    expect(await pending).toBe(false);
    old.resolve('https://example.test/obsolete.mp4');
    await tick();
    expect(element.src).toBe('blob:media-1');
    expect(element.crossOrigin).toBeNull();
    element.metadata();
    expect(await replacement).toBe(true);
    await media.setSource(null);
    expect(owned.size).toBe(0);
    expect(element.src).toBe('');
    expect(media.status).toBe('empty');
  });

  it('晚到播放完成仍服从暂停，短循环倒跳精确定位', async () => {
    const { media, element } = video();
    await ready(media, element);
    const pending = Promise.withResolvers<void>();
    element.playResult = () => pending.promise;
    media.sync(frame(2.1, true));
    media.sync(frame(2.1));
    element.paused = false;
    pending.resolve(); await tick();
    expect(element.paused).toBe(true);
    element.playResult = () => Promise.resolve();
    media.sync(frame(2.1, true));
    element.currentTime = 2.1;
    media.sync(frame(2, true));
    expect(element.currentTime).toBe(2);
  });

  it('暂停打断不会失效，真实错误只在再次启用时重试', async () => {
    const { media, element } = video();
    await ready(media, element);
    element.playResult = () => Promise.reject(new DOMException('pause', 'AbortError'));
    media.sync(frame(1, true)); await tick();
    expect(media.status).toBe('ready');
    element.paused = true;
    element.playResult = () => Promise.reject(new DOMException('decode', 'NotSupportedError'));
    media.sync(frame(1.1, true)); await tick();
    expect(media.status).toBe('error');
    media.sync(frame(1.2, true));
    expect(media.status).toBe('error');
    media.sync(frame(1.2));
    media.sync(frame(1.2, true));
    expect(media.status).toBe('loading');
  });

  it('暂停后最后解码帧补画，同帧不重复失效，释放清掉回调与纹理', async () => {
    const { media, element } = video();
    await ready(media, element);
    media.sync(frame(.5));
    invalidated = false;
    const previous = media.revision;
    element.present(.5, 1);
    expect(media.revision).toBeGreaterThan(previous);
    expect(invalidated).toBe(true);
    invalidated = false;
    element.present(.5, 1);
    expect(invalidated).toBe(false);
    media.dispose();
    expect(element.callbacks.size).toBe(0);
    expect(element.src).toBe('');
    expect(released.has(element as unknown as HTMLVideoElement)).toBe(true);
  });

  it('未知结束时间的视频仍可播放，已知结束点外暂停', async () => {
    const { media, element } = video();
    const loading = media.setSource('file:///stream.webm');
    element.metadata(Infinity); element.decoded(); await loading;
    expect(media.sync(frame(4, true))).toBe(true);
    element.duration = 3;
    expect(media.sync(frame(4, true))).toBe(false);
    expect(element.paused).toBe(true);
  });
});

describe('共享图片驻留', () => {
  it('没有响应的图片会结束准备并回收来源', async () => {
    vi.useFakeTimers();
    const pool = images(() => new Blob(['image']));
    pool.prepare(['pending']);
    const settled = pool.settled();
    await vi.advanceTimersByTimeAsync(8000);
    await settled;
    expect(pool.get('pending')).toBeUndefined();
    expect(Image.items[0]!.src).toBe('');
    expect(owned.size).toBe(0);
  });
  it('预算内前后跳转复用已解码图，明确load的结果保持到释放', async () => {
    const pool = images();
    pool.prepare(['a']);
    Image.items[0]!.loaded(); await pool.settled();
    const first = pool.get('a');
    pool.prepare(['b']);
    Image.items[1]!.loaded(); await pool.settled();
    pool.prepare(['a']);
    expect(pool.get('a')).toBe(first);
    const fixed = pool.load('fixed');
    Image.items.at(-1)!.loaded(); await fixed;
    pool.prepare([]);
    expect(pool.get('fixed')).toBe(await fixed);
    pool.dispose();
    expect((first as unknown as Image).src).toBe('');
  });

  it('限制同时加载的源并优先当前可见图片', async () => {
    const pool = images();
    pool.prepare(['a', 'b', 'c', 'd', 'e'], ['future']);
    expect(Image.items.filter(image => image.src).map(image => image.src)).toEqual(
      ['file:///a', 'file:///b', 'file:///c', 'file:///d'],
    );
    Image.items[0]!.loaded(); await tick();
    expect(Image.items.at(-1)!.src).toBe('file:///e');
    for (const image of [...Image.items]) image.loaded();
    await tick();
    expect(Image.items.at(-1)!.src).toBe('file:///future');
    Image.items.at(-1)!.loaded(); await pool.settled();
  });

  it('过期加载与Blob立即回收，晚到解码不会发布旧图片', async () => {
    const pool = images(() => new Blob(['image']));
    pool.prepare(['old']);
    const old = Image.items[0]!;
    const decode = Promise.withResolvers<void>(); old.decoding = decode.promise;
    old.loaded();
    pool.prepare(['new']);
    expect(old.src).toBe('');
    expect(owned.size).toBe(1);
    decode.resolve(); await tick();
    expect(pool.get('old')).toBeUndefined();
    Image.items.at(-1)!.loaded(); await pool.settled();
    expect(pool.get('new')).toBeDefined();
    pool.dispose();
    expect(owned.size).toBe(0);
  });

  it('失败图片在窗口重新进入或明确load时重试', async () => {
    const pool = images();
    pool.prepare(['a']);
    Image.items[0]!.dispatchEvent(new Event('error'));
    pool.prepare(['a']);
    expect(Image.items).toHaveLength(1);
    pool.prepare([]); pool.prepare(['a']);
    const replacement = Image.items.at(-1)!;
    replacement.dispatchEvent(new Event('error'));
    const fixed = pool.load('a');
    Image.items.at(-1)!.loaded(); await fixed;
    expect(pool.get('a')).toBeDefined();
  });

  it('超预算先回收远段，当前段和邻近图片继续可用', async () => {
    const pool = images();
    pool.prepare(['old']); Image.items.at(-1)!.loaded(2048, 4096); await pool.settled();
    const old = pool.get('old')!;
    pool.prepare(['current'], ['near']);
    Image.items.at(-1)!.loaded(2048, 4096); await tick();
    expect(Image.items.at(-1)!.src).toBe('file:///current');
    pool.prepare(['current', 'near']);
    Image.items.at(-1)!.loaded(2048, 4096); await pool.settled();
    expect(pool.get('old')).toBeUndefined();
    expect(pool.get('current')).toBeDefined();
    expect(pool.get('near')).toBeDefined();
    expect(released.has(old)).toBe(true);
  });
});

describe('Simai 共享媒体接入', () => {
  it('首次失败后重新播放可显示视频，暂停与恢复保留已加载来源', async () => {
    const element = new Video();
    const first = Promise.withResolvers<string | null>();
    let source = first.promise;
    let displayed: HTMLVideoElement | null = null;
    const stage: Pick<StageContext, 'createVideo' | 'createImages'> = {
      createVideo: options => new StageVideo(host, options),
      createImages: resolve => new StageImages(host, resolve),
    };
    const background = new SimaiBackgroundMedia({
      stage: stage as StageContext, video: element as unknown as HTMLVideoElement, mode: 'video',
      host: {
        render() {}, reportVideo() {}, loadVideo: () => source,
        readStatus: () => '', writeStatus() {}, setImage() {},
        setVideo: video => { displayed = video; },
      },
    });
    live.push(background);
    const position = { currentBeats: 8, totalBeats: 100, playing: false, speed: 1,
      bpmEvents: null, bpm: 120, musicOffset: 0 };
    background.setMode('video');
    background.syncFrame(position);
    first.resolve(null); await tick();
    expect(displayed).toBeNull();

    source = Promise.resolve('file:///recovered.mp4');
    background.syncFrame({ ...position, playing: true }); await tick();
    expect(element.src).toBe('file:///recovered.mp4');
    element.metadata(); element.decoded();
    background.syncFrame({ ...position, playing: true }); await tick();
    expect(displayed).toBe(element);
    expect(element.currentTime).toBe(2);
    expect(element.paused).toBe(false);

    background.syncFrame({ ...position, currentBeats: 10 });
    expect(element.paused).toBe(true);
    expect(element.currentTime).toBe(3);
    background.syncFrame({ ...position, currentBeats: 10, playing: true }); await tick();
    expect(element.src).toBe('file:///recovered.mp4');
    expect(element.paused).toBe(false);
    expect(displayed).toBe(element);
  });
});
