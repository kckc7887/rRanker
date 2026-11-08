import { CachedTabScreen } from '@rranker/sdk/components/CachedTabScreen';
import { GamePageScreen } from '@/components/GamePageScreen';

export default function Best50TabScreen() {
  return <CachedTabScreen><Best50Screen /></CachedTabScreen>;
}

export function Best50Screen() {
  return <GamePageScreen page="best" />;
}
