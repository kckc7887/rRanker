import { createPreferencesStore } from './create-preferences-store';

export type DebugPreferences = { testAccountsEnabled: boolean };

const { Store } = createPreferencesStore<DebugPreferences>({
  storeKey: 'debug-preferences-v1',
  defaults: () => ({ testAccountsEnabled: false }),
  parse: (value) => ({
    testAccountsEnabled: value !== null && typeof value === 'object'
      && 'testAccountsEnabled' in value && value.testAccountsEnabled === true,
  }),
});

export const DebugPreferencesStore = Store;
export const debugPreferencesStore = new Store();
