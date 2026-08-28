/**
 * osu! 模组元数据：acronym → 模组类型 → 徽章配色。
 * 数据来源 refer/osu-web-master/database/mods.json（osu/taiko/fruits/mania 四规则集
 * UserPlayable 模组 + SV2 成绩可携带的系统模组；同 acronym 跨规则集类型一致，统一映射）。
 * 配色来源 refer/osu-web-master resources/css/bem/mod.less + colors.less：
 * 背景 = 六类 osu 官方模组色（hsl(hue,100%,70%) 档 / System 黄），
 * 前景 = color-mix(in srgb-linear, black, 背景 10%)，与 osu-web 徽章文字/图标同色。
 */

import type { OsuGameId } from './game-mode-family';

/** osu! 模组类型（与 osu-web ModType 一致，决定徽章底色）。 */
export type OsuModType =
  | 'DifficultyReduction'
  | 'DifficultyIncrease'
  | 'Conversion'
  | 'Automation'
  | 'Fun'
  | 'System';

/** 模组徽章配色（背景/前景十六进制）。 */
export type OsuModTheme = {
  background: string;
  foreground: string;
};

/** 六类模组配色（精确值按 osu-web color-mix 语义预先计算硬编码）。 */
export const OSU_MOD_THEME_BY_TYPE: Record<OsuModType, OsuModTheme> = {
  // lime hsl(90,100%,70%)
  DifficultyReduction: { background: '#B3FF66', foreground: '#3C591E' },
  // red hsl(360,100%,70%)
  DifficultyIncrease: { background: '#FF6666', foreground: '#591E1E' },
  // purple hsl(255,100%,70%)
  Conversion: { background: '#8C66FF', foreground: '#2D1E59' },
  // blue hsl(200,100%,70%)
  Automation: { background: '#66CCFF', foreground: '#1E4659' },
  // pink hsl(333,100%,70%)
  Fun: { background: '#FF66AB', foreground: '#591E39' },
  // yellow #ffcc22
  System: { background: '#FFCC22', foreground: '#594605' },
};

/** acronym → 模组类型（67 项：66 个 UserPlayable + SV2）。 */
export const OSU_MOD_TYPE_BY_ACRONYM: Record<string, OsuModType> = {
  // DifficultyReduction（降难）
  EZ: 'DifficultyReduction',
  NF: 'DifficultyReduction',
  HT: 'DifficultyReduction',
  DC: 'DifficultyReduction',
  NR: 'DifficultyReduction',
  SR: 'DifficultyReduction',
  // DifficultyIncrease（增难）
  AC: 'DifficultyIncrease',
  BL: 'DifficultyIncrease',
  CO: 'DifficultyIncrease',
  DT: 'DifficultyIncrease',
  FI: 'DifficultyIncrease',
  FL: 'DifficultyIncrease',
  HD: 'DifficultyIncrease',
  HR: 'DifficultyIncrease',
  NC: 'DifficultyIncrease',
  PF: 'DifficultyIncrease',
  SD: 'DifficultyIncrease',
  ST: 'DifficultyIncrease',
  TC: 'DifficultyIncrease',
  // Conversion（转换）
  '1K': 'Conversion',
  '2K': 'Conversion',
  '3K': 'Conversion',
  '4K': 'Conversion',
  '5K': 'Conversion',
  '6K': 'Conversion',
  '7K': 'Conversion',
  '8K': 'Conversion',
  '9K': 'Conversion',
  '10K': 'Conversion',
  AL: 'Conversion',
  CL: 'Conversion',
  CS: 'Conversion',
  DA: 'Conversion',
  DS: 'Conversion',
  HO: 'Conversion',
  IN: 'Conversion',
  MR: 'Conversion',
  RD: 'Conversion',
  SG: 'Conversion',
  SW: 'Conversion',
  TP: 'Conversion',
  // Automation（自动化）
  AP: 'Automation',
  RX: 'Automation',
  SO: 'Automation',
  // Fun（趣味）
  AD: 'Fun',
  AS: 'Fun',
  BM: 'Fun',
  BR: 'Fun',
  BU: 'Fun',
  DF: 'Fun',
  DP: 'Fun',
  FF: 'Fun',
  FR: 'Fun',
  GR: 'Fun',
  MG: 'Fun',
  MF: 'Fun',
  MU: 'Fun',
  NS: 'Fun',
  RP: 'Fun',
  SI: 'Fun',
  SY: 'Fun',
  TR: 'Fun',
  WD: 'Fun',
  WG: 'Fun',
  WU: 'Fun',
  // System（系统）
  TD: 'System',
  SV2: 'System',
};

export const OSU_MOD_TYPE_LABELS: Record<OsuModType, string> = {
  DifficultyReduction: '降低难度',
  DifficultyIncrease: '提高难度',
  Conversion: '谱面转换',
  Automation: '自动操作',
  Fun: '趣味玩法',
  System: '系统模组',
};

