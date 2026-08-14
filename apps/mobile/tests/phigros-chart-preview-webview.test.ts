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
});
