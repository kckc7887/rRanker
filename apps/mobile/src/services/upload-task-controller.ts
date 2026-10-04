import type { CatalogSnapshot } from '@/domain/models';
import { recordRuntimeDiagnostic } from '@/services/runtime-diagnostics-recorder';
import { ScoreHubError, type ScoreHubAbortSignal } from '@/services/score-hub-http';
import type { UploadPhase, UploadResult, UploadTaskSnapshot } from '@/services/upload-maimai-types';
import { waitForForeground } from '@/state/app-lifecycle-core';

type CatalogWaiter = {
  promise: Promise<CatalogSnapshot>;
  resolve: (catalog: CatalogSnapshot) => void;
  reject: (error: Error) => void;
};
function createTask() {
  const foreground = new AbortController();
  const cancelListeners = new Set<() => void>();
  const resumeWaiters = new Set<() => void>();
  const signal: ScoreHubAbortSignal = {
    aborted: false, paused: false,
    waitUntilResumed: async () => {
      while (signal.paused && !signal.aborted) await new Promise<void>(resolve => resumeWaiters.add(resolve));
      if (signal.aborted) throw new ScoreHubError('已取消');
      try { await waitForForeground(foreground.signal); }
      catch (error) { if (!signal.aborted) throw error; }
      if (signal.aborted) throw new ScoreHubError('已取消');
    },
    onCancel: listener => {
      if (signal.aborted) { listener(); return () => undefined; }
      cancelListeners.add(listener);
      return () => { cancelListeners.delete(listener); };
    },
  };
  return {
    signal, foreground, cancelListeners, resumeWaiters,
    waiter: null as CatalogWaiter | null, request: null as Promise<void> | null
  };
}
type Task = ReturnType<typeof createTask>;

export class UploadTaskController {
  private snapshot: UploadTaskSnapshot = { taskId: null, status: 'idle', phase: { kind: 'idle' }, result: null };
  private listeners = new Set<(snapshot: UploadTaskSnapshot) => void>();
  private task = createTask();
  private sequence = 0;
  private catalog: CatalogSnapshot | undefined;
  private requestCatalog: (() => Promise<CatalogSnapshot | undefined>) | undefined;
  private idleResetTimer: ReturnType<typeof setTimeout> | null = null;

