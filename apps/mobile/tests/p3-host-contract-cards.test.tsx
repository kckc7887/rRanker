/**
 * 宿主树回归基线，禁止更新哈希接受差异。
 * 覆盖：5 个 ScoreCard（Tuf/MuseDash/Phigros/Phira/Chunithm）与
 * 6 个 SongRow（adofai/musedash/chunithm/phigros/phira + cover 成功与失败回退两态）。
 * 数据使用 jest 测试 fixture（tuf-screens / muse-dash-screens /
 * game-content-host-contract / phira-ui / chunithm-song-detail），不造新数据语义。
 * 哈希确定性：Animated.loop 静态 mock；useFlowingProgress 固定静态首帧；
 * cover 失败态通过 fireEvent 触发 onError（♪ 占位），expo-image mock 为 RN.Image。
 */
import { createHash } from 'node:crypto';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { TufScoreCard } from '@/components/adofai/TufScoreCard';
import { TufSongRow } from '@/components/adofai/TufSongRow';
import { MuseDashScoreCard } from '@/components/musedash/MuseDashScoreCard';
import { MuseDashSongRow } from '@/components/musedash/MuseDashSongRow';
import { ChunithmScoreCard } from '@/components/chunithm/ChunithmScoreCard';
import { ChunithmSongRow } from '@/components/chunithm/ChunithmSongRow';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import { PhiraScoreCard } from '@/components/phira/PhiraScoreCard';
import { PhiraSongRow } from '@/components/phira/PhiraSongRow';
import type { TufLevel, TufPass } from '@/domain/tuf';
import type { MuseDashAlbumsResponse, MuseDashPlayer } from '@/domain/muse-dash';
import { fixtureCatalog, fixtureRecords } from '@/fixtures/sanitized';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

// 流光动画值固定为静态首帧：progress=0 → translateX 取 outputRange[0]（-width）。
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
// MuseDashScoreCard：会话账号（userId 解析）与 play detail 查询固定为空（muse-dash-screens 手法）
jest.mock('@/state/session-store', () => ({ useSession: (selector: (state: unknown) => unknown) => selector({
  activeAccountId: 'musedash:musedash-moe:6ea4f986ffd211e8aa980242ac110011',
  activeGameId: 'musedash',
}) }));
jest.mock('@/hooks/use-muse-dash', () => {
  const query = (data: unknown) => ({
    data, source: { kind: 'musedash', label: 'MuseDash.moe', updatedAt: '2026-08-10T00:00:00.000Z', isStale: false },
    isLoading: false, isError: false, error: null, isFetching: false, refetch: jest.fn(),
  });
  return {
    useMuseDashPlayer: () => query(undefined),
    useMuseDashAlbums: () => query(undefined),
    useMuseDashCe: () => query(undefined),
    useMuseDashDiffdiff: () => query(undefined),
    useMuseDashPlayDetail: () => query(undefined),
    useMuseDashPlayDetails: () => new Map(),
  };
});
// TufSongRow：视频详情固定为空，封面回落 ADOFAI 图标（tuf-screens 手法）
jest.mock('@/hooks/use-tuf', () => ({
  useTufVideoDetails: () => ({ data: undefined, isLoading: true, isError: false, error: null, refetch: jest.fn() }),
}));

// —— TUF fixture（tuf-screens.test.tsx 原样）——
const tufLevel = {
  id: 11372, songId: 401, song: '关卡 A', artist: '艺术家', diffId: 8, baseScore: 12.34,
  bpm: null, tilecount: null, autoTileCount: null, levelLengthInMs: null,
  difficulty: { id: 8, name: 'G12', type: 'SPECIAL', sortOrder: 12, baseScore: 12.34 },
  levelCredits: [], tags: [], curations: [],
} as TufLevel;

function tufPass(id: number, title: string): TufPass {
  return {
    id, levelId: tufLevel.id + id, scoreV2: 100 + id, accuracy: 99.5, speed: 1,
    impact: 20 + id, judgements: null, level: { ...tufLevel, id: tufLevel.id + id, song: title },
  } as TufPass;
}
const tufWorldsFirstPass = {
  ...tufPass(3, '世界首通关卡'),
  isWorldsFirst: true,
  isWorldsFirstPP: true,
} as TufPass;

// —— MuseDash fixture（muse-dash-screens.test.tsx 原样节选）——
const museDashAlbums: MuseDashAlbumsResponse = {
  ALBUM1: {
    title: 'Default Music', json: 'ALBUM1', tag: 'Default',
    music: {
      '0-47': {
        uid: '0-47', name: 'Sample Song', author: 'Sample Author', cover: 'sample_cover',
        bpm: '128', levelDesigner: ['Mapper A'], difficulty: ['2', '5', '8', '11', '12'],
        ChineseS: { name: '示例歌曲', author: '示例作者' },
      },
    },
  },
};
const museDashPlayer: MuseDashPlayer = {
  lastUpdate: 1786311369798, rl: 3.4518686005869577, diffHistoryNumber: 11,
  plays: [
    { score: 302027, acc: 94.17, i: 1950, platform: 'mobile', history: { lastRank: 1949 }, difficulty: 2, uid: '1-1', sum: 3950, character_uid: '11', elfin_uid: '7' },
  ],
  user: { user_id: '6ea4f986ffd211e8aa980242ac110011', nickname: 'SiMOOOOOON' },
};
const museDashScore = {
  play: museDashPlayer.plays[0],
  song: museDashAlbums.ALBUM1!.music['0-47']!,
  albumTitle: 'Default Music',
  characterName: '布若',
  elfinName: '厄普西隆',
  constant: 11.5,
};

