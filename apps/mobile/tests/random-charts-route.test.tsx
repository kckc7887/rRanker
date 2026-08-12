import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { GameId } from '@/domain/game-bind-options';
import RandomChartsToolScreen from '../app/tools/random-charts';

let mockActiveGameId: GameId = 'maimai';

jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: GameId }) => unknown) => selector({
    activeGameId: mockActiveGameId,
  }),
}));
jest.mock('@/screens/MaimaiRandomChartsScreen', () => ({
  MaimaiRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>maimai-random</Text>;
  },
}));
jest.mock('@/screens/PhigrosRandomChartsScreen', () => ({
  PhigrosRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>phigros-random</Text>;
  },
}));
jest.mock('@/screens/ChunithmRandomChartsScreen', () => ({
  ChunithmRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>chunithm-random</Text>;
  },
}));
jest.mock('@/screens/TufRandomChartsScreen', () => ({
  TufRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>adofai-random</Text>;
  },
}));
jest.mock('@/screens/MuseDashRandomChartsScreen', () => ({
  MuseDashRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>musedash-random</Text>;
  },
}));

describe('random charts route registry', () => {
  it.each([
    ['maimai', 'maimai-random'],
    ['phigros', 'phigros-random'],
    ['chunithm', 'chunithm-random'],
    ['adofai', 'adofai-random'],
    ['musedash', 'musedash-random'],
  ] as const)('dispatches %s to its own screen', async (gameId, text) => {
    mockActiveGameId = gameId;
    const screen = await render(<RandomChartsToolScreen />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('does not fall back to maimai for unsupported games', async () => {
    mockActiveGameId = 'test';
    const screen = await render(<RandomChartsToolScreen />);
    expect(screen.getByText('当前游戏暂未接入随机歌曲工具')).toBeTruthy();
    expect(screen.queryByText('maimai-random')).toBeNull();
  });
});
