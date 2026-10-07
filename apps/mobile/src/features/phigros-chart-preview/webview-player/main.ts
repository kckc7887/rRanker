import { renderPreviewHeading } from '../../chart-preview-shared/webview-player/heading';
import { bindPlaybackLoop } from '../../chart-preview-shared/webview-player/playback-loop';
import { bindFullscreenControls } from '../../chart-preview-shared/webview-player/fullscreen-controls';
import { assertChartPreviewGifFrameCount, assertChartPreviewGifFramePixels, assertChartPreviewTexturePixels, ChartPreviewBudgetExceededError, pauseChartPreviewParse } from '../../chart-preview-shared/chart-preview-resource-budget';
import { PlayerEventScope } from '../../chart-preview-shared/webview-player/event-scope';
import { installPreviewControls, setPreviewFullscreen } from '../../chart-preview-shared/webview-player/controls';
import { bindHeatTimelineKeyboard } from '../../chart-preview-shared/webview-player/heat-timeline';
import { upperBoundBy } from '../../chart-preview-shared/webview-player/sorted-search';
import { closeActiveWheelPopup, setupWheelPopup as setupSharedWheelPopup, type WheelControl } from '../../chart-preview-shared/webview-player/wheel';
/**
 * 许可证：谱面解析与渲染部分语义衍生自 TeamFlos/phira（GPL-3.0，https://github.com/TeamFlos/phira），
 * 相应部分按 GPL-3.0 随本项目（AGPL-3.0）一并发布，两者兼容；来源与许可证全文见仓库根 THIRD_PARTY_NOTICES.md。
 */

import { PgrRenderer, type LineColorKey, type NoteAssets } from './renderer';
import { parsePgrChart, type PgrChart } from './pgr-core';
import { RpeRenderer, type RpeAttachUiTransform, type RpeChartAssets } from './rpe-renderer';
import { buildGifAnim, parseRpeChart, type RpeChart, type RpeGifKeyframe } from './rpe-core';
import { RPE_PRESET_SHADERS } from './rpe-preset-shaders';
import { buildHitSoundEvents } from './hit-sound';
import { PhigrosPlaybackSession, type PhigrosPlaybackSettings } from './playback';
import { PhigrosTimelineView } from './timelineView';
import { rpeResourceUrl } from '../../../domain/rpe-resource-path';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';
import { applyChartPreviewHostCommand } from '../../chart-preview-shared/chart-preview-bridge';

declare global {
  interface Window {
    __PHIGROS_CHART_PREVIEW__?: PhigrosChartPreviewConfig;
    __PHIGROS_MUSIC_DATA__?: string | null;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export type PhigrosChartPreviewSettings = import('../../chart-preview-shared/pgr-preview-config').PgrPreviewSettings;
export type PhigrosChartPreviewConfig = import('../../chart-preview-shared/pgr-preview-config').PgrPreviewConfig;

const DEFAULT_SETTINGS: Required<PhigrosChartPreviewSettings> = Object.freeze({
  playbackSpeed: 1,
  noteScale: 1,
  volume: 1,
  backgroundDim: 0.55,
  multiHint: true,
  showBlockArea: true,
  showBlockAreaBounds: false,
  lineColor: 'white',
  hitSoundVolume: 1,
  aspectRatio: null,
  flipX: false,
  effects: true,
});

const SKIN_BASE = './skin/';
const LINE_COLORS: readonly string[] = ['white', 'gold', 'blue'];
const LINE_COLOR_LABELS: readonly string[] = ['白色', '金色', '蓝色'];
const STEP_SECONDS = 5;

function postStatus(type: string, payload: Record<string, unknown> = {}): void {
  if (disposed) return;
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...payload }));
}

