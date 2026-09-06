import { memo } from 'react';
import { View } from 'react-native';
import { FavoriteSongRow } from '@/components/game-content/FavoriteSongRow';
import { GameSongCover } from '@/components/game-content/GameSongCover';
import { SimaiDifficultyBadge } from '@/components/game-content/SimaiDifficultyBadge';
import { SimaiScoreCard } from '@/components/game-content/SimaiScoreCard';
import { SIMAI_CATALOG_LIST_STYLES as catalogStyles } from '@/components/game-content/SimaiListStyles';
import { DIFFICULTY_VISUAL, type DifficultyBadgeDisplay } from '@/components/ScoreVisuals';
import { BLUE_DIFFICULTY_COLORS } from '@/domain/difficulty-theme';
import { MAJDATA_DIFFICULTIES, majdataAsset, majdataRank, type MajdataSong } from '@/domain/majdata';
import { presentMajdataScore, presentMajdataSong, type MajdataCard } from '@/features/game-content/adapters/majdata';
import { useMajdataRanking } from '@/hooks/use-majdata';

export function majdataVisual(level: number) {
  return level === 0
    ? { label: 'EASY', color: BLUE_DIFFICULTY_COLORS.fg, tint: BLUE_DIFFICULTY_COLORS.bg,
        badgeBackground: BLUE_DIFFICULTY_COLORS.fg, badgeBorder: BLUE_DIFFICULTY_COLORS.fg, badgeText: '#FFFFFF' }
    : DIFFICULTY_VISUAL[MAJDATA_DIFFICULTIES[level] ?? 'unknown'];
}

export function MajdataDifficultyBadge({ level, value, name = true, display, compact = false, mini = false }: {
  level: number;
  value?: string;
  name?: boolean;
  display?: DifficultyBadgeDisplay;
  compact?: boolean;
  mini?: boolean;
}) {
  const visual = majdataVisual(level);
  const mode = display ?? (!name ? 'constant' : value === undefined ? 'label' : 'label-and-constant');
  const text = mode === 'constant' ? value ?? '—'
    : mode === 'label-and-constant' && value !== undefined ? `${visual.label} (${value})` : visual.label;
  return <SimaiDifficultyBadge text={text} compact={compact} mini={mini}
    theme={{ background: visual.badgeBackground, text: visual.badgeText, border: visual.badgeBorder }} />;
}

export const MajdataScoreCard = memo(function MajdataScoreCard({ card, username, visible, position }: {
  card: MajdataCard;
  username: string;
  visible: boolean;
  position?: number;
}) {
  const ranking = useMajdataRanking(card.songId, visible);
  const rank = majdataRank(ranking.data, username, card.level, card.hash);
  return <SimaiScoreCard presentation={{ ...presentMajdataScore(card, rank), position }}
    artwork={{ source: majdataAsset(card.songId, 'image') }} achievements={card.dx}
    sideMetric={{ label: '排名', value: rank, emptyText: '-' }}
    difficultyBadge={<MajdataDifficultyBadge level={card.level} value={card.difficulty} compact />}
    fc={['', 'fc', 'fcp', 'ap', 'app'][card.combo]}
    badgesTestID={`score-card-badges-${card.songId}`} />;
});

export const MajdataSongRow = memo(function MajdataSongRow({ song, favorite, favoritePending, onFavoriteChange }: {
  song: MajdataSong;
  favorite: boolean;
  favoritePending: boolean;
  onFavoriteChange: (songId: string, favorite: boolean) => void;
}) {
  return <FavoriteSongRow presentation={presentMajdataSong(song)}
    subtitleContent={song.artist || '曲师未知'}
    cover={<GameSongCover source={majdataAsset(song.id, 'image')} gameId="majdata-net" />}
    badges={<View accessibilityLabel="谱面难度" style={catalogStyles.chartGroups}>
      <View style={catalogStyles.chartGroup}>{song.levels.map((value, level) => value?.trim()
        ? <MajdataDifficultyBadge key={level} level={level} value={value} display="constant" compact /> : null)}</View>
    </View>}
    favorite={favorite} favoritePending={favoritePending} onFavoriteChange={onFavoriteChange} />;
});
