import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import PushRksToolScreen from '@rranker/tool-phigros/pages/push-rks';
import type { PushRecommendationsResult } from '@rranker/game-phigros/domain/phigros-push';
import type { PhigrosDataSource } from '@rranker/game-phigros/data-source';

type QueryOptions = { enabled?: boolean; queryFn: (context: { signal: AbortSignal }) => Promise<PushRecommendationsResult> };
let lastQueryOptions: QueryOptions | null = null;
const mockPush = jest.fn<NonNullable<PhigrosDataSource['getPushRecommendations']>>();
let mockSourceClient: Pick<PhigrosDataSource, 'getSaveUpdatedAt' | 'getPushRecommendations'> | undefined;

jest.mock('@tanstack/react-query', () => ({
  useQuery: (options: QueryOptions) => {
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
jest.mock('@rranker/sdk/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', input: '#F1F3F5', border: '#DDD',
  text: '#111', textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF',
  danger: '#B42318', onAccent: '#FFF', dark: false,
}) }));
jest.mock('@rranker/game-phigros/hooks/use-phigros-catalog', () => ({
  usePhigrosCatalog: () => ({ data: undefined, isLoading: false, isError: false }),
}));
jest.mock('@rranker/sdk/state/session-store', () => ({
  useSession: (selector: (state: unknown) => unknown) => selector({
    activeAccountId: 'phigros:player',
    activeProviderId: 'phi-taptap', sourceClient: mockSourceClient,
  }),
}));

describe('Phigros push screen input rules', () => {
  beforeEach(() => {
    lastQueryOptions = null;
    jest.clearAllMocks();
    mockSourceClient = { getSaveUpdatedAt: () => null, getPushRecommendations: mockPush };
  });

  it('runs the query for the default legal input', async () => {
    const screen = await render(<PushRksToolScreen />);
    expect(lastQueryOptions?.enabled).toBe(true);
    expect(screen.queryByText(/加值至少为/)).toBeNull();
    expect(screen.queryByText(/成本须为/)).toBeNull();
  });

  it('only accepts the documented delta and chart cost ranges', async () => {
    const screen = await render(<PushRksToolScreen />);
    const deltaField = screen.getByLabelText('期望加值');
    const chartCostField = screen.getByLabelText('期望成本（张谱面）');
    const cases: readonly (readonly [string, string, boolean])[] = [
      ['0.01', '1', true],
      ['0.01', '30', true],
      ['0.1', '30', true],
      ['0.015', '7', false],
      ['0.014', '7', false],
      ['1', '1', true],
      ['0', '1', false],
      ['-1', '1', false],
      ['abc', '1', false],
      ['', '1', false],
      ['1e999', '1', false],
      ['0.01', '0', false],
      ['0.01', '-1', false],
      ['0.01', '31', false],
      ['0.01', '1.5', false],
      ['0.01', 'abc', false],
      ['0.01', '1e999', false],
    ];
    for (const [deltaText, chartCostText, enabled] of cases) {
      await fireEvent.changeText(deltaField, deltaText);
      await fireEvent.changeText(chartCostField, chartCostText);
      expect({
        deltaText,
        chartCostText,
        enabled: lastQueryOptions?.enabled,
      }).toEqual({
        deltaText,
        chartCostText,
        enabled,
      });
    }
  });


  it('passes user inputs and cancellation to the available source capability', async () => {
    await render(<PushRksToolScreen />);
    const signal = new AbortController().signal;
    const result: PushRecommendationsResult = { currentRks: 15, displayRks: 15, exactTarget: 15.01, displayTarget: 15.01,
      chartCost: 1, gainNeeded: 0.01, perChartShare: 0.01, includePhi: true, searchStatus: 'not_found',
      combinationReachesTarget: false, plan: [], alternatives: [], recommendations: [] };
    mockPush.mockResolvedValueOnce(result);
    await expect(lastQueryOptions!.queryFn({ signal })).resolves.toBe(result);
    expect(mockPush).toHaveBeenCalledWith(0.01, 1, true, signal);
  });

  it('shows unavailable state when the source has no calculation capability', async () => {
    mockSourceClient = { getSaveUpdatedAt: () => null };
    const screen = await render(<PushRksToolScreen />);
    expect(screen.getByText('当前来源不支持推分计算')).toBeTruthy();
    expect(lastQueryOptions?.enabled).toBe(false);
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
