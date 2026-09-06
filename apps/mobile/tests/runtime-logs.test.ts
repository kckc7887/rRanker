import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_LOG_SCHEMA, RuntimeLogRepository } from '@/storage/runtime-log-repository';
import { createRuntimeLogController } from '@/services/runtime-log-controller';
import { installRuntimeLogErrors, type RuntimeExceptionHost } from '@/services/runtime-log-errors';
import { runtimeBuildContext, sanitizeRuntimeLogEntry, type RuntimeLogCapacity, type RuntimeLogPreferences } from '@/domain/runtime-log';
import { createRuntimeOperation, installRuntimeDiagnosticRecorder, installRuntimeLogRecorder, recordRuntimeDiagnostic, recordRuntimeError } from '@/services/runtime-diagnostics-recorder';
import { requestJson, requestBytes, fetchProviderJson } from '@/providers/http-json';
import { ProviderError } from '@/providers/errors';
import { z } from 'zod';
import { queryClient } from '@/state/query-client';
import Storage from 'expo-sqlite/kv-store';
import { runtimeLogPreferencesStore } from '@/storage/runtime-log-preferences-store';

const databases: DatabaseSync[] = [];
function fixture(capacity: RuntimeLogCapacity = 2000) {
  const sql = new DatabaseSync(':memory:');
  databases.push(sql);
  sql.exec(RUNTIME_LOG_SCHEMA);
  const db = {
    execSync: (query: string) => sql.exec(query),
    runSync: (query: string, ...params: SQLInputValue[]) => {
      const result = sql.prepare(query).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    getAllSync: (query: string, ...params: SQLInputValue[]) => sql.prepare(query).all(...params),
    getFirstSync: (query: string, ...params: SQLInputValue[]) => sql.prepare(query).get(...params) ?? null,
    withTransactionSync: (task: () => void) => {
      sql.exec('BEGIN');
      try { task(); sql.exec('COMMIT'); } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const repository = new RuntimeLogRepository(db as unknown as SQLiteDatabase);
  let saved: RuntimeLogPreferences = { capacity, enabled: false };
  const preferences = {
    load: vi.fn(async () => ({ ...saved })),
    save: vi.fn(async (value: RuntimeLogPreferences) => { saved = { ...value }; }),
  };
  let time = 0;
  const create = () => createRuntimeLogController({
    repository: async () => repository, preferences,
    context: () => ({ platform: 'ios', appVersion: '0.3.0', route: '/songs/[songId]' }),
    now: () => new Date(1_700_000_000_000 + time++).toISOString(),
  });
  return { repository, controller: create(), create, preferences, sql, db };
}

afterEach(() => {
  databases.splice(0).forEach((db) => db.close());
  installRuntimeLogRecorder(undefined);
  installRuntimeDiagnosticRecorder(async () => undefined);
  vi.restoreAllMocks();
  vi.useRealTimers();
  queryClient.clear();
});

describe('manual runtime logs', () => {
  it('stays off by default, serializes simultaneous starts and stops without recording later events', async () => {
    const { controller, repository } = fixture();
    await controller.initialize();
    controller.record('task', { taskPhase: 'before' });
    expect(repository.list()).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({ activeId: null, capacity: 2000 });
    await Promise.all([controller.start(), controller.start()]);
    const id = controller.getSnapshot().activeId!;
    controller.record('lifecycle', { lifecyclePhase: 'background' });
    controller.record('lifecycle', { lifecyclePhase: 'foreground-ready' });
    await controller.stop();
    controller.record('task', { taskPhase: 'after' });
    expect(repository.list()).toHaveLength(1);
    expect(repository.snapshot(id).entries.map((entry) => entry.type)).toEqual(['recording-start', 'lifecycle', 'lifecycle', 'recording-stop']);
    expect(repository.list()[0]?.status).toBe('stopped');
  });

  it.each([1000, 2000, 5000] as const)('retains the newest %i entries and persistent build context', async (capacity) => {
    const { controller, repository } = fixture(capacity);
    await controller.start();
    const id = controller.getSnapshot().activeId!;
    for (let index = 0; index < capacity + 20; index++) controller.record('task', { attempt: index });
    const snapshot = repository.snapshot(id);
    expect(snapshot.entries).toHaveLength(capacity);
    expect(snapshot.entries[0]?.fields.attempt).toBe(20);
    expect(snapshot.entries.at(-1)?.fields.attempt).toBe(capacity + 19);
    expect(snapshot.context.appVersion).toBe('0.3.0');
    expect(repository.list()[0]?.count).toBe(capacity);
    expect(snapshot.summary).toMatchObject({ totalCount: capacity + 21, retainedCount: capacity, trimmedCount: 21, byType: { task: capacity } });
    expect(snapshot.summary.firstAt).toBe(snapshot.entries[0]?.at);
    expect(snapshot.summary.lastAt).toBe(snapshot.entries.at(-1)?.at);
  });

  it('starts one new log per boot while enabled and keeps the current and previous logs', async () => {
    const { controller, create, repository } = fixture();
    await controller.start();
    controller.record('error', { error: new TypeError('secret') });
    const restarted = create();
    await restarted.initialize();
    expect(restarted.getSnapshot()).toMatchObject({ enabled: true, activeId: 2, sessions: [{ id: 2, status: 'recording', count: 1 }, { id: 1, status: 'interrupted', count: 2 }] });
    restarted.record('task', {});
    expect(repository.list()[0]?.count).toBe(2);
    await Promise.all([restarted.initialize(), restarted.initialize()]);
    expect(repository.list().map((session) => session.id)).toEqual([2, 1]);
    const thirdBoot = create();
    await thirdBoot.initialize();
    expect(repository.list().map((session) => session.id)).toEqual([3, 2]);
    expect(thirdBoot.getSnapshot()).toMatchObject({ enabled: true, activeId: 3 });
    expect(() => repository.snapshot(1)).toThrow();
  });

  it('persists manual disable so subsequent boots do not create a log', async () => {
    const { controller, create, repository, preferences } = fixture();
    await controller.start();
    await controller.stop();
    expect(await preferences.load()).toEqual({ capacity: 2000, enabled: false });
    const restarted = create();
    await restarted.initialize();
    expect(restarted.getSnapshot()).toMatchObject({ enabled: false, activeId: null });
    expect(repository.list()).toHaveLength(1);
    expect(repository.list()[0]?.status).toBe('stopped');
  });

  it('keeps two sessions including the active one, with independent capacities', async () => {
    const { controller, repository } = fixture(1000);
    await controller.start();
    await controller.stop();
    await controller.setCapacity(5000);
    await controller.start();
    await controller.stop();
    await controller.setCapacity(2000);
    await controller.start();
    expect(repository.list().map((session) => session.capacity)).toEqual([2000, 5000]);
    expect(() => repository.snapshot(1)).toThrow();
  });

  it('rolls back a failed third creation without deleting either previous session', async () => {
    const { controller, repository, db } = fixture();
    await controller.start(); await controller.stop();
    await controller.start(); await controller.stop();
    const before = repository.list();
    vi.spyOn(db, 'execSync').mockImplementationOnce(() => { throw new Error('disk full'); });
    await expect(controller.start()).rejects.toThrow();
    expect(repository.list()).toEqual(before);
    expect(controller.getSnapshot()).toMatchObject({ activeId: null, failed: true });
    await controller.start();
    expect(controller.getSnapshot().failed).toBe(false);
  });

  it('stops on write failure and keeps committed entries without recursive errors', async () => {
    const { controller, repository, preferences, create } = fixture();
    await controller.start();
    const id = controller.getSnapshot().activeId!;
    controller.record('task', { taskPhase: 'saved' });
    vi.spyOn(repository, 'append').mockImplementationOnce(() => { throw new Error('storage failed'); });
    controller.record('task', { taskPhase: 'lost' });
    controller.record('task', { taskPhase: 'ignored' });
    expect(controller.getSnapshot()).toMatchObject({ enabled: true, activeId: null, failed: true });
    expect(repository.snapshot(id).entries).toHaveLength(2);
    expect(repository.list()[0]?.status).toBe('failed');
    expect((await preferences.load()).enabled).toBe(true);
    const restarted = create();
    await restarted.initialize();
    expect(restarted.getSnapshot()).toMatchObject({ enabled: true, activeId: 2, failed: false });
  });

  it('rolls back sequence and timestamp when an event insert fails after updating its session', async () => {
    const { controller, repository, sql } = fixture();
    await controller.start();
    controller.record('task', { taskPhase: 'saved' });
    const before = repository.list()[0]!;
    sql.exec("CREATE TRIGGER reject_entry BEFORE INSERT ON log_entries WHEN NEW.sequence = 3 BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    controller.record('task', { taskPhase: 'failed' });
    expect(repository.list()[0]).toMatchObject({ count: before.count, lastAt: before.lastAt, status: 'failed' });
    expect(sql.prepare('SELECT sequence FROM log_sessions WHERE id = ?').get(before.id)?.sequence).toBe(2);
    expect(controller.getSnapshot().activeId).toBeNull();
  });

  it('locks capacity while recording and persists only successful preference changes', async () => {
    const { controller, preferences } = fixture();
    await controller.start();
    preferences.save.mockClear();
    await controller.setCapacity(5000);
    expect(preferences.save).not.toHaveBeenCalled();
    await controller.stop();
    await controller.setCapacity(5000);
    expect(preferences.save).toHaveBeenCalledWith({ capacity: 5000, enabled: false });
    preferences.save.mockRejectedValueOnce(new Error('write failed'));
    await expect(controller.setCapacity(1000)).rejects.toThrow();
    expect(controller.getSnapshot().capacity).toBe(5000);
  });

  it('does not enable if preference saving fails and does not stop when disable saving fails', async () => {
    const { controller, preferences, repository } = fixture();
    preferences.save.mockRejectedValueOnce(new Error('write failed'));
    await expect(controller.start()).rejects.toThrow();
    expect(controller.getSnapshot()).toMatchObject({ enabled: false, activeId: null });
    expect(repository.list()).toHaveLength(0);
    await controller.start();
    preferences.save.mockRejectedValueOnce(new Error('write failed'));
    await expect(controller.stop()).rejects.toThrow();
    expect(controller.getSnapshot()).toMatchObject({ enabled: true, activeId: 1, busy: false });
    controller.record('task', {});
    expect(repository.list()[0]?.count).toBe(2);
  });

  it('serializes a stop requested while enabling so it stays disabled after restart', async () => {
    const { controller, create, preferences } = fixture();
    await Promise.all([controller.start(), controller.stop()]);
    expect((await preferences.load()).enabled).toBe(false);
    const restarted = create();
    await restarted.initialize();
    expect(restarted.getSnapshot()).toMatchObject({ enabled: false, activeId: null });
  });

  it('freezes a selected snapshot while continuing to record', async () => {
    const { controller } = fixture();
    await controller.start();
    const id = controller.getSnapshot().activeId!;
    const snapshot = controller.snapshot(id);
    controller.record('route', { route: '/diagnostics' });
    expect(JSON.parse(snapshot).entries).toHaveLength(1);
    expect(JSON.parse(controller.snapshot(id)).entries).toHaveLength(2);
    expect(controller.getSnapshot().activeId).toBe(id);
    expect(JSON.parse(snapshot).summary.totalCount).toBe(1);
    expect(JSON.parse(snapshot).snapshotAt).toBeTruthy();
  });

  it('updates committed metadata without reading the session list per event', async () => {
    const { controller, repository } = fixture();
    await controller.start();
    const list = vi.spyOn(repository, 'list');
    controller.record('task', {});
    expect(list).not.toHaveBeenCalled();
    expect(controller.getSnapshot().sessions[0]).toMatchObject({ count: 2 });
    const entries = repository.snapshot(1).entries;
    expect(entries[1]?.fields.route).toBe('/songs/[songId]');
    expect(controller.getSnapshot().sessions[0]?.lastAt).toBe(entries[1]?.at);
  });
});

describe('runtime log preferences', () => {
  it('reads capacity-only preferences as disabled and round trips the enabled flag', async () => {
    await Storage.setItem('runtime-log-preferences-v1', JSON.stringify({ capacity: 5000 }));
    expect(await runtimeLogPreferencesStore.load()).toEqual({ capacity: 5000, enabled: false });
    await runtimeLogPreferencesStore.save({ capacity: 1000, enabled: true });
    expect(await runtimeLogPreferencesStore.load()).toEqual({ capacity: 1000, enabled: true });
    await Storage.setItem('runtime-log-preferences-v1', JSON.stringify({ capacity: -1, enabled: 'true' }));
    expect(await runtimeLogPreferencesStore.load()).toEqual({ capacity: 2000, enabled: false });
    await Storage.removeItem('runtime-log-preferences-v1');
  });
});

describe('privacy and exception handling', () => {
  it.each(['/(tabs)/b50', '/songs/[songId]', '/(tabs)/(overview)', '/files/[...parts]'])('retains route template %s', (route) => {
    expect(sanitizeRuntimeLogEntry('route', { route }, '2026-09-06').fields.route).toBe(route);
  });

  it('validates new diagnostic fields and distinguishes native and configured builds', () => {
    expect(runtimeBuildContext('19', '18')).toEqual({ buildVersion: '19', buildVersionSource: 'native' });
    expect(runtimeBuildContext(null, 18)).toEqual({ buildVersion: '18', buildVersionSource: 'config' });
    expect(runtimeBuildContext(undefined, undefined)).toEqual({ buildVersion: 'unknown', buildVersionSource: 'unknown' });
    expect(runtimeBuildContext('file:///private', null).buildVersion).toBe('unknown');
    const entry = sanitizeRuntimeLogEntry('request', { scenario: 'secret', errorCode: 'credential', operationId: -1, pageIndex: 1.5, route: '/b50?token=secret', phase: 'https://private' }, '2026-09-06');
    expect(entry.fields).toEqual({});
    expect(sanitizeRuntimeLogEntry('error', { error: new ProviderError('permission', 'secret', false) }, '2026-09-06').fields.errorCode).toBe('permission');
  });
  it('discards arbitrary payloads, credentials, messages and paths while bounding stack and UTF-8 size', () => {
    const error = new TypeError('Alice secret-token https://host/?token=secret');
    error.stack = `TypeError: Alice\n${Array(100).fill('    at Alice (C:\\Users\\Alice\\project\\index.js:42:7)').join('\n')}`;
    const entry = sanitizeRuntimeLogEntry('error', {
      error, token: 'secret', body: { name: 'Alice' }, url: 'https://host', route: '/songs/123?account=Alice',
    }, '2026-09-06T00:00:00.000Z');
    const text = JSON.stringify(entry);
    expect(text).not.toMatch(/Alice|secret|https:|Users|account/u);
    expect(entry.error?.stack).toHaveLength(30);
    expect(entry.error?.stack[0]).toBe('index.js:42:7');
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(8192);
    const native = sanitizeRuntimeLogEntry('error', { error: { stack: [{ file: 'https://host/index.bundle?token=secret', lineNumber: 1, column: 123 }], extraData: { token: 'secret' } } }, entry.at);
    expect(native.error?.stack).toEqual(['index.bundle:1:123']);
  });

  it('does not call arbitrary error serialization or getter failures', () => {
    const error = { get name() { throw new Error('bad getter'); }, toJSON() { throw new Error('must not call'); } };
    expect(() => sanitizeRuntimeLogEntry('error', { error }, '2026-09-06')).not.toThrow();
  });

  it('registers the native listener once and never prevents default handling', () => {
    let callback: ((data: unknown) => void) | undefined;
    const host: RuntimeExceptionHost = { RN$registerExceptionListener: vi.fn((listener) => { callback = listener; }) };
    const record = vi.fn();
    installRuntimeLogErrors(host, record); installRuntimeLogErrors(host, record);
    const event = { isFatal: true, preventDefault: vi.fn() };
    callback!(event);
    expect(record).toHaveBeenCalledWith(event, true);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(host.RN$registerExceptionListener).toHaveBeenCalledTimes(1);
  });

  it('records synchronously before calling the original fallback handler even if recording fails', () => {
    const calls: string[] = [];
    let handler: (error: unknown, fatal?: boolean) => void = () => undefined;
    const host: RuntimeExceptionHost = { RN$useAlwaysAvailableJSErrorHandling: false, RN$registerExceptionListener: vi.fn(), ErrorUtils: {
      getGlobalHandler: () => () => { calls.push('original'); },
      setGlobalHandler: (value) => { handler = value; },
    } };
    installRuntimeLogErrors(host, () => { calls.push('record'); throw new Error('disk'); });
    handler(new Error('fatal'), true);
    expect(calls).toEqual(['record', 'original']);
    expect(host.RN$registerExceptionListener).not.toHaveBeenCalled();
  });

  it('falls back if native registration fails and keeps initialization safe if both handlers fail', () => {
    const setGlobalHandler = vi.fn();
    const host: RuntimeExceptionHost = {
      RN$registerExceptionListener: () => { throw new Error('unsupported'); },
      ErrorUtils: { getGlobalHandler: () => () => undefined, setGlobalHandler },
    };
    expect(() => installRuntimeLogErrors(host, vi.fn())).not.toThrow();
    expect(setGlobalHandler).toHaveBeenCalledOnce();
    const unavailable: RuntimeExceptionHost = { ErrorUtils: {
      getGlobalHandler: () => { throw new Error('not ready'); }, setGlobalHandler,
    } };
    expect(() => installRuntimeLogErrors(unavailable, vi.fn())).not.toThrow();
  });

  it('fans out synchronously and isolates both recorder failures', async () => {
    const log = vi.fn();
    installRuntimeLogRecorder(log);
    installRuntimeDiagnosticRecorder(async () => { throw new Error('summary failed'); });
    const pending = recordRuntimeDiagnostic('task', { taskPhase: 'done' });
    expect(log).toHaveBeenCalledOnce();
    await expect(pending).resolves.toBeUndefined();
    installRuntimeLogRecorder(() => { throw new Error('log failed'); });
    await expect(recordRuntimeDiagnostic('task')).resolves.toBeUndefined();
  });
});

describe('shared operation capture', () => {
  it('records HTTP retries and bytes success without copying addresses or payloads', async () => {
    const { controller, repository } = fixture();
    await controller.start();
    installRuntimeLogRecorder(controller.record);
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"player":"Alice"}', { status: 200 }));
    const options = {
      fetcher: fetcher as typeof fetch, path: '/secret-token', baseUrl: 'https://private.example', label: 'Private',
      error: () => new ProviderError('network', 'Alice', true),
    };
    await requestJson({ ...options, schema: z.object({ player: z.string() }) });
    fetcher.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));
    await requestBytes(options);
    const entries = repository.snapshot(controller.getSnapshot().activeId!).entries;
    expect(entries.filter((entry) => entry.type === 'request').map((entry) => [entry.fields.source, entry.fields.result, entry.fields.attempt, entry.fields.status])).toEqual([
      ['request-json', 'error', 1, 503], ['request-json', 'success', 2, 200], ['request-bytes', 'success', 1, 200],
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Alice|private|secret-token/u);
    expect(entries[1]?.type).toBe('request-start');
    expect(new Set(entries.slice(1, 4).map((entry) => entry.fields.operationId)).size).toBe(1);
    expect(entries[4]?.fields.operationId).not.toBe(entries[1]?.fields.operationId);
  });

  it('keeps concurrent request IDs and explicit scenarios separate', async () => {
    const log = vi.fn(); installRuntimeLogRecorder(log);
    let finish!: (response: Response) => void;
    const options = { baseUrl: '', path: '/secret', label: 'test', error: () => new ProviderError('network', 'secret', false), schema: z.object({}) };
    const first = requestJson({ ...options, diagnosticScenario: 'chart', fetcher: () => new Promise((resolve) => { finish = resolve; }) });
    await requestJson({ ...options, diagnosticScenario: 'music', fetcher: async () => new Response('{}') });
    finish(new Response('{}')); await first;
    const events = log.mock.calls.map(([type, fields]) => ({ type, ...fields }));
    expect(events.map((event) => event.scenario)).toEqual(['chart', 'music', 'music', 'chart']);
    expect(events[0].operationId).toBe(events[3].operationId);
    expect(events[1].operationId).toBe(events[2].operationId);
    expect(events[0].operationId).not.toBe(events[1].operationId);
  });

  it.each(['schema', 'network', 'timeout', 'cancelled'] as const)('records normalized %s results', async (kind) => {
    const { controller } = fixture(); await controller.start(); installRuntimeLogRecorder(controller.record);
    const abort = new AbortController();
    const fetcher: typeof fetch = async () => {
      if (kind === 'schema') return new Response('invalid json');
      if (kind === 'network') throw new TypeError('secret host');
      if (kind === 'cancelled') abort.abort();
      throw new DOMException('secret', 'AbortError');
    };
    await expect(requestJson({ baseUrl: '', path: '', label: 'test', error: () => new ProviderError('unknown', '', false), schema: z.object({}), retries: 1, signal: abort.signal, fetcher })).rejects.toThrow();
    const entry = JSON.parse(controller.snapshot(1)).entries.at(-1);
    expect(entry.fields.errorCode).toBe(kind === 'schema' ? 'upstream_schema' : kind);
    expect(entry.fields.result).toBe(kind === 'cancelled' ? 'cancelled' : 'error');
    if (kind === 'cancelled') expect(entry.error).toBeUndefined();
  });

  it('deduplicates operation stages and preserves the error context API', () => {
    const log = vi.fn(); installRuntimeLogRecorder(log);
    const operation = createRuntimeOperation('preview');
    operation.record('ready'); operation.record('ready');
    operation.record('ready', {}, 'second-view');
    expect(log).toHaveBeenCalledTimes(2);
    recordRuntimeError('query', new ProviderError('timeout', 'secret', true), false, { phase: 'final', operationId: operation.operationId });
    expect(log.mock.calls.at(-1)?.[1]).toMatchObject({ phase: 'final', operationId: operation.operationId, fatal: false });
  });

  it('records provider JSON schema failures with a normalized code and shared request ID', async () => {
    const { controller } = fixture(); await controller.start(); installRuntimeLogRecorder(controller.record);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('invalid json'));
    await expect(fetchProviderJson({ baseUrl: 'https://secret', path: '/secret', diagnosticScenario: 'catalog', invalidJsonMessage: 'secret', timeoutMessage: 'secret', networkMessage: 'secret' })).rejects.toMatchObject({ code: 'upstream_schema' });
    const entries = JSON.parse(controller.snapshot(1)).entries;
    expect(entries.at(-1).fields).toMatchObject({ source: 'provider-json', scenario: 'catalog', errorCode: 'upstream_schema', operationId: entries[1].fields.operationId });
    expect(JSON.stringify(entries)).not.toContain('secret');
  });

  it('records timer-driven timeouts and cancels during retry backoff without another request', async () => {
    vi.useFakeTimers();
    const log = vi.fn(); installRuntimeLogRecorder(log);
    const options = { baseUrl: '', path: '', label: 'test', schema: z.object({}), error: () => new ProviderError('rate_limit', 'secret', true) };
    const timeout = requestJson({ ...options, timeoutMs: 50, retries: 1, fetcher: (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new DOMException('secret', 'AbortError')))) });
    const rejected = expect(timeout).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(50); await rejected;
    expect(log.mock.calls.at(-1)?.[1]).toMatchObject({ errorCode: 'timeout', durationMs: 50 });
    const abort = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }));
    const retry = requestJson({ ...options, fetcher: fetcher as typeof fetch, signal: abort.signal });
    const cancelled = expect(retry).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(1); abort.abort(); await cancelled;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.at(-1)?.[1]).toMatchObject({ result: 'cancelled', errorCode: 'cancelled' });
  });

  it('records final query errors without copying query keys', async () => {
    const { controller } = fixture();
    await controller.start();
    installRuntimeLogRecorder(controller.record);
    await expect(queryClient.fetchQuery({ queryKey: ['secret-account'], retry: false, queryFn: async () => { throw new TypeError('Alice'); } })).rejects.toThrow();
    const snapshot = controller.snapshot(controller.getSnapshot().activeId!);
    expect(snapshot).toContain('query');
    expect(snapshot).toContain('TypeError');
    expect(snapshot).not.toMatch(/secret-account|Alice/u);
  });
});
