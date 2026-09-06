import { createPreferencesStore } from './create-preferences-store';
import { isRuntimeLogCapacity, type RuntimeLogPreferences } from '@/domain/runtime-log';

const { Store } = createPreferencesStore<RuntimeLogPreferences>({
  storeKey: 'runtime-log-preferences-v1',
  defaults: () => ({ capacity: 2000, enabled: false }),
  parse: (value) => {
    const capacity = value && typeof value === 'object' && 'capacity' in value ? value.capacity : undefined;
    const enabled = value !== null && typeof value === 'object' && 'enabled' in value && value.enabled === true;
    return { capacity: isRuntimeLogCapacity(capacity) ? capacity : 2000, enabled };
  },
});
export const runtimeLogPreferencesStore = new Store();
