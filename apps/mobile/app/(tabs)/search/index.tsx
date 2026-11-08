import { CachedTabScreen } from '@rranker/sdk/components/CachedTabScreen';
import { GamePageScreen } from '@/components/GamePageScreen';

export default function SearchTabScreen() {
  return <CachedTabScreen><SearchScreen /></CachedTabScreen>;
}

export function SearchScreen() {
  return <GamePageScreen page="catalog" />;
}
