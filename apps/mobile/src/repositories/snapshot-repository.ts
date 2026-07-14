import type { ScoreSnapshot } from '@/domain/models';
export interface SnapshotRepository {
  initialize(): Promise<void>;
  getLatest(accountId: string): Promise<ScoreSnapshot | null>;
  save(accountId: string, snapshot: ScoreSnapshot): Promise<void>;
  clear(accountId?: string): Promise<void>;
}
