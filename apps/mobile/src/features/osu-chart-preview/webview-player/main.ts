import type { OsuChartPreviewConfig, OsuChartPreviewSettings } from '../configuration';
import { normalizeOsuChartPreviewSettings } from '../configuration';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';
import { applyChartPreviewHostCommand } from '../../chart-preview-shared/chart-preview-bridge';
import { closeActiveWheelPopup, setupWheelPopup } from '../../chart-preview-shared/webview-player/wheel';
import { md5 } from './engine';
import { PlayerEventScope } from '../../chart-preview-shared/webview-player/event-scope';
import { installPreviewControls } from '../../chart-preview-shared/webview-player/controls';
import { HeatTimelineView, heatTimeLabels } from '../../chart-preview-shared/webview-player/heat-timeline';
import {
  applyManiaScrollSpeed, destroyPlayback, pausePlayback, playFrom, presentationTime,
  seekPlayback, startPlayback, type PlaybackHandle,
} from './playback';
import { disposeBuiltinSkins } from './builtin-skin';
import type { PreviewResource } from './osu-text';

declare global {
  interface Window {
    __OSU_CHART_PREVIEW_CONFIG__?: OsuChartPreviewConfig;
    __OSU_PREVIEW_AUDIO__?: Record<string, string>;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('playfield');
const playButton = element<HTMLButtonElement>('play-button');
const fullscreenButton = element<HTMLButtonElement>('btn-fullscreen');
const lockButton = element<HTMLButtonElement>('fs-lock');
const timeline = element('timeline-host');
const controls = element('controls');
const timelineView = new HeatTimelineView({
  host: timeline, bars: element('timeline-bars'), ruler: element('timeline-ruler'),
  playhead: element('timeline-playhead'), badge: element('timeline-badge'),
});
const warnings = new Set<string>();
const wheels: ReturnType<typeof setupWheelPopup>[] = [];
let speedWheel: ReturnType<typeof setupWheelPopup> | undefined;
let settings = normalizeOsuChartPreviewSettings({});
let handle: PlaybackHandle | null = null;
let disposed = false;
const events = new PlayerEventScope(() => disposed);
let dragging = false;
let wasPlayingBeforeDrag = false;
let fullscreen = false;
let locked = false;
let controlsVisible = true;
let uiFrame = 0;
let controlsTimer = 0;
let lastUiFrame = -Infinity;

function post(type: string, values: Record<string, unknown> = {}): void {
  if (!disposed) window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...values }));
}
function status(message: string): void { if (!disposed) element('status').textContent = message; }
function warn(message: string): void {
  if (disposed) return;
  warnings.add(message);
  element('media-notice').textContent = [...warnings].join('；');
}
function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
function syncTransport(): void {
  if (!handle || disposed) return;
  const playing = handle.session.playing;
  const position = presentationTime(handle.session);
  const pct = Math.min(100, Math.max(0, position / handle.durationMs * 100));
  element('play-icon').innerHTML = playing
    ? '<path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>' : '<path d="M8 5v14l11-7z"/>';
  playButton.setAttribute('aria-label', playing ? '暂停' : '播放');
  element('time-label').textContent = `${formatClock(position)} / ${formatClock(handle.durationMs)}`;
  timelineView.updateProgress(pct, formatClock(position));
  timeline.setAttribute('aria-valuenow', String(Math.round(position)));
  timeline.setAttribute('aria-valuetext', `${formatClock(position)} / ${formatClock(handle.durationMs)}`);
  if (handle.session.ended) status('播放结束');
}
function tick(time: number): void {
  uiFrame = 0;
  if (disposed) return;
  if (time - lastUiFrame >= 100 || !handle?.session.playing) { syncTransport(); lastUiFrame = time; }
  if (handle?.session.playing) uiFrame = requestAnimationFrame(tick);
}
function buildTimeline(): void {
  if (disposed || !handle) return;
  const beatmap = handle.session.beatmap;
  const start = handle.session.range.startMs;
  timelineView.build(handle.durationMs, [{
    times: [...beatmap.hitObjects, ...beatmap.maniaHolds].map(note => note.time - start),
  }], heatTimeLabels(handle.durationMs, formatClock));
  syncTransport();
}
const timelineObserver = new ResizeObserver(buildTimeline);
timelineObserver.observe(timeline);
events.own(() => timelineObserver.disconnect());
events.own(() => cancelAnimationFrame(uiFrame));
events.own(() => window.clearTimeout(controlsTimer));
events.own(destroyPlayback);

