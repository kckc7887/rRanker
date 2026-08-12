import type { ComponentType } from 'react';
import { EmptyDataView } from '@/components/EmptyDataView';
import type { GameId } from '@/domain/game-bind-options';
import { ChunithmRandomChartsScreen } from '@/screens/ChunithmRandomChartsScreen';
import { MaimaiRandomChartsScreen } from '@/screens/MaimaiRandomChartsScreen';
import { PhigrosRandomChartsScreen } from '@/screens/PhigrosRandomChartsScreen';
import { TufRandomChartsScreen } from '@/screens/TufRandomChartsScreen';
import { MuseDashRandomChartsScreen } from '@/screens/MuseDashRandomChartsScreen';
import { useSession } from '@/state/session-store';

const RANDOM_CHARTS_SCREENS: Partial<Record<GameId, ComponentType>> = {
  maimai: MaimaiRandomChartsScreen,
  phigros: PhigrosRandomChartsScreen,
  chunithm: ChunithmRandomChartsScreen,
  adofai: TufRandomChartsScreen,
  musedash: MuseDashRandomChartsScreen,
};

export default function RandomChartsToolScreen() {
  const activeGameId = useSession((state) => state.activeGameId);
  const Screen = RANDOM_CHARTS_SCREENS[activeGameId];
  return Screen
    ? <Screen />
    : <EmptyDataView title="随机歌曲" detail="当前游戏暂未接入随机歌曲工具" />;
}
