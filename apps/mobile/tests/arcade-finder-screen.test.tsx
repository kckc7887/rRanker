import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ArcadeOrigin, ArcadeShop } from '@/domain/arcade-shops';
import type { ComponentProps } from 'react';
import type { ArcadeMap } from '@/components/ArcadeMap';
import type { ArcadeFilterBar } from '@/components/ArcadeFilterBar';
import type { searchNearcadeShops } from '@/services/nearcade-client';
import type { searchArcadePlaces, resolveArcadePlace } from '@/services/arcade-place-search';
import ArcadeFinderScreen from '../app/tools/arcade-finder';

const mockGps = jest.fn<() => Promise<ArcadeOrigin>>();
const mockDiscover = jest.fn<(_input: unknown) => Promise<ArcadeShop[]>>(async () => []);
let mockMap: ComponentProps<typeof ArcadeMap>;
let mockGpsPress: () => void;
let mockFilter: ComponentProps<typeof ArcadeFilterBar>;
const mockShopSearch = jest.fn<typeof searchNearcadeShops>();
const mockPlaceSearch = jest.fn<typeof searchArcadePlaces>();
const mockResolvePlace = jest.fn<typeof resolveArcadePlace>();
let mockLifecycle = { foregroundReady: true, foregroundGeneration: 1 };
let mockForeground = new AbortController();
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('@/components/ArcadeMap', () => ({ ArcadeMap: (props: typeof mockMap) => { mockMap = props; return null; } }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }) }));
jest.mock('@/components/ArcadeBusinessStatusLabel', () => ({ ArcadeBusinessStatusLabel: () => null }));
jest.mock('@/components/ArcadeFilterBar', () => ({ ArcadeFilterBar: (props: typeof mockFilter) => { mockFilter = props; mockGpsPress = props.onUseGpsOrigin; return null; } }));
jest.mock('@/features/toolbox/arcade-finder-preferences', () => ({
  arcadeFinderPreferencesStore: { load: async () => ({ radiusKm: 10, titleIds: [] }), save: async () => undefined },
  defaultArcadeFinderPreferences: () => ({ radiusKm: 10, titleIds: [] }),
}));
jest.mock('@/services/nearcade-client', () => ({ fetchNearcadeDiscover: (input: unknown) => mockDiscover(input), fetchNearcadeGameTitles: async () => [], searchNearcadeShops: (...args: Parameters<typeof searchNearcadeShops>) => mockShopSearch(...args) }));
jest.mock('@/services/arcade-place-search', () => ({ searchArcadePlaces: (...args: Parameters<typeof searchArcadePlaces>) => mockPlaceSearch(...args), resolveArcadePlace: (...args: Parameters<typeof resolveArcadePlace>) => mockResolvePlace(...args) }));
jest.mock('@/state/session-store', () => ({ useSession: (select: (state: unknown) => unknown) => select({ activeGameId: 'maimai' }) }));
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle, getForegroundAbortSignal: () => mockForeground.signal }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({}) }));
jest.mock('@/utils/acquire-arcade-gps-origin', () => ({ acquireArcadeGpsOrigin: () => mockGps() }));
jest.mock('@/utils/open-arcade-navigation', () => ({ openArcadeNavigation: jest.fn() }));

const origin = (latitude: number): ArcadeOrigin => ({ latitude, longitude: 120, source: 'custom', label: String(latitude) });
beforeEach(() => {
  jest.resetAllMocks(); mockDiscover.mockResolvedValue([]);
  mockLifecycle = { foregroundReady: true, foregroundGeneration: 1 }; mockForeground = new AbortController();
  mockShopSearch.mockResolvedValue({ shops: [], totalCount: 0, page: 1, hasNextPage: false });
  mockPlaceSearch.mockResolvedValue([]);
  mockResolvePlace.mockImplementation(async place => place.coordinate!);
});

