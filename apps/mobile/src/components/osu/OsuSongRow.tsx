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

/**
 * osu! 曲库行：封面（失败回退 ♪）、标题、作者不变；
 * 难度标签为该 beatmapset 下当前模式全部难度（升序）的空胶囊，可换行、不显示任何字，
 * 每个胶囊按星数命中 osu 官方十一档色阶（osu-star-theme）。
 * 点击进入歌曲详情页（/songs/{beatmapset id}，路由已分发 osu 详情）。
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
      badges={song.difficultyRatings.length > 0 ? (
        <View style={WRAPPED_COVER_ROW_STYLES.badges}>
          {song.difficultyRatings.map((rating, index) => (
            <GameDifficultyBadge
              key={`${rating}-${index}`}
              testID="osu-catalog-difficulty-badge"
              text=" "
              theme={resolveOsuStarTheme(rating)}
              // 仅一个空格字符的窄胶囊：列容器默认交叉轴拉伸会把胶囊拉成整行宽，
              // 必须左对齐并去掉最小宽度/内边距，宽度只贴住空格字符。
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
