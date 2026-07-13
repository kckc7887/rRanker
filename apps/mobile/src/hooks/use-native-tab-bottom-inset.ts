import { useContext } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { getNativeTabBottomInset } from '@/navigation/native-tab-layout';

export function useNativeTabBottomInset(): number {
  const safeAreaInsets = useContext(SafeAreaInsetsContext);
  return getNativeTabBottomInset(Platform.OS, safeAreaInsets?.bottom ?? 0);
}
