import { maimaiDxTagChartId, type MaimaiDxTagLibrary, type MaimaiDxTagSnapshot } from '@/domain/maimai-dxtag';
import type { CatalogSnapshot } from '@/domain/models';
import { z } from 'zod';
import { loadMaimaiDxTag, maimaiDxTagLibrarySchema } from '@/providers/maimai-dxtag';
import { staleCached } from '@/services/cache-first';
import { cacheSourceSchema, captureResourceWrites } from '@/services/snapshot-cache-utils';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

export const MAIMAI_DXTAG_RESOURCE_PREFIX = 'maimai:dxtag:';
const RESOURCE_KEY = `${MAIMAI_DXTAG_RESOURCE_PREFIX}all`;
const SCHEMA_VERSION = 1;
const repository = new SqliteSnapshotRepository();
const cachedSchema = z.object({ library: maimaiDxTagLibrarySchema, source: cacheSourceSchema('generated') });

export async function loadCachedMaimaiDxTag(catalog: CatalogSnapshot, signal?: AbortSignal): Promise<MaimaiDxTagSnapshot> {
  const assertCurrent = captureResourceWrites('maimai', signal);
  const cached = await repository.getResource(RESOURCE_KEY, SCHEMA_VERSION, cachedSchema);
  assertCurrent();
  if (cached && catalog.songs.every(song => song.charts.every(chart => {
    const id = maimaiDxTagChartId(song.id, chart.type);
    return id === null || cached.library[id]?.some(row => row.difficulty === chart.levelIndex);
  }))) return cached;
  let library: MaimaiDxTagLibrary;
  try {
    library = await loadMaimaiDxTag(signal);
  } catch (error) {
    assertCurrent();
    if (cached) return staleCached(cached);
    throw error;
  }
  assertCurrent();
  const fresh: MaimaiDxTagSnapshot = {
    library,
    source: { kind: 'generated', label: 'DXTag', updatedAt: new Date().toISOString(), isStale: false },
  };
  await repository.saveResource(RESOURCE_KEY, SCHEMA_VERSION, fresh.source.updatedAt, fresh, assertCurrent);
  return fresh;
}
