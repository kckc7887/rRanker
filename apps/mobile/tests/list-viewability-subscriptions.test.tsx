import { jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { Text, type FlatListProps } from 'react-native';
import { RemoteImageFlatList } from '@/components/game-content/GameListPages';

const mockScopes = jest.fn();
let mockListProps: FlatListProps<string>;
jest.mock('react-native', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const module = Object.create(RN);
  Object.defineProperty(module, 'FlatList', { value: (props: FlatListProps<string>) => {
    mockListProps = props;
    return <RN.View>{Array.from(props.data ?? []).map((item, index) => <RN.View key={item}>{props.renderItem?.({ item, index, separators: { highlight() {}, unhighlight() {}, updateProps() {} } })}</RN.View>)}</RN.View>;
  } });
  return module;
});
jest.mock('@/components/RemoteImage', () => ({
  RemoteImagePersistenceScope: ({ enabled, children }: { enabled: boolean; children: React.ReactElement<{ id: string }> }) => {
    mockScopes(children.props.id, enabled);
    return children;
  },
}));
jest.mock('@/components/game-content/GameScoreCard', () => ({ ScoreCardArtworkScope: ({ children }: { children: React.ReactNode }) => children }));

it('changes only the affected image scope without rerendering cards or replacing list props', async () => {
  const items = ['one', 'two', 'three'];
  const cardRenders = jest.fn();
  function Card({ id }: { id: string }) { cardRenders(id); return <Text>{id}</Text>; }
  const renderItem = jest.fn(({ item }: { item: string }) => <Card id={item} />);
  const extraData = { selected: 'one' };
  const screen = await render(<RemoteImageFlatList data={items} renderItem={renderItem} keyExtractor={(id) => id} extraData={extraData} />);
  const original = mockListProps!;
  expect(original.viewabilityConfig).toMatchObject({ itemVisiblePercentThreshold: 50, minimumViewTime: 250 });
  mockScopes.mockClear(); cardRenders.mockClear(); renderItem.mockClear();
  const report = (visible: string[]) => original.onViewableItemsChanged!({ viewableItems: visible.map((item) => ({ item, key: item, index: items.indexOf(item), isViewable: true })), changed: [] });
  await act(() => report(['one']));
  expect(mockScopes.mock.calls).toEqual([['one', true]]);
  mockScopes.mockClear();
  await act(() => report(['one', 'two']));
  expect(mockScopes.mock.calls).toEqual([['two', true]]);
  mockScopes.mockClear();
  await act(() => report(['two']));
  expect(mockScopes.mock.calls).toEqual([['one', false]]);
  expect(cardRenders).not.toHaveBeenCalled();
  expect(renderItem).not.toHaveBeenCalled();
  const current = mockListProps!;
  expect(current.renderItem).toBe(original.renderItem);
  expect(current.extraData).toBe(extraData);
  await screen.unmount();
});