export type OsuModMetadata = {
  acronym: string;
  englishName: string;
  chineseName: string;
  type: OsuModType;
  applicableGameIds: readonly OsuGameId[];
  description: string;
  descriptionByGameId?: Partial<Record<OsuGameId, string>>;
  gameplayMultipliersByGameId?: Partial<Record<OsuGameId, readonly OsuModGameplayMultiplier[]>>;
  wikiPath: string;
  userPlayable: boolean;
};

export type OsuModGameplayMultiplier = {
  label: string;
  value: string;
};

const ALL_MODES_SPEED_075 = Object.fromEntries(
  (['osu-standard', 'osu-taiko', 'osu-catch', 'osu-mania'] as const).map((gameId) => [
    gameId,
    [{ label: '默认速度', value: '0.75×' }],
  ]),
) as Partial<Record<OsuGameId, readonly OsuModGameplayMultiplier[]>>;

const ALL_MODES_SPEED_150 = Object.fromEntries(
  (['osu-standard', 'osu-taiko', 'osu-catch', 'osu-mania'] as const).map((gameId) => [
    gameId,
    [{ label: '默认速度', value: '1.50×' }],
  ]),
) as Partial<Record<OsuGameId, readonly OsuModGameplayMultiplier[]>>;

const OSU_MOD_GAMEPLAY_MULTIPLIERS: Partial<Record<
  string,
  Partial<Record<OsuGameId, readonly OsuModGameplayMultiplier[]>>
>> = {
  EZ: {
    'osu-standard': [
      { label: '圆圈大小', value: '0.50×' }, { label: '生命值', value: '0.50×' },
      { label: '判定难度', value: '0.50×' }, { label: '缩圈速度', value: '0.50×' },
    ],
    'osu-taiko': [
      { label: '生命值', value: '0.50×' }, { label: '判定难度', value: '0.50×' },
      { label: '滚动速度', value: '0.80×' },
    ],
    'osu-catch': [
      { label: '接物宽度', value: '0.50×' }, { label: '生命值', value: '0.50×' },
      { label: '物件出现速度', value: '0.50×' },
    ],
    'osu-mania': [{ label: '生命值', value: '0.50×' }],
  },
  HR: {
    'osu-standard': [
      { label: '生命值', value: '1.40×' }, { label: '判定难度', value: '1.40×' },
      { label: '缩圈速度', value: '1.40×' }, { label: '圆圈大小', value: '1.30×' },
    ],
    'osu-taiko': [
      { label: '生命值', value: '1.40×' }, { label: '判定难度', value: '1.40×' },
      { label: '滚动速度', value: '1.87×' },
    ],
    'osu-catch': [
      { label: '生命值', value: '1.40×' }, { label: '物件出现速度', value: '1.40×' },
      { label: '接物宽度', value: '1.30×' },
    ],
    'osu-mania': [{ label: '生命值', value: '1.40×' }],
  },
  HT: ALL_MODES_SPEED_075,
  DC: ALL_MODES_SPEED_075,
  DT: ALL_MODES_SPEED_150,
  NC: ALL_MODES_SPEED_150,
};

/** osu-web 当前四规则集 UserPlayable 列表；顺序与官方 mods.json 一致。 */
export const OSU_USER_PLAYABLE_MODS_BY_GAME_ID: Record<OsuGameId, readonly string[]> = {
  'osu-standard': ['EZ', 'NF', 'HT', 'DC', 'HR', 'SD', 'PF', 'DT', 'NC', 'HD', 'TC', 'FL', 'BL', 'ST', 'AC', 'TP', 'DA', 'CL', 'RD', 'MR', 'AL', 'SG', 'RX', 'AP', 'SO', 'TR', 'WG', 'SI', 'GR', 'DF', 'WU', 'WD', 'BR', 'AD', 'MU', 'NS', 'MG', 'RP', 'AS', 'FR', 'BU', 'SY', 'DP', 'BM', 'TD'],
  'osu-taiko': ['EZ', 'NF', 'HT', 'DC', 'SR', 'HR', 'SD', 'PF', 'DT', 'NC', 'HD', 'FL', 'AC', 'RD', 'DA', 'CL', 'SW', 'SG', 'CS', 'RX', 'WU', 'WD', 'MU', 'AS'],
  'osu-catch': ['EZ', 'NF', 'HT', 'DC', 'HR', 'SD', 'PF', 'DT', 'NC', 'HD', 'FL', 'AC', 'DA', 'CL', 'MR', 'RX', 'WU', 'WD', 'FF', 'MU', 'NS', 'MF', 'SY'],
  'osu-mania': ['EZ', 'NF', 'HT', 'DC', 'NR', 'HR', 'SD', 'PF', 'DT', 'NC', 'FI', 'HD', 'CO', 'FL', 'AC', 'RD', 'DS', 'MR', 'DA', 'CL', 'IN', 'CS', 'HO', '1K', '2K', '3K', '4K', '5K', '6K', '7K', '8K', '9K', '10K', 'WU', 'WD', 'MU', 'AS'],
};

