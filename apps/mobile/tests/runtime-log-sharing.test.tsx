import { jest } from '@jest/globals';
import { runtimeLogs, shareRuntimeLog } from '@/services/runtime-logs';

const mockFiles = new Map<string, string>();
const mockAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_uri: string, _options: unknown) => undefined);
const diagnostics = { sessions: [{ startedAt: '2026-09-06T10:00:00Z', events: [] }] };
const mockDiagnostics = jest.fn(async () => diagnostics);
const log = { formatVersion: 1, session: { id: 7 }, context: {}, entries: [], summary: { retainedCount: 0 }, snapshotAt: '2026-09-06T10:00:00Z' };
jest.mock('@/services/runtime-diagnostics', () => ({ snapshotRuntimeDiagnostics: () => mockDiagnostics() }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '0.0.0-test' } } }));
jest.mock('@/storage/rranker-database', () => ({}));
jest.mock('@/storage/runtime-log-preferences-store', () => ({ runtimeLogPreferencesStore: {} }));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(...parts: string[]) { this.uri = parts.join('/'); }
    write(value: string) { mockFiles.set(this.uri, value); }
  },
  Paths: { cache: 'cache' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (uri: string, options: unknown) => mockShare(uri, options),
}));

describe('manual log sharing', () => {
  beforeEach(() => { mockFiles.clear(); jest.clearAllMocks(); });
  afterEach(() => jest.restoreAllMocks());

  it('freezes contents before awaiting the platform and ignores concurrent share requests', async () => {
    const snapshot = jest.spyOn(runtimeLogs, 'snapshot').mockReturnValue(JSON.stringify(log));
    let resolve: (value: typeof diagnostics) => void = () => undefined;
    mockDiagnostics.mockImplementationOnce(() => new Promise<typeof diagnostics>((done) => { resolve = done; }));
    const pending = shareRuntimeLog(7);
    expect(snapshot).toHaveBeenCalledWith(7);
    expect(mockDiagnostics).toHaveBeenCalledTimes(1);
    expect(mockAvailable).not.toHaveBeenCalled();
    snapshot.mockReturnValue(JSON.stringify({ ...log, entries: ['later events'] }));
    await shareRuntimeLog(8);
    expect(snapshot).toHaveBeenCalledTimes(1);
    resolve(diagnostics);
    await pending;
    expect(JSON.parse([...mockFiles.values()][0]!)).toEqual({ ...log, diagnostics });
    expect(mockDiagnostics).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith(expect.stringMatching(/^cache\/rranker-runtime-log-7-.*\.txt$/u), expect.objectContaining({ mimeType: 'text/plain' }));
  });

  it('retries after an unavailable or failed share and creates distinct temporary files', async () => {
    jest.spyOn(runtimeLogs, 'snapshot').mockReturnValue(JSON.stringify(log));
    mockAvailable.mockResolvedValueOnce(false);
    await expect(shareRuntimeLog(1)).rejects.toThrow();
    expect(mockFiles.size).toBe(0);
    mockShare.mockRejectedValueOnce(new Error('share failed'));
    await expect(shareRuntimeLog(1)).rejects.toThrow();
    await shareRuntimeLog(1);
    expect(mockFiles.size).toBe(2);
    expect(mockShare).toHaveBeenCalledTimes(2);
  });

  it('shares older logs without requiring new summary fields', async () => {
    const older = { formatVersion: 1, session: { id: 1 }, context: { appVersion: 'old' }, entries: [{ type: 'task' }] };
    jest.spyOn(runtimeLogs, 'snapshot').mockReturnValue(JSON.stringify(older));
    await shareRuntimeLog(1);
    expect(JSON.parse([...mockFiles.values()][0]!)).toEqual({ ...older, diagnostics });
  });

  it('releases the share guard when diagnostic snapshotting fails', async () => {
    jest.spyOn(runtimeLogs, 'snapshot').mockReturnValue(JSON.stringify(log));
    mockDiagnostics.mockRejectedValueOnce(new Error('diagnostics unavailable'));
    await expect(shareRuntimeLog(7)).rejects.toThrow('diagnostics unavailable');
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
    await shareRuntimeLog(7);
    expect(mockShare).toHaveBeenCalledTimes(1);
  });
});
