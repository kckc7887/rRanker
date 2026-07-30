import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import * as Location from 'expo-location';
import { formatArcadeGeocodedLabel, type ArcadeOrigin } from '@/domain/arcade-shops';

type Coords = {
  latitude: number;
  longitude: number;
};

type CommunityGeolocation = {
  setRNConfiguration: (config: {
    skipPermissionRequests: boolean;
    locationProvider?: 'playServices' | 'android' | 'auto';
  }) => void;
  getCurrentPosition: (
    success: (position: { coords: { latitude: number; longitude: number } }) => void,
    error?: (error: { message?: string }) => void,
    options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    },
  ) => void;
};

/** True only in Android builds that autolinked RNCGeolocation (not Expo Go). */
function isAndroidCommunityGeolocationLinked(): boolean {
  if (Platform.OS !== 'android') return false;
  try {
    if (TurboModuleRegistry.get('RNCGeolocation') != null) return true;
  } catch {
    // TurboModuleRegistry.get may throw when the module is missing.
  }
  return NativeModules.RNCGeolocation != null;
}

/**
 * Lazily load community geolocation only when the native module is linked.
 * A top-level import crashes Expo Go because the package is not in that client.
 */
async function tryLoadAndroidGeolocation(): Promise<CommunityGeolocation | null> {
  if (!isAndroidCommunityGeolocationLinked()) return null;
  try {
    const mod = await import('@react-native-community/geolocation');
    const geo = (mod as { default?: CommunityGeolocation }).default;
    if (!geo || typeof geo.getCurrentPosition !== 'function') return null;
    return geo;
  } catch {
    return null;
  }
}

function getAndroidCurrentPosition(
  geolocation: CommunityGeolocation,
  options: {
    enableHighAccuracy: boolean;
    timeout: number;
    maximumAge: number;
  },
): Promise<Coords> {
  geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    locationProvider: 'android',
  });
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(error?.message || 'location'));
      },
      options,
    );
  });
}

async function acquireAndroidLocationManagerCoords(
  geolocation: CommunityGeolocation,
): Promise<Coords> {
  try {
    return await getAndroidCurrentPosition(geolocation, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    });
  } catch {
    // Soft fallback: accept coarser / older LocationManager cache without GMS.
    return getAndroidCurrentPosition(geolocation, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 5 * 60_000,
    });
  }
}

async function acquireExpoCoords(): Promise<Coords> {
  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };
}

async function labelForCoords(coords: Coords): Promise<string> {
  let label = '当前位置';
  try {
    const places = await Location.reverseGeocodeAsync(coords);
    if (places[0]) {
      label = formatArcadeGeocodedLabel(places[0]) || label;
    }
  } catch {
    // Keep the generic GPS label when reverse geocode is unavailable.
  }
  return label;
}

/**
 * Resolve GPS origin for arcade finder.
 * Android custom/EAS builds use LocationManager (no GMS) via community geolocation.
 * Expo Go / iOS / unlinked native module fall back to expo-location.
 */
export async function acquireArcadeGpsOrigin(): Promise<ArcadeOrigin> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('permission');
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error('location-services-disabled');
  }

  const androidGeo = await tryLoadAndroidGeolocation();
  const coords = androidGeo
    ? await acquireAndroidLocationManagerCoords(androidGeo)
    : await acquireExpoCoords();

  const label = await labelForCoords(coords);
  return {
    source: 'gps',
    latitude: coords.latitude,
    longitude: coords.longitude,
    label,
  };
}
