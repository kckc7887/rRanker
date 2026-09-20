import type { RizlineChartPreviewConfig, RizlineChartPreviewSettings } from '../configuration';
import {
  PLAYBACK_SPEED_MAX,
  PLAYBACK_SPEED_MIN,
  PLAYBACK_SPEED_STEP,
  USER_SPEED_MAX,
  USER_SPEED_MIN,
  USER_SPEED_STEP,
  normalizeRizlineChartPreviewSettings,
} from '../configuration';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';
import { closeActiveWheelPopup, setupWheelPopup } from '../../chart-preview-shared/webview-player/wheel';
import { prepareOfficialChart } from './chart-prepare';
import { PreviewSession, decodeAudio } from './playback';
import { RizlineRenderer } from './renderer';

declare global {
  interface Window {
    __RIZLINE_CHART_PREVIEW_CONFIG__?: RizlineChartPreviewConfig;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

const element = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

const canvas = element<HTMLCanvasElement>('playfield');
const stage = element('stage');
const playButton = element<HTMLButtonElement>('play-button');
const fullscreenButton = element<HTMLButtonElement>('btn-fullscreen');
const lockButton = element<HTMLButtonElement>('fs-lock');
const timeline = element('timeline-host');
const controls = element('controls');
const wheels: ReturnType<typeof setupWheelPopup>[] = [];
let userSpeedWheel: ReturnType<typeof setupWheelPopup> | undefined;
let settings = normalizeRizlineChartPreviewSettings({});
let session: PreviewSession | null = null;
let renderer: RizlineRenderer | null = null;
let disposed = false;
let dragging = false;
let wasPlayingBeforeDrag = false;
let fullscreen = false;
let locked = false;
let controlsVisible = true;
let uiFrame = 0;
let controlsTimer = 0;
let lastUiFrame = -Infinity;
const STEP_SECONDS = 5;

function post(type: string, values: Record<string, unknown> = {}): void {
  if (!disposed) window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...values }));
}
function status(message: string): void { element('status').textContent = message; }
function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
function syncTransport(): void {
  if (!session || disposed) return;
  const playing = session.playing;
  const position = session.currentTime;
  const pct = session.duration > 0 ? Math.min(100, Math.max(0, position / session.duration * 100)) : 0;
  element('play-icon').innerHTML = playing
    ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>' : '<path d="M8 5v14l11-7z"/>';
  playButton.setAttribute('aria-label', playing ? '暂停' : '播放');
  element('time-label').textContent = `${formatClock(position)} / ${formatClock(session.duration)}`;
  element('timeline-playhead').style.left = `${pct}%`;
  element('timeline-badge').style.left = `${pct}%`;
  element('timeline-badge').textContent = formatClock(position);
  if (session.ended) status('播放结束');
}
function tick(time: number): void {
  uiFrame = 0;
  if (disposed) return;
  if (time - lastUiFrame >= 100 || !session?.playing) { syncTransport(); lastUiFrame = time; }
  if (session?.playing) uiFrame = requestAnimationFrame(tick);
}
function buildTimeline(): void {
  const bars = element('timeline-bars');
  const ruler = element('timeline-ruler');
  bars.replaceChildren();
  ruler.replaceChildren();
  if (!session) return;
  const duration = session.duration;
  const width = Math.max(1, Math.ceil(timeline.getBoundingClientRect().width));
  const count = Math.min(200, width);
  const buckets = Array.from({ length: count }, () => [0, 0, 0]);
  for (const line of session.chart.lines) {
    for (const note of line.notes) {
      const time = note.seconds + session.chart.delaySeconds;
      const index = Math.min(count - 1, Math.max(0, Math.floor(time / duration * count)));
      const kind = note.kind === 1 ? 1 : note.kind === 2 ? 2 : 0;
      buckets[index]![kind]! += 1;
    }
  }
  const max = Math.max(1, ...buckets.map((bucket) => bucket.reduce((sum, n) => sum + n, 0)));
  const colors = ['#5b8cff', '#00CED1', '#FF8C00'];
  buckets.forEach((bucket, index) => {
    const total = bucket.reduce((sum, n) => sum + n, 0);
    if (!total) return;
    const bar = document.createElement('div');
    bar.className = 'timeline-bar';
    Object.assign(bar.style, {
      left: `${index / count * 100}%`,
      width: `${100 / count}%`,
      height: `${Math.max(2, total / max * 22)}px`,
    });
    bucket.forEach((value, kind) => {
      if (!value) return;
      const segment = document.createElement('div');
      Object.assign(segment.style, { flex: String(value / total), width: '100%', backgroundColor: colors[kind] });
      bar.appendChild(segment);
    });
    bars.appendChild(bar);
  });
  const tickStep = [1, 5, 10, 15, 30, 60, 120, 300].find((step) => width * step / duration >= 4) ?? 300;
  const labelStep = [5, 10, 15, 30, 60, 120, 300, 600].find((step) => width * step / duration >= 24) ?? 600;
  for (let time = 0; time <= duration; time += tickStep) {
    const pct = `${time / duration * 100}%`;
    const major = time % labelStep === 0;
    const mark = document.createElement('div');
    mark.className = `timeline-tick ${major ? 'major' : Number.isInteger(time / (labelStep / 2)) ? 'medium' : 'minor'}`;
    mark.style.left = pct;
    ruler.appendChild(mark);
    if (major) {
      const label = document.createElement('div');
      label.className = 'timeline-label';
      label.style.left = pct;
      label.textContent = formatClock(time);
      ruler.appendChild(label);
    }
  }
  syncTransport();
}
const timelineObserver = new ResizeObserver(buildTimeline);
timelineObserver.observe(timeline);

