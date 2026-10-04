import type { OsuGameId } from '@/domain/game-mode-family';
import {
  OSU_SNAPSHOT_SCHEMA_VERSION,
  OSU_KNOWN_SCORES_SCHEMA_VERSION,
  OsuKnownScoresSnapshotSchema,
  OsuSnapshotSchema,
  normalizeOsuSnapshot,
  osuKnownScoresCacheKey,
  osuSnapshotCacheKey,
  type OsuBestScore,
  type OsuKnownScoresSnapshot,
  type OsuSnapshot,
  type OsuSnapshotData,
} from '@/domain/osu';
import { OsuScoreProvider } from '@/providers/osu-score-provider';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import type { AtomicResourceRepository, ResourceMaintenanceRepository } from '@/repositories/resource-repository';
import {
  clearResourcesByPrefix,
  createInflightGuard, resourceWriteGeneration,
  makeSnapshot,
  snapshotSource,
} from '@/services/snapshot-cache-utils';

export function makeOsuSnapshot(
  data: OsuSnapshotData,
  updatedAt = new Date().toISOString(),
): OsuSnapshot {
  return makeSnapshot(data, { kind: 'osu', label: 'osu.ppy.sh' }, updatedAt);
}

const inflightLoads = createInflightGuard<string>();

function scoreContent(score: OsuBestScore): string {
  return JSON.stringify(score, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value);
}

export function loadOsuSnapshotFresh(
  provider: OsuScoreProvider,
  gameId: OsuGameId,
  userId: number,
  signal?: AbortSignal,
): Promise<OsuSnapshot> {
  return inflightLoads.share(`${gameId}:${resourceWriteGeneration(gameId)}:${resourceWriteGeneration(`account:${gameId}:osu:${userId}`)}:${userId}`, async requestSignal => {
    const [user, bestScores] = await Promise.all([
      provider.getUser(userId, gameId, requestSignal),
      provider.getBestScores(userId, gameId, 100, requestSignal),
    ]);
    return makeOsuSnapshot(normalizeOsuSnapshot(user, bestScores));
  }, signal);
}

export class OsuCache {
  constructor(private readonly repository: AtomicResourceRepository & ResourceMaintenanceRepository = new SqliteSnapshotRepository()) {}

  async load(gameId: OsuGameId, userId: number): Promise<OsuSnapshot | null> {
    const raw = await this.repository.getResource<unknown>(
      osuSnapshotCacheKey(gameId, userId),
      OSU_SNAPSHOT_SCHEMA_VERSION,
    );
    if (!raw) return null;
    const parsed = OsuSnapshotSchema.safeParse(raw);
    return parsed.success ? (parsed.data as OsuSnapshot) : null;
  }

  async save(
    gameId: OsuGameId,
    userId: number,
    snapshot: OsuSnapshot, assertCurrent?: () => void,
  ): Promise<void> {
    await this.repository.saveResource(
      osuSnapshotCacheKey(gameId, userId),
      OSU_SNAPSHOT_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot, assertCurrent,
    );
  }

  async loadKnownScores(gameId: OsuGameId, userId: number): Promise<OsuKnownScoresSnapshot | null> {
    const raw = await this.repository.getResource<unknown>(
      osuKnownScoresCacheKey(gameId, userId),
      OSU_KNOWN_SCORES_SCHEMA_VERSION,
    );
    if (!raw) return null;
    const parsed = OsuKnownScoresSnapshotSchema.safeParse(raw);
    return parsed.success ? (parsed.data as OsuKnownScoresSnapshot) : null;
  }

  async saveKnownScores(
    gameId: OsuGameId,
    userId: number,
    snapshot: OsuKnownScoresSnapshot, assertCurrent?: () => void,
  ): Promise<void> {
    await this.repository.saveResource(
      osuKnownScoresCacheKey(gameId, userId),
      OSU_KNOWN_SCORES_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot, assertCurrent,
    );
  }

  async mergeKnownScores(
    gameId: OsuGameId,
    userId: number,
    scores: readonly OsuBestScore[], assertCurrent?: () => void,
  ): Promise<OsuKnownScoresSnapshot> {
    return this.repository.updateResource<OsuKnownScoresSnapshot>(
      osuKnownScoresCacheKey(gameId, userId), OSU_KNOWN_SCORES_SCHEMA_VERSION, (previous) => {
    const parsed = OsuKnownScoresSnapshotSchema.safeParse(previous);
    const existingSnapshot = parsed.success ? parsed.data as OsuKnownScoresSnapshot : null;
    const items = { ...(existingSnapshot?.items ?? {}) };
    let changed = false;
    for (const score of scores) {
      const key = String(score.beatmap.id);
      const existing = items[key];
      if (!existing || (score.score >= existing.score && scoreContent(existing) !== scoreContent(score))) {
        items[key] = score;
        changed = true;
      }
    }
    if (!changed && existingSnapshot) return { value: existingSnapshot, write: false };
    const snapshot: OsuKnownScoresSnapshot = {
      items,
      source: snapshotSource({ kind: 'osu', label: 'osu.ppy.sh' }),
    };
    return { value: snapshot, updatedAt: snapshot.source.updatedAt };
    }, assertCurrent);
  }

  async clear(gameId: OsuGameId, userId: number): Promise<void> {
    await clearResourcesByPrefix(this.repository, {
      keys: [osuSnapshotCacheKey(gameId, userId), osuKnownScoresCacheKey(gameId, userId)],
    });
  }
}
