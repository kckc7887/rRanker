import { CachedTabScreen } from '@rranker/sdk/components/CachedTabScreen';
import { GamePageScreen } from '@/components/GamePageScreen';

export default function RecordsTabScreen() {
  return <CachedTabScreen><RecordsScreen /></CachedTabScreen>;
}

export function RecordsScreen() {
  return <GamePageScreen page="records" />;
}
