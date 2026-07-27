import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ProviderLoginSheet } from '@/components/ProviderLoginSheet';
import { createMaimaiBoundAccount } from '@/domain/bound-account';
import { findGame } from '@/domain/game-bind-options';

const mockMaimai = createMaimaiBoundAccount({
  providerId: 'lxns',
  displayName: '已有舞萌玩家',
  rating: 15000,
  playerId: '1',
});
const mockOauth = {
  mode: 'lxns-oauth',
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 60_000,
  persistable: true,
} as const;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#fff',
    surface: '#fff',
    surfaceMuted: '#f5f5f5',
    input: '#fff',
    border: '#ddd',
    text: '#111',
    textSecondary: '#444',
    textMuted: '#777',
    accent: '#246BFD',
  }),
}));
jest.mock('@/storage/secure-session-store', () => ({
  SecureSessionStore: jest.fn(() => ({ upsertAccount: jest.fn() })),
}));
jest.mock('@/storage/chunithm-temp-account-store', () => ({
  ChunithmTempAccountStore: jest.fn(() => ({ remove: jest.fn(async () => undefined) })),
}));
jest.mock('@/state/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: Record<string, unknown>) => unknown) => selector({
    boundAccounts: [mockMaimai],
    sessionsByAccountId: { [mockMaimai.id]: mockOauth },
    credentialIdsByAccountId: { [mockMaimai.id]: 'lxns:shared' },
    setSession: jest.fn(),
    removeBoundAccount: jest.fn(),
  }),
}));

describe('ProviderLoginSheet LXNS account reuse', () => {
  it('shows one reuse entry below Chunithm login and expands the eligible account', async () => {
    const provider = findGame('chunithm')?.providers[0] ?? null;
    const screen = await render(
      <ProviderLoginSheet
        visible
        provider={provider}
        gameId="chunithm"
        gameTitle="中二节奏"
        onClose={() => undefined}
        onSuccess={() => undefined}
      />,
    );

    const reuse = screen.getByLabelText('使用已有落雪账号');
    expect(reuse).toBeTruthy();
    fireEvent.press(reuse);
    await waitFor(() => expect(screen.getByText('已有舞萌玩家')).toBeTruthy());
    expect(screen.getByText('已绑定舞萌 DX')).toBeTruthy();
  });
});
