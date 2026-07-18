import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import RatingToolScreen from '../app/tools/rating';
import ToleranceToolScreen from '../app/tools/tolerance';
import PlatesToolScreen from '../app/tools/plates';
import VersionsToolScreen from '../app/tools/versions';
import type { DataSource, PlateSnapshot } from '@/domain/models';

let mockToleranceParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() }, useLocalSearchParams: () => mockToleranceParams }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockSource: DataSource = { kind: 'fixture', label: '测试来源', updatedAt: '2026-07-13T00:00:00.000Z', isStale: false };
let mockPlateQuery: { data?: PlateSnapshot; isLoading: boolean; isError: boolean; error: unknown; refetch: ReturnType<typeof jest.fn> } = {
  data: { plates: [
    { id: 6101, name: '真極', requirements: [{ difficulties: [], rate: 's', songs: ['1'] }] },
    { id: 6102, name: '真神', requirements: [{ difficulties: [], fc: 'ap', songs: ['1'] }] },
  ], source: mockSource },
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
};
jest.mock('@/hooks/use-plates', () => ({ usePlates: () => mockPlateQuery }));
jest.mock('@/hooks/use-songs', () => ({ useSongs: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: jest.fn() }) }));
jest.mock('@/components/PlateImage', () => ({ PlateImage: () => null }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({ data: jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized').fixtureCatalog, isLoading: false, isError: false, error: null, refetch: jest.fn() }) }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => { const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized'); return { data: { records: fixtures.fixtureRecords, source: fixtures.fixtureSource, best50: { b35: [], b15: [] } }, isLoading: false, isError: false, error: null, refetch: jest.fn() }; } }));
const mockTogglePinnedPlate = jest.fn(async () => undefined);
let mockPinnedPlateIds: number[] = [];
jest.mock('@/components/AppNotification', () => ({
  useNotification: () => ({ showNotification: jest.fn(), showActionNotification: jest.fn() }),
}));
jest.mock('@/state/session-store', () => ({
  useSession: (selector: (state: { activeGameId: 'maimai' }) => unknown) => selector({ activeGameId: 'maimai' }),
}));
jest.mock('@/state/toolbox-pins', () => ({
  useToolboxPins: (selector: (state: unknown) => unknown) => selector({
    pinnedPlateIdsByGame: { maimai: mockPinnedPlateIds, phigros: [], test: [] },
    hydrate: jest.fn(async () => undefined),
    togglePinnedPlate: mockTogglePinnedPlate,
  }),
}));

describe('M2 tool screens', () => {
  beforeEach(() => {
    mockToleranceParams = {};
    mockPinnedPlateIds = [];
    mockTogglePinnedPlate.mockClear();
  });
  it('calculates rating and reverse target interactively', async () => {
    const screen = await render(<RatingToolScreen />);
    expect(screen.getByText(/单曲 Rating/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('定数'), '15.1');
    expect(screen.getByText(/不超过 15/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('定数'), '13.4');
    await fireEvent.changeText(screen.getByLabelText('达成率 (%)'), '100.6');
    expect(screen.getByText(/Rating 在 100.5% 封顶/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('达成率 (%)'), '101.1');
    expect(screen.getByText(/理论最高 101%/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('目标 Rating（整数）'), '9999');
    expect(screen.getByText(/无法达到/)).toBeTruthy();
  });
  it('shows tolerance result and invalid zero-total error', async () => {
    const screen = await render(<ToleranceToolScreen />);
    expect(screen.getAllByText(/预计达成率/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('物量分析表')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('物量分析模式 0%+'));
    expect(screen.getByLabelText('TAP GREAT 0%+')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('目标达成率 100.5%'));
    expect(screen.getByLabelText('目标达成率').props.value).toBe('100.5');
    expect(screen.getByLabelText('容错计算表')).toBeTruthy();
    expect(screen.getAllByText('↔ 左右滑动查看完整表格')).toHaveLength(2);
    for (const label of ['TAP', 'HOLD', 'SLIDE', 'TOUCH', 'BREAK']) await fireEvent.changeText(screen.getByLabelText(label), '0');
    expect(screen.getAllByText(/总物量不能为零/).length).toBeGreaterThan(0);
  });
  it('fills chart note counts from song-detail route parameters', async () => {
    mockToleranceParams = { tap: '321', hold: '45', slide: '67', touch: '89', break: '10' };
    const screen = await render(<ToleranceToolScreen />);
    expect(screen.getByLabelText('TAP').props.value).toBe('321');
    expect(screen.getByLabelText('HOLD').props.value).toBe('45');
    expect(screen.getByLabelText('SLIDE').props.value).toBe('67');
    expect(screen.getByLabelText('TOUCH').props.value).toBe('89');
    expect(screen.getByLabelText('BREAK').props.value).toBe('10');
  });
  it('renders local plate progress and version comparison', async () => {
    expect((await render(<PlatesToolScreen />)).getAllByText('真極').length).toBeGreaterThan(0);
    const versions = await render(<VersionsToolScreen />);
    expect(versions.getByText('版本名称对照')).toBeTruthy();
    expect(versions.getByText('国服')).toBeTruthy();
    expect(versions.getByText('日服')).toBeTruthy();
    expect(versions.getByText('版本代号')).toBeTruthy();
    expect(versions.queryByText(/LXNS|水鱼/)).toBeNull();
    expect(versions.getByLabelText('舞萌DX 2026 国服 Logo')).toBeTruthy();
    expect(versions.getByLabelText('maimai でらっくす PRiSM PLUS 日服 Logo')).toBeTruthy();
    expect(versions.getByLabelText('maimai 版本代号 真')).toBeTruthy();
    expect(versions.getByLabelText('舞萌DX 2026 版本代号 彩')).toBeTruthy();
    expect(versions.getByText('各版本游玩总结')).toBeTruthy();
    expect(versions.getByText('maimai でらっくす PRiSM PLUS')).toBeTruthy();
    expect(versions.getByText('舞萌DX 2026')).toBeTruthy();
  });
  it('selects a plate from the home route and can add it to the home page', async () => {
    mockToleranceParams = { plateId: '6102' };
    const screen = await render(<PlatesToolScreen />);
    expect(screen.getByLabelText('当前牌子 真神')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('添加到主页 真神'));
    expect(mockTogglePinnedPlate).toHaveBeenCalledWith('maimai', 6102);
  });
  it('does not read plates before the query has data', async () => {
    const ready = mockPlateQuery;
    mockPlateQuery = { data: undefined, isLoading: true, isError: false, error: null, refetch: jest.fn() };
    await expect(render(<PlatesToolScreen />)).resolves.toBeTruthy();
    mockPlateQuery = ready;
  });
});
