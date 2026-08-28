import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { AppThemeProvider } from '@/theme/app-theme';
import {
  GameScoreCard,
  ScoreCardArtworkScope,
} from '@/components/game-content/GameScoreCard';
import { useThemeStore } from '@/state/theme-store';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const MockImage = (props: React.ComponentProps<typeof RN.Image>) => <RN.Image {...props} />;
  // 暴露静态 clearDiskCache，让 RemoteImage 走原生能力分支（默认强制 memory、显式 none 放行）。
  (MockImage as typeof MockImage & { clearDiskCache: () => boolean }).clearDiskCache = () => true;
  return { Image: MockImage };
});

const presentation = {
  key: 'score',
  gameId: 'test' as const,
  route: { songId: 'song' },
  title: 'Test Song',
  accessibilityLabel: '成绩 Test Song',
  primaryMetric: { key: 'score', label: 'Score', text: '100' },
  secondaryMetrics: [],
  difficulty: { key: 'difficulty', label: '难度', value: '1', tone: 'test' },
  achievementRows: [],
};

function Card({
  source = 'https://example.com/cover.jpg',
  cachePolicy,
}: {
  source?: string | null;
  cachePolicy?: 'none';
}) {
  return (
    <AppThemeProvider>
      <ScoreCardArtworkScope>
        <GameScoreCard
          artwork={{ source, scale: 1.08, ...(cachePolicy ? { cachePolicy } : {}) }}
          cardStyle={{ borderRadius: 14, padding: 14 }}
          mainStyle={{ flex: 1 }}
          presentation={presentation}
          titleStyle={{ fontSize: 15 }}
        >
          <Text>content</Text>
        </GameScoreCard>
      </ScoreCardArtworkScope>
    </AppThemeProvider>
  );
}

describe('GameScoreCard 曲绘背景', () => {
  beforeEach(() => {
    useThemeStore.setState({
      appearance: 'light',
      scoreCardArtworkEnabled: false,
      scoreCardArtworkTransparency: 35,
      scoreCardArtworkBlur: 12,
    });
  });

  it('默认关闭且范围外不渲染曲绘', async () => {
    const screen = await render(<Card />);
    expect(screen.queryByTestId('score-card-artwork')).toBeNull();
  });

  it('使用模糊曲绘、反向遮罩透明度和矩形缩放背景', async () => {
    useThemeStore.setState({ scoreCardArtworkEnabled: true });
    const screen = await render(<Card />);
    expect(screen.getByTestId('score-card-artwork').props.blurRadius).toBe(12);
    expect(screen.getByTestId('score-card-artwork').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ transform: [{ scale: 1.08 }] }),
    ]));
    expect(screen.getByTestId('score-card-artwork-overlay').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ backgroundColor: 'rgba(255,255,255,0.65)' }),
    ]));
  });

  it('图片失败或来源缺失时回退原卡片', async () => {
    useThemeStore.setState({ scoreCardArtworkEnabled: true });
    const screen = await render(<Card />);
    fireEvent(screen.getByTestId('score-card-artwork'), 'error');
    await waitFor(() => expect(screen.queryByTestId('score-card-artwork')).toBeNull());
    await screen.rerender(<Card source={null} />);
    expect(screen.queryByTestId('score-card-artwork-overlay')).toBeNull();
  });

  it('支持深色遮罩与模糊、透明度边界', async () => {
    useThemeStore.setState({
      appearance: 'dark',
      scoreCardArtworkEnabled: true,
      scoreCardArtworkTransparency: 100,
      scoreCardArtworkBlur: 30,
    });
    const screen = await render(<Card />);
    expect(screen.getByTestId('score-card-artwork').props.blurRadius).toBe(30);
    expect(screen.getByTestId('score-card-artwork-overlay').props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ backgroundColor: 'rgba(0,0,0,0)' }),
    ]));
  });

  it('默认曲绘只进入内存缓存', async () => {
    useThemeStore.setState({ scoreCardArtworkEnabled: true });
    const screen = await render(<Card />);
    expect(screen.getByTestId('score-card-artwork').props.cachePolicy).toBe('memory');
  });

  it('曲绘显式声明 none 时完全跳过缓存', async () => {
    useThemeStore.setState({ scoreCardArtworkEnabled: true });
    const screen = await render(<Card cachePolicy="none" />);
    expect(screen.getByTestId('score-card-artwork').props.cachePolicy).toBe('none');
  });

  it('pressable=false 渲染非交互预览卡且按压不导航', async () => {
    useThemeStore.setState({ scoreCardArtworkEnabled: false });
    const screen = await render(
      <AppThemeProvider>
        <ScoreCardArtworkScope>
          <GameScoreCard
            cardStyle={{ borderRadius: 14, padding: 14 }}
            mainStyle={{ flex: 1 }}
            presentation={presentation}
            pressable={false}
            titleStyle={{ fontSize: 15 }}
          >
            <Text>content</Text>
          </GameScoreCard>
        </ScoreCardArtworkScope>
      </AppThemeProvider>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('成绩 Test Song')).toBeNull();
    fireEvent.press(screen.getByText('Test Song'));
    expect(router.push).not.toHaveBeenCalled();
  });
});
