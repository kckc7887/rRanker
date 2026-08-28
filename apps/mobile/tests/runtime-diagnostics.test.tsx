import { jest } from '@jest/globals';
import {
  initializeRuntimeDiagnostics,
  recordRuntimeDiagnostic,
  sanitizeRuntimeDiagnosticEvent,
  trimRuntimeDiagnosticStore,
  type RuntimeDiagnosticEvent,
} from '@/services/runtime-diagnostics';

const mockFiles = new Map<string, string>();
const mockWriteState = { active: 0, maximum: 0 };

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
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
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
});