function $<T extends Element = HTMLElement>(id: string): T {
  const el = document.querySelector<T>(`#${id}`);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function bounded(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function loadSettings(raw: PhigrosChartPreviewSettings | null | undefined): Required<PhigrosChartPreviewSettings> {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    playbackSpeed: bounded(source.playbackSpeed, 0.5, 2, DEFAULT_SETTINGS.playbackSpeed),
    noteScale: bounded(source.noteScale, 0.6, 1.8, DEFAULT_SETTINGS.noteScale),
    volume: bounded(source.volume, 0, 1, DEFAULT_SETTINGS.volume),
    backgroundDim: bounded(source.backgroundDim, 0.2, 0.85, DEFAULT_SETTINGS.backgroundDim),
    multiHint: typeof source.multiHint === 'boolean' ? source.multiHint : DEFAULT_SETTINGS.multiHint,
    showBlockArea: typeof source.showBlockArea === 'boolean' ? source.showBlockArea : DEFAULT_SETTINGS.showBlockArea,
    showBlockAreaBounds: typeof source.showBlockAreaBounds === 'boolean' ? source.showBlockAreaBounds : DEFAULT_SETTINGS.showBlockAreaBounds,
    lineColor: LINE_COLORS.includes(source.lineColor ?? '') ? source.lineColor! : DEFAULT_SETTINGS.lineColor,
    hitSoundVolume: bounded(source.hitSoundVolume, 0, 1, DEFAULT_SETTINGS.hitSoundVolume),
    aspectRatio: typeof source.aspectRatio === 'number' && Number.isFinite(source.aspectRatio) ? source.aspectRatio : null,
    flipX: typeof source.flipX === 'boolean' ? source.flipX : DEFAULT_SETTINGS.flipX,
    effects: typeof source.effects === 'boolean' ? source.effects : DEFAULT_SETTINGS.effects,
  };
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

function decodeBase64DataUrl(url: string): ArrayBuffer {
  const separator = url.indexOf(',');
  const base64 = separator >= 0 ? url.slice(separator + 1) : url;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function loadImage(url: string, signal: AbortSignal, textureSafe = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted || disposed) { reject(new DOMException('已取消', 'AbortError')); return; }
    const image = new Image();
    /** GPU 场景纹理要求源画布可读取。 */
    if (textureSafe && /^https?:/i.test(url)) image.crossOrigin = 'anonymous';
    const cleanup = () => { signal.removeEventListener('abort', onAbort); image.onload = null; image.onerror = null; };
    const onAbort = () => { cleanup(); image.src = ''; reject(new DOMException('已取消', 'AbortError')); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('曲绘加载失败')); };
    signal.addEventListener('abort', onAbort, { once: true });
    image.src = url;
  });
}

let disposed = false;
const events = new PlayerEventScope(() => disposed);

