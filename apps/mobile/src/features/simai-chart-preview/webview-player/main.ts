/**
 * 舞萌谱面确认 WebView 播放器入口。
 * 播放位置、命令代次、音源与 RAF 归 SimaiPlaybackSession，背景媒体与时间线视图各自持有资源；
 * 这里只做 DOM、设置与控制器的接线。
 */
import {
  getAvailableDifficulties,
  MainRenderer,
  parseSimaiBuddyCharts,
  parseSimaiChart,
  parseSimaiSideChart,
  prepareAudioEvents,
  type Chart,
  type Note,
} from '../engine';
import { applyChartPreviewHostCommand } from '../../chart-preview-shared/chart-preview-bridge';
import { closeActiveWheelPopup, setupWheelPopup } from '../../chart-preview-shared/webview-player/wheel';
import { DEFAULT_JUDGE_HINT, parseJudgeHint } from '../engine/utils/judgeHint';
import { ChartPreviewSkin } from '../engine/renderers/skinAtlas';
import { CHART_PREVIEW_DUAL_GAP, chartPreviewCanvasSize } from './fullscreenLayout';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';
import { SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS } from './timeConversion';
import { SimaiPlaybackSession } from './playback';
import {
  SimaiTimelineView,
  type SimaiTimelineEntry,
  type SimaiTimelineNoteKind,
} from './timelineView';
import { SimaiBackgroundMedia } from './backgroundMedia';
import {
  createLatestFrameScheduler,
  resolveInitialBackgroundState,
  type ChartPreviewBackgroundMode,
} from './interactionScheduler';

import type { ChartPreviewSettings, ChartPreviewInjectConfig as ChartPreviewConfig } from '../configuration';

declare global {
  interface Window {
    __CHART_PREVIEW__?: ChartPreviewConfig;
    __CHART_PREVIEW_MUSIC_DATA__?: string | null;
    ReactNativeWebView?: { postMessage: (message: string) => void };
  }
}
export type { ChartPreviewSettings, ChartPreviewInjectConfig as ChartPreviewConfig } from '../configuration';
type BackgroundMode = ChartPreviewBackgroundMode;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 宿主释放后的播放器：不再改动界面、也不再回报状态。 */
let disposed = false;

function postStatus(type: string, payload: Record<string, unknown> = {}): void {
  if (disposed) return;
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...payload }));
}

function reportBackgroundVideo(result: 'success' | 'error', video?: HTMLVideoElement): void {
  const code = video?.error?.code ?? 0;
  const errorCode = result !== 'error' ? undefined
    : code === 2 ? 'network'
    : code === 4 ? 'no_data'
    : code === 1 ? 'cancelled'
    : 'unknown';
  postStatus('background-video', {
    result,
    status: code,
    ...(errorCode ? { errorCode } : {}),
  });
}

