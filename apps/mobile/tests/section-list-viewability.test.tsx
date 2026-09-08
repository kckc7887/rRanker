import { jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { createRef, type ReactElement, type ReactNode } from 'react';
import { SectionList, Text, type SectionListProps } from 'react-native';
import { BestListPage } from '@/components/game-content/GameListPages';

const mockScopeChanges = jest.fn();
jest.mock('@/components/RemoteImage', () => ({
  RemoteImagePersistenceScope: ({ enabled, children }: {
    enabled: boolean; children: ReactElement<{ testID: string }>;
  }) => {
    mockScopeChanges(children.props.testID, enabled);
    return children;
  },
}));
jest.mock('@/components/game-content/GameScoreCard', () => ({
  ScoreCardArtworkScope: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({}) }));

type Section<T> = { key: string; data: T[]; keyExtractor?: (item: T, index: number) => string };
type NativeToken = { item: unknown; index: number; key: string; isViewable: boolean };
type NativeViewability = { viewableItems: NativeToken[]; changed: NativeToken[] };
type NativeSectionList<T> = {
  props: SectionListProps<T, Section<T>>;
  _onViewableItemsChanged: (info: NativeViewability) => void;
  _convertViewable: (token: NativeToken) => unknown;
};

function token(item: unknown, index: number, isViewable = true): NativeToken {
  return { item, index, key: String(index), isViewable };
}

function getNativeList<T>(ref: { current: SectionList<T, Section<T>> | null }) {
  expect(ref.current).toBeInstanceOf(SectionList);
  const list = (ref.current as unknown as { _wrapperListRef: NativeSectionList<T> })._wrapperListRef;
  expect(list._onViewableItemsChanged).toEqual(expect.any(Function));
  expect(list._convertViewable).toEqual(expect.any(Function));
  return list;
}

async function checkNestedExtractor<T>(items: T[], extractor: (item: T, index: number) => string, keys: string[]) {
  const keyExtractor = jest.fn(extractor);
  const onViewableItemsChanged = jest.fn<NonNullable<SectionListProps<T, Section<T>>['onViewableItemsChanged']>>();
  const sections = [{ key: 'best', data: items }, { key: 'empty', data: [] }];
  const ref = createRef<SectionList<T, Section<T>>>();
  const props = { ref, keyExtractor, onViewableItemsChanged, renderItem: () => <Text testID="row">成绩</Text> };
  const screen = await render(<BestListPage<T, Section<T>>
    isLoading={false} isError={false} isEmpty={false} emptyText="空" data={sections} sectionListProps={props}
  />);
  const list = getNativeList(ref);
  const [section, emptySection] = list.props.sections;
  const all = [token(section, 0), token(items[0], 1), token(items[1], 2), token(section, 3), token(emptySection, 4), token(emptySection, 5)];
  keyExtractor.mockClear();
  const convert = jest.spyOn(list, '_convertViewable');
  await act(() => list._onViewableItemsChanged({ viewableItems: all, changed: all }));
  expect(convert).toHaveBeenCalledTimes(all.length * 2);
  expect(keyExtractor).toHaveBeenCalled();
  expect(keyExtractor.mock.calls.every(([item]) => items.includes(item))).toBe(true);
  const info = onViewableItemsChanged.mock.calls.at(-1)![0];
  expect(info.viewableItems.map(({ item, key, index }) => ({ item, key, index }))).toEqual(
    items.map((item, index) => ({ item, key: keys[index], index })),
  );
  expect(info.changed).toEqual(info.viewableItems);
  await screen.unmount();
}

it('keeps Muse Dash deep keys away from native section header and footer tokens', async () => {
  await checkNestedExtractor(
    [{ play: { uid: 'song-a', difficulty: 2 } }, { play: { uid: 'song-b', difficulty: 3 } }],
    (item) => `${item.play.uid}:${item.play.difficulty}`,
    ['song-a:2', 'song-b:3'],
  );
});

it('keeps Phira deep keys away from native section header and footer tokens', async () => {
  await checkNestedExtractor([{ record: { id: 41 } }, { record: { id: 42 } }], (item) => String(item.record.id), ['41', '42']);
});

it('preserves section key extractors before list key extractors and default key/id/index behavior', async () => {
  type Item = { key?: string; id?: string; value: string };
  const customItem = { value: 'section' };
  const defaultItems: Item[] = [{ key: 'row-key', id: 'ignored-id', value: 'key' }, { id: 'row-id', value: 'id' }, { value: 'index' }];
  const sectionExtractor = jest.fn((item: Item, index: number) => `section:${item.value}:${index}`);
  const listExtractor = jest.fn((item: Item, index: number) => `list:${item.value}:${index}`);
  const sections = [{ key: 'custom', data: [customItem], keyExtractor: sectionExtractor }, { key: 'default', data: defaultItems }];
  const ref = createRef<SectionList<Item, Section<Item>>>();
  const callback = jest.fn<NonNullable<SectionListProps<Item, Section<Item>>['onViewableItemsChanged']>>();
  const props = { ref, keyExtractor: listExtractor, onViewableItemsChanged: callback, renderItem: () => <Text testID="row">成绩</Text> };
  const page = (keyExtractor: typeof listExtractor | undefined) => <BestListPage<Item, Section<Item>>
    isLoading={false} isError={false} isEmpty={false} emptyText="空" data={sections} sectionListProps={{ ...props, keyExtractor }}
  />;
  const screen = await render(page(listExtractor));
  let list = getNativeList(ref);
  expect(sections[0].keyExtractor).toBe(sectionExtractor);
  expect(list.props.sections[1]).toBe(sections[1]);
  const report = () => {
    const all = [token(list.props.sections[0], 0), token(customItem, 1), token(list.props.sections[0], 2),
      token(list.props.sections[1], 3), ...defaultItems.map((item, index) => token(item, index + 4)), token(list.props.sections[1], 7)];
    list._onViewableItemsChanged({ viewableItems: all, changed: all });
  };
  sectionExtractor.mockClear(); listExtractor.mockClear();
  await act(report);
  expect(sectionExtractor.mock.calls.every(([item]) => item === customItem)).toBe(true);
  expect(listExtractor.mock.calls.every(([item]) => defaultItems.includes(item))).toBe(true);
  expect(callback.mock.calls.at(-1)![0].viewableItems.map(({ key }) => key)).toEqual([
    'section:section:0', 'list:key:0', 'list:id:1', 'list:index:2',
  ]);
  await screen.rerender(page(undefined));
  list = getNativeList(ref);
  await act(report);
  expect(callback.mock.calls.at(-1)![0].viewableItems.map(({ key }) => key)).toEqual(['section:section:0', 'row-key', 'row-id', '2']);
  await screen.unmount();
});

it.each([false, true])('filters delayed section tokens after replacement (section extractor: %s)', async (useSectionExtractor) => {
  type Item = { play: { uid: string } };
  const oldItem = { play: { uid: 'old' } };
  const nextItems = [{ play: { uid: 'next-a' } }, { play: { uid: 'next-b' } }];
  const ref = createRef<SectionList<Item, Section<Item>>>();
  const extractor = jest.fn((item: Item) => item.play.uid);
  const oldSection = { key: 'old', data: [oldItem], ...(useSectionExtractor ? { keyExtractor: extractor } : {}) };
  const callback = jest.fn<NonNullable<SectionListProps<Item, Section<Item>>['onViewableItemsChanged']>>();
  const props = { ref, keyExtractor: extractor, onViewableItemsChanged: callback, renderItem: () => <Text testID="row">成绩</Text> };
  const page = (data: Section<Item>[]) => <BestListPage<Item, Section<Item>>
    isLoading={false} isError={false} isEmpty={false} emptyText="空" data={data} sectionListProps={props}
  />;
  const screen = await render(page([oldSection]));
  const previousList = getNativeList(ref);
  const previousNativeSection = previousList.props.sections[0];
  if (useSectionExtractor) expect(previousNativeSection).not.toBe(oldSection);
  await screen.rerender(page([{ key: 'next', data: nextItems, ...(useSectionExtractor ? { keyExtractor: extractor } : {}) }]));
  const list = getNativeList(ref);
  expect(list).toBe(previousList);
  extractor.mockClear();
  await act(() => list._onViewableItemsChanged({
    viewableItems: [token(nextItems[1], 2)],
    changed: [token(previousNativeSection, 2, false), token(oldSection, 2, false), token(nextItems[1], 2)],
  }));
  expect(extractor.mock.calls.every(([item]) => item === nextItems[1])).toBe(true);
  expect(callback.mock.calls.at(-1)![0].changed.map(({ item }) => item)).toEqual([nextItems[1]]);
  await screen.unmount();
});

it('still propagates errors thrown by a business key extractor for a real row', async () => {
  const item = { id: 'row' };
  const ref = createRef<SectionList<typeof item, Section<typeof item>>>();
  const extractor = jest.fn((value: typeof item) => value.id);
  const props = { ref, keyExtractor: extractor, renderItem: () => <Text testID="row">成绩</Text> };
  const screen = await render(<BestListPage<typeof item, Section<typeof item>>
    isLoading={false} isError={false} isEmpty={false} emptyText="空" data={[{ key: 'best', data: [item] }]} sectionListProps={props}
  />);
  const list = getNativeList(ref);
  const failure = new Error('business key failure');
  extractor.mockImplementation(() => { throw failure; });
  expect(() => list._onViewableItemsChanged({ viewableItems: [token(item, 1)], changed: [] })).toThrow(failure);
  await screen.unmount();
});

it('notifies only changed row image scopes while preserving list and card render identities', async () => {
  const items = [{ id: 'one' }, { id: 'two' }, { id: 'three' }];
  const sections = [{ key: 'best', data: items }];
  const ref = createRef<SectionList<typeof items[number], Section<typeof items[number]>>>();
  const cardRenders = jest.fn();
  function Card({ testID }: { testID: string }) { cardRenders(testID); return <Text>{testID}</Text>; }
  const renderItem = jest.fn(({ item }: { item: typeof items[number] }) => <Card testID={item.id} />);
  const extraData = { selected: 'one' };
  const props = { ref, renderItem, extraData };
  const screen = await render(<BestListPage<typeof items[number], Section<typeof items[number]>>
    isLoading={false} isError={false} isEmpty={false} emptyText="空" data={sections} sectionListProps={props}
  />);
  const list = getNativeList(ref);
  const original = list.props;
  expect(original.viewabilityConfig).toEqual({ itemVisiblePercentThreshold: 50, minimumViewTime: 250, waitForInteraction: false });
  const report = (visible: typeof items) => list._onViewableItemsChanged({
    viewableItems: [token(list.props.sections[0], 0), ...visible.map((item) => token(item, items.indexOf(item) + 1))], changed: [],
  });
  mockScopeChanges.mockClear(); cardRenders.mockClear(); renderItem.mockClear();
  await act(() => report([items[0]]));
  expect(mockScopeChanges.mock.calls).toEqual([['one', true]]);
  mockScopeChanges.mockClear();
  await act(() => report([items[0], items[1]]));
  expect(mockScopeChanges.mock.calls).toEqual([['two', true]]);
  mockScopeChanges.mockClear();
  await act(() => report([items[1]]));
  expect(mockScopeChanges.mock.calls).toEqual([['one', false]]);
  mockScopeChanges.mockClear();
  await act(() => report([items[1]]));
  expect(mockScopeChanges).not.toHaveBeenCalled();
  expect(cardRenders).not.toHaveBeenCalled();
  expect(renderItem).not.toHaveBeenCalled();
  expect(list.props).toBe(original);
  expect(list.props.extraData).toBe(extraData);
  await screen.unmount();
});
