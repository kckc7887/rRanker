import type { ImageSourcePropType } from 'react-native';

export type ProviderId = 'diving-fish' | 'lxns' | 'local' | 'maimai-test';
export type RemoteProviderId = Extract<ProviderId, 'diving-fish' | 'lxns'>;
export type GameId = 'maimai' | 'phigros' | 'test';

export type ProviderOption = {
  id: ProviderId;
  title: string;
  detail: string;
  icon: ImageSourcePropType;
  available: boolean;
};

export type GameOption = {
  id: GameId;
  title: string;
  icon: ImageSourcePropType;
  available: boolean;
  pendingDetail: string;
  providers: ProviderOption[];
};

const maimaiIcon = require('../../assets/images/maimai-dx.png') as ImageSourcePropType;
const divingFishIcon = require('../../assets/images/diving-fish.png') as ImageSourcePropType;
const lxnsIcon = require('../../assets/images/lxns.png') as ImageSourcePropType;
const maimaiTestIcon = require('../../assets/images/maimai-test.png') as ImageSourcePropType;
const phigrosIcon = require('../../assets/images/phigros.png') as ImageSourcePropType;
const testGameIcon = require('../../assets/images/icon.png') as ImageSourcePropType;

export const GAME_OPTIONS: GameOption[] = [
  {
    id: 'maimai',
    title: '舞萌 DX',
    icon: maimaiIcon,
    available: true,
    pendingDetail: '',
    providers: [
      {
        id: 'diving-fish',
        title: '水鱼查分器',
        detail: '账密登录（可上传）',
        icon: divingFishIcon,
        available: true,
      },
      {
        id: 'lxns',
        title: '落雪查分器',
        detail: 'OAuth 授权（粘贴授权码）',
        icon: lxnsIcon,
        available: true,
      },
      {
        id: 'local',
        title: '本地查分器',
        detail: '可添加多个玩家 · 成绩仅保存在本机',
        icon: maimaiIcon,
        available: true,
      },
      {
        id: 'maimai-test',
        title: '示例查分器',
        detail: '全曲全谱面满成绩 · 可删除后重新添加',
        icon: maimaiTestIcon,
        available: true,
      },
    ],
  },
  {
    id: 'test',
    title: '测试游戏',
    icon: testGameIcon,
    available: true,
    pendingDetail: '',
    providers: [],
  },
  {
    id: 'phigros',
    title: 'Phigros',
    icon: phigrosIcon,
    available: false,
    pendingDetail: '成绩绑定尚未开放',
    providers: [],
  },
];

export function findGame(id: GameId): GameOption | undefined {
  return GAME_OPTIONS.find((game) => game.id === id);
}

export function findProvider(id: ProviderId): ProviderOption | undefined {
  for (const game of GAME_OPTIONS) {
    const provider = game.providers.find((item) => item.id === id);
    if (provider) return provider;
  }
  return undefined;
}
