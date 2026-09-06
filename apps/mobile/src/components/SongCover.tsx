import { GameSongCover } from '@/components/game-content/GameSongCover';
import { maimaiJacketUrl } from '@/domain/maimai-assets';

export function SongCover({ songId, size = 58, borderRadius = 9 }: { songId: string; size?: number; borderRadius?: number }) {
  return <GameSongCover source={maimaiJacketUrl(songId)} gameId="maimai" size={size} borderRadius={borderRadius} />;
}
