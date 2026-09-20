/**
 * 谱面确认屏幕的原生导航/系统栏选项（公共路径）：
 * 全屏时切换方向并隐藏系统 Chrome，默认横屏；游戏可通过
 * fullscreenOrientation 保持竖屏。iOS 走 home 指示条、Android 走
 * 状态栏/导航栏，标题默认「谱面确认」，可由各游戏屏幕覆写。
 */
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
