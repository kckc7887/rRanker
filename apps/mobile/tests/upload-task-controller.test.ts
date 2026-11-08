import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getDataSource, setDisabledPlugins } from '@rranker/sdk/registry';
import { createMaimaiBoundAccount } from '@rranker/game-maimai/accounts';
import type { CatalogSnapshot } from '@rranker/game-maimai/domain/models';
import { UploadTaskController } from '@rranker/tool-maimai/services/upload-task-controller';
import { getAppLifecycleSnapshot, publishAppLifecycleSnapshot } from '@rranker/sdk/state/app-lifecycle-core';

vi.mock('@rranker/sdk/services/runtime-diagnostics-recorder', () => ({ recordRuntimeDiagnostic: vi.fn() }));
let controller: UploadTaskController;
beforeEach(() => { controller = new UploadTaskController(); });
const foreground = getAppLifecycleSnapshot();
const catalog = (source: string) => ({ source } as unknown as CatalogSnapshot);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => { resolve = yes; });
  return { promise, resolve };
}
afterEach(() => { controller.cancel(); setDisabledPlugins([]); publishAppLifecycleSnapshot(foreground); vi.useRealTimers(); });

describe('upload task ownership', () => {
  it('cancels only when a selected upload source becomes unavailable and leaves the old task canceled after re-enabling', () => {
    const account = createMaimaiBoundAccount({ providerId: 'lxns', playerId: 'source', displayName: '来源', rating: 0 });
    const signal = controller.begin(false, [account]);
    const canceled = vi.fn(); signal.onCancel!(canceled);
    setDisabledPlugins([getDataSource('diving-fish')!.id]);
    expect(signal.aborted).toBe(false);
    setDisabledPlugins([getDataSource('lxns')!.id]);
    expect(signal.aborted).toBe(true);
    expect(canceled).toHaveBeenCalledOnce();
    setDisabledPlugins([]);
    expect(controller.isCurrent(signal)).toBe(false);
  });

  it('keeps a canceled native task occupied until cleanup settles', () => {
    const first = controller.begin(true);
    controller.cancel();
    expect(first.aborted).toBe(true);
    expect(controller.getSnapshot()).toMatchObject({ status: 'running', phase: { kind: 'canceling' } });
    expect(controller.begin()).toBe(first);
    controller.complete({ uploaded: 1, skipped: 0, refreshedAccounts: [], failedAccountNames: [], targetResults: [] }, first);
    expect(controller.getSnapshot().result).toBeNull();
    controller.finishCanceled(first);
    expect(controller.getSnapshot().status).toBe('canceled');
    expect(controller.begin()).not.toBe(first);
  });
  it('starts a new catalog request immediately and discards a canceled request arriving later', async () => {
    const old = deferred<CatalogSnapshot>(), next = deferred<CatalogSnapshot>();
    const request = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    controller.attachCatalogSource(undefined, request);
    const first = controller.begin();
    const previous = controller.waitForCatalog(first);
    const canceled = expect(previous).rejects.toThrow('已取消');
    await Promise.resolve();
    controller.cancel();
    const second = controller.begin();
    const current = controller.waitForCatalog(second);
    const settled = vi.fn(); void current.then(settled);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    old.resolve(catalog('old')); await canceled; await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(controller.getSnapshot().phase.kind).toBe('syncing_catalog');
    next.resolve(catalog('new'));
    await expect(current).resolves.toEqual(catalog('new'));
  });

  it('cancels a foreground wait without waiting for another app lifecycle event', async () => {
    publishAppLifecycleSnapshot({ ...foreground, phase: 'background', foregroundReady: false });
    const signal = controller.begin();
    const pending = signal.waitUntilResumed!();
    controller.cancel();
    await expect(pending).rejects.toThrow('已取消');
  });

  it('ignores old progress, completion and cancellation settlement after an immediate restart', () => {
    const first = controller.begin(); controller.cancel();
    const second = controller.begin();
    controller.setPhase({ kind: 'error', message: 'old' }, first);
    controller.complete({ uploaded: 1, skipped: 0, refreshedAccounts: [], failedAccountNames: [], targetResults: [] }, first);
    controller.finishCanceled(first);
    expect(controller.getSnapshot()).toMatchObject({ status: 'running', phase: { kind: 'logging_in' }, result: null });
    expect(controller.isCurrent(first)).toBe(false);
    expect(controller.isCurrent(second)).toBe(true);
  });

  it('rejects an old waiter even when a catalog is already available', async () => {
    const first = controller.begin(); controller.cancel(); controller.begin();
    controller.attachCatalogSource(catalog('available'));
    await expect(controller.waitForCatalog(first)).rejects.toThrow('已取消');
  });

  it('does not let the preceding completion timer reset a new task', () => {
    vi.useFakeTimers();
    const first = controller.begin();
    controller.setPhase({ kind: 'done', message: '', uploaded: 1, skipped: 0 }, first);
    const second = controller.begin();
    vi.advanceTimersByTime(5_000);
    expect(controller.getSnapshot().phase.kind).toBe('logging_in');
    expect(controller.getSignal()).toBe(second);
  });

  it('releases all cancel consumers when one observer throws', async () => {
    const first = controller.begin();
    first.onCancel!(() => { throw new Error('observer'); });
    const released = vi.fn(); first.onCancel!(released);
    controller.pause(); const waiting = first.waitUntilResumed!();
    controller.cancel();
    await expect(waiting).rejects.toThrow('已取消'); expect(released).toHaveBeenCalledOnce();
  });
});
