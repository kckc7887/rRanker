import { Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import * as Location from 'expo-location';
import { formatArcadeGeocodedLabel, type ArcadeOrigin } from '@/domain/arcade-shops';

type Coords = {
  latitude: number;
  longitude: number;
};

function ensureAndroidGeolocationConfig(): void {
  Geolocation.setRNConfiguration({
    skipPermissionRequests: true,
    locationProvider: 'android',
  });
}

function getAndroidCurrentPosition(options: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<Coords> {
  ensureAndroidGeolocationConfig();
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(error.message || 'location'));
      },
      options,
    );
  });
}

async function acquireAndroidCoords(): Promise<Coords> {
  try {
    return await getAndroidCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 60_000,
    });
  } catch {
    // Soft fallback: accept coarser / older LocationManager cache without GMS.
    return getAndroidCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 5 * 60_000,
    });
  }
}

async function acquireIosCoords(): Promise<Coords> {
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

/** Resolve GPS origin for arcade finder. Android uses LocationManager (no GMS). */
export async function acquireArcadeGpsOrigin(): Promise<ArcadeOrigin> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    throw new Error('permission');
  }

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error('location-services-disabled');
  }

  const coords = Platform.OS === 'android'
    ? await acquireAndroidCoords()
    : await acquireIosCoords();

  const label = await labelForCoords(coords);
  return {
    source: 'gps',
    latitude: coords.latitude,
    longitude: coords.longitude,
    label,
  };
}
