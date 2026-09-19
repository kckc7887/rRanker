// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeActiveWheelPopup, setupWheelPopup } from '@/features/chart-preview-shared/webview-player/wheel';

let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const disposers: (() => void)[] = [];

function makeWheel(labels?: readonly string[], format?: (value: number) => string) {
  const container = document.createElement('section');
  container.innerHTML = '<button></button><aside style="visibility:hidden"><div><div></div></div></aside><span></span>';
  document.body.append(container);
  const trigger = container.querySelector('button')!;
  const popup = container.querySelector('aside')!;
  const viewport = popup.firstElementChild as HTMLElement;
  const list = viewport.firstElementChild as HTMLElement;
  const value = container.querySelector('span')!;
  viewport.scrollTo = vi.fn((options: ScrollToOptions | number) => {
    if (typeof options !== 'number') viewport.scrollTop = options.top ?? 0;
  }) as typeof viewport.scrollTo;
  const preview = vi.fn();
  const commit = vi.fn();
  const wheel = setupWheelPopup(trigger, popup, viewport, list, value, preview, commit, 0, 3, 1, 1, labels, format);
  disposers.push(wheel.dispose);
  return { wheel, trigger, popup, viewport, list, value, preview, commit };
}

beforeEach(() => {
  vi.useFakeTimers();
  frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(() => {
  disposers.splice(0).forEach(dispose => dispose());
  closeActiveWheelPopup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('共享谱面确认拨轮', () => {
  it('保留原单小数显示、28px定位和120ms提交，连续滚动每帧仅预览最终值', () => {
    const { wheel, viewport, list, value, preview, commit } = makeWheel();
    expect(value.textContent).toBe('1.0');
    expect(viewport.scrollTop).toBe(28);
    expect(list.children[1].getAttribute('aria-selected')).toBe('true');
    viewport.scrollTop = 56;
    viewport.dispatchEvent(new Event('scroll'));
    viewport.scrollTop = 84;
    viewport.dispatchEvent(new Event('scroll'));
    expect(preview).not.toHaveBeenCalled();
    vi.advanceTimersByTime(119);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(preview).toHaveBeenCalledExactlyOnceWith(3);
    expect(commit).toHaveBeenCalledExactlyOnceWith(3);
    expect(wheel.getValue()).toBe(3);
    expect(value.textContent).toBe('3.0');
    expect(list.children[1].getAttribute('aria-selected')).toBe('false');
    expect(list.children[3].getAttribute('aria-selected')).toBe('true');
  });

  it('弹层互斥，公共关闭和外部点击沿用相同行为', () => {
    const first = makeWheel();
    const second = makeWheel(['无', '图片', '视频', '其它']);
    first.trigger.click();
    expect(first.popup.style.visibility).toBe('');
    second.trigger.click();
    expect(first.popup.style.visibility).toBe('hidden');
    expect(second.popup.style.visibility).toBe('');
    second.popup.click();
    expect(second.popup.style.visibility).toBe('');
    closeActiveWheelPopup();
    expect(second.popup.style.visibility).toBe('hidden');
    second.trigger.click();
    document.body.click();
    expect(second.popup.style.visibility).toBe('hidden');
    expect(second.value.textContent).toBe('图片');
  });

  it('允许调用方格式化数值，同时保留静默setValue合同', () => {
    const item = makeWheel(undefined, value => `${value}%`);
    expect(item.value.textContent).toBe('1%');
    expect(item.list.children[2].textContent).toBe('2%');
    item.wheel.setValue(2);
    expect(item.value.textContent).toBe('2%');
    expect(item.wheel.getValue()).toBe(2);
    expect(item.preview).not.toHaveBeenCalled();
    expect(item.commit).not.toHaveBeenCalled();
  });

  it('释放时移除交互并撤销尚未预览或提交的滚动', () => {
    const item = makeWheel();
    item.trigger.click();
    item.viewport.scrollTop = 84;
    item.viewport.dispatchEvent(new Event('scroll'));
    expect(frames.size).toBe(1);
    item.wheel.dispose();
    vi.runAllTimers();
    expect(frames.size).toBe(0);
    expect(item.preview).not.toHaveBeenCalled();
    expect(item.commit).not.toHaveBeenCalled();
    item.trigger.click();
    expect(item.popup.style.visibility).toBe('hidden');
    item.viewport.dispatchEvent(new Event('scroll'));
    vi.runAllTimers();
    expect(item.commit).not.toHaveBeenCalled();
  });
});
