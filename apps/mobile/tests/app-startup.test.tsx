import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { Appearance } from 'react-native';
import { useAppStartup } from '@/hooks/use-app-startup';

let mockRestoreStatus = 'restoring';
const mockHydrateTheme = jest.fn<() => Promise<void>>();
const mockHydrateDebug = jest.fn<() => Promise<void>>();
const mockTheme = { hydrated: false, appearance: 'system', hydrate: mockHydrateTheme };
const mockDebug = { hydrated: false, testAccountsEnabled: false, hydrate: mockHydrateDebug };
const mockFonts = jest.fn<() => Promise<void>>();
const mockRestore = jest.fn<() => Promise<void>>();
const mockDiagnostics = jest.fn<() => Promise<void>>();
const mockLogs = jest.fn<() => Promise<void>>();

jest.mock('@/state/session-store', () => ({ useSession: (select: (state: unknown) => unknown) => select({ restoreStatus: mockRestoreStatus }) }));
jest.mock('@/state/theme-store', () => ({ useThemeStore: (select: (state: unknown) => unknown) => select(mockTheme) }));
jest.mock('@/state/debug-store', () => ({ useDebugStore: (select: (state: unknown) => unknown) => select(mockDebug) }));
jest.mock('@/features/storage-management/ui-icon-fonts', () => ({ ensureUiIconFontsLoaded: () => mockFonts() }));
jest.mock('@/services/account-restoration', () => ({ restoreAppAccounts: () => mockRestore() }));
jest.mock('@/services/runtime-diagnostics', () => ({ initializeRuntimeDiagnostics: () => mockDiagnostics() }));
jest.mock('@/services/runtime-logs', () => ({ initializeRuntimeLogs: () => mockLogs() }));
jest.mock('@/utils/startup-timing', () => ({ startTimer: () => () => undefined }));

describe('app startup gates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestoreStatus = 'restoring';
    mockTheme.hydrated = false;
    mockTheme.appearance = 'system';
    mockDebug.hydrated = false;
    mockDebug.testAccountsEnabled = false;
    for (const action of [mockFonts, mockRestore, mockDiagnostics, mockLogs, mockHydrateTheme, mockHydrateDebug]) action.mockResolvedValue(undefined);
    jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('waits for accounts, theme and fonts while an unread debug preference stays disabled', async () => {
    let finishFonts!: () => void;
    mockFonts.mockReturnValue(new Promise<void>((resolve) => { finishFonts = resolve; }));
    mockHydrateDebug.mockReturnValue(new Promise<void>(() => undefined));
    const hook = await renderHook(() => useAppStartup());
    expect(hook.result.current).toBe(false);
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(mockHydrateTheme).toHaveBeenCalledTimes(1);
    expect(mockHydrateDebug).toHaveBeenCalledTimes(1);
    expect(Appearance.setColorScheme).toHaveBeenCalledWith(null);
    mockRestoreStatus = 'ready';
    await hook.rerender(undefined);
    expect(hook.result.current).toBe(false);
    mockTheme.hydrated = true;
    await hook.rerender(undefined);
    expect(hook.result.current).toBe(false);
    await act(() => { finishFonts(); });
    expect(hook.result.current).toBe(true);
    expect(mockDebug).toMatchObject({ hydrated: false, testAccountsEnabled: false });
    await hook.rerender(undefined);
    expect(mockDiagnostics).toHaveBeenCalledTimes(1);
    expect(mockLogs).toHaveBeenCalledTimes(1);
    expect(mockRestore).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });

  it('permits the recovery UI after account or font failures and ignores diagnostic/debug initialization failures', async () => {
    mockRestoreStatus = 'error';
    mockTheme.hydrated = true;
    mockFonts.mockRejectedValue(new Error('font unavailable'));
    mockLogs.mockRejectedValue(new Error('log unavailable'));
    mockHydrateDebug.mockRejectedValue(new Error('preference unavailable'));
    const hook = await renderHook(() => useAppStartup());
    expect(hook.result.current).toBe(true);
    expect(mockRestore).not.toHaveBeenCalled();
    mockTheme.appearance = 'dark';
    await hook.rerender(undefined);
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('dark');
    expect(mockFonts).toHaveBeenCalledTimes(1);
    expect(mockHydrateTheme).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });
});
