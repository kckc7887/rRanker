import { z } from 'zod';
import { createPreferencesStore } from '../../storage/create-preferences-store';
import type { PinsByGame } from '../../state/pins';

const schema = z.object({
  version: z.literal(1),
  pinsByGame: z.record(z.string(), z.array(z.string().min(1)).transform(ids => [...new Set(ids)])),
});
const { Store: PinnedToolPreferencesStore } = createPreferencesStore<PinsByGame<string>>({
  storeKey: 'rranker.toolbox.pinned-tools.v1',
  defaults: () => ({}),
  parse: value => schema.parse(value).pinsByGame,
  toStored: pinsByGame => ({ version: 1, pinsByGame }),
});
export { PinnedToolPreferencesStore };
export const pinnedToolPreferencesStore = new PinnedToolPreferencesStore();
