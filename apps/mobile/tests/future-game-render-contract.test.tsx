import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Text as RNText } from 'react-native';
import { BestListPage } from '@/components/game-content/GameListPages';
import { GameChartResultCard } from '@/components/game-content/GameChartResultCard';
import { GameNoteTable } from '@/components/game-content/GameNoteTable';
import { GameScoreCard } from '@/components/game-content/GameScoreCard';
import { GameSongRow } from '@/components/game-content/GameSongRow';
import type {
  ChartCardPresentation,
  ScoreCardPresentation,
  SongRowPresentation,
} from '@/features/game-content/presentation';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', border: '#DDD', text: '#111',
  textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF',
}) }));

/** 虚构游戏：不在当前正式游戏列表内，共享组件必须零改动渲染它。 */
const futureScore: ScoreCardPresentation<'future-game'> = {
  key: 'future:1:2',
  gameId: 'future-game',
  route: { songId: 'future:1', levelIndex: 2 },
  position: 1,
  title: '未来歌曲',
  accessibilityLabel: '查看谱面 未来歌曲',
  primaryMetric: { key: 'score', label: 'Score', text: '123,456' },
  secondaryMetrics: [{ key: 'rank', label: '评级', text: 'S', tone: 'future-rank' }],
  difficulty: { key: 'difficulty', label: '未来难度', value: '12', tone: 'future-diff' },
  grade: { key: 'grade', label: 'FUTURE', tone: 'future-grade' },
  achievementRows: [[{ key: 'combo', label: 'FULL COMBO', tone: 'combo' }]],
};

const futureSong: SongRowPresentation<'future-game'> = {
  key: 'future:1',
  gameId: 'future-game',
  route: { songId: 'future:1' },
  title: '未来歌曲',
  subtitle: '未来曲师 · 未来专辑',
  accessibilityLabel: '打开歌曲 未来歌曲',
  chartBadges: [{ key: 'future:1:2', label: '未来难度', value: '12.5', tone: 'future-diff' }],
};

const futureChart: ChartCardPresentation<'future-game'> = {
  key: 'future:1:2',
  gameId: 'future-game',
  route: { songId: 'future:1', levelIndex: 2 },
  difficulty: { key: 'difficulty', label: '未来难度', value: '12', tone: 'future-diff' },
  primaryMetric: { key: 'score', label: 'Score', text: '—' },
  secondaryMetrics: [],
  grade: undefined,
  achievementRows: [],
  charter: '未来谱师',
  notes: [{
    key: 'notes',
    values: [
      { key: 'tap', label: 'TAP', value: 100 },
      { key: 'hold', label: 'HOLD', value: 20 },
      { key: 'total', label: '总计', value: 120 },
    ],
  }],
};

describe('future game render contract', () => {
  it('renders score cards, song rows, best sections and detail chart cards without shared changes', async () => {
    const score = await render(<GameScoreCard presentation={futureScore} testID="future-score-card"
      cardStyle={{}} mainStyle={{}} titleStyle={{}} side={<></>}>
      <RNText>{futureScore.primaryMetric.text}</RNText>
    </GameScoreCard>);
    expect(score.getByText(/未来歌曲/)).toBeTruthy();
    expect(score.getByText('123,456')).toBeTruthy();

    const row = await render(<GameSongRow presentation={futureSong} testID="future-song-row"
      rowStyle={{}} mainStyle={{}} titleStyle={{}} subtitleStyle={{}} cover={<></>} badges={<></>} />);
    expect(row.getByText('未来歌曲')).toBeTruthy();

    const best = await render(<BestListPage<unknown, { id: string; title: string; data: unknown[] }>
      isLoading={false} isError={false} isEmpty={false} error={null} onRetry={() => undefined}
      emptyText="空" data={[{ id: 'future-best', title: 'Future Best', data: [futureScore] }]}
      sectionListProps={{
        keyExtractor: () => 'future-key',
        renderItem: () => <GameScoreCard presentation={futureScore} cardStyle={{}} mainStyle={{}} titleStyle={{}}>
          <RNText>{futureScore.primaryMetric.text}</RNText>
        </GameScoreCard>,
        renderSectionHeader: ({ section }) => <RNText>{section.title}</RNText>,
      }} />);
    expect(best.getByText('Future Best')).toBeTruthy();
    expect(best.getByText(/未来歌曲/)).toBeTruthy();

    const chart = await render(<GameChartResultCard testID="future-chart-card" style={{}}>
      <RNText>{futureChart.charter}</RNText>
      {futureChart.notes.map((group) => <GameNoteTable key={group.key} mode="cells" group={group}
        containerStyle={{}} itemStyle={{}} labelStyle={{}} valueStyle={{}} />)}
    </GameChartResultCard>);
    expect(chart.getByText('未来谱师')).toBeTruthy();
    expect(chart.getByText('TAP')).toBeTruthy();
    expect(chart.getByText('总计')).toBeTruthy();
  });
});
