import { z } from 'zod';
import { createPreferencesStore } from './create-preferences-store';
import { isRuntimeLogCapacity, type RuntimeLogPreferences } from '@/domain/runtime-log';

const { Store } = createPreferencesStore<RuntimeLogPreferences>({
  storeKey: 'runtime-log-preferences-v1',
  defaults: () => ({ capacity: 2000, enabled: false }),
  parse: value => z.object({ capacity: z.custom<RuntimeLogPreferences['capacity']>(isRuntimeLogCapacity), enabled: z.boolean() }).parse(value),
});
export const runtimeLogPreferencesStore = new Store();
