import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyChartPreviewConfigToHtml,
  buildChartPreviewConfigJson,
  buildChartPreviewInjectedJavaScript,
  chartPreviewExitFullscreenScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
} from '@/features/maimai-chart-preview/chart-preview-inject';
import { chartPreviewCanvasSize } from '@/features/maimai-chart-preview/webview-player/fullscreenLayout';
import { toggleFullscreenLockUiState } from '@/features/maimai-chart-preview/webview-player/fullscreenLock';
import { chartPreviewNativeScreenOptions } from '@/features/maimai-chart-preview/chart-preview-native-screen';

describe('chart preview webview helpers', () => {
  it('injects chart preview config before content loads', () => {
    const script = buildChartPreviewInjectedJavaScript({
      chartId: 10834,
      difficulty: 5,
      title: '测试曲 DX MASTER',
    });
    expect(script).toContain('window.__CHART_PREVIEW__=');
    expect(script).toContain('"chartId":10834');
    expect(script).toContain('"difficulty":5');
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

  it('builds a stop script for leaving the page', () => {
    expect(chartPreviewStopScript()).toContain("type:'stop'");
  });

  it('builds a fullscreen-exit script for native back handling', () => {
    expect(chartPreviewExitFullscreenScript()).toContain("type:'exit-fullscreen'");
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

  it('keeps the fullscreen lock visible inside the iOS safe area', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    expect(html).toContain('right: calc(10px + env(safe-area-inset-right));');
    expect(html).toContain('body.fullscreen #fs-lock { display: flex; }');
  });

  it('hides the fullscreen lock together with the overlay', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    expect(html).toContain('#fs-lock.hidden { opacity: 0; pointer-events: none; }');
    expect(html).toContain('transition: opacity 0.2s;');
  });

  it('stages a second canvas for dual buddy previews hidden in single mode', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    expect(html).toContain('id="chart-canvas-2"');
    expect(html).toContain('id="canvas-stage-2"');
    expect(html).toContain('body.dual #canvas-wrap');
    expect(html).toContain('#canvas-stage-2 {\n      display: none;');
    expect(html).toContain('class="side-chip">2P');
  });

  it('adapts the player chrome to light mode while keeping the canvas dark', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    expect(html).toContain('html[data-theme="light"] {');
    expect(html).toContain('--bg: #F7F8FA');
    expect(html).toContain('--panel: #FFFFFF');
    expect(html).toContain('--playhead: #111827');
    expect(html).toContain('--wheel-bg: #FFFFFF');
    expect(html).toContain('#canvas-wrap {\n      flex-shrink: 0;\n      display: grid;\n      place-items: center;\n      background: #000;');
    const configIndex = html.indexOf('<!--CHART_PREVIEW_CONFIG-->');
    const themeScriptIndex = html.indexOf("c.theme==='light'");
    const playerScriptIndex = html.indexOf('<!--PLAYER_SCRIPT-->');
    expect(themeScriptIndex).toBeGreaterThan(configIndex);
    expect(themeScriptIndex).toBeLessThan(playerScriptIndex);
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
