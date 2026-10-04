// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindHeatTimelineKeyboard, buildHeatDensity, HeatTimelineView } from '@/features/chart-preview-shared/webview-player/heat-timeline';
import { PlayerEventScope } from '@/features/chart-preview-shared/webview-player/event-scope';
import { installPreviewControls } from '@/features/chart-preview-shared/webview-player/controls';
import { chartPreviewAppearanceScript } from '@/features/chart-preview-shared/chart-preview-inject-factory';

afterEach(() => {
  document.body.replaceChildren();
  document.body.className = '';
  document.head.replaceChildren();
  vi.unstubAllGlobals();
});

describe('热度时间轴', () => {
  it('键盘按当前会话位置跳转并限制端点，销毁后不再触发', () => {
    const host = document.createElement('div');
    const events = new PlayerEventScope(() => false);
    const seek = vi.fn();
    bindHeatTimelineKeyboard(events, host, () => 98, seek);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }));
    expect(seek).toHaveBeenLastCalledWith(100);
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(seek).toHaveBeenLastCalledWith(0);
    events.dispose();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(seek).toHaveBeenCalledTimes(2);
  });
  it('保留空段和真实起点，多轨共用比例且不把两侧相加', () => {
    const bins = buildHeatDensity(10, [{ times: [1, 1, 6] }, { times: [1] }], 10);
    expect(bins[0]).toEqual([0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0]);
    expect(bins[1]).toEqual([0, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('保留端点、负前导及最小可见比例，限制绘制节点且无效时长无伪造热度', () => {
    const bins = buildHeatDensity(10, [{ times: [-1, 10, NaN, ...Array(30).fill(5)] }], 500);
    expect(bins[0]).toHaveLength(200);
    expect(bins[0][0]).toBe(2 / 22);
    expect(bins[0][199]).toBe(2 / 22);
    expect(bins[0][100]).toBe(1);
    expect(buildHeatDensity(0, [{ times: [1] }], 200)).toEqual([[]]);
  });

  it('双轨共用播放位置和 A/B 区间，重建不丢标记，清空后不遗留上一张谱面', () => {
    document.body.innerHTML = '<div id="host"><div id="bars"></div><div id="ruler"></div><span id="head"></span><span id="badge"></span></div>';
    const host = document.getElementById('host')!;
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect);
    const view = new HeatTimelineView({ host, bars: document.getElementById('bars')!, ruler: document.getElementById('ruler')!,
      playhead: document.getElementById('head')!, badge: document.getElementById('badge')! });
    const tracks = [{ label: '1P', times: [2, 3] }, { label: '2P', times: [7] }];
    view.build(10, tracks, [{ percent: 0, text: '0' }, { percent: 50, text: '5' }]);
    view.updateProgress(35, '0:03');
    view.updateLoop(20, 70);
    view.build(10, tracks, []);
    expect(host.dataset.tracks).toBe('2');
    expect(host.style.getPropertyValue('--heat-progress')).toBe('35%');
    expect(host.querySelectorAll('.heat-cursor')).toHaveLength(2);
    for (const range of host.querySelectorAll<HTMLElement>('.heat-loop-range')) {
      expect(range.hidden).toBe(false);
      expect(range.style.left).toBe('20%');
      expect(range.style.width).toBe('50%');
    }
    view.updateLoop(null, null);
    view.build(0, [{ times: [] }], []);
    expect(host.querySelectorAll('.heat-bin')).toHaveLength(0);
    expect(host.querySelector('.heat-loop-marker')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('公共播放控制布局', () => {
  it.each(['simai', 'phigros', 'osu', 'rizline'])('%s 保留实际控制节点、设置和监听，按播放详情顺序组织', feature => {
    const html = readFileSync(resolve(process.cwd(), `src/features/${feature}-chart-preview/webview-player/index.html`), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.innerHTML = parsed.body.innerHTML;
    const details = feature === 'simai' ? [document.getElementById('header')!, document.getElementById('info-bar')!] : undefined;
    const restart = document.getElementById('btn-restart')!;
    const clicked = vi.fn();
    restart.addEventListener('click', clicked);
    const triggers = Array.from(document.querySelectorAll('.wheel-trigger'));
    const dispose = installPreviewControls({ measureNavigation: feature === 'simai', details, sections: ['播放设置', '画面设置', '视觉效果'] });
    const controls = document.getElementById('controls')!;
    expect(controls.firstElementChild!.classList.contains('preview-time-row')).toBe(true);
    expect(controls.querySelector('.preview-time-heading')!.textContent).toContain('播放详情');
    expect(controls.querySelector('.preview-settings h2')!.textContent).toBe('参数与效果');
    expect(Array.from(controls.querySelectorAll('.wheel-trigger'))).toEqual(triggers);
    for (const trigger of triggers) expect((trigger as HTMLElement).dataset.presentation).toBe('inline');
    expect(controls.querySelector('#btn-restart')).toBe(restart);
    restart.dispatchEvent(new Event('click'));
    expect(clicked).toHaveBeenCalledTimes(1);
    if (details) {
      expect(controls.querySelector('.preview-details #info-bar')).toBe(details[1]);
      expect(controls.querySelector('.preview-measure #timeline-badge')).not.toBeNull();
    }
    dispose();
  });

  it('将主题色应用到页面并为不可读的颜色选择回退', () => {
    const root = document.documentElement;
    new Function('document', chartPreviewAppearanceScript({ dark: true, accent: '#000' }))(document);
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.getPropertyValue('--preview-accent')).toBe('#000000');
    expect(root.style.getPropertyValue('--preview-accent-text')).toBe('#f1f1f1');
    new Function('document', chartPreviewAppearanceScript({ dark: false, accent: '#fff' }))(document);
    expect(root.dataset.theme).toBe('light');
    expect(root.style.getPropertyValue('--preview-on-accent')).toBe('#000000');
    expect(root.style.getPropertyValue('--preview-accent-text')).toBe('#202020');
    new Function('document', chartPreviewAppearanceScript({ dark: true, accent: '</script>' }))(document);
    expect(root.style.getPropertyValue('--preview-accent')).toBe('#5B8CFF');
  });
});
