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
    expect(html).toContain('background: rgba(11,13,18,0.92)');
    expect(html).toContain('backdrop-filter: blur(12px)');
    expect(html).toContain('body.fullscreen .controls-settings { display: none; }');
    // demo 残留清理：无加载面板、无滑块、无打击音效开关
    expect(html).not.toContain('load-panel');
    expect(html).not.toContain('id="seek"');
    expect(html).not.toContain('type="range"');
    expect(html).not.toContain('id="hit-sound"');
  });
});
