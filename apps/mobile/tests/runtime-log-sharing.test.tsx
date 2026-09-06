import { jest } from '@jest/globals';
import { runtimeLogs, shareRuntimeLog } from '@/services/runtime-logs';

const mockFiles = new Map<string, string>();
const mockAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_uri: string, _options: unknown) => undefined);
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
    const snapshot = jest.spyOn(runtimeLogs, 'snapshot').mockReturnValue('selected snapshot');
    let resolve: (value: boolean) => void = () => undefined;
    mockAvailable.mockImplementationOnce(() => new Promise<boolean>((done) => { resolve = done; }));
    const pending = shareRuntimeLog(7);
    expect(snapshot).toHaveBeenCalledWith(7);
    snapshot.mockReturnValue('later events');
    await shareRuntimeLog(8);
    expect(snapshot).toHaveBeenCalledTimes(1);
    resolve(true);
    await pending;
    expect([...mockFiles.values()]).toEqual(['selected snapshot']);
    expect(mockShare).toHaveBeenCalledWith(expect.stringMatching(/^cache\/rranker-runtime-log-7-.*\.txt$/u), expect.objectContaining({ mimeType: 'text/plain' }));
  });

  it('retries after an unavailable or failed share and creates distinct temporary files', async () => {
    jest.spyOn(runtimeLogs, 'snapshot').mockReturnValue('snapshot');
    mockAvailable.mockResolvedValueOnce(false);
    await expect(shareRuntimeLog(1)).rejects.toThrow();
    expect(mockFiles.size).toBe(0);
    mockShare.mockRejectedValueOnce(new Error('share failed'));
    await expect(shareRuntimeLog(1)).rejects.toThrow();
    await shareRuntimeLog(1);
    expect(mockFiles.size).toBe(2);
    expect(mockShare).toHaveBeenCalledTimes(2);
  });
});