// —— Phira fixture（phira-ui.test.tsx 原样）——
const phiraChart = {
  id: 38294, name: '初音未来的消失', level: 'AT Lv.16', difficulty: 16.2,
  charter: '谱师', composer: 'CosMo@暴走P', illustrator: '', description: '简介',
  ranked: false, stable: false, uploader: 1252389, tags: ['regular'], rating: .9, ratingCount: 10,
  created: '2025-05-18T06:02:48.727Z', updated: '2025-05-20T22:46:26.729Z', chartUpdated: null,
  illustration: null, preview: null, file: null,
};
const phiraBest = {
  chart: phiraChart, poolRks: null, queriedAt: '2026-08-13T00:00:00.000Z',
  record: { id: 1, chart: phiraChart.id, score: 999_000, accuracy: .999, perfect: 99, good: 1, bad: 0, miss: 0, fullCombo: true, best: true, created: null },
};

// —— Chunithm fixture（chunithm-song-detail.test.tsx 原样节选）——
const chunithmSong = {
  id: 3,
  title: 'B.B.K.K.B.K.K.',
  artist: 'nora2r',
  genre: '其他游戏',
  bpm: 170,
  aliases: ['bbkkbkk', 'bk'],
  versionId: 23000,
  versionTitle: 'CHUNITHM VERSE',
  locked: false,
  disabled: false,
  difficulties: [
    { difficulty: 3 as const, level: '12+', levelValue: 12.5, noteDesigner: 'Master Designer', versionId: 23000, versionTitle: 'CHUNITHM VERSE' },
    { difficulty: 5 as const, level: '0', levelValue: 0, noteDesigner: 'WE Designer', versionId: 22000, versionTitle: 'CHUNITHM LUMINOUS PLUS', originId: 163, kanji: '止', star: 1 },
  ],
};

// —— Phigros/maimai record（game-content-host-contract.test.tsx 原样）——
const phigrosRecord = {
  ...fixtureRecords[0],
  type: 'SD' as const,
  dxScore: 900_000,
  achievements: 90,
  fc: null,
  levelIndex: 3,
  difficultyConstant: 15.6,
};

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

type JsonNode = { type?: string; props?: Record<string, unknown>; children?: unknown };

/** 在 Host Tree 中按 source.uri 定位 RN.Image 节点（expo-image mock 后 uri 即源字符串）。 */
function findImageByUri(node: unknown, uriPart: string): JsonNode | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findImageByUri(child, uriPart);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  const item = node as JsonNode;
  const uri = (item.props?.source as { uri?: string } | undefined)?.uri;
  if (typeof uri === 'string' && uri.includes(uriPart) && typeof item.props?.onError === 'function') return item;
  return findImageByUri(item.children, uriPart);
}

/** 触发封面 onError 并 flush 到稳定回退态（♪ 占位）。 */
async function triggerCoverError(tree: unknown, uriPart: string): Promise<void> {
  const image = findImageByUri(tree, uriPart);
  if (!image) throw new Error(`未找到封面 Image：${uriPart}`);
  await act(async () => {
    (image.props!.onError as (event: unknown) => void)({ nativeEvent: { error: 'contract' } });
  });
}

