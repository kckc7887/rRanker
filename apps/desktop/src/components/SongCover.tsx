import { useState } from 'react';
import { Music2 } from 'lucide-react';
import { coverUrl } from '../app/format';

export function SongCover({
  songId,
  size = 52,
}: {
  songId: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (failed) {
    return (
      <span className="song-cover song-cover-fallback" style={style}>
        <Music2 aria-hidden="true" size={Math.max(18, size * 0.4)} />
      </span>
    );
  }
  return (
    <img
      className="song-cover"
      src={coverUrl(songId)}
      alt=""
      loading="lazy"
      decoding="async"
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
