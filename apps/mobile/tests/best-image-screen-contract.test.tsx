import { createHash } from 'node:crypto';
import { render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import BestImageScreen from '../app/best-image';
import { ChunithmBestImageScreen } from '@/screens/ChunithmBestImageScreen';
import { PhigrosBestImageScreen } from '@/screens/PhigrosBestImageScreen';

let mockShowNotification = jest.fn();
let mockGameDataPayload: Record<string, unknown> | null = null;
let mockChunithmCatalogData: Record<string, unknown> | null = null;
let mockPhigrosCatalogData: Record<string, unknown> | null = null;

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
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    activeAccountId: 'contract-account',
    data: { payload: mockGameDataPayload },
  }),
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
  prepareBestImageWebViewSources: (htmlPages: string[]) => ({
    sources: htmlPages.map((html) => ({ html, baseUrl: 'file:///assets/' })),
    dispose: jest.fn(),
  }),
  inlineBestImageWebViewSources: (htmlPages: readonly string[]) => htmlPages.map((html) => ({
    html,
    baseUrl: 'https://assets2.lxns.net/',
  })),
  prepareAndroidBestImageWebViewSources: jest.fn(() => ({ sources: [], dispose: jest.fn() })),
}));
jest.mock('@/features/best-image/use-best-image-collections', () => ({
  useBestImageCollections: () => ({
    data: {
      items: [
        { id: 9001, kind: 'icon', name: '示例头像', requirements: [] },
        { id: 9002, kind: 'plate', name: '示例姓名框', requirements: [] },
        { id: 9003, kind: 'trophy', name: '示例称号', color: 'Gold', requirements: [] },
        { id: 9005, kind: 'trophy', name: '铜牌称号', color: 'Bronze', requirements: [] },
        { id: 9004, kind: 'frame', name: '示例背景', requirements: [] },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/components/CollectionImage', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { CollectionImage: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props) };
});
jest.mock('@/hooks/use-dxrating-chart-tags', () => ({
  useDxRatingChartTags: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
}));
jest.mock('@/hooks/use-detailed-catalog', () => ({
  useDetailedCatalog: () => ({ data: undefined, isLoading: false, isError: false, error: null }),
  useTransientDetailedMaimaiCatalog: () => ({
    data: jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized').fixtureCatalog,
    error: null,
    isLoading: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/hooks/use-chunithm-catalog', () => ({
  useChunithmCatalog: () => ({
    data: mockChunithmCatalogData,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => mockPhigrosCatalogData,
}));
jest.mock('@/features/best-image/load-best-image-assets', () => ({
  loadBestImageAssets: async () => ({
    fontUrl: 'data:font/ttf;base64,dGVzdA==',
    ratingFrameUrl: 'data:image/png;base64,dGVzdA==',
  }),
}));
jest.mock('@/features/best-image/load-best-image-jackets', () => ({
  loadBestImageJackets: async (songIds: string[]) => Object.fromEntries(
    songIds.map((songId) => [songId, `data:image/png;base64,jacket-${songId}`]),
  ),
}));
jest.mock('@/features/best-image/maimai-font-cache', () => ({
  prepareMaimaiFonts: jest.fn(async () => ({
    directory: { uri: 'file:///assets/' },
    fullReady: Promise.resolve(),
  })),
}));
jest.mock('@/features/best-image/maimai-ui-cache', () => ({
  prepareMaimaiUi: jest.fn(async () => ({
    directory: { uri: 'file:///assets/' },
    fullReady: Promise.resolve(),
  })),
}));
jest.mock('@/features/best-image/best-image-style-preferences', () => ({
  bestImageStylePreferencesStore: {
    load: jest.fn(async () => ({ version: 3, selections: {}, ratingStyle: 'game' })),
    save: jest.fn(async () => undefined),
  },
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
jest.mock('@/domain/phigros-avatar-resolver', () => ({
  loadPhigrosAvatarCatalog: jest.fn(async () => ['avatar.test']),
}));
jest.mock('@/features/phigros-best-image/load-phigros-image-assets', () => ({
  createPhigrosIllustrationSessionDirectory: () => ({ uri: 'file:///illustration-session/' }),
  disposePhigrosIllustrationSession: jest.fn(),
  phigrosReadableRootDirectory: () => ({ uri: 'file:///reference/' }),
  loadPhigrosIllustrations: jest.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `data:image/png;base64,${id}`]))),
  loadRemoteImageDataUri: jest.fn(async () => 'data:image/png;base64,style'),
}));
jest.mock('@/features/phigros-best-image/load-phigros-acc-averages', () => ({
  loadPhigrosAccAverages: jest.fn(async () => ({})),
  phigrosAccAverageKey: (record: { songId: string; levelIndex: number }) => `${record.songId}:${record.levelIndex}`,
}));
jest.mock('@/features/phigros-best-image/phigros-font-cache', () => ({
  PHIGROS_FONT_MANIFEST: [
    { name: 'phi', core: true },
    { name: 'Aldrich-Regular', core: true },
    { name: 'NotoSansJP', core: false },
  ],
  preparePhigrosFonts: jest.fn(),
}));
jest.mock('@/features/phigros-best-image/load-phigros-reference-template-assets', () => ({
  loadPhigrosReferenceTemplateAssets: jest.fn(async () => ({
    css: '@font-face{font-family:"PHI";src:url("./font/phi.ttf")} .song{width:360px}.Rating img{width:100%}',
    dataIconUrl: 'data:image/png;base64,data', fallbackBackgroundUrl: 'data:image/png;base64,background', fallbackAvatarUrl: 'data:image/png;base64,avatar',
    challengeIconUrls: Array.from({ length: 6 }, (_, index) => `data:image/png;base64,challenge-${index}`),
    ratingIconUrls: { F: 'data:image/png;base64,F', FC: 'data:image/png;base64,FC', V: 'data:image/png;base64,V', phi: 'data:image/png;base64,phi' },
    allowingReadAccessToUrl: 'file:///reference/',
  })),
}));
jest.mock('@/features/phigros-best-image/phigros-best-image-preferences', () => ({
  phigrosBestImagePreferencesStore: {
    load: jest.fn(async () => ({ version: 1, avatar: { mode: 'current' }, background: { mode: 'current' }, overflowCount: 0 })),
    save: jest.fn(async () => undefined),
  },
}));

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

async function screenHash(screen: Awaited<ReturnType<typeof render>>, parts: { label?: RegExp; testId?: string }[]): Promise<string> {
  const trees: unknown[] = [];
  for (const part of parts) {
    if (part.label) {
      for (const node of screen.getAllByLabelText(part.label)) trees.push(node.toJSON());
    }
    if (part.testId) trees.push(screen.getByTestId(part.testId).toJSON());
  }
  const canonical = canonicalize(trees) as unknown[];
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const maimaiPayload = {
  kind: 'maimai',
  player: {
    displayName: '测试玩家',
    presentation: { iconId: 200201, namePlateId: 300101, frameId: 350101, trophyName: '测试称号', trophyColor: 'Gold' },
  },
  playerScore: { value: 15001 },
  currentVersionTitle: '当前版本',
  records: [],
  bestSections: [],
};

const chunithmPayload = {
  kind: 'chunithm',
  player: { name: '测试玩家', level: 99, rating: 16.5, rating_possession: 'rainbow', friend_code: 1 },
  playerScore: { label: 'Rating', value: 16.5, display: '16.50' },
  scores: [],
  bestSections: [],
  selections: [],
  source: { kind: 'fixture', label: '测试来源', updatedAt: '', isStale: false },
  hasSyncedData: true,
};

const phigrosPayload = {
  kind: 'phigros',
  player: { displayName: 'Phi 测试' },
  playerScore: { value: 15.4321, display: '15.4321' },
  challengeModeRank: 23,
  source: { updatedAt: '2026-07-22T08:00:00.000Z' },
  saveUpdatedAt: '2026-07-22T08:00:00.000Z',
  dataAmount: '386MiB 289KiB',
  progress: { cleared: [1, 2, 3, 4], fullCombo: [1, 1, 1, 1], phi: [0, 0, 1, 1] },
  avatarKey: 'avatar.test',
  backgroundSongId: 'song-1',
  avatarUrl: 'https://example.test/avatar/current.png',
  records: [],
  bestSections: [],
};

beforeEach(() => {
  mockShowNotification = jest.fn();
  mockGameDataPayload = maimaiPayload;
  mockChunithmCatalogData = null;
  mockPhigrosCatalogData = null;
  const { preparePhigrosFonts } = jest.requireMock('@/features/phigros-best-image/phigros-font-cache') as { preparePhigrosFonts: jest.Mock };
  preparePhigrosFonts.mockReset().mockImplementation(async (...args: unknown[]) => {
    const onProgress = args[0] as (value: Record<string, unknown>) => void;
    const options = args[1] as { neededNames?: string[] } | undefined;
    const total = options?.neededNames?.length ?? 3;
    onProgress({ phase: 'core-ready', completed: 2, total, currentFont: null });
    return {
      directory: { uri: 'file:///reference/' },
      fullReady: Promise.resolve().then(() => onProgress({ phase: 'ready', completed: total, total, currentFont: null })),
    };
  });
});

test('maimai best image screen contract', async () => {
  const screen = await render(<BestImageScreen />);
  await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy());
  expect(screen.queryByTestId('best-image-webview-status')).toBeNull();
  expect(await screenHash(screen, [{ label: /^导出成绩图片$/ }]))
    .toBe('7a04172054dc34caf983669471f3fac1dea85f272a46b744f6262c6930ec09c0');
  expect(await screenHash(screen, [{ label: /^宽度 1080 像素$/ }]))
    .toBe('c042ab6b91749cb3e1d4097be5c6ec7f9afa139691d541ccfc1715bd8bdd670c');
});

test('chunithm best image screen contract', async () => {
  mockGameDataPayload = chunithmPayload;
  mockChunithmCatalogData = {
    currentVersion: { id: 12, title: 'STAR' },
    versions: [{ id: 12, title: 'STAR' }],
    genres: [],
    songs: [],
    source: { kind: 'fixture', label: '测试曲库', updatedAt: '', isStale: false },
  };
  const screen = await render(<ChunithmBestImageScreen />);
  await waitFor(() => expect(screen.getByTestId('chunithm-best-image-html-preview-0')).toBeTruthy());
  expect(screen.queryByTestId('chunithm-best-image-webview-status')).toBeNull();
  expect(await screenHash(screen, [{ label: /^导出成绩图片$/ }]))
    .toBe('7a04172054dc34caf983669471f3fac1dea85f272a46b744f6262c6930ec09c0');
  expect(await screenHash(screen, [{ label: /^Best50$/ }]))
    .toBe('498bc8cbad5d53ac9604325cb39a095e0c9e5b546b9e932b75e34897fc5e093b');
});

test('phigros best image screen contract', async () => {
  mockGameDataPayload = phigrosPayload;
  mockPhigrosCatalogData = {
    data: {
      provider: {
        getGameVersion: jest.fn(async () => '3.16.1'),
        getAvatarUrl: (key: string) => `https://example.test/avatar/${key}.png`,
        getIllustrationUrl: (id: string) => `https://example.test/illustration/${id}.png`,
        getIllustrationBlurUrl: (id: string) => `https://example.test/illustration/${id}.png`,
        getIllustrationLowresUrl: (id: string) => `https://example.test/illustration-lowres/${id}.png`,
      },
      snapshot: { songs: [{ id: 'song-1', title: 'テスト曲目', charts: [] }] },
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  };
  const screen = await render(<PhigrosBestImageScreen />);
  await waitFor(() => expect(screen.getByTestId('phigros-best-image-html-preview-0')).toBeTruthy());
  expect(screen.queryByTestId('phigros-best-image-webview-status')).toBeNull();
  expect(await screenHash(screen, [{ label: /^导出成绩图片$/ }]))
    .toBe('7a04172054dc34caf983669471f3fac1dea85f272a46b744f6262c6930ec09c0');
  expect(await screenHash(screen, [{ label: /^Best30$/ }]))
    .toBe('f01139c9e8b46e1d5ea885ea099864f97565cfab574fb16ddedf0af881b14ab4');
});
