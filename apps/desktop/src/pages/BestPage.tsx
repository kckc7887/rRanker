import { useMemo, useState } from 'react';
import { useAppRuntime } from '../app/runtime';
import { ScoreCard } from '../components/ScoreCard';
import { LoadingView } from '../components/StateViews';

export function BestPage() {
  const { snapshot } = useAppRuntime();
  const [section, setSection] = useState<'b35' | 'b15'>('b35');
  const records = useMemo(
    () => (snapshot ? snapshot.best50[section] : []),
    [section, snapshot],
  );

  if (!snapshot) return <LoadingView />;

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">舞萌 DX · Best 50</span>
          <h1>最佳成绩</h1>
          <p>按单谱 Rating 排序，完整展示示例账号的 B35 与 B15。</p>
        </div>
        <div className="segmented-control" role="tablist" aria-label="最佳成绩分区">
          <button
            type="button"
            role="tab"
            aria-selected={section === 'b35'}
            className={section === 'b35' ? 'active' : ''}
            onClick={() => setSection('b35')}
          >
            B35
            <span>{snapshot.best50.b35.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={section === 'b15'}
            className={section === 'b15' ? 'active' : ''}
            onClick={() => setSection('b15')}
          >
            B15
            <span>{snapshot.best50.b15.length}</span>
          </button>
        </div>
      </section>

      <section className="score-grid">
        {records.map((record, index) => (
          <ScoreCard
            key={`${record.songId}:${record.type}:${record.levelIndex}`}
            record={record}
            rank={index + 1}
          />
        ))}
      </section>
    </div>
  );
}
