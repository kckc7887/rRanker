import { describe, expect, it } from 'vitest';
import { PlayerEventScope } from '@/features/chart-preview-shared/webview-player/event-scope';

describe('播放器监听所有权', () => {
  it('终态与释放均拒绝晚事件，清理只执行一次', () => {
    const target = new EventTarget();
    let disposed = false;
    let events = 0;
    let cleanups = 0;
    const scope = new PlayerEventScope(() => disposed);
    scope.listen(target, 'resize', () => { events += 1; });
    scope.own(() => { cleanups += 1; });
    target.dispatchEvent(new Event('resize'));
    disposed = true;
    target.dispatchEvent(new Event('resize'));
    scope.dispose(); scope.dispose();
    target.dispatchEvent(new Event('resize'));
    expect(events).toBe(1);
    expect(cleanups).toBe(1);
  });
});

it('一个清理抛错仍释放其余资源，并保持幂等终态', () => {
  const scope = new PlayerEventScope(() => false);
  let cleaned = 0;
  scope.own(() => { cleaned += 1; });
  scope.own(() => { throw new Error('close failed'); });
  expect(() => scope.dispose()).not.toThrow();
  scope.dispose();
  expect(cleaned).toBe(1);
});
