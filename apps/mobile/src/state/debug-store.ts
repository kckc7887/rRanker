import { create } from 'zustand';
import { debugPreferencesStore, type DebugPreferences } from '@/storage/debug-preferences-store';

interface DebugState extends DebugPreferences {
  hydrated: boolean;
  saving: boolean;
  hydrate: () => Promise<void>;
  setTestAccountsEnabled: (enabled: boolean) => Promise<void>;
}

let hydrationPromise: Promise<void> | undefined;
let writeQueue: Promise<void> = Promise.resolve();
let pendingWrites = 0;

export const useDebugStore = create<DebugState>((set, get) => ({
  testAccountsEnabled: false,
  hydrated: false,
  saving: false,
  hydrate: () => {
    hydrationPromise ??= debugPreferencesStore.load().then((preferences) => {
      set({ ...preferences, hydrated: true });
    }).catch((error: unknown) => {
      hydrationPromise = undefined;
      throw error;
    });
    return hydrationPromise;
  },
  setTestAccountsEnabled: (enabled) => {
    pendingWrites += 1;
    set({ saving: true });
    const task = writeQueue.then(async () => {
      await get().hydrate();
      await debugPreferencesStore.save({ testAccountsEnabled: enabled });
      set({ testAccountsEnabled: enabled });
    }).finally(() => {
      pendingWrites -= 1;
      set({ saving: pendingWrites > 0 });
    });
    writeQueue = task.catch(() => undefined);
    return task;
  },
}));
