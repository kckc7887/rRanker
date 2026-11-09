import { memo } from 'react';
import { GameSongRow, SongRowBadges } from '@/components/game-content/GameSongRow';
import { SimaiDifficultyBadge } from '@/components/game-content/SimaiDifficultyBadge';
import { SimaiScoreCard } from '@/components/game-content/SimaiScoreCard';
import { DIFFICULTY_VISUAL, type DifficultyBadgeDisplay } from '@/components/ScoreVisuals';
import { BLUE_DIFFICULTY_COLORS } from '@/domain/difficulty-theme';
import { MAJDATA_DIFFICULTIES, majdataAsset, majdataRank, type MajdataSong } from '@/domain/majdata';
import { presentMajdataScore, presentMajdataSong, type MajdataCard } from '@/features/game-content/adapters/majdata';
import { useMajdataRanking } from '@/hooks/use-majdata';
import { useCachedTabActive } from '@/components/CachedTabScreen';

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
  visible?: boolean;
  position?: number;
}) {
  const active = useCachedTabActive();
  const ranking = useMajdataRanking(card.songId, active && visible !== false);
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
  return <GameSongRow accessibilityLabel={null} presentation={presentMajdataSong(song)}
    subtitleContent={song.artist || '曲师未知'}
    coverSource={majdataAsset(song.id, 'image')}
    badges={<SongRowBadges accessibilityLabel="谱面难度">{song.levels.map((value, level) => value?.trim()
        ? <MajdataDifficultyBadge key={level} level={level} value={value} display="constant" compact /> : null)}</SongRowBadges>}
    favorite={favorite} favoritePending={favoritePending} onFavoriteChange={onFavoriteChange} />;
});
