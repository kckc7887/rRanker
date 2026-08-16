/**
 * P3 回归基线，采集自改造前现状，禁止更新哈希接受差异。
 * 覆盖：5 个 DifficultyBadge（adofai/musedash/chunithm/phigros/ScoreVisuals）、
 * 流光渐变文本 4 入口（ChunithmGradientScore、AchievementValue→GradientAchievement、
 * PhigrosScoreValue→FlowingGradientText、MuseDashAccValue）与 DxRatingCard 整卡。
 * 哈希确定性：Animated.loop 静态 mock；useFlowingProgress 固定为静态首帧
 * （progress=0 → interpolate 取 outputRange[0]），流光动画值不进入运行时抖动。
 * 数据构造均沿用既有 jest 测试 fixture（tuf-screens / muse-dash-screens /
 * game-content-host-contract / dx-rating-components），不造新数据语义。
 */
import { createHash } from 'node:crypto';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { TufDifficultyBadge } from '@/components/adofai/TufDifficultyBadge';
import { MuseDashDifficultyBadge } from '@/components/musedash/MuseDashDifficultyBadge';
import { ChunithmDifficultyBadge } from '@/components/chunithm/ChunithmDifficultyBadge';
import { PhigrosDifficultyBadge } from '@/components/phigros/PhigrosDifficultyBadge';
import { AchievementValue, DifficultyBadge } from '@/components/ScoreVisuals';
import { ChunithmGradientScore } from '@/components/chunithm/ChunithmScoreCard';
import { PhigrosScoreValue } from '@/components/phigros/PhigrosScoreValue';
import { MuseDashAccValue } from '@/components/musedash/MuseDashAccValue';
import { DxRatingCard } from '@/components/DxRatingCard';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import {
  resolveChunithmPossessionTheme,
  resolveChunithmRatingTier,
} from '@/domain/chunithm-rating-theme';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

// 流光动画值固定为静态首帧：progress=0 → translateX 取 outputRange[0]（-width），
// 与 useFlowingProgress 在 loop 被 mock 后 progress 恒 0 的首帧语义一致。
jest.mock('@/components/game-content/use-flowing-progress', () => ({
  useFlowingProgress: () => ({
    interpolate: ({ outputRange }: { outputRange: number[] }) => outputRange[0],
  }),
}));

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Image: ({ source, ...props }: { source?: unknown }) => (
      <RN.Image {...props} source={{ uri: String(source) }} />
    ),
  };
});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

