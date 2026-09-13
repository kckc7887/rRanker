import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DebugPreferencesStore } from '@/storage/debug-preferences-store';

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

it('defaults to disabled for missing, malformed and non-boolean preferences, and persists the choice', async () => {
  let raw: string | null = null;
  const storage = {
    getItem: async () => raw,
    setItem: async (_key: string, value: string) => { raw = value; },
    removeItem: async () => { raw = null; },
  };
  for (const value of [null, '{', '{}', '{"testAccountsEnabled":"true"}']) {
    raw = value;
    await expect(new DebugPreferencesStore(storage).load()).resolves.toEqual({ testAccountsEnabled: false });
  }
  await new DebugPreferencesStore(storage).save({ testAccountsEnabled: true });
  await expect(new DebugPreferencesStore(storage).load()).resolves.toEqual({ testAccountsEnabled: true });
  await new DebugPreferencesStore(storage).save({ testAccountsEnabled: false });
  await expect(new DebugPreferencesStore(storage).load()).resolves.toEqual({ testAccountsEnabled: false });
});

it('shares initialization and does not reveal a persisted enabled choice before the read completes', async () => {
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  let finish!: (value: { testAccountsEnabled: boolean }) => void;
  const load = vi.spyOn(debugPreferencesStore, 'load').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { useDebugStore } = await import('@/state/debug-store');
  const first = useDebugStore.getState().hydrate();
  expect(useDebugStore.getState().hydrate()).toBe(first);
  expect(useDebugStore.getState()).toMatchObject({ hydrated: false, testAccountsEnabled: false });
  finish({ testAccountsEnabled: true });
  await first;
  expect(load).toHaveBeenCalledTimes(1);
  expect(useDebugStore.getState()).toMatchObject({ hydrated: true, testAccountsEnabled: true });
});

it('waits for initialization before committing a user change', async () => {
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  let finish!: (value: { testAccountsEnabled: boolean }) => void;
  vi.spyOn(debugPreferencesStore, 'load').mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const save = vi.spyOn(debugPreferencesStore, 'save').mockResolvedValue();
  const { useDebugStore } = await import('@/state/debug-store');
  const pending = useDebugStore.getState().setTestAccountsEnabled(false);
  await Promise.resolve();
  expect(save).not.toHaveBeenCalled();
  finish({ testAccountsEnabled: true });
  await pending;
  expect(save).toHaveBeenCalledWith({ testAccountsEnabled: false });
  expect(useDebugStore.getState()).toMatchObject({ hydrated: true, testAccountsEnabled: false, saving: false });
});

it('serializes writes, preserves the last saved state on failure, and permits retry', async () => {
  const { debugPreferencesStore } = await import('@/storage/debug-preferences-store');
  vi.spyOn(debugPreferencesStore, 'load').mockResolvedValue({ testAccountsEnabled: false });
  const save = vi.spyOn(debugPreferencesStore, 'save').mockRejectedValueOnce(new Error('disk full')).mockResolvedValue();
  const { useDebugStore } = await import('@/state/debug-store');
  await expect(useDebugStore.getState().setTestAccountsEnabled(true)).rejects.toThrow('disk full');
  expect(useDebugStore.getState()).toMatchObject({ testAccountsEnabled: false, saving: false });
  let finish!: () => void;
  save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  const first = useDebugStore.getState().setTestAccountsEnabled(true);
  const second = useDebugStore.getState().setTestAccountsEnabled(false);
  await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(useDebugStore.getState()).toMatchObject({ testAccountsEnabled: false, saving: true });
  finish();
  await Promise.all([first, second]);
  expect(save.mock.calls.map(([value]) => value.testAccountsEnabled)).toEqual([true, true, false]);
  expect(useDebugStore.getState()).toMatchObject({ testAccountsEnabled: false, saving: false });
});
