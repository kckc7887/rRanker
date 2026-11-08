import { z } from 'zod';
import { createPreferencesStore } from '@rranker/sdk/storage/create-preferences-store';

const preferences = createPreferencesStore({
  storeKey: 'plugin-preferences',
  defaults: () => ({ disabledPlugins: [] as string[] }),
  parse: value => z.object({ disabledPlugins: z.array(z.string().min(1)) }).strict().parse(value),
});

export const pluginPreferencesStore = new preferences.Store();
