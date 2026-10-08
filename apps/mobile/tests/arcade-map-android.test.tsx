import { jest } from '@jest/globals';
import { Platform } from 'react-native';
import { getArcadeMapAvailability } from '@/services/arcade-map-platform';

let mockSupport = { amapSupported: false, amapConfigured: true };
const mockPrivacy = jest.fn(() => ({ isReady: false }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => mockSupport }));
jest.mock('expo-gaode-map', () => ({ ExpoGaodeMapModule: { getPrivacyStatus: () => mockPrivacy() } }));

it('unsupported architectures and absent keys never access the AMap SDK', () => {
  const previous = Platform.OS; Platform.OS = 'android';
  expect(getArcadeMapAvailability()).toBe('unsupported');
  mockSupport = { amapSupported: true, amapConfigured: false };
  expect(getArcadeMapAvailability()).toBe('unconfigured');
  expect(mockPrivacy).not.toHaveBeenCalled();
  mockSupport = { amapSupported: true, amapConfigured: true };
  expect(getArcadeMapAvailability()).toBe('consent');
  mockPrivacy.mockImplementationOnce(() => { throw new Error('native failure'); });
  expect(getArcadeMapAvailability()).toBe('failed');
  Platform.OS = previous;
});
