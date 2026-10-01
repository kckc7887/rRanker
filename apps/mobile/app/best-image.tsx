import { useSession } from '@/state/session-store';
import { ChunithmBestImageScreen } from '@/screens/ChunithmBestImageScreen';
import { PhigrosBestImageScreen } from '@/screens/PhigrosBestImageScreen';
import { MaimaiBestImageScreen } from '@/screens/maimai/MaimaiBestImageScreen';

export default function BestImageScreen() {
  const activeGameId = useSession((state) => state.activeGameId);
  if (activeGameId === 'chunithm') return <ChunithmBestImageScreen />;
  if (activeGameId === 'phigros') return <PhigrosBestImageScreen />;
  return <MaimaiBestImageScreen />;
}
