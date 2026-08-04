export type FullscreenLockUiState = {
  locked: boolean;
  overlayHidden: boolean;
  actionLabel: '锁定' | '解锁';
};

export function toggleFullscreenLockUiState(currentlyLocked: boolean): FullscreenLockUiState {
  const locked = !currentlyLocked;
  return {
    locked,
    overlayHidden: locked,
    actionLabel: locked ? '解锁' : '锁定',
  };
}
