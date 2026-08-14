/**
 * Phigros / Phira 谱面确认 WebView 播放器入口。
 * 谱面解析与渲染移植自 demo/phigros-chart-preview（pgr-core/renderer/hit-sound），
 * 对时与性能方案对齐舞萌谱面确认播放器：
 * - 音乐解码为 AudioBuffer，经 AudioBufferSourceNode 在 AudioContext 时钟上播放，
 *   不使用 HTMLMediaElement 时钟（其 currentTime 有延迟抖动，seek/暂停恢复漂移大）；
 * - PlaybackClock 分段时钟记录播放起点与倍速变化，任意时刻反查精确音乐位置；
 * - 视觉与打击音统一使用 getAudioContextOutputTime 的输出端时间（贴合实际听感）；
 * - 仅播放中常驻 rAF 渲染；暂停/拖动按事件渲染，画布 DPR 封顶与全屏像素预算；
 * - 主线程解析 PGR（WebView file:// 下不使用 Worker）。
 * 观赏播放不包含触控判定与真实计分。
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
import { PlaybackClock } from './playbackClock';
import { getAudioContextOutputTime } from './audioClock';

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
/** 与舞萌播放器一致的音频调度常量。 */
const SOURCE_START_LEAD_TIME_S = 0.05;
const SOURCE_FADE_TIME_S = 0.015;
const MUSIC_END_EPSILON_S = 0.05;
const CHART_END_EPSILON_S = 0.25;

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

