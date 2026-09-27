import { isRuntimeLogCapacity, sanitizeRuntimeLogEntry, type RuntimeLogCapacity, type RuntimeLogPreferences, type RuntimeLogSession } from '@/domain/runtime-log';
import type { RuntimeLogRepository } from '@/storage/runtime-log-repository';
import { recordRuntimeError } from './runtime-diagnostics-recorder';

export type RuntimeLogState = {
  ready: boolean;
  busy: boolean;
  capacity: RuntimeLogCapacity;
  enabled: boolean;
  activeId: number | null;
  sessions: RuntimeLogSession[];
  failed: boolean;
  historyReady?: boolean;
  historyBusy?: boolean;
  failurePhase?: 'preferences' | 'history' | 'recording' | null;
};

export function createRuntimeLogController(dependencies: {
  repository: () => Promise<RuntimeLogRepository>;
  preferences: { load: () => Promise<RuntimeLogPreferences>; save: (value: RuntimeLogPreferences) => Promise<void> };
  context: () => Readonly<Record<string, unknown>>;
  now?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  let state: RuntimeLogState = { ready: false, busy: false, capacity: 2000, enabled: false, activeId: null, sessions: [], failed: false, historyReady: false, historyBusy: false, failurePhase: null };
  let repository: RuntimeLogRepository | undefined;
  let repositoryLoading: Promise<RuntimeLogRepository> | undefined;
  let initialization: Promise<void> | undefined;
  let controlQueue = Promise.resolve();
  const serializeControl = (operation: () => Promise<void>): Promise<void> => {
    const pending = controlQueue.then(operation);
    controlQueue = pending.catch(() => undefined);
    return pending;
  };
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<RuntimeLogState>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) {
      try { listener(); } catch { /* 订阅者不得中断落盘或异常处理。 */ }
    }
  };
  const fail = (phase: NonNullable<RuntimeLogState['failurePhase']>, error: unknown) => {
    const id = state.activeId;
    if (id !== null && phase !== 'history') {
      try { repository?.finish(id, 'failed'); } catch { /* 下次启动恢复未结束记录。 */ }
    }
    publish({
      activeId: phase === 'history' ? id : null, failed: true, busy: false, historyBusy: false, failurePhase: phase,
      sessions: phase === 'history' ? state.sessions : state.sessions.map((session) => session.id === id ? { ...session, status: 'failed' } : session),
    });
    recordRuntimeError('runtime-log', error, false, { phase });
  };
  const ensureRepository = (): Promise<RuntimeLogRepository> => {
    if (repository) return Promise.resolve(repository);
    repositoryLoading ??= dependencies.repository().then((loaded) => {
      loaded.recover();
      const sessions = loaded.list();
      repository = loaded;
      publish({ sessions, historyReady: true });
      return loaded;
    }).finally(() => { repositoryLoading = undefined; });
    return repositoryLoading;
  };
  const beginRecording = () => {
    const at = now();
    const entry = sanitizeRuntimeLogEntry('recording-start', { ...dependencies.context(), capacity: state.capacity }, at);
    const id = repository!.start(state.capacity, at, entry);
    state = { ...state, activeId: id };
    publish({ sessions: repository!.list(), failed: false, failurePhase: null, historyReady: true });
  };
  const initialize = (): Promise<void> => {
    if (state.ready) return Promise.resolve();
    if (initialization) return initialization;
    publish({ busy: true });
    initialization = (async () => {
      try {
        const preferences = await dependencies.preferences.load();
        publish({ capacity: preferences.capacity, enabled: preferences.enabled });
        publish({ ready: true });
        if (state.enabled) { await ensureRepository(); beginRecording(); }
        publish({ busy: false, failed: false, failurePhase: null });
      } catch (error) {
        fail(state.ready ? 'recording' : 'preferences', error);
        throw error;
      } finally { initialization = undefined; }
    })();
    return initialization;
  };

  return {
    initialize,
    loadHistory: (): Promise<void> => serializeControl(async () => {
      await initialize();
      publish({ historyBusy: true });
      try {
        const loaded = await ensureRepository();
        publish({ sessions: loaded.list(), historyReady: true, historyBusy: false,
          ...(state.failurePhase === 'history' ? { failed: false, failurePhase: null } : {}) });
      } catch (error) { fail('history', error); throw error; }
    }),
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    setCapacity: (capacity: RuntimeLogCapacity): Promise<void> => serializeControl(async () => {
      await initialize();
      if (!isRuntimeLogCapacity(capacity) || state.enabled) return;
      publish({ busy: true });
      try {
        await dependencies.preferences.save({ capacity, enabled: state.enabled });
        publish({ capacity, busy: false });
      } catch (error) { publish({ busy: false }); throw error; }
    }),
    start: (): Promise<void> => serializeControl(async () => {
      await initialize();
      if (state.activeId !== null) return;
      publish({ busy: true });
      try {
        await ensureRepository();
        await dependencies.preferences.save({ capacity: state.capacity, enabled: true });
        publish({ enabled: true });
        beginRecording();
        publish({ busy: false });
      } catch (error) { fail('recording', error); throw error; }
    }),
    stop: (): Promise<void> => serializeControl(async () => {
      await initialize();
      if (!state.enabled && state.activeId === null) return;
      publish({ busy: true });
      try {
        await dependencies.preferences.save({ capacity: state.capacity, enabled: false });
      } catch (error) {
        publish({ busy: false });
        throw error;
      }
      publish({ enabled: false });
      try {
        if (state.activeId !== null) repository!.finish(state.activeId, 'stopped', sanitizeRuntimeLogEntry('recording-stop', {}, now()));
        publish({ activeId: null, sessions: repository?.list() ?? state.sessions, busy: false, failed: false, failurePhase: null });
      } catch (error) { fail('recording', error); throw error; }
    }),
    record(type: string, fields: Readonly<Record<string, unknown>>): void {
      if (state.activeId === null) return;
      try {
        const entry = sanitizeRuntimeLogEntry(type, { route: dependencies.context().route, ...fields }, now());
        repository!.append(state.activeId, entry);
        publish({ sessions: state.sessions.map((session) => session.id === state.activeId
          ? { ...session, lastAt: entry.at, count: Math.min(session.capacity, session.count + 1) } : session) });
      } catch (error) { fail('recording', error); }
    },
    snapshot(id: number): string {
      if (!repository) throw new Error('log store unavailable');
      const snapshotAt = now();
      return JSON.stringify({ formatVersion: 1, snapshotAt, ...repository.snapshot(id) }, null, 2);
    },
  };
}