async function chooseOrigin(view: Awaited<ReturnType<typeof render>>, latitude: number) {
  const candidate = { ...shop, ...origin(latitude), name: `选中位置${latitude}` };
  mockShopSearch.mockResolvedValueOnce({ shops: [candidate], totalCount: 1, page: 1, hasNextPage: false });
  await fireEvent.changeText(view.getByLabelText('机厅搜索'), candidate.name);
  await waitFor(() => expect(view.getByText(candidate.name)).toBeTruthy());
  await fireEvent.press(view.getByText(candidate.name));
}
afterEach(() => { jest.useRealTimers(); });
it.each(['resolve', 'reject'] as const)('手动选址后旧 GPS %s 不改变新原点或显示错误', async outcome => {
  let resolve!: (value: ArcadeOrigin) => void, reject!: (error: Error) => void;
  mockGps.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(mockGps).toHaveBeenCalledTimes(1));
  await chooseOrigin(view, 31);
  await waitFor(() => expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ latitude: 31 })));
  await act(async () => { if (outcome === 'resolve') resolve(origin(22)); else reject(new Error('permission')); });
  expect(mockDiscover).toHaveBeenCalledTimes(1);
  expect(view.queryByText('需要定位权限才能查找附近机厅')).toBeNull();
});
it('后发 GPS 优先，卸载后结果不启动查询', async () => {
  const pending: ((value: ArcadeOrigin) => void)[] = [];
  mockGps.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(pending).toHaveLength(1));
  await act(async () => { mockGpsPress(); });
  await act(async () => { pending[1]!(origin(31)); pending[0]!(origin(22)); });
  await waitFor(() => expect(mockDiscover).toHaveBeenCalledTimes(1));
  expect(mockDiscover).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 31 }));
  await act(async () => { mockGpsPress(); });
  await view.unmount();
  await act(async () => { pending[2]!(origin(40)); });
  expect(mockDiscover).toHaveBeenCalledTimes(1);
});

const shop: ArcadeShop = { id: 1, name: '测试机厅', latitude: 31, longitude: 120,
  distanceKm: 1, addressDetailed: '测试路', addressGeneral: [], comment: '', games: [], openingHours: [] };

it('card and pin selection stay linked without starting another nearby request', async () => {
  mockGps.mockResolvedValue(origin(31)); mockDiscover.mockResolvedValue([shop]);
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(view.getByText(shop.name)).toBeTruthy());
  jest.useFakeTimers();
  await act(async () => { mockMap.onGestureStart(); mockMap.onCenterChange(origin(32)); });
  await fireEvent.press(view.getByText(shop.name));
  await act(async () => { jest.advanceTimersByTime(500); });
  expect(mockMap.selectedShopId).toBe(shop.id);
  expect(mockMap.camera?.center).toMatchObject({ latitude: shop.latitude, longitude: shop.longitude });
  const count = mockDiscover.mock.calls.length;
  await act(async () => { mockMap.onSelectShop(shop); });
  expect(mockMap.selectedShopId).toBe(shop.id);
  expect(mockDiscover.mock.calls.length).toBe(count);
});

it('denied location keeps map selection usable; only the final settled center is queried', async () => {
  mockGps.mockRejectedValue(new Error('permission'));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(view.getByText('定位未获授权，可拖动地图或设置搜索位置')).toBeTruthy());
  expect(mockMap.camera).toBeNull();
  jest.useFakeTimers();
  await act(async () => { mockMap.onGestureStart(); mockMap.onCenterChange(origin(30)); });
  await act(async () => { jest.advanceTimersByTime(300); mockMap.onGestureStart(); mockMap.onCenterChange(origin(32)); });
  await act(async () => { jest.advanceTimersByTime(499); });
  expect(mockDiscover).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ latitude: 32 }));
});

