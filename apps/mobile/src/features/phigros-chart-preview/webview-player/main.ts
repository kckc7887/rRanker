/**
 * Phigros / Phira 谱面确认 WebView 播放器入口。
 * 谱面解析与渲染移植自 demo/phigros-chart-preview（pgr-core/renderer/hit-sound），
 * 对时、性能与控制面板全部对齐舞萌谱面确认播放器：
 * - 音乐解码为 AudioBuffer，经 AudioBufferSourceNode 在 AudioContext 时钟上播放，
 *   不使用 HTMLMediaElement 时钟（其 currentTime 有延迟抖动，seek/暂停恢复漂移大）；
 * - PlaybackClock 分段时钟记录播放起点与倍速变化，任意时刻反查精确音乐位置；
 * - 视觉与打击音统一使用 getAudioContextOutputTime 的输出端时间（贴合实际听感）；
 * - 控制器为舞萌式时间轴（音符密度条/刻度/播放头）+ 走带按钮 + 拨轮设置；
 * - 仅播放中常驻 rAF 渲染；暂停/拖动按事件渲染，画布 DPR 封顶与全屏像素预算；
 * - 主线程解析 PGR（WebView file:// 下不使用 Worker）。
 * 观赏播放不包含触控判定与真实计分。
 */

import { PgrRenderer, type LineColorKey, type NoteAssets } from './renderer';
import { parsePgrChart, type PgrChart } from './pgr-core';
import { RpeRenderer, type RpeAttachUiTransform, type RpeChartAssets } from './rpe-renderer';
import { buildGifAnim, parseRpeChart, type RpeChart, type RpeGifKeyframe } from './rpe-core';
import { RPE_PRESET_SHADERS } from './rpe-preset-shaders';
import {
  buildHitSoundEvents,
  findHitSoundCursor,
  HIT_SOUND_LOOKAHEAD_SECONDS,
  hitSoundScheduleDelay,
  type HitSoundEvent,
  type HitSoundKind,
} from './hit-sound';
import { PlaybackClock } from '../../chart-preview-shared/webview-player/playbackClock';
import { getAudioContextOutputTime } from '../../chart-preview-shared/webview-player/audioClock';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';

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
/** 与舞萌播放器一致的音频调度常量。 */
const SOURCE_START_LEAD_TIME_S = 0.05;
const SOURCE_FADE_TIME_S = 0.015;
const MUSIC_END_EPSILON_S = 0.05;
const CHART_END_EPSILON_S = 0.25;
const STEP_SECONDS = 5;
/** 拨轮（移植舞萌 setupWheelPopup/createWheel）。 */
const WHEEL_ITEM_HEIGHT = 28;
const NOTE_BAR_COLORS: Readonly<Record<string, string>> = Object.freeze({
  tap: '#FFD700',
  drag: '#00CED1',
  hold: '#FF8C00',
  flick: '#ff69b4',
});

/** WebCodecs ImageDecoder 最小类型（Android WebView 可用；iOS 无则降级静态贴图）。 */
interface ImageDecoderConstructor {
  new (init: { data: ArrayBuffer; type: string }): {
    tracks: { ready: Promise<{ selectedTrack: { frameCount: number } }> };
    decode: (options: { frameIndex: number }) => Promise<{ image: { close: () => void }; duration: number }>;
    close: () => void;
  };
}

