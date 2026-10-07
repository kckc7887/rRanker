import { EmptyDataView } from '@/components/EmptyDataView';
import { MaimaiStrengthAnalysisScreen } from '@/screens/MaimaiStrengthAnalysisScreen';
import PhigrosStrengthAnalysisScreen from '@/screens/PhigrosStrengthAnalysisScreen';
import { useSession } from '@/state/session-store';

export default function StrengthAnalysisToolScreen() {
  const gameId = useSession(state => state.activeGameId);
  const accountId = useSession(state => state.activeAccountId);
  if (gameId === 'maimai') return <MaimaiStrengthAnalysisScreen key={accountId} />;
  if (gameId === 'phigros') return <PhigrosStrengthAnalysisScreen key={accountId} />;
  return <EmptyDataView title="实力分析" detail="当前游戏暂未接入实力分析" />;
}
