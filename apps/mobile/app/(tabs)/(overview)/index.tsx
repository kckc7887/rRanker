import { CachedTabScreen } from '@rranker/sdk/components/CachedTabScreen';
import { GamePageScreen } from '@/components/GamePageScreen';

export default function OverviewTabScreen() {
  return <CachedTabScreen><OverviewScreen /></CachedTabScreen>;
}

export function OverviewScreen() {
  return <GamePageScreen page="overview" />;
}
