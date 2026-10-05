import { renderPreviewHeading } from '../../chart-preview-shared/webview-player/heading';
import { bindFullscreenControls } from '../../chart-preview-shared/webview-player/fullscreen-controls';
import { bindPlaybackLoop } from '../../chart-preview-shared/webview-player/playback-loop';
import { PlayerEventScope } from '../../chart-preview-shared/webview-player/event-scope';
import { installPreviewControls, setPreviewFullscreen } from '../../chart-preview-shared/webview-player/controls';
import { HeatTimelineView, heatTimeLabels } from '../../chart-preview-shared/webview-player/heat-timeline';
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
import { applyChartPreviewHostCommand } from '../../chart-preview-shared/chart-preview-bridge';
import { closeActiveWheelPopup, setupWheelPopup } from '../../chart-preview-shared/webview-player/wheel';
import { prepareOfficialChart } from './chart-prepare';
import { PreviewSession, decodeAudio } from './playback';
import { RizlineRenderer } from './renderer';

declare global {
  interface Window {
    __RIZLINE_CHART_PREVIEW_CONFIG__?: RizlineChartPreviewConfig;
    __RIZLINE_CHART_PREVIEW_CHART__?: unknown;
    __RIZLINE_CHART_PREVIEW_MUSIC__?: string | null;
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
const timelineView = new HeatTimelineView({
  host: timeline, bars: element('timeline-bars'), ruler: element('timeline-ruler'),
  playhead: element('timeline-playhead'), badge: element('timeline-badge'),
});
const wheels: ReturnType<typeof setupWheelPopup>[] = [];
let userSpeedWheel: ReturnType<typeof setupWheelPopup> | undefined;
let settings = normalizeRizlineChartPreviewSettings({});
let session: PreviewSession | null = null;
let renderer: RizlineRenderer | null = null;
let disposed = false;
const events = new PlayerEventScope(() => disposed);
let dragging = false;
let wasPlayingBeforeDrag = false;
let fullscreen = false;
let locked = false;
let controlsVisible = true;
let uiFrame = 0;
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
  timelineView.updateProgress(pct, formatClock(position));
  if (session.ended) status('播放结束');
}
function tick(time: number): void {
  uiFrame = 0;
  if (disposed) return;
  if (time - lastUiFrame >= 100 || !session?.playing) { syncTransport(); lastUiFrame = time; }
  if (session?.playing) uiFrame = requestAnimationFrame(tick);
}
function buildTimeline(): void {
  if (disposed || !session) return;
  const chart = session.chart;
  timelineView.build(session.duration, [{
    times: chart.lines.flatMap(line => line.notes.map(note => note.seconds + chart.delaySeconds)),
  }], heatTimeLabels(session.duration, formatClock));
  syncTransport();
}
const timelineObserver = new ResizeObserver(buildTimeline);
timelineObserver.observe(timeline);

function syncControlsVisibility(): void {
  controls.classList.toggle('hidden', !controlsVisible || locked);
  lockButton.classList.toggle('hidden', !controlsVisible);
}
const fullscreenControls = bindFullscreenControls(events, {
  active: () => fullscreen,
  render: visible => { controlsVisible = visible; syncControlsVisibility(); },
});
function showControls(): void { fullscreenControls.show(); }
function hideControls(): void { fullscreenControls.hide(); }
function setFullscreen(active: boolean): void {
  if (disposed) return;
  closeActiveWheelPopup();
  fullscreen = active;
  setPreviewFullscreen(active);
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
function persistSettings(): void { post('settings', { settings: { ...settings } }); }
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
  events.listen(hitSound, 'click', () => {
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
  if (disposed) return;
  dragging = false;
  closeActiveWheelPopup();
  if (session) { session.pause(); status('已暂停'); syncTransport(); }
}
function dispose(): void {
  if (disposed) return;
  closeActiveWheelPopup();
  if (fullscreen) setFullscreen(false);
  disposed = true;
  events.dispose();
  session?.dispose();
  session = null;
  timelineObserver.disconnect();
  for (const wheel of wheels) wheel.dispose();
  cancelAnimationFrame(uiFrame);
  delete window.__RIZLINE_CHART_PREVIEW_CONFIG__;
}

events.listen(playButton, 'click', togglePlay);
events.listen(element('btn-restart'), 'click', () => { void runTransport((current) => current.playFrom(0)); });
for (const [id, delta] of [['btn-step-back', -STEP_SECONDS], ['btn-step-forward', STEP_SECONDS]] as const) {
  events.listen(element(id), 'click', () => void runTransport((current) => current.seek(current.currentTime + delta)));
}
events.listen(fullscreenButton, 'click', () => setFullscreen(!fullscreen));
events.listen(lockButton, 'click', (event) => {
  event.stopPropagation();
  const next = toggleFullscreenLockUiState(locked);
  locked = next.locked;
  lockButton.classList.toggle('locked', locked);
  lockButton.setAttribute('aria-label', next.actionLabel);
  lockButton.setAttribute('aria-pressed', String(locked));
  if (next.overlayHidden) hideControls(); else showControls();
});

function seekFromPointer(event: PointerEvent): void {
  if (!session) return;
  const rect = timeline.getBoundingClientRect();
  const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  void runTransport((current) => current.seek(percent * current.duration));
}
events.listen(timeline, 'pointerdown', (event) => {
  if (!session || locked) return;
  event.preventDefault();
  event.stopPropagation();
  dragging = true;
  wasPlayingBeforeDrag = session.playing;
  session.pause();
  seekFromPointer(event);
});
events.listen(document, 'pointermove', (event) => { if (dragging) seekFromPointer(event); });
events.listen(document, 'pointerup', () => {
  if (!dragging) return;
  dragging = false;
  if (wasPlayingBeforeDrag) void runTransport((current) => current.playFrom(current.currentTime));
  else showControls();
});
events.listen(document, 'pointercancel', () => { dragging = false; syncTransport(); showControls(); });
events.listen(window, 'resize', () => {
  closeActiveWheelPopup();
  renderer?.resize();
  session?.draw();
  buildTimeline();
});
const stageObserver = new ResizeObserver(() => {
  if (disposed) return;
  renderer?.resize();
  session?.draw();
});
stageObserver.observe(stage);
events.own(() => stageObserver.disconnect());
events.listen(window, 'keydown', (event) => {
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

  applyChartPreviewHostCommand(event.data, {
    pause: pauseForLifecycle,
    exitFullscreen: () => setFullscreen(false),
    dispose,
  });
}
events.listen(window, 'message', receiveMessage);
events.listen(document, 'message', (event) => receiveMessage(event as MessageEvent));
events.listen(window, 'pagehide', dispose);
events.listen(document, 'visibilitychange', () => { if (document.hidden) pauseForLifecycle(); });

function decodeBase64Payload(value: string): ArrayBuffer {
  const separator = value.indexOf(',');
  const base64 = separator >= 0 ? value.slice(separator + 1) : value;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function initialize(): Promise<void> {
  const config = window.__RIZLINE_CHART_PREVIEW_CONFIG__;
  if (!config) throw new Error('missing-config');
  document.documentElement.dataset.theme = config.theme;
  events.own(installPreviewControls({ sections: ['播放设置', '辅助选项'], stageAspectRatio: 9 / 16 }));
  settings = normalizeRizlineChartPreviewSettings(config.settings);
  renderPreviewHeading(config.title || '谱面确认', config.previewDifficulty);
  setupSettings();
  post('progress', { value: 0.05, label: '正在准备播放器…' });
  const chartJson = window.__RIZLINE_CHART_PREVIEW_CHART__;
  const musicData = window.__RIZLINE_CHART_PREVIEW_MUSIC__;
  if (chartJson == null) throw new Error('missing-chart');
  if (typeof musicData !== 'string' || musicData.length === 0) throw new Error('missing-music');
  const musicBytes = decodeBase64Payload(musicData);
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
  const loopSession = session;
  const loopDuration = session.duration;
  bindPlaybackLoop(events, {
    loop: loopSession.loop, position: () => loopSession.currentTime,
    percent: position => loopDuration > 0 ? position / loopDuration * 100 : 0,
    format: position => position.toFixed(2) + 's',
    update: (a, b) => timelineView.updateLoop(a, b),
  });
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
    diagnostic: error instanceof Error ? error.stack ?? error.message : String(error),
  });
});
