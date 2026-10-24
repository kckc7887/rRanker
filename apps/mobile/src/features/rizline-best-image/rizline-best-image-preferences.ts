import { z } from 'zod';
import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { ImageCrop } from '@/components/image-crop';

export type RizlineImageChoice = { mode: 'current' } | { mode: 'item' | 'random'; id: string };
export type RizlineSignatureChoice = RizlineImageChoice | { mode: 'off' };
export type RizlineImagePreferences = {
  avatar: RizlineImageChoice & { crop?: ImageCrop | null };
  namecard: RizlineImageChoice; background: RizlineImageChoice;
  signature1: RizlineSignatureChoice; signature2: RizlineSignatureChoice;
};
export const DEFAULT_RIZLINE_IMAGE_PREFERENCES: RizlineImagePreferences = {
  avatar: { mode: 'current' }, namecard: { mode: 'current' }, background: { mode: 'current' },
  signature1: { mode: 'current' }, signature2: { mode: 'current' },
};
const coordinate = z.number().min(0).max(1);
const crop = z.object({ x: coordinate, y: coordinate, width: coordinate.positive(), height: coordinate.positive() })
  .refine(value => value.x + value.width <= 1.000001 && value.y + value.height <= 1.000001);
const current = z.object({ mode: z.literal('current') });
const item = z.object({ mode: z.enum(['item', 'random']), id: z.string().min(1) });
const choice = z.union([current, item]);
const signature = z.union([current, item, z.object({ mode: z.literal('off') })]);
const schema = z.object({
  avatar: z.union([current, item.extend({ crop: crop.nullable().optional() })]), namecard: choice, background: choice,
  signature1: signature, signature2: signature,
});
const { Store } = createPreferencesStore<RizlineImagePreferences, string>({
  storeKey: id => `rranker.rizline-best-image:${id}`, defaults: () => DEFAULT_RIZLINE_IMAGE_PREFERENCES,
  parse: value => schema.parse(value),
});
export const rizlineImagePreferencesStore = new Store();
