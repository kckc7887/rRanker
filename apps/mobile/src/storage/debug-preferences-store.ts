import { z } from 'zod';
import { createPreferencesStore } from './create-preferences-store';

export type DebugPreferences = { testAccountsEnabled: boolean };

const { Store } = createPreferencesStore<DebugPreferences>({
  storeKey: 'debug-preferences-v1',
  defaults: () => ({ testAccountsEnabled: false }),
  parse: value => z.object({ testAccountsEnabled: z.boolean() }).parse(value),
});

export const DebugPreferencesStore = Store;
export const debugPreferencesStore = new Store();
