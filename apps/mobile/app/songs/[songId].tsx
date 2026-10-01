import { ChunithmSongDetail } from '@/components/chunithm/ChunithmSongDetail';
import { EmptyDataView } from '@/components/EmptyDataView';
import { MaimaiSongDetailScreen } from '@/components/maimai/MaimaiSongDetail';
import { MajdataSongDetail } from '@/components/majdata/MajdataSongDetail';
import { OsuSongDetail } from '@/components/osu/OsuSongDetail';
import { PhigrosSongDetail } from '@/components/phigros/PhigrosSongDetail';
import { RizlineSongDetail } from '@/components/rizline/RizlineSongDetail';
import {
decodeDetailTarget,
type DetailTarget,
type DetailTargetParams,
} from '@/domain/detail-target';
import { MuseDashSongDetailScreen } from '@/screens/MuseDashScreens';
import { PhiraSongDetailScreen } from '@/screens/PhiraScreens';
import { TufLevelDetailScreen } from '@/screens/TufScreens';
import { useSession } from '@/state/session-store';
import { useAppTheme } from '@/theme/app-theme';
import { useLocalSearchParams } from 'expo-router';

export default function SongDetailScreen() {
  const theme = useAppTheme();
  const activeGameId = useSession((s) => s.activeGameId);
  const params = useLocalSearchParams<DetailTargetParams>();
  const resolution = decodeDetailTarget(activeGameId, params);

  if (!resolution.ok) {
    return <EmptyDataView
      title="无法打开谱面"
      detail="这一条谱面定位信息无法识别，请返回列表重新进入。"
    />;
  }

  return <SongDetailTargetScreen target={resolution.target} themeBackground={theme.background} />;
}

/** 先解析出已校验的 DetailTarget，再按游戏挂载对应详情页。 */
function SongDetailTargetScreen({ target, themeBackground }: {
  target: DetailTarget;
  themeBackground: string;
}) {
  switch (target.game) {
    case 'phigros':
      return <PhigrosSongDetail songId={target.songId} levelIndex={target.levelIndex} />;
    case 'chunithm':
      return <ChunithmSongDetail songId={target.songId} initialLevelIndex={target.levelIndex} />;
    case 'majdata-net':
      return <MajdataSongDetail songId={target.songId} initialLevelIndex={target.levelIndex} />;
    case 'rizline':
      return <RizlineSongDetail songId={target.songId} initialLevelIndex={target.levelIndex} />;
    case 'musedash':
      return <MuseDashSongDetailScreen songId={target.songId} levelIndex={target.levelIndex} />;
    case 'phira':
      return <PhiraSongDetailScreen chartId={target.chartId} />;
    case 'adofai':
      return <TufLevelDetailScreen levelId={target.levelId} />;
    // osu! 四模式共用歌曲详情页：beatmapsetId 定位谱面集，beatmapId 定位成绩卡带入的难度。
    case 'osu-standard':
    case 'osu-mania':
    case 'osu-catch':
    case 'osu-taiko':
      return <OsuSongDetail
        beatmapsetId={target.beatmapsetId}
        initialBeatmapId={target.beatmapId}
        initialScoreId={target.scoreId}
      />;
    case 'maimai':
      return <MaimaiSongDetailScreen
        songId={target.songId}
        chartType={target.chartType}
        initialLevelIndex={target.levelIndex}
        themeBackground={themeBackground}
      />;
  }
}
