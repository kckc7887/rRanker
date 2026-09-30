import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { GamePickerSheet } from '@/components/GamePickerSheet';
import { GameAccountsScreen } from '@/screens/GameAccountsScreen';
import { findGame, findProvider, isCredentialProvider } from '@/domain/game-bind-options';
import { ProviderError } from '@/providers/errors';
import { useSession } from '@/state/session-store';
import { invalidateResourceWrites, resourceWriteGeneration } from '@/services/snapshot-cache-utils';
import type { RizlineSave } from '@/domain/rizline';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle';

let mockLifecycle: AppLifecycleSnapshot;
jest.mock('@/state/app-lifecycle', () => ({
  ...jest.requireActual<typeof import('@/state/app-lifecycle')>('@/state/app-lifecycle'),
  useAppLifecycle: () => mockLifecycle,
}));

const mockSession = { mode: 'rizline', phone: '13800000000', token: 'private-credential', deviceId: 'test-device', channelId: '1', persistable: true } as const;
const mockPlayer = { userId: 'official-user', username: '律动玩家', totalRks: 135.4321 };
const mockSave = { ...mockPlayer, myBest: [], levelsRks: [] };
const mockLogin = jest.fn(async (_phone: string, _code: string, _signal?: AbortSignal) => ({ session: mockSession, player: mockPlayer, save: mockSave }));
const mockPasswordLogin = jest.fn(async (_phone: string, _password: string, _signal?: AbortSignal) => ({ session: mockSession, player: mockPlayer, save: mockSave }));
const mockWritePassword = jest.fn(async (_id: string, _password: string) => undefined);
const mockDeletePassword = jest.fn(async (_id: string) => undefined);
const mockCacheSave = jest.fn(async (_id: string, _save: RizlineSave, _signal?: AbortSignal) => undefined);
const mockSendCode = jest.fn(async () => ({ retryAfterSeconds: 60, confirmed: true }));
const mockUpsert = jest.fn(async (_value: unknown, _signal?: AbortSignal) => 'rizline-credential');
const mockRemove = jest.fn(async (_id: string) => undefined);
const mockClear = jest.fn(async (_id: string) => undefined);
const mockCancelQueries = jest.fn(async (_filters: unknown) => undefined);
const mockRemoveQueries = jest.fn((_filters: unknown) => undefined);
const mockNotification = jest.fn((_input: { actions?: { label: string; onPress?: () => void }[] }) => undefined);
const mockShowNotification = jest.fn();

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({ router: { canDismiss: () => false, navigate: jest.fn(), push: jest.fn() } }));
jest.mock('@/providers/rizline-provider', () => ({
  RizlineProvider: class {
    login = mockLogin;
    loginWithPassword = mockPasswordLogin;
    sendVerificationCode = mockSendCode;
  },
  isRizlineNeedsSmsError: (error: unknown) => Boolean(error && typeof error === 'object' && 'needsCode' in error && (error as { needsCode?: boolean }).needsCode),
}));
jest.mock('@/storage/rizline-password-store', () => ({
  writeRizlinePassword: (id: string, password: string) => mockWritePassword(id, password),
  deleteRizlinePassword: (id: string) => mockDeletePassword(id),
}));
jest.mock('@/storage/secure-session-store', () => {
  const actual = jest.requireActual<typeof import('@/storage/secure-session-store')>('@/storage/secure-session-store');
  return { ...actual, SecureSessionStore: class {
    upsertAccount = (value: unknown, signal?: AbortSignal) => mockUpsert(value, signal);
    removeAccount = (id: string) => mockRemove(id);
    setActiveAccountId = jest.fn(async () => undefined); } };
});
jest.mock('@/services/rizline-service', () => ({ clearRizlineAccount: (id: string) => mockClear(id),
  cacheRizlineSave: (id: string, save: RizlineSave, signal?: AbortSignal) => mockCacheSave(id, save, signal) }));
