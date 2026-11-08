import type { BoundAccount } from '../account';
import { getGameOptions, type GameId } from './game-bind-options';

export function groupBoundAccountGameIds(accounts: BoundAccount[]): GameId[] {
  const registered = [...getGameOptions()].sort((a, b) =>
    (a.accountOrder ?? Number.MAX_SAFE_INTEGER) - (b.accountOrder ?? Number.MAX_SAFE_INTEGER));
  const order = [...new Set([...registered.map(game => game.id), ...accounts.map(account => account.gameId)])];
  return order.filter((gameId) => accounts.some((account) => account.gameId === gameId));
}
