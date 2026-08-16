/**
 * 谱面确认屏幕的原生导航/系统栏选项（公共路径）：
 * 全屏时切换横屏并隐藏系统 Chrome，iOS 走 home 指示条、Android 走
 * 状态栏/导航栏，标题默认「谱面确认」，可由各游戏屏幕覆写。
 */
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
