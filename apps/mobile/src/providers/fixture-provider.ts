import { fixtureCatalog, fixturePlayer, fixtureRecords } from '@/fixtures/sanitized';
import type { DetailedCatalogProvider, ScoreProvider } from './contracts';

export class FixtureProvider implements ScoreProvider {
  async getPlayer() { return structuredClone(fixturePlayer); }
  async getRecords() { return structuredClone(fixtureRecords); }
}

export class FixtureCatalogProvider implements DetailedCatalogProvider {
  async getCatalog() { return structuredClone(fixtureCatalog); }
  async getDetailedCatalog() { return structuredClone(fixtureCatalog); }
  async getAliases() {
    return {
      aliases: [{ songId: '1', aliases: ['测试别名', 'alias a'] }],
      source: structuredClone(fixtureCatalog.source),
    };
  }
  async getPlates() {
    return {
      plates: [{
        id: 1, name: '测试牌子', description: '脱敏验收数据',
        requirements: [{ difficulties: [3], rate: 'sss', fc: null, fs: null, songs: ['1', '2'] }],
      }],
      source: structuredClone(fixtureCatalog.source),
    };
  }
}
