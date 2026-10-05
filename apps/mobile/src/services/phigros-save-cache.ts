import type { PhigrosGameDataPayload } from '@/domain/game-data';
import { staleCached } from '@/services/cache-first';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { z } from 'zod';
import { DataSourceSchema, PlayerSchema, ScoreRecordSchema } from '@/domain/schemas';

export type { PhigrosGameDataPayload } from '@/domain/game-data';

const PHIGROS_SAVE_SCHEMA_VERSION = 1;
const progressCounts = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative(), z.number().int().nonnegative()]);
const payloadSchema: z.ZodType<PhigrosGameDataPayload> = z.object({
  kind: z.literal('phigros'), resourceRevision: z.string().optional(), player: PlayerSchema,
  records: z.array(ScoreRecordSchema),
  bestSections: z.array(z.object({ id: z.string(), title: z.string(), records: z.array(ScoreRecordSchema) })),
  playerScore: z.object({ label: z.string(), value: z.number().finite(), display: z.string() }),
  challengeModeRank: z.number().finite(), source: DataSourceSchema, saveUpdatedAt: z.string(), catalogSource: DataSourceSchema,
  avatarUrl: z.string().nullable().optional(), avatarKey: z.string().nullable().optional(), backgroundSongId: z.string().nullable().optional(),
  dataAmount: z.string(), progress: z.object({ cleared: progressCounts, fullCombo: progressCounts, phi: progressCounts }),
}).passthrough();

function phigrosSaveResourceKey(accountId: string): string {
  return `phigros-save:${accountId}`;
}

export function stalePhigrosPayload(payload: PhigrosGameDataPayload): PhigrosGameDataPayload {
  return {
    ...payload,
    source: staleCached(payload.source),
    catalogSource: staleCached(payload.catalogSource),
  };
}

export class PhigrosSaveCache {
  private readonly repository = new SqliteSnapshotRepository();

  async load(accountId: string): Promise<PhigrosGameDataPayload | null> {
    return this.repository.getResource(
      phigrosSaveResourceKey(accountId),
      PHIGROS_SAVE_SCHEMA_VERSION,
      payloadSchema,
    );
  }

  async save(accountId: string, payload: PhigrosGameDataPayload, assertCurrent?: () => void): Promise<void> {
    await this.repository.saveResource(
      phigrosSaveResourceKey(accountId),
      PHIGROS_SAVE_SCHEMA_VERSION,
      payload.saveUpdatedAt,
      payload, assertCurrent,
    );
  }
}
