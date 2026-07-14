import type { AliasSnapshot, CatalogSnapshot, DataSource, PlateSnapshot, Player } from '@/domain/models';
import type { DetailedCatalogProvider, ScoreProvider } from './contracts';

const emptySource = (): DataSource => ({
  kind: 'fixture',
  label: '测试游戏',
  updatedAt: new Date().toISOString(),
  isStale: false,
});

/** 测试游戏：成绩与曲库均为空，用于验证切换链路。 */
export class EmptyScoreProvider implements ScoreProvider {
  async getPlayer(): Promise<Player> {
    return {
      id: 'test-empty',
      displayName: '测试游戏',
      rating: 0,
      additionalRating: 0,
      source: emptySource(),
    };
  }

  async getRecords() {
    return [];
  }
}

export class EmptyCatalogProvider implements DetailedCatalogProvider {
  async getCatalog(): Promise<CatalogSnapshot> {
    return {
      currentVersion: { id: 0, title: '—' },
      versions: [],
      songs: [],
      chartVersionIndex: {},
      source: emptySource(),
    };
  }

  async getDetailedCatalog() {
    return this.getCatalog();
  }

  async getAliases(): Promise<AliasSnapshot> {
    return { aliases: [], source: emptySource() };
  }

  async getPlates(): Promise<PlateSnapshot> {
    return { plates: [], source: emptySource() };
  }
}
