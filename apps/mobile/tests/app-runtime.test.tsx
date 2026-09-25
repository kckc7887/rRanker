import { jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { InteractionManager } from 'react-native';
import type { AppLifecycleSnapshot } from '@/state/app-lifecycle-core';
import { useAppRuntime } from '@/hooks/use-app-runtime';

const mockState = { restoreStatus: 'ready', activeAccountId: 'maimai:local', activeGameId: 'maimai', activeProviderId: 'local', boundAccounts: [] };
let mockLifecycle: AppLifecycleSnapshot;
let mockController: AbortController;
const mockFocus = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockCancelQueries = jest.fn(async () => undefined);
const mockReleaseQueries = jest.fn();
const mockClearMemory = jest.fn(async () => true);
const mockHydrate = jest.fn(async (_signal?: AbortSignal) => undefined);
const mockMaintenance = jest.fn(async () => undefined);
const mockActiveGame = jest.fn(async (_gameId: string) => undefined);
const mockRecord = jest.fn(async () => undefined);
const mockRoute = jest.fn();
const mockRetryPendingRotationWrites = jest.fn(async () => 0);

jest.mock('@tanstack/react-query', () => ({ focusManager: { setFocused: (value: unknown) => mockFocus(value) } }));
jest.mock('expo-image', () => ({ Image: { clearMemoryCache: () => mockClearMemory() } }));
jest.mock('expo-router', () => ({ useSegments: () => ['(tabs)', '(overview)'] }));
jest.mock('@/hooks/use-game-resource-sync', () => ({ useGameResourceSync: () => undefined }));
jest.mock('@/state/session-store', () => ({
  useSession: Object.assign((select: (state: unknown) => unknown) => select(mockState), { getState: () => mockState }),
  retryPendingRotationWrites: () => mockRetryPendingRotationWrites(),
}));
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => mockLifecycle, getForegroundAbortSignal: () => mockController.signal }));
jest.mock('@/state/query-client', () => ({ queryClient: { cancelQueries: () => mockCancelQueries(), getQueryCache: () => ({ getAll: () => [] }) }, releaseInactiveQueries: () => mockReleaseQueries() }));
jest.mock('@/features/storage-management/storage-cache-maintenance', () => ({ runStorageCacheMaintenance: () => mockMaintenance() }));
jest.mock('@/services/remote-image-cache', () => ({ markRemoteImageCacheGameActive: (gameId: string) => mockActiveGame(gameId) }));
jest.mock('@/services/account-thumbnail', () => ({ hydrateAccountDisplayData: (signal: AbortSignal) => mockHydrate(signal) }));
jest.mock('@/services/runtime-diagnostics', () => ({ recordRuntimeDiagnostic: () => mockRecord() }));
jest.mock('@/services/upload-maimai-from-friend-code', () => ({ uploadTaskController: { pause: () => mockPause(), resume: () => mockResume() } }));
jest.mock('@/services/runtime-logs', () => ({ recordRuntimeRoute: (segments: unknown) => mockRoute(segments) }));

type Task = { callback: () => void; cancelled: boolean };
let tasks: Task[];
async function flushInteractions() {
  const pending = tasks.splice(0);
  await act(() => { for (const task of pending) if (!task.cancelled) task.callback(); });
}

