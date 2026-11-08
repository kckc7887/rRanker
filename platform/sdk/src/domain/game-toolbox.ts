import { getGameTools, type GameId } from '@rranker/sdk';

export type GameToolDefinition = ReturnType<typeof getGameTools>[number];
export type GameToolbox = { tools: readonly GameToolDefinition[]; emptyDetail: string };

export function getGameToolbox(gameId: GameId): GameToolbox {
  return { tools: getGameTools(gameId), emptyDetail: '当前游戏暂无已启用的工具' };
}

export function summarizeGameTools(gameId: GameId): string {
  const toolbox = getGameToolbox(gameId);
  return toolbox.tools.length ? toolbox.tools.map(tool => tool.summaryLabel).join(' · ') : toolbox.emptyDetail;
}

export function selectGameTools(gameId: GameId, toolIds: readonly string[]): readonly GameToolDefinition[] {
  const selectedIds = new Set(toolIds);
  return getGameTools(gameId).filter(tool => selectedIds.has(tool.id));
}
