import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import BestImageScreen from '../app/best-image';

jest.mock('react-native-webview', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ReactNative = jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: (props: Record<string, unknown>) => React.createElement(ReactNative.View, props) };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/hooks/use-game-data', () => ({
  useGameData: () => ({
    data: {
      payload: {
        kind: 'maimai',
        player: {
          displayName: '测试玩家',
          presentation: { iconId: 200201, namePlateId: 300101, frameId: 350101, trophyName: '测试称号', trophyColor: 'Gold' },
        },
        playerScore: { value: 15001 },
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
jest.mock('@/features/best-image/use-best-image-collections', () => ({
  useBestImageCollections: () => ({
    data: {
      items: [
        { id: 9001, kind: 'icon', name: '示例头像', requirements: [] },
        { id: 9002, kind: 'plate', name: '示例姓名框', requirements: [] },
        { id: 9003, kind: 'trophy', name: '示例称号', color: 'Gold', requirements: [] },
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
    expect(screen.getByTestId('best-image-html-preview').props.source.html).toContain('测试玩家');

    await fireEvent.press(custom);
    expect(screen.getByLabelText('Best50').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByLabelText('自定义').props.accessibilityState).toEqual({ selected: true });
  });

  it('changes output resolution without changing the fitted preview window', async () => {
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview')).toBeTruthy());
    const initialPreviewHeight = StyleSheet.flatten(screen.getByLabelText('HTML图片预览窗').props.style).height;
    expect(screen.queryByLabelText('图片高度')).toBeNull();

    await fireEvent.press(screen.getByLabelText('宽度 1440 像素'));
    const nextPreviewHeight = StyleSheet.flatten(screen.getByLabelText('HTML图片预览窗').props.style).height;
    expect(nextPreviewHeight).toBe(initialPreviewHeight);
    expect(screen.getByText('1440 × 1920 px · 高度随内容自动增长')).toBeTruthy();

    await fireEvent(screen.getByTestId('best-image-html-preview'), 'message', {
      nativeEvent: { data: JSON.stringify({ type: 'best-image-height', width: 1440, height: 2880 }) },
    });
    expect(screen.getByText('1440 × 2880 px · 高度随内容自动增长')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByLabelText('HTML图片预览窗').props.style).height).toBe(initialPreviewHeight);
  });

  it('selects LXNS icon, plate, trophy and frame and applies them to the HTML preview', async () => {
    const screen = await render(<BestImageScreen />);
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview')).toBeTruthy());
    expect(screen.getByText('样式选择')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('选择头像'));
    await waitFor(() => expect(screen.getByLabelText('示例头像，#9001')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例头像，#9001'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview').props.source.html)
      .toContain('https://assets2.lxns.net/maimai/icon/9001.png'));

    fireEvent.press(screen.getByLabelText('选择姓名框'));
    await waitFor(() => expect(screen.getByLabelText('示例姓名框，#9002')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例姓名框，#9002'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview').props.source.html)
      .toContain('https://assets2.lxns.net/maimai/plate/9002.png'));

    fireEvent.press(screen.getByLabelText('选择称号'));
    await waitFor(() => expect(screen.getByLabelText('示例称号，#9003')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例称号，#9003'));
    await waitFor(() => {
      const html = screen.getByTestId('best-image-html-preview').props.source.html;
      expect(html).toContain('示例称号');
      expect(html).toContain('class="trophy gold"');
    });

    fireEvent.press(screen.getByLabelText('选择背景'));
    await waitFor(() => expect(screen.getByLabelText('示例背景，#9004')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('示例背景，#9004'));
    await waitFor(() => expect(screen.getByTestId('best-image-html-preview').props.source.html)
      .toContain('https://assets2.lxns.net/maimai/frame/9004.png'));
  });
});
