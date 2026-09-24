import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ChartCarousel } from '@/components/game-content/ChartCarousel';

jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, ScrollView: RN.ScrollView, Pressable: RN.Pressable };
});

const items = Array.from({ length: 30 }, (_, index) => `card-${index}`);

function carousel(overrides: Partial<{
  items: readonly string[];
  initialIndex: number;
  resetKey: string;
  cardWidth: number;
}> = {}) {
  const data = overrides.items ?? items;
  return (
    <ChartCarousel
      accessibilityLabel="难度卡片"
      cardWidth={overrides.cardWidth ?? 100}
      contentContainerStyle={{}}
      empty={<Text>empty</Text>}
      gap={10}
      initialIndex={overrides.initialIndex ?? 0}
      items={data}
      keyExtractor={(item) => item}
      renderItem={(item) => <Text>{item}</Text>}
      resetKey={overrides.resetKey ?? 'song'}
      rootStyle={{}}
      scrollStyle={{}}
    />
  );
}

describe('ChartCarousel window', () => {
  it('renders the target card when reset jumps from 0 to 20', async () => {
    const screen = await render(carousel());
    expect(screen.getByText('card-0')).toBeTruthy();
    expect(screen.queryByText('card-20')).toBeNull();

    await screen.rerender(carousel({ initialIndex: 20, resetKey: 'next' }));

    expect(screen.getByText('card-20')).toBeTruthy();
    expect(screen.queryByText('card-0')).toBeNull();
  });

  it('renders the first card when reset jumps from 20 to 0', async () => {
    const screen = await render(carousel({ initialIndex: 20, resetKey: 'far' }));
    expect(screen.getByText('card-20')).toBeTruthy();

    await screen.rerender(carousel({ initialIndex: 0, resetKey: 'start' }));

    expect(screen.getByText('card-0')).toBeTruthy();
    expect(screen.queryByText('card-20')).toBeNull();
  });

  it('clamps the window when the list shrinks past the current index', async () => {
    const screen = await render(carousel({ initialIndex: 28, resetKey: 'long' }));
    expect(screen.getByText('card-28')).toBeTruthy();

    await screen.rerender(carousel({
      items: items.slice(0, 26),
      initialIndex: 28,
      resetKey: 'long',
    }));

    expect(screen.getByText('card-25')).toBeTruthy();
    expect(screen.queryByText('card-0')).toBeNull();
  });

  it('keeps the reset target visible after the card width changes', async () => {
    const screen = await render(carousel({ initialIndex: 20, resetKey: 'wide', cardWidth: 120 }));
    expect(screen.getByText('card-20')).toBeTruthy();

    await screen.rerender(carousel({ initialIndex: 20, resetKey: 'wide', cardWidth: 80 }));

    expect(screen.getByText('card-20')).toBeTruthy();
    expect(screen.queryByText('card-0')).toBeNull();
  });

  it('moves the window from a drag that does not emit momentum', async () => {
    const screen = await render(carousel());
    const scroller = screen.getByLabelText('难度卡片');
    await fireEvent.scroll(scroller, {
      nativeEvent: { contentOffset: { x: 20 * 110, y: 0 } },
    });
    expect(screen.getByText('card-20')).toBeTruthy();
    expect(screen.queryByText('card-0')).toBeNull();

    await fireEvent(scroller, 'scrollEndDrag', {
      nativeEvent: { contentOffset: { x: 0, y: 0 } },
    });
    expect(screen.getByText('card-0')).toBeTruthy();
    expect(screen.queryByText('card-20')).toBeNull();
  });

  it('follows the latest reset when keys change in sequence', async () => {
    const screen = await render(carousel({ initialIndex: 0, resetKey: 'a' }));
    await screen.rerender(carousel({ initialIndex: 20, resetKey: 'b' }));
    await screen.rerender(carousel({ initialIndex: 8, resetKey: 'c' }));
    expect(screen.getByText('card-8')).toBeTruthy();
    expect(screen.queryByText('card-20')).toBeNull();
    expect(screen.queryByText('card-0')).toBeNull();
  });
});
