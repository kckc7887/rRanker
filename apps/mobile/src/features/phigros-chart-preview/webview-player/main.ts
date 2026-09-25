/**
 * Phigros / Phira 谱面确认 WebView 播放器入口。
 * 播放位置、命令代次、音乐音源、打击音调度与 rAF 归 PhigrosPlaybackSession；
 * 这里只做 DOM、设置、时间轴视图与控制器的接线。
 * 对时、性能与控制面板全部对齐舞萌谱面确认播放器：
 * - 音乐解码为 AudioBuffer，经 AudioBufferSourceNode 在 AudioContext 时钟上播放，
 *   不使用 HTMLMediaElement 时钟（其 currentTime 有延迟抖动，seek/暂停恢复漂移大）；
 * - PlaybackClock 分段时钟记录播放起点与倍速变化，任意时刻反查精确音乐位置；
 * - 视觉与打击音统一使用 getAudioContextOutputTime 的输出端时间（贴合实际听感）；
 * - 控制器为舞萌式时间轴（音符密度条/刻度/播放头）+ 走带按钮 + 拨轮设置；
 * - 仅播放中常驻 rAF 渲染；暂停/拖动按事件渲染，画布 DPR 封顶与全屏像素预算；
 * - 主线程解析 PGR（WebView file:// 下不使用 Worker）。
 * 观赏播放不包含触控判定与真实计分。
 *
 * 许可证：谱面解析与渲染部分语义衍生自 TeamFlos/phira（GPL-3.0，https://github.com/TeamFlos/phira），
 * 相应部分按 GPL-3.0 随本项目（AGPL-3.0）一并发布，两者兼容；来源与许可证全文见仓库根 THIRD_PARTY_NOTICES.md。
 */

import { PgrRenderer, type LineColorKey, type NoteAssets } from './renderer';
import { parsePgrChart, type PgrChart } from './pgr-core';
import { RpeRenderer, type RpeAttachUiTransform, type RpeChartAssets } from './rpe-renderer';
import { buildGifAnim, parseRpeChart, type RpeChart, type RpeGifKeyframe } from './rpe-core';
import { RPE_PRESET_SHADERS } from './rpe-preset-shaders';
import { buildHitSoundEvents, type HitSoundKind } from './hit-sound';
import { PhigrosPlaybackSession, type PhigrosPlaybackSettings } from './playback';
import { PhigrosTimelineView } from './timelineView';
import { rpeResourceUrl } from '../../../domain/phira-rpe-resource-path';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';
import { applyChartPreviewHostCommand } from '../../chart-preview-shared/chart-preview-bridge';

declare global {
  interface Window {
    __PHIGROS_CHART_PREVIEW__?: PhigrosChartPreviewConfig;
    __PHIGROS_MUSIC_DATA__?: string | null;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export interface PhigrosChartPreviewSettings {
  playbackSpeed?: number;
  noteScale?: number;
  volume?: number;
  backgroundDim?: number;
  multiHint?: boolean;
  lineColor?: string;
  hitSoundVolume?: number;
  /** RPE 专属：宽高比覆盖（null = 谱面默认）与翻转/特效开关。 */
  aspectRatio?: number | null;
  flipX?: boolean;
  effects?: boolean;
}

export interface PhigrosChartPreviewConfig {
  game?: 'phigros' | 'phira';
  title?: string;
  chartUrl?: string;
  chartText?: string;
  musicUrl?: string;
  illustrationUrl?: string;
  hitSounds?: Partial<Record<HitSoundKind, string>>;
  settings?: PhigrosChartPreviewSettings | null;
  /** 谱面格式：pgr（默认）或 rpe。RPE 时提供 rpeAssets。 */
  format?: 'pgr' | 'rpe';
  rpeAssets?: {
    basePath: string;
    extraJson: string | null;
    infoYml: string | null;
    shaders: Record<string, string>;
  } | null;
  /** 播放器界面主题：由 RN 侧按应用深浅色注入。 */
  theme?: 'light' | 'dark';
}

const DEFAULT_SETTINGS: Required<PhigrosChartPreviewSettings> = Object.freeze({
  playbackSpeed: 1,
  noteScale: 1,
  volume: 1,
  backgroundDim: 0.55,
  multiHint: true,
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
/** 拨轮（移植舞萌 setupWheelPopup/createWheel）。 */
const WHEEL_ITEM_HEIGHT = 28;

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

function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function decodeBase64DataUrl(url: string): ArrayBuffer {
  const separator = url.indexOf(',');
  const base64 = separator >= 0 ? url.slice(separator + 1) : url;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function loadImage(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // 不设置 crossOrigin：曲绘画布从不回读像素，污染画布不影响渲染；
    // 远程曲绘无 CORS 头时（Phira 社区图床）也能正常显示。
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => { image.src = ''; cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error('曲绘加载失败')); };
    signal.addEventListener('abort', onAbort, { once: true });
    image.src = url;
  });
}

/** 拨轮，逐语义移植舞萌 createWheel。 */
function buildWheelValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let value = min; value <= max + 1e-9; value += step) {
    values.push(Math.round(value * 100) / 100);
  }
  return values;
}

