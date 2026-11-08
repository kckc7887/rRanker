import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MajdataLoginPanel } from '@rranker/provider-majdata-net/components/majdata/MajdataLoginPanel';
import { GameAccountsScreen } from '@/screens/GameAccountsScreen';
import { AccountSwitchSheet } from '@rranker/sdk/components/AccountSwitchSheet';
import { BoundAccountGroupedList } from '@rranker/sdk/components/BoundAccountGroupedList';
import { GamePickerSheet } from '@rranker/sdk/components/GamePickerSheet';
import { createMajdataBoundAccount } from '@rranker/game-majdata-net/accounts';
import { createOsuBoundAccount } from '@rranker/game-osu/accounts';
import { groupBoundAccountGameIds } from '@rranker/sdk/domain/bound-account';
import { getGameOptions, findGame, isCredentialProvider } from '@rranker/sdk/domain/game-bind-options';
import { useSession } from '@rranker/sdk/state/session-store';
import { switchBoundAccount } from '@rranker/sdk/services/switch-bound-account';
import { hydrateAccountDisplayData } from '@rranker/sdk/services/account-hydration';
import { persistBoundAccountThumbnail } from '@rranker/sdk/services/account-thumbnail';
import { adapter as majdataAdapter } from '@rranker/game-majdata-net';

const mockSession = { mode: 'http-cookies', origin: 'https://majdata.net', persistable: true,
  cookies: [{ name: 'auth', value: 'test-cookie', path: '/', secure: true }] } as const;
const mockUpsert = jest.fn(async (_input: unknown, _signal?: AbortSignal) => 'credential:first');
const mockRemove = jest.fn(async (_id: string) => undefined);
const mockClear = jest.fn(async (_id: string) => undefined);
const mockPersistActive = jest.fn(async (_id: string | null) => undefined);
const mockNotification = jest.fn((_input: { actions?: { label: string; onPress?: () => void }[] }) => undefined);
const mockLogin = jest.fn(async (_credentials: unknown, _signal?: AbortSignal) => mockSession);
const mockGetPlayer = jest.fn(async () => ({ username: '玩家 A&B' }));

jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: jest.requireActual<typeof import('react-native')>('react-native').View }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ router: { canDismiss: () => false, navigate: jest.fn(), push: jest.fn() } }));
jest.mock('@rranker/provider-majdata-net/providers/majdata-provider', () => ({ MajdataProvider: class { login = mockLogin; getPlayer = mockGetPlayer; } }));
jest.mock('@rranker/sdk/storage/secure-session-store', () => {
  const actual = jest.requireActual<typeof import('@rranker/sdk/storage/secure-session-store')>('@rranker/sdk/storage/secure-session-store');
  return { ...actual, SecureSessionStore: class {
    upsertAccount = (input: unknown, signal?: AbortSignal) => mockUpsert(input, signal);
    removeAccount = (id: string) => mockRemove(id); setActiveAccountId = (id: string | null) => mockPersistActive(id);
  } };
});
jest.mock('@rranker/provider-majdata-net/services/majdata-service', () => ({ clearMajdataAccount: (id: string) => mockClear(id) }));
jest.mock('@rranker/sdk/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  clear = jest.fn(async () => undefined); getLatest = jest.fn(async () => null); getResource = jest.fn(async () => null);
} }));
jest.mock('@rranker/sdk/state/query-client', () => ({ queryClient: {
  invalidateQueries: jest.fn(async () => undefined), cancelQueries: jest.fn(async () => undefined), removeQueries: jest.fn(),
} }));
jest.mock('@rranker/sdk/hooks/use-user-library', () => ({ useUserLibrary: () => ({ clearGameUserData: jest.fn(async () => undefined) }) }));
jest.mock('@rranker/sdk/components/AppNotification', () => ({
  ...jest.requireActual<typeof import('@rranker/sdk/components/AppNotification')>('@rranker/sdk/components/AppNotification'), useNotification: () => ({ showActionNotification: mockNotification, showNotification: jest.fn() }) }));
