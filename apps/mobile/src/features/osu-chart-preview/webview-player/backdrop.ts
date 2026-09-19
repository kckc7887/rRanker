import { loadItemsBounded } from './engine';
import { toArrayBuffer } from './bytes';
import { decodeOsuText, findArchiveResource, listOsbSources, type PreviewResource, type PreviewResourceMap } from './osu-text';
import {
  OVER_LAYERS, UNDER_LAYERS, parseBeatmapVisuals, referencedImageFiles, storyboardTimeRange,
  type BeatmapVisuals, type StoryboardObject,
} from './events';
import { compileStoryboardTriggers, type StoryboardHitSoundEvent } from './storyboard-triggers';
import { drawCover, drawStoryboardLayer, releaseStoryboardRenderResources } from './storyboard';

export type MediaPresentationOptions = {
  backgroundBrightness: number;
  backgroundBlur: number;
  storyboardEnabled: boolean;
  videoEnabled: boolean;
};

export type PreviewMedia = {
  readonly range: { startMs: number; endMs: number };
  readonly visuals: BeatmapVisuals;
  readonly capabilities: { storyboard: boolean; video: boolean };
  configure(options: MediaPresentationOptions): void;
  bindTriggers(events: readonly StoryboardHitSoundEvent[]): void;
  sync(mapTimeMs: number, playing: boolean, forceSeek?: boolean): void;
  drawUnder(ctx: CanvasRenderingContext2D, timeMs: number): void;
  drawOver(ctx: CanvasRenderingContext2D, timeMs: number): void;
  dispose(): void;
};

type MediaOptions = {
  files: PreviewResourceMap;
  osuBytes: Uint8Array;
  osuPath: string;
  signal: AbortSignal;
  dim?: number;
  onWarning(message: string): void;
  onInvalidate(): void;
};

function mimeFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', flv: 'video/x-flv' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}

async function loadImage(resource: PreviewResource, mime: string, signal: AbortSignal): Promise<{ image: CanvasImageSource; dispose(): void }> {
  if (resource instanceof Uint8Array && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(new Blob([toArrayBuffer(resource)], { type: mime }));
    if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
    return { image: bitmap, dispose: () => bitmap.close() };
  }
  const ownedUrl = resource instanceof Uint8Array ? URL.createObjectURL(new Blob([toArrayBuffer(resource)], { type: mime })) : null;
  const image = new Image();
  const dispose = (): void => { image.removeAttribute('src'); if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
  try {
    await new Promise<void>((resolve, reject) => {
      const clear = (): void => { clearTimeout(timer); image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); };
      const fail = (): void => { clear(); reject(new Error('Image unavailable')); };
      const abort = (): void => { clear(); reject(new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(fail, 8000);
      image.onload = () => { if (image.naturalWidth > 0) { clear(); resolve(); } else fail(); };
      image.onerror = fail;
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      else image.src = ownedUrl ?? (resource as { uri: string }).uri;
    });
    signal.throwIfAborted();
    return { image, dispose };
  } catch (error) { dispose(); throw error; }
}

function waitForVideo(video: HTMLVideoElement, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', ready);
      video.removeEventListener('error', failed);
      signal.removeEventListener('abort', failed);
      resolve(ok);
    };
    const ready = (): void => finish(video.readyState >= 2 && video.videoWidth > 0);
    const failed = (): void => finish(false);
    const timer = setTimeout(failed, 8000);
    video.addEventListener('loadeddata', ready);
    video.addEventListener('error', failed);
    signal.addEventListener('abort', failed, { once: true });
    if (signal.aborted) failed();
    else if (video.readyState >= 2) ready();
  });
}

