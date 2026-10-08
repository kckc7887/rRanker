import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ArcadeOrigin, ArcadeShop } from '@/domain/arcade-shops';
import type { ComponentProps } from 'react';
import type { ArcadeMap } from '@/components/ArcadeMap';
import ArcadeFinderScreen from '../app/tools/arcade-finder';

const mockGps = jest.fn<() => Promise<ArcadeOrigin>>();
const mockDiscover = jest.fn<(_input: unknown) => Promise<ArcadeShop[]>>(async () => []);
let mockMap: ComponentProps<typeof ArcadeMap>;
let mockSelect: (origin: ArcadeOrigin) => void;
let mockGpsPress: () => void;
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@react-navigation/elements', () => ({ useHeaderHeight: () => 0 }));
jest.mock('@/components/ArcadeMap', () => ({ ArcadeMap: (props: typeof mockMap) => { mockMap = props; return null; } }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }) }));
jest.mock('@/components/ArcadeBusinessStatusLabel', () => ({ ArcadeBusinessStatusLabel: () => null }));
jest.mock('@/components/ArcadeFilterBar', () => ({ ArcadeFilterBar: (props: { onUseGpsOrigin: () => void }) => { mockGpsPress = props.onUseGpsOrigin; return null; } }));
jest.mock('@/components/ArcadeOriginPickerSheet', () => ({ ArcadeOriginPickerSheet: (props: { onSelect: typeof mockSelect }) => { mockSelect = props.onSelect; return null; } }));
jest.mock('@/features/toolbox/arcade-finder-preferences', () => ({
  arcadeFinderPreferencesStore: { load: async () => ({ radiusKm: 10, titleIds: [] }), save: async () => undefined },
  defaultArcadeFinderPreferences: () => ({ radiusKm: 10, titleIds: [] }),
}));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: string) => value }));
jest.mock('@/services/nearcade-client', () => ({ fetchNearcadeDiscover: (input: unknown) => mockDiscover(input), fetchNearcadeGameTitles: async () => [] }));
jest.mock('@/state/session-store', () => ({ useSession: (select: (state: unknown) => unknown) => select({ activeGameId: 'maimai' }) }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({}) }));
jest.mock('@/utils/acquire-arcade-gps-origin', () => ({ acquireArcadeGpsOrigin: () => mockGps() }));
jest.mock('@/utils/open-arcade-navigation', () => ({ openArcadeNavigation: jest.fn() }));

const origin = (latitude: number): ArcadeOrigin => ({ latitude, longitude: 120, source: 'custom', label: String(latitude) });
beforeEach(() => { jest.clearAllMocks(); mockDiscover.mockResolvedValue([]); });
afterEach(() => { jest.useRealTimers(); });
it.each(['resolve', 'reject'] as const)('手动选址后旧 GPS %s 不改变新原点或显示错误', async outcome => {
  let resolve!: (value: ArcadeOrigin) => void, reject!: (error: Error) => void;
  mockGps.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = no; }));
  const view = await render(<ArcadeFinderScreen />);
  await waitFor(() => expect(mockGps).toHaveBeenCalledTimes(1));
  await act(async () => { mockSelect(origin(31)); });
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
  await act(async () => { mockSelect(origin(32)); });
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve([shop]); });
  expect(view.queryByText(shop.name)).toBeNull();
  await view.unmount();
  expect((mockDiscover.mock.calls.at(-1)![0] as { signal: AbortSignal }).signal.aborted).toBe(true);
});
