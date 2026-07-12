import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/state/session-store';

export function useSongs() {
  const session = useSession((s) => s.session);
  const provider = useSession((s) => s.provider);
  const sessionValue = session && 'value' in session ? session.value : null;
  return useQuery({
    queryKey: ['songs', session?.mode ?? 'fixture', sessionValue],
    queryFn: () => provider.getSongs(),
  });
}
