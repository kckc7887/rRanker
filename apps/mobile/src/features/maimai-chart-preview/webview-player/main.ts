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
  prepareAudioEvents,
  type Chart,
  type ChartDifficulty,
  type PreparedAudioEvent,
} from '../engine';
import { PlaybackClock } from './playbackClock';
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
  musicEnabled?: boolean;
  soundEnabled?: boolean;
  musicVolume?: number;
  soundVolume?: number;
}

export interface ChartPreviewConfig {
  chartId: number;
  difficulty: ChartDifficulty;
  title?: string;
  settings?: ChartPreviewSettings | null;
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
): { getValue: () => number } {
  const values = buildWheelValues(min, max, step);
  let current = values.includes(initial) ? initial : values[0] ?? min;
  let settleTimer = 0;

  const refreshList = () => {
    list.replaceChildren(
      ...values.map((value) => {
        const item = document.createElement('div');
        item.className = 'wheel-item';
        item.dataset.value = String(value);
        item.textContent = value.toFixed(1);
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

  return { getValue: () => current };
}

async function main(): Promise<void> {
  const statusEl = $('status');
  const titleEl = $('title');
  const canvas = $('chart-canvas') as HTMLCanvasElement;
  const canvasWrap = $('canvas-wrap');
  const canvasStage = $('canvas-stage');
  const playBtn = $('play') as HTMLButtonElement;
  const seekInput = $('seek') as HTMLInputElement;
  const timeLabel = $('time-label');
  const hiSpeedWheel = $('hi-speed-wheel');
  const hiSpeedList = $('hi-speed-list');
  const speedWheel = $('speed-wheel');
  const speedList = $('speed-list');
  const musicToggle = $('music-enabled') as HTMLInputElement;
  const soundToggle = $('sound-enabled') as HTMLInputElement;
  const musicVolumeInput = $('music-volume') as HTMLInputElement;
  const soundVolumeInput = $('sound-volume') as HTMLInputElement;
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
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : '谱面加载失败';
    postStatus('error', { message: String(error) });
    return;
  }

  let chart: Chart;
  try {
    const available = getAvailableDifficulties(simaiText);
    let difficulty = config.difficulty;
    if (!available[difficulty]) {
      const keys = (Object.keys(available).map(Number) as ChartDifficulty[]).sort((a, b) => b - a);
      if (!keys[0]) throw new Error('谱面中没有可用难度');
      difficulty = keys[0];
    }
    chart = parseSimaiChart(simaiText, difficulty);
  } catch (error) {
    statusEl.textContent = error instanceof Error ? error.message : '谱面解析失败';
    postStatus('error', { message: String(error) });
    return;
  }

  const totalBeats = Math.max(chart.measures * 4, 4);
  let totalDurationMs = beatsToMs(totalBeats, chart.bpmEvents, chart.bpm);
  for (const note of chart.notes ?? []) {
    if (note.timingMs > totalDurationMs) totalDurationMs = note.timingMs;
  }

  const renderer = new MainRenderer(canvas, { sensorImagePath: './sensor.webp' });
  renderer.setJudgmentLineDesign('sensor');
  renderer.setPlaybackSpeed(saved.playbackSpeed ?? 1);
  renderer.setHiSpeed(saved.hiSpeed ?? HI_SPEED_DEFAULT);
  renderer.setShowBpm(false);
  renderer.setShowNoteTotal(false);
  renderer.setShowBreakCount(false);

  let audioContext: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let answerGain: GainNode | null = null;
  let audioBuffer: AudioBuffer | null = null;
  let sourceNode: AudioBufferSourceNode | null = null;
  let sourceGain: GainNode | null = null;
  let answerManager: AudioManager | null = null;
  const answerEvents: PreparedAudioEvent[] = prepareAudioEvents(chart.notes ?? null);
  const playbackClock = new PlaybackClock();
  let isSourcePlaying = false;
  let isPlaying = false;
  let preciseBeats = 0;
  let playbackSpeed = saved.playbackSpeed ?? 1;
  const musicOffset = 0;
  let musicVolume = saved.musicVolume ?? 0.8;
  let soundVolume = saved.soundVolume ?? 0.6;
  let musicEnabled = saved.musicEnabled ?? true;
  let soundEnabled = saved.soundEnabled ?? true;
  let rafId = 0;
  let seeking = false;
  let lastRafTs = 0;

  musicToggle.checked = musicEnabled;
  soundToggle.checked = soundEnabled;
  musicVolumeInput.value = String(musicVolume);
  soundVolumeInput.value = String(soundVolume);

  const saveSettings = (partial: Partial<ChartPreviewSettings>) => {
    postStatus('settings', partial);
  };

  const ensureAudio = async (): Promise<AudioContext> => {
    if (!audioContext) {
      audioContext = new AudioContext();
      musicGain = audioContext.createGain();
      musicGain.gain.value = musicEnabled ? musicVolume : 0;
      musicGain.connect(audioContext.destination);
      answerGain = audioContext.createGain();
      answerGain.connect(audioContext.destination);
      answerManager = new AudioManager({
        audioContext,
        outputNode: answerGain,
        answerSoundPath: './answer.wav',
        initialVolume: soundVolume,
        initialTimingOffset: ANSWER_SOUND_BASE_OFFSET_MS,
      });
      answerManager.setEnabled(soundEnabled);
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
    if (!audioBuffer || !musicEnabled) return;
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
  } catch (error) {
    statusEl.textContent = error instanceof Error ? `${error.message}（仍可静音看谱）` : '预览曲加载失败';
    audioBuffer = null;
  }

  statusEl.textContent = '';
  postStatus('ready', { chartId: config.chartId, measures: chart.measures });

  const updateSeekUi = () => {
    const ms = beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm);
    if (!seeking) seekInput.value = String(clamp(totalDurationMs > 0 ? ms / totalDurationMs : 0, 0, 1));
    timeLabel.textContent = `${formatTime(ms)} / ${formatTime(totalDurationMs)}`;
  };

  const updateOverlayDom = () => {
    const ov = renderer.frameOverlay;
    if (!ov) return;
    infoBpm.textContent = `${Math.floor(ov.bpm)}`;
    infoBeat.textContent = ov.beatText;
    infoCombo.textContent = `${ov.completedNotes} / ${ov.totalNotes}`;
    if (ov.totalBreaks > 0) {
      infoBreakWrap.style.display = '';
      infoBreak.textContent = `${ov.completedBreaks} / ${ov.totalBreaks}`;
    } else {
      infoBreakWrap.style.display = 'none';
    }
    if (ov.totalBreaksNoEx > 0) {
      infoBreakNoexWrap.style.display = '';
      infoBreakNoex.textContent = `${ov.completedBreaksNoEx} / ${ov.totalBreaksNoEx}`;
    } else {
      infoBreakNoexWrap.style.display = 'none';
    }
    const fps = ov.fps;
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
    renderer.renderFrame(chart, preciseBeats, 4);
    updateSeekUi();
    updateOverlayDom();
  };

  createWheel(
    hiSpeedWheel,
    hiSpeedList,
    (hiSpeed) => {
      renderer.setHiSpeed(hiSpeed);
      saveSettings({ hiSpeed });
      renderAt(preciseBeats);
    },
    HI_SPEED_MIN,
    HI_SPEED_MAX,
    HI_SPEED_STEP,
    saved.hiSpeed ?? HI_SPEED_DEFAULT,
  );

  createWheel(
    speedWheel,
    speedList,
    (speed) => {
      playbackSpeed = clamp(speed, 0.1, 5);
      renderer.setPlaybackSpeed(playbackSpeed);
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

  const resize = () => {
    const rect = canvasWrap.getBoundingClientRect();
    const size = Math.max(0, Math.floor(rect.width));
    canvasStage.style.width = `${size}px`;
    canvasStage.style.height = `${size}px`;
    canvasWrap.style.height = `${size}px`;
    renderer.resize(false);
    renderAt(preciseBeats);
  };
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(canvasWrap);
  resize();

  const scheduleAnswers = (currentMs: number) => {
    if (!answerManager || !soundEnabled || !isPlaying) return;
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

    if (musicEnabled && audioBuffer && isSourcePlaying && audioContext) {
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
      renderer.setIsPlaying(false);
      stopSource(true);
      answerManager?.reset(undefined, true);
      playBtn.innerHTML = PLAY_ICON;
      playBtn.setAttribute('aria-label', '播放');
      renderAt(totalBeats);
      return;
    }

    preciseBeats = currentBeats;
    const currentMs = beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm);
    renderer.renderFrame(chart, preciseBeats, 4);
    updateSeekUi();
    updateOverlayDom();
    scheduleAnswers(currentMs);
    rafId = requestAnimationFrame(tick);
  };

  const startPlayback = async () => {
    await ensureAudio();
    isPlaying = true;
    renderer.setIsPlaying(true);
    playBtn.innerHTML = PAUSE_ICON;
    playBtn.setAttribute('aria-label', '暂停');
    lastRafTs = 0;
    const musicTime = calculateMusicTime(
      preciseBeats,
      chart.bpmEvents,
      chart.bpm,
      musicOffset,
      chart.firstMs ?? 0,
    );
    answerManager?.reset(beatsToMs(preciseBeats, chart.bpmEvents, chart.bpm), true);
    if (musicEnabled && audioBuffer && musicTime < audioBuffer.duration - MUSIC_END_EPSILON_S) {
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
    renderer.setIsPlaying(false);
    playBtn.innerHTML = PLAY_ICON;
    playBtn.setAttribute('aria-label', '播放');
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

  seekInput.addEventListener('pointerdown', () => {
    seeking = true;
  });
  seekInput.addEventListener('pointerup', () => {
    seeking = false;
  });
  seekInput.addEventListener('input', () => {
    const ratio = Number(seekInput.value);
    const targetMs = ratio * totalDurationMs;
    preciseBeats = clamp(msToBeats(targetMs, chart.bpmEvents, chart.bpm), 0, totalBeats);
    if (isPlaying) void startPlayback();
    else renderAt(preciseBeats);
  });

  musicToggle.addEventListener('change', () => {
    musicEnabled = musicToggle.checked;
    saveSettings({ musicEnabled });
    if (musicGain) musicGain.gain.value = musicEnabled ? musicVolume : 0;
    if (isPlaying) void startPlayback();
  });

  soundToggle.addEventListener('change', () => {
    soundEnabled = soundToggle.checked;
    saveSettings({ soundEnabled });
    answerManager?.setEnabled(soundEnabled);
    if (!soundEnabled) answerManager?.reset(undefined, true);
  });

  musicVolumeInput.addEventListener('input', () => {
    musicVolume = Number(musicVolumeInput.value) || 0;
    saveSettings({ musicVolume });
    if (musicGain) musicGain.gain.value = musicEnabled ? musicVolume : 0;
  });

  soundVolumeInput.addEventListener('input', () => {
    soundVolume = Number(soundVolumeInput.value) || 0;
    saveSettings({ soundVolume });
    answerManager?.setVolume(soundVolume);
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (data === 'stop' || (typeof data === 'object' && data?.type === 'stop')) pausePlayback();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isPlaying) pausePlayback();
  });

  renderAt(0);
}

void main().catch((error) => {
  const status = document.getElementById('status');
  if (status) status.textContent = error instanceof Error ? error.message : String(error);
  postStatus('error', { message: String(error) });
});
