export function chartPreviewNativeScreenOptions(isFullscreen: boolean, platform: string, title = '谱面确认') {
  const baseOptions = {
    title,
    headerShown: !isFullscreen,
    orientation: isFullscreen ? 'landscape' as const : 'portrait_up' as const,
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
