import {
  assertChartPreviewGifFramePixels,
  assertChartPreviewTexturePixels,
  CHART_PREVIEW_MAX_TEXTURE_PIXELS,
} from '../../chart-preview-shared/chart-preview-resource-budget';
import type { StageContext, StageTarget } from '../../chart-preview-shared/webview-player/stage';
import { toArrayBuffer } from './bytes';
import { decodeOsuText, findArchiveResource, isOsbPath, listOsbSources, normalizeArchivePath, type PreviewResource, type PreviewResourceMap } from './osu-text';
import {
  OVER_LAYERS, UNDER_LAYERS, parseBeatmapVisuals, storyboardTimeRange,
  type BeatmapVisuals, type StoryboardObject,
} from './events';
import { compileStoryboardTriggers, type StoryboardHitSoundEvent } from './storyboard-triggers';
import { drawCover, drawStoryboardLayer, storyboardFrame, storyboardFilesInRange } from './storyboard';

export type MediaPresentationOptions = {
  playbackSpeed: number;
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
  storyboardEnabled?: boolean;
  onWarning(message: string): void;
  onInvalidate(): void;
};

function mimeFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', flv: 'video/x-flv' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}

function assertImagePixels(image: CanvasImageSource, file: string): void {
  const source = image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
  const width = Number(source.naturalWidth ?? source.width ?? 0);
  const height = Number(source.naturalHeight ?? source.height ?? 0);
  const pixels = width * height;
  if (file.toLowerCase().endsWith('.gif')) assertChartPreviewGifFramePixels(pixels);
  else assertChartPreviewTexturePixels(pixels);
}