it('late discovery cannot overwrite a newer center, including after unmount', async () => {
  mockGps.mockResolvedValue(origin(31));
  let resolve!: (value: ArcadeShop[]) => void;
  mockDiscover.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(mockDiscover).toHaveBeenCalled());
  const signal = (mockDiscover.mock.calls[0][0] as { signal: AbortSignal }).signal;
  await chooseOrigin(view, 32);
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve([shop]); });
  expect(view.queryByText(shop.name)).toBeNull();
  await view.unmount();
  expect((mockDiscover.mock.calls.at(-1)![0] as { signal: AbortSignal }).signal.aborted).toBe(true);
});

it('accepts GPS after the permission dialog briefly deactivates the app, but ignores results after backgrounding', async () => {
  const pending: ((value: ArcadeOrigin) => void)[] = [];
  mockGps.mockImplementation(() => new Promise(resolve => { pending.push(resolve); }));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(pending).toHaveLength(1));
  mockLifecycle = { foregroundReady: false, foregroundGeneration: 1 };
  await view.rerender(<ArcadeFinderScreen />);
  await act(async () => { pending[0](origin(31)); });
  mockLifecycle = { foregroundReady: true, foregroundGeneration: 1 };
  await view.rerender(<ArcadeFinderScreen />);
  await waitFor(() => expect(mockDiscover).toHaveBeenCalledWith(expect.objectContaining({ latitude: 31 })));
  await act(async () => { mockGpsPress(); });
  await act(async () => { mockForeground.abort(); pending[1](origin(40)); });
  expect(mockMap.camera?.center.latitude).toBe(31);
  expect(mockDiscover).toHaveBeenCalledTimes(1);
});

it('debounces candidates, keeps shop results on place failure, and preserves a cross-city selection', async () => {
  mockGps.mockRejectedValue(new Error('permission'));
  const destination = { ...shop, id: 88, name: '跨城机厅', latitude: 22.54, longitude: 114.06 };
  mockShopSearch.mockResolvedValue({ shops: [destination], totalCount: 1, page: 1, hasNextPage: false });
  mockPlaceSearch.mockRejectedValue(new Error('地点搜索失败，请重试'));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(view.getByText('定位未获授权，可拖动地图或设置搜索位置')).toBeTruthy());
  jest.useFakeTimers();
  await fireEvent.changeText(view.getByLabelText('机厅搜索'), '深圳');
  await act(async () => { jest.advanceTimersByTime(349); });
  expect(mockShopSearch).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(1); });
  expect(view.getByText('地点搜索失败，请重试')).toBeTruthy();
  expect(view.getByText(destination.name)).toBeTruthy();
  await fireEvent.press(view.getByText(destination.name));
  expect(view.getByLabelText('机厅搜索').props.value).toBe('');
  expect(mockMap.selectedShopId).toBe(destination.id);
  expect(mockMap.camera?.center).toMatchObject({ latitude: 22.54, longitude: 114.06 });
  expect(mockDiscover).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 22.54, longitude: 114.06 }));
  expect(view.getByText(destination.name)).toBeTruthy();
  expect(mockMap.shops).toEqual([expect.objectContaining({ id: 88, distanceKm: 0 })]);
  expect(mockShopSearch.mock.calls[0][0].signal?.aborted).toBe(true);
});

