import { memo } from 'react';
import { Text, View } from 'react-native';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { GameSongRow, WRAPPED_COVER_ROW_STYLES as row } from '@/components/game-content/GameSongRow';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import { simaiScoreCardStyles as styles } from '@/components/game-content/SimaiScoreCardStyles';
import { AchievementValue, DIFFICULTY_VISUAL, ScoreStatusBadges } from '@/components/ScoreVisuals';
import { MAJDATA_DIFFICULTIES, MAJDATA_NAMES, MAJDATA_ORDER, majdataAsset, majdataRank, type MajdataSong } from '@/domain/majdata';
import { presentMajdataScore, presentMajdataSong, type MajdataCard } from '@/features/game-content/adapters/majdata';
import { useMajdataRanking } from '@/hooks/use-majdata';
import { useAppTheme } from '@/theme/app-theme';

export function majdataVisual(level: number) {
  return level === 0 ? { ...DIFFICULTY_VISUAL.basic, color: '#2563EB', tint: '#DBEAFE', badgeBackground: '#2563EB', badgeBorder: '#2563EB', badgeText: '#FFFFFF' }
    : DIFFICULTY_VISUAL[MAJDATA_DIFFICULTIES[level] ?? 'unknown'];
}
export function MajdataDifficultyBadge({ level, value, name = true }: { level: number; value?: string; name?: boolean }) {
  const v = majdataVisual(level);
  return <GameDifficultyBadge text={[name ? MAJDATA_NAMES[level] : '', value].filter(Boolean).join(' ')}
    theme={{ background: v.badgeBackground, text: v.badgeText, border: v.badgeBorder }} />;
}
export const MajdataScoreCard = memo(function MajdataScoreCard({ card, username, visible }: { card: MajdataCard; username: string; visible: boolean }) {
  const theme = useAppTheme(); const ranking = useMajdataRanking(card.songId, visible);
  const rank = majdataRank(ranking.data, username, card.level, card.hash);
  return <GameScoreCard presentation={presentMajdataScore(card, rank)} cardStyle={styles.card} mainStyle={styles.main} titleStyle={styles.title}
    artwork={{ source: majdataAsset(card.songId, 'image') }}
    side={<View style={styles.ratingBlock}><Text style={[styles.ratingLabel, { color: theme.textMuted }]}>排名</Text><Text style={[styles.rating, { color: theme.accent }]}>{rank ?? '-'}</Text></View>}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>{card.classic !== undefined ? <Text style={{ color: theme.textMuted }}>DX</Text> : null}<AchievementValue value={card.dx} compact /></View>
    {card.classic !== undefined ? <Text style={[styles.dxScore, { color: theme.textSecondary }]}>Classic {card.classic.toFixed(4)}%</Text> : null}
    <View style={styles.tags}><MajdataDifficultyBadge level={card.level} value={card.difficulty} />
      <ScoreStatusBadges achievements={card.dx} fc={['', 'fc', 'fcp', 'ap', 'app'][card.combo]} />
    </View>
    {card.timestamp ? <Text style={{ color: theme.textMuted, fontSize: 10 }}>{new Date(card.timestamp).toLocaleString()}</Text> : null}
  </GameScoreCard>;
});
export function MajdataSongRow({ song }: { song: MajdataSong }) {
  return <GameSongRow presentation={presentMajdataSong(song)} cover={null} rowStyle={row.row} mainStyle={row.meta}
    titleStyle={row.title} subtitleStyle={row.composer} openStyle={row.openSong}
    coverImage={{ source: majdataAsset(song.id, 'image'), accessibilityLabel: `${song.title} 封面`, imageStyle: row.cover,
      wrapStyle: row.coverWrap, placeholderStyle: row.placeholder, noteStyle: row.placeholderNote }}
    badges={<View style={row.badges}>{MAJDATA_ORDER.filter(i => song.levels[i]?.trim()).map(i => <MajdataDifficultyBadge key={i} level={i} value={song.levels[i]} />)}</View>} />;
}
