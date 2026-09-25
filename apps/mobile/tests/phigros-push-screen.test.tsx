import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import PushRksToolScreen from '../app/tools/push-rks';
import { parsePhigrosPushChartCost, parsePhigrosPushDelta } from '@/domain/phigros-push';
import { PhigrosScoreProvider } from '@/providers/phigros-score-provider';
import { parseNumericInput } from '@/utils/numeric-input';

let lastQueryOptions: { enabled?: boolean } | null = null;
const mockScoreProvider = new PhigrosScoreProvider({
  mode: 'phi-session',
  sessionToken: 'token',
  playerId: 'player',
  persistable: true,
});

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: { enabled?: boolean }) => {
    lastQueryOptions = options;
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(async () => undefined),
    };
  },
}));
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', input: '#F1F3F5', border: '#DDD',
  text: '#111', textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF',
  danger: '#B42318', onAccent: '#FFF', dark: false,
}) }));
jest.mock('@/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({ data: undefined, isLoading: false, isError: false }),
}));
jest.mock('@/providers/phigros-score-provider', () => ({
  PhigrosScoreProvider: class PhigrosScoreProvider {
    getSaveUpdatedAt(): string | null { return null; }
  },
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({
    session: { mode: 'phi-session', sessionToken: 'token', playerId: 'player', persistable: true },
    activeAccountId: 'phigros:player',
    scoreProvider: mockScoreProvider,
  }),
}));

/** 页面是否放行查询：与领域侧解析函数对同一输入给出的结论逐条比对。 */
function domainAccepts(deltaText: string, chartCostText: string): boolean {
  return parsePhigrosPushDelta(parseNumericInput(deltaText)) != null
    && parsePhigrosPushChartCost(parseNumericInput(chartCostText)) != null;
}

describe('Phigros push screen input rules', () => {
  beforeEach(() => {
    lastQueryOptions = null;
    jest.clearAllMocks();
  });

  it('runs the query for the default legal input', async () => {
    const screen = await render(<PushRksToolScreen />);
    expect(lastQueryOptions?.enabled).toBe(true);
    expect(screen.queryByText(/加值至少为/)).toBeNull();
    expect(screen.queryByText(/成本须为/)).toBeNull();
  });

  it('applies the domain parsing rule to every input the user can type', async () => {
    const screen = await render(<PushRksToolScreen />);
    const deltaField = screen.getByLabelText('期望加值');
    const chartCostField = screen.getByLabelText('期望成本（张谱面）');
    const cases: readonly (readonly [string, string])[] = [
      ['0.01', '1'],
      ['0.01', '30'],
      ['0.1', '30'],
      ['0.015', '7'],
      ['0.014', '7'],
      ['1', '1'],
      ['0', '1'],
      ['-1', '1'],
      ['abc', '1'],
      ['', '1'],
      ['1e999', '1'],
      ['0.01', '0'],
      ['0.01', '-1'],
      ['0.01', '31'],
      ['0.01', '1.5'],
      ['0.01', 'abc'],
      ['0.01', '1e999'],
    ];
    for (const [deltaText, chartCostText] of cases) {
      await fireEvent.changeText(deltaField, deltaText);
      await fireEvent.changeText(chartCostField, chartCostText);
      expect({
        deltaText,
        chartCostText,
        enabled: lastQueryOptions?.enabled,
      }).toEqual({
        deltaText,
        chartCostText,
        enabled: domainAccepts(deltaText, chartCostText),
      });
    }
  });

  it('shows the range error instead of searching for illegal values', async () => {
    const screen = await render(<PushRksToolScreen />);
    const deltaField = screen.getByLabelText('期望加值');
    const chartCostField = screen.getByLabelText('期望成本（张谱面）');

    await fireEvent.changeText(deltaField, '0');
    expect(screen.getByText(/加值至少为 0\.01/)).toBeTruthy();
    expect(lastQueryOptions?.enabled).toBe(false);

    await fireEvent.changeText(deltaField, '0.01');
    expect(screen.queryByText(/加值至少为/)).toBeNull();
    expect(lastQueryOptions?.enabled).toBe(true);

    await fireEvent.changeText(chartCostField, '31');
    expect(screen.getByText(/成本须为 1–30 的整数/)).toBeTruthy();
    expect(lastQueryOptions?.enabled).toBe(false);

    await fireEvent.changeText(chartCostField, '30');
    expect(screen.queryByText(/成本须为/)).toBeNull();
    expect(lastQueryOptions?.enabled).toBe(true);
  });
});
