import { act, fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { useState } from 'react';
import { InteractionManager, Pressable, Text } from 'react-native';
import { CachedTabScreen, useCachedTabActive } from '@/components/CachedTabScreen';

let mockFocusEffect: (() => void | (() => void)) | null = null;
const mockHeavyPageRender = jest.fn();

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => { mockFocusEffect = effect; },
}));

function ActivityLabel() {
  const active = useCachedTabActive();
  return <Text>{active ? '前台' : '后台'}</Text>;
}

function StatefulHeavyPage() {
  mockHeavyPageRender();
  const [count, setCount] = useState(0);
  return <Pressable accessibilityLabel="修改页面状态" onPress={() => setCount((value) => value + 1)}>
    <Text>页面状态 {count}</Text>
    <ActivityLabel />
  </Pressable>;
}

describe('cached native-tab content', () => {
  beforeEach(() => mockHeavyPageRender.mockClear());
  afterEach(() => jest.restoreAllMocks());

  it('keeps the mounted page state while the tab is inactive', async () => {
    let pendingActivation: (() => void) | null = null;
    const cancel = jest.fn();
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((callback) => {
      pendingActivation = callback as () => void;
      return { cancel } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
    });

    const screen = await render(<CachedTabScreen><StatefulHeavyPage /></CachedTabScreen>);
    expect(screen.getByTestId('cached-tab-placeholder')).toBeTruthy();

    let cleanup: void | (() => void);
    await act(() => { cleanup = mockFocusEffect?.(); });
    await act(() => { pendingActivation?.(); });
    await fireEvent.press(screen.getByLabelText('修改页面状态'));
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('前台')).toBeTruthy();
    const rendersAfterStateChange = mockHeavyPageRender.mock.calls.length;

    await act(() => { cleanup?.(); });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('后台')).toBeTruthy();

    await act(() => { mockFocusEffect?.(); });
    expect(screen.getByText('页面状态 1')).toBeTruthy();
    expect(screen.getByText('前台')).toBeTruthy();
    expect(InteractionManager.runAfterInteractions).toHaveBeenCalledTimes(1);
    expect(mockHeavyPageRender).toHaveBeenCalledTimes(rendersAfterStateChange);
  });
});