it('paginates shops and rejects a late page after changing game filters', async () => {
  mockGps.mockResolvedValue(origin(31));
  let finishPage!: (value: Awaited<ReturnType<typeof searchNearcadeShops>>) => void;
  mockShopSearch.mockResolvedValueOnce({ shops: [shop], totalCount: 60, page: 1, hasNextPage: true })
    .mockResolvedValueOnce({ shops: [{ ...shop, id: 2, name: '第二页机厅' }], totalCount: 60, page: 2, hasNextPage: true })
    .mockImplementationOnce(() => new Promise(resolve => { finishPage = resolve; }))
    .mockResolvedValueOnce({ shops: [{ ...shop, id: 3, name: '筛选后的机厅' }], totalCount: 1, page: 1, hasNextPage: false });
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(mockDiscover).toHaveBeenCalled());
  await fireEvent.changeText(view.getByLabelText('机厅搜索'), '上海');
  await waitFor(() => expect(view.getByText('继续加载机厅')).toBeTruthy());
  await fireEvent.press(view.getByText('继续加载机厅'));
  expect(mockShopSearch).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '上海', page: 2, titleIds: [] }));
  await waitFor(() => expect(view.getByText('第二页机厅')).toBeTruthy());
  expect(view.getByText(shop.name)).toBeTruthy();
  await fireEvent.press(view.getByText('继续加载机厅'));
  const oldSignal = mockShopSearch.mock.calls.at(-1)![0].signal!;
  await act(async () => { mockFilter.onTitleIdsChange([3]); });
  await waitFor(() => expect(view.getByText('筛选后的机厅')).toBeTruthy());
  expect(oldSignal.aborted).toBe(true);
  expect(mockShopSearch).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '上海', titleIds: [3] }));
  await act(async () => { finishPage({ shops: [{ ...shop, id: 2, name: '迟到分页' }], totalCount: 40, page: 2, hasNextPage: false }); });
  expect(view.queryByText('迟到分页')).toBeNull();
  expect(mockPlaceSearch).toHaveBeenCalledTimes(1);
  const searchCount = mockShopSearch.mock.calls.length;
  await act(async () => { mockFilter.onRadiusChange(20); });
  expect(mockShopSearch.mock.calls.length).toBe(searchCount);
});

it('keeps places available when shop search fails and retries a failed geocoding selection', async () => {
  mockGps.mockRejectedValue(new Error('permission'));
  mockShopSearch.mockRejectedValue(new Error('network'));
  const place = { id: 'city', name: '上海市', address: '中国上海', city: '上海', coordinate: null };
  mockPlaceSearch.mockResolvedValue([place]);
  mockResolvePlace.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ latitude: 31.2, longitude: 121.4 });
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(mockGps).toHaveBeenCalled());
  await fireEvent.changeText(view.getByLabelText('机厅搜索'), '上海');
  await waitFor(() => expect(view.getByText('机厅搜索失败，请重试')).toBeTruthy());
  await fireEvent.press(view.getByText(place.name));
  expect(view.getByText('地点定位失败，请重试')).toBeTruthy();
  await fireEvent.press(view.getByText('重试地点定位'));
  await waitFor(() => expect(mockMap.camera?.center).toMatchObject({ latitude: 31.2, longitude: 121.4 }));
  expect(view.getByLabelText('机厅搜索').props.value).toBe('');
  expect(mockMap.selectedShopId).toBeNull();
});

it('retries place search independently and ignores geocoding after a newer selection', async () => {
  mockGps.mockResolvedValue(origin(31));
  mockPlaceSearch.mockRejectedValueOnce(new Error('地点搜索失败，请重试'));
  const place = { id: 'station', name: '外地车站', address: '测试市', city: '测试市', coordinate: null };
  mockPlaceSearch.mockResolvedValue([place]);
  let finishLocation!: (value: { latitude: number; longitude: number }) => void;
  mockResolvePlace.mockImplementationOnce(() => new Promise(resolve => { finishLocation = resolve; }));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(mockDiscover).toHaveBeenCalled());
  await fireEvent.changeText(view.getByLabelText('机厅搜索'), '车站');
  await waitFor(() => expect(view.getByText('重试地点搜索')).toBeTruthy());
  await fireEvent.press(view.getByText('重试地点搜索'));
  await waitFor(() => expect(view.getByText(place.name)).toBeTruthy());
  expect(mockShopSearch).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByText(place.name));
  expect(view.getByLabelText('机厅搜索').props.value).toBe('');
  expect(view.getByText('正在定位外地车站…')).toBeTruthy();
  const oldSignal = mockResolvePlace.mock.calls[0][1]!;
  await chooseOrigin(view, 40);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => { finishLocation({ latitude: 22, longitude: 113 }); });
  expect(mockMap.camera?.center.latitude).toBe(40);
  expect(mockDiscover).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 40 }));
});
