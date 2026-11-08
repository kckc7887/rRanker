import { act, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { GameId } from '@rranker/sdk/domain/game-bind-options';
import RandomChartsToolScreen from '../app/plugins/[pluginId]/[pageId]';
import { setDisabledPlugins } from '@rranker/sdk';

let mockActiveGameId: GameId = 'maimai';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ pluginId: 'tool.' + mockActiveGameId, pageId: 'random-charts', gameId: mockActiveGameId }),
}));


jest.mock('@rranker/sdk/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: GameId }) => unknown) => selector({
    activeGameId: mockActiveGameId,
  }),
}));
jest.mock('@rranker/tool-maimai/screens/MaimaiRandomChartsScreen', () => ({
  MaimaiRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>maimai-random</Text>;
  },
}));
jest.mock('@rranker/tool-phigros/screens/PhigrosRandomChartsScreen', () => ({
  PhigrosRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>phigros-random</Text>;
  },
}));
jest.mock('@rranker/tool-chunithm/screens/ChunithmRandomChartsScreen', () => ({
  ChunithmRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>chunithm-random</Text>;
  },
}));
jest.mock('@rranker/tool-adofai/screens/TufRandomChartsScreen', () => ({
  TufRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>adofai-random</Text>;
  },
}));
jest.mock('@rranker/tool-musedash/screens/MuseDashRandomChartsScreen', () => ({
  MuseDashRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>musedash-random</Text>;
  },
}));
jest.mock('@rranker/tool-phira/screens/PhiraRandomChartsScreen', () => ({
  PhiraRandomChartsScreen: () => {
    const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>phira-random</Text>;
  },
}));

describe('插件工具页面', () => {
  afterEach(() => setDisabledPlugins([]));
  it.each([
    ['maimai', 'maimai-random'],
    ['phigros', 'phigros-random'],
    ['chunithm', 'chunithm-random'],
    ['adofai', 'adofai-random'],
    ['musedash', 'musedash-random'],
    ['phira', 'phira-random'],
  ] as const)('dispatches %s to its own screen', async (gameId, text) => {
    mockActiveGameId = gameId;
    const screen = await render(<RandomChartsToolScreen />);
    expect(screen.getByText(text)).toBeTruthy();
  });

  it('工具停用后显示不可用，重新启用后恢复页面', async () => {
    mockActiveGameId = 'maimai';
    const screen = await render(<RandomChartsToolScreen />);
    expect(screen.getByText('maimai-random')).toBeTruthy();
    await act(() => setDisabledPlugins(['tool.maimai']));
    expect(screen.getByText('工具不可用')).toBeTruthy();
    await act(() => setDisabledPlugins([]));
    expect(screen.getByText('maimai-random')).toBeTruthy();
  });

  it('does not fall back to maimai for unsupported games', async () => {
    mockActiveGameId = 'osu-standard';
    const screen = await render(<RandomChartsToolScreen />);
    expect(screen.getByText('工具不可用')).toBeTruthy();
    expect(screen.queryByText('maimai-random')).toBeNull();
  });
});
