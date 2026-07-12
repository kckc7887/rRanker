import { buildBest50 } from '@/domain/rating';
import { fixturePlayer, fixtureRecords, fixtureSongs, fixtureSource } from '@/fixtures/sanitized';
import type { ScoreProvider } from './contracts';

export class FixtureProvider implements ScoreProvider {
  async getPlayer() { return structuredClone(fixturePlayer); }
  async getRecords() { return structuredClone(fixtureRecords); }
  async getBest50(currentVersion: string) {
    return buildBest50(await this.getPlayer(), await this.getRecords(), currentVersion, fixtureSource, fixtureSource.updatedAt);
  }
  async getSongs() { return structuredClone(fixtureSongs); }
  async getChartStats() { return {}; }
}
