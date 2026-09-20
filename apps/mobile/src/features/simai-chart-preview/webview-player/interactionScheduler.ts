export { createLatestFrameScheduler } from '../../chart-preview-shared/webview-player/frame-scheduler';
export type { FrameRequest, FrameCancel, LatestFrameScheduler } from '../../chart-preview-shared/webview-player/frame-scheduler';

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
