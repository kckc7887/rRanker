import { Animated } from 'react-native';
import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Best50Screen } from '../app/(tabs)/b50';

jest.spyOn(Animated, 'loop').mockReturnValue({
  start: jest.fn(), stop: jest.fn(), reset: jest.fn(),
} as unknown as ReturnType<typeof Animated.loop>);

jest.mock('@/hooks/use-native-tab-bottom-inset', () => ({ useNativeTabBottomInset: () => 0 }));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: string; session: { mode: string } }) => unknown) => selector({
    activeGameId: 'phigros',
    session: { mode: 'phi-session' },
  }),
}));
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({
    data: {
      snapshot: {
        songs: [{ id: 'Song.A', title: '测试曲' }],
        source: { kind: 'generated', label: 'Phigros3.8.0', updatedAt: '2026-07-20T00:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      gameId: 'phigros',
      providerId: 'phi-taptap',
      profile: { ratingLabel: 'RKS' },
      payload: {
        kind: 'phigros',
        player: { id: 'p1', displayName: 'p1', rating: 16.17 },
        playerScore: { label: 'RKS', value: 16.17, display: '16.1700' },
        bestSections: [
          {
            id: 'phi3',
            title: 'Phi3',
            records: [{
              songId: 'Song.A', title: 'Song.A', type: 'SD', levelIndex: 2, level: 'IN',
              difficulty: 'expert', difficultyConstant: 15.2, achievements: 100, dxScore: 1_000_000,
              rating: 15.2, fc: 'ap', fs: null, rate: 'phi', version: 'current',
            }],
          },
          {
            id: 'b27',
            title: 'Best27',
            records: [{
              songId: 'Song.B', title: 'Song.B', type: 'SD', levelIndex: 2, level: 'IN',
              difficulty: 'expert', difficultyConstant: 14.8, achievements: 99.5, dxScore: 990_000,
              rating: 14.1, fc: null, fs: null, rate: 'v', version: 'current',
            }],
          },
        ],
        source: { kind: 'generated', label: 'TapTap云存档', updatedAt: '2026-07-20T00:00:00.000Z', isStale: false },
        catalogSource: { kind: 'generated', label: 'Phigros3.8.0', updatedAt: '2026-07-20T00:00:00.000Z', isStale: false },
      },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

describe('Phigros best list', () => {
  it('renders Phi3 and Best27 sections with Phigros cards', async () => {
    const screen = await render(<Best50Screen />);
    expect(screen.getByTestId('phigros-best-results-list')).toBeTruthy();
    expect(screen.getByText('Phi3')).toBeTruthy();
    expect(screen.getByText('Best27')).toBeTruthy();
    expect(screen.getByText('1. 测试曲')).toBeTruthy();
    expect(screen.getAllByText('1,000,000').length).toBeGreaterThan(0);
  });
});
