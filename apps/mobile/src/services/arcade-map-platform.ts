import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type ArcadeMapAvailability = 'available' | 'consent' | 'unsupported' | 'unconfigured' | 'failed';
type MapSupport = { amapConfigured: boolean; isPrivacyReady: () => boolean; acceptPrivacy: () => void };

export function getArcadeMapAvailability(): ArcadeMapAvailability {
  if (Platform.OS === 'ios') return 'available';
  if (Platform.OS !== 'android') return 'unsupported';
  try {
    const support = requireOptionalNativeModule<MapSupport>('ArcadeMapSupport');
    if (!support) return 'unsupported';
    if (!support.amapConfigured) return 'unconfigured';
    return support.isPrivacyReady() ? 'available' : 'consent';
  } catch { return 'failed'; }
}

export function acceptArcadeMapPrivacy(): void {
  if (getArcadeMapAvailability() !== 'consent') return;
  requireOptionalNativeModule<MapSupport>('ArcadeMapSupport')?.acceptPrivacy();
}