function createWheel(
  viewport: HTMLElement,
  list: HTMLElement,
  onChange: (value: number) => void,
  min: number,
  max: number,
  step: number,
  initial: number,
  labels?: readonly string[],
): { getValue: () => number; scrollTo: (v: number) => void } {
  const values = buildWheelValues(min, max, step);
  let current = values.includes(initial) ? initial : values[0] ?? min;
  let settleTimer = 0;

  const itemLabel = (v: number) => {
    if (labels) {
      const i = values.indexOf(v);
      return labels[i] ?? String(v);
    }
    return v.toFixed(2);
  };

  const refreshList = () => {
    list.replaceChildren(
      ...values.map((value) => {
        const item = document.createElement('div');
        item.className = 'wheel-item';
        item.dataset.value = String(value);
        item.textContent = itemLabel(value);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', value === current ? 'true' : 'false');
        return item;
      }),
    );
  };

  refreshList();

  const indexOf = (value: number) =>
    Math.max(0, values.findIndex((item) => Math.abs(item - value) < 1e-9));

  const applySelection = (value: number, notify: boolean) => {
    current = value;
    for (const child of list.children) {
      const el = child as HTMLElement;
      el.setAttribute('aria-selected', el.dataset.value === String(value) ? 'true' : 'false');
    }
    if (notify) onChange(value);
  };

  const scrollToValue = (value: number, behavior: ScrollBehavior = 'auto') => {
    const index = indexOf(value);
    viewport.scrollTo({ top: index * WHEEL_ITEM_HEIGHT, behavior });
  };

  const valueFromScroll = () => {
    const index = clamp(Math.round(viewport.scrollTop / WHEEL_ITEM_HEIGHT), 0, values.length - 1);
    return values[index]!;
  };

  viewport.addEventListener('scroll', () => {
    const next = valueFromScroll();
    if (Math.abs(next - current) > 1e-9) applySelection(next, true);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      scrollToValue(valueFromScroll(), 'smooth');
    }, 80);
  }, { passive: true });

  scrollToValue(current);
  applySelection(current, false);

  return { getValue: () => current, scrollTo: scrollToValue };
}

let activePopupClose: (() => void) | null = null;
/** 宿主释放后的播放器：不再改动界面、也不再回报状态。 */
let disposed = false;

