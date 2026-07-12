import { fixtureCatalog, fixturePlayer, fixtureRecords } from '@/fixtures/sanitized';
import type { CatalogProvider, ScoreProvider } from './contracts';

export class FixtureProvider implements ScoreProvider {
  async getPlayer() { return structuredClone(fixturePlayer); }
  async getRecords() { return structuredClone(fixtureRecords); }
}

export class FixtureCatalogProvider implements CatalogProvider {
  async getCatalog() { return structuredClone(fixtureCatalog); }
}
