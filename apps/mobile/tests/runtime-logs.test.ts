import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RUNTIME_LOG_SCHEMA, RuntimeLogRepository } from '@/storage/runtime-log-repository';
import { createRuntimeLogController } from '@/services/runtime-log-controller';
import { installRuntimeLogErrors, type RuntimeExceptionHost } from '@/services/runtime-log-errors';
import { sanitizeRuntimeLogEntry, type RuntimeLogCapacity } from '@/domain/runtime-log';
import { installRuntimeDiagnosticRecorder, installRuntimeLogRecorder, recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
import { requestJson, requestBytes } from '@/providers/http-json';
import { ProviderError } from '@/providers/errors';
import { z } from 'zod';
import { queryClient } from '@/state/query-client';

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
  const preferences = { load: vi.fn(async () => ({ capacity })), save: vi.fn(async (_value: { capacity: RuntimeLogCapacity }) => undefined) };
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
    controller.stop();
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
  });

  it('recovers interrupted sessions without enabling recording or creating a new session', async () => {
    const { controller, create, repository } = fixture();
    await controller.start();
    controller.record('error', { error: new TypeError('secret') });
    const restarted = create();
    await restarted.initialize();
    expect(restarted.getSnapshot()).toMatchObject({ activeId: null, sessions: [{ status: 'interrupted', count: 2 }] });
    restarted.record('task', {});
    expect(repository.list()[0]?.count).toBe(2);
  });

  it('keeps two sessions including the active one, with independent capacities', async () => {
    const { controller, repository } = fixture(1000);
    await controller.start();
    controller.stop();
    await controller.setCapacity(5000);
    await controller.start();
    controller.stop();
    await controller.setCapacity(2000);
    await controller.start();
    expect(repository.list().map((session) => session.capacity)).toEqual([2000, 5000]);
    expect(() => repository.snapshot(1)).toThrow();
  });

  it('rolls back a failed third creation without deleting either previous session', async () => {
    const { controller, repository, db } = fixture();
    await controller.start(); controller.stop();
    await controller.start(); controller.stop();
    const before = repository.list();
    vi.spyOn(db, 'execSync').mockImplementationOnce(() => { throw new Error('disk full'); });
    await expect(controller.start()).rejects.toThrow();
    expect(repository.list()).toEqual(before);
    expect(controller.getSnapshot()).toMatchObject({ activeId: null, failed: true });
    await controller.start();
    expect(controller.getSnapshot().failed).toBe(false);
  });

  it('stops on write failure and keeps committed entries without recursive errors', async () => {
    const { controller, repository } = fixture();
    await controller.start();
    const id = controller.getSnapshot().activeId!;
    controller.record('task', { taskPhase: 'saved' });
    vi.spyOn(repository, 'append').mockImplementationOnce(() => { throw new Error('storage failed'); });
    controller.record('task', { taskPhase: 'lost' });
    controller.record('task', { taskPhase: 'ignored' });
    expect(controller.getSnapshot()).toMatchObject({ activeId: null, failed: true });
    expect(repository.snapshot(id).entries).toHaveLength(2);
    expect(repository.list()[0]?.status).toBe('failed');
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
    await controller.setCapacity(5000);
    expect(preferences.save).not.toHaveBeenCalled();
    controller.stop();
    await controller.setCapacity(5000);
    expect(preferences.save).toHaveBeenCalledWith({ capacity: 5000 });
    preferences.save.mockRejectedValueOnce(new Error('write failed'));
    await expect(controller.setCapacity(1000)).rejects.toThrow();
    expect(controller.getSnapshot().capacity).toBe(5000);
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
  });
});

describe('privacy and exception handling', () => {
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
    expect(entries.slice(1).map((entry) => [entry.fields.source, entry.fields.result, entry.fields.attempt, entry.fields.status])).toEqual([
      ['request-json', 'error', 1, 503], ['request-json', 'success', 2, 200], ['request-bytes', 'success', 1, 200],
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Alice|private|secret-token/u);
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
