import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import TabLayout from '../app/(tabs)/_layout';
import SearchLayout from '../app/(tabs)/search/_layout';

const mockStack = jest.fn((_props: unknown) => null);
const mockIcons: unknown[] = [];

jest.mock('@expo/vector-icons/Ionicons', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/MainTabStack', () => ({ MainTabStack: (props: unknown) => mockStack(props) }));
jest.mock('expo-router/unstable-native-tabs', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const NativeTabs = ({ children }: { children?: React.ReactNode }) => React.createElement(RN.View, null, children);
  function NativeTabTrigger({ children }: { children?: React.ReactNode }) {
    return React.createElement(RN.View, null, children);
  }
  NativeTabs.Trigger = NativeTabTrigger;
  return {
    NativeTabs,
    Icon: (props: unknown) => { mockIcons.push(props); return React.createElement(RN.View); },
    Label: ({ children }: { children?: React.ReactNode }) => React.createElement(RN.Text, null, children),
    VectorIcon: () => null,
  };
});

describe('catalog navigation', () => {
  beforeEach(() => { jest.clearAllMocks(); mockIcons.length = 0; });

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
    expect(mockStack.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ title: '曲库' }));
  });
});
