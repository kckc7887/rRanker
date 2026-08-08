import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  buildPhigrosFilterSummary,
  PhigrosFilterBar,
} from '@/components/phigros/PhigrosFilterBar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
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
  }),
}));

const VERSIONS = [
  { id: 0, title: 'Chapter Legacy 过去的章节' },
  { id: 5, title: 'Chapter 5 霓虹灯牌' },
];

const baseProps = {
  collapsed: false,
  level: 'all' as const,
  constantMin: '',
  constantMax: '',
  onCollapsedChange: jest.fn(),
  onLevelChange: jest.fn(),
  onConstantMinChange: jest.fn(),
  onConstantMaxChange: jest.fn(),
  onReset: jest.fn(),
};

describe('PhigrosFilterBar chapter picker', () => {
  it('does not render the chapter row without versions', async () => {
    const screen = await render(<PhigrosFilterBar {...baseProps} />);
    expect(screen.queryByText('章节')).toBeNull();
  });

  it('renders the chapter dropdown with versions and notifies selection', async () => {
    const onChapterChange = jest.fn();
    const screen = await render(<PhigrosFilterBar
      {...baseProps}
      chapter="all"
      versions={VERSIONS}
      onChapterChange={onChapterChange}
    />);

    await waitFor(() => expect(screen.getByLabelText('章节筛选，当前 全部')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('章节筛选，当前 全部'));
    await waitFor(() => expect(screen.getByLabelText('选择章节 Chapter 5 霓虹灯牌')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('选择章节 Chapter 5 霓虹灯牌'));
    expect(onChapterChange).toHaveBeenCalledWith('5');
    await act(async () => {
      screen.rerender(<PhigrosFilterBar
        {...baseProps}
        chapter="5"
        versions={VERSIONS}
        onChapterChange={onChapterChange}
      />);
    });
    expect(screen.getByLabelText('章节筛选，当前 Chapter 5 霓虹灯牌')).toBeTruthy();
  });
});

describe('buildPhigrosFilterSummary chapter', () => {
  it('includes the selected chapter label', () => {
    const summary = buildPhigrosFilterSummary({
      level: 'all',
      constantMin: '',
      constantMax: '',
      accuracyMin: '',
      accuracyMax: '',
      rank: null,
      xing: null,
      chapter: '5',
      versions: VERSIONS,
    });
    expect(summary).toBe('章节 Chapter 5 霓虹灯牌');
  });

  it('keeps 全部 when chapter is all or unknown', () => {
    const all = buildPhigrosFilterSummary({
      level: 'all',
      constantMin: '',
      constantMax: '',
      accuracyMin: '',
      accuracyMax: '',
      rank: null,
      xing: null,
      chapter: 'all',
      versions: VERSIONS,
    });
    const unknown = buildPhigrosFilterSummary({
      level: 'all',
      constantMin: '',
      constantMax: '',
      accuracyMin: '',
      accuracyMax: '',
      rank: null,
      xing: null,
      chapter: '99',
      versions: VERSIONS,
    });
    expect(all).toBe('全部');
    expect(unknown).toBe('全部');
  });
});
