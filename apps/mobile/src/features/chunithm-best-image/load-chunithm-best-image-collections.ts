import { loadChunithmCollections } from '@/services/chunithm-collection-loader';

export type ChunithmBestImageCollectionItem = {
  id: number;
  name: string;
  kind: 'character' | 'plate';
};

export async function loadChunithmBestImageCollections(kind: 'character' | 'plate', signal?: AbortSignal): Promise<ChunithmBestImageCollectionItem[]> {
  const snapshot = await loadChunithmCollections(kind, signal);
  return snapshot.items.map(item => ({ id: item.id, name: item.name?.trim() || `#${item.id}`, kind }));
}
