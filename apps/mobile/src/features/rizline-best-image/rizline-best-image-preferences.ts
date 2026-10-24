import { z } from 'zod';
import { createPreferencesStore } from '@/storage/create-preferences-store';
import type { ImageCrop } from '@/components/image-crop';

export type RizlineImagePreferences = {
  avatar: { songId: string | null; crop: ImageCrop | null }; layoutId: string;
  signature1: string | null; signature2: string | null; backgroundId: string | null;
};
export const DEFAULT_RIZLINE_IMAGE_PREFERENCES: RizlineImagePreferences = {
  avatar: { songId: null, crop: null }, layoutId: 'layout.00001', signature1: null, signature2: null, backgroundId: null,
};
const coordinate = z.number().min(0).max(1);
const crop = z.object({ x: coordinate, y: coordinate, width: coordinate.positive(), height: coordinate.positive() })
  .refine(value => value.x + value.width <= 1.000001 && value.y + value.height <= 1.000001);
const schema = z.object({
  avatar: z.object({ songId: z.string().nullable(), crop: crop.nullable() }), layoutId: z.string(),
  signature1: z.string().nullable(), signature2: z.string().nullable(), backgroundId: z.string().nullable(),
});
const { Store } = createPreferencesStore<RizlineImagePreferences, string>({
  storeKey: id => `rranker.rizline-best-image:${id}`, defaults: () => DEFAULT_RIZLINE_IMAGE_PREFERENCES,
  parse: value => schema.parse(value),
});
export const rizlineImagePreferencesStore = new Store();
