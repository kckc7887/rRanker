import { BarChart3, History, Layers3, Sparkles, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { useAppRuntime } from '../app/runtime';
import { LoadingView } from '../components/StateViews';

export function OverviewPage() {
  const { snapshot } = useAppRuntime();
  const stats = useMemo(() => {
    if (!snapshot) return null;
    const versions = new Set(snapshot.records.map((record) => record.version));
    const dx = snapshot.records.filter((record) => record.type === 'DX').length;
    return {
      versions: versions.size,
      dx,
      sd: snapshot.records.length - dx,
      average:
        snapshot.records.reduce(
          (total, record) => total + record.difficultyConstant,
          0,
        ) / Math.max(snapshot.records.length, 1),
    };
  }, [snapshot]);

  if (!snapshot || !stats) return <LoadingView />;

  const { best50 } = snapshot;
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">舞萌 DX · 玩家总览</span>
          <h1>{snapshot.player.displayName}</h1>
          <p>示例查分器覆盖全部可用谱面，并按当前曲库动态计算 Best 50。</p>
        </div>
        <span className="pill pill-success">
          <Sparkles size={14} aria-hidden="true" />
          全谱面 101%
        </span>
      </section>

      <section className="overview-grid">
        <article className="rating-panel">
          <div className="rating-panel-glow" />
          <div className="rating-panel-head">
            <span>DX RATING</span>
            <Trophy size={21} aria-hidden="true" />
          </div>
          <strong>{best50.rating.toLocaleString('zh-CN')}</strong>
          <div className="rating-sections">
            <span>
              <small>B35</small>
              <b>{best50.b35.reduce((sum, record) => sum + record.rating, 0)}</b>
            </span>
            <i />
            <span>
              <small>B15</small>
              <b>{best50.b15.reduce((sum, record) => sum + record.rating, 0)}</b>
            </span>
          </div>
        </article>

        <article className="overview-summary-card">
          <div className="summary-icon summary-icon-blue">
            <BarChart3 size={21} aria-hidden="true" />
          </div>
          <span>收录成绩</span>
          <strong>{snapshot.records.length.toLocaleString('zh-CN')}</strong>
          <small>{stats.sd} 张 SD · {stats.dx} 张 DX</small>
        </article>
        <article className="overview-summary-card">
          <div className="summary-icon summary-icon-violet">
            <History size={21} aria-hidden="true" />
          </div>
          <span>覆盖版本</span>
          <strong>{stats.versions}</strong>
          <small>当前版本：{best50.currentVersion.title}</small>
        </article>
        <article className="overview-summary-card">
          <div className="summary-icon summary-icon-green">
            <Layers3 size={21} aria-hidden="true" />
          </div>
          <span>平均定数</span>
          <strong>{stats.average.toFixed(2)}</strong>
          <small>全部未禁用谱面</small>
        </article>
      </section>

      <section className="section-card best-breakdown">
        <div className="section-card-heading">
          <div>
            <span className="eyebrow">Best 50 构成</span>
            <h2>旧曲与新曲分区</h2>
          </div>
          <span>{best50.b35.length + best50.b15.length} / 50</span>
        </div>
        <div className="best-progress" aria-label="Best 50 分区">
          <div style={{ width: `${(best50.b35.length / 50) * 100}%` }}>
            B35 · {best50.b35.length}
          </div>
          <div style={{ width: `${(best50.b15.length / 50) * 100}%` }}>
            B15 · {best50.b15.length}
          </div>
        </div>
        <div className="breakdown-notes">
          <span>旧版本成绩取 Rating 最高的 35 张谱面</span>
          <span>当前版本成绩取 Rating 最高的 15 张谱面</span>
        </div>
      </section>
    </div>
  );
}