function decodeBase64Payload(value: string): ArrayBuffer {
  const separator = value.indexOf(',');
  const base64 = separator >= 0 ? value.slice(separator + 1) : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function postLoadProgress(label: string, value: number, statusEl?: HTMLElement): void {
  if (statusEl) statusEl.textContent = label;
  postStatus('progress', { label, value });
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

const TIMELINE_KIND_BY_NOTE_TYPE: Readonly<Record<Note['type'], SimaiTimelineNoteKind>> = Object.freeze({
  tap: 'tap',
  break: 'break',
  'hold-start': 'hold',
  slide: 'slide',
  touch: 'touch',
  'touch-hold-start': 'touch',
});

async function main(): Promise<void> {
  const app = $('app');
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
  const judgeHintWheel = $('judge-hint-wheel');
  const judgeHintList = $('judge-hint-list');
  const judgeHintTrigger = $('judge-hint-trigger');
  const judgeHintPopup = $('judge-hint-popup');
  const judgeHintVal = $('judge-hint-val');
  const backgroundWheel = $('background-wheel');
  const backgroundList = $('background-list');
  const backgroundTrigger = $('background-trigger');
  const backgroundPopup = $('background-popup');
  const backgroundVal = $('background-val');
  const backgroundImage = $('background-image') as HTMLImageElement;
  const backgroundVideo = $('background-video') as HTMLVideoElement;
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

  app.addEventListener('scroll', closeActiveWheelPopup, { passive: true });

  // 视图状态：全屏、拖动与循环标记由界面持有，播放位置与音源归播放会话。
  let isFullscreen = false;
  let fsLocked = false;
  let fsControlsVisible = false;
  let fsHideTimer: number | undefined;
  let isDragging = false;
  let wasPlaying = false;
  let loopA: number | null = null;
  let loopB: number | null = null;

  const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const PAUSE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>';

  let config: ChartPreviewConfig | undefined;
  statusEl.textContent = '正在等待参数…';
  for (let i = 0; i < 200; i++) {
    const incoming = window.__CHART_PREVIEW__;
    if (incoming && (typeof incoming.chartId === 'string' || Number.isFinite(incoming.chartId))) {
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
  postLoadProgress('正在加载谱面…', 0.15, statusEl);

  const saved = config.settings ?? {};
  const initialBackground = resolveInitialBackgroundState(saved);
  let videoBackgroundPrompted = initialBackground.prompted;
  const backgroundMode: BackgroundMode = initialBackground.mode;

  const chartUrl = config.chartUrl;
  const musicUrl = config.musicUrl;

  let simaiText: string;
  try {
    if (config.parsedChart) simaiText = '';
    else if (config.simaiText !== undefined) simaiText = config.simaiText;
    else {
    if (!chartUrl) throw new Error('缺少谱面资源');
    const response = await fetch(chartUrl);
    if (!response.ok) throw new Error(`谱面文件不可用（${response.status}）`);
    simaiText = await response.text();
    }
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    statusEl.textContent = '谱面加载失败，请返回重试。';
    postStatus('error', { message: '谱面加载失败，请返回重试。', diagnostic: `fetch ${chartUrl}: ${diagnostic}` });
    return;
  }

  let charts: Chart[];
  try {
    if (config.parsedChart) {
      if (config.parsedChart.difficulty !== config.difficulty) throw new Error('所选难度不存在');
      charts = [config.parsedChart];
    } else if (config.buddySide === 'dual') {
      const buddy = parseSimaiBuddyCharts(simaiText);
      charts = [buddy.side1, buddy.side2];
    } else if (config.buddySide === '0' || config.buddySide === '1') {
      charts = [parseSimaiSideChart(simaiText, config.buddySide === '1' ? 1 : 0)];
    } else {
      const available = getAvailableDifficulties(simaiText);
      const difficulty = config.difficulty;
      if (!available[difficulty]) throw new Error('所选难度的谱面不存在');
      charts = [parseSimaiChart(simaiText, difficulty)];
    }
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    const availableText = JSON.stringify(getAvailableDifficulties(simaiText));
    statusEl.textContent = '无法打开谱面，请返回重试。';
    postStatus('error', {
      message: '无法打开谱面，请返回重试。',
      diagnostic: `parse chartId=${config.chartId} difficulty=${config.difficulty} available=${availableText}: ${diagnostic}`,
    });
    return;
  }
  const chart = charts[0]!;
  postLoadProgress('正在加载谱面…', 0.35, statusEl);
  const allNotes = charts.flatMap((c) => c.notes.map(n => {
    const shift = 240000 / charts[0]!.bpm - 240000 / c.bpm;
    return { ...n, timingMs: n.timingMs + shift, endTimeMs: n.endTimeMs + shift };
  }));

  const chartCount = charts.length as 1 | 2;
  const canvases = [canvas];
  const canvasStages = [canvasStage];
  if (chartCount === 2) {
    canvases.push($('chart-canvas-2') as HTMLCanvasElement);
    canvasStages.push($('canvas-stage-2'));
    canvasWrap.classList.add('dual');
    document.body.classList.add('dual');
  }
  const skin = new ChartPreviewSkin();
  postLoadProgress('正在加载皮肤…', 0.4, statusEl);
  try {
    await skin.load();
    postLoadProgress('正在加载皮肤…', 0.65, statusEl);
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    statusEl.textContent = '皮肤加载失败，请返回重试。';
    postStatus('error', { message: '皮肤加载失败，请返回重试。', diagnostic });
    return;
  }
  const renderers = canvases.map((c) => new MainRenderer(c, { skin }));
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
    r.setJudgeHint(parseJudgeHint(saved.judgeHint));
    r.setShowFireworks(saved.showFireworks ?? true);
  };
  try {
    for (let i = 0; i < renderers.length; i++) { applyRendererSettings(renderers[i]); renderers[i].prepare(charts[i]); }
  } catch (error) {
    statusEl.textContent = '这份谱面暂时无法播放，请返回选择其他谱面。';
    postStatus('error', { message: statusEl.textContent, diagnostic: error instanceof Error ? error.message : String(error) });
    return;
  }

  const answerEvents = prepareAudioEvents(allNotes);
  const session = new SimaiPlaybackSession({
    charts,
    answerEvents,
    answerSoundUrl: config.answerSoundUrl ?? './answer.wav',
    speed: saved.playbackSpeed ?? 1,
    musicVolume: saved.musicVolume ?? 10,
    soundVolume: saved.soundVolume ?? 10,
    musicOffset: SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS,
    host: {
      render: (beats) => renderAt(beats),
      onPlayStateChange: () => syncPlayButtons(),
      loopTarget: (beats) => loopA !== null && loopB !== null && loopA !== loopB && beats >= loopB
        ? loopA
        : null,
    },
  });

  const syncPlayButtons = () => {
    const icon = session.playing ? PAUSE_ICON : PLAY_ICON;
    const label = session.playing ? '暂停' : '播放';
    playBtn.innerHTML = icon;
    playBtn.setAttribute('aria-label', label);
    const fsPlayBtn = document.getElementById('fs-play');
    if (fsPlayBtn) {
      fsPlayBtn.innerHTML = icon;
      fsPlayBtn.setAttribute('aria-label', label);
    }
  };

  const saveSettings = (partial: Partial<ChartPreviewSettings>) => {
    postStatus('settings', { settings: partial });
  };

  let musicBytes: ArrayBuffer | null = null;
  try {
    postLoadProgress('正在加载预览曲…', 0.75, statusEl);
    const embedded = window.__CHART_PREVIEW_MUSIC_DATA__;
    if (typeof embedded === 'string' && embedded.length > 0) {
      musicBytes = decodeBase64Payload(embedded);
    } else if (embedded === null) {
      musicBytes = null;
    } else {
      if (!musicUrl) throw new Error('缺少音乐资源');
      const musicResponse = await fetch(musicUrl);
      if (!musicResponse.ok) throw new Error(`预览曲不可用（${musicResponse.status}）`);
      musicBytes = await musicResponse.arrayBuffer();
    }
  } catch {
    statusEl.textContent = '预览曲加载失败，仍可静音看谱。';
    musicBytes = null;
  }
  if (!(await session.loadMusic(musicBytes))) {
    statusEl.textContent = '预览曲加载失败，仍可静音看谱。';
  }

  statusEl.textContent = '';

  const totalBeats = session.totalBeats;
  const totalDurationMs = session.totalDurationMs;
  const maxMeasure = Math.max(0, Math.ceil(totalBeats / 4) - 1);
  const measurePercents: number[] = [];
  for (let m = 0; m <= maxMeasure; m++) {
    measurePercents.push(Math.min(100, (session.beatsToMs(m * 4) / totalDurationMs) * 100));
  }
  const timelineEntries: SimaiTimelineEntry[] = allNotes.map((note) => ({
    timeMs: note.timingMs,
    kind: TIMELINE_KIND_BY_NOTE_TYPE[note.type],
  }));

  const timelineView = new SimaiTimelineView({
    host: timelineHost,
    bars: timelineBars,
    ruler: timelineRuler,
    playhead: timelinePlayhead,
    badge: timelineBadge,
    classPrefix: 'timeline',
    durationMs: totalDurationMs,
    maxMeasure,
    measurePercents,
    entries: timelineEntries,
  });
  const fullscreenTimelineView = new SimaiTimelineView({
    host: fsTimelineHost,
    bars: fsTimelineBars,
    ruler: fsTimelineRuler,
    playhead: fsTimelinePlayhead,
    badge: fsTimelineBadge,
    classPrefix: 'fs-timeline',
    durationMs: totalDurationMs,
    maxMeasure,
    measurePercents,
    entries: timelineEntries,
  });

  const background = new SimaiBackgroundMedia({
    image: backgroundImage,
    video: backgroundVideo,
    mode: backgroundMode,
    imageUrl: config.backgroundImageUrl,
    videoUrl: config.backgroundVideoUrl,
    host: {
      render: () => renderFrameAll(session.positionBeats),
      reportVideo: (result, video) => reportBackgroundVideo(result, video),
      readStatus: () => statusEl.textContent ?? '',
      writeStatus: (message) => { statusEl.textContent = message; },
      setImage: (image) => { for (const renderer of renderers) renderer.setBackgroundImage(image); },
      setVideo: (video) => { for (const renderer of renderers) renderer.setBackgroundVideo(video); },
    },
  });

  const renderFrameAll = (beats: number) => {
    background.syncFrame({
      currentBeats: beats,
      totalBeats,
      playing: session.playing,
      speed: session.speed,
      bpmEvents: chart.bpmEvents,
      bpm: chart.bpm,
      musicOffset: SIMAI_PREVIEW_MUSIC_OFFSET_SECONDS,
      firstMs: chart.firstMs ?? 0,
    });
    for (let i = 0; i < charts.length; i++) {
      renderers[i]!.renderAtTime(charts[i]!, session.beatsToMs(beats) + 240000 / charts[i]!.bpm - 240000 / chart.bpm);
    }
  };

  const updateSeekUi = (beats: number) => {
    const ms = session.beatsToMs(beats);
    if (!isDragging) {
      const pct = totalDurationMs > 0 ? (ms / totalDurationMs) * 100 : 0;
      const measure = Math.floor(beats / 4);
      timelineView.updatePlayhead(pct, measure);
      if (isFullscreen) fullscreenTimelineView.updatePlayhead(pct, measure);
    }
    const nextTimeLabel = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
    if (timeLabel.textContent !== nextTimeLabel) timeLabel.textContent = nextTimeLabel;
    if (isFullscreen && fsTimeLabel.textContent !== nextTimeLabel) {
      fsTimeLabel.textContent = nextTimeLabel;
    }
  };

  const setText = (element: HTMLElement, value: string) => {
    if (element.textContent !== value) element.textContent = value;
  };
  const setDisplay = (element: HTMLElement, value: string) => {
    if (element.style.display !== value) element.style.display = value;
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
    setText(infoBpm, `${Math.floor(bpm)}`);
    setText(infoBeat, beatText);
    setText(infoCombo, `${completedNotes} / ${totalNotes}`);
    if (totalBreaks > 0) {
      setDisplay(infoBreakWrap, '');
      setText(infoBreak, `${completedBreaks} / ${totalBreaks}`);
    } else {
      setDisplay(infoBreakWrap, 'none');
    }
    if (totalBreaksNoEx > 0) {
      setDisplay(infoBreakNoexWrap, '');
      setText(infoBreakNoex, `${completedBreaksNoEx} / ${totalBreaksNoEx}`);
    } else {
      setDisplay(infoBreakNoexWrap, 'none');
    }
    if (fps > 0) {
      setText(infoFps, `FPS: ${fps}`);
      const nextClass = fps >= 55
        ? 'info-val info-fps-green'
        : fps >= 30
          ? 'info-val info-fps-yellow'
          : 'info-val info-fps-red';
      if (infoFps.className !== nextClass) infoFps.className = nextClass;
    } else {
      setText(infoFps, '');
      if (infoFps.className !== 'info-val') infoFps.className = 'info-val';
    }
  };

  const renderAt = (beats: number) => {
    renderFrameAll(beats);
    updateSeekUi(beats);
    updateOverlayDom();
  };

  const togglePlayback = () => {
    if (session.playing) session.pause();
    else void session.play();
  };

  /** 暂停（手动按钮或宿主生命周期）：停播并释放临时媒体，不改变全屏状态。 */
  const pauseForLifecycle = (): void => {
    session.pause();
    background.releaseVideo();
  };

  /** 释放：停播、退出全屏、回收资源，幂等；此后不再改动界面或回报状态。 */
  const disposePlayer = (): void => {
    if (disposed) return;
    pauseForLifecycle();
    session.dispose();
    background.dispose();
    if (isFullscreen) exitFullscreen();
    closeActiveWheelPopup();
    disposed = true;
  };

  const restartMeasure = () => {
    session.moveTo(Math.floor(session.positionBeats / 4) * 4);
    if (session.playing) void session.play();
    else renderAt(session.positionBeats);
  };

  const skipBeats = (deltaBeats: number) => {
    session.moveTo(session.positionBeats + deltaBeats);
    if (session.playing) void session.play();
    else renderAt(session.positionBeats);
  };

  const skipToMeasure = (direction: -1 | 1) => {
    const currentMeasure = Math.floor(session.positionBeats / 4);
    const targetMeasure = clamp(currentMeasure + direction, 0, maxMeasure);
    session.moveTo(targetMeasure * 4);
    if (session.playing) void session.play();
    else renderAt(session.positionBeats);
  };

  setupWheelPopup(
    hiSpeedTrigger,
    hiSpeedPopup,
    hiSpeedWheel,
    hiSpeedList,
    hiSpeedVal,
    (hiSpeed) => {
      for (const r of renderers) r.setHiSpeed(hiSpeed);
      renderAt(session.positionBeats);
    },
    (hiSpeed) => saveSettings({ hiSpeed }),
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
      session.setSpeed(speed);
      for (const r of renderers) r.setPlaybackSpeed(session.speed);
    },
    (speed) => saveSettings({ playbackSpeed: clamp(speed, SPEED_MIN, SPEED_MAX) }),
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
    (vol) => session.setMusicVolume(vol),
    (vol) => saveSettings({ musicVolume: clamp(vol, 0, 10) }),
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
    (vol) => session.setSoundVolume(vol),
    (vol) => saveSettings({ soundVolume: clamp(vol, 0, 10) }),
    0,
    10,
    0.1,
    saved.soundVolume ?? 10,
  );

  const MIRROR_LABELS = ['无', '左右反', '上下反', '全反'] as const;
  const MIRROR_VALUES = ['none', 'horizontal', 'vertical', 'rotate180'] as const;
  const mirrorIdx = Math.max(0, MIRROR_VALUES.findIndex(value => value === saved.mirrorMode));
  setupWheelPopup(
    mirrorTrigger, mirrorPopup, mirrorWheel, mirrorList, mirrorVal,
    (idx) => {
      const mode = MIRROR_VALUES[idx] ?? 'none';
      for (const r of renderers) r.setMirrorMode(mode);
      renderAt(session.positionBeats);
    },
    (idx) => saveSettings({ mirrorMode: MIRROR_VALUES[idx] ?? 'none' }),
    0, 3, 1, mirrorIdx, MIRROR_LABELS,
  );

  const STYLE_LABELS = ['无', '判定点', '判定线', '判定区'] as const;
  const STYLE_VALUES = ['blind', 'noLine', 'simple', 'sensor'] as const;
  const styleIdx = Math.max(0, STYLE_VALUES.findIndex(value => value === (saved.judgmentLineDesign ?? 'sensor')));
  setupWheelPopup(
    styleTrigger, stylePopup, styleWheel, styleList, styleVal,
    (idx) => {
      const design = STYLE_VALUES[idx] ?? 'sensor';
      for (const r of renderers) r.setJudgmentLineDesign(design);
      renderAt(session.positionBeats);
    },
    (idx) => saveSettings({ judgmentLineDesign: STYLE_VALUES[idx] ?? 'sensor' }),
    0, 3, 1, styleIdx, STYLE_LABELS,
  );

  const JUDGE_HINT_LABELS = ['区分', '不区分', '不显示'] as const;
  const JUDGE_HINT_VALUES = ['distinguish', 'unified', 'hidden'] as const;
  const judgeHintIdx = Math.max(0, JUDGE_HINT_VALUES.indexOf(parseJudgeHint(saved.judgeHint)));
  setupWheelPopup(
    judgeHintTrigger, judgeHintPopup, judgeHintWheel, judgeHintList, judgeHintVal,
    (idx) => {
      const mode = JUDGE_HINT_VALUES[idx] ?? DEFAULT_JUDGE_HINT;
      for (const r of renderers) r.setJudgeHint(mode);
      renderAt(session.positionBeats);
    },
    (idx) => saveSettings({ judgeHint: JUDGE_HINT_VALUES[idx] ?? DEFAULT_JUDGE_HINT }),
    0, 2, 1, judgeHintIdx, JUDGE_HINT_LABELS,
  );

  const BACKGROUND_LABELS = ['无背景', '图片背景', '视频背景'] as const;
  const BACKGROUND_VALUES = ['none', 'image', 'video'] as const;
  const backgroundIdx = Math.max(0, BACKGROUND_VALUES.indexOf(backgroundMode));
  let pendingBackgroundPreviousMode: BackgroundMode | null = null;
  let backgroundControl: ReturnType<typeof setupWheelPopup>;
  backgroundControl = setupWheelPopup(
    backgroundTrigger,
    backgroundPopup,
    backgroundWheel,
    backgroundList,
    backgroundVal,
    () => undefined,
    (idx) => {
      const nextMode = BACKGROUND_VALUES[idx] ?? 'none';
      const previousMode = background.backgroundMode;
      if (nextMode === 'video' && !videoBackgroundPrompted) {
        videoBackgroundPrompted = true;
        pendingBackgroundPreviousMode = previousMode;
        backgroundControl.setValue(BACKGROUND_VALUES.indexOf(previousMode));
        saveSettings({ videoBackgroundPrompted: true });
        postStatus('background-video-confirmation');
        return;
      }
      saveSettings({ backgroundMode: nextMode });
      background.setMode(nextMode);
    },
    0,
    2,
    1,
    backgroundIdx,
    BACKGROUND_LABELS,
  );
  background.setMode(backgroundMode);

  /** 视频背景确认回执：只有发起过询问（pendingBackgroundPreviousMode）时才有意义。 */
  const applyBackgroundVideoConfirmation = (accepted: boolean) => {
    if (pendingBackgroundPreviousMode === null) return;
    const previousMode = pendingBackgroundPreviousMode;
    pendingBackgroundPreviousMode = null;
    if (accepted) {
      backgroundControl.setValue(BACKGROUND_VALUES.indexOf('video'));
      saveSettings({ backgroundMode: 'video' });
      background.setMode('video');
    } else {
      backgroundControl.setValue(BACKGROUND_VALUES.indexOf(previousMode));
    }
  };

  const setupToggle = (btn: HTMLButtonElement, initial: boolean, onChange: (v: boolean) => void) => {
    let active = initial;
    btn.setAttribute('aria-pressed', String(active));
    btn.addEventListener('click', () => {
      active = !active;
      btn.setAttribute('aria-pressed', String(active));
      onChange(active);
      renderAt(session.positionBeats);
    });
  };

  setupToggle(togglePink, !!saved.pinkSlideStart, (v) => { for (const r of renderers) r.setPinkSlideStart(v); saveSettings({ pinkSlideStart: v }); });
  setupToggle(toggleStarRot, saved.slideRotation ?? true, (v) => { for (const r of renderers) r.setSlideRotation(v); saveSettings({ slideRotation: v }); });
  setupToggle(toggleEx, saved.highlightExNotes ?? false, (v) => { for (const r of renderers) r.setHighlightExNotes(v); saveSettings({ highlightExNotes: v }); });
  setupToggle(toggleBreakSlide, !!saved.normalColorBreakSlide, (v) => { for (const r of renderers) r.setNormalColorBreakSlide(v); saveSettings({ normalColorBreakSlide: v }); });
  setupToggle(toggleHit, saved.showHitEffect ?? true, (v) => { for (const r of renderers) r.setShowHitEffect(v); saveSettings({ showHitEffect: v }); });
  setupToggle(toggleFirework, saved.showFireworks ?? true, (v) => { for (const r of renderers) r.setShowFireworks(v); saveSettings({ showFireworks: v }); });

  let lastResizeKey = '';
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
    const resizeKey = `${isFullscreen}:${size}:${window.devicePixelRatio || 1}`;
    if (resizeKey === lastResizeKey) return;
    lastResizeKey = resizeKey;
    canvasWrap.style.width = isFullscreen
      ? `${size * chartCount + CHART_PREVIEW_DUAL_GAP * (chartCount - 1)}px`
      : '';
    for (const stage of canvasStages) {
      stage.style.width = `${size}px`;
      stage.style.height = `${size}px`;
    }
    canvasWrap.style.height = `${size}px`;
    for (const r of renderers) r.resize(isFullscreen);
    renderAt(session.positionBeats);
  };
  const resizeScheduler = createLatestFrameScheduler(
    requestAnimationFrame,
    cancelAnimationFrame,
    resize,
  );
  const scheduleResize = () => resizeScheduler.schedule(undefined);
  window.addEventListener('resize', scheduleResize);
  window.visualViewport?.addEventListener('resize', scheduleResize);
  new ResizeObserver(scheduleResize).observe(canvasWrap);
  resize();

  timelineView.build();
  const timelineLayoutScheduler = createLatestFrameScheduler(
    requestAnimationFrame,
    cancelAnimationFrame,
    () => timelineView.build(),
  );
  window.addEventListener('resize', () => timelineLayoutScheduler.schedule(undefined));
  new ResizeObserver(() => timelineLayoutScheduler.schedule(undefined)).observe(timelineHost);

  const seekToPosition = (percent: number) => {
    const targetMs = (percent / 100) * totalDurationMs;
    session.moveTo(session.beatsAtMs(targetMs));
    const beats = session.positionBeats;
    const ms = session.beatsToMs(beats);
    const measure = Math.floor(beats / 4);
    const pct = (ms / totalDurationMs) * 100;
    timelineView.updatePlayhead(pct, measure);
    if (isFullscreen) fullscreenTimelineView.updatePlayhead(pct, measure);
    timeLabel.textContent = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
    if (isFullscreen) fsTimeLabel.textContent = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
    // 拖动时实时渲染画面与信息栏，恢复"拖动即看到对应帧"的能力
    renderFrameAll(beats);
    updateOverlayDom();
  };
  const seekScheduler = createLatestFrameScheduler(
    requestAnimationFrame,
    cancelAnimationFrame,
    seekToPosition,
  );

  timelineHost.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    isDragging = true;
    wasPlaying = session.playing;
    if (session.playing) session.pause();
    const rect = timelineHost.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    seekToPosition(pct);
  });

  document.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const host = isFullscreen ? fsTimelineHost : timelineHost;
    const rect = host.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    seekScheduler.schedule(pct);
  });

  document.addEventListener('pointerup', () => {
    if (!isDragging) return;
    isDragging = false;
    seekScheduler.flush();
    renderAt(session.positionBeats);
    if (wasPlaying) void session.play();
  });

  // 移动设备拖动被系统中断（多指/来电/通知等）时，pointerup 不会触发；
  // 若不重置 isDragging，后续 pointermove 会继续按拖动逻辑执行，干扰播放键等点击。
  // 这里只重置状态并停留在当前帧，不自动恢复播放，避免中断后突然发声。
  document.addEventListener('pointercancel', () => {
    if (!isDragging) return;
    isDragging = false;
    seekScheduler.flush();
    renderAt(session.positionBeats);
  });

  playBtn.addEventListener('click', togglePlayback);

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

  btnRestart.addEventListener('click', restartMeasure);

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
    requestAnimationFrame(resize);
  }

  function enterFullscreen() {
    isFullscreen = true;
    document.body.classList.add('fullscreen');
    fullscreenTimelineView.build();
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
      session.playing ? '暂停' : '播放',
      session.playing ? PAUSE_ICON : PLAY_ICON,
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
    document.getElementById('fs-restart')!.addEventListener('click', restartMeasure);
    document.getElementById('fs-prev-measure')!.addEventListener('click', () => skipToMeasure(-1));
    document.getElementById('fs-step-back')!.addEventListener('click', () => skipBeats(-1));
    document.getElementById('fs-step-forward')!.addEventListener('click', () => skipBeats(1));
    document.getElementById('fs-next-measure')!.addEventListener('click', () => skipToMeasure(1));
    document.getElementById('fs-fullscreen')!.addEventListener('click', exitFullscreen);
    fsPlay.addEventListener('click', togglePlayback);
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
    loopA = loopA === null ? session.positionBeats : null;
    if (loopA !== null && loopB !== null && loopA > loopB) {
      const previousLoopA = loopA;
      loopA = loopB;
      loopB = previousLoopA;
    }
    syncLoopButtons();
  };

  const toggleLoopB = () => {
    loopB = loopB === null ? session.positionBeats : null;
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
    wasPlaying = session.playing;
    if (session.playing) session.pause();
    const rect = fsTimelineHost.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    seekToPosition(pct);
    showFsControls();
  });

  window.addEventListener('message', (event) => {
    // 生命周期合同由公共层派生：暂停停播保全屏，退出全屏与释放是显式命令。
    applyChartPreviewHostCommand(event.data, {
      pause: pauseForLifecycle,
      exitFullscreen,
      dispose: disposePlayer,
      confirm: applyBackgroundVideoConfirmation,
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && session.playing) session.pause();
  });

  renderAt(0);
  postStatus('ready', { chartId: config.chartId, measures: chart.measures });
}

void main().catch((error) => {
  const diagnostic = error instanceof Error
    ? `${error.message}\n${error.stack ?? ''}`
    : String(error);
  const status = document.getElementById('status');
  if (status) status.textContent = '无法打开谱面，请返回重试。';
  postStatus('error', { message: '无法打开谱面，请返回重试。', diagnostic: `unhandled: ${diagnostic}` });
});
