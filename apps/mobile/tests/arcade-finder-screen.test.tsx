import { act, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ArcadeOrigin } from '@/domain/arcade-shops';
import ArcadeFinderScreen from '../app/tools/arcade-finder';

const mockGps = jest.fn<() => Promise<ArcadeOrigin>>();
const mockDiscover = jest.fn(async (_input: unknown) => []);
let mockSelect: (origin: ArcadeOrigin) => void;
let mockGpsPress: () => void;
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }) }));
jest.mock('@/components/ArcadeBusinessStatusLabel', () => ({ ArcadeBusinessStatusLabel: () => null }));
jest.mock('@/components/Card', () => ({ Card: () => null }));
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
beforeEach(() => { jest.clearAllMocks(); });
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