/** 官方 Wiki 中文概要的内置简明转述；不在运行时抓取网页。 */
const OSU_MOD_COPY: Record<string, readonly [englishName: string, chineseName: string, description: string]> = {
  EZ: ['Easy', '简单', '降低谱面整体难度，使判定、尺寸或生命值更宽松。'],
  NF: ['No Fail', '不会失败', '即使生命值耗尽也可继续完成谱面。'],
  HT: ['Half Time', '半速', '降低歌曲与谱面的播放速度。'],
  DC: ['Daycore', '日核', '降低播放速度并保持较高音调。'],
  NR: ['No Release', '免松键', '长按音符结束时不再要求准确松键。'],
  SR: ['Simplified Rhythm', '简化节奏', '将太鼓谱面的复杂节奏简化。'],
  AC: ['Accuracy Challenge', '精准挑战', '以可配置的最低准确率作为通关要求。'],
  BL: ['Blinds', '百叶窗', '用移动遮挡区域限制可见谱面。'],
  CO: ['Cover', '遮盖', '遮住 mania 判定区上方的部分谱面。'],
  DT: ['Double Time', '双倍速度', '提高歌曲与谱面的播放速度。'],
  FI: ['Fade In', '淡入', 'mania 音符接近判定线时才逐渐出现。'],
  FL: ['Flashlight', '手电筒', '仅保留光标或接物区附近的有限视野。'],
  HD: ['Hidden', '隐藏', '移除缩圈并让物件在命中前提前消失。'],
  HR: ['Hard Rock', '困难', '提高谱面整体难度，并按规则集改变物件表现。'],
  NC: ['Nightcore', '夜核', '在加速基础上提高音调并加入节拍音效。'],
  PF: ['Perfect', '完美', '出现非最高判定或失误时自动重试谱面。'],
  SD: ['Sudden Death', '突然死亡', '出现失误时立即失败。'],
  ST: ['Strict Tracking', '严格跟踪', '滑条过程中偏离轨迹会受到更严厉惩罚。'],
  TC: ['Traceable', '可追踪', '物件只在有限时间窗口内可见。'],
  '1K': ['One Key', '单键', '把 mania 谱面转换为 1 键布局。'],
  '2K': ['Two Keys', '双键', '把 mania 谱面转换为 2 键布局。'],
  '3K': ['Three Keys', '三键', '把 mania 谱面转换为 3 键布局。'],
  '4K': ['Four Keys', '四键', '把 mania 谱面转换为 4 键布局。'],
  '5K': ['Five Keys', '五键', '把 mania 谱面转换为 5 键布局。'],
  '6K': ['Six Keys', '六键', '把 mania 谱面转换为 6 键布局。'],
  '7K': ['Seven Keys', '七键', '把 mania 谱面转换为 7 键布局。'],
  '8K': ['Eight Keys', '八键', '把 mania 谱面转换为 8 键布局。'],
  '9K': ['Nine Keys', '九键', '把 mania 谱面转换为 9 键布局。'],
  '10K': ['Ten Keys', '十键', '把 mania 谱面转换为 10 键布局。'],
  AL: ['Alternate', '交替点击', '要求左右按键交替完成点击。'],
  CL: ['Classic', '经典', '使用旧版规则与计分行为游玩。'],
  CS: ['Constant Speed', '恒定流速', '让音符以恒定视觉速度移动。'],
  DA: ['Difficulty Adjust', '难度调整', '允许分别调整谱面的难度属性。'],
  DS: ['Dual Stages', '双阶段', '将 mania 键位划分为两个交替区域。'],
  HO: ['Hold Off', '移除长按', '把 mania 长按音符转换为普通音符。'],
  IN: ['Invert', '反转', '交换 mania 普通音符与长按音符的形态。'],
  MR: ['Mirror', '镜像', '水平镜像谱面或接物方向。'],
  RD: ['Random', '随机', '随机重排音符位置或键位。'],
  SG: ['Single Tap', '单键点击', '将可击打输入限制为单侧按键。'],
  SW: ['Swap', '交换', '交换太鼓的咚与咔音符。'],
  TP: ['Target Practice', '目标练习', '改变点击目标的移动方式以练习瞄准。'],
  AP: ['Autopilot', '自动移动', '自动移动光标，玩家仍需负责点击。'],
  RX: ['Relax', '放松', '自动处理部分输入，让玩家专注于移动或节奏。'],
  SO: ['Spun Out', '自动转盘', '自动完成转盘。'],
  AD: ['Approach Different', '不同缩圈', '让缩圈速度随谱面过程动态变化。'],
  AS: ['Adaptive Speed', '自适应速度', '根据表现动态调整播放速度。'],
  BM: ['Bloom', '绽放', '让圆圈尺寸随连击变化。'],
  BR: ['Barrel Roll', '桶滚', '让整个游玩区域持续旋转。'],
  BU: ['Bubbles', '气泡', '让物件呈现漂浮气泡效果。'],
  DF: ['Deflate', '缩小', '让圆圈随连击逐渐缩小。'],
  DP: ['Depth', '景深', '加入透视深度效果改变物件视觉。'],
  FF: ['Floating Fruits', '漂浮水果', '让接物物件产生漂浮运动。'],
  FR: ['Freeze Frame', '定格', '以定格效果改变谱面运动。'],
  GR: ['Grow', '成长', '让圆圈随连击逐渐变大。'],
  MG: ['Magnetised', '磁化', '让物件受到光标附近的磁力影响。'],
  MF: ['Moving Fast', '高速移动', '改变接物物件的横向运动速度。'],
  MU: ['Muted', '静音挑战', '让音乐音量随连击逐渐降低。'],
  NS: ['No Scope', '无镜瞄准', '根据光标移动改变物件可见度。'],
  RP: ['Repel', '排斥', '让物件受到光标附近的排斥力影响。'],
  SI: ['Spin In', '旋入', '让物件以旋转动画进入。'],
  SY: ['Synesthesia', '联觉', '用颜色和视觉变化强化节奏提示。'],
  TR: ['Transform', '变形', '让圆圈尺寸随谱面过程变化。'],
  WD: ['Wind Down', '渐慢', '播放速度随谱面过程逐渐降低。'],
  WG: ['Wiggle', '摇摆', '让游玩区域随节奏左右摆动。'],
  WU: ['Wind Up', '渐快', '播放速度随谱面过程逐渐提高。'],
  TD: ['Touch Device', '触屏设备', '标记成绩使用触屏设备完成。'],
  SV2: ['Score V2', '新版计分', '使用 ScoreV2 计分系统；可出现在成绩中但不可主动选择。'],
};

