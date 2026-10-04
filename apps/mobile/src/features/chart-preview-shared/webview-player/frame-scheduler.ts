export type FrameRequest = (callback: FrameRequestCallback) => number;
export type FrameCancel = (handle: number) => void;

export type LatestFrameScheduler<T> = {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
  pending: () => boolean;
};

export function createLatestFrameScheduler<T>(
  requestFrame: FrameRequest,
  cancelFrame: FrameCancel,
  run: (value: T) => void,
): LatestFrameScheduler<T> {
  let frame = 0;
  let latest: T | undefined;
  let hasLatest = false;

  const invoke = () => {
    frame = 0;
    if (!hasLatest) return;
    const value = latest as T;
    latest = undefined;
    hasLatest = false;
    run(value);
  };

  return {
    schedule(value) {
      latest = value;
      hasLatest = true;
      if (frame === 0) frame = requestFrame(invoke);
    },
    flush() {
      if (frame !== 0) cancelFrame(frame);
      invoke();
    },
    cancel() {
      if (frame !== 0) cancelFrame(frame);
      frame = 0;
      latest = undefined;
      hasLatest = false;
    },
    pending: () => hasLatest,
  };
}
