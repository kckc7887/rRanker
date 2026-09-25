import type { OsuChartPreviewConfig, OsuChartPreviewSettings } from '../configuration';
import { normalizeOsuChartPreviewSettings } from '../configuration';
import { toggleFullscreenLockUiState } from '../../chart-preview-shared/webview-player/fullscreenLock';
import { applyChartPreviewHostCommand } from '../../chart-preview-shared/chart-preview-bridge';
import { closeActiveWheelPopup, setupWheelPopup } from '../../chart-preview-shared/webview-player/wheel';
import { md5 } from './engine';
import { parseOsuBytes } from './autoplay';
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
const warnings = new Set<string>();
const wheels: ReturnType<typeof setupWheelPopup>[] = [];
let speedWheel: ReturnType<typeof setupWheelPopup> | undefined;
let settings = normalizeOsuChartPreviewSettings({});
let handle: PlaybackHandle | null = null;
let disposed = false;
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
function status(message: string): void { element('status').textContent = message; }
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
  element('timeline-playhead').style.left = `${pct}%`;
  element('timeline-badge').style.left = `${pct}%`;
  element('timeline-badge').textContent = formatClock(position);
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
  const bars = element('timeline-bars');
  const ruler = element('timeline-ruler');
  bars.replaceChildren();
  ruler.replaceChildren();
  if (!handle) return;
  const duration = handle.durationMs;
  const width = Math.max(1, Math.ceil(timeline.getBoundingClientRect().width));
  const count = Math.min(200, width);
  const buckets = Array.from({ length: count }, () => [0, 0, 0, 0]);
  const beatmap = handle.session.beatmap;
  for (const note of [...beatmap.hitObjects, ...beatmap.maniaHolds]) {
    const time = note.time - handle.session.range.startMs;
    const index = Math.min(count - 1, Math.max(0, Math.floor(time / duration * count)));
    const kind = note.type === 'slider' ? 1 : note.type === 'hold' ? 2 : note.type === 'spinner' ? 3 : 0;
    buckets[index][kind]++;
  }
  const max = Math.max(1, ...buckets.map(bucket => bucket.reduce((sum, n) => sum + n, 0)));
  const colors = ['#5b8cff', '#00CED1', '#FF8C00', '#ff69b4'];
  buckets.forEach((bucket, index) => {
    const total = bucket.reduce((sum, n) => sum + n, 0);
    if (!total) return;
    const bar = document.createElement('div');
    bar.className = 'timeline-bar';
    Object.assign(bar.style, { left: `${index / count * 100}%`, width: `${100 / count}%`, height: `${Math.max(2, total / max * 22)}px` });
    bucket.forEach((value, kind) => {
      if (!value) return;
      const segment = document.createElement('div');
      Object.assign(segment.style, { flex: String(value / total), width: '100%', backgroundColor: colors[kind] });
      bar.appendChild(segment);
    });
    bars.appendChild(bar);
  });
  const seconds = duration / 1000;
  const tickStep = [1, 5, 10, 15, 30, 60, 120, 300].find(step => width * step / seconds >= 4) ?? 300;
  const labelStep = [5, 10, 15, 30, 60, 120, 300, 600].find(step => width * step / seconds >= 24) ?? 600;
  for (let time = 0; time <= seconds; time += tickStep) {
    const pct = `${time / seconds * 100}%`;
    const major = time % labelStep === 0;
    const tick = document.createElement('div');
    tick.className = `timeline-tick ${major ? 'major' : Number.isInteger(time / (labelStep / 2)) ? 'medium' : 'minor'}`;
    tick.style.left = pct;
    ruler.appendChild(tick);
    if (major) {
      const label = document.createElement('div');
      label.className = 'timeline-label';
      label.style.left = pct;
      label.textContent = formatClock(time * 1000);
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
    button.addEventListener('click', () => {
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
/** 暂停（手动按钮或宿主生命周期）：只停播与收起浮层，不改变全屏状态。 */
function pauseForLifecycle(): void {
  dragging = false;
  closeActiveWheelPopup();
  if (handle) { pausePlayback(handle.session); status('已暂停'); syncTransport(); }
}
function dispose(): void {
  if (disposed) return;
  if (fullscreen) setFullscreen(false);
  disposed = true;
  destroyPlayback();
  handle = null;
  timelineObserver.disconnect();
  for (const wheel of wheels) wheel.dispose();
  cancelAnimationFrame(uiFrame);
  window.clearTimeout(controlsTimer);
  delete window.__OSU_PREVIEW_AUDIO__;
  delete window.__OSU_CHART_PREVIEW_CONFIG__;
  void disposeBuiltinSkins();
}
playButton.addEventListener('click', togglePlay);
element('btn-restart').addEventListener('click', () => { void runTransport(session => playFrom(session, 0)); });
for (const [id, delta] of [['btn-step-back', -5000], ['btn-step-forward', 5000]] as const) {
  element(id).addEventListener('click', () => void runTransport(session => seekPlayback(session, presentationTime(session) + delta, session.playing)));
}
fullscreenButton.addEventListener('click', () => setFullscreen(!fullscreen));
lockButton.addEventListener('click', event => {
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
element('app').addEventListener('scroll', closeActiveWheelPopup, { passive: true });
function seekFromPointer(event: PointerEvent): void {
  const rect = timeline.getBoundingClientRect();
  const percent = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  void runTransport(session => seekPlayback(session, percent * session.range.durationMs, false));
}
timeline.addEventListener('pointerdown', event => {
  if (!handle || locked) return;
  event.preventDefault();
  event.stopPropagation();
  dragging = true;
  wasPlayingBeforeDrag = handle.session.playing;
  pausePlayback(handle.session);
  seekFromPointer(event);
});
document.addEventListener('pointermove', event => { if (dragging) seekFromPointer(event); });
document.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  if (wasPlayingBeforeDrag) void runTransport(session => playFrom(session, presentationTime(session)));
  else showControls();
});
document.addEventListener('pointercancel', () => { dragging = false; syncTransport(); showControls(); });
window.addEventListener('resize', () => { closeActiveWheelPopup(); buildTimeline(); });
window.addEventListener('keydown', event => {
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
  // 生命周期合同由公共层派生：暂停停播保全屏，退出全屏与释放是显式命令。
  applyChartPreviewHostCommand(event.data, {
    pause: pauseForLifecycle,
    exitFullscreen: () => setFullscreen(false),
    dispose,
  });
}
window.addEventListener('message', receiveMessage);
document.addEventListener('message', event => receiveMessage(event as MessageEvent));
window.addEventListener('pagehide', dispose);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForLifecycle(); });

async function initialize(): Promise<void> {
  const config = window.__OSU_CHART_PREVIEW_CONFIG__;
  if (!config) throw new Error('missing-config');
  document.documentElement.dataset.theme = config.theme;
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
  const beatmap = parseOsuBytes(bytes);
  const mode = beatmap.mode;
  if (mode !== 0 && mode !== 1 && mode !== 2 && mode !== 3) throw new Error('unsupported-mode');
  const labels = ['osu!standard', 'osu!taiko', 'osu!catch', 'osu!mania'];
  element('title').textContent = `${config.title || beatmap.title || 'osu!'} [${beatmap.version}]`;
  if (mode !== config.requestedMode) {
    element('mode-notice').textContent = `当前条目为转谱，正在按原生 ${labels[mode]} 模式播放。`;
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-mode]')) {
    node.hidden = Number(node.dataset.mode) !== mode;
  }
  setupSettings(mode);
  post('progress', { value: 0.2, label: '正在准备音画…' });
  const loaded = await startPlayback(canvas, resources, {
    path: config.chartPath, bytes, hash: md5(bytes), mode,
  }, warn, { settings, maniaSkin: settings.maniaSkin, maniaScrollSpeed: settings.maniaScrollSpeed });
  resources.clear();
  delete window.__OSU_CHART_PREVIEW_CONFIG__;
  if (disposed) { loaded.session.destroy(); return; }
  handle = loaded;
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
