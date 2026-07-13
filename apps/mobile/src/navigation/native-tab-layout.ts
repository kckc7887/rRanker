const NATIVE_TAB_BAR_BASE_HEIGHT = {
  android: 80,
  ios: 64,
} as const;

export function getNativeTabBottomInset(platform: string, safeAreaBottom: number): number {
  const baseHeight = platform === 'ios'
    ? NATIVE_TAB_BAR_BASE_HEIGHT.ios
    : platform === 'android'
      ? NATIVE_TAB_BAR_BASE_HEIGHT.android
      : 0;

  return baseHeight === 0 ? 0 : baseHeight + Math.max(0, safeAreaBottom);
}