jest.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: class {
  clear = jest.fn(async () => undefined); getLatest = jest.fn(async () => null); getResource = jest.fn(async () => null);
} }));
jest.mock('@/state/query-client', () => ({ queryClient: {
  invalidateQueries: jest.fn(async () => undefined), cancelQueries: (filters: unknown) => mockCancelQueries(filters),
  removeQueries: (filters: unknown) => mockRemoveQueries(filters),
} }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({ clearGameUserData: jest.fn(async () => undefined) }) }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showActionNotification: mockNotification, showNotification: mockShowNotification }) }));
jest.mock('@/services/account-thumbnail', () => ({ hydrateAccountDisplayData: jest.fn(async () => undefined), persistBoundAccountThumbnail: jest.fn(async () => undefined) }));
jest.mock('@/components/TufPlayerPickerSheet', () => ({ TufPlayerPickerSheet: () => null }));
jest.mock('@/components/PhiraPlayerPickerSheet', () => ({ PhiraPlayerPickerSheet: () => null }));
jest.mock('@/components/MuseDashPlayerPickerSheet', () => ({ MuseDashPlayerPickerSheet: () => null }));
jest.mock('@/components/RenameLocalAccountSheet', () => ({ RenameLocalAccountSheet: () => null }));

beforeEach(() => {
  jest.clearAllMocks(); useSession.getState().finishRestore(null);
  mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
});

test('selects the official SMS source through the game picker', async () => {
  const onSelectProvider = jest.fn();
  const screen = await render(<GamePickerSheet visible mode="bind" expandedGameId="rizline" onClose={jest.fn()}
    onToggleGame={jest.fn()} onSelectProvider={onSelectProvider} onSelectUnavailableGame={jest.fn()} />);
  expect(screen.getByText('Rizline')).toBeTruthy();
  expect(isCredentialProvider('rizline-official')).toBe(true);
  expect(findProvider('rizline-official')?.detail).toBe('手机号验证码或账密登录');
  await fireEvent.press(screen.getByText('官方账号'));
  expect(onSelectProvider).toHaveBeenCalledWith('rizline', expect.objectContaining({
    id: 'rizline-official', bindingKind: 'sms-code', detail: '手机号验证码或账密登录',
  }));
  await screen.unmount();
});

test('blocks password submission while password cleanup owns the panel', async () => {
  useSession.getState().setSession(mockSession, { gameId: 'rizline', providerId: 'rizline-official',
    accountId: `rizline:official:${mockPlayer.userId}`, playerId: mockPlayer.userId, displayName: mockPlayer.username, rating: null, credentialId: 'credential' });
  let finish!: () => void;
  mockDeletePassword.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve; }); });
  const game = findGame('rizline')!;
  const sheet = await render(<ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={jest.fn()} />);
  await fireEvent.press(sheet.getByText('使用账号密码登录'));
  await fireEvent.changeText(sheet.getByLabelText('手机号'), mockSession.phone);
  await fireEvent.changeText(sheet.getByLabelText('密码'), 'password');
  await fireEvent.press(sheet.getByText('清除本机密码'));
  expect(sheet.getByLabelText('密码').props.editable).toBe(false);
  await fireEvent.press(sheet.getByText('账密登录并验证'));
  await fireEvent.press(sheet.getByText('清除本机密码'));
  await fireEvent.press(sheet.getByText('使用验证码登录'));
  expect(mockPasswordLogin).not.toHaveBeenCalled(); expect(mockDeletePassword).toHaveBeenCalledTimes(1);
  expect(sheet.queryByLabelText('验证码')).toBeNull();
  await act(async () => { finish(); });
  await waitFor(() => expect(sheet.getByLabelText('密码').props.editable).toBe(true));
  await sheet.unmount();
});

test('an old cleanup cannot unlock a newer login after backgrounding', async () => {
  useSession.getState().setSession(mockSession, { gameId: 'rizline', providerId: 'rizline-official',
    accountId: `rizline:official:${mockPlayer.userId}`, playerId: mockPlayer.userId, displayName: mockPlayer.username, rating: null, credentialId: 'credential' });
  let finishCleanup!: () => void;
  mockDeletePassword.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finishCleanup = resolve; }); });
  let finishLogin!: (value: { session: typeof mockSession; player: typeof mockPlayer; save: typeof mockSave }) => void;
  mockPasswordLogin.mockImplementationOnce(() => new Promise(resolve => { finishLogin = resolve; }));
  const game = findGame('rizline')!; const success = jest.fn();
  const view = () => <ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={success} />;
  const sheet = await render(view());
  await fireEvent.press(sheet.getByText('使用账号密码登录'));
  await fireEvent.press(sheet.getByText('清除本机密码'));
  mockLifecycle = { ...mockLifecycle, phase: 'background', foregroundReady: false, appState: 'background' };
  await sheet.rerender(view());
  mockLifecycle = { ...mockLifecycle, phase: 'foreground-ready', foregroundReady: true, appState: 'active', foregroundGeneration: 2 };
  await sheet.rerender(view());
  await fireEvent.changeText(sheet.getByLabelText('手机号'), mockSession.phone);
  await fireEvent.changeText(sheet.getByLabelText('密码'), 'password');
  await fireEvent.press(sheet.getByText('账密登录并验证'));
  await waitFor(() => expect(mockPasswordLogin).toHaveBeenCalledTimes(1));
  await act(async () => { finishCleanup(); });
  expect(sheet.getByLabelText('密码').props.editable).toBe(false);
  await fireEvent.press(sheet.getByText('使用验证码登录'));
  expect(sheet.queryByLabelText('验证码')).toBeNull(); expect(success).not.toHaveBeenCalled();
  await act(async () => { finishLogin({ session: mockSession, player: mockPlayer, save: mockSave }); });
  await waitFor(() => expect(success).toHaveBeenCalledTimes(1));
  await sheet.unmount();
});

