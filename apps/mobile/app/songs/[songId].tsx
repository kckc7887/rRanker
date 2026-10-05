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
import { useState } from 'react';
import { AccountSwitchSheet } from '@/components/AccountSwitchSheet';
import { QueryStateView } from '@/components/QueryStateView';
import { useNotification } from '@/components/AppNotification';
import { findGame, type GameId } from '@/domain/game-bind-options';
import { switchBoundAccount, notifyAccountSwitchError } from '@/services/switch-bound-account';

export default function SongDetailScreen() {
  const theme = useAppTheme();
  const activeGameId = useSession((s) => s.activeGameId);
  const params = useLocalSearchParams<DetailTargetParams>();
  const resolution = decodeDetailTarget(params);

  if (!resolution.ok) {
    return <EmptyDataView
      title="无法打开谱面"
      detail="这一条谱面定位信息无法识别，请返回列表重新进入。"
    />;
  }

  if (resolution.target.game !== activeGameId) return <DetailGameSwitch gameId={resolution.target.game} />;
  return <SongDetailTargetScreen target={resolution.target} themeBackground={theme.background} />;
}

function DetailGameSwitch({ gameId }: { gameId: GameId }) {
  const accounts = useSession(state => state.boundAccounts).filter(account => account.gameId === gameId);
  const activeAccountId = useSession(state => state.activeAccountId);
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState<GameId | null>(gameId);
  const { showNotification } = useNotification();
  if (!accounts.length) return <EmptyDataView title="需要绑定游戏账号"
    detail={`此链接属于${findGame(gameId)?.title ?? gameId}，绑定该游戏账号后可继续打开。`} showBindAction />;
  return <>
    <QueryStateView isLoading={false} isError={false} isEmpty data={undefined} renderData={() => <></>}
      emptyText={`此链接属于${findGame(gameId)?.title ?? gameId}，请选择该游戏账号继续。`}
      emptyActionLabel="选择账号继续" onEmptyAction={() => setVisible(true)} />
    <AccountSwitchSheet visible={visible} accounts={accounts} expandedGameId={expanded} activeAccountId={activeAccountId}
      onClose={() => setVisible(false)} onToggleGame={id => setExpanded(current => current === id ? null : id)}
      onSelectAccount={account => {
        setVisible(false);
        void switchBoundAccount(account.id, { navigateToOverview: false })
          .catch(error => notifyAccountSwitchError(error, showNotification));
      }} />
  </>;
}

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
    /** beatmapsetId 定位歌曲，beatmapId 定位难度。 */
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
