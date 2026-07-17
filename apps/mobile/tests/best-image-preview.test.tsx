import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { PixelRatio, Platform, StyleSheet } from 'react-native';
import BestImageScreen from '../app/best-image';

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props) };
});
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => 'file:///capture.png') }));
jest.mock('@/features/best-image/best-image-style-preferences', () => ({
  bestImageStylePreferencesStore: {
    load: jest.fn(async () => ({ version: 2, selections: {}, ratingStyle: 'game' })),
    save: jest.fn(async () => undefined),
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
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    activeAccountId: 'test-account',
    data: {
      payload: {
        kind: 'maimai',
        player: {
          displayName: '测试玩家',
          presentation: { iconId: 200201, namePlateId: 300101, frameId: 350101, trophyName: '测试称号', trophyColor: 'Gold' },
        },
        playerScore: { value: 15001 },
        currentVersionTitle: '当前版本',
        records: [
          {
            songId: '11447', title: 'B35测试曲', type: 'DX', levelIndex: 3, level: '13+',
            difficulty: 'master', difficultyConstant: 13.8, achievements: 100, dxScore: 1836,
            rating: 298, fc: 'fcp', fs: 'fsd', rate: 'sss', version: '旧版本',
            notes: { tap: 300, hold: 80, slide: 200, touch: 20, break: 90, total: 690 },
          },
          {
            songId: '11448', title: 'B15测试曲', type: 'SD', levelIndex: 2, level: '12',
            difficulty: 'expert', difficultyConstant: 12.5, achievements: 99.5, dxScore: 1500,
            rating: 250, fc: null, fs: 'fs', rate: 'ssp', version: '当前版本',
            notes: { tap: 260, hold: 60, slide: 140, touch: 0, break: 40, total: 500 },
          },
        ],
        bestSections: [
          { id: 'b35', title: '过往版本 Best35', records: [{
            songId: '11447', title: 'B35测试曲', type: 'DX', levelIndex: 3, level: '13+',
            difficulty: 'master', difficultyConstant: 13.8, achievements: 100, dxScore: 1836,
            rating: 298, fc: 'fcp', fs: 'fsd', rate: 'sss', version: '旧版本',
            notes: { tap: 300, hold: 80, slide: 200, touch: 20, break: 90, total: 690 },
          }] },
          { id: 'b15', title: '当前版本 Best15', records: [{
            songId: '11448', title: 'B15测试曲', type: 'SD', levelIndex: 2, level: '12',
            difficulty: 'expert', difficultyConstant: 12.5, achievements: 99.5, dxScore: 1500,
            rating: 250, fc: null, fs: 'fs', rate: 'ssp', version: '当前版本',
            notes: { tap: 260, hold: 60, slide: 140, touch: 0, break: 40, total: 500 },
          }] },
        ],
      },
    },
  }),
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

describe('best image preview', () => {
  it('switches image type and renders the HTML preview', async () => {
    const screen = await render(<BestImageScreen />);
    const best50 = screen.getByLabelText('Best50');
    const custom = screen.getByLabelText('自定义');

    expect(best50.props.accessibilityState).toEqual({ selected: true });
    expect(custom.props.accessibilityState).toEqual({ selected: false });
    await waitFor(() => expect(screen.getByLabelText('HTML图片预览窗')).toBeTruthy());
    const best50Html = screen.getByTestId('best-image-html-preview-0').props.source.html;
    expect(best50Html).toContain('测试玩家');
    expect(best50Html).toContain('过往版本 Best35');
    expect(best50Html).toContain('当前版本 Best15');
    expect(best50Html).toContain('B35测试曲');

    await fireEvent.press(custom);
    expect(screen.getByLabelText('Best50').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByLabelText('自定义').props.accessibilityState).toEqual({ selected: true });
    await waitFor(() => {
      const customHtml = screen.getByTestId('best-image-html-preview-0').props.source.html;
      expect(customHtml).toContain('B35测试曲');
      expect(customHtml).toContain('B15测试曲');
      expect(customHtml).toContain('<div class="section-divider"><span>Best2</span></div>');
    });
  });

  it('switches Rating frames between game, app capsule and app rectangle', async () => {
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy());
    expect(screen.getByLabelText('游戏样式').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('best-image-html-preview-0').props.source.html).toContain('class="rating rating-game"');

    await fireEvent.press(screen.getByLabelText('应用样式'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0').props.source.html)
      .toContain('class="rating rating-app rating-app-capsule"'));
    expect(screen.getByLabelText('胶囊').props.accessibilityState).toMatchObject({ selected: true });

    await fireEvent.press(screen.getByLabelText('圆角矩形'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0').props.source.html)
      .toContain('class="rating rating-app rating-app-rect"'));
  });

  it('uses the independent near-miss chip in custom image titles', async () => {
    const screen = await render(<BestImageScreen />);
    await fireEvent.press(screen.getByLabelText('自定义'));
    await fireEvent.press(screen.getByLabelText('寸筛选'));
    await waitFor(() => {
      const html = screen.getByTestId('best-image-html-preview-0').props.source.html;
      expect(html).toContain('<div class="section-divider"><span>寸Best0</span></div>');
    });
  });

  it('changes output resolution without changing the fitted preview window', async () => {
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy(), { timeout: 3000 });
    const initialPreviewHeight = StyleSheet.flatten(screen.getByLabelText('HTML图片预览窗').props.style).height;
    expect(screen.queryByLabelText('图片高度')).toBeNull();

    await fireEvent.press(screen.getByLabelText('宽度 1440 像素'));
    const nextPreviewHeight = StyleSheet.flatten(screen.getByLabelText('HTML图片预览窗').props.style).height;
    expect(nextPreviewHeight).toBe(initialPreviewHeight);
    expect(screen.getByText('1440 × 1920 px · 每页最多 28 行 · 第 1/1 页')).toBeTruthy();

    await fireEvent(screen.getByTestId('best-image-html-preview-0'), 'message', {
      nativeEvent: { data: JSON.stringify({ type: 'best-image-height', width: 1440, height: 2880 }) },
    });
    expect(screen.getByText('1440 × 2880 px · 每页最多 28 行 · 第 1/1 页')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByLabelText('HTML图片预览窗').props.style).height).toBe(initialPreviewHeight);
  });

  it('shows the WebView version and rendering status below the export button', async () => {
    const screen = await render(<BestImageScreen />);
    const preview = await screen.findByTestId('best-image-html-preview-0');
    expect(screen.getByTestId('best-image-webview-status').props.children).toBe('WebView 版本未知 · 正在加载');

    await act(async () => {
      fireEvent(preview, 'message', {
        nativeEvent: {
          data: JSON.stringify({
            type: 'best-image-runtime',
            width: 1080,
            userAgent: 'Mozilla/5.0 AppleWebKit/537.36 Chrome/132.0.6834.79 Mobile Safari/537.36',
          }),
        },
      });
      fireEvent(preview, 'message', {
        nativeEvent: { data: JSON.stringify({ type: 'best-image-ready', width: 1080, height: 1440 }) },
      });
    });

    expect(screen.getByTestId('best-image-webview-status').props.children).toBe('WebView 132.0.6834.79 · 渲染就绪');
    await act(async () => {
      fireEvent(preview, 'renderProcessGone', { nativeEvent: { didCrash: true } });
    });
    expect(screen.getByTestId('best-image-webview-status').props.children).toBe('WebView 132.0.6834.79 · 渲染进程崩溃');
  });

  it('selects LXNS icon, plate, trophy and frame and applies them to the HTML preview', async () => {
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy());
    expect(screen.getByText('样式选择')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('选择头像'));
    await waitFor(() => expect(screen.getByLabelText('示例头像，#9001')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例头像，#9001'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0').props.source.html)
      .toContain('https://assets2.lxns.net/maimai/icon/9001.png'));

    fireEvent.press(screen.getByLabelText('选择姓名框'));
    await waitFor(() => expect(screen.getByLabelText('示例姓名框，#9002')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例姓名框，#9002'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0').props.source.html)
      .toContain('https://assets2.lxns.net/maimai/plate/9002.png'));

    await fireEvent.press(screen.getByLabelText('选择称号'));
    await waitFor(() => expect(screen.getByLabelText('示例称号，#9003')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例称号，#9003'));
    await waitFor(() => {
      const html = screen.getByTestId('best-image-html-preview-0').props.source.html;
      expect(html).toContain('示例称号');
      expect(html).toContain('class="trophy gold"');
    });

    fireEvent.press(screen.getByLabelText('选择背景'));
    await waitFor(() => expect(screen.getByLabelText('示例背景，#9004')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例背景，#9004'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0').props.source.html)
      .toContain('https://assets2.lxns.net/maimai/frame/9004.png'));
  });

  it('filters trophy levels and supports random or disabled styles', async () => {
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('选择称号'));
    await waitFor(() => expect(screen.getByLabelText('筛选称号等级 金')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('筛选称号等级 金'));
    await waitFor(() => {
      expect(screen.getByLabelText('示例称号，#9003')).toBeTruthy();
      expect(screen.queryByLabelText('铜牌称号，#9005')).toBeNull();
    });
    await fireEvent.press(screen.getByLabelText('示例称号，#9003'));
    await waitFor(() => expect(screen.queryByLabelText('关闭收藏品选择器')).toBeNull());

    await fireEvent.press(screen.getByLabelText('选择背景'));
    await waitFor(() => expect(screen.getByLabelText('随机背景')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('随机背景'));
    await waitFor(() => {
      expect(screen.getByText('随机 · 示例背景')).toBeTruthy();
      expect(screen.getByTestId('best-image-html-preview-0').props.source.html)
        .toContain('https://assets2.lxns.net/maimai/frame/9004.png');
    });

    await fireEvent.press(screen.getByLabelText('选择姓名框'));
    await waitFor(() => expect(screen.getByLabelText('关闭姓名框')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('关闭姓名框'));
    await waitFor(() => {
      const html = screen.getByTestId('best-image-html-preview-0').props.source.html;
      expect(screen.getAllByText('已关闭')).toHaveLength(2);
      expect(html).toContain('class="profile-banner no-plate"');
      expect(html).not.toContain('https://assets2.lxns.net/maimai/plate/300101.png');
    });
  });

  it('keeps the last valid custom preview and disables export for invalid input', async () => {
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy(), { timeout: 3000 });
    fireEvent.press(screen.getByLabelText('自定义'));
    await waitFor(() => expect(screen.getByLabelText('自定义数量')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy(), { timeout: 3000 });
    const validHtml = screen.getByTestId('best-image-html-preview-0').props.source.html;

    await act(async () => { screen.getByLabelText('自定义数量').props.onChangeText('-1'); });
    await waitFor(() => expect(screen.getByText('数量必须是非负整数，0 表示不限制')).toBeTruthy());
    expect(screen.getByLabelText('导出成绩图片').props.accessibilityState).toEqual({ disabled: true });
    expect(screen.getByTestId('best-image-html-preview-0').props.source.html).toBe(validHtml);

    await act(async () => { screen.getByLabelText('自定义数量').props.onChangeText('0'); });
    await waitFor(() => expect(screen.queryByText('数量必须是非负整数，0 表示不限制')).toBeNull());
    expect(screen.getByLabelText('导出成绩图片').props.accessibilityState).toEqual({ disabled: false });
  });

  it('captures the export renderer at the selected pixel dimensions', async () => {
    const { captureRef } = jest.requireMock('react-native-view-shot') as { captureRef: jest.Mock };
    captureRef.mockClear();
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview-0')).toBeTruthy(), { timeout: 3000 });

    await act(async () => { fireEvent.press(screen.getByLabelText('导出成绩图片')); });
    const renderer = await screen.findByLabelText('导出渲染 第1页');
    await act(async () => {
      fireEvent(renderer, 'message', {
        nativeEvent: { data: JSON.stringify({ type: 'best-image-ready', width: 1080, height: 1440 }) },
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
    });

    const expectedWidth = Platform.OS === 'ios' ? 1080 / PixelRatio.get() : 1080;
    const expectedHeight = Platform.OS === 'ios' ? 1440 / PixelRatio.get() : 1440;
    await waitFor(() => expect(captureRef).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      width: expectedWidth,
      height: expectedHeight,
      format: 'png',
    })));
  });
});
