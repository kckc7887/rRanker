import { jest } from '@jest/globals';
import { Platform } from 'react-native';
import { resolveArcadePlace, searchArcadePlaces, type ArcadePlace } from '@/services/arcade-place-search';
import type { ArcadeMapAvailability } from '@/services/arcade-map-platform';

let mockAvailability: ArcadeMapAvailability = 'available';
const mockSearch = jest.fn<() => Promise<ArcadePlace[]>>();
const mockResolve = jest.fn<() => Promise<{ latitude: number; longitude: number } | null>>();
const mockCancel = jest.fn<() => Promise<void>>(async () => {});
jest.mock('@/services/arcade-map-platform', () => ({ getArcadeMapAvailability: () => mockAvailability }));
jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => ({ searchPlaces: mockSearch, resolvePlace: mockResolve, cancelPlaceSearch: mockCancel }) }));

const platform = Platform.OS;
const place: ArcadePlace = { id: '1', name: '测试地点', address: '测试路', city: '上海', coordinate: { latitude: 31.23, longitude: 121.47 } };
beforeEach(() => { jest.clearAllMocks(); mockAvailability = 'available'; Platform.OS = platform; });
afterEach(() => { Platform.OS = platform; jest.useRealTimers(); });

it('limits MapKit results and converts AMap coordinates at the native boundary', async () => {
  mockSearch.mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({ ...place, id: String(index) })));
  Platform.OS = 'ios';
  expect(await searchArcadePlaces('上海')).toEqual(Array.from({ length: 10 }, (_, index) => ({ ...place, id: String(index) })));
  Platform.OS = 'android';
  expect((await searchArcadePlaces('上海'))[0].coordinate).toEqual({ latitude: expect.closeTo(31.23194, 4), longitude: expect.closeTo(121.46547, 4) });
});

it.each(['unsupported', 'unconfigured', 'consent'] as const)('does not call native search when %s', async availability => {
  mockAvailability = availability;
  await expect(searchArcadePlaces('上海')).rejects.toThrow();
  expect(mockSearch).not.toHaveBeenCalled();
});

it('cancels native search and rejects timeout without waiting for a late response', async () => {
  jest.useFakeTimers();
  mockSearch.mockImplementation(() => new Promise(() => {}));
  const controller = new AbortController();
  const aborted = searchArcadePlaces('上海', controller.signal);
  const rejected = expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  const timeout = searchArcadePlaces('上海');
  const timedOut = expect(timeout).rejects.toThrow('超时');
  await jest.advanceTimersByTimeAsync(12_000);
  await timedOut;
  expect(mockCancel).toHaveBeenCalledTimes(2);
});

it('geocodes candidates without coordinates and rejects an absent match', async () => {
  Platform.OS = 'android';
  mockResolve.mockResolvedValueOnce(place.coordinate).mockResolvedValueOnce(null);
  await expect(resolveArcadePlace({ ...place, coordinate: null })).resolves.toEqual({ latitude: expect.closeTo(31.23194, 4), longitude: expect.closeTo(121.46547, 4) });
  await expect(resolveArcadePlace({ ...place, coordinate: null })).rejects.toThrow('未找到');
});
