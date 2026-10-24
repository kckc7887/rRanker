import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Image } from 'react-native';
import { RizlineBestImageScreen } from '@/screens/RizlineBestImageScreen';
import { rizlineCatalog, rizlineSave } from './fixtures/rizline';
import { buildRizlineRecords, selectRizlineBest } from '@/domain/rizline';
import { DEFAULT_RIZLINE_IMAGE_PREFERENCES as mockDefaults } from '@/features/rizline-best-image/rizline-best-image-preferences';
const mockFiles = new Map<string, string>();
const mockShowNotification = jest.fn();
const mockCatalog = rizlineCatalog();
mockCatalog.songs[0].coverPath = 'rizline/covers/cover.png';
mockCatalog.layouts = [{ id: 'layout.00001', imagePath: 'rizline/covers/layout.png', colors: null }];
mockCatalog.signatures = [{ id: 'bio.1.1', text: '闪亮的', part: 1 }, { id: 'ach.1.title2', text: '星星', part: 2 }];
const mockSave = rizlineSave(); const mockRecords = buildRizlineRecords(mockSave, mockCatalog);
const mockBest = selectRizlineBest(mockRecords);
let mockAccount = 'rizline:one';
const mockPersist = jest.fn(async (_id: string, _value: unknown) => undefined);
const mockData = { payload: { kind: 'rizline', player: mockSave, records: mockRecords, best: mockBest, source: { label: '测试来源' } } };
jest.mock('@/hooks/use-game-data', () => ({ useGameData: () => ({ activeAccountId: mockAccount, data: mockData }) }));
jest.mock('@/hooks/use-rizline-catalog', () => ({ useRizlineCatalog: () => ({ data: { snapshot: mockCatalog } }) }));
jest.mock('@/features/rizline-best-image/rizline-best-image-preferences', () => ({
  DEFAULT_RIZLINE_IMAGE_PREFERENCES: { avatar: { songId: null, crop: null }, layoutId: 'layout.00001', signature1: null, signature2: null, backgroundId: null },
  rizlineImagePreferencesStore: { load: async () => mockDefaults, save: (id: string, value: unknown) => mockPersist(id, value) },
}));
jest.mock('@/features/best-image/load-best-image-session', () => {
  const actual = jest.requireActual<typeof import('@/features/best-image/load-best-image-session')>('@/features/best-image/load-best-image-session');
  const load = async (_session: unknown, url: string | null) => { if (url) mockFiles.set(url, 'image'); return url; };
  return { ...actual, loadRemoteImageFile: load, loadImageFiles: async (session: unknown, ids: string[], url: (id: string) => string | null) => Object.fromEntries(await Promise.all(ids.map(async id => [id, await load(session, url(id))]))) };
});
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { PNG: 'png' }, ImageManipulator: { manipulate: () => ({
  crop: jest.fn(), release: jest.fn(), renderAsync: async () => ({ release: jest.fn(), saveAsync: async () => {
    mockFiles.set('file:///crop.png', 'cropped image'); return { uri: 'file:///crop.png' };
  } }),
}) } }));
jest.mock('@/features/rizline-best-image/rizline-ui-cache', () => ({ prepareRizlineUi: async () => {
  const files = ['card/IN.svg', 'card/mask.svg', 'artwork/clear-mask.svg', 'artwork/soft-mask.svg', 'artwork/glow-mask.svg', 'header/base.svg', 'header/mask.svg', 'header/avatar-mask.svg', 'header/avatar-frame.svg', 'header/RKS.svg'];
  for (const file of files) mockFiles.set(`file:///ui/${file}`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return { directory: { uri: 'file:///ui' }, files, fullReady: Promise.resolve() };
} }));
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

jest.mock('expo-file-system', () => {
  class Entry {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri).replace(/\/$/u, '')).join('/');
    }
    async text() { return mockFiles.get(this.uri) ?? ''; }
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


const html = (screen: Awaited<ReturnType<typeof render>>) => screen.getByTestId('rizline-best-image-html-preview-0').props.source.html as string;
beforeEach(() => { mockFiles.clear(); mockAccount = 'rizline:one'; mockPersist.mockClear(); });
afterEach(() => jest.restoreAllMocks());
it('previews Best40, selects independent signatures and resets selections on account change', async () => {
  const screen = await render(<RizlineBestImageScreen key={mockAccount} />);
  await screen.findByTestId('rizline-best-image-html-preview-0');
  expect(html(screen)).toContain('99.1234'); expect(html(screen)).toContain('AH5');
  await fireEvent.press(screen.getByText('签名1'));
  await fireEvent.press(screen.getAllByText('闪亮的').at(-1)!);
  await waitFor(() => expect(html(screen)).toContain('闪亮的'));
  await fireEvent.press(screen.getByText('签名2'));
  await fireEvent.press(screen.getAllByText('星星').at(-1)!);
  await waitFor(() => expect(html(screen)).toContain('闪亮的 星星'));
  await waitFor(() => expect(mockPersist).toHaveBeenCalledWith('rizline:one', expect.objectContaining({ signature1: 'bio.1.1', signature2: 'ach.1.title2' })));
  mockAccount = 'rizline:two'; await screen.rerender(<RizlineBestImageScreen key={mockAccount} />);
  await waitFor(() => expect(html(screen)).not.toContain('闪亮的 星星'));
});
it('keeps the avatar after canceling its crop and handles empty custom results', async () => {
  jest.spyOn(Image, 'getSize').mockImplementation(() => Promise.resolve({ width: 600, height: 600 }));
  const screen = await render(<RizlineBestImageScreen />);
  await screen.findByTestId('rizline-best-image-html-preview-0');
  await fireEvent.press(screen.getByText('头像'));
  await fireEvent.press(screen.getByText('调整当前头像'));
  await screen.findByText('裁剪头像'); mockPersist.mockClear();
  await fireEvent.press(screen.getByText('取消'));
  await act(async () => undefined); expect(mockPersist).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('头像'));
  await fireEvent.press(screen.getByText('调整当前头像'));
  await screen.findByText('裁剪头像');
  await fireEvent.press(screen.getByText('确定'));
  await waitFor(() => expect(mockPersist).toHaveBeenCalledWith('rizline:one', expect.objectContaining({ avatar: { songId: mockCatalog.songs[0].id, crop: { x: 0, y: 0, width: 1, height: 1 } } })));
  await screen.findByTestId('rizline-best-image-html-preview-0');
  await fireEvent.press(screen.getByLabelText('自定义'));
  await waitFor(() => expect(html(screen)).toContain('Best1'));
  await fireEvent.press(screen.getByLabelText('筛选难度 SP'));
  await screen.findAllByText('没有符合条件的成绩');
  expect(screen.getByLabelText('导出成绩图片').props.accessibilityState.disabled).toBe(true);
});
