import { jest } from '@jest/globals';
import { GAME_OPTIONS } from '@/domain/game-bind-options';
import { resolveProviderLoginPanel } from '@/features/game-content/provider-login-panels';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

/** 会打开登录弹层的凭据类型：登录面板必须按 Provider 登记，不能落到缺省面板。 */
const LOGIN_BINDING_KINDS = ['credentials', 'sms-code', 'oauth-code', 'device-code'];

const loginEntries = GAME_OPTIONS.flatMap((game) => game.providers
  .filter((provider) => LOGIN_BINDING_KINDS.includes(provider.bindingKind) && provider.available)
  .map((provider) => ({ gameId: game.id, provider })));

function panelFor(providerId: string, gameId: string) {
  const entry = loginEntries.find((item) => item.provider.id === providerId && item.gameId === gameId);
  if (!entry) throw new Error(`未登记的登录 Provider：${gameId}/${providerId}`);
  return resolveProviderLoginPanel(entry.provider);
}

describe('Provider 登录面板注册表', () => {
  it('每个可登录 Provider 都解析到面板组件', () => {
    expect(loginEntries.length).toBeGreaterThan(0);
    const unresolved = loginEntries
      .filter(({ provider }) => typeof resolveProviderLoginPanel(provider) !== 'function')
      .map(({ gameId, provider }) => `${gameId}/${provider.id}`);
    expect(unresolved).toEqual([]);
  });

  it('各游戏使用自己的面板，舞萌与中二共用同一落雪面板', () => {
    const rizline = panelFor('rizline-official', 'rizline');
    const majdata = panelFor('majdata-net', 'majdata-net');
    const phigros = panelFor('phi-taptap', 'phigros');
    const osu = panelFor('osu', 'osu-standard');
    const lxnsMaimai = panelFor('lxns', 'maimai');
    const lxnsChunithm = panelFor('lxns', 'chunithm');
    const divingFish = panelFor('diving-fish', 'maimai');

    expect(lxnsMaimai).toBe(lxnsChunithm);
    expect(new Set([rizline, majdata, phigros, osu, lxnsMaimai, divingFish]).size).toBe(6);
  });

  it('未登记专属分支的凭据 Provider 落到缺省账密面板', () => {
    const divingFish = panelFor('diving-fish', 'maimai');
    const entry = loginEntries.find((item) => item.provider.id === 'diving-fish');
    if (!entry) throw new Error('未找到水鱼查分器 Provider');
    const unregistered = { ...entry.provider, id: 'unregistered' as typeof entry.provider.id };
    expect(resolveProviderLoginPanel(unregistered)).toBe(divingFish);
  });
});
