import { createPreferencesStore } from './create-preferences-store';
import { isRuntimeLogCapacity, type RuntimeLogCapacity } from '@/domain/runtime-log';

const { Store } = createPreferencesStore<{ capacity: RuntimeLogCapacity }>({
  storeKey: 'runtime-log-preferences-v1',
  defaults: () => ({ capacity: 2000 }),
  parse: (value) => {
    const capacity = value && typeof value === 'object' && 'capacity' in value ? value.capacity : undefined;
    return { capacity: isRuntimeLogCapacity(capacity) ? capacity : 2000 };
  },
});
export const runtimeLogPreferencesStore = new Store();
