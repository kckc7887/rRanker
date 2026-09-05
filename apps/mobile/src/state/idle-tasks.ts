export type IdleTask = { cancel: () => void };

const transitions = new Set<object>();
const waiting = new Set<() => void>();
const pending = new Set<() => void>();
let paused = false;

export function setIdleTasksPaused(value: boolean): void {
  if (paused === value) return;
  paused = value;
  for (const enqueue of [...pending]) enqueue();
}

export function beginNavigationTransition(): () => void {
  const token = {};
  transitions.add(token);
  return () => {
    if (!transitions.delete(token) || transitions.size > 0) return;
    for (const resume of [...waiting]) resume();
  };
}

export function scheduleIdleTask(callback: () => void): IdleTask {
  let cancelled = false;
  let handle: number | undefined;
  const enqueue = () => {
    if (handle !== undefined) {
      cancelIdleCallback(handle);
      handle = undefined;
    }
    waiting.delete(enqueue);
    if (cancelled) return;
    if (paused || transitions.size > 0) {
      waiting.add(enqueue);
      return;
    }
    handle = requestIdleCallback(() => {
      handle = undefined;
      if (cancelled) return;
      if (paused || transitions.size > 0) {
        waiting.add(enqueue);
        return;
      }
      pending.delete(enqueue);
      callback();
    });
  };
  pending.add(enqueue);
  enqueue();
  return {
    cancel() {
      cancelled = true;
      waiting.delete(enqueue);
      pending.delete(enqueue);
      if (handle !== undefined) cancelIdleCallback(handle);
    },
  };
}
