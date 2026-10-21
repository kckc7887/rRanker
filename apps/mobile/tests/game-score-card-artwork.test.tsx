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
import { legacyFileSystem } from './remote-image-native-mock';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-file-system', () => jest.requireActual<typeof import('./remote-image-native-mock')>('./remote-image-native-mock').fileSystem);
jest.mock('expo-file-system/legacy', () => jest.requireActual<typeof import('./remote-image-native-mock')>('./remote-image-native-mock').legacyFileSystem);
jest.mock('expo-image', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const MockImage = (props: React.ComponentProps<typeof RN.Image>) => <RN.Image {...props} />;
  (MockImage as typeof MockImage & { clearDiskCache: () => boolean }).clearDiskCache = () => true;
  return { Image: MockImage };
});

const presentation = {
  key: 'score',
  gameId: 'maimai' as const,
  route: { songId: 'song', params: { gameId: 'maimai' as const } },
  title: 'Test Song',
  accessibilityLabel: '成绩 Test Song',
  primaryMetric: { key: 'score', label: 'Score', text: '100' },
  secondaryMetrics: [],
  difficulty: { key: 'difficulty', label: '难度', value: '1', tone: 'test' },
  achievementRows: [],
};

function Card({
  source = 'https://example.com/cover.jpg',
}: {
  source?: string | null;
}) {
  return (
    <AppThemeProvider>
      <ScoreCardArtworkScope>
        <GameScoreCard
          artwork={{ source, scale: 1.08 }}
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

  it('图片失败或来源缺失时回退原卡片', async () => {
    useThemeStore.setState({ scoreCardArtworkEnabled: true });
    const screen = await render(<Card />);
    fireEvent(screen.getByTestId('score-card-artwork'), 'error');
    await waitFor(() => expect(screen.queryByTestId('score-card-artwork')).toBeNull());
    await screen.rerender(<Card source={null} />);
    expect(screen.queryByTestId('score-card-artwork-overlay')).toBeNull();
  });

  it('缓存原图后断网重新打开仍显示同一曲绘', async () => {
    useThemeStore.setState({ scoreCardArtworkEnabled: true });
    const screen = await render(<Card />);
    await waitFor(() => expect(screen.getByTestId('score-card-artwork').props.source?.uri).toMatch(/^file:/u));
    const uri = screen.getByTestId('score-card-artwork').props.source.uri;
    await screen.unmount();
    const offline = jest.spyOn(legacyFileSystem, 'createDownloadResumable').mockImplementation(() => ({
      downloadAsync: async () => { throw new Error('offline'); },
      cancelAsync: async () => undefined,
    }));
    try {
      const reopened = await render(<Card />);
      await waitFor(() => expect(reopened.getByTestId('score-card-artwork').props.source?.uri).toBe(uri));
      await reopened.unmount();
    } finally { offline.mockRestore(); }
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
