import { FIXTURE_CURRENT_VERSION } from '@/fixtures/sanitized';
import { FixtureProvider } from '@/providers/fixture-provider';
import { ScoreService } from '@/services/score-service';
import { SqliteSnapshotRepository } from '@/storage/sqlite-snapshot-repository';

const repository = new SqliteSnapshotRepository();
export const wireframeSnapshotPromise = new ScoreService(new FixtureProvider(), repository).load(FIXTURE_CURRENT_VERSION);
