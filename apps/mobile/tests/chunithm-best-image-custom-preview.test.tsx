import { PixelRatio } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ChunithmBestImageScreen } from '@/screens/ChunithmBestImageScreen';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import type { ChunithmScore } from '@/domain/chunithm-personal';

const mockShowNotification = jest.fn();
const mockLoadRemoteImage = jest.fn(async (_session: unknown, url: string | null): Promise<string | null> => url);
const mockFiles = new Map<string, string>();

jest.mock('@/components/AppNotification', () => {
  const actions = { showActionNotification: jest.fn(() => 1), updateNotification: jest.fn(), dismissNotification: jest.fn() };
  return { useNotification: () => ({ showNotification: mockShowNotification, ...actions }) };
});

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props) };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///capture.png') }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

const mockSource = { kind: 'fixture', label: '测试来源', updatedAt: '', isStale: false } as const;
const mockPlayer = {
  name: '测试玩家',
  level: 99,
  rating: 16.5,
  rating_possession: 'rainbow',
  friend_code: 1,
  class_emblem: { base: 0, medal: 0 },
  reborn_count: 1,
  over_power: 0,
  over_power_progress: 0,
  currency: 0,
  total_currency: 0,
  total_play_count: 0,
};
const mockScores: readonly ChunithmScore[] = [
  { id: 101, level_index: 3, score: 1_009_000, rating: 17.5, clear: 'clear' },
  { id: 102, level_index: 3, score: 1_000_000, rating: 16.5, clear: 'clear' },
  { id: 103, level_index: 4, score: 1_015_000, rating: 18.0, clear: 'absolute' },
  { id: 104, level_index: 5, score: 990_000, rating: 15.5, clear: 'clear' },
  { id: 105, level_index: 3, score: 995_000, rating: 16.0, clear: 'clear' },
];
const mockGameData = {
  activeAccountId: 'test-account',
  isLoading: false,
  data: {
    payload: {
      kind: 'chunithm' as const,
      player: mockPlayer,
      playerScore: { label: 'Rating', value: 16.5, display: '16.50' },
      scores: mockScores,
      bestSections: [
        { id: 'b30', title: 'Best 30', scores: [mockScores[0]] },
        { id: 'new20', title: 'New 20', scores: [mockScores[1]] },
      ],
      selections: [mockScores[2]],
      source: mockSource,
      hasSyncedData: true,
    },
  },
};
const mockCatalogData = {
  currentVersion: { id: 12, title: 'STAR' },
  versions: [
    { id: 1, title: 'CHUNITHM' },
    { id: 12, title: 'STAR' },
  ],
  genres: [],
  songs: [
    {
      id: 101, title: 'MASTER曲', genre: 'ORIGINAL', bpm: 170, versionId: 12, versionTitle: 'STAR',
      locked: false, disabled: false,
      difficulties: [{ difficulty: 3, level: '14', levelValue: 14.5, versionId: 12, versionTitle: 'STAR' }],
    },
    {
      id: 102, title: 'MASTER曲2', genre: 'ORIGINAL', bpm: 170, versionId: 12, versionTitle: 'STAR',
      locked: false, disabled: false,
      difficulties: [{ difficulty: 3, level: '14+', levelValue: 14.6, versionId: 12, versionTitle: 'STAR' }],
    },
    {
      id: 103, title: 'ULTIMA曲', genre: 'ORIGINAL', bpm: 200, versionId: 12, versionTitle: 'STAR',
      locked: false, disabled: false,
      difficulties: [{ difficulty: 4, level: '15', levelValue: 15.0, versionId: 12, versionTitle: 'STAR' }],
    },
    {
      id: 104, title: 'WE曲', genre: 'ORIGINAL', bpm: 120, versionId: 1, versionTitle: 'CHUNITHM',
      locked: false, disabled: false,
      difficulties: [{ difficulty: 5, level: '☆☆☆', levelValue: 0, versionId: 1, versionTitle: 'CHUNITHM', kanji: '無' }],
    },
    {
      id: 105, title: 'MASTER曲3', genre: 'ORIGINAL', bpm: 160, versionId: 1, versionTitle: 'CHUNITHM',
      locked: false, disabled: false,
      difficulties: [{ difficulty: 3, level: '14', levelValue: 14.4, versionId: 1, versionTitle: 'CHUNITHM' }],
    },
  ],
  source: { kind: 'fixture', label: '测试曲库', updatedAt: '', isStale: false },
} satisfies ChunithmCatalogSnapshot;

jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => mockGameData,
}));

jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: mockCatalogData,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

