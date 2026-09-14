import { fireEvent, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { MaimaiFilterBar } from '@/components/MaimaiFilterBar';
import { RizlineFilterBar } from '@/components/rizline/RizlineFilterBar';
import { rizlineDifficultyColors } from '@/domain/rizline';
import { useRizlineCatalogFilter } from '@/state/rizline-catalog-filter';
import { createAppTheme } from '@/theme/theme-tokens';

let mockTheme = createAppTheme('light', '#246BFD');
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

const packs = [{ value: 'all', label: '全部' }, { value: 'main', label: '主线' }];
function Filter() {
  return <RizlineFilterBar filter={useRizlineCatalogFilter()} packs={packs} />;
}

beforeEach(() => {
  useRizlineCatalogFilter.getState().reset();
  useRizlineCatalogFilter.setState({ collapsed: false });
  mockTheme = createAppTheme('light', '#246BFD');
});

test('difficulty chips are directly visible and exclusive, with repeat selection and all clearing the choice', async () => {
  const screen = await render(<Filter />);
  expect(screen.getAllByRole('button').filter(button => button.props.accessibilityLabel.startsWith('筛选难度 '))
    .map(button => button.props.accessibilityLabel)).toEqual(['全部', 'SP', 'AT', 'IN', 'HD', 'EZ'].map(label => `筛选难度 ${label}`));
  expect(screen.queryByLabelText('选择难度，当前 全部')).toBeNull();
  expect(JSON.stringify(screen.toJSON())).toContain('"horizontal":true');
  await fireEvent.press(screen.getByLabelText('筛选难度 IN'));
  expect(useRizlineCatalogFilter.getState().difficulty).toBe('IN');
  expect(screen.getByLabelText('筛选难度 IN').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByLabelText('筛选难度 AT'));
  expect(useRizlineCatalogFilter.getState().difficulty).toBe('AT');
  expect(screen.getByLabelText('筛选难度 IN').props.accessibilityState.selected).toBe(false);
  await fireEvent.press(screen.getByLabelText('筛选难度 AT'));
  expect(useRizlineCatalogFilter.getState().difficulty).toBe('all');
  expect(screen.getByLabelText('筛选难度 全部').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByLabelText('筛选难度 SP'));
  await fireEvent.press(screen.getByLabelText('筛选难度 全部'));
  expect(useRizlineCatalogFilter.getState().difficulty).toBe('all');
});

test('collapse keeps the difficulty summary, all leaves other filters intact and reset closes the pack dropdown', async () => {
  useRizlineCatalogFilter.setState({ difficulty: 'IN', packId: 'main', constantMin: '12' });
  const screen = await render(<Filter />);
  await fireEvent.press(screen.getByLabelText('收起筛选'));
  expect(screen.queryByLabelText('筛选难度 IN')).toBeNull();
  await fireEvent.press(screen.getByLabelText('展开筛选，当前 IN · 主线 · 定数 12~不限'));
  expect(screen.getByLabelText('筛选难度 IN').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(screen.getByLabelText('筛选难度 全部'));
  expect(useRizlineCatalogFilter.getState()).toMatchObject({ difficulty: 'all', packId: 'main', constantMin: '12' });
  await fireEvent.press(screen.getByLabelText('选择曲包，当前 主线'));
  expect(screen.getByLabelText('选择曲包 主线')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('重置筛选'));
  expect(screen.queryByLabelText('选择曲包 主线')).toBeNull();
  expect(useRizlineCatalogFilter.getState()).toMatchObject({ difficulty: 'all', packId: 'all', constantMin: '', constantMax: '', collapsed: false });
});

test.each(['light', 'dark'] as const)('difficulty chips use the existing badge colors and the %s theme selection border', async (appearance) => {
  mockTheme = createAppTheme(appearance, '#AC285B');
  const noop = () => {};
  const reference = await render(<MaimaiFilterBar collapsed={false} difficulty="master" version="all" type="all"
    constantMin="" constantMax="" versionLocale="china" versions={[]} onCollapsedChange={noop}
    onDifficultyChange={noop} onVersionChange={noop} onTypeChange={noop} onConstantMinChange={noop}
    onConstantMaxChange={noop} onVersionLocaleChange={noop} onReset={noop} />);
  const selectedFrame = StyleSheet.flatten(reference.getByLabelText('筛选难度 MASTER').props.style);
  const idleFrame = StyleSheet.flatten(reference.getByLabelText('筛选难度 BASIC').props.style);
  await reference.unmount();
  useRizlineCatalogFilter.setState({ difficulty: 'SP' });
  const screen = await render(<Filter />);
  const special = screen.getByLabelText('筛选难度 SP');
  expect(StyleSheet.flatten(special.props.style)).toEqual(selectedFrame);
  expect(StyleSheet.flatten(screen.getByLabelText('筛选难度 IN').props.style)).toEqual(idleFrame);
  expect(StyleSheet.flatten(special.props.style).borderColor).toBe(mockTheme.accent);
  expect(StyleSheet.flatten(within(special).getByText('SP').props.style).color).toBe(rizlineDifficultyColors('SP', mockTheme.dark).fg);
  expect(StyleSheet.flatten(screen.getByLabelText('筛选难度 IN').props.style).borderColor).toBe('transparent');
});
