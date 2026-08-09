import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import {
  buildPhigrosFilterSummary,
  PhigrosFilterBar,
} from '@/components/phigros/PhigrosFilterBar';
import { PhigrosKyouTagFilterSheet } from '@/components/phigros/PhigrosKyouTagFilterSheet';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  return { GestureHandlerRootView: RN.View, Pressable: RN.Pressable };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
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
const KYOU_TAGS = [
  { id: 152, name: '读谱', type: 'primary' as const, parentIds: [], description: '读谱相关难点' },
  { id: 156, name: '差速', type: 'secondary' as const, parentIds: [152], description: '速度不同' },
  { id: 157, name: '脑裂', type: 'secondary' as const, parentIds: [152], description: '多线配置' },
];

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

describe('PhigrosFilterBar Kyou tags', () => {
  it('includes selected tag names in the collapsed summary', () => {
    expect(buildPhigrosFilterSummary({
      level: 'all', constantMin: '', constantMax: '', accuracyMin: '', accuracyMax: '',
      rank: null, xing: null, chapter: 'all', versions: VERSIONS,
      kyouTags: KYOU_TAGS, selectedKyouTagIds: [152, 156],
    })).toBe('标签 读谱、差速');
    expect(buildPhigrosFilterSummary({
      level: 'all', constantMin: '', constantMax: '', accuracyMin: '', accuracyMax: '',
      rank: null, xing: null, chapter: 'all', versions: VERSIONS,
      kyouTags: KYOU_TAGS, selectedKyouTagIds: [152, 156, 157],
    })).toBe('标签 3 项');
  });

  it('disables the tag entry while unavailable', async () => {
    const screen = await render(<PhigrosFilterBar {...baseProps}
      kyouTagState="unavailable" kyouTags={[]} selectedKyouTagIds={[]}
      onKyouTagIdsChange={jest.fn()} />);
    expect(screen.getByLabelText('谱面标签筛选，暂不可用').props.accessibilityState.disabled).toBe(true);
  });

  it('groups tags and applies a multi-selection', async () => {
    const onApply = jest.fn();
    const screen = await render(<PhigrosKyouTagFilterSheet visible tags={KYOU_TAGS}
      selectedTagIds={[152]} onApply={onApply} onClose={jest.fn()} />);
    expect(screen.getByText('主要难点')).toBeTruthy();
    expect(screen.getByText('细分配置')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('谱面标签 差速，未选中'));
    await fireEvent.press(screen.getByLabelText('完成谱面标签筛选'));
    expect(onApply).toHaveBeenCalledWith([152, 156]);
  });
});
