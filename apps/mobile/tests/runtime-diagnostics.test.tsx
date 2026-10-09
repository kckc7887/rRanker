import { jest } from '@jest/globals';
import { Share } from 'react-native';
import { cleanupOrphanedTemporaryStorage } from '@/features/storage-management/storage-cache-maintenance';
import type { RuntimeDiagnosticEvent } from '@/services/runtime-diagnostics';

let runtime: typeof import('@/services/runtime-diagnostics');
let recorder: typeof import('@/services/runtime-diagnostics-recorder');

const mockFiles = new Map<string, string>();
const mockWriteState = { active: 0, maximum: 0 };
const mockRead = jest.fn(async (_uri: string) => undefined);
const mockWrite = jest.fn(async (_uri: string, _value: string) => undefined);
const mockDelete = jest.fn((_uri: string) => undefined);
const mockMove = jest.fn((_source: string, _destination: string) => undefined);
const mockAvailable = jest.fn(async () => true);
const mockShare = jest.fn(async (_uri: string, _options: unknown) => undefined);
const mockTextShare = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '0.0.0-test' } },
}));
jest.mock('expo-file-system', () => {
  class File {
    uri: string;

    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }

    get exists(): boolean {
      return mockFiles.has(this.uri);
    }

    get name(): string {
      return this.uri.split('/').at(-1)!;
    }

    async text(): Promise<string> {
      await mockRead(this.uri);
      return mockFiles.get(this.uri) ?? '';
    }

    async write(value: string): Promise<void> {
      mockWriteState.active += 1;
      mockWriteState.maximum = Math.max(mockWriteState.maximum, mockWriteState.active);
      try {
        await mockWrite(this.uri, value);
        mockFiles.set(this.uri, value);
      } finally { mockWriteState.active -= 1; }
    }

    delete(): void {
      mockDelete(this.uri);
      mockFiles.delete(this.uri);
    }

    move(destination: File): void {
      mockMove(this.uri, destination.uri);
      if (!mockFiles.has(this.uri) || mockFiles.has(destination.uri)) throw new Error('invalid move');
      mockFiles.set(destination.uri, mockFiles.get(this.uri)!);
      mockFiles.delete(this.uri);
      this.uri = destination.uri;
    }
  }
  return {
    File,
    Directory: class {
      uri: string;

      constructor(...parts: string[]) {
        this.uri = parts.join('/');
      }

      get exists(): boolean {
        return [...mockFiles.keys()].some((path) => path.startsWith(`${this.uri}/`));
      }

      list(): File[] {
        return [...mockFiles.keys()]
          .filter((path) => path.startsWith(`${this.uri}/`) && !path.slice(this.uri.length + 1).includes('/'))
          .map((path) => new File(path));
      }
    },
    Paths: { cache: 'cache', document: 'document', join: (...parts: string[]) => parts.join('/') },
  };
});
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async (uri: string) => ({
    exists: mockFiles.has(uri) || [...mockFiles.keys()].some(path => path.startsWith(`${uri}/`)),
    isDirectory: !mockFiles.has(uri),
    modificationTime: 0,
  }),
  readDirectoryAsync: async (uri: string) => [...new Set([...mockFiles.keys()]
    .filter(path => path.startsWith(`${uri}/`)).map(path => path.slice(uri.length + 1).split('/')[0]))],
  readAsStringAsync: async (uri: string) => {
    await mockRead(uri);
    return mockFiles.get(uri) ?? '';
  },
  writeAsStringAsync: async (uri: string, value: string) => {
    mockWriteState.active += 1;
    mockWriteState.maximum = Math.max(mockWriteState.maximum, mockWriteState.active);
    try {
      await mockWrite(uri, value);
      mockFiles.set(uri, value);
    } finally { mockWriteState.active -= 1; }
  },
  deleteAsync: async (uri: string) => {
    mockDelete(uri);
    for (const path of mockFiles.keys()) if (path === uri || path.startsWith(`${uri}/`)) mockFiles.delete(path);
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    mockMove(from, to);
    if (!mockFiles.has(from) || mockFiles.has(to)) throw new Error('invalid move');
    mockFiles.set(to, mockFiles.get(from)!);
    mockFiles.delete(from);
  },
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => mockAvailable(),
  shareAsync: (uri: string, options: unknown) => mockShare(uri, options),
}));
jest.mock('@/features/best-image/maimai-font-cache', () => ({ MAIMAI_FONT_CACHE_VERSION: 'test' }));
jest.mock('@/features/best-image/maimai-ui-cache', () => ({ MAIMAI_UI_CACHE_VERSION: 'test' }));
jest.mock('@/features/phigros-best-image/phigros-font-cache', () => ({ PHIGROS_FONT_CACHE_VERSION: 'test' }));
jest.mock('@/services/remote-image-cache', () => ({ pruneRemoteImageCache: jest.fn() }));

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
    jest.isolateModules(() => {
      runtime = jest.requireActual<typeof runtime>('@/services/runtime-diagnostics');
      recorder = jest.requireActual<typeof recorder>('@/services/runtime-diagnostics-recorder');
    });
  });

  it('只保留允许的字段并拒绝敏感值', () => {
    const result = runtime.sanitizeRuntimeDiagnosticEvent('task', {
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
    const trimmed = runtime.trimRuntimeDiagnosticStore({
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
    await runtime.initializeRuntimeDiagnostics();
    mockWrite.mockClear();
    await Promise.all(Array.from({ length: 20 }, (_, index) => runtime.recordRuntimeDiagnostic('task', {
      taskPhase: `phase-${index}`,
    })));

    expect(mockWriteState.maximum).toBe(1);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(mockFiles.get('document/rranker-runtime-diagnostics.json') ?? '{}') as {
      sessions?: { events: RuntimeDiagnosticEvent[] }[];
    };
    expect(saved.sessions?.at(-1)?.events).toHaveLength(20);
  });

  it('将快照排在已提交事件之后并隔离后续事件和读取方修改', async () => {
    const before = runtime.recordRuntimeDiagnostic('task', { taskPhase: 'before' });
    const pending = runtime.snapshotRuntimeDiagnostics();
    const after = runtime.recordRuntimeDiagnostic('task', { taskPhase: 'after' });
    const snapshot = await pending;
    await Promise.all([before, after]);
    expect(snapshot.sessions.at(-1)?.events.map((item) => item.taskPhase)).toEqual(['before']);
    snapshot.sessions[0]!.events.length = 0;
    const next = await runtime.snapshotRuntimeDiagnostics();
    expect(next.sessions.at(-1)?.events.map((item) => item.taskPhase)).toEqual(['before', 'after']);
  });

  it('没有诊断文件时返回空记录', async () => {
    expect(await runtime.snapshotRuntimeDiagnostics()).toEqual({ sessions: [] });
  });

  it('分享诊断信息时固定内容并防止重复打开分享面板', async () => {
    await runtime.recordRuntimeDiagnostic('task', { taskPhase: 'before-share' });
    let complete = () => {};
    let entered = () => {};
    const panelOpened = new Promise<void>((resolve) => { entered = resolve; });
    mockShare.mockImplementationOnce(async () => {
      await runtime.recordRuntimeDiagnostic('task', { taskPhase: 'share-panel' });
      return new Promise<undefined>((resolve) => {
        complete = () => resolve(undefined);
        entered();
      });
    });
    const pending = runtime.exportRuntimeDiagnostics();
    await runtime.exportRuntimeDiagnostics();
    await panelOpened;
    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith('cache/rranker-runtime-diagnostics.txt', expect.objectContaining({ dialogTitle: '分享诊断信息' }));
    const exported = JSON.parse(mockFiles.get('cache/rranker-runtime-diagnostics.txt')!);
    expect(exported.sessions.at(-1).events.map((item: RuntimeDiagnosticEvent) => item.taskPhase)).toEqual(['before-share']);
    complete();
    await pending;
  });

  it('分享文件不可用或失败时退回原生文本分享并可重试', async () => {
    mockAvailable.mockResolvedValueOnce(false);
    await expect(runtime.exportRuntimeDiagnostics()).resolves.toBeUndefined();
    expect(mockTextShare).toHaveBeenCalledTimes(1);
    mockShare.mockRejectedValueOnce(new Error('share failed'));
    await expect(runtime.exportRuntimeDiagnostics()).resolves.toBeUndefined();
    expect(mockTextShare).toHaveBeenCalledTimes(2);
    await runtime.exportRuntimeDiagnostics();
    expect(mockShare).toHaveBeenCalledTimes(2);
  });
  it('存储不可用时保留有界脱敏错误且诊断导出仍可使用', async () => {
    mockFiles.set('document/rranker-runtime-diagnostics.json', '{}');
    mockRead.mockRejectedValue(new Error('locked'));
    mockWrite.mockRejectedValue(new Error('locked'));
    for (let index = 0; index < 100; index++) recorder.recordRuntimeError('theme-preferences', new Error('private-token player Alice'), false, { phase: 'write' });
    const events = recorder.snapshotEmergencyRuntimeDiagnostics();
    expect(events).toHaveLength(64);
    expect(JSON.stringify(events)).not.toMatch(/private-token|Alice/u);
    await runtime.exportRuntimeDiagnostics();
    expect(mockTextShare).toHaveBeenCalled();
    expect(JSON.parse(mockTextShare.mock.calls.at(-1)![0].message!).storageAvailable).toBe(false);
    mockRead.mockReset().mockResolvedValue(undefined);
    mockWrite.mockReset().mockResolvedValue(undefined);
  });
});

describe('诊断正文持久化与替换', () => {
  const documentPath = 'document/rranker-runtime-diagnostics.json';
  const previousPath = `${documentPath}.previous`;
  const pendingPath = `${documentPath}.pending`;
  let runtime: typeof import('@/services/runtime-diagnostics');

  function launch() {
    jest.isolateModules(() => {
      runtime = jest.requireActual<typeof import('@/services/runtime-diagnostics')>('@/services/runtime-diagnostics');
    });
  }

  function storedSession(startedAt: string) {
    return { startedAt, events: [event(startedAt)] };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    mockRead.mockReset().mockResolvedValue(undefined);
    mockWrite.mockReset().mockResolvedValue(undefined);
    mockDelete.mockReset().mockReturnValue(undefined);
    mockMove.mockReset().mockReturnValue(undefined);
    mockWriteState.active = 0;
    mockWriteState.maximum = 0;
    launch();
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('bounds export reads and freezes emergency events before an unresolved storage operation', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    mockFiles.set(documentPath, JSON.stringify({ sessions: [] }));
    mockRead.mockImplementationOnce(() => new Promise<undefined>((resolve) => { release = () => resolve(undefined); }));
    void runtime.recordRuntimeDiagnostic('task', { taskPhase: 'before-export' });
    const pending = runtime.snapshotRuntimeDiagnosticsForExport();
    void runtime.recordRuntimeDiagnostic('task', { taskPhase: 'after-export' });
    try {
      await jest.advanceTimersByTimeAsync(1_500);
      const exported = await pending;
      expect(exported.storageAvailable).toBe(false);
      expect(exported.emergency.map((entry) => entry.fields.taskPhase)).toContain('before-export');
      expect(exported.emergency.map((entry) => entry.fields.taskPhase)).not.toContain('after-export');
      expect(JSON.stringify(exported)).not.toContain('private');
    } finally {
      release();
      await runtime.snapshotRuntimeDiagnostics();
      jest.useRealTimers();
    }
  });

  it('不读取旧缓存正文，启动清理直接删除该临时文件', async () => {
    const path = 'cache/rranker-runtime-diagnostics.json';
    mockFiles.set(path, JSON.stringify({ sessions: [storedSession('old')] }));
    await runtime.initializeRuntimeDiagnostics();
    const snapshot = await runtime.snapshotRuntimeDiagnostics();
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0]?.events).toEqual([]);
    expect(mockRead.mock.calls.map(([uri]) => uri)).not.toContain(path);
    await cleanupOrphanedTemporaryStorage();
    expect(mockFiles.has(path)).toBe(false);
    expect(mockFiles.has(documentPath)).toBe(true);
  });

  it('已提交正文优先于替换副本并且重复初始化不重复添加会话', async () => {
    const current = storedSession('2026-09-07T00:00:00.000Z');
    mockFiles.set(documentPath, JSON.stringify({ sessions: [current] }));
    mockFiles.set(previousPath, JSON.stringify({ sessions: [storedSession('previous')] }));
    await runtime.initializeRuntimeDiagnostics();
    await runtime.initializeRuntimeDiagnostics();
    const snapshot = await runtime.snapshotRuntimeDiagnostics();
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.sessions[0]).toEqual(current);
    expect(mockRead.mock.calls.map(([uri]) => uri)).not.toContain(previousPath);
    expect(mockFiles.has(previousPath)).toBe(false);
  });

  it.each([documentPath, previousPath])('读取 %s 失败时保留正文并允许重新初始化', async (path) => {
    const previous = storedSession('2026-09-06T00:00:00.000Z');
    const contents = JSON.stringify({ sessions: [previous] });
    mockFiles.set(path, contents);
    mockRead.mockRejectedValueOnce(new Error('read failed'));
    await runtime.initializeRuntimeDiagnostics();
    expect(mockFiles.get(path)).toBe(contents);
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    await runtime.initializeRuntimeDiagnostics();
    expect((await runtime.snapshotRuntimeDiagnostics()).sessions[0]).toEqual(previous);
  });

  it('暂存部分写入失败不会破坏正文，重启忽略未完成暂存并可重试', async () => {
    const previous = storedSession('2026-09-06T00:00:00.000Z');
    const contents = JSON.stringify({ sessions: [previous] });
    mockFiles.set(documentPath, contents);
    mockWrite.mockImplementationOnce(async (uri) => {
      mockFiles.set(uri, '{');
      throw new Error('ENOSPC');
    });
    await runtime.initializeRuntimeDiagnostics();
    expect(mockFiles.get(documentPath)).toBe(contents);
    expect(mockFiles.get(pendingPath)).toBe('{');
    expect(mockMove).not.toHaveBeenCalled();
    expect(await runtime.snapshotRuntimeDiagnostics()).toEqual({ sessions: [previous] });
    launch();
    expect(await runtime.snapshotRuntimeDiagnostics()).toEqual({ sessions: [previous] });
    await runtime.initializeRuntimeDiagnostics();
    expect((await runtime.snapshotRuntimeDiagnostics()).sessions[0]).toEqual(previous);
    expect(mockFiles.has(pendingPath)).toBe(false);
  });

  it.each(['missing', 'partial'])('暂存替换导致正文 %s 后从上一份正文恢复，重启不读取未提交暂存', async (primary) => {
    const previous = storedSession('2026-09-06T00:00:00.000Z');
    const contents = JSON.stringify({ sessions: [previous] });
    mockFiles.set(documentPath, contents);
    mockMove.mockImplementation((source, destination) => {
      if (source === pendingPath) {
        if (primary === 'partial') mockFiles.set(destination, '{');
        throw new Error('replace failed');
      }
      return undefined;
    });
    await runtime.initializeRuntimeDiagnostics();
    expect(mockFiles.has(documentPath)).toBe(primary === 'partial');
    expect(mockFiles.get(previousPath)).toBe(contents);
    expect(mockFiles.has(pendingPath)).toBe(true);
    expect(await runtime.snapshotRuntimeDiagnostics()).toEqual({ sessions: [previous] });
    mockMove.mockReset().mockReturnValue(undefined);
    launch();
    expect(await runtime.snapshotRuntimeDiagnostics()).toEqual({ sessions: [previous] });
    await runtime.initializeRuntimeDiagnostics();
    expect((await runtime.snapshotRuntimeDiagnostics()).sessions[0]).toEqual(previous);
    expect(mockFiles.has(documentPath)).toBe(true);
    expect(mockFiles.has(pendingPath)).toBe(false);
    expect(mockFiles.has(previousPath)).toBe(false);
  });

  it.each(['missing', 'invalid'])('正文 %s 时替换失败仍保留唯一有效副本', async (primary) => {
    const previous = storedSession('2026-09-06T00:00:00.000Z');
    const contents = JSON.stringify({ sessions: [previous] });
    mockFiles.set(previousPath, contents);
    if (primary === 'invalid') mockFiles.set(documentPath, '{');
    mockMove.mockImplementationOnce(() => { throw new Error('replace failed'); });
    await runtime.initializeRuntimeDiagnostics();
    expect(mockFiles.get(previousPath)).toBe(contents);
    expect(await runtime.snapshotRuntimeDiagnostics()).toEqual({ sessions: [previous] });
    await runtime.initializeRuntimeDiagnostics();
    expect((await runtime.snapshotRuntimeDiagnostics()).sessions[0]).toEqual(previous);
    expect(mockFiles.has(previousPath)).toBe(false);
  });

  it('清空缓存并重启后仍保留最近三次启动和最多 256 条事件', async () => {
    for (let index = 0; index < 4; index += 1) {
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(`2026-09-0${index + 1}T00:00:00.000Z`);
      launch();
      await runtime.initializeRuntimeDiagnostics();
      await Promise.all(Array.from({ length: 100 }, () => runtime.recordRuntimeDiagnostic('task', { taskPhase: `launch-${index}` })));
      for (const path of mockFiles.keys()) if (path.startsWith('cache/')) mockFiles.delete(path);
      jest.restoreAllMocks();
    }
    const snapshot = await runtime.snapshotRuntimeDiagnostics();
    expect(snapshot.sessions.map((session) => session.startedAt)).toEqual([
      '2026-09-02T00:00:00.000Z', '2026-09-03T00:00:00.000Z', '2026-09-04T00:00:00.000Z',
    ]);
    expect(snapshot.sessions.reduce((sum, session) => sum + session.events.length, 0)).toBe(256);
    expect(mockWriteState.maximum).toBe(1);
  });
});
