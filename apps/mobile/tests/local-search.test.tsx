import { act, render, renderHook } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { AppState, type AppStateStatus, Text } from 'react-native';
import { CachedContentActivityScope } from '@/components/CachedTabScreen';
import type { Song } from '@/domain/models';
import { useLocalSearch } from '@/hooks/use-local-search';
import { AppLifecycleProvider } from '@/state/app-lifecycle';
import { EMPTY_SONG_FILTERS, findMatchedAlias, matchesSongSearch } from '@/utils/search';

const originalIdle = globalThis.requestIdleCallback;
const originalCancelIdle = globalThis.cancelIdleCallback;
let callbacks: Map<number, IdleRequestCallback>;
let nextHandle: number;
let time: number;

const song = (id: string, title: string, alias: string): Song => ({
  id, title, aliases: [alias], version: 'current', charts: [{
    songId: id, type: 'DX', levelIndex: 3, difficulty: 'master', level: '13', difficultyConstant: 13,
  }],
});
const catalog = [song('1', 'しゅうまつ', '周末'), song('2', 'Second', 'テスト'), song('3', 'Third', '第三首')];

function selectSong(value: Song, keyword: string) {
  time += 3;
  return matchesSongSearch(value, { ...EMPTY_SONG_FILTERS, keyword })
    ? `${value.id}:${findMatchedAlias(value, keyword) ?? value.title}` : undefined;
}

function Search({ songs, keyword, active = true }: { songs: Song[]; keyword: string; active?: boolean }) {
  return <CachedContentActivityScope active={active}><Result songs={songs} keyword={keyword} /></CachedContentActivityScope>;
}

function Result({ songs, keyword }: { songs: Song[]; keyword: string }) {
  const result = useLocalSearch(songs, keyword, selectSong);
  return <><Text testID="results">{result.data.join('|')}</Text><Text testID="pending">{String(result.isFiltering)}</Text></>;
}

async function nextIdle() {
  const [handle, callback] = callbacks.entries().next().value!;
  callbacks.delete(handle);
  await act(() => callback({ didTimeout: false, timeRemaining: () => 50 }));
}

async function finishIdle() {
  while (callbacks.size) await nextIdle();
}

beforeEach(() => {
  callbacks = new Map(); nextHandle = 0; time = 0;
  globalThis.requestIdleCallback = callback => { callbacks.set(++nextHandle, callback); return nextHandle; };
  globalThis.cancelIdleCallback = handle => { callbacks.delete(handle); };
  jest.spyOn(performance, 'now').mockImplementation(() => time);
});

afterEach(() => {
  globalThis.requestIdleCallback = originalIdle;
  globalThis.cancelIdleCallback = originalCancelIdle;
  jest.restoreAllMocks();
});

it('yields while matching real romanized text and publishes only a complete ordered result', async () => {
  const view = await render(<Search songs={catalog} keyword="" />);
  await nextIdle();
  expect(view.getByTestId('pending').props.children).toBe('true');
  expect(view.getByTestId('results').props.children).toBe('');
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('1:しゅうまつ|2:Second|3:Third');
  await view.rerender(<Search songs={catalog} keyword="syuumatu" />);
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('1:しゅうまつ');
  await view.rerender(<Search songs={catalog} keyword="tesuto" />);
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('2:テスト');
});

it('discards an unfinished input and cancels its already queued callback', async () => {
  const view = await render(<Search songs={catalog} keyword="syuumatu" />);
  await nextIdle();
  const obsolete = [...callbacks.values()];
  await view.rerender(<Search songs={catalog} keyword="tesuto" />);
  await act(() => { obsolete.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 })); });
  expect(view.getByTestId('results').props.children).toBe('');
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('2:テスト');
});

it('replaces a catalog and its aliases without displaying an old snapshot', async () => {
  const view = await render(<Search songs={catalog} keyword="tesuto" />);
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('2:テスト');
  const replacement = [song('2', 'Second', '新别名')];
  await view.rerender(<Search songs={replacement} keyword="tesuto" />);
  expect(view.getByTestId('results').props.children).toBe('');
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('');
  await view.rerender(<Search songs={replacement} keyword="新别名" />);
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('2:新别名');
});

it('pauses a hidden page and resumes its latest input on focus', async () => {
  const view = await render(<Search songs={catalog} keyword="syuumatu" />);
  await nextIdle();
  await view.rerender(<Search songs={catalog} keyword="tesuto" active={false} />);
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('');
  await view.rerender(<Search songs={catalog} keyword="tesuto" />);
  await finishIdle();
  expect(view.getByTestId('results').props.children).toBe('2:テスト');
});

it('keeps the completed search result when the page and app become active again', async () => {
  let active = true;
  let changeAppState: ((state: AppStateStatus) => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, listener) => {
    if (type === 'change') changeAppState = listener;
    return { remove: jest.fn() };
  });
  const hook = await renderHook(() => useLocalSearch(catalog, 'tesuto', selectSong), {
    wrapper: ({ children }: { children: ReactNode }) => <AppLifecycleProvider>
      <CachedContentActivityScope active={active}>{children}</CachedContentActivityScope>
    </AppLifecycleProvider>,
  });
  await finishIdle();
  const completed = hook.result.current.data;
  expect(completed).toEqual(['2:テスト']);

  active = false;
  await hook.rerender(undefined);
  active = true;
  await hook.rerender(undefined);
  await finishIdle();
  expect(hook.result.current.data).toBe(completed);
  expect(hook.result.current.isFiltering).toBe(false);

  await act(() => changeAppState?.('background'));
  await act(() => changeAppState?.('active'));
  await finishIdle();
  expect(hook.result.current.data).toBe(completed);
  expect(hook.result.current.isFiltering).toBe(false);
  await hook.unmount();
});
