import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createPreviewMedia, type MediaPresentationOptions } from '../../src/features/osu-chart-preview/webview-player/backdrop';

type Draw = { type: string; image?: unknown; filter: string; fill?: string };
class TestContext {
  constructor(readonly canvas = { width: 1280, height: 720 }, private readonly filtersWork = true) {}
  filter = 'none'; fillStyle = ''; globalAlpha = 1;
  calls: Draw[] = [];
  stack: { filter: string; fillStyle: string }[] = [];
  save() { this.stack.push({ filter: this.filter, fillStyle: this.fillStyle }); }
  restore() { Object.assign(this, this.stack.pop()); }
  beginPath() {} rect() {} clip() {} translate() {} rotate() {} scale() {}
  clearRect() { this.calls.push({ type: 'clear', filter: this.filter }); }
  fillRect() { this.calls.push({ type: 'fill', filter: this.filter, fill: this.fillStyle }); }
  drawImage(image: unknown) { this.calls.push({ type: 'draw', image, filter: this.filter }); }
  getImageData(x: number) { return { data: new Uint8ClampedArray([0, 0, 0, this.filtersWork && this.filter.startsWith('blur(') ? x === 6 ? 20 : 40 : 0]) }; }
  asContext() { return this as unknown as CanvasRenderingContext2D; }
}
class TestCanvas {
  width = 0; height = 0; context: TestContext;
  constructor(filtersWork = true) { this.context = new TestContext(this, filtersWork); }
  getContext() { return this.context; }
}
class TestVideo extends EventTarget {
  muted = false; playsInline = false; preload = ''; src = '';
  readyState = 2; videoWidth = 4; videoHeight = 4; duration = 12;
  currentTime = 0; paused = true; seeking = false; plays = 0; pauses = 0;
  play() { this.paused = false; this.plays++; return Promise.resolve(); }
  pause() { this.paused = true; this.pauses++; }
  load() {} removeAttribute() { this.src = ''; }
}
const defaults: MediaPresentationOptions = { backgroundBrightness: 20, backgroundBlur: 0, storyboardEnabled: true, videoEnabled: true };

async function environment(run: (env: { canvases: TestCanvas[]; video: TestVideo; decoded: number[] }) => Promise<void>, filtersWork = true) {
  const oldDocument = globalThis.document, oldBitmap = globalThis.createImageBitmap;
  const canvases: TestCanvas[] = [], video = new TestVideo(), decoded: number[] = [];
  globalThis.document = { createElement(name: string) {
    if (name === 'video') return video;
    const canvas = new TestCanvas(filtersWork); canvases.push(canvas); return canvas;
  } } as unknown as Document;
  globalThis.createImageBitmap = (async (blob: Blob) => {
    const id = new Uint8Array(await blob.arrayBuffer())[0]!;
    decoded.push(id);
    return { id, width: 4, height: 4, close() {} } as unknown as ImageBitmap;
  }) as typeof createImageBitmap;
  try { await run({ canvases, video, decoded }); }
  finally { globalThis.document = oldDocument; globalThis.createImageBitmap = oldBitmap; }
}

function request(events: string, files = new Map<string, Uint8Array>()) {
  return { files, osuBytes: new TextEncoder().encode(`[General]\nWidescreenStoryboard:1\n[Events]\n${events}`),
    osuPath: 'map.osu', signal: new AbortController().signal, onWarning() {}, onInvalidate() {} };
}

