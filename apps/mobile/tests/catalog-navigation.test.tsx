import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import TabLayout from '../app/(tabs)/_layout';
import SearchLayout from '../app/(tabs)/search/_layout';

const mockStack = jest.fn((_props: unknown) => null);
const mockIcons: unknown[] = [];
const mockRoutes: string[] = [];
const mockLabels: string[] = [];

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/MainTabStack', () => ({ MainTabStack: (props: unknown) => mockStack(props) }));
jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const mockNativeTabsProps: unknown[] = [];
  const NativeTabs = ({ children, ...props }: { children?: React.ReactNode }) => {
    mockNativeTabsProps.push(props);
    return React.createElement(RN.View, null, children);
  };
  function NativeTabTrigger({ children, name }: { children?: React.ReactNode; name: string }) {
    mockRoutes.push(name);
    return React.createElement(RN.View, null, children);
  }
  NativeTabs.Trigger = NativeTabTrigger;
  NativeTabTrigger.Icon = function MockIcon(props: unknown) { mockIcons.push(props); return React.createElement(RN.View); };
  NativeTabTrigger.Label = function MockLabel({ children }: { children?: React.ReactNode }) { mockLabels.push(String(children)); return React.createElement(RN.Text, null, children); };
  NativeTabTrigger.VectorIcon = function MockVectorIcon() { return null; };
  NativeTabs.mockNativeTabsProps = mockNativeTabsProps;
  return {
    NativeTabs,
  };
});

describe('catalog navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIcons.length = 0;
    mockRoutes.length = 0;
    mockLabels.length = 0;
    const { NativeTabs } = jest.requireMock('expo-router/unstable-native-tabs') as {
      NativeTabs: { mockNativeTabsProps: unknown[] };
    };
    NativeTabs.mockNativeTabsProps.length = 0;
  });

  it('keeps an opaque iOS tab bar without material blur', async () => {
    await render(<TabLayout />);
    const { NativeTabs } = jest.requireMock('expo-router/unstable-native-tabs') as {
      NativeTabs: { mockNativeTabsProps: Record<string, unknown>[] };
    };
    expect(NativeTabs.mockNativeTabsProps[0]).toEqual(expect.objectContaining({
      blurEffect: 'none',
      disableTransparentOnScrollEdge: true,
      minimizeBehavior: 'never',
    }));
  });

  it('preserves all five routes, labels and Android icon names in order', async () => {
    await render(<TabLayout />);
    expect(mockRoutes).toEqual(['(overview)', 'b50', 'records', 'search', 'settings']);
    expect(mockLabels).toEqual(['总览', '最佳', '成绩', '曲库', '设置']);
    expect(mockIcons.map((icon) => (icon as { src: { props: { name: string } } }).src.props.name))
      .toEqual(['home-outline', 'trophy-outline', 'stats-chart-outline', 'musical-notes-outline', 'settings-outline']);
  });

  it('renames the search tab to catalog and uses music-list icons', async () => {
    const screen = await render(<TabLayout />);
    expect(screen.getByText('曲库')).toBeTruthy();
    expect(mockIcons).toContainEqual(expect.objectContaining({
      sf: 'music.note.list',
      src: expect.objectContaining({
        props: expect.objectContaining({ name: 'musical-notes-outline' }),
      }),
    }));
    expect(mockIcons).toContainEqual(expect.objectContaining({
      sf: 'chart.bar.xaxis',
      src: expect.objectContaining({
        props: expect.objectContaining({ name: 'stats-chart-outline' }),
      }),
    }));
  });

  it('uses catalog as the stack title while preserving the search route', async () => {
    await render(<SearchLayout />);
    expect(mockStack.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ title: '曲库' }));
  });
});
