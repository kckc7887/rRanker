import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import type { StageContext } from '@rranker/sdk/features/chart-preview-shared/webview-player/stage';
import { StageImages, StageVideo } from '@rranker/sdk/features/chart-preview-shared/webview-player/stage-media';
import { createPreviewMedia, type MediaPresentationOptions } from '@rranker/chart-osu/features/osu-chart-preview/webview-player/backdrop';

type Draw = { type: string; image?: unknown; filter: string; fill?: string };
class TestContext {
  constructor(readonly canvas = { width: 1280, height: 720 }) {}
  filter = 'none'; fillStyle = ''; globalAlpha = 1;
  calls: Draw[] = [];
  stack: { filter: string; fillStyle: string }[] = [];
  save() { this.stack.push({ filter: this.filter, fillStyle: this.fillStyle }); }
  restore() { Object.assign(this, this.stack.pop()); }
  beginPath() {} rect() {} clip() {} translate() {} rotate() {} scale() {}
  clearRect() { this.calls.push({ type: 'clear', filter: this.filter }); }
  fillRect() { this.calls.push({ type: 'fill', filter: this.filter, fill: this.fillStyle }); }
  drawImage(image: unknown) { this.calls.push({ type: 'draw', image, filter: this.filter }); }
  createImages(resolve: (key: string) => string | Blob | undefined, onError?: (key: string) => void) {
    return new StageImages(this, resolve, onError);
  }
  createVideo(options?: ConstructorParameters<typeof StageVideo>[1]) { return new StageVideo(this, options); }
  releaseImage() {} invalidateImage() {}
  asContext() { return this as unknown as CanvasRenderingContext2D; }
  asStage() { return this as unknown as StageContext; }
}
class TestVideo extends EventTarget {
  muted = false; playsInline = false; preload = ''; src = '';
  readyState = 2; videoWidth = 4; videoHeight = 4; duration = 12;
  currentTime = 0; paused = true; seeking = false; plays = 0; pauses = 0;
  playbackRate = 1;
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; this.pauses++; }
  load() { if (this.src) queueMicrotask(() => { this.dispatchEvent(new Event('loadedmetadata')); this.dispatchEvent(new Event('loadeddata')); }); }
  removeAttribute() { this.src = ''; }
  hasAttribute() { return Boolean(this.src); }
}
const defaults: MediaPresentationOptions = { playbackSpeed: 1, backgroundBrightness: 20, backgroundBlur: 0, storyboardEnabled: true, videoEnabled: true };

async function environment(run: (env: { stage: StageContext; video: TestVideo; decoded: number[]; images: { src: string }[] }) => Promise<void>) {
  const oldDocument = globalThis.document, oldImage = globalThis.Image;
  const stage = new TestContext().asStage(), video = new TestVideo(), decoded: number[] = [], images: { src: string }[] = [];
  class TestImage extends EventTarget {
    width = 4; height = 4; naturalWidth = 4; naturalHeight = 4; complete = false; id = 0;
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    private location = '';
    constructor() { super(); images.push(this); }
    get src() { return this.location; }
    set src(value: string) {
      this.location = value;
      void (async () => {
        await Promise.resolve();
        if (value.startsWith('blob:')) {
          this.id = new Uint8Array(await (await fetch(value)).arrayBuffer())[0]!;
          decoded.push(this.id);
        }
        if (this.location !== value) return;
        this.complete = true; this.onload?.(); this.dispatchEvent(new Event('load'));
      })();
    }
    removeAttribute() { this.location = ''; }
    decode() { return Promise.resolve(); }
  }
  globalThis.document = { createElement() { return video; } } as unknown as Document;
  globalThis.Image = TestImage as unknown as typeof Image;
  try { await run({ stage, video, decoded, images }); }
  finally { globalThis.document = oldDocument; globalThis.Image = oldImage; }
}

function request(stage: StageContext, events: string, files = new Map<string, Uint8Array>()) {
  return { stage, files, osuBytes: new TextEncoder().encode(`[General]\nWidescreenStoryboard:1\n[Events]\n${events}`),
    osuPath: 'map.osu', signal: new AbortController().signal, onWarning() {} };
}

