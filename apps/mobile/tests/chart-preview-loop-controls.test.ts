// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlaybackLoop, bindPlaybackLoop } from '@/features/chart-preview-shared/webview-player/playback-loop';
import { bindFullscreenControls } from '@/features/chart-preview-shared/webview-player/fullscreen-controls';
import { PlayerEventScope } from '@/features/chart-preview-shared/webview-player/event-scope';
import { renderPreviewHeading } from '@/features/chart-preview-shared/webview-player/heading';

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('公共循环与全屏交互', () => {
  it('普通和全屏按钮共用端点，逆序交换、同点停用、再次点击清除，释放后不再改变', () => {
    document.body.innerHTML = '<button id="btn-loop-a"></button><button id="btn-loop-b"></button><button id="fs-loop-a"></button><button id="fs-loop-b"></button>';
    const events = new PlayerEventScope(() => false);
    const loop = new PlaybackLoop();
    let position = 80;
    const update = vi.fn();
    bindPlaybackLoop(events, { loop, position: () => position, percent: value => value, format: String, update });
    const click = (id: string) => document.getElementById(id)!.click();
    click('btn-loop-a'); position = 20; click('fs-loop-b');
    expect(document.getElementById('btn-loop-a')!.textContent).toBe('A 20');
    expect(document.getElementById('fs-loop-a')!.textContent).toBe('A 20');
    expect(update).toHaveBeenLastCalledWith(20, 80);
    expect(loop.target(79)).toBeNull(); expect(loop.target(80)).toBe(20);
    click('fs-loop-a'); expect(loop.target(90)).toBeNull();
    position = 80; click('btn-loop-a'); expect(loop.target(80)).toBeNull();
    events.dispose(); click('btn-loop-b'); expect(loop.b).toBe(80);
    expect(new PlaybackLoop().target(100)).toBeNull();
  });

  it('全屏留白可唤出，操作和拖动不切换显隐，结束操作后重新计时', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main id="blank"></main><div id="controls"><button id="play">播放</button></div>';
    const events = new PlayerEventScope(() => false);
    let active = true;
    let visible = false;
    const controls = bindFullscreenControls(events, { active: () => active, render: value => { visible = value; } });
    const pointer = (id: string, type: string, x = 10) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      document.getElementById(id)!.dispatchEvent(event);
    };
    pointer('blank', 'pointerdown'); pointer('blank', 'pointerup'); expect(visible).toBe(true);
    vi.advanceTimersByTime(4000);
    pointer('play', 'pointerdown'); vi.advanceTimersByTime(6000); expect(visible).toBe(true);
    pointer('play', 'pointerup'); vi.advanceTimersByTime(4999); expect(visible).toBe(true);
    vi.advanceTimersByTime(1); expect(visible).toBe(false);
    pointer('blank', 'pointerdown'); pointer('blank', 'pointerup', 80); expect(visible).toBe(false);
    pointer('blank', 'pointerdown'); pointer('blank', 'pointermove', 80); pointer('blank', 'pointerup'); expect(visible).toBe(false);
    active = false; controls.show(); vi.advanceTimersByTime(6000); expect(visible).toBe(true);
    events.dispose(); active = true; pointer('blank', 'pointerdown'); pointer('blank', 'pointerup'); expect(visible).toBe(true);
  });

  it('曲名与游戏标签分别显示，文本不被解释成 HTML，缺失难度保持占位', () => {
    document.body.innerHTML = '<div id="header"><div id="title"></div></div>';
    renderPreviewHeading('<长曲名>', { label: 'Re:MASTER', value: '14.9', background: '#fff', text: '#7137C8', identity: 'DX · 1P+2P' });
    expect(document.getElementById('title')!.textContent).toBe('<长曲名>');
    expect(document.querySelector('.preview-difficulty')!.textContent).toBe('Re:MASTER 14.9');
    expect(document.querySelector('.preview-identity')!.textContent).toBe('DX · 1P+2P');
    renderPreviewHeading('另一首');
    expect(document.querySelector('.preview-difficulty')!.textContent).toBe('—');
    expect(document.querySelector('.preview-identity')).toBeNull();
  });
});
