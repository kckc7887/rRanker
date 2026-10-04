export type ChartPreviewFullscreenOrientation = 'landscape' | 'portrait_up';

export function chartPreviewNativeScreenOptions(
  isFullscreen: boolean,
  platform: string,
  title = '谱面确认',
  fullscreenOrientation: ChartPreviewFullscreenOrientation = 'landscape',
) {
  const baseOptions = {
    title,
    headerShown: !isFullscreen,
    orientation: isFullscreen ? fullscreenOrientation : 'portrait_up' as const,
  };

  if (platform === 'ios') {
    return {
      ...baseOptions,
      autoHideHomeIndicator: isFullscreen,
    };
  }

  return {
    ...baseOptions,
    statusBarHidden: isFullscreen,
    navigationBarHidden: isFullscreen,
  };
}