function postStatus(type: string, payload: Record<string, unknown> = {}): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...payload }));
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
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
    playIcon: $('play-icon') as SVGElement,
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
  const playbackClock = new PlaybackClock();
  let loadController: AbortController | null = null;  let ready = false;
  let isPlaying = false;
  let isFullscreen = false;
  let timelineDragging = false;
  let wasPlayingBeforeDrag = false;
  let rafId = 0;
  let lastRafTs = 0;
  let currentChartTime = 0;
  let chartOffset = 0;
  let chartDuration = 0;
  let completionTimes: number[] = [];
  let timelineNotes: { time: number; kind: string }[] = [];
  let controlsTimer = 0;
  let controlsVisible = true;
  let fsLocked = false;
  let audioContext: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let musicBuffer: AudioBuffer | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let sourceGain: GainNode | null = null;
  let isSourcePlaying = false;
  let hitSoundBuffers: Partial<Record<HitSoundKind, AudioBuffer>> | null = null;
  let hitSoundGain: GainNode | null = null;
  const activeHitSounds = new Set<AudioBufferSourceNode>();
  let hitSoundEvents: HitSoundEvent[] = [];
  let hitSoundCursor = 0;
  let lastHitSoundTime = -1e-6;

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
      jobs.push(loadImage(`${basePath}${name}`, signal)
        .then((image) => textures.set(name, image))
        .catch((error) => console.warn(`判定线贴图加载失败 ${name}:`, error)));
    }
    // gif 判定线（prpr JudgeLineKind::TextureGif）：ImageDecoder 解码帧；iOS 无 ImageDecoder 时降级静态贴图
    for (const line of chart.lines) {
      if (line.gifEvents.length === 0 || gifs.has(line.texture)) continue;
      jobs.push((async () => {
        try {
          const imageDecoderCtor = (globalThis as { ImageDecoder?: ImageDecoderConstructor }).ImageDecoder;
          if (!imageDecoderCtor) throw new Error('浏览器不支持 ImageDecoder');
          const response = await fetch(`${basePath}${line.texture}`, { signal });
          if (!response.ok) throw new Error(`gif 请求失败：HTTP ${response.status}`);
          const bytes = await response.arrayBuffer();
          const lower = line.texture.toLowerCase();
          const mimeType = lower.endsWith('.apng') ? 'image/apng' : 'image/gif';
          const decoder = new imageDecoderCtor({ data: bytes, type: mimeType });
          const { selectedTrack } = await decoder.tracks.ready;
          const frames: ImageBitmap[] = [];
          const durationsMs: number[] = [];
          for (let index = 0; index < selectedTrack.frameCount; index += 1) {
            const { image, duration } = await decoder.decode({ frameIndex: index });
            frames.push(await createImageBitmap(image as ImageBitmapSource));
            durationsMs.push(duration / 1000);
            image.close();
          }
          decoder.close();
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
            const image = await loadImage(`${basePath}${line.texture}`, signal);
            textures.set(line.texture, image);
          } catch {
            /* 忽略 */
          }
        }
      })());
    }
    for (const video of chart.extras.videos) {
      jobs.push(new Promise<void>((resolve) => {
        const element = document.createElement('video');
        element.muted = true;
        element.preload = 'auto';
        element.playsInline = true;
        element.src = `${basePath}${video.path}`;
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
    // RN 侧落盘的 shader 以清洗后的扁平文件名为键（domain/phira-chart-preview 的 sanitizeRpeBundleFileName），
    // extra.json 的 effect.shader 引用原始文件名（如 '/camera_pr.glsl'），按同一规则清洗后兜底查找。
    const shaders = new Map<string, string>();
    const injectedShaders = config.rpeAssets?.shaders ?? {};
    for (const effect of chart.extras.effects) {
      if (shaders.has(effect.shader)) continue;
      const basename = effect.shader.split('/').filter((segment) => segment.length > 0).pop() ?? effect.shader;
      const cleaned = basename.replace(/[^A-Za-z0-9._-]/g, '_');
      const source = injectedShaders[effect.shader] ?? injectedShaders[cleaned];
      if (typeof source === 'string') shaders.set(effect.shader, source);
    }
    // prpr 内置特效预设兜底（内嵌随包分发）：谱面包未提供同名 shader 时使用，与 demo 语义一致。
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

  async function ensureAudio(): Promise<AudioContext> {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error('浏览器不支持 Web Audio');
      audioContext = new AudioContextClass({ latencyHint: 'interactive' });
      musicGain = audioContext.createGain();
      musicGain.gain.value = settings.volume;
      musicGain.connect(audioContext.destination);
      hitSoundGain = audioContext.createGain();
      hitSoundGain.gain.value = settings.hitSoundVolume;
      hitSoundGain.connect(audioContext.destination);
    }
    try {
      await audioContext.resume();
    } catch {
      // 尚无用户手势授权时保持 suspended；点击开始播放会再次 resume。
    }
    return audioContext;
  }

  /** 解码音乐为 AudioBuffer；失败时进入静音看谱模式（与舞萌一致）。 */
  async function decodeMusic(signal: AbortSignal): Promise<void> {
    try {
      const context = await ensureAudio();
      let bytes: ArrayBuffer;
      // Phira 音乐为本地文件，iOS file:// 下无法 fetch，优先使用注入的 base64。
      if (typeof window.__PHIGROS_MUSIC_DATA__ === 'string' && window.__PHIGROS_MUSIC_DATA__.length > 0) {
        bytes = decodeBase64DataUrl(window.__PHIGROS_MUSIC_DATA__);
      } else if (typeof config.musicUrl === 'string' && config.musicUrl.trim() !== '') {
        const response = await fetch(config.musicUrl, { signal });
        if (!response.ok) throw new Error(`谱面音乐不可用（HTTP ${response.status}）`);
        bytes = await response.arrayBuffer();
      } else {
        throw new Error('未提供谱面音乐资源');
      }
      musicBuffer = await context.decodeAudioData(bytes);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      setStatus(`${error instanceof Error ? error.message : '谱面音乐不可用'}（仍可静音看谱）`);
      musicBuffer = null;
    }
  }

  function getMusicTime(): number {
    if (!audioContext || !isSourcePlaying) return playbackClock.offset;
    const outputTime = getAudioContextOutputTime(audioContext);
    playbackClock.prune(outputTime);
    return playbackClock.positionAt(outputTime);
  }

  function stopSource(fade: boolean): void {
    const source = sourceNode;
    const gain = sourceGain;
    sourceNode = null;
    sourceGain = null;
    isSourcePlaying = false;
    if (!source) return;
    if (fade && audioContext) {
      const now = audioContext.currentTime;
      try {
        gain!.gain.cancelScheduledValues(now);
        gain!.gain.setValueAtTime(gain!.gain.value, now);
        gain!.gain.linearRampToValueAtTime(0, now + SOURCE_FADE_TIME_S);
        source.stop(now + SOURCE_FADE_TIME_S + 0.01);
      } catch {
        /* ignore */
      }
    } else {
      try { source.stop(); } catch { /* already stopped */ }
    }
    try { source.disconnect(); } catch { /* ignore */ }
    try { gain?.disconnect(); } catch { /* ignore */ }
  }

  async function playFromMusicPosition(positionSec: number): Promise<void> {
    if (!musicBuffer) return;
    const context = await ensureAudio();
    if (!musicGain) return;
    stopSource(true);
    const duration = musicBuffer.duration;
    const clamped = clamp(positionSec, 0, Math.max(0, duration - 0.01));
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = musicBuffer;
    source.playbackRate.value = settings.playbackSpeed;
    const startTime = context.currentTime + SOURCE_START_LEAD_TIME_S;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(1, startTime + SOURCE_FADE_TIME_S);
    source.connect(gain);
    gain.connect(musicGain);
    source.onended = () => {
      if (sourceNode === source) {
        sourceNode = null;
        sourceGain = null;
        isSourcePlaying = false;
        playbackClock.clear();
      }
    };
    source.start(startTime, clamped);
    sourceNode = source;
    sourceGain = gain;
    isSourcePlaying = true;
    const audibleAt = getAudioContextOutputTime(context) + SOURCE_START_LEAD_TIME_S;
    playbackClock.set(audibleAt, clamped, settings.playbackSpeed);
  }

  function applySettings(): void {
    elements.multiHint.setAttribute('aria-pressed', String(settings.multiHint));
    if (musicGain) musicGain.gain.value = settings.volume;
    renderer.setSettings({ ...settings, lineColor: settings.lineColor as LineColorKey });
    if (hitSoundGain) hitSoundGain.gain.value = settings.hitSoundVolume;
    if (settings.hitSoundVolume <= 0) stopActiveHitSounds();
  }

  function persistSettings(): void {
    postStatus('settings', { ...settings });
  }

  async function loadNoteAssets(signal: AbortSignal): Promise<NoteAssets> {
    const entries = await Promise.all([
      ['normal', 'tap', 'Tap2.png'], ['normal', 'drag', 'Drag.png'], ['normal', 'flick', 'Flick2.png'], ['normal', 'hold', 'Hold2.png'],
      ['multi', 'tap', 'Tap2HL.png'], ['multi', 'drag', 'DragHL.png'], ['multi', 'flick', 'Flick2HL.png'], ['multi', 'hold', 'Hold2HL.png'],
      ['shared', 'fx', 'hit.png'],
    ].map(async ([group, kind, file]) => [group, kind, await loadImage(`${SKIN_BASE}${file}`, signal)] as const));
    return entries.reduce<NoteAssets>((assets, [group, kind, image]) => {
      if (group === 'shared') assets.fx = image;
      else assets[group][kind] = image;
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

  async function ensureHitSoundsReady(): Promise<void> {
    if (!config.hitSounds) throw new Error('打击音资源尚未提供');
    if (!hitSoundBuffers) {
      const context = await ensureAudio();
      const entries = await Promise.all((['click', 'drag', 'flick'] as HitSoundKind[]).map(async (kind) => {
        const dataUrl = config.hitSounds?.[kind];
        if (!dataUrl) throw new Error(`缺少打击音 ${kind}`);
        const bytes = decodeBase64DataUrl(dataUrl);
        try {
          return [kind, await context.decodeAudioData(bytes)] as const;
        } catch (error) {
          throw new Error(`${kind}.wav Web Audio 解码失败（${bytes.byteLength} bytes）：${error instanceof Error ? error.message : String(error)}`);
        }
      }));
      hitSoundBuffers = Object.fromEntries(entries);
    }
  }

  function resetHitSoundTimeline(time: number): void {
    hitSoundCursor = findHitSoundCursor(hitSoundEvents, time);
    lastHitSoundTime = time;
  }

  function playHitSound(kind: HitSoundKind, delay: number, outputNow: number): void {
    const buffer = hitSoundBuffers?.[kind];
    if (!buffer || !audioContext || !hitSoundGain || settings.hitSoundVolume <= 0) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(hitSoundGain);
    // 与舞萌正解音调度一致：以输出端时间为参考，且不早于当前调度时刻。
    const scheduledAt = Math.max(audioContext.currentTime, outputNow + delay);
    source.addEventListener('ended', () => activeHitSounds.delete(source), { once: true });
    activeHitSounds.add(source);
    source.start(scheduledAt);
  }

  function stopActiveHitSounds(): void {
    activeHitSounds.forEach((source) => {
      try { source.stop(); } catch { /* source may already have ended */ }
    });
    activeHitSounds.clear();
  }

  function updateHitSounds(time: number): void {
    if (!ready || !isPlaying || !hitSoundBuffers || !audioContext) return;
    if (!Number.isFinite(lastHitSoundTime) || time < lastHitSoundTime || time - lastHitSoundTime > 0.25) {
      stopActiveHitSounds();
      resetHitSoundTimeline(time);
      return;
    }
    const outputNow = getAudioContextOutputTime(audioContext);
    const speed = playbackClock.schedulingSpeed(settings.playbackSpeed);
    const horizon = time + HIT_SOUND_LOOKAHEAD_SECONDS * speed;
    while (hitSoundCursor < hitSoundEvents.length && hitSoundEvents[hitSoundCursor]!.time <= horizon) {
      const event = hitSoundEvents[hitSoundCursor]!;
      const delay = hitSoundScheduleDelay(event.time, time, speed);
      playHitSound(event.sound, delay, outputNow);
      hitSoundCursor += 1;
    }
    lastHitSoundTime = time;
  }

  // ---- 舞萌式时间轴 ----
  function buildTimeline(): void {
    elements.timelineBars.replaceChildren();
    if (chartDuration <= 0) return;
    const rect = elements.timelineHost.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const bucketCount = Math.min(200, w);
    const step = chartDuration / bucketCount;
    const buckets: Record<string, number>[] = Array.from({ length: bucketCount }, (_, i) => ({
      startTime: i * step, tap: 0, drag: 0, hold: 0, flick: 0, total: 0,
    }));
    for (const note of timelineNotes) {
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(note.time / step)));
      const b = buckets[idx]!;
      if (note.kind === 'drag') b.drag += 1;
      else if (note.kind === 'hold') b.hold += 1;
      else if (note.kind === 'flick') b.flick += 1;
      else b.tap += 1;
      b.total += 1;
    }
    let maxTotal = 1;
    for (const b of buckets) { if (b.total > maxTotal) maxTotal = b.total; }
    const barH = 22;
    for (const b of buckets) {
      if (b.total === 0) continue;
      const h = Math.max(2, (b.total / maxTotal) * barH);
      const left = ((b.startTime / chartDuration) * 100).toFixed(2);
      const widthPct = ((step / chartDuration) * 100).toFixed(2);
      const bar = document.createElement('div');
      bar.className = 'timeline-bar';
      bar.style.left = `${left}%`;
      bar.style.width = `${widthPct}%`;
      bar.style.height = `${h}px`;
      for (const key of ['tap', 'drag', 'hold', 'flick'] as const) {
        const ratio = b[key] / b.total;
        if (ratio === 0) continue;
        const seg = document.createElement('div');
        seg.style.flex = String(ratio);
        seg.style.width = '100%';
        seg.style.backgroundColor = NOTE_BAR_COLORS[key]!;
        bar.appendChild(seg);
      }
      elements.timelineBars.appendChild(bar);
    }

    elements.timelineRuler.replaceChildren();
    const rulerRect = elements.timelineRuler.getBoundingClientRect();
    const rw = Math.max(1, rulerRect.width);
    const total = Math.max(1, chartDuration);
    const tickStep = [1, 5, 10, 15, 30, 60, 120, 300].find((s) => (rw * s) / total >= 4) ?? 300;
    const labelStep = [5, 10, 15, 30, 60, 120, 300, 600].find((s) => (rw * s) / total >= 24) ?? 600;
    for (let t = 0; t <= chartDuration; t += tickStep) {
      const pct = ((t / total) * 100).toFixed(2);
      const isMajor = t % labelStep === 0;
      const isMedium = Number.isInteger(t / (labelStep / 2));
      const cls = isMajor ? 'major' : isMedium ? 'medium' : 'minor';
      const tick = document.createElement('div');
      tick.className = `timeline-tick ${cls}`;
      tick.style.left = `${pct}%`;
      elements.timelineRuler.appendChild(tick);
      if (isMajor) {
        const label = document.createElement('div');
        label.className = 'timeline-label';
        label.style.left = `${pct}%`;
        label.textContent = formatTime(t);
        elements.timelineRuler.appendChild(label);
      }
    }
  }

  function updatePlayhead(chartTime: number): void {
    if (chartDuration <= 0) return;
    const pct = Math.min(100, Math.max(0, (chartTime / chartDuration) * 100));
    elements.timelinePlayhead.style.left = `${pct}%`;
    elements.timelineBadge.style.left = `${pct}%`;
    elements.timelineBadge.textContent = formatTime(chartTime);
  }

  function seekFromTimelineEvent(event: PointerEvent): void {
    const rect = elements.timelineHost.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    seekToChartTime((pct / 100) * chartDuration);
  }

  function renderHud(chartTime: number): void {
    const passed = upperBound(completionTimes, chartTime);
    const total = Math.max(1, completionTimes.length);
    elements.gameProgress.style.width = `${Math.min(100, chartTime / Math.max(1, chartDuration) * 100)}%`;
    elements.score.textContent = String(Math.floor(passed / total * 1_000_000)).padStart(7, '0');
    elements.combo.textContent = String(passed);
    elements.comboBlock.classList.toggle('is-visible', passed >= 3);
    elements.timeLabel.textContent = `${formatTime(chartTime)} / ${formatTime(chartDuration)}`;
    updatePlayhead(chartTime);
  }

  function renderFrame(chartTime: number): void {
    updateHitSounds(chartTime);
    renderer.render(chartTime);
    applyAttachUiFromRenderer();
    renderHud(chartTime);
  }

  async function loadPreview(): Promise<void> {
    loadController?.abort();
    loadController = new AbortController();
    const { signal } = loadController;
    ready = false;
    isPlaying = false;
    setControlsEnabled(false);
    try {
      setStatus('正在读取谱面资源…');
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
      setStatus('正在解析谱面…');
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
      setStatus('正在准备音乐与曲绘…');
      const rpeChart = isRpe ? (chart as RpeChart) : null;
      const [noteAssets, chartAssets] = await Promise.all([
        loadNoteAssets(signal),
        rpeChart ? loadRpeChartAssets(rpeChart, signal) : Promise.resolve(null),
        decodeMusic(signal),
      ]);
      if (signal.aborted) return;
      // RPE：背景优先取谱面包内 META.background，缺失时回退远程曲绘
      let illustration = image;
      if (rpeChart?.background) {
        const basePath = config.rpeAssets?.basePath ?? '';
        try {
          illustration = await loadImage(`${basePath}${rpeChart.background}`, signal);
        } catch {
          /* 回退远程曲绘 */
        }
      }
      if (isRpe) {
        (renderer as RpeRenderer).setChart(rpeChart!);
        (renderer as RpeRenderer).setChartAssets(chartAssets!);
        chartOffset = rpeChart!.offset;
        chartDuration = rpeChart!.stats.maxTime;
        hitSoundEvents = buildHitSoundEvents({
          lines: rpeChart!.lines.map((line) => ({
            notes: line.notes
              .filter((note) => !note.isFake)
              .map((note) => ({ kind: note.kind, time: note.hitTime })),
          })),
        });
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
        chartOffset = pgrChart.offset;
        chartDuration = pgrChart.stats.maxTime;
        hitSoundEvents = buildHitSoundEvents(pgrChart);
        completionTimes = pgrChart.lines
          .flatMap((line) => line.notes.map((note) => note.kind === 'hold' ? note.endTime : note.time))
          .sort((a, b) => a - b);
        timelineNotes = pgrChart.lines
          .flatMap((line) => line.notes.map((note) => ({ time: note.time, kind: note.kind })))
          .sort((a, b) => a.time - b.time);
      }
      hitSoundCursor = 0;
      lastHitSoundTime = -1e-6;
      renderer.setIllustration(illustration);
      renderer.setNoteAssets(noteAssets);
      renderer.setSettings({ ...settings, lineColor: settings.lineColor as LineColorKey });
      buildTimeline();
      if (musicBuffer) setStatus('');
      ready = true;
      setControlsEnabled(true);
      renderFrame(0);
      postStatus('ready', {});
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setStatus(error instanceof Error ? error.message : '无法打开谱面');
      postStatus('error', { message: error instanceof Error ? error.message : '谱面播放失败' });
    }
  }

  function syncPlayButtons(): void {
    elements.playIcon.innerHTML = isPlaying
      ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>'
      : '<path d="M8 5v14l11-7z"/>';
    elements.play.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
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

  function seekToChartTime(target: number): void {
    const clamped = clamp(target, 0, chartDuration);
    currentChartTime = clamped;
    stopActiveHitSounds();
    resetHitSoundTimeline(clamped);
    if (isPlaying) {
      if (musicBuffer && clamped + chartOffset < musicBuffer.duration - MUSIC_END_EPSILON_S) {
        void playFromMusicPosition(clamped + chartOffset);
      } else {
        stopSource(true);
        lastRafTs = performance.now();
      }
    } else {
      playbackClock.setOffset(clamped + chartOffset);
    }
    renderer.resetTimeline(clamped);
    renderer.render(clamped);
    applyAttachUiFromRenderer();
    renderHud(clamped);
  }

  function finishPlayback(): void {
    isPlaying = false;
    stopSource(true);
    stopActiveHitSounds();
    currentChartTime = chartDuration;
    syncPlayButtons();
    lastRafTs = 0;
    renderer.render(chartDuration);
    applyAttachUiFromRenderer();
    renderHud(chartDuration);
    showControls();
  }

  function tick(timestamp: number): void {
    if (!isPlaying) return;
    let chartTime = currentChartTime;
    if (musicBuffer && isSourcePlaying && audioContext) {
      const musicTime = getMusicTime();
      if (musicTime >= musicBuffer.duration - MUSIC_END_EPSILON_S) {
        stopSource(true);
      } else {
        chartTime = Math.max(0, musicTime - chartOffset);
      }
    } else {
      if (lastRafTs > 0) {
        chartTime += ((timestamp - lastRafTs) / 1000) * settings.playbackSpeed;
      }
      lastRafTs = timestamp;
    }
    if (chartTime >= chartDuration + CHART_END_EPSILON_S) {
      finishPlayback();
      return;
    }
    currentChartTime = chartTime;
    renderFrame(chartTime);
    rafId = requestAnimationFrame(tick);
  }

  async function startPlayback(): Promise<void> {
    try {
      await ensureAudio();
      try {
        await ensureHitSoundsReady();
      } catch {
        /* 打击音解码失败不影响播放 */
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '没有开始播放音乐');
      return;
    }
    if (currentChartTime >= chartDuration - 0.05) currentChartTime = 0;
    isPlaying = true;
    syncPlayButtons();
    showControls();
    lastRafTs = 0;
    resetHitSoundTimeline(currentChartTime);
    if (musicBuffer && currentChartTime + chartOffset < musicBuffer.duration - MUSIC_END_EPSILON_S) {
      await playFromMusicPosition(currentChartTime + chartOffset);
    } else {
      stopSource(true);
      lastRafTs = performance.now();
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function pausePlayback(): void {
    isPlaying = false;
    syncPlayButtons();
    if (isSourcePlaying) {
      playbackClock.setOffset(getMusicTime());
      stopSource(false);
    }
    stopActiveHitSounds();
    resetHitSoundTimeline(currentChartTime);
    cancelAnimationFrame(rafId);
    lastRafTs = 0;
    renderer.render(currentChartTime);
    applyAttachUiFromRenderer();
    renderHud(currentChartTime);
    showControls();
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

  // HUD 随播放窗（16:9 舞台）宽度缩放，比例沿用 demo 的 clamp 视觉范围。
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
    if (isPlaying) pausePlayback();
    else void startPlayback();
  });
  elements.btnRestart.addEventListener('click', () => {
    if (!ready) return;
    seekToChartTime(0);
    if (!isPlaying) renderFrame(0);
  });
  elements.btnStepBack.addEventListener('click', () => {
    if (!ready) return;
    seekToChartTime(currentChartTime - STEP_SECONDS);
  });
  elements.btnStepForward.addEventListener('click', () => {
    if (!ready) return;
    seekToChartTime(currentChartTime + STEP_SECONDS);
  });

  elements.timelineHost.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    timelineDragging = true;
    wasPlayingBeforeDrag = isPlaying;
    if (isPlaying) pausePlayback();
    seekFromTimelineEvent(e);
  });
  document.addEventListener('pointermove', (e) => {
    if (!timelineDragging) return;
    seekFromTimelineEvent(e);
  });
  document.addEventListener('pointerup', () => {
    if (!timelineDragging) return;
    timelineDragging = false;
    if (wasPlayingBeforeDrag) void startPlayback();
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
      if (isPlaying && isSourcePlaying && audioContext && sourceNode) {
        const now = audioContext.currentTime;
        const musicTime = getMusicTime();
        sourceNode.playbackRate.setValueAtTime(value, now);
        playbackClock.appendSegment(now, value, musicTime);
      }
      applySettings();
      persistSettings();
      if (!isPlaying) renderFrame(currentChartTime);
    },
    0.5, 2, 0.05, settings.playbackSpeed, undefined, (value) => `${value.toFixed(2)}×`,
  );
  setupWheelPopup(
    $('note-size-trigger'), $('note-size-popup'), $('note-size-wheel'), $('note-size-list'), $('note-size-val'),
    (value) => {
      settings.noteScale = value;
      applySettings();
      persistSettings();
      if (!isPlaying) renderFrame(currentChartTime);
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
      if (!isPlaying) renderFrame(currentChartTime);
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
      if (!isPlaying) renderFrame(currentChartTime);
    },
    0, LINE_COLOR_LABELS.length - 1, 1, Math.max(0, LINE_COLORS.indexOf(settings.lineColor)), LINE_COLOR_LABELS,
  );

  elements.multiHint.addEventListener('click', () => {
    if (!ready) return;
    settings.multiHint = !settings.multiHint;
    applySettings();
    persistSettings();
    if (!isPlaying) renderFrame(currentChartTime);
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
    const data = event.data as { type?: string } | undefined;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'exit-fullscreen') setFullscreen(false);
    if (data.type === 'stop') pausePlayback();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isPlaying) pausePlayback();
  });

  applySettings();
  syncPlayButtons();
  void loadPreview();
}

start();
