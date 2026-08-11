import type { ImageSourcePropType } from 'react-native';

export type ProviderId =
  | 'diving-fish'
  | 'lxns'
  | 'local'
  | 'maimai-test'
  | 'chunithm-test'
  | 'phigros-test'
  | 'phi-taptap'
  | 'chunithm-temp'
  | 'tuf'
  | 'musedash-moe';
export type RemoteProviderId = Extract<ProviderId, 'diving-fish' | 'lxns' | 'phi-taptap'>;
export type GameId = 'maimai' | 'chunithm' | 'phigros' | 'adofai' | 'musedash' | 'test';
export type ProviderBindingKind = 'credentials' | 'oauth-code' | 'local' | 'fixture' | 'device-code' | 'public-player';

export type ProviderOption = {
  id: ProviderId;
  title: string;
  detail: string;
  icon: ImageSourcePropType;
  available: boolean;
  bindingKind: ProviderBindingKind;
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
const exampleAccountIcon = require('../../assets/images/maimai-test.png') as ImageSourcePropType;
const phigrosIcon = require('../../assets/images/phigros.png') as ImageSourcePropType;
const taptapIcon = require('../../assets/images/taptap.png') as ImageSourcePropType;
const chunithmIcon = require('../../assets/images/chunithm.png') as ImageSourcePropType;
const adofaiIcon = require('../../assets/images/adofai.png') as ImageSourcePropType;
const tufIcon = require('../../assets/images/tuf.png') as ImageSourcePropType;
const museDashIcon = require('../../assets/images/musedash.png') as ImageSourcePropType;
const museDashMoeIcon = require('../../assets/images/musedash-moe.png') as ImageSourcePropType;

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
        bindingKind: 'credentials',
        title: '水鱼查分器',
        detail: '账密登录（可上传）',
        icon: divingFishIcon,
        available: true,
      },
      {
        id: 'lxns',
        bindingKind: 'oauth-code',
        title: '落雪查分器',
        detail: 'OAuth 授权（粘贴授权码）',
        icon: lxnsIcon,
        available: true,
      },
      {
        id: 'local',
        bindingKind: 'local',
        title: '本地查分器',
        detail: '可添加多个玩家 · 成绩仅保存在本机',
        icon: maimaiIcon,
        available: true,
      },
      {
        id: 'maimai-test',
        bindingKind: 'fixture',
        title: '示例查分器',
        detail: '全曲全谱面满成绩 · 可删除后重新添加',
        icon: exampleAccountIcon,
        available: true,
      },
    ],
  },
  {
    id: 'chunithm',
    title: '中二节奏',
    icon: chunithmIcon,
    available: true,
    pendingDetail: '',
    providers: [
      {
        id: 'lxns',
        bindingKind: 'oauth-code',
        title: '落雪查分器',
        detail: 'OAuth 授权（粘贴授权码）',
        icon: lxnsIcon,
        available: true,
      },
      {
        id: 'chunithm-test',
        bindingKind: 'fixture',
        title: '示例查分器',
        detail: '全曲全谱面满成绩 · 可删除后重新添加',
        icon: exampleAccountIcon,
        available: true,
      },
    ],
  },
  {
    id: 'adofai',
    title: '冰与火之舞',
    icon: adofaiIcon,
    available: true,
    pendingDetail: '',
    providers: [{
      id: 'tuf',
      bindingKind: 'public-player',
      title: 'TUF 社区',
      detail: '搜索公开玩家 · 无需登录',
      icon: tufIcon,
      available: true,
    }],
  },
  {
    id: 'musedash',
    title: '喵斯快跑',
    icon: museDashIcon,
    available: true,
    pendingDetail: '',
    providers: [{
      id: 'musedash-moe',
      bindingKind: 'public-player',
      title: 'MuseDash.moe',
      detail: '搜索公开玩家 · 无需登录',
      icon: museDashMoeIcon,
      available: true,
    }],
  },
  {
    id: 'phigros',
    title: 'Phigros',
    icon: phigrosIcon,
    available: true,
    pendingDetail: '',
    providers: [
      {
        id: 'phi-taptap',
        bindingKind: 'device-code',
        title: 'TapTap 云存档',
        detail: '跳转 TapTap 授权登录',
        icon: taptapIcon,
        available: true,
      },
      {
        id: 'phigros-test',
        bindingKind: 'fixture',
        title: '示例查分器',
        detail: '全曲全谱面满成绩 · 可删除后重新添加',
        icon: exampleAccountIcon,
        available: true,
      },
    ],
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
