import { act, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { InteractionManager, Text } from 'react-native';
import { LazyTabScreen } from '@/components/LazyTabScreen';

let mockFocusEffect: (() => void | (() => void)) | null = null;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
}));

describe('lazy native-tab content', () => {
  afterEach(() => jest.restoreAllMocks());

  it('waits for navigation interactions and cancels transient tab activations', async () => {
    let pendingActivation: (() => void) | null = null;
    const cancel = jest.fn();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      pendingActivation = callback as () => void;
      return { cancel } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const screen = await render(<LazyTabScreen><Text>重页面内容</Text></LazyTabScreen>);
    expect(screen.getByTestId('lazy-tab-placeholder')).toBeTruthy();
    expect(screen.queryByText('重页面内容')).toBeNull();

    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    await act(() => { cleanup?.(); });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('重页面内容')).toBeNull();

    await act(() => { mockFocusEffect?.(); });
    await act(() => { pendingActivation?.(); });
    expect(screen.getByText('重页面内容')).toBeTruthy();
  });
});
