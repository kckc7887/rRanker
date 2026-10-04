import { encodeDetailTarget } from '@/domain/detail-target';
import { View } from 'react-native';
import {
  GameSongRow,
  WRAPPED_COVER_ROW_STYLES,
  type SongRowCoverImage,
} from '@/components/game-content/GameSongRow';
import { GameDifficultyBadge } from '@/components/game-content/GameDifficultyBadge';
import type { OsuGameId } from '@/domain/game-mode-family';
import type { OsuCatalogSong } from '@/domain/osu';
import { resolveOsuStarTheme } from '@/domain/osu-star-theme';

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
        route: encodeDetailTarget({ game: gameId, beatmapsetId: String(song.beatmapSetId) }),
        title: song.title,
        subtitle: song.artist,
        accessibilityLabel: `歌曲 ${song.title}`,
        chartBadges: [],
      }}
      cover={<View />}
      coverImage={coverImage}
      badges={song.difficultyRatings.length > 0 ? (
        <View style={WRAPPED_COVER_ROW_STYLES.badges}>
          {song.difficultyRatings.map((rating, index) => (
            <GameDifficultyBadge
              key={`${rating}-${index}`}
              testID="osu-catalog-difficulty-badge"
              text=" "
              theme={resolveOsuStarTheme(rating)}
              /** 空胶囊需左对齐，避免拉伸成整行。 */
              style={{ alignSelf: 'flex-start', minWidth: 0, paddingHorizontal: 4 }}
            />
          ))}
        </View>
      ) : null}
      rowStyle={WRAPPED_COVER_ROW_STYLES.row}
      mainStyle={WRAPPED_COVER_ROW_STYLES.meta}
      titleStyle={WRAPPED_COVER_ROW_STYLES.title}
      subtitleStyle={WRAPPED_COVER_ROW_STYLES.composer}
      openStyle={WRAPPED_COVER_ROW_STYLES.openSong}
      testID={`osu-song-row-${song.beatmapSetId}`}
    />
  );
}
