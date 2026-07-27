import type { ScoreRecord } from '@rranker/core';
import { Crown, Sparkles } from 'lucide-react';
import { DifficultyBadge } from './DifficultyBadge';
import { SongCover } from './SongCover';

export function ScoreCard({
  record,
  rank,
}: {
  record: ScoreRecord;
  rank: number;
}) {
  return (
    <article className={`score-card score-card-${record.difficulty}`}>
      <div className="score-card-rank">
        {rank <= 3 ? <Crown size={13} aria-hidden="true" /> : null}
        <span>#{rank}</span>
      </div>
      <div className="score-card-top">
        <SongCover songId={record.songId} size={58} />
        <div className="score-card-title-wrap">
          <h3 title={record.title}>{record.title}</h3>
          <div className="score-card-meta">
            <DifficultyBadge difficulty={record.difficulty} compact />
            <span>{record.type}</span>
            <span>{record.level}</span>
            <span>定数 {record.difficultyConstant.toFixed(1)}</span>
          </div>
        </div>
      </div>
      <div className="score-card-achievement">
        <strong>{record.achievements.toFixed(4)}</strong>
        <span>%</span>
      </div>
      <div className="score-card-footer">
        <span className="score-card-status">
          <Sparkles size={13} aria-hidden="true" />
          AP+ · FDX+
        </span>
        <span className="score-card-rating">Ra {record.rating}</span>
      </div>
    </article>
  );
}
