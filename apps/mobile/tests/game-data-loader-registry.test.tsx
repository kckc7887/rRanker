import { describe, expect, it } from '@jest/globals';
import { GAME_IDS, type GameId } from '@/domain/game-bind-options';
import { GAME_DATA_LOADERS, selectGameDataLoader } from '@/hooks/game-data-loaders';

describe('游戏数据加载器登记', () => {
  it('每个游戏 id 都有独立加载器，不再缺项', () => {
    expect(Object.keys(GAME_DATA_LOADERS).sort()).toEqual([...GAME_IDS].sort());
  });

  it('未登记的 id 不会静默回退到舞萌加载器', () => {
    expect(() => selectGameDataLoader('future-live' as GameId)).toThrow();
  });
});
