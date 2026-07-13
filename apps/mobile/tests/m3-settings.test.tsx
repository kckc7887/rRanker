import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { jest } from '@jest/globals';
import SettingsScreen from '../app/(tabs)/settings';
import { createUserDataBackup } from '@/domain/user-library';
import type { UserDataBackupV1 } from '@/domain/user-library';

const mockClearSessions = jest.fn(async () => undefined);
const mockClearSnapshots = jest.fn(async () => undefined);
const mockClearUserData = jest.fn(async () => []);
const mockRestoreBackup = jest.fn(async () => []);
const mockCreateBackup = jest.fn(async () => createUserDataBackup([], '2026-07-13T00:00:00.000Z'));
const mockPickBackup = jest.fn<() => Promise<UserDataBackupV1 | null>>();
const mockShareBackup = jest.fn<(backup: UserDataBackupV1) => Promise<void>>(async () => undefined);
const mockClearSessionState = jest.fn();
const mockRemoveQueries = jest.fn();
const mockClearOrder: string[] = [];

jest.mock('@/storage/secure-session-store', () => ({ SecureSessionStore: jest.fn(() => ({ clear: async () => {
  mockClearOrder.push('credentials');
  return mockClearSessions();
} })) }));
jest.mock('@/storage/sqlite-snapshot-repository', () => ({ SqliteSnapshotRepository: jest.fn(() => ({ clear: async () => {
  mockClearOrder.push('cache');
  return mockClearSnapshots();
} })) }));
jest.mock('@/providers/diving-fish-auth', () => ({ DivingFishAuthProvider: class {} }));
jest.mock('@/providers/diving-fish-provider', () => ({ DivingFishProvider: class {} }));
jest.mock('@/state/query-client', () => ({ queryClient: {
  invalidateQueries: jest.fn(), removeQueries: (...args: unknown[]) => mockRemoveQueries(...args),
} }));
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({
  session: null, setSession: jest.fn(), clearSession: mockClearSessionState, restoreError: null,
}) }));
jest.mock('@/hooks/use-user-library', () => ({ useUserLibrary: () => ({
  data: [], isLoading: false, clearUserData: async () => {
    mockClearOrder.push('personal');
    return mockClearUserData();
  }, restoreBackup: mockRestoreBackup, createBackup: mockCreateBackup,
}) }));
jest.mock('@/services/user-data-file-service', () => ({
  UserDataFileError: class extends Error {}, pickUserDataBackup: () => mockPickBackup(),
  shareUserDataBackup: (backup: UserDataBackupV1) => mockShareBackup(backup),
}));

describe('M3A settings data controls', () => {
  beforeEach(() => { jest.clearAllMocks(); mockClearOrder.length = 0; });

  it('asks on every clear and preserves or removes personal data as selected', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText('清除本机凭据和缓存'));
    const preserveButtons = alert.mock.calls[0][2]!;
    await act(async () => preserveButtons[1].onPress?.());
    await waitFor(() => expect(mockClearSnapshots).toHaveBeenCalledTimes(1));
    expect(mockClearUserData).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('清除本机凭据和缓存'));
    const removeButtons = alert.mock.calls[1][2]!;
    await act(async () => removeButtons[2].onPress?.());
    await waitFor(() => expect(mockClearUserData).toHaveBeenCalledTimes(1));
    expect(mockClearSessions).toHaveBeenCalledTimes(2);
    expect(mockClearSnapshots).toHaveBeenCalledTimes(2);
    expect(mockClearSessionState).toHaveBeenCalledTimes(2);
    expect(mockClearOrder).toEqual(['credentials', 'cache', 'credentials', 'cache', 'personal']);
    expect(mockRemoveQueries).toHaveBeenCalledTimes(8);
    expect(mockRemoveQueries).toHaveBeenCalledWith({ queryKey: ['detailed-catalog'] });
    expect(mockRemoveQueries).not.toHaveBeenCalledWith({ queryKey: ['user-library'] });
    alert.mockRestore();
  });

  it('continues clearing, logs out and reports the failed part when one store fails', async () => {
    mockClearSnapshots.mockRejectedValueOnce(new Error('locked'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText('清除本机凭据和缓存'));
    await act(async () => alert.mock.calls[0][2]![2].onPress?.());

    await waitFor(() => expect(screen.getByText('部分清除失败（缓存），其余项目已清除，请重试')).toBeTruthy());
    expect(mockClearUserData).toHaveBeenCalledTimes(1);
    expect(mockClearSessionState).toHaveBeenCalledTimes(1);
    expect(mockRemoveQueries).toHaveBeenCalledTimes(4);
    expect(mockClearOrder).toEqual(['credentials', 'cache', 'personal']);
    alert.mockRestore();
  });

  it('previews a validated backup and defaults to merge', async () => {
    const backup = createUserDataBackup([], '2026-07-13T00:00:00.000Z');
    mockPickBackup.mockResolvedValueOnce(backup);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText('导入个人数据备份'));
    await waitFor(() => expect(alert).toHaveBeenCalledWith('恢复个人数据', expect.stringContaining('歌曲 0 项'), expect.any(Array)));
    const buttons = alert.mock.calls.find((call) => call[0] === '恢复个人数据')![2]!;
    await act(async () => buttons[1].onPress?.());
    await waitFor(() => expect(mockRestoreBackup).toHaveBeenCalledWith(backup, 'merge'));
    alert.mockRestore();
  });

  it('exports only through the backup sharing service', async () => {
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText('导出个人数据备份'));
    await waitFor(() => expect(mockShareBackup).toHaveBeenCalledWith(expect.objectContaining({ format: 'rranker-user-data' })));
  });
});
