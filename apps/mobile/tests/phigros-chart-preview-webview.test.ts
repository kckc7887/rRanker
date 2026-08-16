import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function templateHtml(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/features/phigros-chart-preview/webview-player/index.html'),
    'utf8',
  );
}

describe('phigros chart preview webview template', () => {
  it('横屏全屏时播放窗保持 16:9 比例并按视口适配', () => {
    const html = templateHtml();
    expect(html).toContain('body.fullscreen .stage');
    expect(html).toContain('aspect-ratio: 16 / 9');
    expect(html).toContain('width: min(100vw, calc(100vh * 16 / 9))');
    expect(html).not.toContain('body.fullscreen .stage { aspect-ratio: auto');
  });

  it('Score/Combo/进度条字号随播放窗经 CSS 变量缩放', () => {
    const html = templateHtml();
    expect(html).toContain('var(--score-font-size');
    expect(html).toContain('var(--combo-font-size');
    expect(html).toContain('var(--combo-label-font-size');
    expect(html).toContain('var(--progress-height');
  });

  it('本地音乐脚本与播放器脚本按序加载', () => {
    const html = templateHtml();
    expect(html.indexOf('<script src="./music-data.js"></script>')).toBeLessThan(
      html.indexOf('<!--PLAYER_SCRIPT-->'),
    );
  });

  it('RPE 演出层元素齐备：GL 后处理画布与 attachUI HUD 节点', () => {
    const html = templateHtml();
    expect(html).toContain('.gl-canvas');
    expect(html).toContain('.hud-attach');
    expect(html).toContain('id="hud-pause"');
    expect(html).toContain('id="hud-name"');
    expect(html).toContain('id="hud-level"');
  });

  it('横屏全屏锁定按钮与舞萌一致：右侧常驻、锁定高亮、深浅色变量齐备', () => {
    const html = templateHtml();
    expect(html).toContain('<button id="fs-lock" type="button" aria-label="锁定">');
    expect(html).toContain('body.fullscreen #fs-lock { display: flex; }');
    expect(html).toContain('#fs-lock.hidden { opacity: 0; pointer-events: none; }');
    expect(html).toContain('#fs-lock.locked { color: var(--accent); background: var(--lock-bg-strong); }');
    expect(html).toContain('--lock-bg: rgba(11,13,18,0.6)');
    expect(html).toContain('--lock-bg-strong: rgba(11,13,18,0.8)');
    expect(html).toContain('--lock-bg: rgba(255,255,255,0.72)');
    expect(html).toContain('--lock-bg-strong: rgba(255,255,255,0.88)');
    expect(html).toContain('html[data-theme="light"] #fs-lock { border: 1px solid var(--border); }');
  });

  it('全屏控制器显隐动画与舞萌一致：底部滑出 220ms', () => {
    const html = templateHtml();
    expect(html).toContain('transition: translate 220ms ease, opacity 220ms ease;');
    expect(html).toContain('body.fullscreen #controls.hidden { translate: 0 100%; opacity: 0; pointer-events: none; }');
  });

  it('下方播放控制器对齐舞萌样式：时间轴/accent 播放钮/transport 图标钮/拨轮/胶囊 toggle，无 demo 残留', () => {
    const html = templateHtml();
    expect(html).toContain('--accent: #5b8cff');
    expect(html).toContain('#play-button {');
    expect(html).toContain('.transport-btn');
    expect(html).toContain('id="timeline-host"');
    expect(html).toContain('id="timeline-playhead"');
    expect(html).toContain('class="wheel-trigger" id="speed-trigger"');
    expect(html).toContain('class="wheel-highlight"');
    expect(html).toContain('id="line-color-trigger"');
    expect(html).toContain('.toggle[aria-pressed="true"]');
    expect(html).toContain('id="multi-hint" type="button" aria-pressed="true"');
    expect(html).toContain('id="time-label"');
    expect(html).toContain('--overlay-panel: rgba(11,13,18,0.92)');
    expect(html).toContain('background: var(--overlay-panel)');
    expect(html).toContain('backdrop-filter: blur(12px)');
    expect(html).toContain('body.fullscreen .controls-settings { display: none; }');
    // demo 残留清理：无加载面板、无滑块、无打击音效开关
    expect(html).not.toContain('load-panel');
    expect(html).not.toContain('id="seek"');
    expect(html).not.toContain('type="range"');
    expect(html).not.toContain('id="hit-sound"');
  });

  it('播放器界面跟随深浅色主题：浅色变量集与配置后即时切换脚本', () => {
    const html = templateHtml();
    // 深色为默认值，浅色经 html[data-theme="light"] 覆盖，谱面画布区保持黑底。
    expect(html).toContain('html[data-theme="light"] {');
    expect(html).toContain('--bg: #F7F8FA');
    expect(html).toContain('--panel: #FFFFFF');
    expect(html).toContain('--playhead: #111827');
    expect(html).toContain('--wheel-bg: #FFFFFF');
    expect(html).toContain('background: #000');
    // 配置脚本之后、播放器脚本之前应用主题，避免首帧闪色。
    const configIndex = html.indexOf('<!--PHIGROS_CHART_PREVIEW_CONFIG-->');
    const themeScriptIndex = html.indexOf("c.theme==='light'");
    const playerScriptIndex = html.indexOf('<!--PLAYER_SCRIPT-->');
    expect(themeScriptIndex).toBeGreaterThan(configIndex);
    expect(themeScriptIndex).toBeLessThan(playerScriptIndex);
  });
});
