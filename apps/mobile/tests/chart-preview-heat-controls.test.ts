// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindHeatTimelineKeyboard, buildHeatDensity, HeatTimelineView } from '@/features/chart-preview-shared/webview-player/heat-timeline';
import { PlayerEventScope } from '@/features/chart-preview-shared/webview-player/event-scope';
import { installPreviewControls } from '@/features/chart-preview-shared/webview-player/controls';
import { setupWheelPopup } from '@/features/chart-preview-shared/webview-player/wheel';
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
    seek.mockClear();
    host.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(seek).not.toHaveBeenCalled();
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
    expect(host.style.getPropertyValue('--heat-progress')).toBe('35%');
    for (const range of host.querySelectorAll<HTMLElement>('.heat-loop-range')) {
      expect(range.hidden).toBe(false);
      expect(range.style.left).toBe('20%');
      expect(range.style.width).toBe('50%');
    }
    view.updateLoop(null, null);
    view.build(0, [{ times: [] }], []);
    expect(host.querySelector('.heat-loop-marker')!.hasAttribute('hidden')).toBe(true);
  });
});

describe('公共播放控制', () => {
  it.each(['simai', 'phigros', 'osu', 'rizline'])('%s 调整布局后仍可重播与修改参数', feature => {
    const html = readFileSync(resolve(process.cwd(), `src/features/${feature}-chart-preview/webview-player/index.html`), 'utf8');
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.innerHTML = parsed.body.innerHTML;
    const element = (id: string) => document.getElementById(id)!;
    const details = feature === 'simai' ? [element('header'), element('info-bar')] : undefined;
    const clicked = vi.fn();
    element('btn-restart').addEventListener('click', clicked);
    const dispose = installPreviewControls({ measureNavigation: feature === 'simai', details, sections: ['播放设置', '画面设置', '视觉效果'] });
    const restart = element('btn-restart') as HTMLButtonElement;
    restart.disabled = false;
    restart.click();
    expect(clicked).toHaveBeenCalled();

    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const preview = vi.fn();
    const commit = vi.fn();
    const id = feature === 'osu' ? 'brightness' : 'speed';
    const trigger = element(`${id}-trigger`) as HTMLButtonElement;
    trigger.disabled = false;
    const expected = feature === 'osu' ? 21 : 1.05;
    const speed = setupWheelPopup(trigger, element(`${id}-popup`), element(`${id}-wheel`),
      element(`${id}-list`), element(`${id}-val`), preview, commit,
      feature === 'osu' ? 0 : 0.5, feature === 'osu' ? 100 : 2, feature === 'osu' ? 1 : 0.05,
      feature === 'osu' ? 20 : 1, undefined,
      value => feature === 'osu' ? `${value}%` : `${value.toFixed(2)}×`);
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    speed.flush();
    expect(element(`${id}-val`).textContent).toBe(feature === 'osu' ? '21%' : '1.05×');
    expect(preview).toHaveBeenCalledWith(expected);
    expect(commit).toHaveBeenCalledWith(expected);
    speed.dispose();
    preview.mockClear();
    commit.mockClear();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    speed.flush();
    expect(preview).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
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
