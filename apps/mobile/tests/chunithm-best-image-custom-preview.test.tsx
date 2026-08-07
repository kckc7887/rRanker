import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ChunithmBestImageScreen } from '@/screens/ChunithmBestImageScreen';
import type { ChunithmCatalogSnapshot } from '@/domain/chunithm';
import type { ChunithmScore } from '@/domain/chunithm-personal';

const mockShowNotification = jest.fn();

jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: mockShowNotification, showActionNotification: jest.fn() }),
}));

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

jest.mock('@/features/chunithm-best-image/load-chunithm-best-image-collections', () => ({
  loadChunithmBestImageCharacters: jest.fn(async () => []),
}));

jest.mock('@/features/chunithm-best-image/load-chunithm-best-image-jackets', () => ({
  chunithmBestImageJacketUrl: (jacketId: string) => `https://assets2.lxns.net/chunithm/jacket/${encodeURIComponent(jacketId)}.png`,
  resolveChunithmBestImageJacketId: (songId: string, levelIndex: number) => (
    levelIndex === 5 ? `we-${songId}` : songId
  ),
  loadChunithmBestImageJackets: jest.fn(async (jacketIds: string[]) => Object.fromEntries(
    jacketIds.map((id) => [id, `data:image/png;base64,jacket-${id}`]),
  )),
  loadChunithmRemoteImageDataUri: jest.fn(async () => null),
}));

jest.mock('@/features/chunithm-best-image/chunithm-best-image-preferences', () => ({
  chunithmBestImagePreferencesStore: {
    load: jest.fn(async () => ({
      version: 3,
      selectionCount: 0,
      character: { mode: 'current' },
      background: { mode: 'default' },
    })),
    save: jest.fn(async () => undefined),
  },
  DEFAULT_CHUNITHM_BEST_IMAGE_STYLES: {
    version: 3,
    selectionCount: 0,
    character: { mode: 'current' },
    background: { mode: 'default' },
  },
  resolveChunithmBestImageStyleId: (choice: { mode: string; id?: number }, currentId: number | null | undefined) => {
    if (choice.mode === 'off') return null;
    if (choice.mode === 'item' || choice.mode === 'random') {
      return typeof choice.id === 'number' ? choice.id : null;
    }
    return currentId ?? null;
  },
}));

jest.mock('@/features/best-image/best-image-export', () => ({
  bestImageCaptureDimensions: (width: number, height: number, pixelRatio: number, platform: string) => platform === 'ios'
    ? { width: width / pixelRatio, height: height / pixelRatio }
    : { width, height },
  bestImageExportFilename: jest.fn(() => 'image.png'),
  deleteBestImageCapture: jest.fn(),
  isDrawViewHierarchyError: (error: unknown) => error instanceof Error && error.message.includes('drawViewHierarchyInRect'),
  requestBestImageExportPermission: jest.fn(async () => undefined),
  saveBestImageCapture: jest.fn(async () => undefined),
  shouldUseBestImageRenderInContext: (platform: string, width: number, height: number) => platform === 'ios' && (width >= 1440 || height >= width * 4),
}));

jest.mock('@/features/best-image/prepare-best-image-webview-sources', () => ({
  inlineBestImageWebViewSources: (htmlPages: readonly string[]) => htmlPages.map((html) => ({
    html,
    baseUrl: 'https://assets2.lxns.net/',
  })),
  prepareAndroidBestImageWebViewSources: jest.fn(() => ({ sources: [], dispose: jest.fn() })),
}));

type RenderedScreen = Awaited<ReturnType<typeof render>>;

const previewHtml = (screen: RenderedScreen) => (
  screen.getByTestId('chunithm-best-image-html-preview-0').props.source.html as string
);

describe('chunithm best image custom', () => {
  beforeEach(() => mockShowNotification.mockClear());

  it('shows the Best50 and 自定义 tabs with the Best50 content by default', async () => {
    const screen = await render(<ChunithmBestImageScreen />);
    expect(screen.getByLabelText('Best50').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('自定义').props.accessibilityState).toEqual({ selected: false });
    await waitFor(() => expect(screen.getByTestId('chunithm-best-image-html-preview-0')).toBeTruthy());
    const html = previewHtml(screen);
    expect(html).toContain('<div class="section-divider"><span>Best 30</span></div>');
    expect(html).toContain('<div class="section-divider"><span>New 20</span></div>');
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
      expect(previewHtml(screen)).toContain('<div class="section-divider"><span>Best5</span></div>');
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
      expect(previewHtml(screen)).toContain('<div class="section-divider"><span>MASTER3</span></div>');
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
      expect(previewHtml(screen)).toContain('<div class="section-divider"><span>评价 SSS~不限2</span></div>');
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
      expect(previewHtml(screen)).toContain('<div class="section-divider"><span>STAR3</span></div>');
    });
  });
});