async function treeHash(trees: unknown[]): Promise<string> {
  const canonical = canonicalize(trees) as unknown[];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

test('tuf difficulty badge host tree contract', async () => {
  const screens = [
    // 普通 P/G/U 难度：各 display 取值
    await render(<TufDifficultyBadge difficulty={{ key: 'difficulty', label: 'P12', value: '12.34', tone: 'tuf-p' }} />),
    await render(<TufDifficultyBadge difficulty={{ key: 'difficulty', label: 'P12', value: '12.34', tone: 'tuf-p' }} display="band" />),
    await render(<TufDifficultyBadge difficulty={{ key: 'difficulty', label: 'G7', value: '7.89', tone: 'tuf-g' }} display="label" />),
    await render(<TufDifficultyBadge difficulty={{ key: 'difficulty', label: 'U5', tone: 'tuf-u' }} display="value" />),
    // 特殊难度（SPECIAL 类型，tufDifficultyVisual 无 PGU 匹配 → 渐变胶囊分支）
    await render(<TufDifficultyBadge
      difficulty={{ key: 'difficulty', label: 'G12', value: '12.34', tone: 'tuf-special' }}
      source={{ name: 'G12', type: 'SPECIAL', color: null }}
    />),
    // 上游难度带色：source 提供自定义色
    await render(<TufDifficultyBadge
      difficulty={{ key: 'difficulty', label: 'U5', value: '5.00', tone: 'tuf-u' }}
      source={{ name: 'U5', type: 'PGU', color: '#7B4FB2' }}
    />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('3eac77308724b585419f085c0814408b0bbe41b26f3079b82f06ca93d599624c');
});

test('musedash difficulty badge host tree contract', async () => {
  const screens = [
    await render(<MuseDashDifficultyBadge levelIndex={3} level="11" constant={11.5} />),
    await render(<MuseDashDifficultyBadge levelIndex={3} level="11" constant={11.5} display="label" />),
    await render(<MuseDashDifficultyBadge levelIndex={3} level="11" constant={11.5} display="label-and-value" />),
    // 无定数：回落标级文本
    await render(<MuseDashDifficultyBadge levelIndex={4} level="11" />),
    // 无定数且标级为数字
    await render(<MuseDashDifficultyBadge levelIndex={0} level="2" />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('b350473859f2098f2181118838784fe5f6c3291f1e43fc09938751c62ae25975');
});

test('chunithm difficulty badge host tree contract', async () => {
  const screens = [
    // 普通难度：各 display 取值
    await render(<ChunithmDifficultyBadge levelIndex={3} level="14+" constant={14.2} />),
    await render(<ChunithmDifficultyBadge levelIndex={3} level="14+" constant={14.2} display="label" />),
    await render(<ChunithmDifficultyBadge levelIndex={3} level="14+" constant={14.2} display="label-and-value" />),
    // 特殊难度：WORLD'S END 渐变胶囊（levelIndex 5）
    await render(<ChunithmDifficultyBadge levelIndex={5} worldsEndLabel="止☆1" />),
    await render(<ChunithmDifficultyBadge levelIndex={5} worldsEndLabel="止☆1" display="label-and-value" />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('a379e75e78994e5eba8ccc81cde7cbdc335433fbcb317ea02606e91b9e2e8e69');
});

test('phigros difficulty badge host tree contract', async () => {
  const screens = [
    await render(<PhigrosDifficultyBadge levelIndex={3} constant={15.6} />),
    // 仅定数（SongRow 用法）
    await render(<PhigrosDifficultyBadge levelIndex={2} constant={14.8} showLabel={false} />),
    // labelOverride（Phira 谱面 Lv 文本）
    await render(<PhigrosDifficultyBadge levelIndex={4} constant={16.2} labelOverride="AT Lv.16" />),
    await render(<PhigrosDifficultyBadge levelIndex={0} constant={5.5} showConstant={false} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('557096831e60eb0d152cd0ee0e270561582f347e810bb80bb5f41e660d655421');
});

test('maimai (ScoreVisuals) difficulty badge host tree contract', async () => {
  const screens = [
    // 普通难度：默认/显式 display 与 compact/mini 尺寸
    await render(<DifficultyBadge difficulty="master" constant={13.6} />),
    await render(<DifficultyBadge difficulty="expert" constant={12.9} display="label" />),
    await render(<DifficultyBadge difficulty="basic" constant={5.0} display="constant" />),
    await render(<DifficultyBadge difficulty="advanced" constant={9.7} display="label-and-constant" compact />),
    await render(<DifficultyBadge difficulty="remaster" constant={14.9} mini />),
    await render(<DifficultyBadge difficulty="unknown" />),
    // 特殊难度：utage 宴会场（specialLabel 覆盖）
    await render(<DifficultyBadge difficulty="utage" specialLabel="宴会場" />),
    await render(<DifficultyBadge difficulty="utage" mini />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('ad7b1659d3b530d3d28f4139d4d63d407c9083204ac02ff3dfaa48b7a7569d6a');
});

test('chunithm gradient score host tree contract (static and flowing first frame)', async () => {
  const screens = [
    await render(<ChunithmGradientScore flowing={false} text="1,009,000" />),
    await render(<ChunithmGradientScore flowing text="1,009,000" />),
    await render(<ChunithmGradientScore flowing={false} text="900,000" height={36} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('6687f88e715033600fc2d31623e8e48af9b9f56f55edd82f57f6aa92ed56b78f');
});

test('maimai achievement value host tree contract (gradient entries)', async () => {
  const screens = [
    // 100.5 → 流光彩虹（GradientAchievement flowing）
    await render(<AchievementValue value={100.5} />),
    // 100 → 静态彩虹（GradientAchievement）
    await render(<AchievementValue value={100} />),
    // 金/普通色/未游玩
    await render(<AchievementValue value={99.5} />),
    await render(<AchievementValue value={96.4} />),
    await render(<AchievementValue />),
    await render(<AchievementValue value={100.5} compact />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('6704825ee2ce392df19bb3e028cf28de17dcad73feeefe421e8a7544fb329f05');
});

test('phigros score value host tree contract (flowing gradient entries)', async () => {
  const screens = [
    await render(<PhigrosScoreValue score={1_000_000} variant="phi" textColor="#111827" />),
    await render(<PhigrosScoreValue score={980_000} variant="fc" textColor="#111827" />),
    await render(<PhigrosScoreValue score={950_000} variant="normal" textColor="#111827" />),
    await render(<PhigrosScoreValue score={1_000_000} variant="phi" textColor="#111827" fontSize={34} lineHeight={40} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('5ca98e6bdb9c8c14b8395e0ed7235f29f683b1f39e3436635042e4cea48fb25d');
});

test('musedash acc value host tree contract', async () => {
  const screens = [
    await render(<MuseDashAccValue acc={100} />),
    await render(<MuseDashAccValue acc={95} />),
    await render(<MuseDashAccValue acc={90} />),
    await render(<MuseDashAccValue acc={88} />),
    await render(<MuseDashAccValue acc={undefined} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('a331ba98052ddb7451069de0c1890730fe840d79617c8b3b60fac22405837208');
});

test('dx rating card host tree contract', async () => {
  const possessionTheme = resolveChunithmPossessionTheme('rainbow');
  const screens = [
    // 默认档位（星星 + 渐变边框）
    await render(<DxRatingCard label="DX RATING" display="16750" meta="测试玩家" rating={16750} />),
    // Phigros 课题模式 sideBadge（dx-rating-components 既有构造）
    await render(<DxRatingCard
      label="Raking Score"
      display="16.1266"
      meta="B27 14.81 · Phi3 15.00"
      rating={16.1266}
      themeOverride={resolvePhigrosChallengeTheme(442)}
      sideBadge={{ title: '课题模式', value: '42' }}
    />),
    // 中二持有度背景 + 彩虹档位描边 + borderless（基线取双 rAF 后的 settled 挂载）
    await render(<DxRatingCard
      borderless
      label="RATING"
      display="17.25"
      meta="Best30 17.20 · New20 17.30"
      rating={17.25}
      themeOverride={possessionTheme}
      valueTheme={resolveChunithmRatingTier(17.25)}
    />),
    // 空账号中性灰底
    await render(<DxRatingCard label="DX RATING" display="—" meta="未绑定" rating={null} />),
  ];
  // DxRatingCard 的双 rAF maskSettled 翻转经 react-native jest setup 映射为 setTimeout 宏任务；
  // 全量并行负载时回调可能尚未执行（树停在 warm 挂载）导致哈希偶发漂移。
  // 固定 flush 若干宏任务槽并包进 act，确定性地到达 settled 挂载后再取哈希（双 rAF 仅需两槽，取四槽冗余保险）。
  await act(async () => {
    for (let frame = 0; frame < 4; frame += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    }
  });
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('000311caba6a626cdbb56ad86b4a1623f85ed5b274138a214af261627d77ca8f');
});