function syncControlsVisibility(): void {
  controls.classList.toggle('hidden', !controlsVisible || locked);
  lockButton.classList.toggle('hidden', !controlsVisible);
}
function showControls(): void {
  window.clearTimeout(controlsTimer);
  controlsVisible = true;
  syncControlsVisibility();
  if (fullscreen && !dragging) controlsTimer = window.setTimeout(() => {
    if (disposed) return;
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
  if (disposed) return;
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
  post('fullscreen', { active });
}
function persistSettings(): void { post('settings', { settings: { ...settings } }); }
function changeSettings(partial: Partial<OsuChartPreviewSettings>): void {
  const previousSkin = settings.maniaSkin;
  settings = normalizeOsuChartPreviewSettings({ ...settings, ...partial });
  const current = handle;
  if (!current || disposed) return;
  applyManiaScrollSpeed(current.session, settings.maniaScrollSpeed);
  void current.session.setSettings(settings).catch(() => {
    if (current === handle && !disposed) status('设置暂时无法应用，请重试');
  });
  if (settings.maniaSkin !== previousSkin) void current.session.setSkin(settings.maniaSkin).catch(() => {
    if (current === handle && !disposed) status('样式暂时无法切换，请重试');
  });
}
function setupSettings(mode: number): void {
  const field = (id: string, key: keyof OsuChartPreviewSettings, min: number, max: number, step: number,
    format: (value: number) => string, labels?: readonly string[]) => {
    const initial = key === 'maniaSkin' ? Number(settings.maniaSkin === 'circle') : settings[key] as number;
    const wheel = setupWheelPopup(element(`${id}-trigger`), element(`${id}-popup`), element(`${id}-wheel`),
      element(`${id}-list`), element(`${id}-val`), value => {
        changeSettings({ [key]: key === 'maniaSkin' ? value === 1 ? 'circle' : 'brick' : value });
      }, persistSettings, min, max, step, initial, labels, format);
    wheels.push(wheel);
    events.own(wheel.dispose);
    return wheel;
  };
  const percent = (value: number) => `${value}%`;
  field('brightness', 'backgroundBrightness', 0, 100, 1, percent);
  field('blur', 'backgroundBlur', 0, 20, 1, value => `${value} px`);
  if (mode === 3) {
    field('mania-skin', 'maniaSkin', 0, 1, 1, String, ['砖块', '圆圈']);
    speedWheel = field('scroll-speed', 'maniaScrollSpeed', 1, 40, .1, value => value.toFixed(1));
    field('hold-width', 'holdWidth', 10, 100, 1, percent);
    field('mania-track-opacity', 'maniaTrackOpacity', 0, 100, 1, percent);
  }
  if (mode === 1) field('taiko-track-opacity', 'taikoTrackOpacity', 0, 100, 1, percent);
  for (const [id, key] of [
    ['storyboard-enabled', 'storyboardEnabled'], ['video-enabled', 'videoEnabled'], ['mania-ignore-sv', 'maniaIgnoreSV'],
  ] as const) {
    const button = element<HTMLButtonElement>(id);
    button.setAttribute('aria-pressed', String(settings[key]));
    events.listen(button, 'click', () => {
      changeSettings({ [key]: !settings[key] });
      button.setAttribute('aria-pressed', String(settings[key]));
      persistSettings();
    });
  }
}
async function runTransport(action: (session: PlaybackHandle['session']) => void | Promise<void>): Promise<void> {
  const current = handle;
  if (!current || disposed) return;
  try {
    await action(current.session);
    if (current !== handle || disposed) return;
    status(current.session.ended ? '播放结束' : current.session.playing ? '正在播放' : '已暂停');
  } catch {
    if (current !== handle || disposed) return;
    pausePlayback(current.session);
    status('播放暂时中断，请重试');
  }
  syncTransport();
  cancelAnimationFrame(uiFrame);
  if (current.session.playing) uiFrame = requestAnimationFrame(tick);
  showControls();
}
function togglePlay(): void {
  void runTransport(session => session.playing ? pausePlayback(session) : playFrom(session, presentationTime(session)));
}
/** 宿主暂停只停播并收起浮层，保留全屏。 */
function pauseForLifecycle(): void {
  if (disposed) return;
  dragging = false;
  for (const wheel of wheels) wheel.flush();
  closeActiveWheelPopup();
  if (handle) { pausePlayback(handle.session); status('已暂停'); syncTransport(); }
}
function dispose(): void {
  if (disposed) return;
  for (const wheel of wheels) wheel.flush();
  closeActiveWheelPopup();
  if (fullscreen) setFullscreen(false);
  disposed = true;
  events.dispose();
  handle = null;
  delete window.__OSU_PREVIEW_AUDIO__;
  delete window.__OSU_CHART_PREVIEW_CONFIG__;
  void disposeBuiltinSkins().catch(() => undefined);
}
events.listen(playButton, 'click', togglePlay);
events.listen(element('btn-restart'), 'click', () => { void runTransport(session => playFrom(session, 0)); });
for (const [id, delta] of [['btn-step-back', -5000], ['btn-step-forward', 5000]] as const) {
  events.listen(element(id), 'click', () => void runTransport(session => seekPlayback(session, presentationTime(session) + delta, session.playing)));
}
events.listen(fullscreenButton, 'click', () => setFullscreen(!fullscreen));
events.listen(lockButton, 'click', event => {
  event.stopPropagation();
  const next = toggleFullscreenLockUiState(locked);
  locked = next.locked;
  lockButton.classList.toggle('locked', locked);
  lockButton.setAttribute('aria-label', next.actionLabel);
  lockButton.setAttribute('aria-pressed', String(locked));
  if (next.overlayHidden) hideControls(); else showControls();
});
events.listen(canvas, 'pointerdown', () => {
  if (!fullscreen) return;
  if (controlsVisible) hideControls(); else showControls();
});
events.listen(controls, 'pointerdown', () => window.clearTimeout(controlsTimer));
events.listen(element('app'), 'scroll', closeActiveWheelPopup, { passive: true });
function seekFromPointer(event: PointerEvent): void {
  const rect = timeline.getBoundingClientRect();
  const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  void runTransport(session => seekPlayback(session, percent * session.range.durationMs, false));
}
events.listen(timeline, 'pointerdown', event => {
  if (!handle || locked) return;
  event.preventDefault();
  event.stopPropagation();
  dragging = true;
  wasPlayingBeforeDrag = handle.session.playing;
  pausePlayback(handle.session);
  seekFromPointer(event);
});
events.listen(document, 'pointermove', event => { if (dragging) seekFromPointer(event); });
events.listen(document, 'pointerup', () => {
  if (!dragging) return;
  dragging = false;
  if (wasPlayingBeforeDrag) void runTransport(session => playFrom(session, presentationTime(session)));
  else showControls();
});
events.listen(document, 'pointercancel', () => { dragging = false; syncTransport(); showControls(); });
events.listen(window, 'resize', () => { closeActiveWheelPopup(); buildTimeline(); });
events.listen(window, 'keydown', event => {
  if (event.code === 'Escape' && fullscreen) { event.preventDefault(); setFullscreen(false); return; }
  if (locked) return;
  if ((event.code === 'F3' || event.code === 'F4') && handle?.session.beatmap.mode === 3) {
    event.preventDefault();
    changeSettings({ maniaScrollSpeed: settings.maniaScrollSpeed + (event.code === 'F4' ? 1 : -1) });
    speedWheel?.setValue(settings.maniaScrollSpeed);
    persistSettings();
    return;
  }
  if (event.target instanceof HTMLElement && (event.target.closest('[role="listbox"]') || /^(INPUT|BUTTON|TEXTAREA|SELECT)$/.test(event.target.tagName))) return;
  if (event.code === 'Space') { event.preventDefault(); togglePlay(); }
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight' || event.code === 'Home' || event.code === 'End') {
    event.preventDefault();
    void runTransport(session => seekPlayback(session, event.code === 'Home' ? 0 : event.code === 'End' ? session.range.durationMs
      : presentationTime(session) + (event.code === 'ArrowRight' ? 5000 : -5000), session.playing));
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
events.listen(document, 'message', event => receiveMessage(event as MessageEvent));
events.listen(window, 'pagehide', dispose);
events.listen(document, 'visibilitychange', () => { if (document.hidden) pauseForLifecycle(); });

async function initialize(): Promise<void> {
  const config = window.__OSU_CHART_PREVIEW_CONFIG__;
  if (!config) throw new Error('missing-config');
  document.documentElement.dataset.theme = config.theme;
  events.own(installPreviewControls({ sections: ['画面设置', '辅助选项'] }));
  settings = normalizeOsuChartPreviewSettings(config.settings);
  post('progress', { value: 0.05, label: '正在准备播放器…' });
  const resources = new Map<string, PreviewResource>();
  for (const file of config.files) {
    if (file.text !== undefined) resources.set(file.path, new TextEncoder().encode(file.text));
    else if (file.uri) resources.set(file.path, { uri: file.uri });
  }
  config.files = [];
  const audio = window.__OSU_PREVIEW_AUDIO__ ?? {};
  for (const path of Object.keys(audio)) {
    const raw = atob(audio[path]);
    delete audio[path];
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) bytes[index] = raw.charCodeAt(index);
    resources.set(path, bytes);
  }
  delete window.__OSU_PREVIEW_AUDIO__;
  const bytes = resources.get(config.chartPath);
  if (!(bytes instanceof Uint8Array)) throw new Error('missing-chart');
  post('progress', { value: 0.2, label: '正在准备音画…' });
  const loaded = await startPlayback(canvas, resources, {
    path: config.chartPath, bytes, hash: md5(bytes),
  }, warn, { settings, maniaSkin: settings.maniaSkin, maniaScrollSpeed: settings.maniaScrollSpeed });
  resources.clear();
  delete window.__OSU_CHART_PREVIEW_CONFIG__;
  if (disposed) { loaded.session.destroy(); return; }
  handle = loaded;
  const beatmap = loaded.session.beatmap;
  const mode = beatmap.mode;
  const labels = ['osu!standard', 'osu!taiko', 'osu!catch', 'osu!mania'];
  element('title').textContent = `${config.title || beatmap.title || 'osu!'} [${beatmap.version}]`;
  if (mode !== config.requestedMode) {
    element('mode-notice').textContent = `当前条目为转谱，正在按原生 ${labels[mode]} 模式播放。`;
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-mode]')) {
    node.hidden = Number(node.dataset.mode) !== mode;
  }
  setupSettings(mode);
  element('storyboard-enabled').hidden = !loaded.media.capabilities.storyboard;
  element('video-enabled').hidden = !loaded.media.capabilities.video;
  for (const input of document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) {
    input.disabled = false;
  }
  timeline.setAttribute('aria-disabled', 'false');
  timeline.setAttribute('aria-valuemax', String(loaded.durationMs));
  buildTimeline();
  status('已就绪');
  syncTransport();
  post('ready');
}

void initialize().catch((error: unknown) => {
  if (disposed) return;
  destroyPlayback();
  status('无法播放这张谱面，请返回重试');
  post('error', {
    message: '无法播放这张谱面，请返回重试',
    diagnostic: error instanceof Error ? error.stack : undefined,
  });
});
