import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { PhigrosSongRow } from '@/components/phigros/PhigrosSongRow';
import type { Song } from '@/domain/models';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/theme/app-theme', () => ({
  useAppTheme: () => ({
    surface: '#FFFFFF',
    input: '#F3F4F6',
    text: '#111827',
    textMuted: '#6B7280',
    accent: '#246BFD',
  }),
}));

const song: Song = {
  id: 'Song.A',
  title: 'Song A',
  artist: 'Artist',
  version: 'Phigros',
  charts: [{
    songId: 'Song.A',
    type: 'SD',
    levelIndex: 2,
    level: 'IN',
    difficulty: 'expert',
    difficultyConstant: 14.8,
  }],
};

describe('Phigros catalog difficulty badge', () => {
  it('keeps the rectangular badge language while showing only the numeric constant', async () => {
    const screen = await render(<PhigrosSongRow song={song} blurUrl={null} />);

    expect(screen.getByText('14.8')).toBeTruthy();
    expect(screen.queryByText('IN')).toBeNull();
    expect(StyleSheet.flatten(
      screen.getByLabelText('IN，定数 14.8').props.style,
    )).toEqual(expect.objectContaining({ borderRadius: 6 }));
  });
});
