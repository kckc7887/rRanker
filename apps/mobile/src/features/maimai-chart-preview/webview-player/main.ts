/**
 * 舞萌谱面确认 WebView 播放器入口。
 * 音乐时钟与正解音边界对齐水鱼：音乐唯一时钟，AudioManager 只管正解音。
 */
import {
  AudioManager,
  ANSWER_SOUND_BASE_OFFSET_MS,
  MainRenderer,
  getAudioContextOutputTime,
  getAvailableDifficulties,
  parseSimaiChart,
  parseSimaiBuddyCharts,
  parseSimaiSideChart,
  prepareAudioEvents,
  type Chart,
  type ChartDifficulty,
  type PreparedAudioEvent,
} from '../engine';
import { PlaybackClock } from '../../chart-preview-shared/webview-player/playbackClock';
import { CHART_PREVIEW_DUAL_GAP, chartPreviewCanvasSize } from './fullscreenLayout';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';
import {
  beatsToMs,
  calculateMusicTime,
  msToBeats,
  musicTimeToBeats,
} from './timeConversion';

declare global {
  interface Window {
    __CHART_PREVIEW__?: ChartPreviewConfig;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}

export interface ChartPreviewSettings {
  hiSpeed?: number;
  playbackSpeed?: number;
  musicVolume?: number;
  soundVolume?: number;
  mirrorMode?: string;
  judgmentLineDesign?: string;
  pinkSlideStart?: boolean;
  slideRotation?: boolean;
  highlightExNotes?: boolean;
  normalColorBreakSlide?: boolean;
  showHitEffect?: boolean;
  showFireworks?: boolean;
}

export interface ChartPreviewConfig {
  chartId: number;
  difficulty: ChartDifficulty;
  title?: string;
  settings?: ChartPreviewSettings | null;
  answerSoundUrl?: string;
  /** Buddy 宴谱预览侧：'0'=1P，'1'=2P，'dual'=1P+2P 同屏。 */
  buddySide?: '0' | '1' | 'dual';
  /** 播放器界面主题：由 RN 侧按应用深浅色注入。 */
  theme?: 'light' | 'dark';
}

const CHART_BASE = 'https://assets2.lxns.net/maimai/chart';
const MUSIC_BASE = 'https://assets2.lxns.net/maimai/music';
const SOURCE_FADE_TIME_S = 0.015;
const SOURCE_START_LEAD_TIME_S = 0.05;
const SCHEDULE_LOOKAHEAD_MS = 1500;
const MUSIC_END_EPSILON_S = 0.05;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

let activePopupClose: (() => void) | null = null;

function postStatus(type: string, payload: Record<string, unknown> = {}): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...payload }));
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const HI_SPEED_MIN = 0.1;
const HI_SPEED_MAX = 20;
const HI_SPEED_STEP = 0.1;
const HI_SPEED_DEFAULT = 6;
const SPEED_MIN = 0.1;
const SPEED_MAX = 5;
const SPEED_STEP = 0.1;
const SPEED_DEFAULT = 1;
const WHEEL_ITEM_HEIGHT = 28;

function buildWheelValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let value = min; value <= max + 1e-9; value += step) {
    values.push(Math.round(value * 10) / 10);
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
    return v.toFixed(1);
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
): { getValue: () => number } {
  const wheel = createWheel(viewport, list, (value) => {
    valSpan.textContent = labels ? (labels[value] ?? String(value)) : value.toFixed(1);
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

  valSpan.textContent = labels ? (labels[Math.round(initial)] ?? String(initial)) : initial.toFixed(1);

  return wheel;
}

async function main(): Promise<void> {
  const statusEl = $('status');
  const titleEl = $('title');
  const canvas = $('chart-canvas') as HTMLCanvasElement;
  const canvasWrap = $('canvas-wrap');
  const canvasStage = $('canvas-stage');
  const playBtn = $('play') as HTMLButtonElement;
  const btnPrevMeasure = $('btn-prev-measure') as HTMLButtonElement;
  const btnStepBack = $('btn-step-back') as HTMLButtonElement;
  const btnStepForward = $('btn-step-forward') as HTMLButtonElement;
  const btnNextMeasure = $('btn-next-measure') as HTMLButtonElement;
  const btnRestart = $('btn-restart') as HTMLButtonElement;
  const btnLoopA = $('btn-loop-a') as HTMLButtonElement;
  const btnLoopB = $('btn-loop-b') as HTMLButtonElement;
  const btnFullscreen = $('btn-fullscreen') as HTMLButtonElement;
  const fsOverlay = $('fs-overlay');
  const fsLock = $('fs-lock') as HTMLButtonElement;
  const fsTimelineHost = $('fs-timeline-host');
  const fsTimelineBars = $('fs-timeline-bars');
  const fsTimelineRuler = $('fs-timeline-ruler');
  const fsTimelinePlayhead = $('fs-timeline-playhead');
  const fsTimelineBadge = $('fs-timeline-badge');
  const fsTimeLabel = $('fs-time-label');
  const fsTransport = $('fs-transport');
  const fsLoopA = $('fs-loop-a') as HTMLButtonElement;
  const fsLoopB = $('fs-loop-b') as HTMLButtonElement;
  const timelineHost = $('timeline-host');
  const timelineBars = $('timeline-bars');
  const timelineRuler = $('timeline-ruler');
  const timelinePlayhead = $('timeline-playhead');
  const timelineBadge = $('timeline-badge');
  const timeLabel = $('time-label');
  const hiSpeedWheel = $('hi-speed-wheel');
  const hiSpeedList = $('hi-speed-list');
  const hiSpeedTrigger = $('hi-speed-trigger');
  const hiSpeedPopup = $('hi-speed-popup');
  const hiSpeedVal = $('hi-speed-val');
  const speedWheel = $('speed-wheel');
  const speedList = $('speed-list');
  const speedTrigger = $('speed-trigger');
  const speedPopup = $('speed-popup');
  const speedVal = $('speed-val');
  const musicVolumeWheel = $('music-vol-wheel');
  const musicVolumeList = $('music-vol-list') as HTMLDivElement;
  const musicVolumeTrigger = $('music-vol-trigger');
  const musicVolumePopup = $('music-vol-popup');
  const musicVolumeVal = $('music-vol-val');
  const soundVolumeWheel = $('sound-vol-wheel');
  const soundVolumeList = $('sound-vol-list') as HTMLDivElement;
  const soundVolumeTrigger = $('sound-vol-trigger');
  const soundVolumePopup = $('sound-vol-popup');
  const soundVolumeVal = $('sound-vol-val');
  const mirrorWheel = $('mirror-wheel');
  const mirrorList = $('mirror-list');
  const mirrorTrigger = $('mirror-trigger');
  const mirrorPopup = $('mirror-popup');
  const mirrorVal = $('mirror-val');
  const styleWheel = $('style-wheel');
  const styleList = $('style-list');
  const styleTrigger = $('style-trigger');
  const stylePopup = $('style-popup');
  const styleVal = $('style-val');
  const togglePink = $('toggle-pink') as HTMLButtonElement;
  const toggleStarRot = $('toggle-star-rot') as HTMLButtonElement;
  const toggleEx = $('toggle-ex') as HTMLButtonElement;
  const toggleBreakSlide = $('toggle-break-slide') as HTMLButtonElement;
  const toggleHit = $('toggle-hit') as HTMLButtonElement;
  const toggleFirework = $('toggle-firework') as HTMLButtonElement;
  const infoBpm = $('info-bpm');
  const infoBeat = $('info-beat');
  const infoCombo = $('info-combo');
  const infoBreak = $('info-break');
  const infoBreakNoex = $('info-break-noex') as HTMLSpanElement;
  const infoBreakWrap = $('info-break-wrap');
  const infoBreakNoexWrap = $('info-break-noex-wrap');
  const infoFps = $('info-fps');

  const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';

  let config: ChartPreviewConfig | undefined;
  statusEl.textContent = '正在等待参数…';
  for (let i = 0; i < 200; i++) {
    const incoming = window.__CHART_PREVIEW__;
    if (incoming && Number.isFinite(incoming.chartId)) {
      config = incoming;
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!config) {
    statusEl.textContent = '未收到谱面预览参数';
    postStatus('error', { message: '未收到谱面预览参数' });
    return;
  }

  titleEl.textContent = config.title?.trim() || `谱面 ${config.chartId}`;
  statusEl.textContent = '正在加载谱面…';

  const saved = config.settings ?? {};

  const chartUrl = `${CHART_BASE}/${config.chartId}.txt`;
  const musicUrl = `${MUSIC_BASE}/${config.chartId % 10000}.mp3`;

  let simaiText: string;
  try {
    const response = await fetch(chartUrl);
    if (!response.ok) throw new Error(`谱面文件不可用（${response.status}）`);
    simaiText = await response.text();
  } catch {
    statusEl.textContent = '谱面加载失败，请返回重试。';
    postStatus('error', { message: '谱面加载失败，请返回重试。' });
    return;
  }

  let charts: Chart[];
  try {
    if (config.buddySide === 'dual') {
      const buddy = parseSimaiBuddyCharts(simaiText);
      charts = [buddy.side1, buddy.side2];
    } else if (config.buddySide === '0' || config.buddySide === '1') {
      charts = [parseSimaiSideChart(simaiText, config.buddySide === '1' ? 1 : 0)];
    } else {
      const available = getAvailableDifficulties(simaiText);
      let difficulty = config.difficulty;
      if (!available[difficulty]) {
        const keys = (Object.keys(available).map(Number) as ChartDifficulty[]).sort((a, b) => b - a);
        if (!keys[0]) throw new Error('谱面中没有可用难度');
        difficulty = keys[0];
      }
      charts = [parseSimaiChart(simaiText, difficulty)];
    }
  } catch {
    statusEl.textContent = '无法打开谱面，请返回重试。';
    postStatus('error', { message: '无法打开谱面，请返回重试。' });
    return;
  }
  const chart = charts[0]!;
  const allNotes = charts.flatMap((c) => c.notes ?? []);

  const totalBeats = Math.max(4, ...charts.map((c) => c.measures * 4));
  let totalDurationMs = 0;
  for (const c of charts) {
    let duration = beatsToMs(c.measures * 4, c.bpmEvents, c.bpm);
    for (const note of c.notes ?? []) {
      if (note.timingMs > duration) duration = note.timingMs;
    }
    if (duration > totalDurationMs) totalDurationMs = duration;
  }

  const chartCount = charts.length as 1 | 2;
  const canvases = [canvas];
  const canvasStages = [canvasStage];
  if (chartCount === 2) {
    canvases.push($('chart-canvas-2') as HTMLCanvasElement);
    canvasStages.push($('canvas-stage-2'));
    canvasWrap.classList.add('dual');
    document.body.classList.add('dual');
  }
  const renderers = canvases.map((c) => new MainRenderer(c, { sensorImagePath: './sensor.webp' }));
  const applyRendererSettings = (r: MainRenderer) => {
    r.setJudgmentLineDesign((saved.judgmentLineDesign as string) || 'sensor');
    r.setPlaybackSpeed(saved.playbackSpeed ?? 1);
    r.setHiSpeed(saved.hiSpeed ?? HI_SPEED_DEFAULT);
    r.setShowBpm(false);
    r.setShowNoteTotal(false);
    r.setShowBreakCount(false);
    r.setMirrorMode((saved.mirrorMode as string) || 'none');
    r.setPinkSlideStart(!!saved.pinkSlideStart);
    r.setSlideRotation(saved.slideRotation ?? true);
    r.setHighlightExNotes(saved.highlightExNotes ?? false);
    r.setNormalColorBreakSlide(!!saved.normalColorBreakSlide);
    r.setShowHitEffect(saved.showHitEffect ?? true);
    r.setShowFireworks(saved.showFireworks ?? true);
  };
  for (const r of renderers) applyRendererSettings(r);

  let audioContext: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let answerGain: GainNode | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let sourceGain: GainNode | null = null;
  let answerManager: AudioManager | null = null;
  const answerEvents: PreparedAudioEvent[] = prepareAudioEvents(allNotes);
  const playbackClock = new PlaybackClock();
  let isSourcePlaying = false;
  let isPlaying = false;
  let preciseBeats = 0;
  let playbackSpeed = saved.playbackSpeed ?? 1;
  const musicOffset = 0;
  let musicVolume = saved.musicVolume ?? 10;
  let soundVolume = saved.soundVolume ?? 10;
  let rafId = 0;
  let lastRafTs = 0;
  let isFullscreen = false;
  let fsLocked = false;
  let fsControlsVisible = false;
  let fsHideTimer: number | undefined;

  const syncPlayButtons = () => {
    const icon = isPlaying ? PAUSE_ICON : PLAY_ICON;
    const label = isPlaying ? '暂停' : '播放';
    playBtn.innerHTML = icon;
    playBtn.setAttribute('aria-label', label);
    const fsPlayBtn = document.getElementById('fs-play');
    if (fsPlayBtn) {
      fsPlayBtn.innerHTML = icon;
      fsPlayBtn.setAttribute('aria-label', label);
    }
  };

  const saveSettings = (partial: Partial<ChartPreviewSettings>) => {
    postStatus('settings', partial);
  };

  const ensureAudio = async (): Promise<AudioContext> => {
    if (!audioContext) {
      audioContext = new AudioContext();
      musicGain = audioContext.createGain();
      musicGain.gain.value = musicVolume / 10;
      musicGain.connect(audioContext.destination);
      answerGain = audioContext.createGain();
      answerGain.connect(audioContext.destination);
      answerManager = new AudioManager({
        audioContext,
        outputNode: answerGain,
        answerSoundPath: config.answerSoundUrl ?? './answer.wav',
        initialVolume: soundVolume / 10,
        initialTimingOffset: ANSWER_SOUND_BASE_OFFSET_MS,
      });
      answerManager.setEnabled(true);
      await answerManager.init();
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
    return audioContext;
  };

  const stopSource = (immediate = false) => {
    const source = sourceNode;
    const gain = sourceGain;
    sourceNode = null;
    sourceGain = null;
    isSourcePlaying = false;
    playbackClock.clear();
    if (!source) return;
    try {
      if (!immediate && audioContext && gain) {
        const now = audioContext.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + SOURCE_FADE_TIME_S);
        source.stop(now + SOURCE_FADE_TIME_S + 0.01);
      } else {
        source.stop();
      }
    } catch {
      /* already stopped */
    }
    try {
      source.disconnect();
      gain?.disconnect();
    } catch {
      /* ignore */
    }
  };

  const getMusicTime = (): number => {
    if (!audioContext || !isSourcePlaying) return playbackClock.offset;
    const outputTime = getAudioContextOutputTime(audioContext);
    playbackClock.prune(outputTime);
    return playbackClock.positionAt(outputTime);
  };

  const playFromMusicPosition = async (positionSec: number) => {
    if (!audioBuffer) return;
    const ctx = await ensureAudio();
    if (!musicGain) return;
    stopSource(true);
    const duration = audioBuffer.duration;
    const clamped = clamp(positionSec, 0, Math.max(0, duration - 0.01));
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = audioBuffer;
    source.playbackRate.value = playbackSpeed;
    const startTime = ctx.currentTime + SOURCE_START_LEAD_TIME_S;
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
    const audibleAt = getAudioContextOutputTime(ctx) + SOURCE_START_LEAD_TIME_S;
    playbackClock.set(audibleAt, clamped, playbackSpeed);
  };

  try {
    statusEl.textContent = '正在加载预览曲…';
    await ensureAudio();
    const musicResponse = await fetch(musicUrl);
    if (!musicResponse.ok) throw new Error(`预览曲不可用（${musicResponse.status}）`);
    const arrayBuffer = await musicResponse.arrayBuffer();
    audioBuffer = await (await ensureAudio()).decodeAudioData(arrayBuffer);
  } catch {
    statusEl.textContent = '预览曲加载失败，仍可静音看谱。';
    audioBuffer = null;
  }

  statusEl.textContent = '';
  postStatus('ready', { chartId: config.chartId, measures: chart.measures });

  const NOTE_COLORS: Record<string, string> = {
    tap: '#FFD700', hold: '#FF8C00', slide: '#00CED1', touch: '#0080FF', break: '#ff69b4',
  };

  const maxMeasure = Math.max(0, ...charts.map((c) => c.measures - 1));
  const measurePercents: number[] = [];
  for (let m = 0; m <= maxMeasure; m++) {
    measurePercents.push(Math.min(100, (beatsToMs(m * 4, chart.bpmEvents, chart.bpm) / totalDurationMs) * 100));
  }

  // 同屏时把所有 chart 渲染到各自画布；单谱面等价于原 renderer.renderFrame。
  const renderFrameAll = () => {
    for (let i = 0; i < charts.length; i++) {
      renderers[i]!.renderFrame(charts[i]!, preciseBeats, 4);
    }
  };

  const buildTimeline = () => {
    timelineBars.replaceChildren();
    if (totalDurationMs <= 0) return;
    const rect = timelineHost.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const bucketCount = Math.min(200, w);
    const step = totalDurationMs / bucketCount;
    const buckets: Record<string, number>[] = Array.from({ length: bucketCount }, (_, i) => ({ startMs: i * step, tap: 0, hold: 0, slide: 0, touch: 0, break: 0, total: 0 }));
    for (const note of allNotes) {
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(note.timingMs / step)));
      const b = buckets[idx]!;
      switch (note.type) {
        case 'tap': case 'simultaneous': b.tap++; break;
        case 'hold-start': case 'hold-start-simultaneous': b.hold++; break;
        case 'slide': b.slide++; break;
        case 'touch': case 'touch-hold-start': b.touch++; break;
        case 'break': b.break++; break;
      }
      b.total++;
    }
    let maxTotal = 1;
    for (const b of buckets) { if (b.total > maxTotal) maxTotal = b.total; }
    const barH = 22;
    for (const b of buckets) {
      if (b.total === 0) continue;
      const h = Math.max(2, (b.total / maxTotal) * barH);
      const left = ((b.startMs / totalDurationMs) * 100).toFixed(2);
      const widthPct = ((step / totalDurationMs) * 100).toFixed(2);
      const bar = document.createElement('div');
      bar.className = 'timeline-bar';
      bar.style.left = `${left}%`;
      bar.style.width = `${widthPct}%`;
      bar.style.height = `${h}px`;
      for (const key of ['tap', 'hold', 'slide', 'touch', 'break'] as const) {
        const ratio = b[key] / b.total;
        if (ratio === 0) continue;
        const seg = document.createElement('div');
        seg.style.flex = String(ratio);
        seg.style.width = '100%';
        seg.style.backgroundColor = NOTE_COLORS[key]!;
        bar.appendChild(seg);
      }
      timelineBars.appendChild(bar);
    }

    timelineRuler.replaceChildren();
    const rulerRect = timelineRuler.getBoundingClientRect();
    const rw = Math.max(1, rulerRect.width);
    const tickStep = [1, 5, 10, 50, 100].find(s => maxMeasure > 0 && (rw * s) / maxMeasure >= 4) ?? 100;
    const labelStep = [5, 10, 20, 50, 100, 200].find(s => maxMeasure > 0 && (rw * s) / maxMeasure >= 24) ?? 200;
    for (let m = 0; m <= maxMeasure; m++) {
      const pct = measurePercents[m] ?? 0;
      if (m % tickStep === 0) {
        const isMajor = m % 10 === 0;
        const isMedium = m % 5 === 0;
        const cls = isMajor ? 'major' : isMedium ? 'medium' : 'minor';
        const tick = document.createElement('div');
        tick.className = `timeline-tick ${cls}`;
        tick.style.left = `${pct}%`;
        timelineRuler.appendChild(tick);
      }
      if (m % labelStep === 0) {
        const label = document.createElement('div');
        label.className = 'timeline-label';
        label.style.left = `${pct}%`;
        label.textContent = String(m);
        timelineRuler.appendChild(label);
      }
    }
  };
  buildTimeline();
  window.addEventListener('resize', buildTimeline);
  new ResizeObserver(buildTimeline).observe(timelineHost);

  const updatePlayhead = (percent: number, measure: number) => {
    timelinePlayhead.style.left = `${percent}%`;
    timelineBadge.style.left = `${percent}%`;
    timelineBadge.textContent = String(measure);
  };

  let isDragging = false;
  let wasPlaying = false;

  const seekToPosition = (percent: number) => {
    const targetMs = (percent / 100) * totalDurationMs;
    const targetBeats = msToBeats(targetMs, chart.bpmEvents, chart.bpm);
    preciseBeats = clamp(targetBeats, 0, totalBeats);
    const ms = beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm);
    const measure = Math.floor(preciseBeats / 4);
    const pct = (ms / totalDurationMs) * 100;
    updatePlayhead(pct, measure);
    if (isFullscreen) updateFsPlayhead(pct, measure);
    timeLabel.textContent = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
    if (isFullscreen) fsTimeLabel.textContent = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
    // 拖动时实时渲染画面与信息栏，恢复"拖动即看到对应帧"的能力
    renderFrameAll();
    updateOverlayDom();
  };

  timelineHost.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isDragging = true;
    wasPlaying = isPlaying;
    if (isPlaying) pausePlayback();
    const rect = timelineHost.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    seekToPosition(pct);
  });

  document.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const host = isFullscreen ? fsTimelineHost : timelineHost;
    const rect = host.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    seekToPosition(pct);
  });

  document.addEventListener('pointerup', () => {
    if (!isDragging) return;
    isDragging = false;
    renderAt(preciseBeats);
    if (wasPlaying) void startPlayback();
  });

  // 移动设备拖动被系统中断（多指/来电/通知等）时，pointerup 不会触发；
  // 若不重置 isDragging，后续 pointermove 会继续按拖动逻辑执行，干扰播放键等点击。
  // 这里只重置状态并停留在当前帧，不自动恢复播放，避免中断后突然发声。
  document.addEventListener('pointercancel', () => {
    if (!isDragging) return;
    isDragging = false;
    renderAt(preciseBeats);
  });

  const updateSeekUi = () => {
    const ms = beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm);
    if (!isDragging) {
      const pct = totalDurationMs > 0 ? (ms / totalDurationMs) * 100 : 0;
      const measure = Math.floor(preciseBeats / 4);
      updatePlayhead(pct, measure);
      if (isFullscreen) updateFsPlayhead(pct, measure);
    }
    timeLabel.textContent = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
    if (isFullscreen) fsTimeLabel.textContent = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
  };

  const updateOverlayDom = () => {
    let bpm = 0;
    let beatText = '0:0.00';
    let completedNotes = 0;
    let totalNotes = 0;
    let completedBreaks = 0;
    let totalBreaks = 0;
    let completedBreaksNoEx = 0;
    let totalBreaksNoEx = 0;
    let fps = 0;
    let found = false;
    for (const r of renderers) {
      const ov = r.frameOverlay;
      if (!ov) continue;
      found = true;
      if (ov.bpm > 0) bpm = ov.bpm;
      beatText = ov.beatText;
      completedNotes += ov.completedNotes;
      totalNotes += ov.totalNotes;
      completedBreaks += ov.completedBreaks;
      totalBreaks += ov.totalBreaks;
      completedBreaksNoEx += ov.completedBreaksNoEx;
      totalBreaksNoEx += ov.totalBreaksNoEx;
      if (ov.fps > fps) fps = ov.fps;
    }
    if (!found) return;
    infoBpm.textContent = `${Math.floor(bpm)}`;
    infoBeat.textContent = beatText;
    infoCombo.textContent = `${completedNotes} / ${totalNotes}`;
    if (totalBreaks > 0) {
      infoBreakWrap.style.display = '';
      infoBreak.textContent = `${completedBreaks} / ${totalBreaks}`;
    } else {
      infoBreakWrap.style.display = 'none';
    }
    if (totalBreaksNoEx > 0) {
      infoBreakNoexWrap.style.display = '';
      infoBreakNoex.textContent = `${completedBreaksNoEx} / ${totalBreaksNoEx}`;
    } else {
      infoBreakNoexWrap.style.display = 'none';
    }
    if (fps > 0) {
      infoFps.textContent = `FPS: ${fps}`;
      infoFps.className = fps >= 55 ? 'info-val info-fps-green' : fps >= 30 ? 'info-val info-fps-yellow' : 'info-val info-fps-red';
    } else {
      infoFps.textContent = '';
      infoFps.className = 'info-val';
    }
  };

  const renderAt = (beats: number) => {
    preciseBeats = clamp(beats, 0, totalBeats);
    renderFrameAll();
    updateSeekUi();
    updateOverlayDom();
  };

  setupWheelPopup(
    hiSpeedTrigger,
    hiSpeedPopup,
    hiSpeedWheel,
    hiSpeedList,
    hiSpeedVal,
    (hiSpeed) => {
      for (const r of renderers) r.setHiSpeed(hiSpeed);
      saveSettings({ hiSpeed });
      renderAt(preciseBeats);
    },
    HI_SPEED_MIN,
    HI_SPEED_MAX,
    HI_SPEED_STEP,
    saved.hiSpeed ?? HI_SPEED_DEFAULT,
  );

  setupWheelPopup(
    speedTrigger,
    speedPopup,
    speedWheel,
    speedList,
    speedVal,
    (speed) => {
      playbackSpeed = clamp(speed, 0.1, 5);
      for (const r of renderers) r.setPlaybackSpeed(playbackSpeed);
      saveSettings({ playbackSpeed });
      if (sourceNode && isSourcePlaying && audioContext) {
        const startTime = audioContext.currentTime;
        const outputTime = getAudioContextOutputTime(audioContext);
        sourceNode.playbackRate.setValueAtTime(playbackSpeed, startTime);
        playbackClock.appendSegment(startTime, playbackSpeed, outputTime);
      }
    },
    SPEED_MIN,
    SPEED_MAX,
    SPEED_STEP,
    saved.playbackSpeed ?? SPEED_DEFAULT,
  );

  setupWheelPopup(
    musicVolumeTrigger,
    musicVolumePopup,
    musicVolumeWheel,
    musicVolumeList,
    musicVolumeVal,
    (vol) => {
      musicVolume = clamp(vol, 0, 10);
      saveSettings({ musicVolume });
      if (musicGain) musicGain.gain.value = musicVolume / 10;
    },
    0,
    10,
    0.1,
    saved.musicVolume ?? 10,
  );

  setupWheelPopup(
    soundVolumeTrigger,
    soundVolumePopup,
    soundVolumeWheel,
    soundVolumeList,
    soundVolumeVal,
    (vol) => {
      soundVolume = clamp(vol, 0, 10);
      saveSettings({ soundVolume });
      answerManager?.setVolume(soundVolume / 10);
    },
    0,
    10,
    0.1,
    saved.soundVolume ?? 10,
  );

  const MIRROR_LABELS = ['无', '左右反', '上下反', '全反'] as const;
  const MIRROR_VALUES = ['none', 'horizontal', 'vertical', 'rotate180'] as const;
  const mirrorIdx = Math.max(0, MIRROR_VALUES.indexOf((saved.mirrorMode as string) ?? 'none'));
  setupWheelPopup(
    mirrorTrigger, mirrorPopup, mirrorWheel, mirrorList, mirrorVal,
    (idx) => {
      const mode = MIRROR_VALUES[idx] ?? 'none';
      saveSettings({ mirrorMode: mode });
      for (const r of renderers) r.setMirrorMode(mode);
      renderAt(preciseBeats);
    },
    0, 3, 1, mirrorIdx, MIRROR_LABELS,
  );

  const STYLE_LABELS = ['无', '判定点', '判定线', '判定区'] as const;
  const STYLE_VALUES = ['blind', 'noLine', 'simple', 'sensor'] as const;
  const styleIdx = Math.max(0, STYLE_VALUES.indexOf((saved.judgmentLineDesign as string) ?? 'sensor'));
  setupWheelPopup(
    styleTrigger, stylePopup, styleWheel, styleList, styleVal,
    (idx) => {
      const design = STYLE_VALUES[idx] ?? 'sensor';
      saveSettings({ judgmentLineDesign: design });
      for (const r of renderers) r.setJudgmentLineDesign(design);
      renderAt(preciseBeats);
    },
    0, 3, 1, styleIdx, STYLE_LABELS,
  );

  const setupToggle = (btn: HTMLButtonElement, initial: boolean, onChange: (v: boolean) => void) => {
    let active = initial;
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => {
      active = !active;
      btn.setAttribute('aria-pressed', String(active));
      onChange(active);
      renderAt(preciseBeats);
    });
  };

  setupToggle(togglePink, !!saved.pinkSlideStart, (v) => { for (const r of renderers) r.setPinkSlideStart(v); saveSettings({ pinkSlideStart: v }); });
  setupToggle(toggleStarRot, saved.slideRotation ?? true, (v) => { for (const r of renderers) r.setSlideRotation(v); saveSettings({ slideRotation: v }); });
  setupToggle(toggleEx, saved.highlightExNotes ?? false, (v) => { for (const r of renderers) r.setHighlightExNotes(v); saveSettings({ highlightExNotes: v }); });
  setupToggle(toggleBreakSlide, !!saved.normalColorBreakSlide, (v) => { for (const r of renderers) r.setNormalColorBreakSlide(v); saveSettings({ normalColorBreakSlide: v }); });
  setupToggle(toggleHit, saved.showHitEffect ?? true, (v) => { for (const r of renderers) r.setShowHitEffect(v); saveSettings({ showHitEffect: v }); });
  setupToggle(toggleFirework, saved.showFireworks ?? true, (v) => { for (const r of renderers) r.setShowFireworks(v); saveSettings({ showFireworks: v }); });

  const resize = () => {
    if (!isFullscreen) canvasWrap.style.width = '';
    const rect = canvasWrap.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
    const viewportHeight = viewport?.height ?? document.documentElement.clientHeight;
    const size = chartPreviewCanvasSize({
      isFullscreen,
      containerWidth: rect.width,
      viewportWidth,
      viewportHeight,
      chartCount,
    });
    canvasWrap.style.width = isFullscreen
      ? `${size * chartCount + CHART_PREVIEW_DUAL_GAP * (chartCount - 1)}px`
      : '';
    for (const stage of canvasStages) {
      stage.style.width = `${size}px`;
      stage.style.height = `${size}px`;
    }
    canvasWrap.style.height = `${size}px`;
    for (const r of renderers) r.resize(false);
    renderAt(preciseBeats);
  };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvasWrap);
  resize();

  const scheduleAnswers = (currentMs: number) => {
    if (!answerManager || !isPlaying) return;
    answerManager.schedule(
      answerEvents,
      currentMs,
      playbackClock.schedulingSpeed(playbackSpeed),
      SCHEDULE_LOOKAHEAD_MS,
    );
  };

  const tick = (timestamp: number) => {
    if (!isPlaying) return;
    let currentBeats = preciseBeats;

    if (audioBuffer && isSourcePlaying && audioContext) {
      const musicTime = getMusicTime();
      if (musicTime >= audioBuffer.duration - MUSIC_END_EPSILON_S) {
        stopSource(true);
      } else {
        currentBeats = musicTimeToBeats(
          musicTime,
          chart.bpmEvents,
          chart.bpm,
          musicOffset,
          chart.firstMs ?? 0,
        );
      }
    } else {
      if (lastRafTs > 0) {
        const deltaMs = timestamp - lastRafTs;
        currentBeats += ((deltaMs / 1000) * playbackSpeed * chart.bpm) / 60;
      }
      lastRafTs = timestamp;
    }

    if (currentBeats >= totalBeats) {
      isPlaying = false;
      for (const r of renderers) r.setIsPlaying(false);
      stopSource(true);
      answerManager?.reset(undefined, true);
      syncPlayButtons();
      renderAt(totalBeats);
      return;
    }

    preciseBeats = currentBeats;
    checkLoop();
    const currentMs = beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm);
    renderFrameAll();
    updateSeekUi();
    updateOverlayDom();
    scheduleAnswers(currentMs);
    rafId = requestAnimationFrame(tick);
  };

  const startPlayback = async () => {
    await ensureAudio();
    isPlaying = true;
    for (const r of renderers) r.setIsPlaying(true);
    syncPlayButtons();
    lastRafTs = 0;
    const musicTime = calculateMusicTime(
      preciseBeats,
      chart.bpmEvents,
      chart.bpm,
      musicOffset,
      chart.firstMs ?? 0,
    );
    answerManager?.reset(beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm), true);
    if (audioBuffer && musicTime < audioBuffer.duration - MUSIC_END_EPSILON_S) {
      await playFromMusicPosition(Math.max(0, musicTime));
    } else {
      stopSource(true);
      lastRafTs = performance.now();
    }
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  };

  const pausePlayback = () => {
    isPlaying = false;
    for (const r of renderers) r.setIsPlaying(false);
    syncPlayButtons();
    if (isSourcePlaying) {
      playbackClock.setOffset(getMusicTime());
      stopSource();
    }
    answerManager?.reset(beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm), true);
    cancelAnimationFrame(rafId);
    lastRafTs = 0;
    renderAt(preciseBeats);
  };

  playBtn.addEventListener('click', () => {
    void (isPlaying ? pausePlayback() : startPlayback());
  });

  const skipBeats = (deltaBeats: number) => {
    preciseBeats = clamp(preciseBeats + deltaBeats, 0, totalBeats);
    if (isPlaying) void startPlayback();
    else renderAt(preciseBeats);
  };

  const skipToMeasure = (direction: -1 | 1) => {
    const currentMeasure = Math.floor(preciseBeats / 4);
    const targetMeasure = clamp(currentMeasure + direction, 0, maxMeasure);
    preciseBeats = targetMeasure * 4;
    if (isPlaying) void startPlayback();
    else renderAt(preciseBeats);
  };

  const setupRepeatButton = (btn: HTMLButtonElement, action: () => void) => {
    let timer: number | undefined;
    let count = 0;
    const startRepeat = () => {
      count = 0;
      action();
      timer = window.setTimeout(() => {
        count = 1;
        timer = window.setInterval(() => {
          action();
          count++;
          if (count === 5 && timer) {
            window.clearInterval(timer);
            timer = window.setInterval(() => action(), 50);
          }
        }, 200);
      }, 300);
    };
    const stopRepeat = () => {
      window.clearTimeout(timer);
      window.clearInterval(timer);
      timer = undefined;
    };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); startRepeat(); });
    btn.addEventListener('pointerup', stopRepeat);
    btn.addEventListener('pointerleave', stopRepeat);
    btn.addEventListener('pointercancel', stopRepeat);
  };

  setupRepeatButton(btnPrevMeasure, () => skipToMeasure(-1));
  setupRepeatButton(btnNextMeasure, () => skipToMeasure(1));
  setupRepeatButton(btnStepBack, () => skipBeats(-1));
  setupRepeatButton(btnStepForward, () => skipBeats(1));

  btnRestart.addEventListener('click', () => {
    const currentMeasure = Math.floor(preciseBeats / 4);
    preciseBeats = currentMeasure * 4;
    if (isPlaying) void startPlayback();
    else renderAt(preciseBeats);
  });

  function buildFsTimeline() {
    fsTimelineBars.replaceChildren();
    if (totalDurationMs <= 0) return;
    const rect = fsTimelineHost.getBoundingClientRect();
    const w = Math.max(1, Math.ceil(rect.width));
    const bucketCount = Math.min(200, w);
    const step = totalDurationMs / bucketCount;
    const buckets: Record<string, number>[] = Array.from({ length: bucketCount }, (_, i) => ({ startMs: i * step, tap: 0, hold: 0, slide: 0, touch: 0, break: 0, total: 0 }));
    for (const note of allNotes) {
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(note.timingMs / step)));
      const b = buckets[idx]!;
      switch (note.type) {
        case 'tap': case 'simultaneous': b.tap++; break;
        case 'hold-start': case 'hold-start-simultaneous': b.hold++; break;
        case 'slide': b.slide++; break;
        case 'touch': case 'touch-hold-start': b.touch++; break;
        case 'break': b.break++; break;
      }
      b.total++;
    }
    let maxTotal = 1;
    for (const b of buckets) { if (b.total > maxTotal) maxTotal = b.total; }
    const barH = 22;
    for (const b of buckets) {
      if (b.total === 0) continue;
      const h = Math.max(2, (b.total / maxTotal) * barH);
      const left = ((b.startMs / totalDurationMs) * 100).toFixed(2);
      const widthPct = ((step / totalDurationMs) * 100).toFixed(2);
      const bar = document.createElement('div');
      bar.className = 'fs-timeline-bar';
      bar.style.left = `${left}%`;
      bar.style.width = `${widthPct}%`;
      bar.style.height = `${h}px`;
      for (const key of ['tap', 'hold', 'slide', 'touch', 'break'] as const) {
        const ratio = b[key] / b.total;
        if (ratio === 0) continue;
        const seg = document.createElement('div');
        seg.style.flex = String(ratio);
        seg.style.width = '100%';
        seg.style.backgroundColor = NOTE_COLORS[key]!;
        bar.appendChild(seg);
      }
      fsTimelineBars.appendChild(bar);
    }
    fsTimelineRuler.replaceChildren();
    const rulerRect = fsTimelineRuler.getBoundingClientRect();
    const rw = Math.max(1, rulerRect.width);
    const tickStep = [1, 5, 10, 50, 100].find(s => maxMeasure > 0 && (rw * s) / maxMeasure >= 4) ?? 100;
    const labelStep = [5, 10, 20, 50, 100, 200].find(s => maxMeasure > 0 && (rw * s) / maxMeasure >= 24) ?? 200;
    for (let m = 0; m <= maxMeasure; m++) {
      const pct = measurePercents[m] ?? 0;
      if (m % tickStep === 0) {
        const isMajor = m % 10 === 0;
        const isMedium = m % 5 === 0;
        const cls = isMajor ? 'major' : isMedium ? 'medium' : 'minor';
        const tick = document.createElement('div');
        tick.className = `fs-timeline-tick ${cls}`;
        tick.style.left = `${pct}%`;
        fsTimelineRuler.appendChild(tick);
      }
      if (m % labelStep === 0) {
        const label = document.createElement('div');
        label.className = 'fs-timeline-label';
        label.style.left = `${pct}%`;
        label.textContent = String(m);
        fsTimelineRuler.appendChild(label);
      }
    }
  }

  function updateFsPlayhead(pct: number, measure: number) {
    fsTimelinePlayhead.style.left = `${pct}%`;
    fsTimelineBadge.style.left = `${pct}%`;
    fsTimelineBadge.textContent = String(measure);
  }

  function syncFsControlsVisibility() {
    fsOverlay.classList.toggle('hidden', !fsControlsVisible || fsLocked);
    fsLock.classList.toggle('hidden', !fsControlsVisible);
  }

  function showFsControls() {
    window.clearTimeout(fsHideTimer);
    fsControlsVisible = true;
    syncFsControlsVisibility();
    fsHideTimer = window.setTimeout(() => {
      fsControlsVisible = false;
      syncFsControlsVisibility();
    }, 5000);
  }

  function hideFsControls() {
    window.clearTimeout(fsHideTimer);
    fsControlsVisible = false;
    syncFsControlsVisibility();
  }

  function exitFullscreen() {
    if (!isFullscreen) return;
    isFullscreen = false;
    fsLocked = false;
    fsLock.classList.remove('locked');
    fsLock.setAttribute('aria-label', '锁定');
    document.body.classList.remove('fullscreen');
    fsControlsVisible = false;
    syncFsControlsVisibility();
    postStatus('fullscreen', { active: false });
    requestAnimationFrame(() => { resize(); renderAt(preciseBeats); });
  }

  function enterFullscreen() {
    isFullscreen = true;
    document.body.classList.add('fullscreen');
    buildFsTimeline();
    fsTransport.replaceChildren();
    const makeBtn = (id: string, label: string, html: string) => {
      const btn = document.createElement('button');
      btn.className = 'transport-btn';
      btn.id = id;
      btn.setAttribute('aria-label', label);
      btn.type = 'button';
      btn.innerHTML = html;
      return btn;
    };
    const left = document.createElement('div');
    left.className = 'transport-side left';
    const right = document.createElement('div');
    right.className = 'transport-side right';
    const fsPlay = makeBtn(
      'fs-play',
      isPlaying ? '暂停' : '播放',
      isPlaying ? PAUSE_ICON : PLAY_ICON,
    );
    fsPlay.classList.add('play-toggle');
    left.appendChild(makeBtn('fs-restart', '重播当前小节', btnRestart.innerHTML));
    left.appendChild(makeBtn('fs-prev-measure', '上一小节', document.getElementById('btn-prev-measure')!.innerHTML));
    left.appendChild(makeBtn('fs-step-back', '步退', document.getElementById('btn-step-back')!.innerHTML));
    right.appendChild(makeBtn('fs-step-forward', '步进', document.getElementById('btn-step-forward')!.innerHTML));
    right.appendChild(makeBtn('fs-next-measure', '下一小节', document.getElementById('btn-next-measure')!.innerHTML));
    right.appendChild(makeBtn('fs-fullscreen', '退出全屏', document.getElementById('btn-fullscreen')!.innerHTML));
    fsTransport.appendChild(left);
    fsTransport.appendChild(fsPlay);
    fsTransport.appendChild(right);
    document.getElementById('fs-restart')!.addEventListener('click', () => { const m = Math.floor(preciseBeats / 4); preciseBeats = m * 4; if (isPlaying) void startPlayback(); else renderAt(preciseBeats); });
    document.getElementById('fs-prev-measure')!.addEventListener('click', () => skipToMeasure(-1));
    document.getElementById('fs-step-back')!.addEventListener('click', () => skipBeats(-1));
    document.getElementById('fs-step-forward')!.addEventListener('click', () => skipBeats(1));
    document.getElementById('fs-next-measure')!.addEventListener('click', () => skipToMeasure(1));
    document.getElementById('fs-fullscreen')!.addEventListener('click', exitFullscreen);
    fsPlay.addEventListener('click', () => {
      void (isPlaying ? pausePlayback() : startPlayback());
    });
    syncLoopButtons();
    showFsControls();
    postStatus('fullscreen', { active: true });
  }

  btnFullscreen.addEventListener('click', () => {
    if (isFullscreen) exitFullscreen();
    else enterFullscreen();
  });

  canvasWrap.addEventListener('click', (e) => {
    if (!isFullscreen) return;
    e.stopPropagation();
    if (fsControlsVisible) hideFsControls();
    else showFsControls();
  });

  fsLock.addEventListener('click', (e) => {
    e.stopPropagation();
    const nextState = toggleFullscreenLockUiState(fsLocked);
    fsLocked = nextState.locked;
    fsLock.classList.toggle('locked', fsLocked);
    fsLock.setAttribute('aria-label', nextState.actionLabel);
    if (nextState.overlayHidden) hideFsControls();
    else showFsControls();
  });

  fsOverlay.addEventListener('pointerdown', (e) => { e.stopPropagation(); });

  let loopA: number | null = null;
  let loopB: number | null = null;

  const updateLoopBtn = (btn: HTMLButtonElement, active: boolean) => {
    if (active) btn.classList.add('on');
    else btn.classList.remove('on');
  };

  const syncLoopButtons = () => {
    updateLoopBtn(btnLoopA, loopA !== null);
    updateLoopBtn(btnLoopB, loopB !== null);
    updateLoopBtn(fsLoopA, loopA !== null);
    updateLoopBtn(fsLoopB, loopB !== null);
  };

  const toggleLoopA = () => {
    loopA = loopA === null ? preciseBeats : null;
    if (loopA !== null && loopB !== null && loopA > loopB) {
      const previousLoopA = loopA;
      loopA = loopB;
      loopB = previousLoopA;
    }
    syncLoopButtons();
  };

  const toggleLoopB = () => {
    loopB = loopB === null ? preciseBeats : null;
    if (loopA !== null && loopB !== null && loopA > loopB) {
      const previousLoopA = loopA;
      loopA = loopB;
      loopB = previousLoopA;
    }
    syncLoopButtons();
  };

  btnLoopA.addEventListener('click', toggleLoopA);
  btnLoopB.addEventListener('click', toggleLoopB);
  fsLoopA.addEventListener('click', toggleLoopA);
  fsLoopB.addEventListener('click', toggleLoopB);
  fsTimelineHost.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    wasPlaying = isPlaying;
    if (isPlaying) pausePlayback();
    const rect = fsTimelineHost.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    seekToPosition(pct);
    showFsControls();
  });

  const checkLoop = () => {
    if (loopA === null || loopB === null || loopA === loopB) return;
    if (preciseBeats >= loopB) {
      preciseBeats = loopA;
      if (isPlaying) void startPlayback();
      else renderAt(preciseBeats);
    }
  };

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data === 'stop' || (typeof data === 'object' && data?.type === 'stop')) pausePlayback();
    if (typeof data === 'object' && data?.type === 'exit-fullscreen') exitFullscreen();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isPlaying) pausePlayback();
  });

  renderAt(0);
}

void main().catch(() => {
  const status = document.getElementById('status');
  if (status) status.textContent = '无法打开谱面，请返回重试。';
  postStatus('error', { message: '无法打开谱面，请返回重试。' });
});