describe('preview media presentation', () => {
  it('loads staged image and video URIs without copying media into Blob URLs', async () => {
    const oldImage = globalThis.Image;
    const oldCreate = URL.createObjectURL;
    const loadedImages: { src: string }[] = [];
    class LocalImage {
      width = 4; height = 4; naturalWidth = 4; naturalHeight = 4;
      onload: (() => void) | null = null; onerror: (() => void) | null = null;
      private location = '';
      constructor() { loadedImages.push(this); }
      get src() { return this.location; }
      set src(value: string) { this.location = value; queueMicrotask(() => this.onload?.()); }
      removeAttribute() { this.location = ''; }
    }
    globalThis.Image = LocalImage as unknown as typeof Image;
    URL.createObjectURL = () => { throw new Error('Unexpected media byte copy'); };
    try {
      await environment(async ({ video, decoded }) => {
        const files = new Map<string, Uint8Array | { uri: string }>([
          ['set/bg.png', { uri: 'file:///preview/image.png' }],
          ['set/movie.mp4', { uri: 'file:///preview/video.mp4' }],
        ]);
        const media = await createPreviewMedia({ ...request('0,0,"bg.png",0,0\nVideo,500,"movie.mp4"'), files, osuPath: 'set/map.osu' });
        assert.equal(loadedImages[0]!.src, 'file:///preview/image.png');
        assert.equal(video.src, 'file:///preview/video.mp4');
        assert.equal(video.muted, true);
        assert.equal(video.playsInline, true);
        assert.equal(decoded.length, 0);
        media.sync(1000, true, true);
        assert.equal(video.currentTime, 0.5);
        media.dispose();
        assert.equal(loadedImages[0]!.src, '');
        assert.equal(video.src, '');
      });
    } finally { globalThis.Image = oldImage; URL.createObjectURL = oldCreate; }
  });

  it('reports declarations even when media is missing, including Sample-only storyboards', async () => {
    await environment(async () => {
      const media = await createPreviewMedia(request('Video,500,"missing.mp4"\nSample,0,0,"missing.wav",100'));
      assert.deepEqual(media.capabilities, { storyboard: true, video: true });
      media.dispose();
      const plain = await createPreviewMedia(request('0,0,"missing.jpg",0,0'));
      assert.deepEqual(plain.capabilities, { storyboard: false, video: false });
      plain.dispose();
    });
  });

  it('dims all under-layers while preserving the overlay and restores a storyboard-owned background when disabled', async () => {
    await environment(async ({ decoded }) => {
      const files = new Map([['bg.png', new Uint8Array([1])], ['over.png', new Uint8Array([2])]]);
      const media = await createPreviewMedia(request('0,0,"bg.png",0,0\nSprite,Background,Centre,"bg.png",320,240\n F,0,0,5000,1\nSprite,Overlay,Centre,"over.png",320,240\n F,0,0,5000,1', files));
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
      const background = ctx.calls[0]!.image as TestCanvas;
      assert.equal((background.context.calls[0]!.image as { id: number }).id, 1);
      media.configure({ ...defaults, backgroundBrightness: 100 });
      ctx.calls = [];
      media.drawUnder(ctx.asContext(), 6000); media.drawOver(ctx.asContext(), 6000);
      assert.equal(ctx.calls.length, 0, 'reenabling resumes current lifetime, not the start');
      assert.deepEqual(decoded.sort(), [1, 2]);
      media.dispose();
    });
  });

  it('allocates the background composite only for blur, reuses one frame and never blurs Overlay', async () => {
    await environment(async ({ canvases }) => {
      const media = await createPreviewMedia(request('Sprite,Foreground,Centre,"sprite.png",320,240\n F,0,0,5000,1\nSprite,Overlay,Centre,"sprite.png",320,240\n F,0,0,5000,1', new Map([['sprite.png', new Uint8Array([3])]])));
      const ctx = new TestContext();
      media.drawUnder(ctx.asContext(), 1000);
      assert.equal(canvases.length, 0);
      media.configure({ ...defaults, backgroundBlur: 12, backgroundBrightness: 100 });
      media.drawUnder(ctx.asContext(), 1000); media.drawUnder(ctx.asContext(), 1000);
      assert.equal(canvases.length, 2);
      assert.equal(canvases[1]!.width, 0, 'the origin-clean capability probe releases its buffer');
      assert.equal(canvases[0]!.context.calls.filter(call => call.type === 'draw').length, 1);
      assert.equal(ctx.calls.at(-1)!.filter, 'blur(12px)');
      media.drawOver(ctx.asContext(), 1000);
      assert.equal(ctx.calls.at(-1)!.filter, 'none');
      media.drawUnder(ctx.asContext(), 1017);
      assert.equal(canvases[0]!.context.calls.filter(call => call.type === 'draw').length, 2);
      media.dispose();
      assert.equal(canvases[0]!.width, 0);
    });
  });

  it('uses reusable convolution surfaces when filter assignment succeeds without changing pixels', async () => {
    await environment(async ({ canvases }) => {
      const media = await createPreviewMedia(request('Sprite,Foreground,Centre,"sprite.png",320,240\n F,0,0,5000,1', new Map([['sprite.png', new Uint8Array([3])]])));
      const ctx = new TestContext();
      media.configure({ ...defaults, backgroundBlur: 12, backgroundBrightness: 100 });
      media.drawUnder(ctx.asContext(), 1000);
      assert.equal(canvases.length, 4);
      const [composite, probe, horizontal, result] = canvases;
      assert.equal(probe!.width, 0);
      assert.equal(horizontal!.width, 214);
      assert.equal(result!.height, 120);
      assert.equal(ctx.calls.at(-1)!.image, result);
      assert.equal(ctx.calls.at(-1)!.filter, 'none');
      const renders = result!.context.calls.length;
      media.drawUnder(ctx.asContext(), 1000);
      assert.equal(result!.context.calls.length, renders);
      media.configure({ ...defaults, backgroundBlur: 6, backgroundBrightness: 100 });
      media.drawUnder(ctx.asContext(), 1000);
      assert.equal(horizontal!.width, 427);
      assert.ok(result!.context.calls.length > renders);
      assert.equal(composite!.context.calls.filter(call => call.type === 'draw').length, 2);
      media.sync(1000, false, true);
      media.drawUnder(ctx.asContext(), 1000);
      assert.equal(composite!.context.calls.filter(call => call.type === 'draw').length, 3);
      media.dispose();
      assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
    }, false);
  });

  it('pauses disabled video and restores the latest map position without loading resources again', async () => {
    await environment(async ({ video, decoded }) => {
      const media = await createPreviewMedia(request('Video,500,"video.mp4"', new Map([['video.mp4', new Uint8Array([1])]])));
      media.sync(2500, true, true); await Promise.resolve(); await Promise.resolve();
      assert.equal(video.currentTime, 2); assert.equal(video.paused, false);
      media.configure({ ...defaults, videoEnabled: false });
      assert.equal(video.paused, true);
      media.sync(5500, true);
      assert.equal(video.currentTime, 2);
      media.configure(defaults); await Promise.resolve(); await Promise.resolve();
      assert.equal(video.currentTime, 5); assert.equal(video.paused, false);
      assert.equal(video.plays, 2); assert.equal(decoded.length, 0);
      media.sync(6500, false, true);
      media.configure({ ...defaults, videoEnabled: false }); media.configure(defaults);
      assert.equal(video.currentTime, 6); assert.equal(video.paused, true);
      media.dispose();
      assert.equal(video.src, ''); assert.equal(video.paused, true);
    });
  });
});