jest.mock('@rranker/sdk/services/account-hydration', () => ({ hydrateAccountDisplayData: jest.fn(async () => undefined) }));
jest.mock('@rranker/sdk/services/account-thumbnail', () => ({ persistBoundAccountThumbnail: jest.fn(async () => undefined) }));
jest.mock('@rranker/sdk/components/RemoteImage', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { RemoteImage: ({ source }: { source: unknown }) => <RN.View testID="player-avatar"><RN.Text>{String(source)}</RN.Text></RN.View> };
});
jest.mock('@rranker/sdk/components/ProviderLoginSheet', () => ({ ProviderLoginSheet: () => null }));
jest.mock('@rranker/provider-tuf/components/TufPlayerPickerSheet', () => ({ TufPlayerPickerSheet: () => null }));
jest.mock('@rranker/provider-phira-community/components/PhiraPlayerPickerSheet', () => ({ PhiraPlayerPickerSheet: () => null }));
jest.mock('@rranker/provider-musedash-moe/components/MuseDashPlayerPickerSheet', () => ({ MuseDashPlayerPickerSheet: () => null }));
jest.mock('@rranker/sdk/components/RenameAccountSheet', () => ({ RenameAccountSheet: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  useSession.getState().finishRestore(null);
});

test('login appears in real management and switch lists with the player avatar and unlink action', async () => {
  const success = jest.fn();
  const login = await render(<MajdataLoginPanel visible onSuccess={success} onBusyChange={jest.fn()} />);
  await fireEvent.changeText(login.getByLabelText('用户名'), '玩家 A&B');
  await fireEvent.changeText(login.getByLabelText('密码'), 'test-password');
  await fireEvent.press(login.getByText('账密登录并验证'));
  await waitFor(() => expect(success).toHaveBeenCalled());
  const account = useSession.getState().boundAccounts[0];
  expect(account.id).toBe('majdata-net:account:玩家 a&b');
  expect(account.avatarUrl).toBe('https://majdata.net/api3/api/account/Icon?username=%E7%8E%A9%E5%AE%B6%20A%26B');
  expect(JSON.stringify(mockUpsert.mock.calls[0][0])).not.toContain('test-password');
  expect(persistBoundAccountThumbnail).toHaveBeenCalledWith(account.id, { avatarUrl: account.avatarUrl });
  await login.unmount();
  const management = await render(<GameAccountsScreen />);
  expect(management.getByTestId(`account-card-${account.id}`)).toBeTruthy();
  expect(management.getByText(account.avatarUrl!)).toBeTruthy();
  expect(management.getByLabelText('解除绑定 玩家 A&B')).toBeTruthy();
  expect(hydrateAccountDisplayData).toHaveBeenCalled();
  await management.unmount();
  const second = createMajdataBoundAccount({ accountId: 'majdata-net:account:second', displayName: 'Second', scoreDisplay: '200.0000%' });
  await act(() => useSession.getState().upsertBoundAccount(second));
  const switcher = await render(<AccountSwitchSheet visible accounts={useSession.getState().boundAccounts}
    expandedGameId="majdata-net" activeAccountId={account.id} onClose={jest.fn()} onToggleGame={jest.fn()}
    onSelectAccount={a => { void switchBoundAccount(a.id, { navigateToOverview: false }); }} />);
  await fireEvent.press(switcher.getByLabelText('Second，DX · Classic 200.0000%，Majdata Net'));
  await waitFor(() => expect(useSession.getState().activeAccountId).toBe(second.id));
  expect(mockPersistActive).toHaveBeenCalledWith(second.id);
  expect(switcher.getByText('200.0000%')).toBeTruthy();
  await switcher.unmount();
  const unbind = await render(<GameAccountsScreen />);
  await fireEvent.press(unbind.getByLabelText('解除绑定 玩家 A&B'));
  const action = mockNotification.mock.calls[0][0].actions?.find(a => a.onPress);
  expect(action).toBeDefined();
  await act(async () => { action?.onPress?.(); });
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(account.id));
  expect(mockClear).toHaveBeenCalledWith(account.id);
  expect(useSession.getState().boundAccounts.map(a => a.id)).toEqual([second.id]);
});

test('both game pickers and bound groups place Majdata after the existing osu family', async () => {
  expect(getGameOptions().at(-2)?.id).toBe('majdata-net');
  expect(findGame('majdata-net')?.icon).toEqual(majdataAdapter.games[0].icon);
  expect(isCredentialProvider('majdata-net')).toBe(true);
  expect(isCredentialProvider('phira-community')).toBe(false);
  const accounts = getGameOptions().map(game => ({ ...createMajdataBoundAccount({ accountId: game.id, displayName: game.title }), gameId: game.id }));
  expect(groupBoundAccountGameIds(accounts)).toHaveLength(getGameOptions().length);
  expect(groupBoundAccountGameIds(accounts).at(-2)).toBe('majdata-net');
  const majdata = createMajdataBoundAccount({ accountId: 'majdata-net:account:p', displayName: 'Player', scoreDisplay: '395.6252%' });
  const osu = createOsuBoundAccount({ gameId: 'osu-standard', userId: 1, displayName: 'Osu', pp: 100 });
  await act(() => { useSession.getState().upsertBoundAccount(majdata); useSession.getState().upsertBoundAccount(osu); });
  const groups = await render(<BoundAccountGroupedList accounts={[majdata, osu]} expandedGameId="majdata-net"
    activeAccountId={majdata.id} onToggleGame={jest.fn()} />);
  const labels = groups.getAllByRole('button').map(item => item.props.accessibilityLabel);
  expect(labels.indexOf('收起游戏 osu!')).toBeLessThan(labels.indexOf('收起游戏 Majdata Net'));
  expect(groups.getByText('395.6252%')).toBeTruthy();
  expect(groups.queryByTestId('dx-rating-tag-stars')).toBeNull();
  await groups.unmount();
  const picker = await render(<GamePickerSheet visible mode="bind" expandedGameId={null}
    onClose={jest.fn()} onToggleGame={jest.fn()} onSelectProvider={jest.fn()} onSelectUnavailableGame={jest.fn()} />);
  expect(picker.getAllByText(/^(osu!|Majdata Net)$/).map(item => item.props.children)).toEqual(['osu!', 'Majdata Net']);
});
