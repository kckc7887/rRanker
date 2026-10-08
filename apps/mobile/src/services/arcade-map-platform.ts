/* eslint-disable @typescript-eslint/no-require-imports -- 通过架构与配置检查后才能加载 SDK。 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

export type ArcadeMapAvailability = 'available' | 'consent' | 'unsupported' | 'unconfigured' | 'failed';

export function getArcadeMapAvailability(): ArcadeMapAvailability {
  if (Platform.OS === 'ios') return 'available';
  if (Platform.OS !== 'android') return 'unsupported';
  try {
    const support = requireOptionalNativeModule<{ amapSupported: boolean; amapConfigured: boolean }>('ArcadeMapSupport');
    if (!support?.amapSupported) return 'unsupported';
    if (!support.amapConfigured) return 'unconfigured';
    const { ExpoGaodeMapModule } = require('expo-gaode-map') as typeof import('expo-gaode-map');
    return ExpoGaodeMapModule.getPrivacyStatus().isReady ? 'available' : 'consent';
  } catch { return 'failed'; }
}

export function acceptArcadeMapPrivacy(): void {
  if (getArcadeMapAvailability() !== 'consent') return;
  const { ExpoGaodeMapModule } = require('expo-gaode-map') as typeof import('expo-gaode-map');
  ExpoGaodeMapModule.setPrivacyConfig({ hasShow: true, hasContainsPrivacy: true, hasAgree: true, privacyVersion: '1' });
}
