import type { GameId } from '@/domain/game-bind-options';
import { getGameProfile } from '@/domain/game-profile';
import { getGameToolbox, summarizeGameTools } from '@/domain/game-toolbox';

describe('per-game toolbox registry', () => {
  it('keeps the maimai tools in its own toolbox', () => {
    const toolbox = getGameToolbox('maimai');
    expect(toolbox.tools.map((tool) => tool.id)).toEqual([
      'rating',
      'tolerance',
      'plates',
      'versions',
    ]);
    expect(summarizeGameTools('maimai')).toBe('Rating · 达成率/容错 · 牌子进度 · 版本对照');
  });

  it('gives Phigros an independent empty toolbox ready for later registration', () => {
    expect(getGameToolbox('phigros').tools).toEqual([]);
    expect(summarizeGameTools('phigros')).toBe('Phigros 工具正在准备中。');
  });

  it('keeps profile capabilities consistent with registered tools', () => {
    const gameIds: GameId[] = ['maimai', 'phigros', 'test'];
    for (const gameId of gameIds) {
      expect(getGameProfile(gameId).capabilities.hasTools)
        .toBe(getGameToolbox(gameId).tools.length > 0);
    }
  });
});
