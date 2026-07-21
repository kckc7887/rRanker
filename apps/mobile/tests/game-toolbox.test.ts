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

  it('gives Phigros a push-rks toolbox entry', () => {
    const toolbox = getGameToolbox('phigros');
    expect(toolbox.tools.map((tool) => tool.id)).toEqual(['push-rks']);
    expect(summarizeGameTools('phigros')).toBe('推分');
  });

  it('keeps profile capabilities consistent with registered tools', () => {
    const gameIds: GameId[] = ['maimai', 'phigros', 'test'];
    for (const gameId of gameIds) {
      expect(getGameProfile(gameId).capabilities.hasTools)
        .toBe(getGameToolbox(gameId).tools.length > 0);
    }
  });
});
