import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import RatingToolScreen from '../app/tools/rating';
import ToleranceToolScreen from '../app/tools/tolerance';
import PlatesToolScreen from '../app/tools/plates';
import VersionsToolScreen from '../app/tools/versions';
import type { DataSource, PlateSnapshot } from '@/domain/models';

jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, router: { push: jest.fn() } }));
const mockSource: DataSource = { kind: 'fixture', label: '测试来源', updatedAt: '2026-07-13T00:00:00.000Z', isStale: false };
let mockPlateQuery: { data?: PlateSnapshot; isLoading: boolean; isError: boolean; error: unknown; refetch: ReturnType<typeof jest.fn> } = {
  data: { plates: [{ id: 1, name: '测试牌子', requirements: [{ difficulties: [], rate: 's', songs: ['1'] }] }], source: mockSource },
  isLoading: false, isError: false, error: null, refetch: jest.fn(),
};
jest.mock('@/hooks/use-plates', () => ({ usePlates: () => mockPlateQuery }));
jest.mock('@/hooks/use-detailed-catalog', () => ({ useDetailedCatalog: () => ({ data: jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized').fixtureCatalog, isLoading: false, isError: false, error: null, refetch: jest.fn() }) }));
jest.mock('@/hooks/use-score-snapshot', () => ({ useScoreSnapshot: () => { const fixtures = jest.requireActual<typeof import('../src/fixtures/sanitized')>('../src/fixtures/sanitized'); return { data: { records: fixtures.fixtureRecords, source: fixtures.fixtureSource, best50: { b35: [], b15: [] } }, isLoading: false, isError: false, error: null, refetch: jest.fn() }; } }));

describe('M2 tool screens', () => {
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
    for (const label of ['TAP', 'HOLD', 'SLIDE', 'TOUCH', 'BREAK']) await fireEvent.changeText(screen.getByLabelText(label), '0');
    expect(screen.getAllByText(/总物量不能为零/).length).toBeGreaterThan(0);
  });
  it('renders local plate progress and version comparison', async () => {
    expect((await render(<PlatesToolScreen />)).getAllByText('测试牌子').length).toBeGreaterThan(0);
    const versions = await render(<VersionsToolScreen />);
    expect(versions.getByText('版本名称对照')).toBeTruthy();
    expect(versions.getByText('各版本游玩总结')).toBeTruthy();
    expect(versions.getByText('maimai でらっくす PRiSM PLUS')).toBeTruthy();
  });
  it('does not read plates before the query has data', async () => {
    const ready = mockPlateQuery;
    mockPlateQuery = { data: undefined, isLoading: true, isError: false, error: null, refetch: jest.fn() };
    await expect(render(<PlatesToolScreen />)).resolves.toBeTruthy();
    mockPlateQuery = ready;
  });
});
