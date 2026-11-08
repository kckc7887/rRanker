const NATIVE_TAB_BAR_BASE_HEIGHT = {
  android: 80,
} as const;

export function getNativeTabBottomInset(platform: string, safeAreaBottom: number): number {
  // iOS Native Tabs restores automatic content-inset adjustment on the first
  // descendant scroll view. Adding the tab bar and home-indicator inset again
  // creates a large blank strip that visually extends the native tab bar.
  const baseHeight = platform === 'android' ? NATIVE_TAB_BAR_BASE_HEIGHT.android : 0;

  return baseHeight === 0 ? 0 : baseHeight + Math.max(0, safeAreaBottom);
}
