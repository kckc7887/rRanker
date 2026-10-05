import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPreferencesWriteCoordinator } from '@/services/preferences-write-coordinator';

const disposals: (() => void)[] = [];
afterEach(() => { disposals.splice(0).forEach((dispose) => dispose()); vi.useRealTimers(); });
function fixture() {
  const load = vi.fn(async () => ({ accent: 'blue', appearance: 'dark', blur: 12 }));
  const save = vi.fn(async (_value: { accent: string; appearance: string; blur: number }): Promise<void> => undefined);
  const loaded = vi.fn();
  const failed = vi.fn();
  const coordinator = createPreferencesWriteCoordinator({ load, save, loaded, failed });
  disposals.push(coordinator.dispose);
  return { coordinator, load, save, loaded, failed };
}

describe('preference document writes', () => {
  it('preserves unknown stored fields while applying choices made during a failed read', async () => {
    vi.useFakeTimers();
    const { coordinator, load, save, loaded } = fixture();
    load.mockRejectedValueOnce(new Error('locked'));
    await coordinator.flush();
    coordinator.change({ accent: 'orange' });
    await coordinator.flush();
    expect(loaded).toHaveBeenCalledWith({ accent: 'orange', appearance: 'dark', blur: 12 });
    expect(save).toHaveBeenCalledWith({ accent: 'orange', appearance: 'dark', blur: 12 });
  });

  it('does not write display defaults while storage cannot be read', async () => {
    vi.useFakeTimers();
    const { coordinator, load, save } = fixture();
    load.mockRejectedValue(new Error('unavailable'));
    coordinator.change({ accent: 'orange' });
    await coordinator.flush();
    await vi.advanceTimersByTimeAsync(42_500);
    expect(load).toHaveBeenCalledTimes(5);
    expect(save).not.toHaveBeenCalled();
  });

  it('serializes and coalesces newer fields behind a pending older save', async () => {
    const { coordinator, save } = fixture();
    await coordinator.flush();
    let finish!: () => void;
    save.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    coordinator.change({ accent: 'violet' });
    coordinator.change({ accent: 'orange', blur: 25 });
    expect(save).toHaveBeenCalledTimes(1);
    finish();
    await coordinator.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ accent: 'orange', appearance: 'dark', blur: 25 });
  });

  it('retains the latest selection after an older write fails and retries automatically', async () => {
    vi.useFakeTimers();
    const { coordinator, save } = fixture();
    await coordinator.flush();
    let reject!: (error: Error) => void;
    save.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    coordinator.change({ accent: 'violet' });
    coordinator.change({ accent: 'orange' });
    reject(new Error('locked'));
    await coordinator.flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenLastCalledWith({ accent: 'orange', appearance: 'dark', blur: 12 });
  });

  it('pauses backoff in background and immediately flushes on foreground return', async () => {
    vi.useFakeTimers();
    const { coordinator, save } = fixture();
    await coordinator.flush();
    save.mockRejectedValueOnce(new Error('locked'));
    coordinator.change({ accent: 'orange' });
    await coordinator.flush();
    coordinator.setForeground(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(save).toHaveBeenCalledTimes(1);
    coordinator.setForeground(true);
    await coordinator.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('does not start another native read while the first one is unresolved', async () => {
    vi.useFakeTimers();
    const { coordinator, load, save } = fixture();
    let finish!: (value: { accent: string; appearance: string; blur: number }) => void;
    load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pending = coordinator.flush();
    coordinator.change({ accent: 'orange' });
    coordinator.setForeground(false); coordinator.setForeground(true);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(load).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    finish({ accent: 'blue', appearance: 'dark', blur: 12 });
    await pending;
    expect(save).toHaveBeenCalledWith({ accent: 'orange', appearance: 'dark', blur: 12 });
  });

});
