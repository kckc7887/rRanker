import { fireEvent, render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { MuseDashPlayerPickerSheet } from '@/components/MuseDashPlayerPickerSheet';

const mockSearch = jest.fn();
const mockDirect = jest.fn();
let mockSearchQuery = '';
let mockDirectUserId: string | null = null;

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => ({
  background: '#F7F8FA', surface: '#FFF', surfaceMuted: '#EEF2F7', border: '#DDD', text: '#111',
  textSecondary: '#4B5563', textMuted: '#666', accent: '#246BFD', accentSoft: '#E8F0FF', input: '#F0F1F5',
}) }));
jest.mock('@/hooks/use-debounced-value', () => ({ useDebouncedValue: (value: unknown) => value }));
jest.mock('@/hooks/use-muse-dash', () => ({
  useMuseDashSearch: (query: string) => {
    mockSearchQuery = query;
    return mockSearch(query);
  },
  useMuseDashPlayer: (userId: string | null) => {
    mockDirectUserId = userId;
    return mockDirect(userId);
  },
}));

const USER_ID = '6ea4f986ffd211e8aa980242ac110011';
const onSelect = jest.fn<(player: { nickname: string; userId: string }) => void>();
const onClose = jest.fn();

describe('MuseDashPlayerPickerSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchQuery = '';
    mockDirectUserId = null;
    mockSearch.mockReturnValue({ data: [], isFetching: false, error: null });
    mockDirect.mockReturnValue({ data: undefined, isFetching: false, error: null });
  });

  it('searches by nickname through the public search endpoint', async () => {
    mockSearch.mockReturnValue({
      data: [['SiMOOOOOON', USER_ID]],
      isFetching: false, error: null,
    });
    const screen = await render(<MuseDashPlayerPickerSheet visible onClose={onClose} onSelect={onSelect} />);
    await fireEvent.changeText(screen.getByLabelText('搜索喵斯快跑玩家'), 'simooo');
    expect(mockSearchQuery).toBe('simooo');
    expect(mockDirectUserId).toBeNull();
    expect(screen.getByText('SiMOOOOOON')).toBeTruthy();
  });

  it('resolves a raw 32-hex user_id through the player endpoint', async () => {
    mockDirect.mockReturnValue({
      data: { user: { user_id: USER_ID, nickname: '直接玩家' }, plays: [] },
      isFetching: false, error: null,
    });
    const screen = await render(<MuseDashPlayerPickerSheet visible onClose={onClose} onSelect={onSelect} />);
    await fireEvent.changeText(screen.getByLabelText('搜索喵斯快跑玩家'), USER_ID);
    expect(mockSearchQuery).toBe('');
    expect(mockDirectUserId).toBe(USER_ID);
    expect(screen.getByText('直接玩家')).toBeTruthy();
  });

  it('accepts a dashed uuid and binds the resolved player', async () => {
    mockDirect.mockReturnValue({
      data: { user: { user_id: USER_ID, nickname: '连字符玩家' }, plays: [] },
      isFetching: false, error: null,
    });
    const screen = await render(<MuseDashPlayerPickerSheet visible onClose={onClose} onSelect={onSelect} />);
    const dashed = '6ea4f986-ffd2-11e8-aa98-0242ac110011';
    await fireEvent.changeText(screen.getByLabelText('搜索喵斯快跑玩家'), dashed);
    expect(mockDirectUserId).toBe(USER_ID);
    await fireEvent.press(screen.getByLabelText('绑定喵斯快跑玩家 连字符玩家'));
    expect(onSelect).toHaveBeenCalledWith({ nickname: '连字符玩家', userId: USER_ID });
  });
});