  private publish(next: UploadTaskSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) {
      try { listener(next); } catch { /* One observer cannot interrupt task settlement. */ }
    }
    void recordRuntimeDiagnostic('task', { taskPhase: next.phase.kind });
  }
  getSnapshot(): UploadTaskSnapshot { return this.snapshot; }
  getSignal(): ScoreHubAbortSignal { return this.task.signal; }
  isCurrent(signal: ScoreHubAbortSignal): boolean { return signal === this.task.signal && !signal.aborted; }

  attachCatalogSource(catalog: CatalogSnapshot | undefined, requestCatalog?: () => Promise<CatalogSnapshot | undefined>): void {
    this.catalog = catalog;
    this.requestCatalog = requestCatalog;
  }
  finishCatalogWait(catalog: CatalogSnapshot, signal: ScoreHubAbortSignal = this.task.signal): void {
    if (!this.isCurrent(signal)) return;
    const waiter = this.task.waiter;
    this.task.waiter = null;
    waiter?.resolve(catalog);
  }
  private syncCatalogForUpload(task = this.task): void {
    const waiter = task.waiter;
    if (!waiter || task.request || !this.isCurrent(task.signal)) return;
    const request = this.requestCatalog;
    this.setPhase({ kind: 'syncing_catalog', message: '成绩已获取，正在同步曲库…' }, task.signal);
    const attempt = Promise.resolve().then(async () => {
      try {
        if (!this.isCurrent(task.signal)) return;
        const catalog = await request?.();
        if (!this.isCurrent(task.signal) || task.waiter !== waiter) return;
        const available = catalog ?? this.catalog;
        if (available) this.finishCatalogWait(available, task.signal);
      } catch { /* A retry remains available for this task only. */ }
      finally {
        if (task.request === attempt) task.request = null;
        if (this.isCurrent(task.signal) && task.waiter === waiter) {
          this.setPhase({ kind: 'awaiting_catalog', message: '成绩已获取，曲库暂未同步。请重试。' }, task.signal);
        }
      }
    });
    task.request = attempt;
  }
  waitForCatalog(signal: ScoreHubAbortSignal): Promise<CatalogSnapshot> {
    if (!this.isCurrent(signal)) return Promise.reject(new ScoreHubError('已取消'));
    if (this.catalog) return Promise.resolve(this.catalog);
    if (this.task.waiter) return this.task.waiter.promise;
    let resolve!: CatalogWaiter['resolve'];
    let reject!: CatalogWaiter['reject'];
    const promise = new Promise<CatalogSnapshot>((yes, no) => { resolve = yes; reject = no; });
    this.task.waiter = { promise, resolve, reject };
    this.syncCatalogForUpload();
    return promise;
  }
  retryCatalogSync(): void { this.syncCatalogForUpload(); }
  private clearIdleReset(): void {
    if (this.idleResetTimer) clearTimeout(this.idleResetTimer);
    this.idleResetTimer = null;
  }
  private abort(task: Task): void {
    task.signal.aborted = true;
    task.foreground.abort();
    for (const resolve of task.resumeWaiters) resolve();
    task.resumeWaiters.clear();
    for (const listener of task.cancelListeners) {
      try { listener(); } catch { /* All cancellation consumers must be released. */ }
    }
    task.cancelListeners.clear();
    task.waiter?.reject(new ScoreHubError('已取消'));
    task.waiter = null;
  }
  begin(): ScoreHubAbortSignal {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'paused') return this.task.signal;
    this.clearIdleReset();
    this.abort(this.task);
    this.task = createTask();
    this.publish({ taskId: `upload-${++this.sequence}`, status: 'running', phase: { kind: 'logging_in', message: '正在准备上传…' }, result: null });
    return this.task.signal;
  }
  setPhase(phase: UploadPhase, signal: ScoreHubAbortSignal): void {
    if (!this.isCurrent(signal)) return;
    this.clearIdleReset();
    const status = phase.kind === 'done' ? 'done' : phase.kind === 'error' ? 'error' : this.snapshot.status;
    this.publish({ ...this.snapshot, phase, status });
    if (phase.kind === 'done') this.idleResetTimer = setTimeout(() => {
      this.idleResetTimer = null;
      if (this.isCurrent(signal)) this.publish({ ...this.snapshot, phase: { kind: 'idle' } });
    }, 5_000);
  }
  pause(): void {
    if (this.snapshot.status !== 'running') return;
    this.task.signal.paused = true;
    this.publish({ ...this.snapshot, status: 'paused' });
  }
  resume(): void {
    if (this.snapshot.status !== 'paused') return;
    this.task.signal.paused = false;
    for (const resolve of this.task.resumeWaiters) resolve();
    this.task.resumeWaiters.clear();
    this.publish({ ...this.snapshot, status: 'running' });
  }
  cancel(): void {
    if (this.snapshot.status !== 'running' && this.snapshot.status !== 'paused') return;
    this.abort(this.task);
    this.publish({ ...this.snapshot, status: 'canceled', phase: { kind: 'canceling', message: '正在取消…' } });
  }
  finishCanceled(signal: ScoreHubAbortSignal): void {
    if (signal === this.task.signal && signal.aborted) this.publish({ ...this.snapshot, phase: { kind: 'idle' } });
  }
  complete(result: UploadResult, signal: ScoreHubAbortSignal): void {
    if (this.isCurrent(signal)) this.publish({ ...this.snapshot, status: 'done', result });
  }
  subscribe(listener: (snapshot: UploadTaskSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }

}
export const uploadTaskController = new UploadTaskController();