/** 拨轮字段，逐语义移植舞萌 setupWheelPopup，并支持自定义数值显示。 */
function setupWheelPopup(
  trigger: HTMLElement,
  popup: HTMLElement,
  viewport: HTMLElement,
  list: HTMLElement,
  valSpan: HTMLElement,
  onChange: (value: number) => void,
  min: number,
  max: number,
  step: number,
  initial: number,
  labels?: readonly string[],
  format: (value: number) => string = (value) => value.toFixed(2),
): { getValue: () => number } {
  const wheel = createWheel(viewport, list, (value) => {
    valSpan.textContent = labels ? (labels[value] ?? String(value)) : format(value);
    onChange(value);
  }, min, max, step, initial, labels);

  let open = false;

  const openPopup = () => {
    activePopupClose?.();
    open = true;
    popup.style.visibility = '';
    popup.style.pointerEvents = '';
    const triggerRect = trigger.getBoundingClientRect();
    popup.style.bottom = `${window.innerHeight - triggerRect.top + 4}px`;
    popup.style.left = `${triggerRect.left + triggerRect.width / 2}px`;
    popup.style.transform = 'translateX(-50%)';
    wheel.scrollTo(wheel.getValue());
    activePopupClose = closePopup;
  };

  const closePopup = () => {
    open = false;
    popup.style.visibility = 'hidden';
    popup.style.pointerEvents = 'none';
    if (activePopupClose === closePopup) activePopupClose = null;
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (open) closePopup();
    else openPopup();
  });

  document.addEventListener('click', () => {
    if (open) closePopup();
  });

  popup.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  popup.addEventListener('touchstart', (e) => {
    e.stopPropagation();
  });

  valSpan.textContent = labels ? (labels[Math.round(initial)] ?? String(initial)) : format(initial);

  return wheel;
}

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

  const config = window.__PHIGROS_CHART_PREVIEW__ ?? {};
  const isRpe = config.format === 'rpe';
  type PreviewRenderer = PgrRenderer | RpeRenderer;
  const renderer: PreviewRenderer = isRpe ? new RpeRenderer(elements.canvas) : new PgrRenderer(elements.canvas);
  let settings = loadSettings(config.settings);
  const playbackSettings: PhigrosPlaybackSettings = settings;
  const session = new PhigrosPlaybackSession({
    settings: playbackSettings,
    hitSounds: config.hitSounds,
    host: {
      render: (chartTime) => renderFrame(chartTime),
      onPlayStateChange: () => { syncPlayButtons(); showControls(); },
      onPlaybackError: () => setStatus('无法播放音乐，请重试。'),
    },
  });
  let loadController: AbortController | null = null;  let ready = false;
  let isFullscreen = false;
  let timelineDragging = false;
  let wasPlayingBeforeDrag = false;
  let completionTimes: number[] = [];
  let timelineNotes: { time: number; kind: string }[] = [];
  let controlsTimer = 0;
  let controlsVisible = true;
  let fsLocked = false;

  /** RPE：加载谱面包资源（贴图/gif/视频；shader 文本来自注入配置）。 */
  async function loadRpeChartAssets(chart: RpeChart, signal: AbortSignal): Promise<RpeChartAssets> {
    const basePath = config.rpeAssets?.basePath ?? '';
    const textures = new Map<string, HTMLImageElement>();
    const videos = new Map<string, HTMLVideoElement>();
    const gifs = new Map<string, { frames: ImageBitmap[]; durationsMs: number[]; cumulativeMs: number[]; totalMs: number }>();
    const gifAnims = new Map<number, RpeGifKeyframe[]>();
    const jobs: Promise<unknown>[] = [];
    const textureNames = new Set<string>();
    for (const line of chart.lines) {
      if (line.texture !== 'line.png' && line.gifEvents.length === 0) textureNames.add(line.texture);
    }
    // shader sampler2D uniform 引用的图片
    for (const effect of chart.extras.effects) {
      for (const value of Object.values(effect.vars)) {
        if (typeof value === 'string') textureNames.add(value);
      }
    }
    for (const name of textureNames) {
      const url = rpeResourceUrl(basePath, name);
      if (!url) continue;
      jobs.push(loadImage(url, signal)
        .then((image) => textures.set(name, image))
        .catch((error) => console.warn(`判定线贴图加载失败 ${name}:`, error)));
    }
    // gif 判定线（prpr JudgeLineKind::TextureGif）：ImageDecoder 解码帧；iOS 无 ImageDecoder 时降级静态贴图
    for (const line of chart.lines) {
      if (line.gifEvents.length === 0 || gifs.has(line.texture)) continue;
      jobs.push((async () => {
        try {
          const imageDecoderCtor = globalThis.ImageDecoder;
          if (!imageDecoderCtor) throw new Error('浏览器不支持 ImageDecoder');
          const textureUrl = rpeResourceUrl(basePath, line.texture);
          if (!textureUrl) throw new Error('gif 路径无效');
          const response = await fetch(textureUrl, { signal });
          if (!response.ok) throw new Error(`gif 请求失败：HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          const lower = line.texture.toLowerCase();
          const mimeType = lower.endsWith('.apng') ? 'image/apng' : 'image/gif';
          const decoder = new imageDecoderCtor({ data: bytes, type: mimeType });
          const frames: ImageBitmap[] = [];
          const durationsMs: number[] = [];
          try {
            await decoder.tracks.ready;
            const track = decoder.tracks.selectedTrack;
            if (!track) throw new Error('GIF 没有可用图像轨道');
            for (let index = 0; index < track.frameCount; index += 1) {
              const { image } = await decoder.decode({ frameIndex: index });
              try {
                frames.push(await createImageBitmap(image));
                durationsMs.push((image.duration ?? 100_000) / 1000);
              } finally { image.close(); }
            }
          } catch (error) {
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
          gifs.set(line.texture, { frames, durationsMs, cumulativeMs, totalMs });
          gifAnims.set(line.lineIndex, buildGifAnim(line.gifEvents, totalMs, chart.bpmList));
        } catch (error) {
          console.warn(`gif 判定线解码失败 ${line.texture}（降级为静态贴图）:`, error);
          try {
            const fallbackUrl = rpeResourceUrl(basePath, line.texture);
            if (!fallbackUrl) throw new Error('gif 路径无效');
            const image = await loadImage(fallbackUrl, signal);
            textures.set(line.texture, image);
          } catch {
            /* 忽略 */
          }
        }
      })());
    }
    for (const video of chart.extras.videos) {
      jobs.push(new Promise<void>((resolve) => {
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
          resolve();
        };
        element.addEventListener('loadedmetadata', done, { once: true });
        element.addEventListener('error', done, { once: true });
        element.load();
        videos.set(video.path, element);
      }));
    }
    await Promise.all(jobs);
    // shader 文本按谱面里的相对路径引用注入，与落盘身份相同。
    const shaders = new Map<string, string>();
    const injectedShaders = config.rpeAssets?.shaders ?? {};
    for (const effect of chart.extras.effects) {
      if (shaders.has(effect.shader)) continue;
      const source = injectedShaders[effect.shader];
      if (typeof source === 'string') shaders.set(effect.shader, source);
    }
    // prpr 内置特效预设兜底（内嵌随包分发）：谱面包未提供同名 shader 时使用。
    for (const [name, source] of Object.entries(RPE_PRESET_SHADERS)) {
      if (!shaders.has(name)) shaders.set(name, source);
    }
    return { textures, videos, shaders, gifs, gifAnims };
  }

  // attachUI：HUD 元素跟随判定线（prpr Chart::with_element 语义；1 Pause/2 ComboNumber/3 Combo/4 Score/5 Bar/6 Name/7 Level）
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

  if (config.title) elements.title.textContent = config.title;
  elements.status.textContent = config.game === 'phira' ? 'Phira 谱面' : config.game === 'phigros' ? 'Phigros 谱面' : '';

  function setStatus(text: string): void {
    elements.status.textContent = text;
  }

  function setLoadProgress(text: string, value: number): void {
    setStatus(text);
    postStatus('progress', { label: text, value });
  }

  function setControlsEnabled(value: boolean): void {
    elements.play.disabled = !value;
    elements.btnRestart.disabled = !value;
    elements.btnStepBack.disabled = !value;
    elements.btnStepForward.disabled = !value;
    elements.fullscreen.disabled = !value;
    elements.multiHint.disabled = !value;
    for (const id of ['speed-trigger', 'note-size-trigger', 'volume-trigger', 'dim-trigger', 'hit-sound-volume-trigger', 'line-color-trigger']) {
      ($(id) as HTMLButtonElement).disabled = !value;
    }
  }

  /**
   * 音乐字节由宿主解析（iOS file:// 下优先注入的 base64），解码与音源归播放会话。
   * 失败与取消保持既有行为：取消沿 AbortSignal 上抛，其余进入静音看谱。
   */
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

  // ---- 舞萌式时间轴 ----
  const timelineView = new PhigrosTimelineView({
    host: elements.timelineHost,
    bars: elements.timelineBars,
    ruler: elements.timelineRuler,
    playhead: elements.timelinePlayhead,
    badge: elements.timelineBadge,
    formatTime,
  });

  function buildTimeline(): void {
    timelineView.build(session.chartDuration, timelineNotes);
  }

  function seekFromTimelineEvent(event: PointerEvent): void {
    const rect = elements.timelineHost.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    seekToChartTime((pct / 100) * session.chartDuration);
  }

  function renderHud(chartTime: number): void {
    const passed = upperBound(completionTimes, chartTime);
    const total = Math.max(1, completionTimes.length);
    elements.gameProgress.style.width = `${Math.min(100, chartTime / Math.max(1, session.chartDuration) * 100)}%`;
    elements.score.textContent = String(Math.floor(passed / total * 1_000_000)).padStart(7, '0');
    elements.combo.textContent = String(passed);
    elements.comboBlock.classList.toggle('is-visible', passed >= 3);
    elements.timeLabel.textContent = `${formatTime(chartTime)} / ${formatTime(session.chartDuration)}`;
    timelineView.updatePlayhead(chartTime, session.chartDuration);
  }

  function renderFrame(chartTime: number): void {
    renderer.render(chartTime);
    applyAttachUiFromRenderer();
    renderHud(chartTime);
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
        typeof config.illustrationUrl === 'string' && config.illustrationUrl.trim() !== ''
          ? loadImage(config.illustrationUrl, signal).catch((error) => {
            if (error?.name === 'AbortError') throw error;
            return null;
          })
          : Promise.resolve(null),
      ]);
      if (signal.aborted) return;
      setLoadProgress('正在解析谱面…', 0.45);
      const chart: PgrChart | RpeChart = await new Promise((resolve, reject) => {
        // 主线程解析：WebView file:// 下不使用 Worker，解析期间状态保持可见。
        window.setTimeout(() => {
          try {
            resolve(isRpe
              ? parseRpeChart(chartText, { extraJson: config.rpeAssets?.extraJson ?? null, infoYml: config.rpeAssets?.infoYml ?? null })
              : parsePgrChart(chartText));
          } catch (error) { reject(error); }
        }, 0);
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
      // RPE：背景优先取谱面包内 META.background，缺失时回退远程曲绘
      let illustration = image;
      if (rpeChart?.background) {
        const basePath = config.rpeAssets?.basePath ?? '';
        try {
          const backgroundUrl = rpeResourceUrl(basePath, rpeChart.background);
          illustration = backgroundUrl ? await loadImage(backgroundUrl, signal) : null;
        } catch {
          /* 回退远程曲绘 */
        }
      }
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
      postStatus('ready', {});
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus('无法打开谱面，请返回重试。');
      postStatus('error', { message: '无法打开谱面，请返回重试。' });
    }
  }

  function syncPlayButtons(): void {
    elements.playIcon.innerHTML = session.playing
      ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
    elements.play.setAttribute('aria-label', session.playing ? '暂停' : '播放');
  }

  function syncControlsVisibility(): void {
    elements.controls.classList.toggle('hidden', !controlsVisible || fsLocked);
    elements.fsLock.classList.toggle('hidden', !controlsVisible);
  }

  function showControls(): void {
    window.clearTimeout(controlsTimer);
    controlsVisible = true;
    syncControlsVisibility();
    if (!isFullscreen) return;
    controlsTimer = window.setTimeout(() => {
      controlsVisible = false;
      syncControlsVisibility();
    }, 5000);
  }

  function hideControls(): void {
    window.clearTimeout(controlsTimer);
    controlsVisible = false;
    syncControlsVisibility();
  }

  /** 跳转：位置、时钟与打击音时间轴在会话内更新，视图在此重绘。 */
  function seekToChartTime(target: number): void {
    void session.seek(target);
    renderer.resetTimeline(session.chartTime);
    renderFrame(session.chartTime);
  }

  function setFullscreen(active: boolean): void {
    isFullscreen = active;
    renderer.setFullscreen(active);
    document.body.classList.toggle('fullscreen', active);
    elements.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    if (!active) {
      fsLocked = false;
      elements.fsLock.classList.remove('locked');
      elements.fsLock.setAttribute('aria-label', '锁定');
      window.clearTimeout(controlsTimer);
      controlsVisible = true;
      syncControlsVisibility();
    } else {
      showControls();
    }
    postStatus('fullscreen', { active });
  }

  /** 暂停（手动按钮或宿主生命周期）：只停播，不改变全屏状态。 */
  function pauseForLifecycle(): void {
    if (disposed) return;
    session.pause();
  }

  /** 释放：停播、退出全屏、回收资源，幂等；此后不再改动界面或回报状态。 */
  function disposePlayer(): void {
    if (disposed) return;
    loadController?.abort();
    loadController = null;
    if (isFullscreen) setFullscreen(false);
    session.dispose();
    activePopupClose?.();
    disposed = true;
  }

  // HUD 随 16:9 播放窗宽度缩放，并限制极端尺寸下的比例。
  function applyStageMetrics(): void {
    const width = elements.stage.getBoundingClientRect().width;
    if (width <= 0) return;
    elements.stage.style.setProperty('--score-font-size', `${Math.round(clamp(width * 0.033, 16, 60))}px`);
    elements.stage.style.setProperty('--combo-font-size', `${Math.round(clamp(width * 0.034, 16, 62))}px`);
    elements.stage.style.setProperty('--combo-label-font-size', `${Math.round(clamp(width * 0.007, 8, 13))}px`);
    elements.stage.style.setProperty('--progress-height', `${Math.round(clamp(width * 0.0022, 2, 4))}px`);
  }
  new ResizeObserver(applyStageMetrics).observe(elements.stage);
  applyStageMetrics();

  // ---- 事件绑定 ----
  elements.play.addEventListener('click', () => {
    if (!ready) return;
    if (session.playing) session.pause();
    else void session.play();
  });
  elements.btnRestart.addEventListener('click', () => {
    if (!ready) return;
    seekToChartTime(0);
    if (!session.playing) renderFrame(0);
  });
  elements.btnStepBack.addEventListener('click', () => {
    if (!ready) return;
    seekToChartTime(session.chartTime - STEP_SECONDS);
  });
  elements.btnStepForward.addEventListener('click', () => {
    if (!ready) return;
    seekToChartTime(session.chartTime + STEP_SECONDS);
  });

  elements.timelineHost.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    timelineDragging = true;
    wasPlayingBeforeDrag = session.playing;
    if (session.playing) session.pause();
    seekFromTimelineEvent(e);
  });
  document.addEventListener('pointermove', (e) => {
    if (!timelineDragging) return;
    seekFromTimelineEvent(e);
  });
  document.addEventListener('pointerup', () => {
    if (!timelineDragging) return;
    timelineDragging = false;
    if (wasPlayingBeforeDrag) void session.play();
  });
  document.addEventListener('pointercancel', () => {
    timelineDragging = false;
  });

  // 拨轮设置
  setupWheelPopup(
    $('speed-trigger'), $('speed-popup'), $('speed-wheel'), $('speed-list'), $('speed-val'),
    (value) => {
      settings.playbackSpeed = value;
      // 播放中改变倍速：采样级同步（与舞萌一致），不打断当前声源。
      session.applySpeedChange();
      applySettings();
      persistSettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0.5, 2, 0.05, settings.playbackSpeed, undefined, (value) => `${value.toFixed(2)}×`,
  );
  setupWheelPopup(
    $('note-size-trigger'), $('note-size-popup'), $('note-size-wheel'), $('note-size-list'), $('note-size-val'),
    (value) => {
      settings.noteScale = value;
      applySettings();
      persistSettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0.6, 1.8, 0.05, settings.noteScale, undefined, (value) => `${value.toFixed(2)}×`,
  );
  setupWheelPopup(
    $('volume-trigger'), $('volume-popup'), $('volume-wheel'), $('volume-list'), $('volume-val'),
    (value) => {
      settings.volume = value;
      applySettings();
      persistSettings();
    },
    0, 1, 0.01, settings.volume, undefined, (value) => `${Math.round(value * 100)}%`,
  );
  setupWheelPopup(
    $('dim-trigger'), $('dim-popup'), $('dim-wheel'), $('dim-list'), $('dim-val'),
    (value) => {
      settings.backgroundDim = value;
      applySettings();
      persistSettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0.2, 0.85, 0.01, settings.backgroundDim, undefined, (value) => `${Math.round(value * 100)}%`,
  );
  setupWheelPopup(
    $('hit-sound-volume-trigger'), $('hit-sound-volume-popup'), $('hit-sound-volume-wheel'), $('hit-sound-volume-list'), $('hit-sound-volume-val'),
    (value) => {
      settings.hitSoundVolume = value;
      applySettings();
      persistSettings();
    },
    0, 1, 0.01, settings.hitSoundVolume, undefined, (value) => `${Math.round(value * 100)}%`,
  );
  setupWheelPopup(
    $('line-color-trigger'), $('line-color-popup'), $('line-color-wheel'), $('line-color-list'), $('line-color-val'),
    (value) => {
      settings.lineColor = LINE_COLORS[value] ?? 'white';
      applySettings();
      persistSettings();
      if (!session.playing) renderFrame(session.chartTime);
    },
    0, LINE_COLOR_LABELS.length - 1, 1, Math.max(0, LINE_COLORS.indexOf(settings.lineColor)), LINE_COLOR_LABELS,
  );

  elements.multiHint.addEventListener('click', () => {
    if (!ready) return;
    settings.multiHint = !settings.multiHint;
    applySettings();
    persistSettings();
    if (!session.playing) renderFrame(session.chartTime);
  });

  elements.fullscreen.addEventListener('click', () => setFullscreen(!isFullscreen));
  elements.stage.addEventListener('pointerdown', () => {
    if (!isFullscreen) return;
    if (controlsVisible) hideControls();
    else showControls();
  });
  elements.fsLock.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextState = toggleFullscreenLockUiState(fsLocked);
    fsLocked = nextState.locked;
    elements.fsLock.classList.toggle('locked', fsLocked);
    elements.fsLock.setAttribute('aria-label', nextState.actionLabel);
    if (nextState.overlayHidden) hideControls();
    else showControls();
  });

  window.addEventListener('resize', buildTimeline);
  new ResizeObserver(buildTimeline).observe(elements.timelineHost);

  window.addEventListener('message', (event) => {
    // 生命周期合同由公共层派生：暂停停播保全屏，退出全屏与释放是显式命令。
    applyChartPreviewHostCommand(event.data, {
      pause: pauseForLifecycle,
      exitFullscreen: () => setFullscreen(false),
      dispose: disposePlayer,
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && session.playing) session.pause();
  });

  applySettings();
  syncPlayButtons();
  void loadPreview();
}

start();