describe('preview media presentation', () => {
  it('动画仅解码归档中的实际帧，缺帧不阻断其它图层且仍使用原帧号', async () => {
    await environment(async ({ stage, decoded }) => {
      const media = await createPreviewMedia(request(stage, 'Animation,Foreground,Centre,"frames/f.png",320,240,1000000000,50,LoopForever\n F,0,0,500,1',
        new Map([['frames/f0.png', new Uint8Array([1])], ['frames/f2.png', new Uint8Array([3])], ['other/f1.png', new Uint8Array([9])]])));
      assert.deepEqual(decoded, [1]);
      const ctx = new TestContext();
      const ready = new Promise<void>(resolve => { stage.onInvalidate = resolve; });
      media.drawUnder(ctx.asContext(), 100);
      await ready;
      media.drawUnder(ctx.asContext(), 100);
      assert.equal((ctx.calls.find(call => call.type === 'draw')?.image as { id: number }).id, 3);
      media.dispose();
    });
  });
  it('loads staged image and video URIs without copying media into Blob URLs', async () => {
    const oldCreate = URL.createObjectURL;
    URL.createObjectURL = () => { throw new Error('Unexpected media byte copy'); };
    try {
      await environment(async ({ stage, video, decoded, images }) => {
        const files = new Map<string, Uint8Array | { uri: string }>([
          ['set/bg.png', { uri: 'file:///preview/image.png' }],
          ['set/movie.mp4', { uri: 'file:///preview/video.mp4' }],
        ]);
        const media = await createPreviewMedia({ ...request(stage, '0,0,"bg.png",0,0\nVideo,500,"movie.mp4"'), files, osuPath: 'set/map.osu' });
        assert.equal(images[0]!.src, 'file:///preview/image.png');
        assert.equal(video.src, 'file:///preview/video.mp4');
        assert.equal(video.muted, true);
        assert.equal(video.playsInline, true);
        assert.equal(decoded.length, 0);
        media.sync(1000, true, true);
        assert.equal(video.currentTime, 0.5);
        media.dispose();
        assert.equal(images[0]!.src, '');
        assert.equal(video.src, '');
      });
    } finally { URL.createObjectURL = oldCreate; }
  });

  it('keeps omitted video silent until enabled and keeps the duration of provided video', async () => {
    await environment(async ({ stage, video }) => {
      const warnings: string[] = [];
      const media = await createPreviewMedia({ ...request(stage, 'Video,500,"missing.mp4"'), videoEnabled: false,
        onWarning: message => warnings.push(message) });
      media.configure({ ...defaults, videoEnabled: false });
      media.sync(2000, true);
      assert.deepEqual(warnings, []);
      assert.equal(video.src, '');
      assert.equal(video.paused, true);
      media.configure(defaults);
      assert.deepEqual(warnings, ['当前谱面包未包含视频，请重新进入谱面确认后加载']);
      media.dispose();
      const provided = await createPreviewMedia({ ...request(stage, 'Video,500,"video.mp4"', new Map([['video.mp4', new Uint8Array([1])]])), videoEnabled: false });
      assert.equal(provided.range.endMs, 12500);
      provided.sync(2500, true);
      assert.equal(video.paused, true);
      provided.configure(defaults);
      assert.equal(video.currentTime, 2);
      assert.equal(video.paused, false);
      provided.dispose();
    });
  });

  it('reports declarations even when media is missing, including Sample-only storyboards', async () => {
    await environment(async ({ stage }) => {
      const media = await createPreviewMedia(request(stage, 'Video,500,"missing.mp4"\nSample,0,0,"missing.wav",100'));
      assert.deepEqual(media.capabilities, { storyboard: true, video: true });
      media.dispose();
      const plain = await createPreviewMedia(request(stage, '0,0,"missing.jpg",0,0'));
      assert.deepEqual(plain.capabilities, { storyboard: false, video: false });
      plain.dispose();
    });
  });

  it('dims all under-layers while preserving the overlay and restores a storyboard-owned background when disabled', async () => {
    await environment(async ({ stage, decoded }) => {
      const files = new Map([['bg.png', new Uint8Array([1])], ['over.png', new Uint8Array([2])]]);
      const media = await createPreviewMedia(request(stage, '0,0,"bg.png",0,0\nSprite,Background,Centre,"bg.png",320,240\n F,0,0,5000,1\nSprite,Overlay,Centre,"over.png",320,240\n F,0,0,5000,1', files));
      const ctx = new TestContext();
      media.drawUnder(ctx.asContext(), 1000);
      media.drawOver(ctx.asContext(), 1000);
      assert.deepEqual(ctx.calls.map(call => call.type), ['draw', 'fill', 'draw']);
      assert.equal(ctx.calls[1]!.fill, 'rgba(0,0,0,0.8)');
      assert.equal((ctx.calls[2]!.image as { id: number }).id, 2);
      media.configure({ ...defaults, storyboardEnabled: false, backgroundBrightness: 100 });
      ctx.calls = [];
      media.drawUnder(ctx.asContext(), 1500); media.drawOver(ctx.asContext(), 1500);
      assert.equal(ctx.calls.length, 1);
      assert.equal((ctx.calls[0]!.image as { id: number }).id, 1);
      media.configure({ ...defaults, backgroundBrightness: 100 });
      ctx.calls = [];
      media.drawUnder(ctx.asContext(), 6000); media.drawOver(ctx.asContext(), 6000);
      assert.equal(ctx.calls.length, 0, 'reenabling resumes current lifetime, not the start');
      assert.deepEqual(decoded.sort(), [1, 2]);
      media.dispose();
    });
  });

  it('pauses disabled video and restores the latest map position without loading resources again', async () => {
    await environment(async ({ stage, video, decoded }) => {
      const media = await createPreviewMedia(request(stage, 'Video,500,"video.mp4"', new Map([['video.mp4', new Uint8Array([1])]])));
      media.sync(2500, true, true); await Promise.resolve(); await Promise.resolve();
      assert.equal(video.currentTime, 2); assert.equal(video.paused, false);
      video.currentTime = 2.04;
      media.configure({ ...defaults, playbackSpeed: 1.75 });
      assert.equal(video.playbackRate, 1.75);
      assert.equal(video.currentTime, 2.04);
      media.configure({ ...defaults, videoEnabled: false });
      assert.equal(video.paused, true);
      media.sync(5500, true);
      assert.equal(video.currentTime, 2.04);
      media.configure(defaults); await Promise.resolve(); await Promise.resolve();
      assert.equal(video.currentTime, 5); assert.equal(video.paused, false);
      assert.equal(decoded.length, 0);
      media.sync(6500, false, true);
      media.configure({ ...defaults, videoEnabled: false }); media.configure(defaults);
      assert.equal(video.currentTime, 6); assert.equal(video.paused, true);
      media.dispose();
      assert.equal(video.src, ''); assert.equal(video.paused, true);
    });
  });
});
