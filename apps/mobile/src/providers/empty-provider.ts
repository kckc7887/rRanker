import type { DataSource, Player } from '@/domain/models';
import type { ScoreProvider } from './contracts';

const emptySource = (): DataSource => ({
  kind: 'fixture',
  label: '测试游戏',
  updatedAt: new Date().toISOString(),
  isStale: false,
});

/** 测试游戏和未绑定会话共用的空成绩入口。 */
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