test('binds through the real login sheet, invalidates old account requests, and exposes unlink in management', async () => {
  const onSuccess = jest.fn(); const game = findGame('rizline')!;
  const accountId = `rizline:official:${mockPlayer.userId}`;
  const generation = resourceWriteGeneration(`account:${accountId}`);
  const sheet = await render(<ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={onSuccess} />);
  await fireEvent.changeText(sheet.getByLabelText('手机号'), mockSession.phone);
  await fireEvent.changeText(sheet.getByLabelText('验证码'), '123456');
  await fireEvent.press(sheet.getByText('登录并同步账号'));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(mockLogin).toHaveBeenCalledWith(mockSession.phone, '123456', expect.any(AbortSignal));
  expect(mockCacheSave).toHaveBeenCalledWith(accountId, mockSave, expect.any(AbortSignal));
  expect(mockUpsert.mock.invocationCallOrder[0]).toBeLessThan(mockCacheSave.mock.invocationCallOrder[0]);
  expect(JSON.stringify(mockUpsert.mock.calls[0][0])).not.toContain('123456');
  expect(mockCancelQueries).toHaveBeenCalledTimes(1);
  expect(mockRemoveQueries).toHaveBeenCalledTimes(1);
  expect(resourceWriteGeneration(`account:${accountId}`)).toBe(generation + 1);
  expect(useSession.getState()).toMatchObject({ activeAccountId: accountId, activeGameId: 'rizline', session: mockSession });
  expect(useSession.getState().boundAccounts[0]).toMatchObject({ displayName: '律动玩家', scoreDisplay: '135.4321' });
  await sheet.unmount();
  const management = await render(<GameAccountsScreen />);
  expect(management.getByText('135.4321')).toBeTruthy();
  await fireEvent.press(management.getByLabelText('解除绑定 律动玩家'));
  const keepAction = mockNotification.mock.calls[0][0].actions?.find(action => action.label === '确认解绑并保留个人数据');
  expect(keepAction).toBeDefined();
  await act(async () => { keepAction?.onPress?.(); });
  await waitFor(() => expect(mockRemove).toHaveBeenCalledWith(accountId));
  expect(mockClear).toHaveBeenCalledWith(accountId);
  expect(useSession.getState().boundAccounts).toEqual([]);
  await management.unmount();
});

test.each(['login', 'query cancellation'] as const)('does not recreate cleared account data while awaiting %s', async phase => {
  let complete!: () => void;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  if (phase === 'login') mockLogin.mockImplementationOnce(async () => { await pending; return { session: mockSession, player: mockPlayer, save: mockSave }; });
  else mockCancelQueries.mockImplementationOnce(async () => { await pending; });
  const onSuccess = jest.fn(); const game = findGame('rizline')!;
  const sheet = await render(<ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={onSuccess} />);
  await fireEvent.changeText(sheet.getByLabelText('手机号'), mockSession.phone);
  await fireEvent.changeText(sheet.getByLabelText('验证码'), '123456');
  await fireEvent.press(sheet.getByText('登录并同步账号'));
  await waitFor(() => expect(phase === 'login' ? mockLogin : mockCancelQueries).toHaveBeenCalled());
  invalidateResourceWrites(phase === 'login' ? 'rizline' : `account:rizline:official:${mockPlayer.userId}`);
  await act(async () => { complete(); await pending; });
  expect(mockUpsert).not.toHaveBeenCalled(); expect(mockCacheSave).not.toHaveBeenCalled(); expect(onSuccess).not.toHaveBeenCalled();
  expect(useSession.getState().boundAccounts).toEqual([]);
  await sheet.unmount();
});