test('tuf score card host tree contract', async () => {
  const screens = [
    await render(<TufScoreCard pass={tufPass(1, '第一条')} position={1} />),
    // 世界首通/首杀徽章分支
    await render(<TufScoreCard pass={tufWorldsFirstPass} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('6261238a374ce075ae24f3ef9c4828f98fc8137c1e47812ea11a8769929b5382');
});

test('musedash score card host tree contract', async () => {
  const screens = [
    await render(<MuseDashScoreCard score={museDashScore} position={1} />),
    // 无定数、无歌曲联表（uid 回落标题）
    await render(<MuseDashScoreCard score={{
      ...museDashScore,
      song: null,
      albumTitle: '未知专辑',
      constant: undefined,
      characterName: null,
      elfinName: null,
    }} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('858f490c2df89e33492da83838af89367478d1f38a89532493c159d17bd543f7');
});

test('phigros score card host tree contract', async () => {
  const screens = [
    await render(<PhigrosScoreCard record={phigrosRecord} catalogTitle="Visual Contract" rank={1} />),
    // 满分 phi 流光 + 物量驱动的 XING 判定
    await render(<PhigrosScoreCard
      record={{ ...phigrosRecord, dxScore: 1_000_000, achievements: 100, rating: 15.6 }}
      totalNotes={460}
    />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('c102782dbb2e00c7739b85e6568dcb24849598270e0deb17d18569ae18ff7ae7');
});

test('phira score card host tree contract', async () => {
  const screens = [
    await render(<PhiraScoreCard item={phiraBest} rank={1} />),
    // 未游玩（record 为 null）+ poolRks 展示
    await render(<PhiraScoreCard item={{ ...phiraBest, record: null, poolRks: 12.34 }} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('142ed7b92554b94f63cc6ba9e598e9a6f1ea03730312ffb427b5a55f6ced0fa2');
});

test('chunithm score card host tree contract', async () => {
  const screens = [
    // 普通成绩（game-content-host-contract 原样数据）
    await render(<ChunithmScoreCard record={{
      key: 'chunithm:42:3',
      songId: '42',
      title: 'Visual Contract',
      artist: 'Composer',
      levelIndex: 3,
      level: '14+',
      difficultyConstant: 14.2,
      score: 900_000,
      rank: 'A',
      clear: 'failed',
      rating: 15.28,
    }} position={1} />),
    // SSS+ 满成绩：流光渐变分数 + AJ 徽章
    await render(<ChunithmScoreCard record={{
      key: 'chunithm:43:3',
      songId: '43',
      title: 'SSS Contract',
      artist: 'Composer',
      levelIndex: 3,
      level: '14+',
      difficultyConstant: 14.2,
      score: 1_009_000,
      rank: 'SSS+',
      clear: 'clear',
      fullCombo: 'alljustice',
      rating: 17.25,
    }} />),
    // WORLD'S END 特殊难度徽章
    await render(<ChunithmScoreCard record={{
      key: 'chunithm:44:5',
      songId: '44',
      title: 'WE Contract',
      levelIndex: 5,
      level: '0',
      score: 950_000,
      rank: 'S',
      clear: 'clear',
      worldsEndLabel: '止☆1',
    }} />),
  ];
  expect(await treeHash(screens.map((screen) => screen.toJSON()))).toBe('fc6143da761bf51b85580506fc4707379398aae9f3109309d4c82e6d8b8740d1');
});

test('tuf song row host tree contract', async () => {
  const screen = await render(<TufSongRow level={tufLevel} />);
  expect(await treeHash([screen.toJSON()])).toBe('4176a9abce8b89face9caaf31e510c1d96ca3cb973fd8c67ffda8c9ee4add5b9');
});

test('musedash song row host tree contract (cover ok and fallback)', async () => {
  const constants = [2.0, 5.0, 8.0, 11.5, 12.5];
  const ok = await render(<MuseDashSongRow
    song={museDashAlbums.ALBUM1!.music['0-47']!}
    albumTitle="Default Music"
    constants={constants}
  />);
  const okTree = ok.toJSON();
  // 触发封面 onError → ♪ 占位回退
  await triggerCoverError(okTree, 'musedash.moe/covers/sample_cover');
  const fallbackTree = ok.toJSON();
  expect(await treeHash([okTree, fallbackTree])).toBe('fb2d1882ff940198a99de1e9a39745ce35295e4a63d729be337cbd07d5afcf5c');
});

test('chunithm song row host tree contract (cover ok and fallback)', async () => {
  const ok = await render(<ChunithmSongRow song={chunithmSong} />);
  const okTree = ok.toJSON();
  // 曲目含 WORLD'S END（originId 163），封面 URL 优先 WE originId
  await triggerCoverError(okTree, 'assets2.lxns.net/chunithm/jacket/163.png');
  const fallbackTree = ok.toJSON();
  expect(await treeHash([okTree, fallbackTree])).toBe('c020dba5eccdbd9ba0788cc523406830b8aa7ab0da67bbb0c724dc83a2c2b4e5');
});

test('phigros song row host tree contract (cover ok and fallback)', async () => {
  const standardSong = fixtureCatalog.songs[0];
  const ok = await render(
    <PhigrosSongRow
      blurUrl="https://example.test/blur.png"
      favorite
      onFavoriteChange={jest.fn()}
      song={standardSong}
    />,
  );
  const okTree = ok.toJSON();
  await triggerCoverError(okTree, 'example.test/blur.png');
  const fallbackTree = ok.toJSON();
  // blurUrl 为空：直接 ♪ 占位
  const nullBlur = await render(
    <PhigrosSongRow blurUrl={null} song={standardSong} />,
  );
  expect(await treeHash([okTree, fallbackTree, nullBlur.toJSON()])).toBe('a22b5132682956b077e8040c3471f8b36373fa1601f599f01773f124b92a104c');
});

test('phira song row host tree contract (cover ok and fallback)', async () => {
  const ok = await render(<PhiraSongRow chart={{ ...phiraChart, illustration: 'https://example.test/illust.png' }} />);
  const okTree = ok.toJSON();
  await triggerCoverError(okTree, 'example.test/illust.png');
  const fallbackTree = ok.toJSON();
  // illustration 为空：直接 ♪ 占位
  const empty = await render(<PhiraSongRow chart={phiraChart} />);
  expect(await treeHash([okTree, fallbackTree, empty.toJSON()])).toBe('1899b6d8ca6c407771bb21498a3787708bc0a7758cec3f26e1f7a94d6395bc3e');
});
