import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import { NotificationProvider } from '@/components/AppNotification';
import { usePhigrosChartVariantSelection } from '@/features/phigros-chart-preview/use-phigros-chart-variant-selection';

const mockLoad = jest.fn<(...args: unknown[]) => Promise<number[]>>();
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
jest.mock('@/state/app-lifecycle', () => ({ useAppLifecycle: () => ({ foregroundReady: true }) }));
jest.mock('@/domain/phigros-chart-preview', () => ({
  phigrosChartPreviewLevelLabel: () => 'IN',
  loadPhigrosChartPreviewVariants: (...args: unknown[]) => mockLoad(...args),
}));
const target = { songId: 'Random.SobremSilentroom', levelIndex: 2 };
function Harness() {
  const result = usePhigrosChartVariantSelection(target);
  return <Text>{result?.error ?? (result ? `播放 ${result.variantIndex ?? 0}` : '等待选择')}</Text>;
}
beforeEach(() => { mockLoad.mockReset(); mockLoad.mockResolvedValue([0, 1, 2, 3, 4, 5, 6]); });

it('closes the first prompt, shows six numbered buttons, then plays only the selected variant', async () => {
  const screen = await render(<NotificationProvider><Harness /></NotificationProvider>);
  await waitFor(() => expect(screen.getByText('这首歌有里谱')).toBeTruthy());
  expect(screen.getByText('等待选择')).toBeTruthy();
  await fireEvent.press(screen.getByText('查看里谱'));
  await waitFor(() => expect(screen.getByText('选择里谱')).toBeTruthy());
  expect(screen.queryByText('这首歌有里谱')).toBeNull();
  expect(screen.getAllByText(/^里谱 \d$/).map((node) => node.props.children)).toEqual(['里谱 1', '里谱 2', '里谱 3', '里谱 4', '里谱 5', '里谱 6']);
  await fireEvent.press(screen.getByText('里谱 4'));
  await waitFor(() => expect(screen.getByText('播放 4')).toBeTruthy());
  expect(screen.queryByText('选择里谱')).toBeNull();
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

it('continues with the default chart when requested', async () => {
  const screen = await render(<NotificationProvider><Harness /></NotificationProvider>);
  await waitFor(() => expect(screen.getByText('继续播放谱面')).toBeTruthy());
  await fireEvent.press(screen.getByText('继续播放谱面'));
  await waitFor(() => expect(screen.getByText('播放 0')).toBeTruthy());
});

it('does not show prompts for a song with one chart', async () => {
  mockLoad.mockResolvedValue([0]);
  const screen = await render(<NotificationProvider><Harness /></NotificationProvider>);
  await waitFor(() => expect(screen.getByText('播放 0')).toBeTruthy());
  expect(screen.queryByText('这首歌有里谱')).toBeNull();
});

it('removes prompts and ignores pending results when the preview is closed', async () => {
  let complete!: (value: number[]) => void;
  mockLoad.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const screen = await render(<NotificationProvider><Harness /></NotificationProvider>);
  await screen.rerender(<NotificationProvider><Text>已退出</Text></NotificationProvider>);
  complete([0, 1]);
  await waitFor(() => expect((mockLoad.mock.calls[0]![1] as AbortSignal).aborted).toBe(true));
  expect(screen.queryByText('这首歌有里谱')).toBeNull();
});
