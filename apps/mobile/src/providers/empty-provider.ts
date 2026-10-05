import type { DataSource, Player } from '@/domain/models';
import type { ScoreProvider } from './contracts';

const emptySource = (): DataSource => ({
  kind: 'fixture',
  label: '测试游戏',
  updatedAt: new Date().toISOString(),
  isStale: false,
});

export class EmptyScoreProvider implements ScoreProvider {
  async getPlayer(): Promise<Player> {
    return {
      id: 'test-empty',
      displayName: '测试游戏',
      rating: 0,
      source: emptySource(),
    };
  }

  async getRecords() {
    return [];
  }
}
