import type { BestSectionPresentation, MetricPresentation, ScoreCardPresentation } from '@/features/game-content/presentation';
import { buildBestImageCanvasRuntime } from './build-best-image-canvas-runtime';

export type FixedBestImageTheme = {
  accent: string;
  accentSoft: string;
  secondaryAccent?: string;
};

export type FixedBestImageCardLayout = {
  asideMetricKey?: string;
};

export type FixedBestImageInput = {
  width: number;
  title: string;
  playerName: string;
  ratingLabel: string;
  ratingDisplay: string;
  avatarUrl?: string | null;
  avatarFallbackUrl?: string | null;
  sections: readonly BestSectionPresentation[];
  theme: FixedBestImageTheme;
  dataSource: string;
  cardLayout?: FixedBestImageCardLayout;
};

function escapeHtml(value: string | number): string {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

function badgeHtml(label: string, value: string | undefined, tone: string): string {
  return `<span class="badge" data-tone="${escapeHtml(tone)}"><span>${escapeHtml(label)}</span>${value ? `<b>${escapeHtml(value)}</b>` : ''}</span>`;
}

function metricChipHtml(metric: MetricPresentation): string {
  return `<span class="metric-chip"><small>${escapeHtml(metric.label ?? '')}</small><b>${escapeHtml(metric.text)}</b></span>`;
}

function cardHtml(card: ScoreCardPresentation, layout: FixedBestImageCardLayout): string {
  const aside = layout.asideMetricKey
    ? card.secondaryMetrics.find((metric) => metric.key === layout.asideMetricKey)
    : undefined;
  const inlineMetrics = card.secondaryMetrics.filter((metric) => metric !== aside);
  const badgeRows = [
    [card.difficulty, ...(card.grade ? [card.grade] : []), ...(card.achievementRows[0] ?? [])],
    ...card.achievementRows.slice(1),
  ].filter((row) => row.length > 0);
  return `<article class="score-card">
    <div class="card-main">
      <div class="card-title">${card.position ? `<span class="position">${escapeHtml(card.position)}.</span>` : ''}<strong>${escapeHtml(card.title)}</strong></div>
      <div class="score-line"><span class="primary"><small>${escapeHtml(card.primaryMetric.label ?? '')}</small><strong>${escapeHtml(card.primaryMetric.text)}</strong></span>${inlineMetrics.map(metricChipHtml).join('')}</div>
      <div class="badge-rows">${badgeRows.map((row) => `<div class="badge-row">${row.map((badge) => badgeHtml(badge.label, badge.value, badge.tone)).join('')}</div>`).join('')}</div>
    </div>
    ${aside ? `<aside><small>${escapeHtml(aside.label ?? '')}</small><strong>${escapeHtml(aside.text)}</strong></aside>` : ''}
  </article>`;
}

function unit(width: number, value: number): number {
  return Math.max(1, Math.round(width * value / 1080));
}

export function buildFixedBestImageHtml(input: FixedBestImageInput): string {
  const width = Math.max(1, Math.round(input.width));
  const u = (value: number) => unit(width, value);
  const minimumHeight = Math.ceil(width * 0.75);
  const sections = input.sections.map((section) => `<section>
    <div class="section-heading"><h2>${escapeHtml(section.title)}</h2><span>${section.items.length} 条</span></div>
    <div class="grid">${section.items.map((card) => cardHtml(card, input.cardLayout ?? {})).join('')}</div>
  </section>`).join('');
  const avatarSource = input.avatarUrl || input.avatarFallbackUrl;
  const avatar = avatarSource ? `<img class="avatar" src="${escapeHtml(avatarSource)}" data-fallback="${escapeHtml(input.avatarFallbackUrl ?? '')}" alt="" />` : '';
  const secondaryLine = input.theme.secondaryAccent
    ? `<i style="background:${escapeHtml(input.theme.secondaryAccent)}"></i>` : '';

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8" />
  <meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#DDE3EC;font-family:system-ui,-apple-system,"Segoe UI","Noto Sans SC",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
    .preview-stage{position:fixed;inset:0;overflow:hidden;background:#DDE3EC}.canvas{position:absolute;left:0;top:0;width:${width}px;min-height:${minimumHeight}px;overflow:hidden;transform-origin:top left;background:linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%);color:#172033}
    .content{padding:${u(40)}px ${u(43)}px ${u(36)}px}.accent-lines{display:flex;gap:${u(8)}px;height:${u(5)}px;margin-bottom:${u(24)}px}.accent-lines i{display:block;flex:1;border-radius:999px;background:${escapeHtml(input.theme.accent)}}
    header{display:flex;align-items:center;min-height:${u(112)}px;margin-bottom:${u(28)}px}.identity{display:flex;align-items:center;gap:${u(16)}px;min-width:0}.avatar{display:block;width:${u(112)}px;height:${u(112)}px;flex:0 0 ${u(112)}px;border:${u(3)}px solid rgba(255,255,255,.92);border-radius:${u(18)}px;background:#DDE5F0;box-shadow:0 ${u(8)}px ${u(20)}px rgba(31,44,75,.18);object-fit:contain;object-position:center}
    .player{min-width:0}.player-name{max-width:${u(720)}px;overflow:hidden;color:#1F2937;font-size:${u(35)}px;line-height:1.15;font-weight:900;text-overflow:ellipsis;white-space:nowrap}.rating{display:inline-flex;align-items:center;gap:${u(10)}px;margin-top:${u(10)}px;padding:${u(8)}px ${u(13)}px;border-radius:999px;background:${escapeHtml(input.theme.accentSoft)};color:${escapeHtml(input.theme.accent)};font-size:${u(15)}px;line-height:1;font-weight:800}.rating b{font-size:${u(21)}px;font-variant-numeric:tabular-nums}
    section+section{margin-top:${u(26)}px}.section-heading{display:flex;align-items:center;gap:${u(12)}px;margin:0 ${u(2)}px ${u(13)}px;color:#4B5563}.section-heading:after{content:"";height:${Math.max(1, u(1))}px;flex:1;background:linear-gradient(90deg,rgba(75,85,99,.36),transparent)}.section-heading h2{margin:0;font-size:${u(20)}px;line-height:1.2;font-weight:850}.section-heading span{order:3;color:#7B8596;font-size:${u(12)}px;font-weight:750;white-space:nowrap}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:${u(14)}px}
    .score-card{display:flex;min-width:0;min-height:${u(154)}px;align-items:stretch;gap:${u(10)}px;overflow:hidden;padding:${u(13)}px;border:1px solid rgba(206,214,226,.82);border-radius:${u(14)}px;background:#FFFFFF;box-shadow:0 ${u(4)}px ${u(12)}px rgba(35,48,70,.08)}.card-main{display:flex;min-width:0;flex:1;flex-direction:column}.card-title{display:flex;min-width:0;align-items:baseline;gap:${u(5)}px;color:#1F2937;font-size:${u(15)}px;line-height:${u(20)}px}.card-title strong{overflow:hidden;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.position{flex:0 0 auto;color:#8A93A3;font-size:${u(12)}px;font-weight:800}
    .score-line{display:flex;min-height:${u(34)}px;align-items:center;flex-wrap:wrap;gap:${u(6)}px;margin-top:${u(8)}px}.primary{display:inline-flex;align-items:baseline;gap:${u(6)}px}.primary small,.metric-chip small,aside small{color:#7B8596;font-size:${u(9)}px;line-height:1;font-weight:800;letter-spacing:.04em}.primary strong{color:#172033;font-size:${u(20)}px;line-height:1.1;font-weight:900;font-variant-numeric:tabular-nums}.metric-chip{display:inline-flex;min-height:${u(22)}px;align-items:center;gap:${u(4)}px;padding:0 ${u(7)}px;border:1px solid #DEE4EC;border-radius:999px;background:#F4F6F9}.metric-chip b{color:#4B5563;font-size:${u(10)}px;font-weight:850;font-variant-numeric:tabular-nums}
    .badge-rows{display:flex;flex-direction:column;gap:${u(5)}px;margin-top:auto;padding-top:${u(8)}px}.badge-row{display:flex;min-height:${u(22)}px;align-items:center;flex-wrap:wrap;gap:${u(5)}px}.badge{display:inline-flex;min-height:${u(22)}px;align-items:center;gap:${u(3)}px;padding:${u(4)}px ${u(7)}px;border-radius:${u(7)}px;background:#EEF1F5;color:#4B5565;font-size:${u(9)}px;line-height:${u(12)}px;font-weight:850}.badge b{font-variant-numeric:tabular-nums}.badge[data-tone="0"]{background:#DFF5E6;color:#257247}.badge[data-tone="1"]{background:#E0EEFF;color:#265EA6}.badge[data-tone="2"]{background:#FFE2F0;color:#A02E65}.badge[data-tone="3"]{background:#292D36;color:#FFF}.badge[data-tone="4"]{border:1px solid #BBC2CC;background:#FFF;color:#252B35}.badge[data-tone*="world"],.badge[data-tone*="personal"]{background:#FFF1BE;color:#8A5B00}.badge[data-tone*="achievement-ap"],.badge[data-tone*="rank-rainbow"]{background:linear-gradient(120deg,#F8D66D,#F29BC2,#8DCBFF);color:#49384D}.badge[data-tone*="achievement-fc"],.badge[data-tone*="rank-blue"]{background:#E0EEFF;color:#265EA6}.badge[data-tone*="rank-gold"]{background:#FFF0B8;color:#8A6200}.badge[data-tone*="rank-green"]{background:#DFF5E6;color:#257247}
    aside{display:flex;min-width:${u(58)}px;flex:0 0 auto;flex-direction:column;align-items:flex-end;justify-content:center;gap:${u(3)}px}aside strong{color:${escapeHtml(input.theme.accent)};font-size:${u(18)}px;line-height:1;font-weight:900;font-variant-numeric:tabular-nums}
    footer{display:flex;justify-content:space-between;margin-top:${u(24)}px;color:#7B8596;font-size:${u(11)}px;line-height:1.4;font-weight:650}.signature{color:${escapeHtml(input.theme.accent)};font-weight:850}
  </style></head><body><div class="preview-stage"><main class="canvas" aria-label="${escapeHtml(input.title)} 成绩图片预览">
    <div class="content" data-layout-content><div class="accent-lines"><i></i>${secondaryLine}</div>
      <header><div class="identity">${avatar}<div class="player"><div class="player-name">${escapeHtml(input.playerName)}</div><div class="rating"><span>${escapeHtml(input.ratingLabel)}</span><b>${escapeHtml(input.ratingDisplay)}</b></div></div></div></header>
      ${sections}<footer><span>${escapeHtml(input.dataSource)}</span><span class="signature">Generated by rRanker</span></footer>
    </div></main></div>
    <script>document.querySelectorAll('img.avatar').forEach(function(image){image.addEventListener('error',function(){var fallback=image.dataset.fallback;if(fallback&&image.src!==fallback){image.src=fallback}else{image.style.display='none'}})});</script>
    ${buildBestImageCanvasRuntime({ width, minimumHeight })}
  </body></html>`;
}
