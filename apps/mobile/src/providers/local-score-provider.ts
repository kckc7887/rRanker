import type { DataSource, Player } from '@/domain/models';
import type { ScoreProvider } from '@/providers/contracts';
import type { SnapshotRepository } from '@/repositories/snapshot-repository';
import { LOCAL_MAIMAI_ACCOUNT_ID } from '@/domain/bound-account';

function localSource(): DataSource {
  return {
    kind: 'local',
    label: '本地查分器',
    updatedAt: new Date().toISOString(),
    isStale: false,
  };
}

export class LocalMaimaiScoreProvider implements ScoreProvider {
  constructor(
    private readonly repository: SnapshotRepository,
    private readonly accountId = LOCAL_MAIMAI_ACCOUNT_ID,
    private readonly displayName = '本地玩家',
  ) {}

  private snapshot() {
    return this.repository.getLatest(this.accountId);
  }

  async getPlayer(): Promise<Player> {
    const snapshot = await this.snapshot();
    return snapshot ? {
      ...snapshot.player,
      id: this.accountId,
      displayName: this.displayName,
    } : {
      id: this.accountId,
      displayName: this.displayName,
      rating: 0,
      additionalRating: 0,
      source: localSource(),
    };
  }

  async getRecords() {
    return (await this.snapshot())?.records ?? [];
  }
}
