import type { ImageSourcePropType } from 'react-native';
import { NEUTRAL_RATING_THEME, type DxRatingTheme } from './dx-rating-theme';
import { RIZLINE_RATING_THEME } from './rizline';
import maimaiIcon from '../../assets/images/maimai-dx.webp';
import divingFishIcon from '../../assets/images/diving-fish.webp';
import lxnsIcon from '../../assets/images/lxns.webp';
import exampleAccountIcon from '../../assets/images/example-account.webp';
import phigrosIcon from '../../assets/images/phigros.webp';
import taptapIcon from '../../assets/images/taptap.webp';
import chunithmIcon from '../../assets/images/chunithm.webp';
import adofaiIcon from '../../assets/images/adofai.webp';
import tufIcon from '../../assets/images/tuf.webp';
import museDashIcon from '../../assets/images/musedash.webp';
import majdataIcon from '../../assets/images/majdata.png';
import rizlineIcon from '../../assets/images/rizline.png';
import phiraIcon from '../../assets/images/phira.webp';
import osuIcon from '../../assets/images/osu.png';
import osuStandardIcon from '../../assets/images/osu-standard.webp';
import osuManiaIcon from '../../assets/images/osu-mania.webp';
import osuCatchIcon from '../../assets/images/osu-catch.webp';
import osuTaikoIcon from '../../assets/images/osu-taiko.webp';

/** 已登记查分器 id 的唯一来源：`ProviderId` 与运行时校验共用这份列表。 */
export const PROVIDER_IDS = [
  'rizline-official',
  'majdata-net',
  'diving-fish',
  'lxns',
  'local',
  'maimai-test',
  'chunithm-test',
  'phigros-test',
  'phi-taptap',
  'chunithm-temp',
  'tuf',
  'musedash-moe',
  'phira-community',
  'musedash-test',
  'osu',
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type RemoteProviderId = Extract<ProviderId, 'rizline-official' | 'majdata-net' | 'diving-fish' | 'lxns' | 'phi-taptap' | 'osu'>;
/**
 * 不出现在添加入口、由会话流程直接创建的内部查分器 id。
 * 登记校验据此区分「有意不绑定」与「遗留的未登记 id」。
 */
export const INTERNAL_PROVIDER_IDS = ['chunithm-temp'] as const;

/** 正式支持的游戏 id：每个都需要独立的添加入口、展示资料、工具箱与数据加载器。 */
export const SUPPORTED_GAME_IDS = [
  'maimai',
  'chunithm',
  'phigros',
  'phira',
  'adofai',
  'musedash',
  'majdata-net',
  'rizline',
] as const;
/** osu! 家族四模式：后台各自注册为独立游戏 id，前台聚合为一个板块。 */
export const OSU_MODE_GAME_IDS = ['osu-standard', 'osu-mania', 'osu-catch', 'osu-taiko'] as const;
/** 类型层保留的空壳游戏 id：只用于切换链路验证，不是选择器条目。 */
export const RESERVED_GAME_IDS = ['test'] as const;

export type SupportedGameId = (typeof SUPPORTED_GAME_IDS)[number];
export type OsuModeGameId = (typeof OSU_MODE_GAME_IDS)[number];
export type ReservedGameId = (typeof RESERVED_GAME_IDS)[number];
export type GameId = SupportedGameId | OsuModeGameId | ReservedGameId;

/**
 * 游戏 id 的唯一来源：类型、注册表穷尽映射与登记校验都从这三份列表派生，
 * 新增正式游戏只要加进 `SUPPORTED_GAME_IDS`，各注册表缺项即编译失败。
 */
export const GAME_IDS: readonly GameId[] = [
  ...SUPPORTED_GAME_IDS,
  ...OSU_MODE_GAME_IDS,
  ...RESERVED_GAME_IDS,
];
export type ProviderBindingKind = 'credentials' | 'sms-code' | 'oauth-code' | 'local' | 'fixture' | 'device-code' | 'public-player';

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
  /** 已绑定游戏列表的既有顺序；未指定的新增游戏按注册顺序追加。 */
  accountOrder?: number;
  /** 账号合计的固定主题，不按其它游戏的评价体系推导。 */
  accountScoreTheme?: DxRatingTheme;
  /** 多模式家族 id：前台把同家族成员聚合为一个板块（见 domain/game-mode-family）。 */
  familyId?: string;
  /** 家族非锚点成员：picker 中不单独列出行，只经家族锚点渲染。 */
  hiddenInPicker?: boolean;
  /** 家族板块行图标（锚点成员提供；缺省用自身 icon）。 */
  familyIcon?: ImageSourcePropType;
};

