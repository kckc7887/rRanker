import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import {
  applyChartPreviewConfigToHtml,
  buildChartPreviewConfigJson,
  buildChartPreviewInjectedJavaScript,
  chartPreviewExitFullscreenScript,
  chartPreviewStopScript,
  parseChartPreviewBridgeMessage,
} from '@/features/maimai-chart-preview/chart-preview-inject';
import { chartPreviewCanvasSize } from '@/features/maimai-chart-preview/webview-player/fullscreenLayout';
import { toggleFullscreenLockUiState } from '@/features/chart-preview-shared/webview-player/fullscreenLock';
import { chartPreviewNativeScreenOptions } from '@/features/maimai-chart-preview/chart-preview-native-screen';
import {
  createLatestFrameScheduler,
  resolveInitialBackgroundState,
} from '@/features/maimai-chart-preview/webview-player/interactionScheduler';
import { chartPreviewPlayerMessageScript } from '@/features/chart-preview-shared/chart-preview-bridge';

describe('chart preview webview helpers', () => {
  it('resolves player identifiers that the app typecheck excludes', () => {
    const entry = resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/main.ts');
    const program = ts.createProgram([entry], {
      noEmit: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      lib: ['lib.es2020.d.ts', 'lib.dom.d.ts'],
      types: [],
    });
    // 此入口不在应用类型检查中；2304/2552 分别覆盖普通和带建议的未定义名称。
    const unresolved = ts.getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.code === 2304 || diagnostic.code === 2552)
      .map((diagnostic) => `${diagnostic.file?.fileName}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    expect(unresolved).toEqual([]);
  }, 20_000);

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
    expect(html).toContain('transition: opacity 220ms ease;');
  });

  it('slides the fullscreen overlay out from the bottom like the phigros player', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    // 统一横屏表现：控制器底部滑出 220ms（与 Phigros/Phira 一致）。
    expect(html).toContain('transition: translate 220ms ease, opacity 220ms ease;');
    expect(html).toContain('#fs-overlay.hidden { translate: 0 100%; opacity: 0; pointer-events: none; }');
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

  it('loads skin-data.js before player.js in the packaged file:// html', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'assets/maimai-chart-preview/index.html'),
      'utf8',
    );
    const skinDataIndex = html.indexOf('src="./skin-data.js"');
    const playerIndex = html.indexOf('src="./player.js"');
    expect(skinDataIndex).toBeGreaterThan(0);
    expect(playerIndex).toBeGreaterThan(skinDataIndex);
  });

  it('scrolls overflowing portrait controls but keeps fullscreen fixed', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    expect(html).toContain('overflow-y: auto;');
    expect(html).toContain('overscroll-behavior-y: contain;');
    expect(html).toContain('body.fullscreen #app {');
    expect(html).toContain('justify-content: center;\n      overflow: hidden;');
  });

  it('offers three judge hint modes next to 款式 and keeps hit effects independent', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    const player = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/main.ts'),
      'utf8',
    );
    const inject = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/chart-preview-inject.ts'),
      'utf8',
    );
    expect(html).toContain('判定提示');
    expect(html).toContain('id="judge-hint-wheel"');
    expect(html).toContain('id="judge-hint-val">区分');
    expect(player).toContain("const JUDGE_HINT_LABELS = ['区分', '不区分', '不显示']");
    expect(player).toContain("['distinguish', 'unified', 'hidden']");
    expect(player).toContain('parseJudgeHint(saved.judgeHint)');
    expect(player).toContain('r.setJudgeHint(parseJudgeHint(saved.judgeHint))');
    expect(player).toContain('r.setShowHitEffect(saved.showHitEffect ?? true)');
    expect(inject).toContain("from './configuration'");
    expect(readFileSync(resolve(process.cwd(), 'src/features/maimai-chart-preview/configuration.ts'), 'utf8')).toContain("judgeHint?: 'distinguish' | 'unified' | 'hidden'");
  });

  it('offers the three persisted background choices and stages image/video media', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    const player = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/main.ts'),
      'utf8',
    );
    const renderer = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/engine/renderers/MainRenderer.ts'),
      'utf8',
    );
    expect(html).toContain('id="background-image"');
    expect(html).toContain('id="background-video"');
    expect(html).toContain('id="background-wheel"');
    expect(player).toContain("const BACKGROUND_LABELS = ['无背景', '图片背景', '视频背景']");
    expect(player).toContain("saveSettings({ backgroundMode: nextMode })");
    expect(player).toContain("postStatus('background-video-confirmation')");
    expect(player).not.toContain('window.confirm');
    expect(resolveInitialBackgroundState({})).toEqual({ mode: 'image', prompted: false });
    expect(resolveInitialBackgroundState({ backgroundMode: 'none' })).toEqual({
      mode: 'none',
      prompted: false,
    });
    expect(resolveInitialBackgroundState({
      backgroundMode: 'video',
      videoBackgroundConfirmed: true,
    })).toEqual({ mode: 'video', prompted: true });
    expect(renderer).toContain('setBackgroundImage(value: HTMLImageElement | null)');
    expect(renderer).toContain('ctx.drawImage(this.backgroundCache, 0, 0)');
    expect(renderer).not.toContain('cacheBackgroundVideoFrame');
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

  it('serializes native-to-player bridge messages without executable markup', () => {
    const script = chartPreviewPlayerMessageScript({
      type: 'background-video-confirmation-result',
      accepted: true,
      text: '</script>',
    });
    expect(script).toContain('background-video-confirmation-result');
    expect(script).toContain('"accepted":true');
    expect(script).toContain('\\u003c/script>');
    expect(script).not.toContain('</script>');
  });

  it('adapts the fullscreen lock button to light mode with an outline', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'src/features/maimai-chart-preview/webview-player/index.html'),
      'utf8',
    );
    // 深色保持原半透明底值；浅色换白色半透明底并加细边框（浮在浅色 letterbox 上保持可见）。
    expect(html).toContain('--lock-bg: rgba(11,13,18,0.6)');
    expect(html).toContain('--lock-bg-strong: rgba(11,13,18,0.8)');
    expect(html).toContain('--lock-bg: rgba(255,255,255,0.72)');
    expect(html).toContain('--lock-bg-strong: rgba(255,255,255,0.88)');
    expect(html).toContain('background: var(--lock-bg);');
    expect(html).toContain('#fs-lock.locked { color: var(--accent); background: var(--lock-bg-strong); }');
    expect(html).toContain('html[data-theme="light"] #fs-lock { border: 1px solid var(--border); }');
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
