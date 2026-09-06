import { isRuntimeLogCapacity, sanitizeRuntimeLogEntry, type RuntimeLogCapacity, type RuntimeLogPreferences, type RuntimeLogSession } from '@/domain/runtime-log';
import type { RuntimeLogRepository } from '@/storage/runtime-log-repository';

export type RuntimeLogState = {
  ready: boolean;
  busy: boolean;
  capacity: RuntimeLogCapacity;
  enabled: boolean;
  activeId: number | null;
  sessions: RuntimeLogSession[];
  failed: boolean;
};

export function createRuntimeLogController(dependencies: {
  repository: () => Promise<RuntimeLogRepository>;
  preferences: { load: () => Promise<RuntimeLogPreferences>; save: (value: RuntimeLogPreferences) => Promise<void> };
  context: () => Readonly<Record<string, unknown>>;
  now?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  let state: RuntimeLogState = { ready: false, busy: false, capacity: 2000, enabled: false, activeId: null, sessions: [], failed: false };
  let repository: RuntimeLogRepository | undefined;
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
  const fail = () => {
    const id = state.activeId;
    if (id !== null) {
      try { repository?.finish(id, 'failed'); } catch { /* 下次启动恢复未结束记录。 */ }
    }
    publish({
      activeId: null, failed: true, busy: false,
      sessions: state.sessions.map((session) => session.id === id ? { ...session, status: 'failed' } : session),
    });
  };
  const beginRecording = () => {
    const at = now();
    const entry = sanitizeRuntimeLogEntry('recording-start', { ...dependencies.context(), capacity: state.capacity }, at);
    const id = repository!.start(state.capacity, at, entry);
    state = { ...state, activeId: id };
    publish({ sessions: repository!.list(), failed: false });
  };
  const initialize = (): Promise<void> => {
    if (state.ready) return Promise.resolve();
    if (initialization) return initialization;
    publish({ busy: true });
    initialization = (async () => {
      try {
        const preferences = await dependencies.preferences.load();
        publish({ capacity: preferences.capacity, enabled: preferences.enabled });
        const loaded = await dependencies.repository();
        loaded.recover();
        const sessions = loaded.list();
        repository = loaded;
        state = { ...state, ready: true, sessions };
        if (state.enabled) beginRecording();
        publish({ busy: false, failed: false });
      } catch (error) {
        fail();
        throw error;
      } finally { initialization = undefined; }
    })();
    return initialization;
  };

  return {
    initialize,
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
        await dependencies.preferences.save({ capacity: state.capacity, enabled: true });
        publish({ enabled: true });
        beginRecording();
        publish({ busy: false });
      } catch (error) { fail(); throw error; }
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
        publish({ activeId: null, sessions: repository!.list(), busy: false, failed: false });
      } catch (error) { fail(); throw error; }
    }),
    record(type: string, fields: Readonly<Record<string, unknown>>): void {
      if (state.activeId === null) return;
      try {
        repository!.append(state.activeId, sanitizeRuntimeLogEntry(type, fields, now()));
        publish({ sessions: repository!.list() });
      } catch { fail(); }
    },
    snapshot(id: number): string {
      if (!repository) throw new Error('log store unavailable');
      return JSON.stringify({ formatVersion: 1, ...repository.snapshot(id) }, null, 2);
    },
  };
}