/** 游戏、家族与 Provider 共用的包内图标，不依赖网络或图片缓存。 */
export const GAME_OPTIONS: GameOption[] = [
  {
    id: 'maimai',
    accountOrder: 0,
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
        detail: '可添加多个玩家',
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
    accountOrder: 1,
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
    accountOrder: 4,
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
    accountOrder: 5,
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
        icon: museDashIcon,
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
    accountOrder: 3,
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
    accountOrder: 2,
    title: 'Phigros',
    icon: phigrosIcon,
    available: true,
    pendingDetail: '',
    providers: [
      {
        id: 'phi-taptap',
        bindingKind: 'device-code',
        title: 'TapTap 云存档',
        detail: '扫码或前往 TapTap 授权',
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
    accountOrder: 6,
    title: 'osu!standard',
    icon: osuStandardIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    familyIcon: osuIcon,
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
    accountOrder: 7,
    title: 'osu!mania',
    icon: osuManiaIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    hiddenInPicker: true,
    providers: [],
  },
  {
    id: 'osu-catch',
    accountOrder: 8,
    title: 'osu!catch',
    icon: osuCatchIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    hiddenInPicker: true,
    providers: [],
  },
  {
    id: 'osu-taiko',
    accountOrder: 9,
    title: 'osu!taiko',
    icon: osuTaikoIcon,
    available: true,
    pendingDetail: '',
    familyId: 'osu',
    hiddenInPicker: true,
    providers: [],
  },
  {
    id: 'majdata-net',
    title: 'Majdata Net',
    icon: majdataIcon,
    available: true,
    pendingDetail: '',
    accountScoreTheme: NEUTRAL_RATING_THEME,
    providers: [{
      id: 'majdata-net',
      title: 'Majdata Net',
      detail: '账密登录',
      icon: majdataIcon,
      available: true,
      bindingKind: 'credentials',
    }],
  },
  {
    id: 'rizline',
    title: 'Rizline',
    icon: rizlineIcon,
    available: true,
    pendingDetail: '',
    accountScoreTheme: RIZLINE_RATING_THEME,
    providers: [{
      id: 'rizline-official',
      title: '官方账号',
      detail: '手机号验证码或账密登录',
      icon: rizlineIcon,
      available: true,
      bindingKind: 'sms-code',
    }],
  },
];

export function findGame(id: GameId): GameOption | undefined {
  return GAME_OPTIONS.find((game) => game.id === id);
}

/** 添加入口按绑定能力过滤，已绑定账号仍使用完整注册表。 */
export function canBindProvider(provider: ProviderOption, testAccountsEnabled: boolean): boolean {
  return provider.bindingKind !== 'fixture' || testAccountsEnabled;
}

export function findProvider(id: ProviderId): ProviderOption | undefined {
  for (const game of GAME_OPTIONS) {
    const provider = game.providers.find((item) => item.id === id);
    if (provider) return provider;
  }
  return undefined;
}

/** 需要持久登录凭据的来源；账号管理按注册能力判断，不维护平行来源名单。 */
export function isCredentialProvider(id: ProviderId | null): boolean {
  const kind = id ? findProvider(id)?.bindingKind : undefined;
  return kind === 'credentials' || kind === 'sms-code' || kind === 'oauth-code' || kind === 'device-code';
}
