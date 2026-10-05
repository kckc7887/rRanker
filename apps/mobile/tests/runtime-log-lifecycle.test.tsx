import { act, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { AppState, InteractionManager, Text } from 'react-native';
import type { RuntimeLogCapacity, RuntimeLogEntry, RuntimeLogStatus } from '@/domain/runtime-log';
import { AppLifecycleProvider } from '@/state/app-lifecycle';
import { subscribeAppLifecycleSnapshot } from '@/state/app-lifecycle-core';
import { initializeRuntimeLogs, runtimeLogs } from '@/services/runtime-logs';

const mockEntries: RuntimeLogEntry[] = [];
let mockCapacity: RuntimeLogCapacity = 2000;
let mockStatus: RuntimeLogStatus = 'recording';
const mockOpen = jest.fn(async () => ({ execAsync: async () => undefined }));
const mockStarts = jest.fn();
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.0.0-test' } } }));
jest.mock('@/services/runtime-diagnostics', () => ({ snapshotRuntimeDiagnosticsForExport: async () => ({ sessions: [], emergency: [], storageAvailable: true }) }));
jest.mock('@/storage/rranker-database', () => ({
  getRuntimeLogDatabase: () => mockOpen(),
  runSerializedSchemaInit: async (initialize: () => Promise<void>) => initialize(),
}));
jest.mock('@/storage/runtime-log-preferences-store', () => ({ runtimeLogPreferencesStore: {
  load: async () => ({ capacity: 2000, enabled: true }), save: async () => undefined,
} }));
jest.mock('@/storage/runtime-log-repository', () => ({
  RUNTIME_LOG_SCHEMA: '',
  RuntimeLogRepository: class {
    recover() {}
    list() { return mockEntries.length ? [{ id: 1, startedAt: mockEntries[0]!.at,
      lastAt: mockEntries.at(-1)!.at, status: mockStatus, capacity: mockCapacity, count: mockEntries.length }] : []; }
    start(capacity: RuntimeLogCapacity, _at: string, entry: RuntimeLogEntry) {
      mockStarts(); mockCapacity = capacity; mockStatus = 'recording'; mockEntries.push(entry); return 1;
    }
    appendBatch(_id: number, entries: readonly RuntimeLogEntry[]) { mockEntries.push(...entries); }
    finish(_id: number, status: RuntimeLogStatus, entry?: RuntimeLogEntry) {
      if (entry) mockEntries.push(entry);
      mockStatus = status;
    }
  },
}));

describe('runtime log AppState boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('saves pending entries before the real background handler returns and deduplicates notifications', async () => {
    let change!: (state: 'active' | 'background') => void;
    let memoryWarning!: () => void;
    const tasks: (() => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, listener: unknown) => {
      if (type === 'change') change = listener as typeof change;
      if (type === 'memoryWarning') memoryWarning = listener as typeof memoryWarning;
      return { remove: jest.fn() };
    }) as typeof AppState.addEventListener);
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(callback => {
      tasks.push(callback as () => void);
      return { cancel: jest.fn() } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });
    await initializeRuntimeLogs();
    await initializeRuntimeLogs();
    const view = await render(<AppLifecycleProvider><Text>content</Text></AppLifecycleProvider>);
    await act(() => { tasks.at(-1)!(); });
    const removeBrokenObserver = subscribeAppLifecycleSnapshot(() => { throw new Error('observer failed'); });
    try {
      runtimeLogs.record('task', { taskPhase: 'pending' });
      expect(mockEntries.some(entry => entry.fields.taskPhase === 'pending')).toBe(false);
      await act(() => {
        change('background');
        expect(mockEntries.at(-2)?.fields.taskPhase).toBe('pending');
        expect(mockEntries.at(-1)?.fields.lifecyclePhase).toBe('background');
        expect(runtimeLogs.getSnapshot().sessions[0]?.count).toBe(mockEntries.length);
      });
      await act(() => { change('background'); memoryWarning(); });
      expect(mockEntries.filter(entry => entry.fields.lifecyclePhase === 'background')).toHaveLength(1);
      runtimeLogs.record('task', { taskPhase: 'pending-again' });
      await act(() => {
        memoryWarning();
        expect(mockEntries.at(-1)?.fields.taskPhase).toBe('pending-again');
      });
      await act(() => { change('active'); tasks.at(-1)!(); });
      await act(() => {
        change('background');
        expect(mockEntries.filter(entry => entry.fields.lifecyclePhase === 'background')).toHaveLength(2);
      });
      expect(mockStarts).toHaveBeenCalledTimes(1);
      expect(mockOpen).toHaveBeenCalledTimes(1);
    } finally {
      removeBrokenObserver();
      await runtimeLogs.stop();
      await view.unmount();
    }
  });
});
