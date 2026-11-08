import {
  gameToolHref, getDataSource, getGameDefinition, getGameTools, getInstalledGameTools,
  getPluginPage, getOverviewCards, initializePlugins, isPluginAvailable, setDisabledPlugins,
  type DataSourcePlugin, type GameAdapter, type ToolPlugin,
} from '@rranker/sdk';

const first: GameAdapter = {
  kind: 'game', id: 'game.first', title: 'First',
  parseDetailParams: (_, params) => params, parseLibraryTarget: target => target,
  games: [{
    id: 'first', title: 'First', icon: 1,
    profile: { ratingLabel: 'Rating', ratingDigits: 2, bestSections: [] },
  }],
};
const second: GameAdapter = {
  kind: 'game', id: 'game.second', title: 'Second',
  parseDetailParams: (_, params) => params, parseLibraryTarget: target => target,
  games: [{
    id: 'second', title: 'Second', icon: 2,
    profile: { ratingLabel: 'Score', ratingDigits: 0, bestSections: [] },
  }],
};
const provider: DataSourcePlugin = {
  kind: 'provider', id: 'provider.shared', providerId: 'shared', title: 'Shared',
  gameIds: ['first', 'second'], detail: '', icon: 3, bindingKind: 'local',
};
const tools: ToolPlugin = {
  kind: 'tool', id: 'tool.first', title: 'First Tools', gameIds: ['first'],
  tools: [{ id: 'rating', gameId: 'first', pageId: 'calculate', title: '计算器', detail: '', summaryLabel: '计算', order: 0 }],
  pages: { calculate: () => null },
  overviewCards: () => null,
};

beforeEach(() => {
  initializePlugins([first, second, provider, tools]);
  setDisabledPlugins([]);
});

describe('独立插件接入', () => {
  it('发现新适配器、数据源和专属工具并生成页面地址', () => {
    expect(getGameDefinition('first')?.profile.ratingLabel).toBe('Rating');
    expect(getDataSource('shared')?.gameIds).toEqual(['first', 'second']);
    expect(getGameTools('first').map(tool => tool.title)).toEqual(['计算器']);
    expect(getOverviewCards('first')).toEqual([tools.overviewCards]);
    expect(getOverviewCards('second')).toEqual([]);
    expect(gameToolHref('first', 'rating', { constant: '12.5' })).toEqual({
      pathname: '/plugins/[pluginId]/[pageId]',
      params: { pluginId: 'tool.first', pageId: 'calculate', gameId: 'first', constant: '12.5' },
    });
    expect(getPluginPage('tool.first', 'calculate', 'first')).toBeDefined();
    expect(getPluginPage('tool.first', 'calculate', 'second')).toBeUndefined();
  });

  it('停用适配器只阻止对应游戏的来源与工具，重启后恢复', () => {
    setDisabledPlugins(['game.first']);
    expect(isPluginAvailable('provider.shared', 'first')).toBe(false);
    expect(isPluginAvailable('provider.shared', 'second')).toBe(true);
    expect(getGameTools('first')).toEqual([]);
    expect(getInstalledGameTools('first').map(tool => tool.id)).toEqual(['rating']);
    expect(getGameDefinition('first')?.title).toBe('First');
    setDisabledPlugins([]);
    expect(getGameTools('first').map(tool => tool.id)).toEqual(['rating']);
  });

  it('独立停用来源与工具保留游戏及注册资料', () => {
    setDisabledPlugins(['provider.shared', 'tool.first']);
    expect(isPluginAvailable('game.first')).toBe(true);
    expect(isPluginAvailable('provider.shared')).toBe(false);
    expect(getDataSource('shared')?.title).toBe('Shared');
    expect(gameToolHref('first', 'rating')).toBeNull();
    expect(getOverviewCards('first')).toEqual([]);
    expect(getPluginPage('tool.first', 'calculate', 'first')).toBeUndefined();
  });

  it('缺少目标适配器时不能打开专属工具', () => {
    initializePlugins([second, provider, tools]);
    expect(getGameTools('first')).toEqual([]);
    expect(getPluginPage('tool.first', 'calculate', 'first')).toBeUndefined();
    expect(isPluginAvailable('provider.shared', 'second')).toBe(true);
  });

  it('只向提供所需谱面合同的目标游戏开放工具', () => {
    const preview = { ...tools, gameIds: ['first', 'second'],
      requiredCapabilities: { first: ['chart.preview'], second: ['chart.preview'] } };
    initializePlugins([{ ...first, capabilities: ['chart.preview'] }, second, provider, preview]);
    expect(getPluginPage(preview.id, 'calculate', 'first')).toBeDefined();
    expect(getPluginPage(preview.id, 'calculate', 'second')).toBeUndefined();
    expect(isPluginAvailable(preview.id)).toBe(true);
    setDisabledPlugins([first.id]);
    expect(isPluginAvailable(preview.id)).toBe(false);
    setDisabledPlugins([]);
    expect(getPluginPage(preview.id, 'calculate', 'first')).toBeDefined();
  });
});
