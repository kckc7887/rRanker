import { type ReactNode } from 'react';
import { Button, Text, View } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ChartCarousel, type ChartCarouselItemState } from '@/components/game-content/ChartCarousel';
import { TagEditor } from '@/components/TagEditor';
import { useCachedTabActive } from '@/components/CachedTabScreen';
import { useChartPackageDownload } from '@/features/chart-download-shared/use-chart-package-download';

const mockNotifications = {
  dismissNotification: jest.fn(), showActionNotification: jest.fn(() => 1),
  showNotification: jest.fn(), updateNotification: jest.fn(),
};
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => mockNotifications,
  useNotificationModalRequestClose: () => () => false,
  NotificationOutlet: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

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
  renderItem: (item: string, state: ChartCarouselItemState) => ReactNode;
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
      renderItem={overrides.renderItem ?? ((item) => <Text>{item}</Text>)}
      resetKey={overrides.resetKey ?? 'song'}
      rootStyle={{}}
      scrollStyle={{}}
    />
  );
}

describe('ChartCarousel window', () => {
  it('windows short lists and keeps independent drafts through fast scrolling', async () => {
    const screen = await render(carousel({ items: items.slice(0, 7), renderItem: (item, state) => (
      <TagEditor {...state.tagEditor} testID={item} tags={[]} onChange={async () => undefined} />
    ) }));
    await fireEvent.changeText(within(screen.getByTestId('card-0')).getByLabelText('新标签'), '零号草稿');
    await fireEvent.changeText(within(screen.getByTestId('card-1')).getByLabelText('新标签'), '一号草稿');
    const scroll = screen.getByLabelText('难度卡片');
    for (const index of [4, 1, 6]) {
      await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: index * 110 } } });
    }
    expect(screen.queryByTestId('card-0')).toBeNull();
    expect(screen.queryByTestId('card-1')).toBeNull();
    await fireEvent.scroll(scroll, { nativeEvent: { contentOffset: { x: 0 } } });
    expect(within(screen.getByTestId('card-0')).getByLabelText('新标签')).toHaveProp('value', '零号草稿');
    expect(within(screen.getByTestId('card-1')).getByLabelText('新标签')).toHaveProp('value', '一号草稿');
  });

  it('retains a failed tag sheet outside the window until retry succeeds', async () => {
    let fail = true;
    const screen = await render(carousel({ renderItem: (item, state) => (
      <TagEditor {...state.tagEditor} testID={item} tags={[]} presets={['待练']}
        onChange={async () => { if (fail) throw new Error('write failed'); }} />
    ) }));
    await fireEvent.press(within(screen.getByTestId('card-0')).getByLabelText('打开标签预设'));
    await fireEvent.press(screen.getByLabelText('选择标签 待练'));
    await fireEvent.scroll(screen.getByLabelText('难度卡片'), { nativeEvent: { contentOffset: { x: 6 * 110 } } });
    await fireEvent.press(screen.getByLabelText('完成标签选择'));
    expect(within(screen.getByTestId('tag-preset-message')).getByText('标签保存失败，请重试。')).toBeTruthy();
    expect(screen.getByLabelText('选择标签 待练')).toHaveProp('accessibilityState', { checked: true });
    fail = false;
    await fireEvent.press(screen.getByLabelText('完成标签选择'));
    expect(screen.queryByTestId('tag-preset-sheet')).toBeNull();
    expect(screen.queryByTestId('card-0')).toBeNull();
  });

  it('continues multiple downloads outside the window and retains an open editor after one completes', async () => {
    const pending = new Map<string, { signal: AbortSignal; finish: (saved: boolean) => void }>();
    function DownloadCard({ item, state }: { item: string; state: ChartCarouselItemState }) {
      const active = useCachedTabActive();
      const download = useChartPackageDownload({ successMessage: 'saved' });
      return <View testID={item}>
        <Text>{`${item}:${active ? 'active' : 'paused'}`}</Text>
        <Button title={`下载 ${item}`} disabled={download.isRunning} onPress={() => {
          state.onDownloadRunningChange(true);
          void download.start(({ signal }) => new Promise<boolean>((finish) => {
            pending.set(item, { signal: signal!, finish });
          })).finally(() => state.onDownloadRunningChange(false));
        }} />
        <TagEditor {...state.tagEditor} tags={[]} onChange={async () => undefined} />
      </View>;
    }
    const screen = await render(carousel({ renderItem: (item, state) => <DownloadCard item={item} state={state} /> }));
    await fireEvent.press(screen.getByText('下载 card-0'));
    await fireEvent.press(screen.getByText('下载 card-1'));
    await fireEvent.press(within(screen.getByTestId('card-0')).getByLabelText('打开标签预设'));
    await fireEvent.scroll(screen.getByLabelText('难度卡片'), { nativeEvent: { contentOffset: { x: 6 * 110 } } });
    expect(pending.get('card-0')!.signal.aborted).toBe(false);
    expect(pending.get('card-1')!.signal.aborted).toBe(false);
    expect(screen.getByText('card-0:paused')).toBeTruthy();
    expect(screen.getByText('card-1:paused')).toBeTruthy();
    expect(screen.getByText('card-6:active')).toBeTruthy();
    await act(async () => pending.get('card-0')!.finish(true));
    expect(screen.getByTestId('card-0')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('完成标签选择'));
    expect(screen.queryByTestId('card-0')).toBeNull();
    expect(pending.get('card-1')!.signal.aborted).toBe(false);
    await act(async () => pending.get('card-1')!.finish(true));
    expect(screen.queryByTestId('card-1')).toBeNull();
    expect(screen.getByTestId('card-6')).toBeTruthy();
  });

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