test('binds through password login, encrypts the password separately, and omits it from the session payload', async () => {
  const onSuccess = jest.fn(); const game = findGame('rizline')!;
  const accountId = `rizline:official:${mockPlayer.userId}`;
  const sheet = await render(<ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={onSuccess} />);
  await fireEvent.press(sheet.getByText('使用账号密码登录'));
  await fireEvent.changeText(sheet.getByLabelText('手机号'), mockSession.phone);
  await fireEvent.changeText(sheet.getByLabelText('密码'), 'secret-password');
  await fireEvent.press(sheet.getByText('账密登录并验证'));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(mockPasswordLogin).toHaveBeenCalledWith(mockSession.phone, 'secret-password', expect.any(AbortSignal));
  expect(mockLogin).not.toHaveBeenCalled();
  expect(JSON.stringify(mockUpsert.mock.calls[0][0])).not.toContain('secret-password');
  expect(JSON.stringify(useSession.getState().session)).not.toContain('secret-password');
  expect(mockWritePassword).toHaveBeenCalledWith(accountId, 'secret-password');
  await sheet.unmount();
});

test('switches back to SMS without sending a code when password login requires verification', async () => {
  mockPasswordLogin.mockRejectedValueOnce(new ProviderError('authentication', '请改用验证码登录', false, { needsCode: true }));
  const onSuccess = jest.fn(); const game = findGame('rizline')!;
  const sheet = await render(<ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={onSuccess} />);
  await fireEvent.press(sheet.getByText('使用账号密码登录'));
  await fireEvent.changeText(sheet.getByLabelText('手机号'), mockSession.phone);
  await fireEvent.changeText(sheet.getByLabelText('密码'), 'secret-password');
  await fireEvent.press(sheet.getByText('账密登录并验证'));
  await waitFor(() => expect(sheet.getByText('请改用验证码登录')).toBeTruthy());
  expect(sheet.getByText('登录并同步账号')).toBeTruthy();
  expect(mockSendCode).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
  expect(mockWritePassword).not.toHaveBeenCalled();
  await sheet.unmount();
});

test.each(['cache', 'password'] as const)('keeps the valid binding and reports recovery when the auxiliary %s save fails', async phase => {
  if (phase === 'cache') mockCacheSave.mockRejectedValueOnce(new Error('cache unavailable'));
  else mockWritePassword.mockRejectedValueOnce(new Error('keychain unavailable'));
  const onSuccess = jest.fn(); const game = findGame('rizline')!;
  const sheet = await render(<ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={onSuccess} />);
  await fireEvent.press(sheet.getByText('使用账号密码登录'));
  await fireEvent.changeText(sheet.getByLabelText('手机号'), mockSession.phone);
  await fireEvent.changeText(sheet.getByLabelText('密码'), 'secret-password');
  await fireEvent.press(sheet.getByText('账密登录并验证'));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
  expect(useSession.getState().activeAccountId).toBe(`rizline:official:${mockPlayer.userId}`);
  expect(useSession.getState().session).toEqual(mockSession);
  expect(mockShowNotification).toHaveBeenCalledTimes(1);
  expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '账号已绑定', variant: 'warning' }));
  expect(sheet.queryByText('登录失败，请稍后重试。')).toBeNull();
  await sheet.unmount();
});

test('handles password cleanup failure without an unhandled rejection or repeated operation', async () => {
  useSession.getState().setSession(mockSession, { gameId: 'rizline', providerId: 'rizline-official',
    accountId: `rizline:official:${mockPlayer.userId}`, playerId: mockPlayer.userId, displayName: mockPlayer.username, rating: null, credentialId: 'credential' });
  let reject!: (reason: unknown) => void;
  const pending = new Promise<void>((_resolve, fail) => { reject = fail; });
  mockDeletePassword.mockImplementationOnce(async () => { await pending; return undefined; });
  const game = findGame('rizline')!;
  const sheet = await render(<ProviderLoginSheet visible provider={game.providers[0]} gameId="rizline" gameTitle="Rizline" onClose={jest.fn()} onSuccess={jest.fn()} />);
  await fireEvent.press(sheet.getByText('使用账号密码登录'));
  await fireEvent.press(sheet.getByText('清除本机密码'));
  await fireEvent.press(sheet.getByText('清除本机密码'));
  expect(mockDeletePassword).toHaveBeenCalledTimes(1);
  await act(async () => { reject(new Error('cleanup unavailable')); });
  await waitFor(() => expect(sheet.getByText('无法清除本机密码，请稍后重试。')).toBeTruthy());
  await sheet.unmount();
});