function syncControlsVisibility(): void {
  controls.classList.toggle('hidden', !controlsVisible || locked);
  lockButton.classList.toggle('hidden', !controlsVisible);
}
function showControls(): void {
  window.clearTimeout(controlsTimer);
  controlsVisible = true;
  syncControlsVisibility();
  if (fullscreen && !dragging) controlsTimer = window.setTimeout(() => {
    controlsVisible = false;
    syncControlsVisibility();
  }, 5000);
}
function hideControls(): void {
  window.clearTimeout(controlsTimer);
  controlsVisible = false;
  syncControlsVisibility();
}
function setFullscreen(active: boolean): void {
  closeActiveWheelPopup();
  fullscreen = active;
  document.body.classList.toggle('fullscreen', active);
  fullscreenButton.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
  if (!active) {
    locked = false;
    lockButton.classList.remove('locked');
    lockButton.setAttribute('aria-label', '锁定');
    lockButton.setAttribute('aria-pressed', 'false');
  }
  showControls();
  renderer?.resize();
  session?.draw();
  post('fullscreen', { active });
}
function persistSettings(): void { post('settings', { ...settings }); }
function changeSettings(partial: Partial<RizlineChartPreviewSettings>): void {
  settings = normalizeRizlineChartPreviewSettings({ ...settings, ...partial });
  session?.setSettings(settings);
}

function setupSettings(): void {
  const field = (
    id: string,
    key: keyof RizlineChartPreviewSettings,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
  ) => {
    const initial = settings[key] as number;
    const wheel = setupWheelPopup(
      element(`${id}-trigger`),
      element(`${id}-popup`),
      element(`${id}-wheel`),
      element(`${id}-list`),
      element(`${id}-val`),
      (value) => { changeSettings({ [key]: value }); },
      persistSettings,
      min,
      max,
      step,
      initial,
      undefined,
      format,
    );
    wheels.push(wheel);
    return wheel;
  };
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  userSpeedWheel = field('user-speed', 'userSpeed', USER_SPEED_MIN, USER_SPEED_MAX, USER_SPEED_STEP, (value) => value.toFixed(1));
  field('speed', 'playbackSpeed', PLAYBACK_SPEED_MIN, PLAYBACK_SPEED_MAX, PLAYBACK_SPEED_STEP, (value) => `${value.toFixed(2)}×`);
  field('volume', 'volume', 0, 1, 0.01, percent);
  field('hit-sound-volume', 'hitSoundVolume', 0, 1, 0.01, percent);
  const hitSound = element<HTMLButtonElement>('hit-sound');
  hitSound.setAttribute('aria-pressed', String(settings.hitSound));
  hitSound.addEventListener('click', () => {
    changeSettings({ hitSound: !settings.hitSound });
    hitSound.setAttribute('aria-pressed', String(settings.hitSound));
    persistSettings();
  });
}

async function runTransport(action: (current: PreviewSession) => void | Promise<void>): Promise<void> {
  const current = session;
  if (!current || disposed) return;
  try {
    await action(current);
    if (current !== session || disposed) return;
    status(current.ended ? '播放结束' : current.playing ? '正在播放' : '已暂停');
  } catch {
    if (current !== session || disposed) return;
    current.pause();
    status('播放暂时中断，请重试');
  }
  syncTransport();
  cancelAnimationFrame(uiFrame);
  if (current.playing) uiFrame = requestAnimationFrame(tick);
  showControls();
}
function togglePlay(): void {
  void runTransport((current) => current.playing ? current.pause() : current.playFrom(current.ended ? 0 : current.currentTime));
}
function pauseForLifecycle(): void {
  dragging = false;
  closeActiveWheelPopup();
  if (session) { session.pause(); status('已暂停'); syncTransport(); }
  if (fullscreen) setFullscreen(false);
}
function dispose(): void {
  if (disposed) return;
  if (fullscreen) setFullscreen(false);
  disposed = true;
  session?.dispose();
  session = null;
  timelineObserver.disconnect();
  for (const wheel of wheels) wheel.dispose();
  cancelAnimationFrame(uiFrame);
  window.clearTimeout(controlsTimer);
  delete window.__RIZLINE_CHART_PREVIEW_CONFIG__;
}