jest.mock('@/hooks/use-chunithm-collections', () => ({
  useChunithmCollections: (kind: string) => ({
    data: { items: kind === 'plate' ? [{ id: 42, name: '测试名牌' }] : kind === 'trophy' ? [
      { id: 7, name: '金色称号', color: 'gold', level: 2 },
      { id: 8, name: '图片称号', color: 'image' },
    ] : [] },
    isPending: false, isError: false, refetch: jest.fn(),
  }),
}));

jest.mock('@/features/chunithm-best-image/load-chunithm-best-image-jackets', () => ({
  chunithmBestImageJacketUrl: (jacketId: string) => `https://assets2.lxns.net/chunithm/jacket/${encodeURIComponent(jacketId)}.png`,
  resolveChunithmBestImageJacketId: (songId: string, levelIndex: number) => (
    levelIndex === 5 ? `we-${songId}` : songId
  ),
  loadChunithmBestImageJackets: jest.fn(async (_session: unknown, jacketIds: string[]) => Object.fromEntries(
    jacketIds.map((id) => {
      const uri = `file:///session/jacket-${id}`;
      mockFiles.set(uri, `jacket-${id}`);
      return [id, uri];
    }),
  )),
}));

jest.mock('@/features/chunithm-best-image/chunithm-best-image-preferences', () => ({
  chunithmBestImagePreferencesStore: {
    load: jest.fn(async () => ({
      version: 3,
      selectionCount: 0,
      character: { mode: 'current' },
      plate: { mode: 'current' },
      trophy: { mode: 'current' },
      background: { mode: 'default' },
    })),
    save: jest.fn(async () => undefined),
  },
  DEFAULT_CHUNITHM_BEST_IMAGE_STYLES: {
    version: 3,
    selectionCount: 0,
    character: { mode: 'current' },
      plate: { mode: 'current' },
      trophy: { mode: 'current' },
    background: { mode: 'default' },
  },
  resolveChunithmBestImageStyleId: (choice: { mode: string; id?: number }, currentId: number | null | undefined) => {
    if (choice.mode === 'off') return null;
    if (choice.mode === 'default') return 1;
    if (choice.mode === 'item' || choice.mode === 'random') {
      return typeof choice.id === 'number' ? choice.id : null;
    }
    return currentId ?? null;
  },
}));

jest.mock('@/features/best-image/best-image-export', () => ({
  ...jest.requireActual<typeof import('@/features/best-image/best-image-export')>('@/features/best-image/best-image-export'),
  deleteBestImageCapture: jest.fn(async () => undefined),
  requestBestImageExportPermission: jest.fn(async () => undefined),
  saveBestImageCapture: jest.fn(async () => undefined),
}));

jest.mock('@/features/best-image/prepare-best-image-webview-sources', () => {
  let batch = 0;
  return {
    prepareBestImageWebViewSources: async (htmlPages: readonly string[]) => {
      batch += 1;
      return { sources: htmlPages.map((html, index) => ({ html, uri: `file:///session/page-${batch}-${index}.html` })), dispose: async () => undefined };
    },
  };
});

type RenderedScreen = Awaited<ReturnType<typeof render>>;

const previewHtml = (screen: RenderedScreen) => (
  screen.getByTestId('chunithm-best-image-html-preview-0').props.source.html as string
);

