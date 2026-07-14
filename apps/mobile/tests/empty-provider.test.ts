import { EmptyCatalogProvider, EmptyScoreProvider } from '@/providers/empty-provider';
import { ScoreService } from '@/services/score-service';

describe('empty test game providers', () => {
  it('loads an all-empty score snapshot', async () => {
    const snapshot = await new ScoreService(
      new EmptyScoreProvider(),
      new EmptyCatalogProvider(),
      'test:empty',
    ).load();
    expect(snapshot.player.displayName).toBe('测试游戏');
    expect(snapshot.player.rating).toBe(0);
    expect(snapshot.records).toEqual([]);
    expect(snapshot.best50.b35).toEqual([]);
    expect(snapshot.best50.b15).toEqual([]);
    expect(snapshot.best50.rating).toBe(0);
    expect(snapshot.source.label).toBe('测试游戏');
    expect(snapshot.catalogSource.label).toBe('测试游戏');
  });
});
