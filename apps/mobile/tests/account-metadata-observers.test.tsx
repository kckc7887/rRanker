import { jest } from '@jest/globals';
import { act, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Text } from 'react-native';
import { useGameData } from '@rranker/sdk/hooks/use-game-data';
import { useSyncAccountMetadata } from '@rranker/sdk/hooks/use-sync-account-metadata';
import { useSession } from '@rranker/sdk/state/session-store';
import { useAccountStore } from '@rranker/sdk/state/account-store';
import { useDebugStore } from '@rranker/sdk/state/debug-store';
import { createMaxedMaimaiTestAccount } from '@rranker/game-maimai/accounts';
import { getGameProfile } from '@rranker/sdk/domain/game-profile';
import { gameDataQueryKey } from '@rranker/sdk/services/game-data-query';
import { fixturePlayer, fixtureSource } from './fixtures/sanitized';
import { CachedContentActivityScope } from '@rranker/sdk/components/CachedTabScreen';

it('keeps hidden data observers quiet and reads the latest committed value on activation', async () => {
  const initial = useAccountStore.getState();
  const debug = useDebugStore.getState();
  const account = createMaxedMaimaiTestAccount();
  useDebugStore.setState({ hydrated: true, testAccountsEnabled: true });
  useSession.getState().finishRestore(null, [account]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = gameDataQueryKey(account.id, 'maimai', 'maimai-test', null);
  function Page() {
    const { data } = useGameData(false);
    return <Text>{data?.providerId ?? 'empty'}</Text>;
  }
  const tree = (active: boolean) => <QueryClientProvider client={client}>
    <CachedContentActivityScope active={active}><Page /></CachedContentActivityScope>
  </QueryClientProvider>;
  const screen = await render(tree(false));
  try {
    await act(async () => {
      client.setQueryData(key, { gameId: 'maimai', providerId: 'maimai-test', profile: getGameProfile('maimai'),
        payload: { kind: 'maimai', player: fixturePlayer, playerScore: { value: 15000, display: '15000' }, source: fixtureSource, catalogSource: fixtureSource } });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(screen.getByText('empty')).toBeTruthy();
    await screen.rerender(tree(true));
    expect(screen.getByText('maimai-test')).toBeTruthy();
  } finally {
    await screen.unmount();
    client.clear();
    useAccountStore.setState(initial, true);
    useDebugStore.setState(debug, true);
  }
});

const mockThumbnail = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@rranker/sdk/services/account-thumbnail', () => ({ persistBoundAccountThumbnail: (...args: unknown[]) => mockThumbnail(...args) }));

it('updates bound account metadata when visible data changes', async () => {
  const initial = useAccountStore.getState();
  const debug = useDebugStore.getState();
  const account = createMaxedMaimaiTestAccount();
  useDebugStore.setState({ hydrated: true, testAccountsEnabled: true });
  useSession.getState().finishRestore(null, [account]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = gameDataQueryKey(account.id, 'maimai', 'maimai-test', null);
  function Root() { useSyncAccountMetadata(); return null; }
  function Page() { const { data } = useGameData(false); return <Text>{data?.payload.kind ?? 'empty'}</Text>; }
  const screen = await render(<QueryClientProvider client={client}><Root /><Page /><Page /><Page /></QueryClientProvider>);
  const bundle = { gameId: 'maimai', providerId: 'maimai-test', profile: getGameProfile('maimai'),
    payload: { kind: 'maimai', player: fixturePlayer, playerScore: { value: 15000, display: '15000' }, source: fixtureSource, catalogSource: fixtureSource } };
  await act(() => { client.setQueryData(key, bundle); });
  await waitFor(() => expect(useSession.getState().boundAccounts[0].scoreDisplay).toBe('15000'));
  expect(useSession.getState().boundAccounts[0].scoreDisplay).toBe('15000');
  await screen.rerender(<QueryClientProvider client={client}><Root /><Page /><Page /><Page /></QueryClientProvider>);
  expect(useSession.getState().boundAccounts[0].scoreDisplay).toBe('15000');
  await act(() => { client.setQueryData(key, { ...bundle, payload: { ...bundle.payload, playerScore: { value: 15001, display: '15001' } } }); });
  await waitFor(() => expect(useSession.getState().boundAccounts[0].scoreDisplay).toBe('15001'));
  await screen.unmount(); client.clear(); useAccountStore.setState(initial, true); useDebugStore.setState(debug, true);
});
