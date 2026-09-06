import { isRuntimeLogCapacity, sanitizeRuntimeLogEntry, type RuntimeLogCapacity, type RuntimeLogSession } from '@/domain/runtime-log';
import type { RuntimeLogRepository } from '@/storage/runtime-log-repository';

export type RuntimeLogState = {
  ready: boolean;
  busy: boolean;
  capacity: RuntimeLogCapacity;
  activeId: number | null;
  sessions: RuntimeLogSession[];
  failed: boolean;
};

export function createRuntimeLogController(dependencies: {
  repository: () => Promise<RuntimeLogRepository>;
  preferences: { load: () => Promise<{ capacity: RuntimeLogCapacity }>; save: (value: { capacity: RuntimeLogCapacity }) => Promise<void> };
  context: () => Readonly<Record<string, unknown>>;
  now?: () => string;
}) {
  const now = dependencies.now ?? (() => new Date().toISOString());
  let state: RuntimeLogState = { ready: false, busy: false, capacity: 2000, activeId: null, sessions: [], failed: false };
  let repository: RuntimeLogRepository | undefined;
  let initialization: Promise<void> | undefined;
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
  const initialize = (): Promise<void> => {
    if (state.ready) return Promise.resolve();
    if (initialization) return initialization;
    publish({ busy: true });
    initialization = (async () => {
      try {
        const [loaded, preferences] = await Promise.all([dependencies.repository(), dependencies.preferences.load()]);
        loaded.recover();
        const sessions = loaded.list();
        repository = loaded;
        publish({ ready: true, busy: false, capacity: preferences.capacity, sessions, failed: false });
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
    async setCapacity(capacity: RuntimeLogCapacity): Promise<void> {
      await initialize();
      if (!isRuntimeLogCapacity(capacity) || state.activeId !== null || state.busy) return;
      publish({ busy: true });
      try {
        await dependencies.preferences.save({ capacity });
        publish({ capacity, busy: false });
      } catch (error) { publish({ busy: false }); throw error; }
    },
    async start(): Promise<void> {
      await initialize();
      if (state.activeId !== null || state.busy) return;
      try {
        const at = now();
        const entry = sanitizeRuntimeLogEntry('recording-start', { ...dependencies.context(), capacity: state.capacity }, at);
        const id = repository!.start(state.capacity, at, entry);
        state = { ...state, activeId: id };
        publish({ activeId: id, sessions: repository!.list(), failed: false });
      } catch (error) { fail(); throw error; }
    },
    stop(): void {
      if (state.activeId === null) return;
      try {
        repository!.finish(state.activeId, 'stopped', sanitizeRuntimeLogEntry('recording-stop', {}, now()));
        publish({ activeId: null, sessions: repository!.list() });
      } catch (error) { fail(); throw error; }
    },
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