describe('app runtime lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tasks = [];
    mockState.restoreStatus = 'ready'; mockState.activeAccountId = 'maimai:local'; mockState.activeGameId = 'maimai';
    mockController = new AbortController();
    mockLifecycle = { appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 1, memoryWarningGeneration: 0 };
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      const task: Task = { callback: callback as () => void, cancelled: false };
      tasks.push(task);
      return { cancel: () => { task.cancelled = true; } } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('hydrates once per foreground generation and runs startup maintenance once', async () => {
    const firstSignal = mockController.signal;
    const hook = await renderHook(() => useAppRuntime(true));
    await flushInteractions();
    expect(mockHydrate).toHaveBeenCalledWith(firstSignal);
    expect(mockMaintenance).toHaveBeenCalledTimes(1);
    expect(mockRoute).toHaveBeenCalledWith(['(tabs)', '(overview)']);
    mockState.activeAccountId = 'maimai:local:second';
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockHydrate).toHaveBeenCalledTimes(1);
    expect(mockActiveGame).toHaveBeenCalledTimes(2);
    mockController.abort();
    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false };
    await hook.rerender(undefined);
    mockController = new AbortController();
    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 2 };
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockHydrate).toHaveBeenCalledTimes(2);
    expect(mockHydrate).toHaveBeenLastCalledWith(mockController.signal);
    expect(mockMaintenance).toHaveBeenCalledTimes(1);
    await hook.unmount();
    expect(mockFocus).toHaveBeenLastCalledWith(undefined);
  });

  it('resumes pending credential writes only while the app is in the foreground', async () => {
    const hook = await renderHook(() => useAppRuntime(true));
    await flushInteractions();
    expect(mockRetryPendingRotationWrites).toHaveBeenCalledTimes(1);

    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background', foregroundReady: false };
    await hook.rerender(undefined);
    expect(mockRetryPendingRotationWrites).toHaveBeenCalledTimes(1);

    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 2 };
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockRetryPendingRotationWrites).toHaveBeenCalledTimes(2);
    await hook.unmount();
  });

  it('reschedules hydration interrupted by inactive within the same foreground generation', async () => {
    const hook = await renderHook(() => useAppRuntime(true));
    mockLifecycle = { ...mockLifecycle, appState: 'inactive', phase: 'inactive', foregroundReady: false };
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockHydrate).not.toHaveBeenCalled();
    expect(mockMaintenance).not.toHaveBeenCalled();
    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true };
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockHydrate).toHaveBeenCalledTimes(1);
    expect(mockMaintenance).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });

  it('keeps inactive, background cancellation and memory pressure as separate events', async () => {
    const hook = await renderHook(() => useAppRuntime(true));
    await flushInteractions();
    mockLifecycle = { ...mockLifecycle, appState: 'inactive', phase: 'inactive', foregroundReady: false };
    await hook.rerender(undefined);
    expect(mockFocus).toHaveBeenLastCalledWith(false);
    expect(mockPause).not.toHaveBeenCalled();
    expect(mockCancelQueries).not.toHaveBeenCalled();
    expect(mockReleaseQueries).not.toHaveBeenCalled();
    expect(mockClearMemory).not.toHaveBeenCalled();
    mockController.abort();
    mockLifecycle = { ...mockLifecycle, appState: 'background', phase: 'background' };
    await hook.rerender(undefined);
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockCancelQueries).toHaveBeenCalledTimes(1);
    expect(mockClearMemory).not.toHaveBeenCalled();
    mockLifecycle = { ...mockLifecycle, memoryWarningGeneration: 1 };
    await hook.rerender(undefined);
    expect(mockReleaseQueries).toHaveBeenCalledTimes(1);
    expect(mockClearMemory).toHaveBeenCalledTimes(1);
    mockController = new AbortController();
    mockLifecycle = { ...mockLifecycle, appState: 'active', phase: 'foreground-ready', foregroundReady: true, foregroundGeneration: 2 };
    await hook.rerender(undefined);
    expect(mockReleaseQueries).toHaveBeenCalledTimes(1);
    expect(mockClearMemory).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });

  it('waits for restoration and foreground readiness before account hydration', async () => {
    mockState.restoreStatus = 'restoring';
    mockLifecycle = { ...mockLifecycle, phase: 'foreground-waiting', foregroundReady: false };
    const hook = await renderHook(() => useAppRuntime(false));
    await flushInteractions();
    expect(mockHydrate).not.toHaveBeenCalled();
    expect(mockMaintenance).not.toHaveBeenCalled();
    mockState.restoreStatus = 'ready';
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockHydrate).not.toHaveBeenCalled();
    mockLifecycle = { ...mockLifecycle, phase: 'foreground-ready', foregroundReady: true };
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockHydrate).toHaveBeenCalledTimes(1);
    expect(mockMaintenance).not.toHaveBeenCalled();
    await hook.unmount();
  });

  it('does not maintain storage when the startup recovery UI is ready after a restore error', async () => {
    mockState.restoreStatus = 'error';
    const hook = await renderHook(() => useAppRuntime(true));
    await flushInteractions();
    expect(mockMaintenance).not.toHaveBeenCalled();
    expect(mockHydrate).not.toHaveBeenCalled();
    mockState.restoreStatus = 'ready';
    await hook.rerender(undefined);
    await flushInteractions();
    expect(mockMaintenance).toHaveBeenCalledTimes(1);
    expect(mockHydrate).toHaveBeenCalledTimes(1);
    await hook.unmount();
  });
});