async function loadImage(resource: PreviewResource, mime: string, file: string, signal: AbortSignal): Promise<{ image: CanvasImageSource; dispose(): void }> {
  if (resource instanceof Uint8Array && typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(new Blob([toArrayBuffer(resource)], { type: mime }));
    if (signal.aborted) { bitmap.close(); signal.throwIfAborted(); }
    try { assertImagePixels(bitmap, file); }
    catch (error) { bitmap.close(); throw error; }
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
    assertImagePixels(image, file);
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
  const visuals = parseBeatmapVisuals(decodeOsuText(osuBytes), sources.map(s => s.text), {
    osuPath, osbPaths: sources.map(s => s.path), cancellation: { signal },
  });
  let objects: StoryboardObject[] = visuals.objects;
  const images = new Map<string, Awaited<ReturnType<typeof loadImage>>>();
  const pending = new Map<string, Promise<void>>();
  const missing = new Set<string>();
  let visibleFiles = new Set<string>();
  let wanted = new Set<string>();
  let residentPixels = 0;
  let stage: StageContext | undefined;
  let composite: StageTarget | null = null;
  let blurred: StageTarget | null = null;
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
    playbackSpeed: 1,
    backgroundBrightness: options.dim === undefined ? 20 : (1 - options.dim) * 100,
    backgroundBlur: 0, storyboardEnabled: options.storyboardEnabled ?? true, videoEnabled: true,
  };
  let frameTime = NaN, generation = 0, compiledGeneration = -1;
  let under: ReturnType<typeof storyboardFrame> = [], over: ReturnType<typeof storyboardFrame> = [];
  let previousUnder: typeof under | undefined;
  let previousVideo = NaN, previousBlur = NaN;
  let nextWarm = -Infinity;
  const ahead = new Set<string>();
  let range = storyboardTimeRange(objects, visuals.samples);
  const key = (file: string): string => normalizeArchivePath(file).toLowerCase();
  const invalidate = (): void => { previousUnder = undefined; if (!disposed && !signal.aborted) onInvalidate(); };
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
    for (const asset of images.values()) asset.dispose();
    images.clear();
    if (stage && composite) stage.releaseTarget(composite);
    if (stage && blurred) stage.releaseTarget(blurred);
    composite = blurred = null;
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    signal.throwIfAborted();
    const layers = [...UNDER_LAYERS, ...OVER_LAYERS];
    const fileIndex = new Map<string, PreviewResource>();
    for (const [path, resource] of files) if (!isOsbPath(path)) fileIndex.set(key(path), resource);
    const backgroundKey = visuals.background ? key(visuals.background) : '';
    const pixelSize = (image: CanvasImageSource): number => {
      const item = image as { width: number; height: number };
      return item.width * item.height;
    };
    const trim = (): void => {
      if (residentPixels <= CHART_PREVIEW_MAX_TEXTURE_PIXELS) return;
      for (const keep of [wanted, visibleFiles]) {
        for (const [path, asset] of images) {
          if (residentPixels <= CHART_PREVIEW_MAX_TEXTURE_PIXELS) return;
          if (keep.has(path)) continue;
          residentPixels -= pixelSize(asset.image);
          stage?.releaseImage(asset.image);
          asset.dispose();
          images.delete(path);
          ahead.delete(path);
          wanted.delete(path);
        }
      }
    };
    const request = (path: string): Promise<void> | undefined => {
      if (images.has(path) || missing.has(path) || disposed) return;
      const existing = pending.get(path);
      if (existing) return existing;
      const resource = fileIndex.get(path);
      if (!resource) { missing.add(path); onWarning('部分图片缺失，已保留其它谱面内容'); return; }
      const promise = loadImage(resource, mimeFor(path), path, signal).then(asset => {
        if (disposed || signal.aborted) { asset.dispose(); return; }
        images.set(path, asset); residentPixels += pixelSize(asset.image); trim();
        if (visibleFiles.has(path)) { previousUnder = undefined; if (!lastPlaying) invalidate(); }
      }).catch(() => {
        if (!disposed && !signal.aborted) { missing.add(path); onWarning('部分图片无法读取，已保留其它谱面内容'); }
      }).finally(() => { pending.delete(path); pump(); });
      pending.set(path, promise);
      return promise;
    };
    function pump(): void {
      if (disposed || signal.aborted) return;
      for (const path of wanted) {
        if (pending.size >= 4) return;
        if (images.has(path) || missing.has(path) || pending.has(path)) continue;
        if (!visibleFiles.has(path) && (pending.size || residentPixels >= CHART_PREVIEW_MAX_TEXTURE_PIXELS)) return;
        void request(path);
      }
    }
    function prepareFrame(time: number): void {
      if (time === frameTime && compiledGeneration === generation) return;
      const refreshAhead = time < frameTime || time >= nextWarm || compiledGeneration !== generation || !lastPlaying;
      frameTime = time; compiledGeneration = generation;
      under = presentation.storyboardEnabled ? storyboardFrame(objects, time, UNDER_LAYERS) : [];
      over = presentation.storyboardEnabled ? storyboardFrame(objects, time, OVER_LAYERS) : [];
      visibleFiles = new Set([...under, ...over].map(sprite => key(sprite.state.file)));
      if (backgroundKey) visibleFiles.add(backgroundKey);
      wanted = new Set(visibleFiles);
      if (refreshAhead) {
        ahead.clear();
        const window = 200 * presentation.playbackSpeed;
        nextWarm = time + window / 2;
        if (lastPlaying && presentation.storyboardEnabled && objects.length) {
          for (const file of storyboardFilesInRange(objects, time, time + window, layers)) ahead.add(key(file));
        }
      }
      for (const file of ahead) wanted.add(file);
      pump(); trim();
    }
    prepareFrame(Math.min(0, range.startMs));
    while (pending.size) await Promise.all([...pending.values()]);
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
    const replacesBackground = backgroundKey && objects.some(o => key(o.file) === backgroundKey);
    const lookup = (file: string): CanvasImageSource | undefined => images.get(key(file))?.image;
    const syncVideo = (mapTimeMs: number, playing: boolean, forceSeek = false): void => {
      if (!video || !visuals.video || videoFailed || disposed) return;
      const target = (mapTimeMs - visuals.video.startMs) / 1000;
      video.playbackRate = presentation.playbackSpeed;
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
      const background = images.get(backgroundKey)?.image;
      if (presentation.videoEnabled && video && !videoFailed && videoInRange && video.readyState >= 2) drawCover(ctx, video);
      else if (background && (!presentation.storyboardEnabled || !replacesBackground)) {
        ctx.save();
        const offset = visuals.backgroundOffset;
        if (offset) ctx.translate(offset.x * 1.5, offset.y * 1.5);
        drawCover(ctx, background);
        ctx.restore();
      }
      if (presentation.storyboardEnabled) drawStoryboardLayer(ctx, objects, timeMs, UNDER_LAYERS, lookup, visuals.widescreen, under);
    };
    return {
      get range() { return range; }, visuals,
      capabilities: Object.freeze({ storyboard: visuals.objects.length > 0 || visuals.samples.length > 0, video: visuals.video !== null }),
      configure(next) {
        if (disposed) return;
        const finite = (value: number, max: number, fallback: number): number => Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
        const updated = {
          playbackSpeed: next.playbackSpeed,
          backgroundBrightness: finite(next.backgroundBrightness, 100, 20),
          backgroundBlur: finite(next.backgroundBlur, 20, 0),
          storyboardEnabled: next.storyboardEnabled, videoEnabled: next.videoEnabled,
        };
        if (updated.backgroundBrightness === presentation.backgroundBrightness && updated.backgroundBlur === presentation.backgroundBlur &&
            updated.storyboardEnabled === presentation.storyboardEnabled && updated.videoEnabled === presentation.videoEnabled &&
            updated.playbackSpeed === presentation.playbackSpeed) return;
        const videoChanged = updated.videoEnabled !== presentation.videoEnabled;
        const speedChanged = updated.playbackSpeed !== presentation.playbackSpeed;
        presentation = updated;
        generation++;
        if (videoChanged || speedChanged) syncVideo(lastMapTime, lastPlaying, videoChanged);
        invalidate();
      },
      bindTriggers(events) { objects = compileStoryboardTriggers(visuals.objects, events); generation++; previousUnder = undefined; updateRange(); },
      sync(mapTimeMs, playing, forceSeek = false) {
        lastMapTime = mapTimeMs; lastPlaying = playing;

        syncVideo(mapTimeMs, playing, forceSeek);
      },
      drawUnder(ctx, timeMs) {
        if (disposed) return;
        stage = ctx as StageContext;
        prepareFrame(timeMs);
        ctx.save();
        const radius = presentation.backgroundBlur;
        if (radius > 0) {
          const width = Math.max(1, Math.ceil(stage.canvas.width * stage.effectScale / 2));
          const height = Math.max(1, Math.ceil(stage.canvas.height * stage.effectScale / 2));
          if (!blurred || blurred.width !== width || blurred.height !== height) {
            if (blurred) stage.releaseTarget(blurred);
            if (composite) stage.releaseTarget(composite);
            blurred = stage.acquireTarget(width, height);
            composite = null;
            previousUnder = undefined;
          }
          const videoFrame = presentation.videoEnabled && videoInRange && video && !videoFailed
            ? (video.getVideoPlaybackQuality?.().totalVideoFrames ?? video.currentTime) : -1;
          const changed = !previousUnder || previousUnder.length !== under.length ||
            under.some(({origin,state}, i) => {
              const old = previousUnder![i]!;
              if (origin !== old.origin) return true;
              for (const k in state) if (state[k as keyof typeof state] !== old.state[k as keyof typeof state]) return true;
              return false;
            });
          if (changed || previousVideo !== videoFrame || radius !== previousBlur) {
            const owner = stage.currentTarget;
            composite ??= stage.acquireTarget(width, height);
            stage.bindTarget(composite);
            stage.save(); stage.setTransform(width/1280, 0, 0, height/720, 0, 0);
            stage.clearRect(0, 0, 1280, 720);
            drawBackground(stage, timeMs);
            stage.bindTarget(blurred); stage.clearRect(0, 0, 1280, 720);
            stage.filter = 'blur(' + (radius * width / stage.canvas.width) + 'px)';
            stage.drawTarget(composite, 0, 0, 1280, 720);
            stage.restore();
            stage.bindTarget(owner);
            previousUnder = under; previousVideo = videoFrame; previousBlur = radius;
            if (!under.length && videoFrame < 0) { stage.releaseTarget(composite); composite = null; }
          }
          stage.drawTarget(blurred, 0, 0, 1280, 720);
        } else {
          if (blurred) { stage.releaseTarget(blurred); blurred = null; }
          if (composite) { stage.releaseTarget(composite); composite = null; }
          drawBackground(ctx, timeMs);
        }
        const amount = 1 - presentation.backgroundBrightness / 100;
        if (amount) { ctx.fillStyle = `rgba(0,0,0,${amount})`; ctx.fillRect(0, 0, 1280, 720); }
        ctx.restore();
      },
      drawOver(ctx, timeMs) {
        if (!disposed && presentation.storyboardEnabled) prepareFrame(timeMs);
        if (!disposed && presentation.storyboardEnabled) drawStoryboardLayer(ctx, objects, timeMs, OVER_LAYERS, lookup, visuals.widescreen, over);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
