import { create } from 'zustand';

export type PinsByGame<T> = Record<string, T[]>;
type PinPreferences<T> = { load(): Promise<PinsByGame<T>>; save(value: PinsByGame<T>): Promise<void> };
type PinsState<T> = {
  hydrated: boolean;
  pinsByGame: PinsByGame<T>;
  hydrate(): Promise<void>;
  toggle(gameId: string, item: T): Promise<void>;
};

export function createPinsStore<T>(preferences: PinPreferences<T>, sameItem: (a: T, b: T) => boolean = Object.is) {
  let hydration: Promise<void> | undefined;
  let writes = Promise.resolve();
  return create<PinsState<T>>((set, get) => ({
    hydrated: false,
    pinsByGame: {},
    hydrate: async () => {
      if (get().hydrated) return;
      hydration ??= preferences.load().then(pinsByGame => {
        set({ hydrated: true, pinsByGame });
      }).finally(() => { hydration = undefined; });
      await hydration;
    },
    toggle: (gameId, item) => {
      const operation = writes.then(async () => {
        await get().hydrate();
        const previous = get().pinsByGame;
        const current = previous[gameId] ?? [];
        const next = current.some(entry => sameItem(entry, item))
          ? current.filter(entry => !sameItem(entry, item)) : [...current, item];
        const pinsByGame = { ...previous, [gameId]: next };
        set({ pinsByGame });
        try { await preferences.save(pinsByGame); }
        catch (error) { set({ pinsByGame: previous }); throw error; }
      });
      writes = operation.catch(() => undefined);
      return operation;
    },
  }));
}
