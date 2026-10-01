// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeActiveWheelPopup, setupWheelPopup } from '@/features/chart-preview-shared/webview-player/wheel';

let frameId = 0;
const frames = new Map<number, FrameRequestCallback>();
const disposers: (() => void)[] = [];

function makeWheel(labels?: readonly string[], format?: (value: number) => string, range = [0, 3, 1, 1], inline = false) {
  const container = document.createElement('section');
  container.innerHTML = '<button></button><aside style="visibility:hidden"><div><div></div></div></aside><span></span>';
  document.body.append(container);
  const trigger = container.querySelector('button')!;
  if (inline) {
    container.className = 'field';
    container.prepend(document.createTextNode('播放速度'));
    trigger.dataset.presentation = 'inline';
  }
  const popup = container.querySelector('aside')!;
  const viewport = popup.firstElementChild as HTMLElement;
  const list = viewport.firstElementChild as HTMLElement;
  const value = container.querySelector('span')!;
  viewport.scrollTo = vi.fn((options: ScrollToOptions | number) => {
    if (typeof options !== 'number') viewport.scrollTop = options.top ?? 0;
  }) as typeof viewport.scrollTo;
  const preview = vi.fn();
  const commit = vi.fn();
  const wheel = setupWheelPopup(trigger, popup, viewport, list, value, preview, commit, range[0], range[1], range[2], range[3], labels, format);
  disposers.push(wheel.dispose);
  return { wheel, trigger, popup, viewport, list, value, preview, commit };
}

beforeEach(() => {
  vi.useFakeTimers();
  frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});

describe('谱面确认常驻参数控件', () => {
  it('键盘按真实小数步长预览，关闭或生命周期暂停时仅提交最终值', () => {
    const item = makeWheel(undefined, value => `${value.toFixed(2)}×`, [0.5, 2, 0.05, 1], true);
    expect(item.trigger.getAttribute('role')).toBe('slider');
    expect(item.trigger.getAttribute('aria-label')).toBe('播放速度');
    expect(item.popup.hidden).toBe(true);
    item.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    item.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(item.value.textContent).toBe('1.10×');
    expect(item.preview).not.toHaveBeenCalled();
    closeActiveWheelPopup();
    vi.runAllTimers();
    expect(item.preview).toHaveBeenCalledExactlyOnceWith(1.1);
    expect(item.commit).toHaveBeenCalledExactlyOnceWith(1.1);
  });

  it('枚举、静默回退与禁用状态直接复用同一个设置入口', () => {
    const item = makeWheel(['无', '图片', '视频'], undefined, [0, 2, 1, 0], true);
    item.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    item.wheel.flush();
    expect(item.commit).toHaveBeenCalledExactlyOnceWith(2);
    item.wheel.setValue(0);
    expect(item.value.textContent).toBe('无');
    expect(item.trigger.getAttribute('aria-valuenow')).toBe('0');
    item.trigger.disabled = true;
    item.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    vi.runAllTimers();
    expect(item.wheel.getValue()).toBe(0);
    expect(item.commit).toHaveBeenCalledTimes(1);
  });

  it('纵向触摸滚动不改变数值，横向拖动微调且取消后停止响应', () => {
    const item = makeWheel(undefined, undefined, [0, 10, 0.1, 1], true);
    const pointer = (target: EventTarget, type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 1, clientX: x, clientY: y, button: 0, pointerType: 'touch', isPrimary: true });
      target.dispatchEvent(event);
    };
    pointer(item.trigger, 'pointerdown', 20, 20);
    pointer(window, 'pointermove', 22, 70);
    pointer(window, 'pointerup', 22, 70);
    expect(item.wheel.getValue()).toBe(1);
    expect(item.commit).not.toHaveBeenCalled();
    pointer(item.trigger, 'pointerdown', 20, 20);
    pointer(window, 'pointermove', 32, 21);
    pointer(window, 'pointercancel', 32, 21);
    expect(item.wheel.getValue()).toBe(1.3);
    expect(item.commit).toHaveBeenCalledExactlyOnceWith(1.3);
    pointer(window, 'pointermove', 80, 21);
    expect(item.wheel.getValue()).toBe(1.3);
  });

  it('释放撤销排队预览、提交和所有交互', () => {
    const item = makeWheel(undefined, undefined, [0, 3, 1, 1], true);
    item.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    item.wheel.dispose();
    item.trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }));
    vi.runAllTimers();
    expect(item.preview).not.toHaveBeenCalled();
    expect(item.commit).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
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

  it.each([
    [[0.5, 2, 0.05, 1], 11, 1.05],
    [[0, 1, 0.01, 0.5], 51, 0.51],
  ])('保留小数步长且显式flush只提交最终值一次', (range, index, expected) => {
    const item = makeWheel(undefined, value => value.toFixed(2), range);
    item.viewport.scrollTop = index * 28;
    item.viewport.dispatchEvent(new Event('scroll'));
    item.wheel.flush();
    item.wheel.flush();
    vi.runAllTimers();
    expect(item.preview).toHaveBeenCalledExactlyOnceWith(expected);
    expect(item.commit).toHaveBeenCalledExactlyOnceWith(expected);
    expect(item.value.textContent).toBe(expected.toFixed(2));
  });

  it('关闭弹层先提交当前值，后续计时器不重复提交', () => {
    const item = makeWheel();
    item.trigger.click();
    item.viewport.scrollTop = 84;
    item.viewport.dispatchEvent(new Event('scroll'));
    closeActiveWheelPopup();
    vi.runAllTimers();
    expect(item.preview).toHaveBeenCalledExactlyOnceWith(3);
    expect(item.commit).toHaveBeenCalledExactlyOnceWith(3);
  });
});
