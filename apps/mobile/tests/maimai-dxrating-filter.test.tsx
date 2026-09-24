import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  MaimaiFilterBar,
  dxRatingTagFilterStateFromQuery,
} from '@/components/MaimaiFilterBar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    surface: '#FFFFFF',
    input: '#F3F4F6',
    text: '#111827',
    textMuted: '#6B7280',
    textSecondary: '#374151',
    border: '#D1D5DB',
    accent: '#246BFD',
    accentSoft: '#EAF2FF',
    background: '#F7F8FA',
    surfaceMuted: '#F3F4F6',
  }),
}));

const noop = () => {};
const baseProps = {
  collapsed: false,
  difficulty: 'all' as const,
  version: 'all' as const,
  type: 'all' as const,
  constantMin: '',
  constantMax: '',
  versionLocale: 'china' as const,
  versions: [],
  onCollapsedChange: noop,
  onDifficultyChange: noop,
  onVersionChange: noop,
  onTypeChange: noop,
  onConstantMinChange: noop,
  onConstantMaxChange: noop,
  onVersionLocaleChange: noop,
  onReset: noop,
};

describe('dxRatingTagFilterStateFromQuery', () => {
  it('keeps ready when data exists even while refetching', () => {
    expect(dxRatingTagFilterStateFromQuery({ data: { tags: [] }, isFetching: true, isPending: false })).toBe('ready');
  });

  it('shows loading while fetching without data', () => {
    expect(dxRatingTagFilterStateFromQuery({ data: undefined, isFetching: true, isPending: false })).toBe('loading');
    expect(dxRatingTagFilterStateFromQuery({ data: undefined, isFetching: false, isPending: true })).toBe('loading');
  });

  it('falls back to isLoading for legacy query shapes', () => {
    expect(dxRatingTagFilterStateFromQuery({ data: undefined, isLoading: true })).toBe('loading');
    expect(dxRatingTagFilterStateFromQuery({ data: undefined, isLoading: false })).toBe('unavailable');
  });

  it('shows unavailable only when idle without data', () => {
    expect(dxRatingTagFilterStateFromQuery({ data: undefined, isFetching: false, isPending: false })).toBe('unavailable');
  });
});

describe('MaimaiFilterBar DXRating retry', () => {
  it('renders a retry action when tags are unavailable', async () => {
    const onRetry = jest.fn();
    const screen = await render(
      <MaimaiFilterBar
        {...baseProps}
        dxRatingTags={[]}
        selectedDxRatingTagIds={[]}
        dxRatingTagState="unavailable"
        onDxRatingTagIdsChange={noop}
        onDxRatingTagRetry={onRetry}
      />,
    );
    expect(screen.getByLabelText('谱面标签筛选，不可用')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('重试谱面标签'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the retry action without a retry handler or when ready', async () => {
    const withoutRetry = await render(
      <MaimaiFilterBar
        {...baseProps}
        dxRatingTags={[]}
        selectedDxRatingTagIds={[]}
        dxRatingTagState="unavailable"
        onDxRatingTagIdsChange={noop}
      />,
    );
    expect(withoutRetry.queryByLabelText('重试谱面标签')).toBeNull();

    const ready = await render(
      <MaimaiFilterBar
        {...baseProps}
        dxRatingTags={[]}
        selectedDxRatingTagIds={[]}
        dxRatingTagState="ready"
        onDxRatingTagIdsChange={noop}
        onDxRatingTagRetry={noop}
      />,
    );
    expect(ready.queryByLabelText('重试谱面标签')).toBeNull();
    expect(ready.getByLabelText('谱面标签筛选，当前 全部').props.accessibilityState.disabled).toBe(false);
  });
});
