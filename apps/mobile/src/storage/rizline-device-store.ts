import { z } from 'zod';
import { randomUUID } from 'expo-crypto';
import { createPreferencesStore } from './create-preferences-store';

const { Store } = createPreferencesStore<string | null>({
  storeKey: 'rranker.rizline.device.v1',
  defaults: () => null,
  parse: value => z.string().regex(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu).nullable().parse(value),
});
let device: Promise<string> | undefined;

export function getRizlineDeviceId(): Promise<string> {
  if (!device) {
    device = (async () => {
      const store = new Store();
      const stored = await store.load();
      if (stored) return stored;
      const id = randomUUID();
      await store.save(id);
      return id;
    })().catch(error => { device = undefined; throw error; });
  }
  return device;
}
