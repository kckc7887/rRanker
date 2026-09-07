import { jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text } from 'react-native';
import { useGameData } from '@/hooks/use-game-data';
import { useSyncAccountMetadata } from '@/hooks/use-sync-account-metadata';
import { useSession } from '@/state/session-store';
import { createMaxedMaimaiTestAccount } from '@/domain/bound-account';
import { getGameProfile } from '@/domain/game-profile';
import { gameDataQueryKey } from '@/services/game-data-query';
import { fixturePlayer, fixtureSource } from '@/fixtures/sanitized';

const mockThumbnail = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@/services/account-thumbnail', () => ({ persistBoundAccountThumbnail: (...args: unknown[]) => mockThumbnail(...args) }));
jest.mock('@/services/resolve-account-avatar-persist', () => ({ persistBoundAccountAvatar: jest.fn(async () => undefined) }));

it('syncs metadata once when three real useGameData observers see the same query update', async () => {
  const initial = useSession.getState();
  const account = createMaxedMaimaiTestAccount();
  useSession.setState({ boundAccounts: [account], activeAccountId: account.id, activeGameId: 'maimai', activeProviderId: 'maimai-test', session: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = gameDataQueryKey(account.id, 'maimai', 'maimai-test', null);
  function Root() { useSyncAccountMetadata(); return null; }
  function Page() { const { data } = useGameData(false); return <Text>{data?.payload.kind ?? 'empty'}</Text>; }
  const screen = await render(<QueryClientProvider client={client}><Root /><Page /><Page /><Page /></QueryClientProvider>);
  const bundle = { gameId: 'maimai', providerId: 'maimai-test', profile: getGameProfile('maimai'),
    payload: { kind: 'maimai', player: fixturePlayer, playerScore: { value: 15000, display: '15000' }, source: fixtureSource, catalogSource: fixtureSource } };
  await act(() => { client.setQueryData(key, bundle); });
  await waitFor(() => expect(mockThumbnail).toHaveBeenCalledTimes(1));
  expect(useSession.getState().boundAccounts[0].scoreDisplay).toBe('15000');
  await screen.rerender(<QueryClientProvider client={client}><Root /><Page /><Page /><Page /></QueryClientProvider>);
  expect(mockThumbnail).toHaveBeenCalledTimes(1);
  await act(() => { client.setQueryData(key, { ...bundle, payload: { ...bundle.payload, playerScore: { value: 15001, display: '15001' } } }); });
  await waitFor(() => expect(mockThumbnail).toHaveBeenCalledTimes(2));
  await screen.unmount(); client.clear(); useSession.setState(initial, true);
});
