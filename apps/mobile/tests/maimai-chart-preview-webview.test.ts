import { describe, expect, it } from 'vitest';
import {
  applyChartPreviewConfigToHtml,
  buildChartPreviewConfigJson,
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

describe('chart preview webview helpers', () => {

  it('injects chart preview config before content loads', () => {
    const script = buildChartPreviewInjectedJavaScript({
      chartId: 10834,
      difficulty: 5,
      title: '测试曲 DX MASTER',
      backgroundImageUrl: 'https://assets2.lxns.net/maimai/jacket/834.png',
      backgroundVideoUrl: 'https://maimai-video.lxns.net/834.mp4',
      settings: { backgroundMode: 'video', videoBackgroundPrompted: true },
    });
    expect(script).toContain('window.__CHART_PREVIEW__=');
    expect(script).toContain('"chartId":10834');
    expect(script).toContain('"difficulty":5');
    expect(script).toContain('"backgroundMode":"video"');
    expect(script).toContain('"videoBackgroundPrompted":true');
    expect(script).toContain('"backgroundImageUrl":"https://assets2.lxns.net/maimai/jacket/834.png"');
    expect(script).toContain('"backgroundVideoUrl":"https://maimai-video.lxns.net/834.mp4"');
    expect(script).toContain('true;');
  });

  it('injects the inlined answer sound and preserves it during fallback injection', () => {
    const audioUrl = 'data:audio/wav;base64,UklGRg==';
    const html = applyChartPreviewConfigToHtml('<!--CHART_PREVIEW_CONFIG-->', {
      chartId: 834,
      difficulty: 4,
      answerSoundUrl: audioUrl,
    });
    expect(html).toContain(`"answerSoundUrl":"${audioUrl}"`);
    expect(buildChartPreviewInjectedJavaScript({ chartId: 834, difficulty: 4 }))
      .toContain('...(window.__CHART_PREVIEW__||{})');
  });

  it('serializes the buddy side for dual-screen previews', () => {
    const script = buildChartPreviewInjectedJavaScript({
      chartId: 111325,
      difficulty: 4,
      title: 'テスト',
      buddySide: 'dual',
    });
    expect(script).toContain('"buddySide":"dual"');
    expect(buildChartPreviewConfigJson({
      chartId: 111325,
      difficulty: 4,
      buddySide: '1',
    })).toContain('"buddySide":"1"');
  });

  it('serializes the player theme with dark as the default', () => {
    expect(buildChartPreviewConfigJson({ chartId: 10834, difficulty: 5 }))
      .toContain('"theme":"dark"');
    expect(buildChartPreviewConfigJson({ chartId: 10834, difficulty: 5, theme: 'light' }))
      .toContain('"theme":"light"');
  });

  it('writes config into html template marker for file:// loading', () => {
    const html = applyChartPreviewConfigToHtml(
      '<html><!--CHART_PREVIEW_CONFIG--><script src="./player.js"></script></html>',
      { chartId: 834, difficulty: 4, title: 'SD' },
    );
    expect(html).toContain('window.__CHART_PREVIEW__=');
    expect(html).toContain('"chartId":834');
    expect(html).not.toContain('<!--CHART_PREVIEW_CONFIG-->');
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

  it('coalesces repeated interaction work into the latest animation frame', () => {
    let nextHandle = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const values: number[] = [];
    const scheduler = createLatestFrameScheduler<number>(
      (callback) => {
        const handle = nextHandle++;
        callbacks.set(handle, callback);
        return handle;
      },
      (handle) => callbacks.delete(handle),
      (value) => values.push(value),
    );

    scheduler.schedule(1);
    scheduler.schedule(2);
    expect(callbacks.size).toBe(1);
    callbacks.values().next().value?.(0);
    expect(values).toEqual([2]);

    scheduler.schedule(3);
    scheduler.flush();
    expect(values).toEqual([2, 3]);
    expect(scheduler.pending()).toBe(false);
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
