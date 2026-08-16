import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NativeModules, Platform } from 'react-native';
import { acquireArcadeGpsOrigin } from '@/utils/acquire-arcade-gps-origin';

const {
  requestForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  getCurrentPositionAsync,
  reverseGeocodeAsync,
  setRNConfiguration,
  getCurrentPosition,
  turboGet,
} = vi.hoisted(() => ({
  requestForegroundPermissionsAsync: vi.fn(),
  hasServicesEnabledAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
  reverseGeocodeAsync: vi.fn(),
  setRNConfiguration: vi.fn(),
  getCurrentPosition: vi.fn(),
  turboGet: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {},
  TurboModuleRegistry: { get: turboGet },
}));

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  getCurrentPositionAsync,
  reverseGeocodeAsync,
}));

vi.mock('@react-native-community/geolocation', () => ({
  default: {
    setRNConfiguration,
    getCurrentPosition,
  },
}));

describe('acquireArcadeGpsOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
    turboGet.mockReturnValue(null);
    Object.keys(NativeModules).forEach((key) => {
      delete (NativeModules as Record<string, unknown>)[key];
    });
    hasServicesEnabledAsync.mockResolvedValue(true);
    reverseGeocodeAsync.mockResolvedValue([]);
  });

  it('throws permission when foreground permission is denied', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });

    await expect(acquireArcadeGpsOrigin()).rejects.toThrow('permission');
    expect(getCurrentPositionAsync).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('throws when location services are disabled', async () => {
    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    hasServicesEnabledAsync.mockResolvedValue(false);

    await expect(acquireArcadeGpsOrigin()).rejects.toThrow('location-services-disabled');
  });

  it('uses expo-location on iOS', async () => {
    (Platform as { OS: string }).OS = 'ios';
    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 31.2, longitude: 121.5 },
    });
    reverseGeocodeAsync.mockResolvedValue([
      { city: '上海市', district: '徐汇区', street: '漕溪北路' },
    ]);

    await expect(acquireArcadeGpsOrigin()).resolves.toEqual({
      source: 'gps',
      latitude: 31.2,
      longitude: 121.5,
      label: '上海市徐汇区漕溪北路',
    });

    expect(getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 3 });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(setRNConfiguration).not.toHaveBeenCalled();
  });

  it('uses Android LocationManager when community geolocation is linked', async () => {
    (Platform as { OS: string }).OS = 'android';
    turboGet.mockReturnValue({});
    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPosition.mockImplementation((success) => {
      success({
        coords: { latitude: 30.1, longitude: 120.2 },
      });
    });

    await expect(acquireArcadeGpsOrigin()).resolves.toEqual({
      source: 'gps',
      latitude: 30.1,
      longitude: 120.2,
      label: '当前位置',
    });

    expect(setRNConfiguration).toHaveBeenCalledWith({
      skipPermissionRequests: true,
      locationProvider: 'android',
    });
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('falls back to expo-location on Android when geolocation is not linked', async () => {
    (Platform as { OS: string }).OS = 'android';
    turboGet.mockReturnValue(null);
    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPositionAsync.mockResolvedValue({
      coords: { latitude: 31.0, longitude: 121.0 },
    });

    await expect(acquireArcadeGpsOrigin()).resolves.toEqual({
      source: 'gps',
      latitude: 31.0,
      longitude: 121.0,
      label: '当前位置',
    });

    expect(getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: 3 });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(setRNConfiguration).not.toHaveBeenCalled();
  });

  it('falls back to coarse Android location after high-accuracy failure', async () => {
    (Platform as { OS: string }).OS = 'android';
    turboGet.mockReturnValue({});
    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPosition
      .mockImplementationOnce((_success, error) => {
        error?.({ message: 'TIMEOUT', code: 3 });
      })
      .mockImplementationOnce((success) => {
        success({
          coords: { latitude: 29.9, longitude: 119.8 },
        });
      });

    await expect(acquireArcadeGpsOrigin()).resolves.toEqual({
      source: 'gps',
      latitude: 29.9,
      longitude: 119.8,
      label: '当前位置',
    });

    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
      enableHighAccuracy: true,
    });
    expect(getCurrentPosition.mock.calls[1][2]).toMatchObject({
      enableHighAccuracy: false,
    });
  });

  it('rejects when Android geolocation fails twice', async () => {
    (Platform as { OS: string }).OS = 'android';
    turboGet.mockReturnValue({});
    requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    getCurrentPosition.mockImplementation((_success, error) => {
      error?.({ message: 'POSITION_UNAVAILABLE', code: 2 });
    });

    await expect(acquireArcadeGpsOrigin()).rejects.toThrow('POSITION_UNAVAILABLE');
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });
});
