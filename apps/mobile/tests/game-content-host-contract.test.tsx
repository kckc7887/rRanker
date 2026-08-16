import { createHash } from 'node:crypto';
import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ScoreRecordCard } from '@/components/ScoreRecordCard';
import { ChunithmScoreCard } from '@/components/chunithm/ChunithmScoreCard';
import { ChunithmSongRow } from '@/components/chunithm/ChunithmSongRow';
import { PhigrosScoreCard } from '@/components/phigros/PhigrosScoreCard';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import type { ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';
import { fixtureCatalog, fixtureRecords } from '@/fixtures/sanitized';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(),
  stop: jest.fn(),
  reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

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

const chunithmScore: ChunithmScoreCardData = {
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
};

const chunithmSong = {
  id: 42,
  title: 'Visual Contract',
  artist: 'Composer',
  genre: 'ORIGINAL',
  bpm: 180,
  versionId: 23000,
  versionTitle: 'CHUNITHM VERSE',
  locked: false,
  disabled: false,
  difficulties: [{
    difficulty: 3 as const,
    level: '14+',
    levelValue: 14.2,
    noteDesigner: 'Charter',
    versionId: 23000,
    versionTitle: 'CHUNITHM VERSE',
  }],
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

test('exports the stable score-card and song-row host tree contract', async () => {
  const maimaiRecord = {
    ...fixtureRecords[0],
    achievements: 97,
    rate: 'a',
    fc: null,
    fs: null,
  };
  const phigrosRecord = {
    ...fixtureRecords[0],
    type: 'SD' as const,
    dxScore: 900_000,
    achievements: 90,
    fc: null,
    levelIndex: 3,
    difficultyConstant: 15.6,
  };
  const standardSong = fixtureCatalog.songs[0];
  const screens = [
    await render(<ScoreRecordCard record={maimaiRecord} rank={1} />),
    await render(<PhigrosScoreCard record={phigrosRecord} catalogTitle="Visual Contract" rank={1} />),
    await render(<ChunithmScoreCard record={chunithmScore} position={1} />),
    await render(
      <PhigrosSongRow
        blurUrl={null}
        favorite
        onFavoriteChange={jest.fn()}
        song={standardSong}
      />,
    ),
    await render(<ChunithmSongRow song={chunithmSong} />),
  ];
  const trees = [
    ...screens.map((screen) => screen.toJSON()),
  ];
  const canonicalTrees = canonicalize(trees) as unknown[];
  const hash = createHash('sha256').update(JSON.stringify(canonicalTrees)).digest('hex');
  expect(trees).toHaveLength(5);
  expect(hash).toBe('dc8083f720a32aefd28df87577fa369ab30d5afe94e9f7e7126e4f019106fc55');
});
