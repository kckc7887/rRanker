import type { GameId } from './game-bind-options';

export type GameToolDefinition = {
  id: string;
  href: `/tools/${string}` | '/best-image';
  title: string;
  detail: string;
  summaryLabel: string;
};

export type GameToolbox = {
  tools: readonly GameToolDefinition[];
  emptyDetail: string;
};

/**
 * 游戏级工具注册表。工具箱页面和总览入口只消费此处配置，
 * 新游戏不需要在页面组件里增加 gameId 分支。
 */
export const GAME_TOOLBOXES: Record<GameId, GameToolbox> = {
  maimai: {
    tools: [
      {
        id: 'rating',
        href: '/tools/rating',
        title: 'DX Rating 计算器',
        detail: '档位表、指定达成率与目标 Rating 反推',
        summaryLabel: 'Rating',
      },
      {
        id: 'tolerance',
        href: '/tools/tolerance',
        title: '达成率与容错',
        detail: 'Note 权重、BREAK 奖励与同类错误上限',
        summaryLabel: '达成率/容错',
      },
      {
        id: 'plates',
        href: '/tools/plates',
        title: '牌子进度',
        detail: '用本地水鱼最佳成绩核对姓名框要求',
        summaryLabel: '牌子进度',
      },
      {
        id: 'versions',
        href: '/tools/versions',
        title: '版本对照与总结',
        detail: '国服/日服名称对照，以及逐版本游玩情况',
        summaryLabel: '版本对照',
      },
      {
        id: 'random-charts',
        href: '/tools/random-charts',
        title: '随机歌曲',
        detail: '按难度、定数与游玩状态随机抽取谱面',
        summaryLabel: '随机歌曲',
      },
      {
        id: 'best-image',
        href: '/best-image',
        title: '生成成绩图片',
        detail: '生成并导出 B50 或自定义成绩图片',
        summaryLabel: '成绩图片',
      },
    ],
    emptyDetail: '舞萌 DX 暂无可用工具。',
  },
  phigros: {
    tools: [
      {
        id: 'push-rks',
        href: '/tools/push-rks',
        title: '推分计算',
        detail: '按期望加值与成本歌数均摊，反推每谱面目标 Acc',
        summaryLabel: '推分计算',
      },
      {
        id: 'random-charts',
        href: '/tools/random-charts',
        title: '随机歌曲',
        detail: '按难度、定数与游玩状态随机抽取谱面',
        summaryLabel: '随机歌曲',
      },
      {
        id: 'best-image',
        href: '/best-image',
        title: '生成成绩图片',
        detail: '生成并导出 Best30 或自定义成绩图片',
        summaryLabel: '成绩图片',
      },
    ],
    emptyDetail: 'Phigros 工具正在准备中。',
  },
  test: {
    tools: [],
    emptyDetail: '测试游戏暂无可用工具。',
  },
};

export function getGameToolbox(gameId: GameId): GameToolbox {
  return GAME_TOOLBOXES[gameId];
}

export function summarizeGameTools(gameId: GameId): string {
  const toolbox = getGameToolbox(gameId);
  if (toolbox.tools.length === 0) return toolbox.emptyDetail;
  return toolbox.tools.map((tool) => tool.summaryLabel).join(' · ');
}

export function selectGameTools(gameId: GameId, toolIds: readonly string[]): readonly GameToolDefinition[] {
  const selectedIds = new Set(toolIds);
  return getGameToolbox(gameId).tools.filter((tool) => selectedIds.has(tool.id));
}
