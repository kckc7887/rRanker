import type { ScoreSnapshot } from '@/domain/models';
export interface SnapshotRepository {
  initialize(): Promise<void>;
  getLatest(): Promise<ScoreSnapshot | null>;
  save(snapshot: ScoreSnapshot): Promise<void>;
  clear(): Promise<void>;
}
