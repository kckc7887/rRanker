import { captureResourceWrites, createInflightGuard, snapshotSource } from '@/services/snapshot-cache-utils';
import {
  CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
  chunithmPersonalResourceKey,
  emptyChunithmBests,
  type ChunithmBests,
  type ChunithmPersonalSnapshot,
  type ChunithmPlayer,
  type ChunithmScore,
} from '@/domain/chunithm-personal';
import type { ChunithmScoreProvider } from '@/providers/chunithm-score-provider';
import type { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';
import { loadItemsBounded } from '@/services/offset-pagination';
import {
  assertFreshSnapshotSource,
  cachedSnapshotSource,
  cancelledRefresh,
  failedRefresh,
  partialRefresh,
  refreshFailureFromError,
  snapshotMetadataOf,
  successfulRefresh,
  type RefreshResult,
  type SnapshotMetadata,
} from '@/domain/refresh-result';
import { getForegroundAbortSignal } from '@/state/app-lifecycle-core';

const inflightChunithmRefreshes = createInflightGuard<string>();

export type ChunithmPersonalPart = 'player' | 'scores' | 'bests';

const CHUNITHM_PERSONAL_PARTS: readonly ChunithmPersonalPart[] = ['player', 'scores', 'bests'];
const CHUNITHM_PERSONAL_SOURCE = { kind: 'lxns', label: '落雪咖啡屋' } as const;

type ChunithmPartValue = ChunithmPlayer | null | ChunithmScore[] | ChunithmBests;

export class ChunithmPersonalService {
  constructor(
    private readonly provider: ChunithmScoreProvider,
    private readonly repository: SqliteSnapshotRepository,
    private readonly accountId: string,
  ) {}

  async loadCached(): Promise<ChunithmPersonalSnapshot | null> {
    const key = chunithmPersonalResourceKey(this.accountId);
    const cached = await this.repository.getResource<ChunithmPersonalSnapshot>(
      key,
      CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
    );
    return cached ? { ...cached, source: cachedSnapshotSource(cached.source) } : null;
  }

  private loadPart(part: ChunithmPersonalPart, signal: AbortSignal): Promise<ChunithmPartValue> {
    if (part === 'player') return this.provider.getPlayer(signal);
    if (part === 'scores') return this.provider.getScores(signal);
    return this.provider.getBests(signal);
  }

  private async save(snapshot: ChunithmPersonalSnapshot, assertCurrent: () => void): Promise<void> {
    await this.repository.saveResource(
      chunithmPersonalResourceKey(this.accountId),
      CHUNITHM_PERSONAL_SNAPSHOT_SCHEMA_VERSION,
      snapshot.source.updatedAt,
      snapshot,
      assertCurrent,
    );
  }

  private static previousMetadata(previous: ChunithmPersonalSnapshot | null): SnapshotMetadata | null {
    if (!previous || previous.source.kind === 'cache') return null;
    return snapshotMetadataOf(previous.source);
  }

  async refresh(
    signal: AbortSignal = getForegroundAbortSignal(),
  ): Promise<RefreshResult<ChunithmPersonalSnapshot, ChunithmPersonalPart>> {
    try {
      return await inflightChunithmRefreshes.share(this.accountId, requestSignal => this.runRefresh(requestSignal), signal);
    } catch (error) {
      if (signal.aborted) return cancelledRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>(CHUNITHM_PERSONAL_PARTS);
      throw error;
    }
  }

  private async runRefresh(
    signal: AbortSignal,
  ): Promise<RefreshResult<ChunithmPersonalSnapshot, ChunithmPersonalPart>> {
    const assertCurrent = captureResourceWrites('chunithm', signal, this.accountId);
    const previous = await this.loadCached();
    assertCurrent();
    const parts = new Map<ChunithmPersonalPart, ChunithmPartValue>();
    const failures = await loadItemsBounded({
      items: CHUNITHM_PERSONAL_PARTS,
      concurrency: CHUNITHM_PERSONAL_PARTS.length,
      signal,
      load: part => this.loadPart(part, signal),
      onItem: (value, part) => { parts.set(part, value); },
    });
    if (signal.aborted) return cancelledRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>(CHUNITHM_PERSONAL_PARTS);
    assertCurrent();
    const completed = CHUNITHM_PERSONAL_PARTS.filter(part => parts.has(part));
    const refreshFailures = failures
      .map(({ item, error }) => refreshFailureFromError(error, item))
      .sort((left, right) => (
        CHUNITHM_PERSONAL_PARTS.indexOf(left.target as ChunithmPersonalPart)
        - CHUNITHM_PERSONAL_PARTS.indexOf(right.target as ChunithmPersonalPart)
      ));
    if (refreshFailures.length === 0) {
      const source = snapshotSource(CHUNITHM_PERSONAL_SOURCE);
      assertFreshSnapshotSource(source);
      const snapshot: ChunithmPersonalSnapshot = {
        player: (parts.get('player') ?? null) as ChunithmPlayer | null,
        scores: (parts.get('scores') ?? []) as ChunithmScore[],
        bests: (parts.get('bests') ?? emptyChunithmBests()) as ChunithmBests,
        source,
      };
      await this.save(snapshot, assertCurrent);
      return successfulRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>({
        value: snapshot, metadata: snapshotMetadataOf(source), requested: CHUNITHM_PERSONAL_PARTS,
      });
    }
    const metadata = ChunithmPersonalService.previousMetadata(previous);
    const usable = metadata && previous ? previous : null;
    if (completed.length === 0 || !usable) {
      return failedRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>({
        value: usable ? { ...usable, source: cachedSnapshotSource(usable.source) } : null,
        metadata,
        requested: CHUNITHM_PERSONAL_PARTS,
        completed,
        failures: refreshFailures,
      });
    }
    const merged: ChunithmPersonalSnapshot = {
      player: parts.has('player') ? (parts.get('player') as ChunithmPlayer | null) : usable.player,
      scores: parts.has('scores') ? (parts.get('scores') as ChunithmScore[]) : usable.scores,
      bests: parts.has('bests') ? (parts.get('bests') as ChunithmBests) : usable.bests,
      source: cachedSnapshotSource(usable.source),
    };
    await this.save(merged, assertCurrent);
    return partialRefresh<ChunithmPersonalSnapshot, ChunithmPersonalPart>({
      value: merged,
      metadata: snapshotMetadataOf(usable.source),
      requested: CHUNITHM_PERSONAL_PARTS,
      completed,
      failures: refreshFailures,
    });
  }
}
