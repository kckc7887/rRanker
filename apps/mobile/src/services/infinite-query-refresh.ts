import type { QueryClient } from '@tanstack/react-query';
import { queryClient } from '@/state/query-client';


export async function invalidateMajdataCatalog(client: QueryClient = queryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: ['majdata-net', 'catalog'], refetchType: 'active' });
}

export async function invalidateTufDifficulties(client: QueryClient = queryClient): Promise<void> {
  await client.invalidateQueries({ queryKey: ['tuf', 'difficulties'], refetchType: 'active' });
}
