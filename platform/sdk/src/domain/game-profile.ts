import { getGameDefinition, type GameId, type GameProfile } from '@rranker/sdk';

export type { BestSectionSpec, GameProfile } from '@rranker/sdk';

export function getGameProfile<G extends GameId>(id: G): GameProfile<G> {
  const game = getGameDefinition(id);
  if (!game) throw new Error('游戏适配器不存在：' + id);
  return { id, title: game.title, ...game.profile };
}
