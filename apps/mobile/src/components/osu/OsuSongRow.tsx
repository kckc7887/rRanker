import { View } from 'react-native';
import {
  GameSongRow,
  WRAPPED_COVER_ROW_STYLES,
  type SongRowCoverImage,
} from '@/components/game-content/GameSongRow';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import type { OsuGameId } from '@/domain/game-mode-family';
import type { OsuCatalogSong } from '@/domain/osu';

/** 曲库页空难度标签：不显示任何字，仅一个空格宽度的空胶囊（osu 品牌粉）。 */
const OSU_CATALOG_BADGE_THEME = {
  background: '#FF66AA',
  border: '#FF66AA',
  text: '#FFFFFF',
} as const;

/**
 * osu! 曲库行：封面（失败回退 ♪）、标题、作者不变；
 * 难度标签不显示任何字，仅保留一个空格宽度占位。歌曲详情未接入，行不可点击。
 */
export function OsuSongRow({ gameId, song }: {
  gameId: OsuGameId;
  song: OsuCatalogSong;
}) {
  const coverImage: SongRowCoverImage = {
    source: song.listCover,
    accessibilityLabel: `封面 ${song.title}`,
    imageStyle: WRAPPED_COVER_ROW_STYLES.cover,
    wrapStyle: WRAPPED_COVER_ROW_STYLES.coverWrap,
    placeholderStyle: WRAPPED_COVER_ROW_STYLES.placeholder,
    noteStyle: WRAPPED_COVER_ROW_STYLES.placeholderNote,
  };
  return (
    <GameSongRow
      presentation={{
        key: String(song.beatmapSetId),
        gameId,
        route: { songId: String(song.beatmapSetId) },
        title: song.title,
        subtitle: song.artist,
        accessibilityLabel: `歌曲 ${song.title}`,
        chartBadges: [],
      }}
      cover={<View />}
      coverImage={coverImage}
      badges={<GameDifficultyBadge testID="osu-catalog-difficulty-badge" text=" " theme={OSU_CATALOG_BADGE_THEME} />}
      rowStyle={WRAPPED_COVER_ROW_STYLES.row}
      mainStyle={WRAPPED_COVER_ROW_STYLES.meta}
      titleStyle={WRAPPED_COVER_ROW_STYLES.title}
      subtitleStyle={WRAPPED_COVER_ROW_STYLES.composer}
      openStyle={WRAPPED_COVER_ROW_STYLES.openSong}
      pressable={false}
      testID={`osu-song-row-${song.beatmapSetId}`}
    />
  );
}
