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
      'random-charts',
      'arcade-finder',
      'best-image',
    ]);
    expect(summarizeGameTools('maimai')).toBe('Rating · 达成率/容错 · 牌子进度 · 版本对照 · 随机歌曲 · 机厅查找 · 成绩图片');
  });

  it('gives Phigros push-rks and strength-analysis toolbox entries', () => {
    const toolbox = getGameToolbox('phigros');
    expect(toolbox.tools.map((tool) => tool.id)).toEqual([
      'push-rks',
      'strength-analysis',
      'random-charts',
      'arcade-finder',
      'best-image',
    ]);
    expect(summarizeGameTools('phigros')).toBe('推分计算 · 实力分析 · 随机歌曲 · 机厅查找 · 成绩图片');
  });

  it('registers rating, collections, random songs, arcade finder and best-image for Chunithm', () => {
    const toolbox = getGameToolbox('chunithm');
    expect(toolbox.tools.map((tool) => tool.id)).toEqual([
      'chunithm-rating',
      'chunithm-collections',
      'random-charts',
      'arcade-finder',
      'best-image',
    ]);
    expect(summarizeGameTools('chunithm')).toBe('Rating 计算器 · 收藏品进度 · 随机歌曲 · 机厅查找 · 成绩图片');
  });

  it('keeps profile capabilities consistent with registered tools', () => {
    const gameIds: GameId[] = ['maimai', 'chunithm', 'phigros', 'test'];
    for (const gameId of gameIds) {
      expect(getGameProfile(gameId).capabilities.hasTools)
        .toBe(getGameToolbox(gameId).tools.length > 0);
    }
  });
});
