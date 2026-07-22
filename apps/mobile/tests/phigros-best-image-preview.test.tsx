import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { PhigrosBestImageScreen } from '@/screens/PhigrosBestImageScreen';

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props) };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///capture.png') }));
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
jest.mock('@/features/phigros-best-image/phigros-best-image-preferences', () => ({
  phigrosBestImagePreferencesStore: {
    load: jest.fn(async () => ({ version: 1, avatar: { mode: 'current' }, background: { mode: 'current' } })),
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
        playerScore: { display: '15.4321' },
        challengeModeRank: 23,
        source: { updatedAt: '2026-07-22T08:00:00.000Z' },
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
    const screen = await render(<PhigrosBestImageScreen />);
    expect(screen.getByLabelText('Best30').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('自定义').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByText('样式选择')).toBeTruthy();
    expect(screen.getByLabelText('选择头像')).toBeTruthy();
    expect(screen.getByLabelText('选择背景')).toBeTruthy();
    expect(screen.getByLabelText('宽度 1080 像素').props.accessibilityState).toEqual({ selected: true });

    const preview = await screen.findByTestId('phigros-best-image-html-preview-0');
    expect(preview.props.source.html).toContain('class="playerInfo"');
    expect(preview.props.source.html).toContain('class="song phi_song"');
    expect(screen.getByLabelText('导出成绩图片')).toBeTruthy();
    expect(screen.getByTestId('phigros-best-image-webview-status')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('自定义'));
    await waitFor(() => expect(screen.getByText('自定义 BestN')).toBeTruthy());
    expect(screen.getByLabelText('自定义数量')).toBeTruthy();
    expect(screen.getByLabelText('最小定数')).toBeTruthy();
    expect(screen.getByLabelText('最大Acc')).toBeTruthy();
  });
});
