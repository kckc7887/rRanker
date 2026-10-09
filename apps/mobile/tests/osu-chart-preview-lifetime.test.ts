import { PlaybackLoop } from '@/features/chart-preview-shared/webview-player/playback-loop';
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { normalizeOsuChartPreviewSettings } from '@/features/osu-chart-preview/configuration';

const playback = vi.hoisted(() => ({
  start: vi.fn(), destroy: vi.fn(), play: vi.fn(), pause: vi.fn(), seek: vi.fn(),
  disposeSkins: vi.fn(), sessionDestroy: vi.fn(), setSettings: vi.fn(),
}));
vi.mock('@/features/osu-chart-preview/webview-player/engine', () => ({ md5: () => 'hash' }));
vi.mock('@/features/osu-chart-preview/webview-player/builtin-skin', () => ({ disposeBuiltinSkins: playback.disposeSkins }));
vi.mock('@/features/osu-chart-preview/webview-player/playback', () => ({
  startPlayback: playback.start, destroyPlayback: playback.destroy, playFrom: playback.play,
  pausePlayback: playback.pause, seekPlayback: playback.seek, presentationTime: () => 0,
  applyManiaScrollSpeed: vi.fn(),
}));

const resizeCallbacks: ResizeObserverCallback[] = [];
const disconnect = vi.fn();
const post = vi.fn();
function message(type: string): void { window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type }) })); }

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); resizeCallbacks.length = 0;
  const html = readFileSync(resolve(process.cwd(), 'src/features/osu-chart-preview/webview-player/index.html'), 'utf8');
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeCallbacks.push(callback); }
    observe() {} disconnect = disconnect;
  });
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('TextEncoder', class { encode(value: string) { return new Uint8Array(new NodeTextEncoder().encode(value)); } });
  HTMLElement.prototype.scrollTo = vi.fn();
  window.ReactNativeWebView = { postMessage: post };
  window.__OSU_CHART_PREVIEW_CONFIG__ = {
    title: '', theme: 'dark', requestedMode: 0, chartPath: 'map.osu', settings: normalizeOsuChartPreviewSettings({}),
    files: [{ path: 'map.osu', text: 'chart', mime: 'text/plain' }],
  };
  playback.start.mockResolvedValue({
    session: {
      beatmap: { mode: 3, title: 'Session title', version: 'Native mania', hitObjects: [], maniaHolds: [] },
      loop: new PlaybackLoop(), currentTimeMs: 0, playing: false, ended: false, range: { startMs: 0, durationMs: 1000 },
      destroy: playback.sessionDestroy, setSettings: playback.setSettings, setSkin: vi.fn(async () => {}),
    },
    durationMs: 1000, media: { capabilities: { storyboard: false, video: false } },
  });
  playback.setSettings.mockResolvedValue(undefined);
  playback.disposeSkins.mockResolvedValue(undefined);
});
afterEach(() => {
  message('dispose'); document.body.replaceChildren();
  delete window.ReactNativeWebView; delete window.__OSU_CHART_PREVIEW_CONFIG__;
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('osu! 播放器入口生命周期', () => {
  it('标题和原生模式来自准备会话，dispose后交互、观察器和计时器均无副作用', async () => {
    await import('@/features/osu-chart-preview/webview-player/main');
    expect(document.getElementById('status')!.textContent, JSON.stringify(post.mock.calls)).not.toContain('无法');
    expect(document.getElementById('title')!.textContent).toBe('Session title');
    expect(document.getElementById('mode-notice')!.textContent).toContain('osu!mania');
    document.getElementById('btn-fullscreen')!.click();
    message('dispose');
    expect(disconnect).toHaveBeenCalled();
    expect(playback.destroy).toHaveBeenCalled();
    post.mockClear();
    document.getElementById('btn-fullscreen')!.click();
    document.getElementById('play-button')!.click();
    document.getElementById('storyboard-enabled')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F4' }));
    resizeCallbacks.forEach(callback => callback([], {} as ResizeObserver));
    message('pause'); message('dispose');
    await vi.runAllTimersAsync();
    expect(document.body.classList.contains('fullscreen')).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(playback.play).not.toHaveBeenCalled();
    expect(playback.setSettings).not.toHaveBeenCalled();
    expect(playback.destroy).toHaveBeenCalled();
  });

  it('准备结束前释放时只销毁迟到会话，不创建控件或发送ready', async () => {
    let resolvePlayback!: (value: unknown) => void;
    playback.start.mockImplementation(() => new Promise(resolve => { resolvePlayback = resolve; }));
    await import('@/features/osu-chart-preview/webview-player/main');
    message('dispose');
    resolvePlayback({ session: { destroy: playback.sessionDestroy } });
    await Promise.resolve();
    expect(playback.sessionDestroy).toHaveBeenCalled();
    expect((document.getElementById('play-button') as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById('btn-fullscreen') as HTMLButtonElement).disabled).toBe(true);
    expect(post.mock.calls.map(([value]) => JSON.parse(value).type)).not.toContain('ready');
  });
});