const ALL_OSU_GAME_IDS: readonly OsuGameId[] = ['osu-standard', 'osu-taiko', 'osu-catch', 'osu-mania'];

export const OSU_MOD_METADATA: readonly OsuModMetadata[] = Object.entries(OSU_MOD_TYPE_BY_ACRONYM).map(
  ([acronym, type]) => {
    const copy = OSU_MOD_COPY[acronym];
    const applicableGameIds = ALL_OSU_GAME_IDS.filter((gameId) =>
      OSU_USER_PLAYABLE_MODS_BY_GAME_ID[gameId].includes(acronym));
    return {
      acronym,
      englishName: copy[0],
      chineseName: copy[1],
      type,
      applicableGameIds,
      description: copy[2],
      descriptionByGameId: Object.fromEntries(
        applicableGameIds.map((gameId) => [gameId, copy[2]]),
      ) as Partial<Record<OsuGameId, string>>,
      gameplayMultipliersByGameId: OSU_MOD_GAMEPLAY_MULTIPLIERS[acronym],
      wikiPath: `/wiki/zh/Gameplay/Game_modifier/Summary#${acronym.toLowerCase()}`,
      userPlayable: acronym !== 'SV2',
    };
  },
);

const OSU_MOD_METADATA_BY_ACRONYM = new Map(OSU_MOD_METADATA.map((item) => [item.acronym, item]));

export function resolveOsuModMetadata(acronym: string): OsuModMetadata | null {
  return OSU_MOD_METADATA_BY_ACRONYM.get(acronym) ?? null;
}

export function osuModDescription(acronym: string, gameId: OsuGameId): string | null {
  const metadata = resolveOsuModMetadata(acronym);
  return metadata?.descriptionByGameId?.[gameId] ?? metadata?.description ?? null;
}

export function osuUserPlayableMods(gameId: OsuGameId): readonly OsuModMetadata[] {
  return OSU_USER_PLAYABLE_MODS_BY_GAME_ID[gameId].flatMap((acronym) => {
    const metadata = resolveOsuModMetadata(acronym);
    return metadata ? [metadata] : [];
  });
}

/** 模组图标文件名（远程图标包按 acronym 小写命名，如 DT → dt.svg）。 */
export function osuModIconFileName(acronym: string): string {
  return `${acronym.toLowerCase()}.svg`;
}

/** 查询模组配色：未知 acronym 返回 null（展示层静默跳过该模组）。 */
export function resolveOsuModTheme(acronym: string): OsuModTheme | null {
  const type = OSU_MOD_TYPE_BY_ACRONYM[acronym];
  return type ? OSU_MOD_THEME_BY_TYPE[type] : null;
}
