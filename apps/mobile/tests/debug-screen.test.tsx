import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import DebugScreen from '../app/debug';
import { GamePickerSheet } from '@/components/GamePickerSheet';
import { useDebugStore } from '@/state/debug-store';
import { createAppTheme } from '@/theme/theme-tokens';
import { type GameId, findGame } from '@/domain/game-bind-options';

const mockPush = jest.fn();
const mockSave = jest.fn(async (_value: unknown) => undefined);
const mockNotification = jest.fn();
const mockTheme = createAppTheme('light', '#246BFD');
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: (href: unknown) => mockPush(href) } }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }) }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));
jest.mock('@/components/AppNotification', () => ({ useNotification: () => ({ showNotification: mockNotification }) }));
jest.mock('@/components/game-content/DetailPressable', () => {
  const RN = jest.requireActual('react-native') as typeof import('react-native');
  return { DetailPressable: RN.Pressable, DetailGestureRoot: RN.View };
});
jest.mock('@/storage/debug-preferences-store', () => ({ debugPreferencesStore: {
  load: async () => ({ testAccountsEnabled: false }), save: (value: unknown) => mockSave(value),
} }));

beforeAll(async () => { await useDebugStore.getState().hydrate(); });
beforeEach(() => {
  jest.clearAllMocks();
  useDebugStore.setState({ testAccountsEnabled: false, hydrated: true, saving: false });
});

it('opens the unchanged diagnostic route and persists the themed switch', async () => {
  const screen = await render(<DebugScreen />);
  expect(screen.getByLabelText('启用测试账号').props.value).toBe(false);
  expect(screen.getByLabelText('启用测试账号').props.onTintColor).toBe(mockTheme.accentSoft);
  await fireEvent(screen.getByLabelText('启用测试账号'), 'valueChange', true);
  expect(mockSave).toHaveBeenCalledWith({ testAccountsEnabled: true });
  expect(screen.getByLabelText('启用测试账号').props.value).toBe(true);
  await fireEvent.press(screen.getByLabelText('诊断'));
  expect(mockPush).toHaveBeenCalledWith('/diagnostics');
});

it('keeps the saved value and allows retry after a failed write', async () => {
  mockSave.mockRejectedValueOnce(new Error('storage failed'));
  const screen = await render(<DebugScreen />);
  await fireEvent(screen.getByLabelText('启用测试账号'), 'valueChange', true);
  expect(screen.getByLabelText('启用测试账号').props.value).toBe(false);
  expect(mockNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '保存失败' }));
  await fireEvent(screen.getByLabelText('启用测试账号'), 'valueChange', true);
  expect(screen.getByLabelText('启用测试账号').props.value).toBe(true);
});

it('does not expose a stale enabled value before initialization', async () => {
  useDebugStore.setState({ hydrated: false, testAccountsEnabled: true });
  const screen = await render(<DebugScreen />);
  expect(screen.getByLabelText('启用测试账号').props.value).toBe(false);
  expect(screen.getByLabelText('启用测试账号').props.disabled).toBe(true);
  await act(() => { useDebugStore.setState({ hydrated: true }); });
  expect(screen.getByLabelText('启用测试账号').props.value).toBe(true);
});

function picker(gameId: GameId | null, enabled = false) {
  return <GamePickerSheet visible mode="bind" expandedGameId={gameId} testAccountsEnabled={enabled}
    onClose={() => undefined} onToggleGame={() => undefined} onSelectProvider={() => undefined}
    onSelectUnavailableGame={() => undefined} />;
}

it.each<GameId>(['maimai', 'chunithm', 'phigros', 'musedash'])('filters the %s example row without mutating the registry', async (gameId) => {
  const providers = findGame(gameId)!.providers;
  const screen = await render(picker(gameId));
  expect(screen.queryByLabelText('示例查分器')).toBeNull();
  await screen.rerender(picker(gameId, true));
  expect(screen.getByLabelText('示例查分器')).toBeTruthy();
  await screen.rerender(picker(gameId));
  expect(screen.queryByLabelText('示例查分器')).toBeNull();
  expect(findGame(gameId)!.providers).toBe(providers);
  expect(providers.some((provider) => provider.bindingKind === 'fixture')).toBe(true);
});

it('updates collapsed provider counts and keeps the osu family grouped', async () => {
  const screen = await render(picker(null));
  expect(screen.getByText('3 个查分器 · 点按展开')).toBeTruthy();
  expect(screen.getAllByText('1 个查分器 · 点按展开')).toHaveLength(8);
  await screen.rerender(picker(null, true));
  expect(screen.getByText('4 个查分器 · 点按展开')).toBeTruthy();
  expect(screen.getAllByText('2 个查分器 · 点按展开')).toHaveLength(3);
  expect(screen.queryByText('osu!mania')).toBeNull();
});
