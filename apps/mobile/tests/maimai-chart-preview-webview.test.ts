import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyChartPreviewConfigToHtml,
  buildChartPreviewInjectedJavaScript,
} from '@/features/simai-chart-preview/chart-preview-inject';
import { chartPreviewCanvasSize } from '@/features/simai-chart-preview/webview-player/fullscreenLayout';
import { toggleFullscreenLockUiState } from '@/features/chart-preview-shared/webview-player/fullscreenLock';
import { chartPreviewNativeScreenOptions } from '@/features/chart-preview-shared/chart-preview-native-screen-options';
import {
  createLatestFrameScheduler,
  resolveInitialBackgroundState,
} from '@/features/simai-chart-preview/webview-player/interactionScheduler';
import { parseChartPreviewBridgeMessage } from '@/features/chart-preview-shared/chart-preview-bridge';

afterEach(() => vi.unstubAllGlobals());

describe('chart preview webview helpers', () => {

  it('injects chart settings and merges subsequent native updates', () => {
    const window = { __CHART_PREVIEW__: { answerSoundUrl: 'data:audio/wav;base64,UklGRg==' } };
    new Function('window', buildChartPreviewInjectedJavaScript({ chartId: 10834, difficulty: 5, buddySide: 'dual', settings: { backgroundMode: 'video' }, theme: 'light' }))(window);
    expect(window.__CHART_PREVIEW__).toMatchObject({ chartId: 10834, difficulty: 5, buddySide: 'dual', theme: 'light', answerSoundUrl: 'data:audio/wav;base64,UklGRg==', settings: { backgroundMode: 'video' } });
  });
  it('writes escaped configuration into the current HTML template', () => {
    const title = '</script><script>throw 1</script>$$';
    const html = applyChartPreviewConfigToHtml('<html><!--CHART_PREVIEW_CONFIG--></html>', { chartId: 834, difficulty: 4, title });
    const script = /<script>(.*?)<\/script>/s.exec(html)![1];
    const window = { __CHART_PREVIEW__: {} };
    new Function('window', script)(window);
    expect(window.__CHART_PREVIEW__).toMatchObject({ chartId: 834, difficulty: 4, title, theme: 'dark' });
  });

  it('parses native bridge messages and rejects non-object payloads', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"fullscreen","active":true}')).toEqual({
      type: 'fullscreen',
      active: true,
    });
    expect(parseChartPreviewBridgeMessage('"fullscreen"')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{')).toBeNull();
  });

  it('caps the canvas to the short viewport edge in and after fullscreen', () => {
    expect(chartPreviewCanvasSize({
      isFullscreen: true,
      containerWidth: 844,
      viewportWidth: 844,
      viewportHeight: 390,
    })).toBe(390);
    expect(chartPreviewCanvasSize({
      isFullscreen: false,
      containerWidth: 844,
      viewportWidth: 844,
      viewportHeight: 390,
    })).toBe(390);
    expect(chartPreviewCanvasSize({
      isFullscreen: false,
      containerWidth: 390,
      viewportWidth: 390,
      viewportHeight: 844,
    })).toBe(390);
  });

  it('sizes dual canvases side by side within the available width', () => {
    expect(chartPreviewCanvasSize({
      isFullscreen: false,
      containerWidth: 390,
      viewportWidth: 390,
      viewportHeight: 844,
      chartCount: 2,
    })).toBe(191);
    expect(chartPreviewCanvasSize({
      isFullscreen: true,
      containerWidth: 844,
      viewportWidth: 844,
      viewportHeight: 390,
      chartCount: 2,
    })).toBe(390);
  });

  it('allows both landscape directions and avoids the iOS native status-bar path', () => {
    expect(chartPreviewNativeScreenOptions(true, 'ios')).toEqual({
      title: '谱面确认',
      headerShown: false,
      orientation: 'landscape',
      autoHideHomeIndicator: true,
    });
    expect(chartPreviewNativeScreenOptions(true, 'android')).toEqual({
      title: '谱面确认',
      headerShown: false,
      orientation: 'landscape',
      statusBarHidden: true,
      navigationBarHidden: true,
    });
  });

  it('keeps the default title but accepts a custom one from other preview screens', () => {
    expect(chartPreviewNativeScreenOptions(true, 'ios', '自定义标题')).toEqual({
      title: '自定义标题',
      headerShown: false,
      orientation: 'landscape',
      autoHideHomeIndicator: true,
    });
    expect(chartPreviewNativeScreenOptions(false, 'android')).toMatchObject({ title: '谱面确认' });
  });

  it('restores the selected background and video confirmation', () => {
    expect(resolveInitialBackgroundState({})).toEqual({ mode: 'image', prompted: false });
    expect(resolveInitialBackgroundState({ backgroundMode: 'none' })).toEqual({ mode: 'none', prompted: false });
    expect(resolveInitialBackgroundState({ backgroundMode: 'video', videoBackgroundPrompted: true }))
      .toEqual({ mode: 'video', prompted: true });
  });

  it('coalesces interaction work and flushes or cancels the latest value', () => {
    let nextHandle = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const values: number[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => callbacks.delete(handle));
    const advanceFrame = () => {
      const queued = [...callbacks.values()];
      callbacks.clear();
      for (const callback of queued) callback(0);
    };
    const scheduler = createLatestFrameScheduler<number>((value) => values.push(value));

    scheduler.schedule(1);
    scheduler.schedule(2);
    expect(values).toEqual([]);
    advanceFrame();
    expect(values).toEqual([2]);

    scheduler.schedule(3);
    scheduler.flush();
    advanceFrame();
    expect(values).toEqual([2, 3]);

    scheduler.schedule(4);
    scheduler.cancel();
    advanceFrame();
    expect(values).toEqual([2, 3]);
  });

  it('hides controls while locked and restores them when unlocked', () => {
    expect(toggleFullscreenLockUiState(false)).toEqual({
      locked: true,
      overlayHidden: true,
      actionLabel: '解锁',
    });
    expect(toggleFullscreenLockUiState(true)).toEqual({
      locked: false,
      overlayHidden: false,
      actionLabel: '锁定',
    });
  });
});
