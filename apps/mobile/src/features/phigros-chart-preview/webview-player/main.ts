/**
 * Phigros / Phira 谱面确认 WebView 播放器入口。
 * 移植自 demo/phigros-chart-preview 的 app.js 与 pgr-worker.js：
 * 以 <audio>.currentTime - chart.offset 为唯一谱面时钟，
 * 主线程解析 PGR（WebView file:// 下不使用 Worker），
 * 音乐经 Web Audio 与打击音共用输出图，观赏播放不包含触控判定与真实计分。
 */

import { PgrRenderer, type LineColorKey, type NoteAssets } from './renderer';
import { parsePgrChart, type PgrChart } from './pgr-core';
import {
  buildHitSoundEvents,
  findHitSoundCursor,
  HIT_SOUND_LOOKAHEAD_SECONDS,
  hitSoundScheduleDelay,
  type HitSoundEvent,
  type HitSoundKind,
} from './hit-sound';

declare global {
  interface Window {
    __PHIGROS_CHART_PREVIEW__?: PhigrosChartPreviewConfig;
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
  hitSound?: boolean;
  hitSoundVolume?: number;
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
}

const DEFAULT_SETTINGS: Required<PhigrosChartPreviewSettings> = Object.freeze({
  playbackSpeed: 1,
  noteScale: 1,
  volume: 1,
  backgroundDim: 0.55,
  multiHint: true,
  lineColor: 'white',
  hitSound: true,
  hitSoundVolume: 1,
});

const SKIN_BASE = './skin/';
const LINE_COLORS: readonly string[] = ['white', 'gold', 'blue'];

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

function loadSettings(raw: PhigrosChartPreviewSettings | null | undefined): Required<PhigrosChartPreviewSettings> {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    playbackSpeed: bounded(source.playbackSpeed, 0.5, 2, DEFAULT_SETTINGS.playbackSpeed),
    noteScale: bounded(source.noteScale, 0.6, 1.8, DEFAULT_SETTINGS.noteScale),
    volume: bounded(source.volume, 0, 1, DEFAULT_SETTINGS.volume),
    backgroundDim: bounded(source.backgroundDim, 0.2, 0.85, DEFAULT_SETTINGS.backgroundDim),
    multiHint: typeof source.multiHint === 'boolean' ? source.multiHint : DEFAULT_SETTINGS.multiHint,
    lineColor: LINE_COLORS.includes(source.lineColor ?? '') ? source.lineColor! : DEFAULT_SETTINGS.lineColor,
    hitSound: typeof source.hitSound === 'boolean' ? source.hitSound : DEFAULT_SETTINGS.hitSound,
    hitSoundVolume: bounded(source.hitSoundVolume, 0, 1, DEFAULT_SETTINGS.hitSoundVolume),
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

async function waitForAudio(audio: HTMLAudioElement, signal: AbortSignal): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady);
      audio.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('谱面音乐无法加载或当前设备不支持该音频格式')); };
    const onAbort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    audio.addEventListener('loadedmetadata', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function start(): void {
  const elements = {
    stage: $('stage'),
    canvas: $('chart-canvas') as HTMLCanvasElement,
    audio: $('music') as HTMLAudioElement,
    loadPanel: $('load-panel'),
    loadKicker: $('load-kicker'),
    loadTitle: $('load-title'),
    loadDetail: $('load-detail'),
    start: $('start-button') as HTMLButtonElement,
    retry: $('retry-button') as HTMLButtonElement,
    play: $('play-button') as HTMLButtonElement,
    playIcon: $('play-icon'),
    seek: $('seek') as HTMLInputElement,
    currentTime: $('current-time'),
    duration: $('duration'),
    fullscreen: $('fullscreen-button') as HTMLButtonElement,
    fieldset: $('settings-fieldset') as HTMLFieldSetElement,
    speed: $('playback-speed') as HTMLInputElement,
    speedOutput: $('speed-output') as HTMLOutputElement,
    noteSize: $('note-size') as HTMLInputElement,
    noteSizeOutput: $('note-size-output') as HTMLOutputElement,
    volume: $('volume') as HTMLInputElement,
    volumeOutput: $('volume-output') as HTMLOutputElement,
    dim: $('background-dim') as HTMLInputElement,
    dimOutput: $('dim-output') as HTMLOutputElement,
    multiHint: $('multi-hint') as HTMLInputElement,
    lineColor: $('line-color') as HTMLSelectElement,
    hitSound: $('hit-sound') as HTMLInputElement,
    hitSoundVolume: $('hit-sound-volume') as HTMLInputElement,
    hitSoundVolumeOutput: $('hit-sound-volume-output') as HTMLOutputElement,
    gameProgress: $('game-progress-fill'),
    score: $('score-display'),
    comboBlock: $('combo-block'),
    combo: $('combo-display'),
    controls: $('controls'),
    title: $('title'),
    status: $('status'),
  };

  const renderer = new PgrRenderer(elements.canvas);
  const config = window.__PHIGROS_CHART_PREVIEW__ ?? {};
  let settings = loadSettings(config.settings);
  let loadController: AbortController | null = null;
  let ready = false;
  let seeking = false;
  let completionTimes: number[] = [];
  let controlsTimer = 0;
  let hitSoundBuffers: Partial<Record<HitSoundKind, AudioBuffer>> | null = null;
  let hitSoundContext: AudioContext | null = null;
  let musicMediaSource: MediaElementAudioSourceNode | null = null;
  let hitSoundGain: GainNode | null = null;
  const activeHitSounds = new Set<AudioBufferSourceNode>();
  let hitSoundEvents: HitSoundEvent[] = [];
  let hitSoundCursor = 0;
  let lastHitSoundTime = -1e-6;
  let isFullscreen = false;
  let chartOffset = 0;

  if (config.title) elements.title.textContent = config.title;
  elements.status.textContent = config.game === 'phira' ? 'Phira 谱面' : config.game === 'phigros' ? 'Phigros 谱面' : '';

  function setStage(kicker: string, title: string, detail: string): void {
    elements.loadKicker.textContent = kicker;
    elements.loadTitle.textContent = title;
    elements.loadDetail.textContent = detail;
  }

  function setControlsEnabled(value: boolean): void {
    elements.play.disabled = !value;
    elements.seek.disabled = !value;
    elements.fullscreen.disabled = !value;
    elements.fieldset.disabled = !value;
  }

  function applySettings(): void {
    elements.speed.value = String(settings.playbackSpeed);
    elements.noteSize.value = String(settings.noteScale);
    elements.volume.value = String(settings.volume);
    elements.dim.value = String(settings.backgroundDim);
    elements.multiHint.checked = settings.multiHint;
    elements.lineColor.value = settings.lineColor;
    elements.hitSound.checked = settings.hitSound;
    elements.hitSoundVolume.value = String(settings.hitSoundVolume);
    elements.speedOutput.value = `${settings.playbackSpeed.toFixed(2)}×`;
    elements.noteSizeOutput.value = `${settings.noteScale.toFixed(2)}×`;
    elements.volumeOutput.value = `${Math.round(settings.volume * 100)}%`;
    elements.dimOutput.value = `${Math.round(settings.backgroundDim * 100)}%`;
    elements.hitSoundVolumeOutput.value = `${Math.round(settings.hitSoundVolume * 100)}%`;
    elements.audio.playbackRate = settings.playbackSpeed;
    elements.audio.volume = settings.volume;
    renderer.setSettings({ ...settings, lineColor: settings.lineColor as LineColorKey });
    if (hitSoundGain) hitSoundGain.gain.value = settings.hitSoundVolume;
    if (!settings.hitSound || settings.hitSoundVolume <= 0) stopActiveHitSounds();
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
    if (!hitSoundContext) {
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error('浏览器不支持 Web Audio');
      hitSoundContext = new AudioContextClass({ latencyHint: 'interactive' });
      hitSoundGain = hitSoundContext.createGain();
      hitSoundGain.gain.value = settings.hitSoundVolume;
      hitSoundGain.connect(hitSoundContext.destination);
    }
    await hitSoundContext.resume();
    if (!hitSoundBuffers) {
      const entries = await Promise.all((['click', 'drag', 'flick'] as HitSoundKind[]).map(async (kind) => {
        const dataUrl = config.hitSounds?.[kind];
        if (!dataUrl) throw new Error(`缺少打击音 ${kind}`);
        const bytes = decodeBase64DataUrl(dataUrl);
        try {
          return [kind, await hitSoundContext!.decodeAudioData(bytes)] as const;
        } catch (error) {
          throw new Error(`${kind}.wav Web Audio 解码失败（${bytes.byteLength} bytes）：${error instanceof Error ? error.message : String(error)}`);
        }
      }));
      hitSoundBuffers = Object.fromEntries(entries);
    }
    if (!musicMediaSource) {
      musicMediaSource = hitSoundContext.createMediaElementSource(elements.audio);
      musicMediaSource.connect(hitSoundContext.destination);
    }
  }

  function resetHitSoundTimeline(time: number): void {
    hitSoundCursor = findHitSoundCursor(hitSoundEvents, time);
    lastHitSoundTime = time;
  }

  function playHitSound(kind: HitSoundKind, delay: number): void {
    const buffer = hitSoundBuffers?.[kind];
    if (!buffer || !hitSoundContext || !hitSoundGain || !settings.hitSound || settings.hitSoundVolume <= 0) return;
    const source = hitSoundContext.createBufferSource();
    source.buffer = buffer;
    source.connect(hitSoundGain);
    const scheduledAt = hitSoundContext.currentTime + delay;
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
    if (!ready || elements.audio.paused || !hitSoundBuffers || !hitSoundContext) return;
    if (!Number.isFinite(lastHitSoundTime) || time < lastHitSoundTime || time - lastHitSoundTime > 0.25) {
      stopActiveHitSounds();
      resetHitSoundTimeline(time);
      return;
    }
    const horizon = time + HIT_SOUND_LOOKAHEAD_SECONDS * settings.playbackSpeed;
    while (hitSoundCursor < hitSoundEvents.length && hitSoundEvents[hitSoundCursor]!.time <= horizon) {
      const event = hitSoundEvents[hitSoundCursor]!;
      const delay = hitSoundScheduleDelay(event.time, time, settings.playbackSpeed);
      playHitSound(event.sound, delay);
      hitSoundCursor += 1;
    }
    lastHitSoundTime = time;
  }

  async function loadPreview(): Promise<void> {
    loadController?.abort();
    loadController = new AbortController();
    const { signal } = loadController;
    ready = false;
    setControlsEnabled(false);
    elements.loadPanel.classList.remove('is-hidden');
    elements.start.disabled = true;
    elements.start.hidden = false;
    elements.retry.hidden = true;
    elements.audio.pause();
    elements.audio.removeAttribute('src');
    elements.audio.load();
    try {
      setStage('CONNECTING', '正在读取谱面资源', '正在确认谱面与音乐资源。');
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
      setStage('PROCESSING', '正在解析谱面', '计算速度积分、判定线事件和跨判定线多押。');
      const chart: PgrChart = await new Promise((resolve, reject) => {
        // 主线程解析：WebView file:// 下不使用 Worker，解析期间加载面板保持可见。
        window.setTimeout(() => {
          try { resolve(parsePgrChart(chartText)); } catch (error) { reject(error); }
        }, 0);
      });
      if (signal.aborted) return;
      if (typeof config.musicUrl !== 'string' || config.musicUrl.trim() === '') {
        throw new Error('未提供谱面音乐资源');
      }
      setStage('BUFFERING', '正在准备音乐与曲绘', `${chart.stats.noteCount} notes · ${chart.stats.lineCount} lines`);
      elements.audio.src = config.musicUrl;
      elements.audio.load();
      const [noteAssets] = await Promise.all([
        loadNoteAssets(signal),
        waitForAudio(elements.audio, signal),
      ]);
      if (signal.aborted) return;
      renderer.setChart(chart);
      chartOffset = chart.offset;
      renderer.setIllustration(image);
      renderer.setNoteAssets(noteAssets);
      renderer.setSettings({ ...settings, lineColor: settings.lineColor as LineColorKey });
      hitSoundEvents = buildHitSoundEvents(chart);
      hitSoundCursor = 0;
      lastHitSoundTime = -1e-6;
      completionTimes = chart.lines
        .flatMap((line) => line.notes.map((note) => note.kind === 'hold' ? note.endTime : note.time))
        .sort((a, b) => a - b);
      elements.seek.max = String(elements.audio.duration || chart.stats.maxTime + chart.offset);
      elements.duration.textContent = formatTime(elements.audio.duration);
      ready = true;
      setControlsEnabled(true);
      elements.start.disabled = false;
      setStage('READY', '谱面已就绪', `${chart.stats.noteCount} notes · ${chart.stats.lineCount} lines · ${chart.stats.eventCount} events`);
      postStatus('ready', {});
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      elements.start.hidden = true;
      elements.retry.hidden = false;
      setStage('LOAD FAILED', '无法打开谱面', error instanceof Error ? error.message : String(error));
      postStatus('error', { message: error instanceof Error ? error.message : '谱面播放失败' });
    }
  }

  async function togglePlayback(): Promise<void> {
    if (!ready) return;
    if (elements.audio.paused) {
      try {
        await ensureHitSoundsReady();
        await elements.audio.play();
      } catch (error) {
        elements.loadPanel.classList.remove('is-hidden');
        setStage('PLAYBACK FAILED', '没有开始播放音乐', error instanceof Error ? error.message : String(error));
      }
    } else elements.audio.pause();
  }

  function updatePlayState(): void {
    const paused = elements.audio.paused;
    if (paused) {
      stopActiveHitSounds();
      const chartTime = Math.max(0, elements.audio.currentTime - chartOffset);
      resetHitSoundTimeline(chartTime);
    }
    elements.playIcon.textContent = paused ? '▶' : 'Ⅱ';
    elements.play.setAttribute('aria-label', paused ? '播放' : '暂停');
    if (!paused) scheduleControlsHide();
  }

  function scheduleControlsHide(): void {
    window.clearTimeout(controlsTimer);
    elements.controls.classList.remove('hidden');
    if (isFullscreen && !elements.audio.paused) {
      controlsTimer = window.setTimeout(() => elements.controls.classList.add('hidden'), 1800);
    }
  }

  function resetTimelineAt(time: number): void {
    const chartTime = Math.max(0, time - chartOffset);
    renderer.resetTimeline(chartTime);
    resetHitSoundTimeline(chartTime);
  }

  function updateFrame(): void {
    const chartTime = Math.max(0, elements.audio.currentTime - chartOffset);
    updateHitSounds(chartTime);
    renderer.render(chartTime);
    const passed = upperBound(completionTimes, chartTime);
    const total = Math.max(1, completionTimes.length);
    elements.gameProgress.style.width = `${Math.min(100, elements.audio.currentTime / Math.max(1, elements.audio.duration) * 100)}%`;
    elements.score.textContent = String(Math.floor(passed / total * 1_000_000)).padStart(7, '0');
    elements.combo.textContent = String(passed);
    elements.comboBlock.classList.toggle('is-visible', passed >= 3);
    if (!seeking) {
      elements.seek.value = String(elements.audio.currentTime || 0);
      elements.currentTime.textContent = formatTime(elements.audio.currentTime);
    }
    requestAnimationFrame(updateFrame);
  }

  function setFullscreen(active: boolean): void {
    isFullscreen = active;
    document.body.classList.toggle('fullscreen', active);
    elements.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    if (!active) elements.controls.classList.remove('hidden');
    scheduleControlsHide();
    postStatus('fullscreen', { active });
  }

  elements.start.addEventListener('click', async () => {
    elements.loadPanel.classList.add('is-hidden');
    await togglePlayback();
  });
  elements.retry.addEventListener('click', () => { void loadPreview(); });
  elements.play.addEventListener('click', () => { void togglePlayback(); });
  elements.audio.addEventListener('play', updatePlayState);
  elements.audio.addEventListener('pause', updatePlayState);
  elements.audio.addEventListener('ended', updatePlayState);
  elements.audio.addEventListener('durationchange', () => {
    if (!Number.isFinite(elements.audio.duration)) return;
    elements.seek.max = String(elements.audio.duration);
    elements.duration.textContent = formatTime(elements.audio.duration);
  });
  elements.seek.addEventListener('pointerdown', () => { seeking = true; });
  elements.seek.addEventListener('pointerup', () => { seeking = false; });
  elements.seek.addEventListener('input', () => {
    stopActiveHitSounds();
    elements.audio.currentTime = Number(elements.seek.value);
    elements.currentTime.textContent = formatTime(elements.audio.currentTime);
    resetTimelineAt(elements.audio.currentTime);
  });
  elements.speed.addEventListener('input', () => {
    stopActiveHitSounds();
    settings.playbackSpeed = Number(elements.speed.value);
    applySettings();
    persistSettings();
    resetTimelineAt(elements.audio.currentTime);
  });
  elements.noteSize.addEventListener('input', () => {
    settings.noteScale = Number(elements.noteSize.value);
    applySettings();
    persistSettings();
  });
  elements.volume.addEventListener('input', () => {
    settings.volume = Number(elements.volume.value);
    applySettings();
    persistSettings();
  });
  elements.dim.addEventListener('input', () => {
    settings.backgroundDim = Number(elements.dim.value);
    applySettings();
    persistSettings();
  });
  elements.multiHint.addEventListener('change', () => {
    settings.multiHint = elements.multiHint.checked;
    applySettings();
    persistSettings();
  });
  elements.lineColor.addEventListener('change', () => {
    settings.lineColor = elements.lineColor.value;
    applySettings();
    persistSettings();
  });
  elements.hitSound.addEventListener('change', () => {
    stopActiveHitSounds();
    settings.hitSound = elements.hitSound.checked;
    applySettings();
    persistSettings();
    resetTimelineAt(elements.audio.currentTime);
  });
  elements.hitSoundVolume.addEventListener('input', () => {
    settings.hitSoundVolume = Number(elements.hitSoundVolume.value);
    applySettings();
    persistSettings();
  });
  elements.fullscreen.addEventListener('click', () => setFullscreen(!isFullscreen));
  elements.stage.addEventListener('pointerdown', () => {
    if (!isFullscreen) return;
    if (elements.controls.classList.contains('hidden')) {
      elements.controls.classList.remove('hidden');
    } else if (!elements.audio.paused) {
      elements.controls.classList.add('hidden');
    }
  });

  window.addEventListener('message', (event) => {
    const data = event.data as { type?: string } | undefined;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'exit-fullscreen') setFullscreen(false);
    if (data.type === 'stop') {
      elements.audio.pause();
      stopActiveHitSounds();
    }
  });

  applySettings();
  updatePlayState();
  requestAnimationFrame(updateFrame);
  void loadPreview();
}

start();
