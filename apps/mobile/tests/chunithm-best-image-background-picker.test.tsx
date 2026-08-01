import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { ChunithmBestImageBackgroundPicker } from '@/features/chunithm-best-image/chunithm-best-image-background-picker';
import type { ChunithmSong } from '@/domain/chunithm';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    background: '#F3F4F6', surface: '#FFFFFF', surfaceMuted: '#E5E7EB', input: '#F9FAFB',
    border: '#D1D5DB', text: '#111827', textMuted: '#6B7280', accent: '#246BFD', accentSoft: '#DBEAFE',
  }),
}));

const songs: ChunithmSong[] = [
  {
    id: 3, title: 'B.B.K.K.B.K.K.', artist: 'nora2r', genre: '其他游戏', bpm: 170,
    versionId: 1, versionTitle: 'CHUNITHM', locked: false, disabled: false, difficulties: [],
  },
  {
    id: 202, title: '光線チューニング', artist: 'ナユタン星人', genre: 'POPS & ANIME', bpm: 190,
    versionId: 2, versionTitle: 'STAR', locked: false, disabled: false, difficulties: [],
  },
];

describe('ChunithmBestImageBackgroundPicker', () => {
  it('shows the default choice and selected song, then returns the pressed song id', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <ChunithmBestImageBackgroundPicker
        visible
        songs={songs}
        selection={{ mode: 'song', songId: 3 }}
        onClose={jest.fn()}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByLabelText('使用默认背景').props.accessibilityState).toEqual({ selected: false });
    expect(screen.getByLabelText('使用B.B.K.K.B.K.K.作为背景').props.accessibilityState).toEqual({ selected: true });
    fireEvent.press(screen.getByLabelText('使用光線チューニング作为背景'));
    expect(onSelect).toHaveBeenCalledWith({ mode: 'song', songId: 202 });
  });

  it('filters songs by artist and keeps the default choice available', async () => {
    const screen = await render(
      <ChunithmBestImageBackgroundPicker
        visible
        songs={songs}
        selection={{ mode: 'default' }}
        onClose={jest.fn()}
        onSelect={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByLabelText('搜索背景歌曲'), 'ナユタン');
    await waitFor(() => expect(screen.queryByLabelText('使用B.B.K.K.B.K.K.作为背景')).toBeNull());
    expect(screen.getByLabelText('使用光線チューニング作为背景')).toBeTruthy();
    expect(screen.getByLabelText('使用默认背景').props.accessibilityState).toEqual({ selected: true });
  });
});