playButton.addEventListener('click', togglePlay);
element('btn-restart').addEventListener('click', () => { void runTransport((current) => current.playFrom(0)); });
for (const [id, delta] of [['btn-step-back', -STEP_SECONDS], ['btn-step-forward', STEP_SECONDS]] as const) {
  element(id).addEventListener('click', () => void runTransport((current) => current.seek(current.currentTime + delta)));
}
fullscreenButton.addEventListener('click', () => setFullscreen(!fullscreen));
lockButton.addEventListener('click', (event) => {
  event.stopPropagation();
  const next = toggleFullscreenLockUiState(locked);
  locked = next.locked;
  lockButton.classList.toggle('locked', locked);
  lockButton.setAttribute('aria-label', next.actionLabel);
  lockButton.setAttribute('aria-pressed', String(locked));
  if (next.overlayHidden) hideControls(); else showControls();
});
canvas.addEventListener('pointerdown', () => {
  if (!fullscreen) return;
  if (controlsVisible) hideControls(); else showControls();
});
controls.addEventListener('pointerdown', () => window.clearTimeout(controlsTimer));
function seekFromPointer(event: PointerEvent): void {
  if (!session) return;
  const rect = timeline.getBoundingClientRect();
  const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  void runTransport((current) => current.seek(percent * current.duration));
}
timeline.addEventListener('pointerdown', (event) => {
  if (!session || locked) return;
  event.preventDefault();
  event.stopPropagation();
  dragging = true;
  wasPlayingBeforeDrag = session.playing;
  session.pause();
  seekFromPointer(event);
});
document.addEventListener('pointermove', (event) => { if (dragging) seekFromPointer(event); });
document.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  if (wasPlayingBeforeDrag) void runTransport((current) => current.playFrom(current.currentTime));
  else showControls();
});
document.addEventListener('pointercancel', () => { dragging = false; syncTransport(); showControls(); });
window.addEventListener('resize', () => {
  closeActiveWheelPopup();
  renderer?.resize();
  session?.draw();
  buildTimeline();
});
new ResizeObserver(() => {
  renderer?.resize();
  session?.draw();
}).observe(stage);
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && fullscreen) { event.preventDefault(); setFullscreen(false); return; }
  if (locked) return;
  if (event.code === 'F3' || event.code === 'F4') {
    event.preventDefault();
    changeSettings({ userSpeed: settings.userSpeed + (event.code === 'F4' ? USER_SPEED_STEP : -USER_SPEED_STEP) });
    userSpeedWheel?.setValue(settings.userSpeed);
    persistSettings();
    return;
  }
  if (event.target instanceof HTMLElement && (event.target.closest('[role="listbox"]') || /^(INPUT|BUTTON|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'Home' || event.code === 'End') {
    event.preventDefault();
    void runTransport((current) => current.seek(
      event.code === 'Home' ? 0 : event.code === 'End' ? current.duration
        : current.currentTime + (event.code === 'ArrowRight' ? STEP_SECONDS : -STEP_SECONDS),
    ));
  }
});
function receiveMessage(event: MessageEvent): void {
  let data: unknown = event.data;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
  if (!data || typeof data !== 'object') return;
  const type = (data as { type?: unknown }).type;
  if (type === 'stop') pauseForLifecycle();
  if (type === 'exit-fullscreen') setFullscreen(false);
}
window.addEventListener('message', receiveMessage);
document.addEventListener('message', (event) => receiveMessage(event as MessageEvent));
window.addEventListener('pagehide', dispose);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForLifecycle(); });

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`resource ${response.status}`);
  return response.arrayBuffer();
}

async function initialize(): Promise<void> {
  const config = window.__RIZLINE_CHART_PREVIEW_CONFIG__;
  if (!config) throw new Error('missing-config');
  document.documentElement.dataset.theme = config.theme;
  settings = normalizeRizlineChartPreviewSettings(config.settings);
  element('title').textContent = config.title || '谱面确认';
  setupSettings();
  post('progress', { value: 0.05, label: '正在准备播放器…' });
  const [chartJson, musicBytes] = await Promise.all([
    fetch(config.chartUrl, { headers: { Accept: 'application/json' } }).then(async (response) => {
      if (!response.ok) throw new Error(`chart ${response.status}`);
      return response.json() as Promise<unknown>;
    }),
    fetchBytes(config.musicUrl),
  ]);
  post('progress', { value: 0.55, label: '正在准备播放器…' });
  const prepared = prepareOfficialChart(chartJson);
  const music = await decodeAudio(musicBytes);
  if (disposed) return;
  renderer = new RizlineRenderer(canvas, stage);
  session = new PreviewSession(prepared, renderer, music, settings);
  session.draw();
  post('progress', { value: 0.95, label: '正在准备播放器…' });
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>('button')) {
    input.disabled = false;
  }
  buildTimeline();
  status('已就绪');
  syncTransport();
  post('ready');
}

void initialize().catch((error: unknown) => {
  if (disposed) return;
  session?.dispose();
  session = null;
  status('无法播放这张谱面，请返回重试');
  post('error', {
    message: '无法播放这张谱面，请返回重试',
    diagnostic: error instanceof Error ? error.stack : undefined,
  });
});
