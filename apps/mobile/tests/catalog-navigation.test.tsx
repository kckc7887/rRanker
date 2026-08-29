import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import TabLayout from '../app/(tabs)/_layout';
import SearchLayout from '../app/(tabs)/search/_layout';
import SettingsLayout from '../app/(tabs)/settings/_layout';
import { MainTabStack } from '@/components/MainTabStack';

const mockStackScreenProps: unknown[] = [];
const mockIcons: unknown[] = [];
const mockTheme = {
  accent: '#246BFD',
  background: '#F7F8FA',
  surface: '#FFFFFF',
};

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  function Stack({ children }: { children?: React.ReactNode }) {
    return React.createElement(RN.View, null, children);
  }
  function StackScreen(props: unknown) {
    mockStackScreenProps.push(props);
    return null;
  }
  Stack.Screen = StackScreen;
  return { Stack };
});
jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const mockNativeTabsProps: unknown[] = [];
  const NativeTabs = ({ children, ...props }: { children?: React.ReactNode }) => {
    mockNativeTabsProps.push(props);
    return React.createElement(RN.View, null, children);
  };
  function NativeTabTrigger({ children }: { children?: React.ReactNode }) {
    return React.createElement(RN.View, null, children);
  }
  NativeTabs.Trigger = NativeTabTrigger;
  NativeTabs.mockNativeTabsProps = mockNativeTabsProps;
  return {
    NativeTabs,
    Icon: (props: unknown) => { mockIcons.push(props); return React.createElement(RN.View); },
    Label: ({ children }: { children?: React.ReactNode }) => React.createElement(RN.Text, null, children),
    VectorIcon: () => null,
  };
});

describe('catalog navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStackScreenProps.length = 0;
    mockIcons.length = 0;
    mockTheme.background = '#F7F8FA';
    mockTheme.surface = '#FFFFFF';
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
      backgroundColor: '#FFFFFF',
      disableTransparentOnScrollEdge: true,
      minimizeBehavior: 'never',
    }));
  });

  it('renames the search tab to catalog and uses music-list icons', async () => {
    const screen = await render(<TabLayout />);
    expect(screen.getByText('曲库')).toBeTruthy();
    expect(mockIcons).toContainEqual(expect.objectContaining({
      sf: 'music.note.list',
      androidSrc: expect.objectContaining({
        props: expect.objectContaining({ name: 'musical-notes-outline' }),
      }),
    }));
    expect(mockIcons).toContainEqual(expect.objectContaining({
      sf: 'chart.bar.xaxis',
      androidSrc: expect.objectContaining({
        props: expect.objectContaining({ name: 'stats-chart-outline' }),
      }),
    }));
  });

  it('uses catalog as the stack title while preserving the search route', async () => {
    await render(<SearchLayout />);
    expect(mockStackScreenProps[0]).toEqual(expect.objectContaining({
      name: 'index',
      options: { title: '曲库' },
    }));
  });

  it('covers tab stacks with the current theme background during transitions', async () => {
    const screen = await render(<MainTabStack title="总览" />);
    const wrapper = screen.root!;

    expect(wrapper.props.collapsable).toBe(false);
    expect(StyleSheet.flatten(wrapper.props.style)).toEqual(expect.objectContaining({
      backgroundColor: '#F7F8FA',
      flex: 1,
      overflow: 'hidden',
      position: 'relative',
    }));

    mockTheme.background = '#0D1117';
    await screen.rerender(<MainTabStack title="总览" />);
    expect(StyleSheet.flatten(screen.root!.props.style)).toEqual(
      expect.objectContaining({ backgroundColor: '#0D1117' }),
    );
  });

  it('routes settings through the shared themed tab stack', async () => {
    const screen = await render(<SettingsLayout />);
    expect(screen.root!.props.collapsable).toBe(false);
    expect(StyleSheet.flatten(screen.root!.props.style)).toEqual(
      expect.objectContaining({ backgroundColor: '#F7F8FA' }),
    );
    expect(mockStackScreenProps[0]).toEqual(expect.objectContaining({
      name: 'index',
      options: { title: '设置' },
    }));
  });
});
