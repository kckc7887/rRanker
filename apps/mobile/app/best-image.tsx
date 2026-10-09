import { useSession } from '@/state/session-store';
import { ChunithmBestImageScreen } from '@/screens/ChunithmBestImageScreen';
import { PhigrosBestImageScreen } from '@/screens/PhigrosBestImageScreen';
import { MaimaiBestImageScreen } from '@/screens/maimai/MaimaiBestImageScreen';

export default function BestImageScreen() {
  const activeGameId = useSession((state) => state.activeGameId);
  const activeAccountId = useSession((state) => state.activeAccountId);
  if (activeGameId === 'chunithm') return <ChunithmBestImageScreen key={activeAccountId} />;
  if (activeGameId === 'phigros') return <PhigrosBestImageScreen key={activeAccountId} />;
  return <MaimaiBestImageScreen key={activeAccountId} />;
}
