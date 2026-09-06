import { jest } from '@jest/globals';
import {
  initializeRuntimeDiagnostics,
  recordRuntimeDiagnostic,
  sanitizeRuntimeDiagnosticEvent,
  trimRuntimeDiagnosticStore,
  snapshotRuntimeDiagnostics,
  exportRuntimeDiagnostics,
  type RuntimeDiagnosticEvent,
} from '@/services/runtime-diagnostics';

const mockFiles = new Map<string, string>();
const mockWriteState = { active: 0, maximum: 0 };
const mockAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_uri: string, _options: unknown) => undefined);

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.0.0-test' } },
}));
jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;

    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }

    get exists(): boolean {
      return mockFiles.has(this.uri);
    }

    async text(): Promise<string> {
      return mockFiles.get(this.uri) ?? '';
    }

    async write(value: string): Promise<void> {
      mockWriteState.active += 1;
      mockWriteState.maximum = Math.max(mockWriteState.maximum, mockWriteState.active);
      await Promise.resolve();
      mockFiles.set(this.uri, value);
      mockWriteState.active -= 1;
    }
  },
  Paths: { cache: 'cache' },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (uri: string, options: unknown) => mockShare(uri, options),
}));

function event(at: string): RuntimeDiagnosticEvent {
  return {
    at,
    type: 'lifecycle',
    platform: 'ios',
    appVersion: '0.0.0-test',
  };
}

describe('本地运行诊断', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    mockWriteState.active = 0;
    mockWriteState.maximum = 0;
  });

  it('只保留允许的字段并拒绝敏感值', () => {
    const result = sanitizeRuntimeDiagnosticEvent('task', {
      gameType: 'maimai',
      providerType: 'https://example.com/token',
      taskPhase: 'raw error text with spaces',
      accountCount: 2,
      queryCount: -1,
      ...({ token: 'secret', playerName: 'Alice', accountId: '123' } as object),
    }, '2026-08-28T00:00:00.000Z');

    expect(result).toMatchObject({
      at: '2026-08-28T00:00:00.000Z',
      type: 'task',
      gameType: 'maimai',
      accountCount: 2,
    });
    expect(result).not.toHaveProperty('providerType');
    expect(result).not.toHaveProperty('taskPhase');
    expect(result).not.toHaveProperty('queryCount');
    expect(result).not.toHaveProperty('token');
    expect(result).not.toHaveProperty('playerName');
    expect(result).not.toHaveProperty('accountId');
  });

  it('只保留最近三次会话和最多 256 条事件', () => {
    const trimmed = trimRuntimeDiagnosticStore({
      sessions: Array.from({ length: 4 }, (_, sessionIndex) => ({
        startedAt: `session-${sessionIndex}`,
        events: Array.from({ length: 100 }, (_, eventIndex) => event(`${sessionIndex}-${eventIndex}`)),
      })),
    });

    expect(trimmed.sessions.map((session) => session.startedAt)).toEqual(['session-1', 'session-2', 'session-3']);
    expect(trimmed.sessions.reduce((sum, session) => sum + session.events.length, 0)).toBe(256);
    expect(trimmed.sessions[0]?.events[0]?.at).toBe('1-44');
  });

  it('并发记录时串行写入且不丢失事件', async () => {
    await initializeRuntimeDiagnostics();
    await Promise.all(Array.from({ length: 20 }, (_, index) => recordRuntimeDiagnostic('task', {
      taskPhase: `phase-${index}`,
    })));

    expect(mockWriteState.maximum).toBe(1);
    const saved = JSON.parse(mockFiles.get('cache/rranker-runtime-diagnostics.json') ?? '{}') as {
      sessions?: { events: RuntimeDiagnosticEvent[] }[];
    };
    expect(saved.sessions?.at(-1)?.events).toHaveLength(20);
  });

  it('将快照排在已提交事件之后并隔离后续事件和读取方修改', async () => {
    const before = recordRuntimeDiagnostic('task', { taskPhase: 'before' });
    const pending = snapshotRuntimeDiagnostics();
    const after = recordRuntimeDiagnostic('task', { taskPhase: 'after' });
    const snapshot = await pending;
    await Promise.all([before, after]);
    expect(snapshot.sessions.at(-1)?.events.map((item) => item.taskPhase)).toEqual(['before']);
    snapshot.sessions[0]!.events.length = 0;
    const next = await snapshotRuntimeDiagnostics();
    expect(next.sessions.at(-1)?.events.map((item) => item.taskPhase)).toEqual(['before', 'after']);
  });

  it('没有诊断文件时返回空记录', async () => {
    expect(await snapshotRuntimeDiagnostics()).toEqual({ sessions: [] });
  });

  it('分享诊断信息时固定内容并防止重复打开分享面板', async () => {
    await recordRuntimeDiagnostic('task', { taskPhase: 'before-share' });
    let complete = () => {};
    let entered = () => {};
    const panelOpened = new Promise<void>((resolve) => { entered = resolve; });
    mockShare.mockImplementationOnce(async () => {
      await recordRuntimeDiagnostic('task', { taskPhase: 'share-panel' });
      return new Promise<undefined>((resolve) => {
        complete = () => resolve(undefined);
        entered();
      });
    });
    const pending = exportRuntimeDiagnostics();
    await exportRuntimeDiagnostics();
    await panelOpened;
    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith('cache/rranker-runtime-diagnostics.txt', expect.objectContaining({ dialogTitle: '分享诊断信息' }));
    const exported = JSON.parse(mockFiles.get('cache/rranker-runtime-diagnostics.txt')!);
    expect(exported.sessions.at(-1).events.map((item: RuntimeDiagnosticEvent) => item.taskPhase)).toEqual(['before-share']);
    complete();
    await pending;
  });

  it('分享不可用或失败后可以重试', async () => {
    mockAvailable.mockResolvedValueOnce(false);
    await expect(exportRuntimeDiagnostics()).rejects.toThrow();
    mockShare.mockRejectedValueOnce(new Error('share failed'));
    await expect(exportRuntimeDiagnostics()).rejects.toThrow('share failed');
    await exportRuntimeDiagnostics();
    expect(mockShare).toHaveBeenCalledTimes(2);
  });
});