function start(): void {
  const elements = {
    stage: $('stage'),
    canvas: $('chart-canvas') as HTMLCanvasElement,
    play: $('play-button') as HTMLButtonElement,
    playIcon: $<SVGElement>('play-icon'),
    btnRestart: $('btn-restart') as HTMLButtonElement,
    btnStepBack: $('btn-step-back') as HTMLButtonElement,
    btnStepForward: $('btn-step-forward') as HTMLButtonElement,
    fullscreen: $('btn-fullscreen') as HTMLButtonElement,
    timelineHost: $('timeline-host'),
    timelineBars: $('timeline-bars'),
    timelineRuler: $('timeline-ruler'),
    timelinePlayhead: $('timeline-playhead'),
    timelineBadge: $('timeline-badge'),
    timeLabel: $('time-label'),
    multiHint: $('multi-hint') as HTMLButtonElement,
    blockArea: $('show-block-area') as HTMLButtonElement,
    blockAreaBounds: $('show-block-area-bounds') as HTMLButtonElement,
    gameProgress: $('game-progress-fill'),
    progressBar: document.querySelector('.game-progress') as HTMLElement,
    scoreBlock: document.querySelector('.score-block') as HTMLElement,
    score: $('score-display'),
    comboBlock: $('combo-block'),
    combo: $('combo-display'),
    pauseNode: $('hud-pause'),
    nameNode: $('hud-name'),
    levelNode: $('hud-level'),
    controls: $('controls'),
    fsLock: $('fs-lock') as HTMLButtonElement,
    title: $('title'),
    status: $('status'),
  };

  const config: Partial<PhigrosChartPreviewConfig> = window.__PHIGROS_CHART_PREVIEW__ ?? {};
  events.own(installPreviewControls({ sections: ['播放设置', '辅助选项'] }));
  const isRpe = config.format === 'rpe';
  elements.blockArea.hidden = isRpe;
  elements.blockAreaBounds.hidden = isRpe;
  type PreviewRenderer = PgrRenderer | RpeRenderer;
  const renderer: PreviewRenderer = isRpe ? new RpeRenderer(elements.canvas) : new PgrRenderer(elements.canvas);
  events.own(() => renderer.dispose());
  let settings = loadSettings(config.settings);
  const playbackSettings: PhigrosPlaybackSettings = settings;
  const session = new PhigrosPlaybackSession({
    settings: playbackSettings,
    hitSounds: config.hitSounds,
    host: {
      render: (chartTime) => renderFrame(chartTime),
      onPlayStateChange: () => syncPlayButtons(),
      onPlaybackError: () => setStatus('无法播放音乐，请重试。'),
    },
  });
  let loadController: AbortController | null = null;
  let ready = false;
  let isFullscreen = false;
  let timelineDragging = false;
  let wasPlayingBeforeDrag = false;
  let completionTimes: number[] = [];
  let timelineNotes: { time: number; kind: string }[] = [];
  let controlsVisible = true;
  let fsLocked = false;
  const wheels: WheelControl[] = [];

  function setupWheelPopup(
    trigger: HTMLElement, popup: HTMLElement, viewport: HTMLElement, list: HTMLElement,
    valSpan: HTMLElement, onPreview: (value: number) => void, min: number, max: number,
    step: number, initial: number, labels?: readonly string[],
    format: (value: number) => string = value => value.toFixed(2),
  ): void {
    const wheel = setupSharedWheelPopup(trigger, popup, viewport, list, valSpan,
      value => { onPreview(value); postStatus('settings', { settings: { ...settings }, committed: false }); },
      persistSettings, min, max, step, initial, labels, format);
    wheels.push(wheel);
    events.own(wheel.dispose);
  }
  function flushSettings(): void { for (const wheel of wheels) wheel.flush(); }

  function rpeTextureNames(chart: RpeChart): Set<string> {
    const textureNames = new Set<string>();
    for (const line of chart.lines) {
      if (line.texture !== 'line.png' && line.gifEvents.length === 0) textureNames.add(line.texture);
    }

    for (const effect of chart.extras.effects) {
      for (const value of Object.values(effect.vars)) {
        if (typeof value === 'string') textureNames.add(value);
      }
    }
    return textureNames;
  }

  async function loadRpeChartAssets(chart: RpeChart, signal: AbortSignal): Promise<RpeChartAssets> {
    const basePath = config.rpeAssets?.basePath ?? '';
    const textures = new Map<string, HTMLImageElement>();
    const videos = new Map<string, HTMLVideoElement>();
    const gifs = new Map<string, { frames: ImageBitmap[]; durationsMs: number[]; cumulativeMs: number[]; totalMs: number }>();
    const gifAnims = new Map<number, RpeGifKeyframe[]>();
    let gifPixels = 0;
    events.own(() => {
      for (const video of videos.values()) { video.pause(); video.removeAttribute('src'); video.load(); }
      for (const gif of gifs.values()) for (const frame of gif.frames) frame.close();
      videos.clear(); gifs.clear(); textures.clear(); gifAnims.clear();
    });
    const jobs: Promise<unknown>[] = [];
    const textureNames = rpeTextureNames(chart);
    for (const name of textureNames) {
      const url = rpeResourceUrl(basePath, name);
      if (!url) continue;
      jobs.push(loadImage(url, signal)
        .then((image) => textures.set(name, image))
        .catch((error) => console.warn(`判定线贴图加载失败 ${name}:`, error)));
    }
    async function decodeGifFrames(textureName: string) {
      const imageDecoderCtor = globalThis.ImageDecoder;
      if (!imageDecoderCtor) throw new Error('浏览器不支持 ImageDecoder');
      const textureUrl = rpeResourceUrl(basePath, textureName);
      if (!textureUrl) throw new Error('gif 路径无效');
      const response = await fetch(textureUrl, { signal });
      if (!response.ok) throw new Error(`gif 请求失败：HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const lower = textureName.toLowerCase();
      const mimeType = lower.endsWith('.apng') ? 'image/apng' : 'image/gif';
      const decoder = new imageDecoderCtor({ data: bytes, type: mimeType });
      const frames: ImageBitmap[] = [];
      const durationsMs: number[] = [];
      try {
        await decoder.tracks.ready;
        if (signal.aborted || disposed) throw new DOMException('预览已释放', 'AbortError');
        const track = decoder.tracks.selectedTrack;
        if (!track) throw new Error('GIF 没有可用图像轨道');
        assertChartPreviewGifFrameCount(track.frameCount);
        for (let index = 0; index < track.frameCount; index += 1) {
          if (signal.aborted || disposed) throw new DOMException('预览已释放', 'AbortError');
          await pauseChartPreviewParse(index, { signal });
          const { image } = await decoder.decode({ frameIndex: index });
          try {
            assertChartPreviewGifFramePixels(image.displayWidth * image.displayHeight);
            assertChartPreviewTexturePixels(gifPixels + image.displayWidth * image.displayHeight);
            const bitmap = await createImageBitmap(image);
            if (signal.aborted || disposed) { bitmap.close(); throw new DOMException('预览已释放', 'AbortError'); }
            try { assertChartPreviewTexturePixels(gifPixels + bitmap.width * bitmap.height); }
            catch (error) { bitmap.close(); throw error; }
            gifPixels += bitmap.width * bitmap.height;
            frames.push(bitmap);
            durationsMs.push((image.duration ?? 100_000) / 1000);
          } finally { image.close(); }
        }
      } catch (error) {
        gifPixels -= frames.reduce((sum, frame) => sum + frame.width * frame.height, 0);
        frames.forEach(frame => frame.close());
        throw error;
      } finally {
        decoder.close();
      }
      const cumulativeMs: number[] = [];
      let totalMs = 0;
      for (const duration of durationsMs) {
        totalMs += duration;
        cumulativeMs.push(totalMs);
      }
      if (signal.aborted || disposed) { frames.forEach(frame => frame.close()); throw new DOMException('预览已释放', 'AbortError'); }
      return { frames, durationsMs, cumulativeMs, totalMs };
    }

    const gifTextures = new Set<string>();
    /** iOS 缺少 ImageDecoder 时使用静态贴图。 */
    for (const line of chart.lines) {
      if (line.gifEvents.length === 0 || gifTextures.has(line.texture)) continue;
      gifTextures.add(line.texture);
      jobs.push((async () => {
        try {
          const frames = await decodeGifFrames(line.texture);
          gifs.set(line.texture, frames);
        } catch (error) {
          if (signal.aborted || disposed || error instanceof ChartPreviewBudgetExceededError) throw error;
          console.warn(`gif 判定线解码失败 ${line.texture}（降级为静态贴图）:`, error);
          try {
            const fallbackUrl = rpeResourceUrl(basePath, line.texture);
            if (!fallbackUrl) throw new Error('gif 路径无效');
            const image = await loadImage(fallbackUrl, signal);
            textures.set(line.texture, image);
          } catch {

          }
        }
      })());
    }
    for (const video of chart.extras.videos) {
      jobs.push(new Promise<void>((resolve, reject) => {
        const videoUrl = rpeResourceUrl(basePath, video.path);
        if (!videoUrl) { resolve(); return; }
        const element = document.createElement('video');
        element.muted = true;
        element.preload = 'auto';
        element.playsInline = true;
        element.src = videoUrl;
        const done = () => {
          element.removeEventListener('loadedmetadata', done);
          element.removeEventListener('error', done);
          signal.removeEventListener('abort', cancel);
          resolve();
        };
        const cancel = () => {
          element.removeEventListener('loadedmetadata', done); element.removeEventListener('error', done);
          element.pause(); element.removeAttribute('src'); element.load();
          signal.removeEventListener('abort', cancel); reject(new DOMException('预览已释放', 'AbortError'));
        };
        element.addEventListener('loadedmetadata', done, { once: true });
        element.addEventListener('error', done, { once: true });
        signal.addEventListener('abort', cancel, { once: true });
        events.own(cancel);
        element.load();
        videos.set(video.path, element);
      }));
    }
    await Promise.all(jobs);
    for (const line of chart.lines) {
      const gif = gifs.get(line.texture);
      if (gif) gifAnims.set(line.lineIndex, buildGifAnim(line.gifEvents, gif.totalMs, chart.bpmList));
    }

    const shaders = new Map<string, string>();
    const injectedShaders = config.rpeAssets?.shaders ?? {};
    for (const effect of chart.extras.effects) {
      if (shaders.has(effect.shader)) continue;
      const source = injectedShaders[effect.shader];
      if (typeof source === 'string') shaders.set(effect.shader, source);
    }

    for (const [name, source] of Object.entries(RPE_PRESET_SHADERS)) {
      if (!shaders.has(name)) shaders.set(name, source);
    }
    return { textures, videos, shaders, gifs, gifAnims };
  }

  const ATTACH_UI_ELEMENTS: Readonly<Record<number, { element: () => HTMLElement; always: boolean }>> = Object.freeze({
    1: { element: () => elements.pauseNode, always: false },
    2: { element: () => elements.combo, always: true },
    3: { element: () => elements.comboBlock, always: true },
    4: { element: () => elements.scoreBlock, always: true },
    5: { element: () => elements.progressBar, always: true },
    6: { element: () => elements.nameNode, always: false },
    7: { element: () => elements.levelNode, always: false },
  });

  function applyAttachUi(attach: Partial<Record<number, RpeAttachUiTransform>>): void {
    for (const [key, { element: getElement, always }] of Object.entries(ATTACH_UI_ELEMENTS)) {
      const element = getElement();
      const transform = attach[Number(key)];
      if (!transform) {
        element.hidden = !always;
        element.style.left = '';
        element.style.top = '';
        element.style.right = '';
        element.style.transform = '';
        element.style.opacity = '';
        element.style.color = '';
        continue;
      }
      element.hidden = false;
      element.style.right = '';
      element.style.left = `${transform.x}px`;
      element.style.top = `${transform.y}px`;
      element.style.transform = `translate(-50%, -50%) rotate(${transform.rot}rad) scale(${transform.scaleX}, ${transform.scaleY})`;
      element.style.opacity = String(Math.max(0, Math.min(1, transform.alpha)));
      element.style.color = transform.color ? `rgb(${transform.color[0]},${transform.color[1]},${transform.color[2]})` : '';
    }
  }

  function applyAttachUiFromRenderer(): void {
    if (isRpe) applyAttachUi((renderer as RpeRenderer).attachUi);
  }

  renderPreviewHeading(config.title || '谱面确认', config.previewDifficulty);
  elements.status.textContent = config.sourceLabel ?? '';

  function setStatus(text: string): void {
    if (disposed) return;
    elements.status.textContent = text;
  }

  function setLoadProgress(text: string, value: number): void {
    setStatus(text);
    postStatus('progress', { label: text, value });
  }

  function setControlsEnabled(value: boolean): void {
    if (disposed) return;
    elements.play.disabled = !value;
    elements.btnRestart.disabled = !value;
    elements.btnStepBack.disabled = !value;
    elements.btnStepForward.disabled = !value;
    elements.fullscreen.disabled = !value;
    elements.multiHint.disabled = !value;
    for (const button of elements.controls.querySelectorAll<HTMLButtonElement>('.loop-btn')) button.disabled = !value;
    for (const id of ['speed-trigger', 'note-size-trigger', 'volume-trigger', 'dim-trigger', 'hit-sound-volume-trigger', 'line-color-trigger']) {
      ($(id) as HTMLButtonElement).disabled = !value;
    }
  }

  /** iOS file:// 下从注入的 base64 解码音乐。 */
  async function loadPreviewMusic(signal: AbortSignal): Promise<void> {
    try {
      let bytes: ArrayBuffer;
      if (typeof window.__PHIGROS_MUSIC_DATA__ === 'string' && window.__PHIGROS_MUSIC_DATA__.length > 0) {
        bytes = decodeBase64DataUrl(window.__PHIGROS_MUSIC_DATA__);
      } else if (typeof config.musicUrl === 'string' && config.musicUrl.trim() !== '') {
        const response = await fetch(config.musicUrl, { signal });
        if (!response.ok) throw new Error(`谱面音乐不可用（HTTP ${response.status}）`);
        bytes = await response.arrayBuffer();
      } else {
        throw new Error('未提供谱面音乐资源');
      }
      if (!(await session.loadMusic(bytes))) setStatus('谱面音乐不可用，仍可静音看谱。');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      setStatus('谱面音乐不可用，仍可静音看谱。');
    }
  }

  function applySettings(): void {
    elements.multiHint.setAttribute('aria-pressed', String(settings.multiHint));
    elements.blockArea.setAttribute('aria-pressed', String(settings.showBlockArea));
    elements.blockAreaBounds.setAttribute('aria-pressed', String(settings.showBlockAreaBounds));
    session.applyAudioSettings();
    renderer.setSettings({ ...settings, lineColor: settings.lineColor as LineColorKey });
  }

  function persistSettings(): void {
    postStatus('settings', { settings: { ...settings } });
  }

  async function loadNoteAssets(signal: AbortSignal): Promise<NoteAssets> {
    const entries = await Promise.all(([
      ['normal', 'tap', 'Tap2.png'], ['normal', 'drag', 'Drag.png'], ['normal', 'flick', 'Flick2.png'], ['normal', 'hold', 'Hold2.png'],
      ['multi', 'tap', 'Tap2HL.png'], ['multi', 'drag', 'DragHL.png'], ['multi', 'flick', 'Flick2HL.png'], ['multi', 'hold', 'Hold2HL.png'],
      ['shared', 'fx', 'hit.png'],
    ] as const).map(async ([group, kind, file]) => [group, kind, await loadImage(`${SKIN_BASE}${file}`, signal)] as const));
    return entries.reduce<NoteAssets>((assets, [group, kind, image]) => {
      if (group === 'shared') assets.fx = image;
      else if (kind !== 'fx') assets[group][kind] = image;
      return assets;
    }, { normal: {} as NoteAssets['normal'], multi: {} as NoteAssets['multi'], fx: null as unknown as HTMLImageElement });
  }

  function loadChartText(signal: AbortSignal): Promise<string> {
    if (typeof config.chartText === 'string' && config.chartText.length > 0) {
      return Promise.resolve(config.chartText);
    }
    if (typeof config.chartUrl !== 'string' || config.chartUrl.trim() === '') {
      return Promise.reject(new Error('未提供谱面资源'));
    }
    return fetch(config.chartUrl, { signal, headers: { Accept: 'application/json' } })
      .then((response) => {
        if (!response.ok) throw new Error(`谱面请求失败：HTTP ${response.status}`);
        return response.text();
      });
  }

  const timelineView = new PhigrosTimelineView({
    host: elements.timelineHost,
    bars: elements.timelineBars,
    ruler: elements.timelineRuler,
    playhead: elements.timelinePlayhead,
    badge: elements.timelineBadge,
    formatTime,
  });

  bindPlaybackLoop(events, {
    loop: session.loop, position: () => session.chartTime,
    percent: position => session.chartDuration > 0 ? position / session.chartDuration * 100 : 0,
    format: position => position.toFixed(2) + 's',
    update: (a, b) => timelineView.updateLoop(a, b),
  });

  function buildTimeline(): void {
    if (disposed) return;
    timelineView.build(session.chartDuration, timelineNotes);
  }

  function seekFromTimelineEvent(event: PointerEvent): void {
    const rect = elements.timelineHost.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    seekToChartTime((pct / 100) * session.chartDuration);
  }

  function renderHud(chartTime: number): void {
    const passed = upperBoundBy(completionTimes, chartTime, (time) => time);
    const total = Math.max(1, completionTimes.length);
    elements.gameProgress.style.width = `${Math.min(100, chartTime / Math.max(1, session.chartDuration) * 100)}%`;
    elements.score.textContent = String(Math.floor(passed / total * 1_000_000)).padStart(7, '0');
    elements.combo.textContent = String(passed);
    elements.comboBlock.classList.toggle('is-visible', passed >= 3);
    elements.timeLabel.textContent = `${formatTime(chartTime)} / ${formatTime(session.chartDuration)}`;
    timelineView.updatePlayhead(chartTime, session.chartDuration);
  }

  function renderFrame(chartTime: number): void {
    if (disposed) return;
    try {
      renderer.render(chartTime);
      applyAttachUiFromRenderer();
      renderHud(chartTime);
    } catch {
      setStatus('谱面画面不可用，请重新加载。');
      postStatus('error', { message: '谱面画面不可用，请重新加载。' });
      disposePlayer();
    }
  }

  async function loadOptionalIllustration(signal: AbortSignal, textureSafe = false): Promise<HTMLImageElement | null> {
    if (typeof config.illustrationUrl !== 'string' || config.illustrationUrl.trim() === '') return null;
    try { return await loadImage(config.illustrationUrl, signal, textureSafe); }
    catch (error) { if (signal.aborted) throw error; return null; }
  }

  async function previewBackground(chart: PgrChart | RpeChart, image: HTMLImageElement | null, signal: AbortSignal) {
    if (!isRpe) {
      return (chart as PgrChart).blocks.length && /^https?:/i.test(config.illustrationUrl ?? '')
        ? loadOptionalIllustration(signal, true) : image;
    }
    const background = (chart as RpeChart).background;
    if (!background) return image;
    const url = rpeResourceUrl(config.rpeAssets?.basePath ?? '', background);
    if (!url) return image;
    try { return await loadImage(url, signal); }
    catch (error) { if (signal.aborted) throw error; return image; }
  }

  async function loadPreview(): Promise<void> {
    loadController?.abort();
    loadController = new AbortController();
    const { signal } = loadController;
    ready = false;
    session.pause();
    setControlsEnabled(false);
    try {
      setLoadProgress('正在读取谱面资源…', 0.2);
      const [chartText, image] = await Promise.all([
        loadChartText(signal),
        loadOptionalIllustration(signal),
      ]);
      if (signal.aborted) return;
      setLoadProgress('正在解析谱面…', 0.45);
      const chart: PgrChart | RpeChart = await new Promise((resolve, reject) => {

        const parseTimer = window.setTimeout(() => {
          signal.removeEventListener('abort', cancelParse);
          if (signal.aborted || disposed) { reject(new DOMException('预览已释放', 'AbortError')); return; }
          try {
            resolve(isRpe
              ? parseRpeChart(chartText, { extraJson: config.rpeAssets?.extraJson ?? null, infoYml: config.rpeAssets?.infoYml ?? null })
              : parsePgrChart(chartText));
          } catch (error) { reject(error); }
        }, 0);
        const cancelParse = () => { signal.removeEventListener('abort', cancelParse); window.clearTimeout(parseTimer); reject(new DOMException('预览已释放', 'AbortError')); };
        signal.addEventListener('abort', cancelParse, { once: true });
      });
      if (signal.aborted) return;
      setLoadProgress('正在准备音乐与曲绘…', 0.7);
      const rpeChart = isRpe ? (chart as RpeChart) : null;
      const [noteAssets, chartAssets] = await Promise.all([
        loadNoteAssets(signal),
        rpeChart ? loadRpeChartAssets(rpeChart, signal) : Promise.resolve(null),
        loadPreviewMusic(signal),
      ]);
      if (signal.aborted) return;

      const illustration = await previewBackground(chart, image, signal);
      if (signal.aborted || disposed) return;
      if (isRpe) {
        (renderer as RpeRenderer).setChart(rpeChart!);
        (renderer as RpeRenderer).setChartAssets(chartAssets!);
        session.setChartTimeline({
          durationSeconds: rpeChart!.stats.maxTime,
          offsetSeconds: rpeChart!.offset,
        });
        session.setHitSoundEvents(buildHitSoundEvents({
          lines: rpeChart!.lines.map((line) => ({
            notes: line.notes
              .filter((note) => !note.isFake)
              .map((note) => ({ kind: note.kind, time: note.hitTime })),
          })),
        }));
        completionTimes = rpeChart!.lines
          .flatMap((line) => line.notes.map((note) => (note.isFake ? null : note.kind === 'hold' ? note.endHitTime : note.hitTime)))
          .filter((value): value is number => value !== null)
          .sort((a, b) => a - b);
        timelineNotes = rpeChart!.lines
          .flatMap((line) => line.notes.filter((note) => !note.isFake).map((note) => ({ time: note.hitTime, kind: note.kind })))
          .sort((a, b) => a.time - b.time);
        elements.nameNode.textContent = rpeChart!.info.name ?? '';
        elements.levelNode.textContent = rpeChart!.info.level ?? '';
        applyAttachUi({});
      } else {
        const pgrChart = chart as PgrChart;
        (renderer as PgrRenderer).setChart(pgrChart);
        session.setChartTimeline({
          durationSeconds: pgrChart.stats.maxTime,
          offsetSeconds: pgrChart.offset,
        });
        session.setHitSoundEvents(buildHitSoundEvents(pgrChart));
        completionTimes = pgrChart.lines
          .flatMap((line) => line.notes.map((note) => note.kind === 'hold' ? note.endTime : note.time))
          .sort((a, b) => a - b);
        timelineNotes = pgrChart.lines
          .flatMap((line) => line.notes.map((note) => ({ time: note.time, kind: note.kind })))
          .sort((a, b) => a.time - b.time);
      }
      renderer.setIllustration(illustration);
      renderer.setNoteAssets(noteAssets);
      renderer.setSettings({ ...settings, lineColor: settings.lineColor as LineColorKey });
      buildTimeline();
      if (session.musicDurationSeconds !== null) setStatus('');
      ready = true;
      setControlsEnabled(true);
      renderFrame(0);
      if (disposed) return;
      postStatus('ready', {});
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('无法打开谱面，请返回重试。');
      postStatus('error', { message: '无法打开谱面，请返回重试。' });
      disposePlayer();
    }
  }

  function syncPlayButtons(): void {
    elements.playIcon.innerHTML = session.playing
      ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
    elements.play.setAttribute('aria-label', session.playing ? '暂停' : '播放');
  }

  function syncControlsVisibility(): void {
    if (disposed) return;
    elements.controls.classList.toggle('hidden', !controlsVisible || fsLocked);
    elements.fsLock.classList.toggle('hidden', !controlsVisible);
  }

  const fullscreenControls = bindFullscreenControls(events, {
    active: () => isFullscreen,
    render: visible => { controlsVisible = visible; syncControlsVisibility(); },
  });
  function showControls(): void { fullscreenControls.show(); }
  function hideControls(): void { fullscreenControls.hide(); }

  function seekToChartTime(target: number): void {
    void session.seek(target);
    renderer.resetTimeline(session.chartTime);
    renderFrame(session.chartTime);
  }

  function setFullscreen(active: boolean): void {
    if (disposed) return;
    closeActiveWheelPopup();
    isFullscreen = active;
    renderer.setFullscreen(active);
    setPreviewFullscreen(active);
    elements.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    if (!active) {
      fsLocked = false;
      elements.fsLock.classList.remove('locked');
      elements.fsLock.setAttribute('aria-label', '锁定');
    }
    showControls();
    postStatus('fullscreen', { active });
  }

  function pauseForLifecycle(): void {
    if (disposed) return;
    flushSettings();
    closeActiveWheelPopup();
    session.pause();
  }

  function disposePlayer(): void {
    if (disposed) return;
    flushSettings();
    loadController?.abort();
    loadController = null;
    if (isFullscreen) setFullscreen(false);
    disposed = true;
    session.dispose();
    closeActiveWheelPopup();
    events.dispose();
  }

  function applyStageMetrics(): void {
    if (disposed) return;
    const width = elements.stage.getBoundingClientRect().width;
    if (width <= 0) return;
    elements.stage.style.setProperty('--score-font-size', `${Math.round(clamp(width * 0.033, 16, 60))}px`);
    elements.stage.style.setProperty('--combo-font-size', `${Math.round(clamp(width * 0.034, 16, 62))}px`);
    elements.stage.style.setProperty('--combo-label-font-size', `${Math.round(clamp(width * 0.007, 8, 13))}px`);
    elements.stage.style.setProperty('--progress-height', `${Math.round(clamp(width * 0.0022, 2, 4))}px`);
  }
  const stageObserver = new ResizeObserver(applyStageMetrics);
  stageObserver.observe(elements.stage);
  events.own(() => stageObserver.disconnect());
  applyStageMetrics();

  events.listen(elements.play, 'click', () => {
    if (!ready) return;
    if (session.playing) session.pause();
    else void session.play();
  });
  events.listen(elements.btnRestart, 'click', () => {
    if (!ready) return;
    seekToChartTime(0);
    if (!session.playing) renderFrame(0);
  });
  events.listen(elements.btnStepBack, 'click', () => {
    if (!ready) return;
    seekToChartTime(session.chartTime - STEP_SECONDS);
  });
  events.listen(elements.btnStepForward, 'click', () => {
    if (!ready) return;
    seekToChartTime(session.chartTime + STEP_SECONDS);
  });

  bindHeatTimelineKeyboard(events, elements.timelineHost,
    () => session.chartTime / session.chartDuration * 100,
    percent => { if (ready && !fsLocked) seekToChartTime(percent / 100 * session.chartDuration); });
  events.listen(elements.timelineHost, 'pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    timelineDragging = true;
    wasPlayingBeforeDrag = session.playing;
    if (session.playing) session.pause();
    seekFromTimelineEvent(e);
  });
  events.listen(document, 'pointermove', (e) => {
    if (!timelineDragging) return;
    seekFromTimelineEvent(e);
  });
  events.listen(document, 'pointerup', () => {
    if (!timelineDragging) return;
    timelineDragging = false;
    if (wasPlayingBeforeDrag) void session.play();
  });
  events.listen(document, 'pointercancel', () => {
    timelineDragging = false;
  });

  setupWheelPopup(
    $('speed-trigger'), $('speed-popup'), $('speed-wheel'), $('speed-list'), $('speed-val'),
    (value) => {
      settings.playbackSpeed = value;

      session.applySpeedChange();
      applySettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0.5, 2, 0.05, settings.playbackSpeed, undefined, (value) => `${value.toFixed(2)}×`,
  );
  setupWheelPopup(
    $('note-size-trigger'), $('note-size-popup'), $('note-size-wheel'), $('note-size-list'), $('note-size-val'),
    (value) => {
      settings.noteScale = value;
      applySettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0.6, 1.8, 0.05, settings.noteScale, undefined, (value) => `${value.toFixed(2)}×`,
  );
  setupWheelPopup(
    $('volume-trigger'), $('volume-popup'), $('volume-wheel'), $('volume-list'), $('volume-val'),
    (value) => {
      settings.volume = value;
      applySettings();
    },
    0, 1, 0.01, settings.volume, undefined, (value) => `${Math.round(value * 100)}%`,
  );
  setupWheelPopup(
    $('dim-trigger'), $('dim-popup'), $('dim-wheel'), $('dim-list'), $('dim-val'),
    (value) => {
      settings.backgroundDim = value;
      applySettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0.2, 0.85, 0.01, settings.backgroundDim, undefined, (value) => `${Math.round(value * 100)}%`,
  );
  setupWheelPopup(
    $('hit-sound-volume-trigger'), $('hit-sound-volume-popup'), $('hit-sound-volume-wheel'), $('hit-sound-volume-list'), $('hit-sound-volume-val'),
    (value) => {
      settings.hitSoundVolume = value;
      applySettings();
    },
    0, 1, 0.01, settings.hitSoundVolume, undefined, (value) => `${Math.round(value * 100)}%`,
  );
  setupWheelPopup(
    $('line-color-trigger'), $('line-color-popup'), $('line-color-wheel'), $('line-color-list'), $('line-color-val'),
    (value) => {
      settings.lineColor = LINE_COLORS[value] ?? 'white';
      applySettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0, LINE_COLOR_LABELS.length - 1, 1, Math.max(0, LINE_COLORS.indexOf(settings.lineColor)), LINE_COLOR_LABELS,
  );

  events.listen(elements.multiHint, 'click', () => {
    if (!ready) return;
    settings.multiHint = !settings.multiHint;
    applySettings();
    persistSettings();
    if (!session.playing) renderFrame(session.chartTime);
  });

  events.listen(elements.blockArea, 'click', () => {
    if (!ready) return;
    settings.showBlockArea = !settings.showBlockArea;
    applySettings();
    persistSettings();
    if (!session.playing) renderFrame(session.chartTime);
  });

  events.listen(elements.blockAreaBounds, 'click', () => {
    if (!ready) return;
    settings.showBlockAreaBounds = !settings.showBlockAreaBounds;
    applySettings();
    persistSettings();
    if (!session.playing) renderFrame(session.chartTime);
  });

  events.listen(elements.fullscreen, 'click', () => setFullscreen(!isFullscreen));

  events.listen(elements.fsLock, 'click', (e) => {
    e.stopPropagation();
    const nextState = toggleFullscreenLockUiState(fsLocked);
    fsLocked = nextState.locked;
    elements.fsLock.classList.toggle('locked', fsLocked);
    elements.fsLock.setAttribute('aria-label', nextState.actionLabel);
    if (nextState.overlayHidden) hideControls();
    else showControls();
  });

  events.listen(window, 'resize', () => { closeActiveWheelPopup(); buildTimeline(); });
  events.listen(document, 'scroll', closeActiveWheelPopup, { capture: true, passive: true });
  const timelineObserver = new ResizeObserver(buildTimeline);
  timelineObserver.observe(elements.timelineHost);
  events.own(() => timelineObserver.disconnect());

  events.listen(window, 'message', (event) => {

    applyChartPreviewHostCommand(event.data, {
      pause: pauseForLifecycle,
      exitFullscreen: () => setFullscreen(false),
      dispose: disposePlayer,
    });
  });
  events.listen(window, 'pagehide', disposePlayer);
  events.listen(document, 'message', (event) => {
    applyChartPreviewHostCommand((event as MessageEvent).data, { pause: pauseForLifecycle, exitFullscreen: () => setFullscreen(false), dispose: disposePlayer });
  });
  events.listen(document, 'visibilitychange', () => {
    if (document.visibilityState === 'hidden') pauseForLifecycle();
  });

  applySettings();
  syncPlayButtons();
  void loadPreview();
}

start();
