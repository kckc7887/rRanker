import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { PixelRatio, Platform, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PhigrosBestImageScreen } from '@/screens/PhigrosBestImageScreen';

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props) };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///capture.png') }));
jest.mock('@/features/best-image/best-image-export', () => {
  const actual = jest.requireActual<typeof import('@/features/best-image/best-image-export')>('@/features/best-image/best-image-export');
  return {
    ...actual,
    requestBestImageExportPermission: jest.fn(async () => undefined),
    saveBestImageCapture: jest.fn(async () => undefined),
    deleteBestImageCapture: jest.fn(),
  };
});
jest.mock('@/features/best-image/prepare-best-image-webview-sources', () => ({
  prepareBestImageWebViewSources: (htmlPages: string[]) => ({
    sources: htmlPages.map((html) => ({ html, baseUrl: 'file:///reference/' })),
    dispose: jest.fn(),
  }),
}));
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
}));
jest.mock('@/domain/phigros-avatar-resolver', () => ({
  loadPhigrosAvatarCatalog: jest.fn(async () => ['avatar.test']),
}));
jest.mock('@/features/phigros-best-image/load-phigros-image-assets', () => ({
  loadPhigrosIllustrations: jest.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `data:image/png;base64,${id}`]))),
  loadRemoteImageDataUri: jest.fn(async () => 'data:image/png;base64,style'),
}));
jest.mock('@/features/phigros-best-image/load-phigros-acc-averages', () => ({
  loadPhigrosAccAverages: jest.fn(async () => ({})),
  phigrosAccAverageKey: (record: { songId: string; levelIndex: number }) => `${record.songId}:${record.levelIndex}`,
}));
jest.mock('@/features/phigros-best-image/load-phigros-reference-template-assets', () => ({
  getPhigrosReferenceAvatarKeys: () => ['Introduction', 'avatar.test'],
  getPhigrosReferenceAvatarSource: () => 1,
  findPhigrosReferenceAvatarKey: (key: string) => key,
  loadPhigrosReferenceAvatarUrl: jest.fn(async () => 'data:image/png;base64,avatar'),
  loadPhigrosReferenceTemplateAssets: jest.fn(async () => ({
    css: '@font-face{font-family:"PHI";src:url("file:///reference/phi.ttf")} .song{width:360px}.Rating img{width:100%}',
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
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: (() => {
    const result = { data: {
      provider: {
        getGameVersion: jest.fn(async () => '3.16.1'),
        getAvatarUrl: (key: string) => `https://example.test/avatar/${key}.png`,
        getIllustrationUrl: (id: string) => `https://example.test/illustration/${id}.png`,
        getIllustrationBlurUrl: (id: string) => `https://example.test/illustration/${id}.png`,
      },
      snapshot: { songs: [{ id: 'song-1', title: '测试曲目' }] },
    } };
    return () => result;
  })(),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: (() => {
    const result = {
    activeAccountId: 'phi-account',
    isLoading: false,
    data: {
      payload: {
        kind: 'phigros',
        player: { displayName: 'Phi 测试玩家' },
        playerScore: { value: 15.4321, display: '15.4321' },
        challengeModeRank: 23,
        source: { updatedAt: '2026-07-22T08:00:00.000Z' },
        saveUpdatedAt: '2026-07-22T08:00:00.000Z',
        dataAmount: '386MiB 289KiB',
        progress: { cleared: [1, 2, 3, 4], fullCombo: [1, 1, 1, 1], phi: [0, 0, 1, 1] },
        avatarKey: 'avatar.test',
        backgroundSongId: 'song-1',
        avatarUrl: 'https://example.test/avatar/current.png',
        records: [{ songId: 'song-1', title: '测试曲目', type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert', difficultyConstant: 14, achievements: 99.5, dxScore: 995000, rating: 13.2, fc: 'fc', fs: null, rate: 'v', version: 'current' }],
        bestSections: [{ id: 'phi3', title: 'Phi3', records: [{ songId: 'song-1', title: '测试曲目', type: 'SD', levelIndex: 2, level: 'IN', difficulty: 'expert', difficultyConstant: 14, achievements: 99.5, dxScore: 995000, rating: 13.2, fc: 'fc', fs: null, rate: 'v', version: 'current' }] }],
      },
    } };
    return () => result;
  })(),
}));

describe('Phigros 生成图片页', () => {
  it('沿用舞萌板块的页面顺序、控件样式和预览导出布局', async () => {
    const { captureRef } = jest.requireMock('react-native-view-shot') as { captureRef: jest.Mock };
    const { requestBestImageExportPermission } = jest.requireMock('@/features/best-image/best-image-export') as { requestBestImageExportPermission: jest.Mock };
    captureRef.mockClear();
    requestBestImageExportPermission.mockClear();
    const screen = await render(<SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}><PhigrosBestImageScreen /></SafeAreaProvider>);
    expect(screen.getByLabelText('Best30').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('自定义').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByText('样式选择')).toBeTruthy();
    expect(screen.getByLabelText('选择头像')).toBeTruthy();
    expect(screen.getByLabelText('选择背景')).toBeTruthy();
    expect(screen.getByLabelText('0 个').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('宽度 1080 像素').props.accessibilityState).toEqual({ selected: true });

    const preview = await screen.findByTestId('phigros-best-image-html-preview-0');
    expect(preview.props.source.html).toContain('class="playerInfo"');
    expect(preview.props.source.html).toContain('class="song phi_song"');
    expect(preview.props.source.html).toContain('data:image/png;base64,avatar');
    expect(preview.props.source.html).toContain('data:image/png;base64,FC');
    expect(preview.props.source.html).toContain('file:///reference/phi.ttf');
    expect(preview.props.source.html).not.toContain('file:///reference/avatar.png');
    expect(preview.props.source.baseUrl).toBe('file:///reference/');
    expect(preview.props.allowingReadAccessToURL).toBe('file:///reference/');
    expect(screen.getByLabelText('导出成绩图片')).toBeTruthy();
    expect(screen.getByTestId('phigros-best-image-webview-status')).toBeTruthy();

    fireEvent(preview, 'message', { nativeEvent: { data: JSON.stringify({
      type: 'best-image-height', width: 1080, height: 1215,
    }) } });
    await waitFor(() => expect(screen.getByText(/1080 × 1215 px/u)).toBeTruthy());
    const previewFrameStyle = screen.getByLabelText('HTML图片预览窗').props.style[1];
    expect(previewFrameStyle.height).toBeCloseTo(previewFrameStyle.width * 4 / 3);
    fireEvent(preview, 'message', { nativeEvent: { data: JSON.stringify({
      type: 'best-image-height', width: 1080, height: 1400,
    }) } });
    await waitFor(() => expect(screen.getByText(/1080 × 1400 px/u)).toBeTruthy());

    fireEvent.press(screen.getByLabelText('导出成绩图片'));
    await waitFor(() => expect(requestBestImageExportPermission).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText('正在导出 1/1')).toHaveLength(2));
    const renderer = await screen.findByLabelText('导出渲染 第1页');
    await act(async () => {
      fireEvent(renderer, 'message', { nativeEvent: { data: JSON.stringify({
        type: 'best-image-height', width: 1080, height: 1500,
      }) } });
      fireEvent(renderer, 'message', { nativeEvent: { data: JSON.stringify({
        type: 'best-image-ready', width: 1080, height: 1666,
      }) } });
    });

    await waitFor(() => expect(StyleSheet.flatten(screen.getByLabelText('导出画布 第1页').props.style).height).toBeCloseTo(1666 / PixelRatio.get()));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 360)); });
    const expectedWidth = Platform.OS === 'ios' ? 1080 / PixelRatio.get() : 1080;
    const expectedHeight = Platform.OS === 'ios' ? 1666 / PixelRatio.get() : 1666;
    await waitFor(() => expect(captureRef).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      width: expectedWidth,
      height: expectedHeight,
      format: 'png',
    })));

    fireEvent.press(screen.getByLabelText('自定义'));
    expect(screen.queryByText('自定义 BestN')).toBeNull();
    expect(screen.queryByLabelText('自定义数量')).toBeNull();
    expect(screen.queryByLabelText('最小定数')).toBeNull();
    expect(screen.queryByLabelText('最大Acc')).toBeNull();

    fireEvent.press(screen.getByLabelText('选择头像'));
    await waitFor(() => expect(screen.getByLabelText('使用玩家当前头像')).toBeTruthy());
    expect(screen.getByLabelText('搜索头像')).toBeTruthy();
    expect(screen.getByLabelText('avatar.test，头像')).toBeTruthy();
    expect(screen.getByLabelText('随机头像')).toBeTruthy();
    expect(screen.getByLabelText('关闭头像')).toBeTruthy();
  });
});