export async function createPreviewMedia(options: MediaOptions): Promise<PreviewMedia> {
  const { files, osuBytes, osuPath, signal, onWarning, onInvalidate } = options;
  const sources = listOsbSources(files, osuPath);
  const visuals = parseBeatmapVisuals(decodeOsuText(osuBytes), sources.map(s => s.text), { osuPath, osbPaths: sources.map(s => s.path) });
  let objects: StoryboardObject[] = visuals.objects;
  const images = new Map<string, CanvasImageSource>();
  const imageDisposers = new Set<() => void>();
  let video: HTMLVideoElement | null = null;
  let videoUrl: string | null = null;
  let videoFailed = false;
  let videoInRange = false;
  let playPending = false;
  let desiredPlaying = false;
  let disposed = false;
  let lastMapTime = 0;
  let lastPlaying = false;
  let presentation: MediaPresentationOptions = {
    backgroundBrightness: options.dim === undefined ? 20 : (1 - options.dim) * 100,
    backgroundBlur: 0, storyboardEnabled: true, videoEnabled: true,
  };
  let backgroundSurface: HTMLCanvasElement | null = null;
  let compositeSurface: HTMLCanvasElement | null = null;
  let compositeContext: CanvasRenderingContext2D | null = null;
  let compositeTime = NaN;
  let range = storyboardTimeRange(objects, visuals.samples);
  const key = (file: string): string => file.replace(/\\/g, '/').toLowerCase();
  const invalidate = (): void => { compositeTime = NaN; if (!disposed && !signal.aborted) onInvalidate(); };
  const failVideo = (): void => {
    if (disposed || signal.aborted || videoFailed) return;
    videoFailed = true;
    video?.pause();
    onWarning('视频无法播放，已保留其它谱面内容');
    invalidate();
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    desiredPlaying = false;
    signal.removeEventListener('abort', dispose);
    if (video) {
      video.removeEventListener('seeked', invalidate);
      video.removeEventListener('error', failVideo);
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    imageDisposers.forEach(release => release());
    imageDisposers.clear();
    images.clear();
    if (backgroundSurface) backgroundSurface.width = backgroundSurface.height = 0;
    if (compositeSurface) compositeSurface.width = compositeSurface.height = 0;
    releaseStoryboardRenderResources();
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    signal.throwIfAborted();
    const imageFiles = [...new Set([...referencedImageFiles(objects), ...(visuals.background ? [visuals.background] : [])])];
    await loadItemsBounded({
      items: imageFiles, concurrency: 4, signal, failureMode: 'throw',
      load: async file => {
        const entry = findArchiveResource(files, file);
        if (!entry) { onWarning('部分图片缺失，已保留其它谱面内容'); return; }
        let loaded: Awaited<ReturnType<typeof loadImage>>;
        try { loaded = await loadImage(entry.resource, mimeFor(file), signal); }
        catch { if (!signal.aborted) onWarning('部分图片无法读取，已保留其它谱面内容'); return; }
        if (disposed || signal.aborted) loaded.dispose();
        else { images.set(key(file), loaded.image); imageDisposers.add(loaded.dispose); }
      },
    });
    signal.throwIfAborted();
    if (visuals.video) {
      const entry = findArchiveResource(files, visuals.video.file);
      if (entry) {
        const resource = entry.resource;
        videoUrl = resource instanceof Uint8Array ? URL.createObjectURL(new Blob([toArrayBuffer(resource)], { type: mimeFor(visuals.video.file) })) : null;
        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.src = videoUrl ?? (resource as { uri: string }).uri;
        video.load();
        if (!await waitForVideo(video, signal)) failVideo();
        else {
          video.addEventListener('seeked', invalidate);
          video.addEventListener('error', failVideo);
        }
      } else failVideo();
    }
    signal.throwIfAborted();
    const updateRange = (): void => {
      range = storyboardTimeRange(objects, visuals.samples);
      if (video && !videoFailed && visuals.video && Number.isFinite(video.duration)) {
        range = { startMs: Math.min(range.startMs, visuals.video.startMs), endMs: Math.max(range.endMs, visuals.video.startMs + video.duration * 1000) };
      }
    };
    updateRange();
    const background = visuals.background ? images.get(key(visuals.background)) : undefined;
    const backgroundEntry = visuals.background ? findArchiveResource(files, visuals.background) : undefined;
    const replacesBackground = backgroundEntry && objects.some(o => findArchiveResource(files, o.file)?.path === backgroundEntry.path);
    const lookup = (file: string): CanvasImageSource | undefined => images.get(key(file));
    const syncVideo = (mapTimeMs: number, playing: boolean, forceSeek = false): void => {
      if (!video || !visuals.video || videoFailed || disposed) return;
      const target = (mapTimeMs - visuals.video.startMs) / 1000;
      videoInRange = target >= 0 && target < video.duration;
      desiredPlaying = playing && videoInRange && presentation.videoEnabled;
      if (!videoInRange || !presentation.videoEnabled) { video.pause(); return; }
      const tolerance = playing && !forceSeek ? 0.15 : 0.012;
      if (Math.abs(video.currentTime - target) > tolerance && (!video.seeking || forceSeek)) video.currentTime = target;
      if (!playing) video.pause();
      else if (video.paused && !playPending) {
        playPending = true;
        void video.play().catch(error => {
          if (!desiredPlaying || disposed || signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
          failVideo();
        }).finally(() => { playPending = false; });
      }
    };
    const drawBackground = (ctx: CanvasRenderingContext2D, timeMs: number): void => {
      if (presentation.videoEnabled && video && !videoFailed && videoInRange && video.readyState >= 2) drawCover(ctx, video);
      else if (background && (!presentation.storyboardEnabled || !replacesBackground)) {
        if (!backgroundSurface) {
          backgroundSurface = document.createElement('canvas');
          backgroundSurface.width = 1280; backgroundSurface.height = 720;
          const surface = backgroundSurface.getContext('2d')!;
          const offset = visuals.backgroundOffset;
          if (offset) surface.translate(offset.x * 1.5, offset.y * 1.5);
          drawCover(surface, background);
        }
        ctx.drawImage(backgroundSurface, 0, 0);
      }
      if (presentation.storyboardEnabled) drawStoryboardLayer(ctx, objects, timeMs, UNDER_LAYERS, lookup, visuals.widescreen);
    };
    return {
      get range() { return range; }, visuals,
      capabilities: Object.freeze({ storyboard: visuals.objects.length > 0 || visuals.samples.length > 0, video: visuals.video !== null }),
      configure(next) {
        if (disposed) return;
        const finite = (value: number, max: number, fallback: number): number => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
        const updated = {
          backgroundBrightness: finite(next.backgroundBrightness, 100, 20),
          backgroundBlur: finite(next.backgroundBlur, 20, 0),
          storyboardEnabled: next.storyboardEnabled, videoEnabled: next.videoEnabled,
        };
        if (updated.backgroundBrightness === presentation.backgroundBrightness && updated.backgroundBlur === presentation.backgroundBlur &&
            updated.storyboardEnabled === presentation.storyboardEnabled && updated.videoEnabled === presentation.videoEnabled) return;
        const videoChanged = updated.videoEnabled !== presentation.videoEnabled;
        presentation = updated;
        if (videoChanged) syncVideo(lastMapTime, lastPlaying, true);
        invalidate();
      },
      bindTriggers(events) { objects = compileStoryboardTriggers(visuals.objects, events); compositeTime = NaN; updateRange(); },
      sync(mapTimeMs, playing, forceSeek = false) {
        lastMapTime = mapTimeMs; lastPlaying = playing;
        if (forceSeek) compositeTime = NaN;
        syncVideo(mapTimeMs, playing, forceSeek);
      },
      drawUnder(ctx, timeMs) {
        if (disposed) return;
        ctx.save();
        if (presentation.backgroundBlur > 0) {
          if (!compositeSurface) {
            // HTML Canvas supports the tested SVG colour matrix path; OffscreenCanvas does not.
            compositeSurface = document.createElement('canvas');
            compositeSurface.width = 1280; compositeSurface.height = 720;
            compositeContext = compositeSurface.getContext('2d')!;
          }
          if (compositeTime !== timeMs) {
            compositeContext!.clearRect(0, 0, 1280, 720);
            drawBackground(compositeContext!, timeMs);
            compositeTime = timeMs;
          }
          ctx.filter = `blur(${presentation.backgroundBlur}px)`;
          ctx.drawImage(compositeSurface, 0, 0);
          ctx.filter = 'none';
        } else {
          drawBackground(ctx, timeMs);
        }
        const amount = 1 - presentation.backgroundBrightness / 100;
        if (amount) { ctx.fillStyle = `rgba(0,0,0,${amount})`; ctx.fillRect(0, 0, 1280, 720); }
        ctx.restore();
      },
      drawOver(ctx, timeMs) {
        if (!disposed && presentation.storyboardEnabled) drawStoryboardLayer(ctx, objects, timeMs, OVER_LAYERS, lookup, visuals.widescreen);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
