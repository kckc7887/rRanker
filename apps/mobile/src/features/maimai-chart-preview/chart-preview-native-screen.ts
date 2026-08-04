export function chartPreviewNativeScreenOptions(isFullscreen: boolean, platform: string) {
  const baseOptions = {
    title: '谱面确认',
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
