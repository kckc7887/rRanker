import { jest } from '@jest/globals';
import { getArcadeMapAvailability } from '@/components/NativeArcadeMap.android';

let mockSupport = { amapSupported: false, amapConfigured: true };
const mockPrivacy = jest.fn(() => ({ isReady: false }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => mockSupport }));
jest.mock('expo-gaode-map', () => ({ ExpoGaodeMapModule: { getPrivacyStatus: () => mockPrivacy() } }));

it('unsupported architectures and absent keys never access the AMap SDK', () => {
  expect(getArcadeMapAvailability()).toBe('unsupported');
  mockSupport = { amapSupported: true, amapConfigured: false };
  expect(getArcadeMapAvailability()).toBe('unconfigured');
  expect(mockPrivacy).not.toHaveBeenCalled();
  mockSupport = { amapSupported: true, amapConfigured: true };
  expect(getArcadeMapAvailability()).toBe('consent');
});
