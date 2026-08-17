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
  | 'musedash-moe'
  | 'phira-community'
  | 'musedash-test'
  | 'osu';
export type RemoteProviderId = Extract<ProviderId, 'diving-fish' | 'lxns' | 'phi-taptap' | 'osu'>;
export type GameId =
  | 'maimai' | 'chunithm' | 'phigros' | 'phira' | 'adofai' | 'musedash' | 'test'
  | 'osu-standard' | 'osu-mania' | 'osu-catch' | 'osu-taiko';
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
  /** 多模式家族 id：前台把同家族成员聚合为一个板块（见 domain/game-mode-family）。 */
  familyId?: string;
  /** 家族非锚点成员：picker 中不单独列出行，只经家族锚点渲染。 */
  hiddenInPicker?: boolean;
};

/** 游戏 / Provider 图标源：对象存储 rranker/assets/images（与本地 assets/images 同名同路径）。 */
const REMOTE_IMAGE_BASE = 'https://rranker.cn-nb1.rains3.com/assets/images';

const maimaiIcon = { uri: `${REMOTE_IMAGE_BASE}/maimai-dx.png` } as ImageSourcePropType;
const divingFishIcon = { uri: `${REMOTE_IMAGE_BASE}/diving-fish.png` } as ImageSourcePropType;
const lxnsIcon = { uri: `${REMOTE_IMAGE_BASE}/lxns.png` } as ImageSourcePropType;
const exampleAccountIcon = { uri: `${REMOTE_IMAGE_BASE}/example-account.png` } as ImageSourcePropType;
const phigrosIcon = { uri: `${REMOTE_IMAGE_BASE}/phigros.png` } as ImageSourcePropType;
const taptapIcon = { uri: `${REMOTE_IMAGE_BASE}/taptap.png` } as ImageSourcePropType;
const chunithmIcon = { uri: `${REMOTE_IMAGE_BASE}/chunithm.png` } as ImageSourcePropType;
const adofaiIcon = { uri: `${REMOTE_IMAGE_BASE}/adofai.png` } as ImageSourcePropType;
const tufIcon = { uri: `${REMOTE_IMAGE_BASE}/tuf.png` } as ImageSourcePropType;
const museDashIcon = { uri: `${REMOTE_IMAGE_BASE}/musedash.png` } as ImageSourcePropType;
const museDashMoeIcon = { uri: `${REMOTE_IMAGE_BASE}/musedash-moe.png` } as ImageSourcePropType;
/** 从 https://phira.moe/favicon.svg 原样提取的内嵌 PNG。 */
const phiraIcon = { uri: `${REMOTE_IMAGE_BASE}/phira.png` } as ImageSourcePropType;
const osuIcon = { uri: `${REMOTE_IMAGE_BASE}/osu.png` } as ImageSourcePropType;

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
        detail: 'OAuth 授权（授权后自动返回）',
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
        detail: 'OAuth 授权（授权后自动返回）',
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
    providers: [
      {
        id: 'musedash-moe',
        bindingKind: 'public-player',
        title: 'MuseDash.moe',
        detail: '搜索公开玩家 · 无需登录',
        icon: museDashMoeIcon,
        available: true,
      },
      {
        id: 'musedash-test',
        bindingKind: 'fixture',
        title: '示例查分器',
        detail: '全曲全谱面满成绩 · 可删除后重新添加',
        icon: exampleAccountIcon,
        available: true,
      },
    ],
  },
  {
    id: 'phira',
    title: 'Phira',
    icon: phiraIcon,
    available: true,
    pendingDetail: '',
    providers: [{
      id: 'phira-community',
      bindingKind: 'public-player',
      title: 'Phira社区',
      detail: '公开玩家 ID 或用户名 · 无需登录',
      icon: phiraIcon,
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
  {
    id: 'osu-standard',
    title: 'osu!standard',
    icon: osuIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    providers: [
      {
        id: 'osu',
        bindingKind: 'oauth-code',
        title: 'osu! OAuth',
        detail: 'OAuth 授权（授权后选择模式绑定）',
        icon: osuIcon,
        available: true,
      },
    ],
  },
  {
    id: 'osu-mania',
    title: 'osu!mania',
    icon: osuIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    hiddenInPicker: true,
    providers: [],
  },
  {
    id: 'osu-catch',
    title: 'osu!catch',
    icon: osuIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    hiddenInPicker: true,
    providers: [],
  },
  {
    id: 'osu-taiko',
    title: 'osu!taiko',
    icon: osuIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    hiddenInPicker: true,
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
