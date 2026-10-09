import { requireOptionalNativeModule } from 'expo-modules-core';
import { fromGcj02, type ArcadeCoordinate } from '@/domain/arcade-coordinates';
import { getArcadeMapAvailability } from './arcade-map-platform';

export type ArcadePlace = {
  id: string;
  name: string;
  address: string;
  city: string;
  coordinate: ArcadeCoordinate | null;
};

type PlaceModule = {
  searchPlaces: (requestId: string, keyword: string) => Promise<ArcadePlace[]>;
  resolvePlace: (requestId: string, name: string, city: string) => Promise<ArcadeCoordinate | null>;
  cancelPlaceSearch: (requestId: string) => Promise<void>;
};

let sequence = 0;
function nativeRequest<T>(run: (module: PlaceModule, id: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  const availability = getArcadeMapAvailability();
  if (availability !== 'available') return Promise.reject(new Error(
    availability === 'consent' ? '启用地图后可搜索地点' : '当前无法使用地点搜索',
  ));
  const module = requireOptionalNativeModule<PlaceModule>('ArcadeMapSupport');
  if (!module) return Promise.reject(new Error('当前无法使用地点搜索'));
  const id = String(++sequence);
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { void module.cancelPlaceSearch(id).catch(() => {}); };
    const abort = () => { cancel(); finish(); reject(signal?.reason); };
    const timeout = setTimeout(() => { cancel(); finish(); reject(new Error('地点搜索超时，请重试')); }, 12_000);
    const finish = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (signal?.aborted) throw signal.reason;
      return run(module, id);
    }).then(resolve, reject).finally(finish);
  });
}

export async function searchArcadePlaces(keyword: string, signal?: AbortSignal): Promise<ArcadePlace[]> {
  const places = await nativeRequest((module, id) => module.searchPlaces(id, keyword.trim()), signal);
  return places.slice(0, 10).map(place => ({ ...place,
    coordinate: place.coordinate ? fromGcj02(place.coordinate) : null,
  }));
}

export async function resolveArcadePlace(place: ArcadePlace, signal?: AbortSignal): Promise<ArcadeCoordinate> {
  if (signal?.aborted) throw signal.reason;
  if (place.coordinate) return place.coordinate;
  const coordinate = await nativeRequest((module, id) => module.resolvePlace(id, place.name, place.city), signal);
  if (!coordinate) throw new Error('未找到该地点的位置，请换一个候选');
  return fromGcj02(coordinate);
}