function start(): void {
  const elements = {
    stage: $('stage'),
    canvas: $('chart-canvas') as HTMLCanvasElement,
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
  const playbackClock = new PlaybackClock();
  let loadController: AbortController | null = null;
  let ready = false;
  let seeking = false;
  let isPlaying = false;
  let isFullscreen = false;
  let rafId = 0;
  let lastRafTs = 0;
  let currentChartTime = 0;
  let chartOffset = 0;
  let chartDuration = 0;
  let completionTimes: number[] = [];
  let controlsTimer = 0;
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
      elements.status.textContent = `${error instanceof Error ? error.message : '谱面音乐不可用'}（仍可静音看谱）`;
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
    if (musicGain) musicGain.gain.value = settings.volume;
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
    if (!buffer || !audioContext || !hitSoundGain || !settings.hitSound || settings.hitSoundVolume <= 0) return;
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

  function renderHud(chartTime: number): void {
    const passed = upperBound(completionTimes, chartTime);
    const total = Math.max(1, completionTimes.length);
    elements.gameProgress.style.width = `${Math.min(100, chartTime / Math.max(1, chartDuration) * 100)}%`;
    elements.score.textContent = String(Math.floor(passed / total * 1_000_000)).padStart(7, '0');
    elements.combo.textContent = String(passed);
    elements.comboBlock.classList.toggle('is-visible', passed >= 3);
    if (!seeking) {
      elements.seek.value = String(chartTime);
      elements.currentTime.textContent = formatTime(chartTime);
    }
  }

  function renderFrame(chartTime: number): void {
    updateHitSounds(chartTime);
    renderer.render(chartTime);
    renderHud(chartTime);
  }

  async function loadPreview(): Promise<void> {
    loadController?.abort();
    loadController = new AbortController();
    const { signal } = loadController;
    ready = false;
    isPlaying = false;
    setControlsEnabled(false);
    elements.loadPanel.classList.remove('is-hidden');
    elements.start.disabled = true;
    elements.start.hidden = false;
    elements.retry.hidden = true;
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
      setStage('BUFFERING', '正在准备音乐与曲绘', `${chart.stats.noteCount} notes · ${chart.stats.lineCount} lines`);
      const [noteAssets] = await Promise.all([
        loadNoteAssets(signal),
        decodeMusic(signal),
      ]);
      if (signal.aborted) return;
      renderer.setChart(chart);
      chartOffset = chart.offset;
      chartDuration = chart.stats.maxTime;
      renderer.setIllustration(image);
      renderer.setNoteAssets(noteAssets);
      renderer.setSettings({ ...settings, lineColor: settings.lineColor as LineColorKey });
      hitSoundEvents = buildHitSoundEvents(chart);
      hitSoundCursor = 0;
      lastHitSoundTime = -1e-6;
      completionTimes = chart.lines
        .flatMap((line) => line.notes.map((note) => note.kind === 'hold' ? note.endTime : note.time))
        .sort((a, b) => a - b);
      elements.seek.max = String(chartDuration);
      elements.duration.textContent = formatTime(chartDuration);
      if (musicBuffer) elements.status.textContent = '';
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

  function syncPlayButtons(): void {
    elements.playIcon.textContent = isPlaying ? 'Ⅱ' : '▶';
    elements.play.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
  }

  function scheduleControlsHide(): void {
    window.clearTimeout(controlsTimer);
    elements.controls.classList.remove('hidden');
    if (isFullscreen && isPlaying) {
      controlsTimer = window.setTimeout(() => elements.controls.classList.add('hidden'), 1800);
    }
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
    renderHud(chartDuration);
    scheduleControlsHide();
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
      elements.loadPanel.classList.remove('is-hidden');
      setStage('PLAYBACK FAILED', '没有开始播放音乐', error instanceof Error ? error.message : String(error));
      return;
    }
    if (currentChartTime >= chartDuration - 0.05) currentChartTime = 0;
    isPlaying = true;
    syncPlayButtons();
    scheduleControlsHide();
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
    renderHud(currentChartTime);
    scheduleControlsHide();
  }

  function setFullscreen(active: boolean): void {
    isFullscreen = active;
    renderer.setFullscreen(active);
    document.body.classList.toggle('fullscreen', active);
    elements.fullscreen.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
    if (!active) elements.controls.classList.remove('hidden');
    scheduleControlsHide();
    postStatus('fullscreen', { active });
  }

  elements.start.addEventListener('click', () => {
    elements.loadPanel.classList.add('is-hidden');
    void startPlayback();
  });
  elements.retry.addEventListener('click', () => { void loadPreview(); });
  elements.play.addEventListener('click', () => {
    if (isPlaying) pausePlayback();
    else void startPlayback();
  });
  elements.seek.addEventListener('pointerdown', () => { seeking = true; });
  elements.seek.addEventListener('pointerup', () => { seeking = false; });
  elements.seek.addEventListener('input', () => {
    seekToChartTime(Number(elements.seek.value));
    elements.currentTime.textContent = formatTime(currentChartTime);
  });
  elements.speed.addEventListener('input', () => {
    settings.playbackSpeed = Number(elements.speed.value);
    // 播放中改变倍速：采样级同步（与舞萌一致），不打断当前声源。
    if (isPlaying && isSourcePlaying && audioContext && sourceNode) {
      const now = audioContext.currentTime;
      const musicTime = getMusicTime();
      sourceNode.playbackRate.setValueAtTime(settings.playbackSpeed, now);
      playbackClock.appendSegment(now, settings.playbackSpeed, musicTime);
    }
    applySettings();
    persistSettings();
    if (!isPlaying) renderFrame(currentChartTime);
  });
  elements.noteSize.addEventListener('input', () => {
    settings.noteScale = Number(elements.noteSize.value);
    applySettings();
    persistSettings();
    if (!isPlaying) renderFrame(currentChartTime);
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
    if (!isPlaying) renderFrame(currentChartTime);
  });
  elements.multiHint.addEventListener('change', () => {
    settings.multiHint = elements.multiHint.checked;
    applySettings();
    persistSettings();
    if (!isPlaying) renderFrame(currentChartTime);
  });
  elements.lineColor.addEventListener('change', () => {
    settings.lineColor = elements.lineColor.value;
    applySettings();
    persistSettings();
    if (!isPlaying) renderFrame(currentChartTime);
  });
  elements.hitSound.addEventListener('change', () => {
    stopActiveHitSounds();
    settings.hitSound = elements.hitSound.checked;
    applySettings();
    persistSettings();
    resetHitSoundTimeline(currentChartTime);
    if (!isPlaying) renderFrame(currentChartTime);
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
    } else if (isPlaying) {
      elements.controls.classList.add('hidden');
    }
  });

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
