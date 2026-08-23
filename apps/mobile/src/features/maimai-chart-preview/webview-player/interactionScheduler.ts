export type FrameRequest = (callback: FrameRequestCallback) => number;
export type FrameCancel = (handle: number) => void;

export type LatestFrameScheduler<T> = {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
  pending: () => boolean;
};

export type ChartPreviewBackgroundMode = 'none' | 'image' | 'video';

export function resolveInitialBackgroundState(settings: {
  backgroundMode?: unknown;
  videoBackgroundPrompted?: boolean;
  videoBackgroundConfirmed?: boolean;
}): { mode: ChartPreviewBackgroundMode; prompted: boolean } {
  const prompted = settings.videoBackgroundPrompted
    ?? settings.videoBackgroundConfirmed
    ?? false;
  const savedMode = settings.backgroundMode === 'none'
    || settings.backgroundMode === 'image'
    || settings.backgroundMode === 'video'
    ? settings.backgroundMode
    : 'image';
  return {
    mode: savedMode === 'video' && !prompted ? 'image' : savedMode,
    prompted,
  };
}

/** 将同一显示帧内的连续输入合并为最后一次，避免拖动和拨轮重复整帧渲染。 */
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