describe('chunithm best image custom', () => {
  beforeEach(() => { mockFiles.clear(); mockShowNotification.mockClear(); mockLoadRemoteImage.mockReset().mockImplementation(async (_session, url) => url); });
  afterEach(() => jest.restoreAllMocks());

  it('selects a plate, saves it for the account, and restores the default board', async () => {
    const { chunithmBestImagePreferencesStore } = jest.requireMock('@/features/chunithm-best-image/chunithm-best-image-preferences') as { chunithmBestImagePreferencesStore: { save: jest.Mock } };
    const screen = await render(<ChunithmBestImageScreen />);
    await screen.findByTestId('chunithm-best-image-html-preview-0');
    await fireEvent.press(screen.getByText('名牌'));
    await fireEvent.press(await screen.findByText('测试名牌'));
    await waitFor(() => expect(previewHtml(screen)).toContain('/plate/42.png'));
    await waitFor(() => expect(chunithmBestImagePreferencesStore.save).toHaveBeenCalledWith('test-account', expect.objectContaining({ plate: { mode: 'item', id: 42, name: '测试名牌' } })));
    await fireEvent.press(screen.getByText('名牌'));
    await fireEvent.press(screen.getAllByText('默认板').at(-1)!);
    await waitFor(() => expect(previewHtml(screen)).toContain('/plate/1.png'));
  });

  it('selects text and image trophies, saves their appearance, and can hide or restore the current trophy', async () => {
    const { chunithmBestImagePreferencesStore } = jest.requireMock('@/features/chunithm-best-image/chunithm-best-image-preferences') as { chunithmBestImagePreferencesStore: { save: jest.Mock } };
    const screen = await render(<ChunithmBestImageScreen />);
    await screen.findByTestId('chunithm-best-image-html-preview-0');
    await fireEvent.press(screen.getByLabelText('选择称号'));
    await fireEvent.press(await screen.findByLabelText('选择金色称号'));
    await waitFor(() => expect(previewHtml(screen)).toContain('金色称号'));
    expect(previewHtml(screen)).toContain('trophy/gold.svg');
    await waitFor(() => expect(chunithmBestImagePreferencesStore.save).toHaveBeenCalledWith('test-account', expect.objectContaining({ trophy: { mode: 'item', id: 7, name: '金色称号', color: 'gold', level: 2 } })));
    await fireEvent.press(screen.getByLabelText('选择称号'));
    await fireEvent.press(await screen.findByLabelText('选择图片称号'));
    await waitFor(() => expect(previewHtml(screen)).toContain('/trophy/8.png'));
    await fireEvent.press(screen.getByLabelText('选择称号'));
    await fireEvent.press(screen.getByLabelText('关闭称号'));
    await waitFor(() => {
      expect(previewHtml(screen)).not.toContain('/trophy/');
      expect(previewHtml(screen)).not.toContain('trophy/normal.svg');
    });
    await fireEvent.press(screen.getByLabelText('选择称号'));
    await fireEvent.press(screen.getByLabelText('使用玩家当前称号'));
    await waitFor(() => expect(previewHtml(screen)).toContain('trophy/normal.svg'));
  });

  it('discards a late plate load after another plate was selected', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    await screen.findByTestId('chunithm-best-image-html-preview-0');
    let finish!: (url: string) => void;
    mockLoadRemoteImage.mockImplementation(async (_session, url) => url?.endsWith('/plate/42.png')
      ? new Promise<string>(resolve => { finish = resolve; }) : url);
    await fireEvent.press(screen.getByText('名牌'));
    await fireEvent.press(await screen.findByText('测试名牌'));
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByLabelText('导出成绩图片').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent.press(screen.getByText('名牌'));
    await fireEvent.press(screen.getAllByText('默认板').at(-1)!);
    await waitFor(() => expect(previewHtml(screen)).toContain('/plate/1.png'));
    await act(async () => finish('https://assets2.lxns.net/chunithm/plate/42.png'));
    await waitFor(() => expect(previewHtml(screen)).not.toContain('/plate/42.png'));
  });

  it('exports the prepared Chunithm artwork and reports a saved image', async () => {
    const { saveBestImageCapture } = jest.requireMock('@/features/best-image/best-image-export') as { saveBestImageCapture: jest.Mock };
    saveBestImageCapture.mockClear();
    const screen = await render(<ChunithmBestImageScreen />);
    await screen.findByTestId('chunithm-best-image-html-preview-0');
    const backgrounds = [...previewHtml(screen).matchAll(/href="(file:[^"]+)"/gu)].map(match => mockFiles.get(match[1]!));
    expect(backgrounds.some(svg => svg?.includes(`data:image/png;base64,${Buffer.from('jacket-101').toString('base64')}`))).toBe(true);
    await fireEvent.press(screen.getByLabelText('导出成绩图片'));
    const renderer = await screen.findByLabelText('导出渲染 第1页');
    await fireEvent(renderer, 'message', { nativeEvent: { data: JSON.stringify({ type: 'best-image-ready', width: 1080, height: 1500 }) } });
    await fireEvent(renderer, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 1080 / PixelRatio.get(), height: 1500 / PixelRatio.get() } } });
    await waitFor(() => expect(saveBestImageCapture).toHaveBeenCalledWith('file:///capture.png', expect.stringMatching(/\.png$/)));
    expect(mockShowNotification).toHaveBeenCalledWith(expect.objectContaining({ title: '导出完成', message: '已保存 1 张成绩图片到相册' }));
  });

  it('shows the Best50 and 自定义 tabs with the Best50 content by default', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    expect(screen.getByLabelText('Best50').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('自定义').props.accessibilityState).toEqual({ selected: false });
    await waitFor(() => expect(screen.getByTestId('chunithm-best-image-html-preview-0')).toBeTruthy());
    const html = previewHtml(screen);
    expect(html).toContain('Best 30');
    expect(html).toContain('New 20');
    expect(html).not.toContain('Selection');
  });

  it('switches to 自定义 with the reused score filter and an empty-condition BestN title', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    await fireEvent.press(screen.getByLabelText('自定义'));
    await waitFor(() => expect(screen.getByLabelText('自定义数量')).toBeTruthy());
    expect(screen.getByLabelText('筛选难度 MASTER')).toBeTruthy();
    expect(screen.getByLabelText('中二版本筛选，当前 全部')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('chunithm-best-image-html-preview-0')).toBeTruthy();
      expect(previewHtml(screen)).toContain('Best5');
    });
    expect(screen.getByText('1080 × 810 px · 每页最多 50 行 · 第 1/1 页')).toBeTruthy();
  });

  it('disables export for an invalid quantity and re-enables it for a valid one', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    await fireEvent.press(screen.getByLabelText('自定义'));
    await waitFor(() => expect(screen.getByTestId('chunithm-best-image-html-preview-0')).toBeTruthy());
    expect(screen.getByLabelText('导出成绩图片').props.accessibilityState).toEqual({ disabled: false });

    await fireEvent(screen.getByLabelText('自定义数量'), 'changeText', '-1');
    await waitFor(() => expect(screen.getByText('数量必须是非负整数，0 表示不限制')).toBeTruthy());
    expect(screen.getByLabelText('导出成绩图片').props.accessibilityState).toEqual({ disabled: true });

    await fireEvent(screen.getByLabelText('自定义数量'), 'changeText', '0');
    await waitFor(() => expect(screen.queryByText('数量必须是非负整数，0 表示不限制')).toBeNull());
    expect(screen.getByLabelText('导出成绩图片').props.accessibilityState).toEqual({ disabled: false });
  });

  it('filters by difficulty with the reused filter bar and titles the section with the difficulty label', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    await fireEvent.press(screen.getByLabelText('自定义'));
    await waitFor(() => expect(screen.getByLabelText('筛选难度 MASTER')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('筛选难度 MASTER'));
    await waitFor(() => {
      expect(previewHtml(screen)).toContain('MASTER3');
    });
  });

  it('filters by rank range through the reused evaluation dropdowns', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    await fireEvent.press(screen.getByLabelText('自定义'));
    await waitFor(() => expect(screen.getByLabelText('中二评价下限，当前 不限')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('中二评价下限，当前 不限'));
    await waitFor(() => expect(screen.getByLabelText('选择中二评价下限 SSS')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('选择中二评价下限 SSS'));
    await waitFor(() => {
      expect(previewHtml(screen)).toContain('评价 SSS~不限2');
    });
  });

  it('filters by version through the reused version dropdown', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    await fireEvent.press(screen.getByLabelText('自定义'));
    await waitFor(() => expect(screen.getByLabelText('中二版本筛选，当前 全部')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('中二版本筛选，当前 全部'));
    await waitFor(() => expect(screen.getByLabelText('选择中二版本 STAR')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('选择中二版本 STAR'));
    await waitFor(() => {
      expect(previewHtml(screen)).toContain('STAR3');
    });
  });
});

jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/u, '')).join('/');
    }
    get type() { return this.uri.endsWith('.svg') ? 'image/svg+xml' : 'image/png'; }
    async base64() {
      const content = mockFiles.get(this.uri);
      if (content === undefined) throw new Error('source missing');
      return Buffer.from(content).toString('base64');
    }
  }
  return { File: Entry, Directory: Entry, Paths: { cache: 'file:///cache', document: 'file:///document' } };
});
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: async (uri: string) => ({ exists: mockFiles.has(uri), isDirectory: false, size: mockFiles.get(uri)?.length ?? 0 }),
  makeDirectoryAsync: async () => undefined,
  writeAsStringAsync: async (uri: string, content: string) => { mockFiles.set(uri, content); },
  copyAsync: async ({ from, to }: { from: string; to: string }) => {
    const content = mockFiles.get(from);
    if (content === undefined) throw new Error('source missing');
    mockFiles.set(to, content);
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    const content = mockFiles.get(from);
    if (content === undefined) throw new Error('source missing');
    mockFiles.set(to, content); mockFiles.delete(from);
  },
  deleteAsync: async (uri: string) => {
    for (const file of mockFiles.keys()) if (file === uri || file.startsWith(uri + '/')) mockFiles.delete(file);
  },
}));

jest.mock('@/features/best-image/load-best-image-session', () => {
  const actual = jest.requireActual<typeof import('@/features/best-image/load-best-image-session')>('@/features/best-image/load-best-image-session');
  return { ...actual, loadRemoteImageFile: (session: unknown, url: string | null) => mockLoadRemoteImage(session, url) };
});

jest.mock('@/features/chunithm-best-image/chunithm-ui-cache', () => ({
  prepareChunithmUi: async () => {
    const files = ['basic', 'advanced', 'expert', 'master', 'ultima', 'worldsend'].map(difficulty => `card/${difficulty}.svg`);
    for (const file of files) mockFiles.set(`file:///ui/${file}`, '<svg xmlns="http://www.w3.org/2000/svg" width="756" height="320"/>');
    return { directory: { uri: 'file:///ui' }, files, fullReady: Promise.resolve() };
  },
}));
