import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';

let AccountSwitchSheet: typeof import('@/components/AccountSwitchSheet').AccountSwitchSheet;
const mockReactNative = jest.requireActual<typeof import('react-native')>('react-native');
const mockModal = ({ children, ...props }: { children?: ReactNode }) => (
  <mockReactNative.View {...props} testID="account-switch-modal">{children}</mockReactNative.View>
);

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    accent: '#8AB4FF',
    background: '#101216',
    border: '#30343B',
    text: '#F4F6F8',
    textMuted: '#A7ADB7',
  }),
}));

jest.mock('@/components/BoundAccountGroupedList', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    BoundAccountGroupedList: ({ hydrationEnabled }: { hydrationEnabled: boolean }) => (
      <RN.Text testID="account-list-hydration">{String(hydrationEnabled)}</RN.Text>
    ),
  };
});

jest.mock('@/components/osu/OsuRatingTag', () => ({ OsuRatingTag: () => null }));

const baseProps = {
  accounts: [] as import('@/domain/bound-account').BoundAccount[],
  expandedGameId: null,
  activeAccountId: null,
  onClose: jest.fn(),
  onToggleGame: jest.fn(),
  onSelectAccount: jest.fn(),
};

describe('AccountSwitchSheet', () => {
  beforeAll(() => {
    jest.doMock('react-native', () => new Proxy(mockReactNative, {
      get: (target, property, receiver) => (
        property === 'Modal' ? mockModal : Reflect.get(target, property, receiver)
      ),
    }));
    ({ AccountSwitchSheet } = jest.requireActual<typeof import('@/components/AccountSwitchSheet')>(
      '@/components/AccountSwitchSheet',
    ));
  });

  afterAll(() => {
    jest.dontMock('react-native');
  });

  it('隐藏时保留弹窗内容到原生退场结束，并关闭账号补载', async () => {
    const screen = await render(<AccountSwitchSheet {...baseProps} visible />);
    expect(screen.getByText('切换账号')).toBeTruthy();
    expect(screen.getByTestId('account-list-hydration').props.children).toBe('true');

    await screen.rerender(<AccountSwitchSheet {...baseProps} visible={false} />);

    expect(screen.getByText('切换账号')).toBeTruthy();
    expect(screen.getByTestId('account-list-hydration').props.children).toBe('false');
  });

  it('原生弹窗背景使用当前主题色', async () => {
    const screen = await render(<AccountSwitchSheet {...baseProps} visible />);
    expect(screen.getByTestId('account-switch-modal').props.backdropColor).toBe('#101216');
  });
});
