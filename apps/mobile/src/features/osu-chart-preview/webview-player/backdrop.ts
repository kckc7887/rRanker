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
  stage: StageContext;
  files: PreviewResourceMap;
  osuBytes: Uint8Array;
  osuPath: string;
  signal: AbortSignal;
  dim?: number;
  storyboardEnabled?: boolean;
  videoEnabled?: boolean;
  onWarning(message: string): void;
};

function mimeFor(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo', flv: 'video/x-flv' } as Record<string, string>)[ext ?? ''] ?? 'application/octet-stream';
}

export async function createPreviewMedia(options: MediaOptions): Promise<PreviewMedia> {
  const { stage, files, osuBytes, osuPath, signal, onWarning } = options;
  const sources = listOsbSources(files, osuPath);
  const visuals = parseBeatmapVisuals(decodeOsuText(osuBytes), sources.map(s => s.text), {
    osuPath, osbPaths: sources.map(s => s.path), cancellation: { signal },
  });
  let objects: StoryboardObject[] = visuals.objects;
  let composite: StageTarget | null = null;
  let blurred: StageTarget | null = null;
  let videoVisible = false;
  let disposed = false;
  let lastMapTime = 0;
  let lastPlaying = false;
  let presentation: MediaPresentationOptions = {
    playbackSpeed: 1,
    backgroundBrightness: options.dim === undefined ? 20 : (1 - options.dim) * 100,
    backgroundBlur: 0, storyboardEnabled: options.storyboardEnabled ?? true, videoEnabled: options.videoEnabled ?? true,
  };
  let frameTime = NaN, generation = 0, compiledGeneration = -1;
  let under: ReturnType<typeof storyboardFrame> = [], over: ReturnType<typeof storyboardFrame> = [];
  let previousUnder: typeof under | undefined;
  let previousVideo = NaN, previousImages = NaN, previousBlur = NaN;
  let nextWarm = -Infinity;
  const ahead = new Set<string>();
  let range = storyboardTimeRange(objects, visuals.samples);
  const key = (file: string): string => normalizeArchivePath(file).toLowerCase();
  const fileIndex = new Map<string, PreviewResource>();
  for (const [path, resource] of files) if (!isOsbPath(path)) fileIndex.set(key(path), resource);
  const source = (resource: PreviewResource, file: string): string | Blob => resource instanceof Uint8Array
    ? new Blob([toArrayBuffer(resource)], { type: mimeFor(file) }) : resource.uri;
  const images = stage.createImages(path => {
    const resource = fileIndex.get(path);
    return resource && source(resource, path);
  }, path => onWarning(fileIndex.has(path) ? '部分图片无法读取，已保留其它谱面内容' : '部分图片缺失，已保留其它谱面内容'));
  const videoEntry = visuals.video && findArchiveResource(files, visuals.video.file);
  const video = videoEntry ? stage.createVideo({ onStatus: status => {
    if (status === 'error') onWarning('视频无法播放，已保留其它谱面内容');
  } }) : undefined;
  const invalidate = (): void => { previousUnder = undefined; stage.onInvalidate?.(); };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    video?.dispose();
    images.dispose();
    if (composite) stage.releaseTarget(composite);
    if (blurred) stage.releaseTarget(blurred);
    composite = blurred = null;
  };
  signal.addEventListener('abort', dispose, { once: true });
  try {
    signal.throwIfAborted();
    const layers = [...UNDER_LAYERS, ...OVER_LAYERS];
    const backgroundKey = visuals.background ? key(visuals.background) : '';
    function prepareFrame(time: number): void {
      if (time === frameTime && compiledGeneration === generation) return;
      const refreshAhead = time < frameTime || time >= nextWarm || compiledGeneration !== generation || !lastPlaying;
      frameTime = time; compiledGeneration = generation;
      under = presentation.storyboardEnabled ? storyboardFrame(objects, time, UNDER_LAYERS) : [];
      over = presentation.storyboardEnabled ? storyboardFrame(objects, time, OVER_LAYERS) : [];
      const visibleFiles = new Set([...under, ...over].map(sprite => key(sprite.state.file)));
      if (backgroundKey) visibleFiles.add(backgroundKey);
      if (refreshAhead) {
        ahead.clear();
        const window = 200 * presentation.playbackSpeed;
        nextWarm = time + window / 2;
        if (lastPlaying && presentation.storyboardEnabled && objects.length) {
          for (const file of storyboardFilesInRange(objects, time, time + window, layers)) ahead.add(key(file));
        }
      }
      images.prepare([...visibleFiles], [...ahead]);
    }
    prepareFrame(Math.min(0, range.startMs));
    await images.settled();
    signal.throwIfAborted();
    if (videoEntry && video && visuals.video) await video.setSource(source(videoEntry.resource, visuals.video.file));
    else if (visuals.video && presentation.videoEnabled) onWarning('视频无法播放，已保留其它谱面内容');
    signal.throwIfAborted();
    const updateRange = (): void => {
      range = storyboardTimeRange(objects, visuals.samples);
      if (video && visuals.video && Number.isFinite(video.duration)) {
        range = { startMs: Math.min(range.startMs, visuals.video.startMs), endMs: Math.max(range.endMs, visuals.video.startMs + video.duration * 1000) };
      }
    };
    updateRange();
    const replacesBackground = backgroundKey && objects.some(o => key(o.file) === backgroundKey);
    const lookup = (file: string): CanvasImageSource | undefined => images.get(key(file));
    const syncVideo = (mapTimeMs: number, playing: boolean, forceSeek = false): void => {
      videoVisible = video?.sync({
        time: (mapTimeMs - visuals.video!.startMs) / 1000,
        active: presentation.videoEnabled, playing, rate: presentation.playbackSpeed, seek: forceSeek,
      }) ?? false;
    };
    const drawBackground = (ctx: CanvasRenderingContext2D, timeMs: number): void => {
      const background = images.get(backgroundKey);
      if (videoVisible && video) drawCover(ctx, video.element);
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
        if (videoChanged && presentation.videoEnabled && visuals.video && !video) {
          onWarning(options.videoEnabled === false
            ? '当前谱面包未包含视频，请重新进入谱面确认后加载'
            : '视频无法播放，已保留其它谱面内容');
        }
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
          const videoFrame = videoVisible && video ? video.revision : -1;
          const changed = !previousUnder || previousUnder.length !== under.length ||
            under.some(({origin,state}, i) => {
              const old = previousUnder![i]!;
              if (origin !== old.origin) return true;
              for (const k in state) if (state[k as keyof typeof state] !== old.state[k as keyof typeof state]) return true;
              return false;
            });
          if (changed || previousVideo !== videoFrame || previousImages !== images.revision || radius !== previousBlur) {
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
            previousUnder = under; previousVideo = videoFrame; previousImages = images.revision; previousBlur = radius;
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
