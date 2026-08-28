import { describe, expect, it } from 'vitest';
import { getGameToolbox } from '@/domain/game-toolbox';

describe('osu! 工具箱', () => {
  it.each(['osu-standard', 'osu-taiko', 'osu-catch', 'osu-mania'] as const)(
    '%s 提供机厅查找与当前模式模组百科',
    (gameId) => {
      expect(getGameToolbox(gameId).tools).toEqual([
        expect.objectContaining({ id: 'arcade-finder', href: '/tools/arcade-finder' }),
        expect.objectContaining({ id: 'osu-mods', href: '/tools/osu-mods' }),
      ]);
    },
  );
});
