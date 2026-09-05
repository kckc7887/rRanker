import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginNavigationTransition, scheduleIdleTask, setIdleTasksPaused } from '@/state/idle-tasks';

let callbacks: Map<number, () => void>;
let sequence = 0;
beforeEach(() => {
  callbacks = new Map();
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    callbacks.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal('cancelIdleCallback', (handle: number) => callbacks.delete(handle));
});
afterEach(() => vi.unstubAllGlobals());
function flush() {
  const batch = [...callbacks.values()];
  callbacks.clear();
  for (const callback of batch) callback();
}

describe('idle work and native transitions', () => {
  it('cancels native callbacks in the background and only resumes retained work', () => {
    const retained = vi.fn();
    const cancelled = vi.fn();
    scheduleIdleTask(retained);
    const task = scheduleIdleTask(cancelled);
    setIdleTasksPaused(true);
    expect(callbacks.size).toBe(0);
    task.cancel();
    flush();
    expect(retained).not.toHaveBeenCalled();
    setIdleTasksPaused(false);
    flush();
    expect(retained).toHaveBeenCalledOnce();
    expect(cancelled).not.toHaveBeenCalled();
  });
  it('runs only when idle and cancels a pending callback', () => {
    const callback = vi.fn();
    const task = scheduleIdleTask(callback);
    expect(callback).not.toHaveBeenCalled();
    task.cancel();
    flush();
    expect(callback).not.toHaveBeenCalled();
    scheduleIdleTask(callback);
    flush();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('waits for all transitions, including one beginning after scheduling', () => {
    const callback = vi.fn();
    scheduleIdleTask(callback);
    const endFirst = beginNavigationTransition();
    const endSecond = beginNavigationTransition();
    flush();
    endFirst();
    flush();
    expect(callback).not.toHaveBeenCalled();
    endSecond();
    expect(callback).not.toHaveBeenCalled();
    flush();
    expect(callback).toHaveBeenCalledTimes(1);
    endSecond();
    flush();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not resume cancelled work after a transition ends', () => {
    const end = beginNavigationTransition();
    const callback = vi.fn();
    const task = scheduleIdleTask(callback);
    task.cancel();
    end();
    flush();
    expect(callback).not.toHaveBeenCalled();
  });
});
