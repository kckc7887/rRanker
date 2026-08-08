/*
 * Phigros 成绩图「应用风格」模板。
 * 自绘 HTML：顶部按总览页 DxRatingCard 形态（头像 + RKS/课题模式渐变卡 + 进度统计表同一行），
 * 成绩卡片 3 列、以难度色为主题色；不依赖 phi-plugin 模板 CSS，字体使用系统栈。
 * 导出协议（best-image-runtime/height/ready + data-layout-content）与游戏风格保持一致。
 */
import { formatPhigrosSongRks } from '@/domain/phigros';
import { resolvePhigrosChallengeTheme } from '@/domain/phigros-challenge-theme';
import { PHIGROS_RATE_COLORS, PHIGROS_RATE_LABELS } from '@/domain/phigros-rate-theme';
import type { PhigrosRateKind } from '@/domain/phigros-rate-theme';
import { minimumBestImageHeight } from '@/features/best-image/build-best-image-html';
import {
  escapePhigrosBestImageHtml,
  ratingName,
  suggestion,
  type PhigrosBestImageHtmlInput,
} from './build-phigros-best-image-html';
import type { PhigrosBestImagePage } from './phigros-best-image';

const LEVEL_CARD_COLORS: Record<number, string> = {
  0: '#3E9D6B',
  1: '#3B82F6',
  2: '#D84B68',
  3: '#374151',
};

function levelCardColor(levelIndex: number): string {
  return LEVEL_CARD_COLORS[levelIndex] ?? LEVEL_CARD_COLORS[3]!;
}

function px(value: number): number {
  return Math.max(1, Math.round(value));
}

function cssLinearGradient(colors: readonly string[], locations: readonly number[]): string {
  const stops = colors.map((color, index) => (
    `${color} ${Math.round((locations[index] ?? index / Math.max(1, colors.length - 1)) * 100)}%`
  ));
  return `linear-gradient(90deg,${stops.join(',')})`;
}

/** 评价标签样式与展示文案对齐 PhigrosRateBadge（PHIGROS_RATE_COLORS/LABELS）。 */
function rateStyle(rate: string): { bg: string; fg: string; label: string } {
  if (rate === 'phi') return { ...PHIGROS_RATE_COLORS.phi, label: PHIGROS_RATE_LABELS.phi };
  if (rate === 'FC') return { ...PHIGROS_RATE_COLORS.vFc, label: PHIGROS_RATE_LABELS.v };
  if (rate === 'NEW') return { ...PHIGROS_RATE_COLORS.f, label: 'NEW' };
  const normalized = rate.toLowerCase() as PhigrosRateKind;
  return {
    ...PHIGROS_RATE_COLORS[normalized] ?? PHIGROS_RATE_COLORS.f,
    label: PHIGROS_RATE_LABELS[normalized] ?? rate,
  };
}

function scoreCard(
  input: PhigrosBestImageHtmlInput,
  record: PhigrosBestImagePage['sections'][number]['records'][number],
  rank: string,
  isPhi: boolean,
  isBest: boolean,
  referenceRks: number,
  allowPerfectFallback: boolean,
  levelIndex: number,
): string {
  const score = Math.round(record.dxScore ?? 0);
  const title = input.titles[record.songId] ?? record.title ?? record.songId;
  const illustration = input.illustrations[record.songId];
  const rate = ratingName(score, record.fc);
  const rateColors = rateStyle(rate);
  const cardColor = levelCardColor(levelIndex);
  const push = isPhi || record.achievements >= 100 ? { label: '无法推分', type: null } : suggestion(
    record.difficultyConstant,
    referenceRks,
    Number(input.rks),
    allowPerfectFallback,
  );
  return `<article class="score-card" style="--card-bg:${cardColor};--card-fg:#FFFFFF" aria-label="第 ${escapePhigrosBestImageHtml(rank)} 名 ${escapePhigrosBestImageHtml(title)}">
    ${illustration ? `<div class="card-art" aria-hidden="true"><img class="card-art-image" alt="" src="${escapePhigrosBestImageHtml(illustration)}"><div class="card-art-veil"></div></div>` : ''}
    <div class="score-card-head">
      <div class="jacket-shell">
        <span class="jacket-fallback">♪</span>
        ${illustration ? `<img class="song-jacket" alt="" src="${escapePhigrosBestImageHtml(illustration)}">` : ''}
      </div>
      <div class="song-copy">
        <span class="song-rank">${escapePhigrosBestImageHtml(rank)}</span>
        <strong class="song-title">${escapePhigrosBestImageHtml(title)}</strong>
      </div>
    </div>
    <div class="score-separator"></div>
    <div class="achievement-row">
      <span class="achievement-with-rate"><strong class="achievement">${score}</strong><span class="rate-badge" style="--rate-bg:${rateColors.bg};--rate-fg:${rateColors.fg}">${escapePhigrosBestImageHtml(rateColors.label)}</span></span>
      <span class="acc-value">${record.achievements.toFixed(2)}%</span>
    </div>
    <div class="rating-row">
      <span class="song-rating">${record.difficultyConstant.toFixed(1)}-&gt;${formatPhigrosSongRks(record.rating)}</span>
      <span class="suggest${push.type === null ? ' suggest-empty' : ''}">${escapePhigrosBestImageHtml(push.label)}</span>
    </div>
  </article>`;
}

function scoreCards(input: PhigrosBestImageHtmlInput): string {
  const phiRecords = input.type === 'best30'
    ? input.page.sections.filter((section) => section.id.toLowerCase().includes('phi')).flatMap((section) => section.records)
    : [];
  const bestRecords = input.type === 'best30'
    ? input.page.sections.filter((section) => !section.id.toLowerCase().includes('phi')).flatMap((section) => section.records)
    : input.page.sections.flatMap((section) => section.records);
  const cutoffIndex = input.type === 'best30' ? 26 : 29;
  const cutoffRks = bestRecords[Math.min(cutoffIndex, bestRecords.length - 1)]?.rating ?? bestRecords.at(-1)?.rating ?? 0;
  const lowestPhiRks = phiRecords.at(-1)?.rating ?? 0;
  const pageOffset = input.type === 'custom' ? input.page.pageIndex * 30 : 0;
  const bestLimit = input.type === 'best30' ? 27 : 30;
  let phiIndex = 0;
  let bestIndex = 0;
  return input.page.sections.map((section) => {
    if (!section.records.length) return '';
    const isPhi = input.type === 'best30' && section.id.toLowerCase().includes('phi');
    const cards = section.records.map((record) => {
      const levelIndex = Math.max(0, Math.min(3, record.levelIndex));
      if (isPhi) {
        const rank = `P${phiIndex + 1}`;
        phiIndex += 1;
        return scoreCard(input, record, rank, true, false, cutoffRks, false, levelIndex);
      }
      const index = bestIndex;
      bestIndex += 1;
      return scoreCard(
        input,
        record,
        `#${pageOffset + index + 1}`,
        false,
        index < bestLimit,
        index < cutoffIndex ? record.rating : cutoffRks,
        !lowestPhiRks || record.rating > lowestPhiRks,
        levelIndex,
      );
    }).join('');
    return `<section class="score-section" aria-label="${escapePhigrosBestImageHtml(section.title)}"><div class="section-divider"><span>${escapePhigrosBestImageHtml(section.title)}${section.titleNote ? `<small class="section-divider-note">（${escapePhigrosBestImageHtml(section.titleNote)}）</small>` : ''}</span></div><div class="score-grid">${cards || '<div class="empty-section">暂无符合条件的成绩</div>'}</div></section>`;
  }).join('');
}

function stats(input: PhigrosBestImageHtmlInput): string {
  const order = [
    { label: 'EZ', index: 0 }, { label: 'HD', index: 1 },
    { label: 'IN', index: 2 }, { label: 'AT', index: 3 },
  ] as const;
  const rows: [string, readonly (string | number)[]][] = [
    ['C', order.map(({ index }) => input.progress.cleared[index] ?? 0)],
    ['FC', order.map(({ index }) => input.progress.fullCombo[index] ?? 0)],
    ['Phi', order.map(({ index }) => input.progress.phi[index] ?? 0)],
  ];
  const head = `<div class="stats-line stats-head"><span>进度</span>${order.map(({ label }) => `<span>${label}</span>`).join('')}</div>`;
  const body = rows.map(([label, values]) => (
    `<div class="stats-line"><span>${label}</span>${values.map((value) => `<span>${escapePhigrosBestImageHtml(value)}</span>`).join('')}</div>`
  )).join('');
  return `<div class="stats-card">${head}${body}</div>`;
}

export function buildPhigrosBestImageAppHtml(input: PhigrosBestImageHtmlInput): string {
  const width = Math.max(1, Math.round(input.width));
  const minimumHeight = minimumBestImageHeight(width);
  const pageCount = Math.max(1, Math.floor(input.page.pageCount));
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(input.page.pageIndex)));
  const name = input.playerName.trim() || '未读取玩家资料';
  const initial = Array.from(name)[0] ?? '?';
  const challengeTheme = resolvePhigrosChallengeTheme(input.challengeModeRank);
  const challengeFill = cssLinearGradient(challengeTheme.fillColors, challengeTheme.fillLocations);
  const challengeBorder = cssLinearGradient(challengeTheme.borderColors, challengeTheme.borderLocations);
  const backgroundUrl = input.backgroundDataUri ?? null;
  const avatarUrl = input.avatarDataUri ?? null;

  const pageInset = px(width * 0.04);
  const headerWidth = width - pageInset * 2;
  const headerHeight = px(width * 244 / 1080);
  const headerGap = px(width * 14 / 1080);
  const avatarSize = px(width * 112 / 1080);
  const markerRowHeight = pageCount > 1 ? px(width * 44 / 1080) : 0;
  const scoresGap = px(width * 16 / 1080);
  const scoresTop = pageInset + headerHeight + markerRowHeight + scoresGap;
  const gridGap = px(width * 14 / 1080);
  const scoreCardPadding = px(width * 8 / 1080);
  const jacketSize = px(width * 86 / 1080);

  const avatarMarkup = avatarUrl
    ? `<img class="avatar-image" alt="" src="${escapePhigrosBestImageHtml(avatarUrl)}">`
    : `<div class="avatar-fallback">${escapePhigrosBestImageHtml(initial)}</div>`;
  const backgroundMarkup = backgroundUrl
    ? `<img class="background-image" alt="" src="${escapePhigrosBestImageHtml(backgroundUrl)}">`
    : '';
  const pageMarker = pageCount > 1
    ? `<div class="app-page-marker-row"><div class="page-marker">第 ${pageIndex + 1} / ${pageCount} 页</div></div>`
    : '';
  const scoreContent = scoreCards(input) || '<div class="empty-scores">暂无符合条件的成绩</div>';
  const imageFooter = `<div class="image-footer" aria-label="图片署名">
    <div>Designed by EgawaHokori. Data from TapTap.</div>
    <div>Generated by rRanker</div>
  </div>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#DDE3EC}
    body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
    .preview-stage{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;overflow:hidden;background:#DDE3EC}
    .canvas{position:absolute;left:0;top:0;width:${width}px;min-height:${minimumHeight}px;overflow:hidden;transform-origin:top left;background:#E7EDF5}
    .canvas-background{position:absolute;inset:0;overflow:hidden;background:linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%)}
    .background-image{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:cover;object-position:center;filter:blur(${px(width * 12 / 1080)}px);transform:scale(1.04)}
    .background-veil{position:absolute;inset:0;background:rgba(238,242,248,.52)}
    .app-header{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset}px;display:flex;width:${headerWidth}px;height:${headerHeight}px;align-items:stretch;gap:${headerGap}px}
    .header-left{display:flex;min-width:0;flex:1.2;flex-direction:column;gap:${headerGap}px}
    .identity-row{display:flex;height:${avatarSize}px;align-items:center;gap:${headerGap}px}
    .avatar-shell{width:${avatarSize}px;height:${avatarSize}px;flex:0 0 ${avatarSize}px;overflow:hidden;border:${Math.max(2, px(width * 3 / 1080))}px solid rgba(255,255,255,.92);border-radius:${px(width * 18 / 1080)}px;background:#DDE5F0;box-shadow:0 ${px(width * 10 / 1080)}px ${px(width * 22 / 1080)}px rgba(31,44,75,.28)}
    .avatar-image{display:block;width:100%;height:100%;object-fit:contain;object-position:center}
    .avatar-fallback{display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#52647F;font:950 ${px(width * 48 / 1080)}px/1 system-ui,sans-serif;background:linear-gradient(145deg,#F8FBFF,#C7D5EA)}
    .name-card{display:flex;min-width:0;height:${avatarSize}px;flex:1;align-items:center;justify-content:center;overflow:hidden;padding:0 ${px(width * 22 / 1080)}px;border:1px solid rgba(255,255,255,.82);border-radius:${px(width * 18 / 1080)}px;background:rgba(255,255,255,.82);box-shadow:0 ${px(width * 6 / 1080)}px ${px(width * 16 / 1080)}px rgba(35,48,70,.12);color:#1F2937;font:900 ${px(width * 34 / 1080)}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .rating-card{flex:1;min-width:0;border-radius:${px(width * 18 / 1080)}px;padding:${px(width * 3 / 1080)}px;background:var(--rating-border);box-shadow:0 ${px(width * 10 / 1080)}px ${px(width * 26 / 1080)}px rgba(46,63,96,.22)}
    .rating-card-inner{position:relative;display:flex;width:100%;height:100%;align-items:center;gap:${px(width * 12 / 1080)}px;overflow:hidden;padding:${px(width * 14 / 1080)}px ${px(width * 18 / 1080)}px;border-radius:${px(width * 15 / 1080)}px;background:var(--rating-fill);color:var(--rating-text)}
    .rating-copy{display:flex;min-width:0;flex:1;flex-direction:column;justify-content:center;gap:${px(width * 6 / 1080)}px}
    .rating-label{font:800 ${px(width * 14 / 1080)}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.08em;opacity:.85}
    .rating-value{font:900 ${px(width * 40 / 1080)}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.02em;white-space:nowrap}
    .rating-meta{font:700 ${px(width * 15 / 1080)}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.78}
    .rating-badge{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;gap:${px(width * 6 / 1080)}px}
    .badge-title{font:700 ${px(width * 12 / 1080)}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.06em;opacity:.85}
    .badge-value{min-width:${px(width * 88 / 1080)}px;display:flex;align-items:center;justify-content:center;padding:${px(width * 8 / 1080)}px ${px(width * 12 / 1080)}px;border-radius:${px(width * 14 / 1080)}px;background:rgba(255,255,255,.22);font:900 ${px(width * 26 / 1080)}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.02em}
    .stats-card{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.82);border-radius:${px(width * 18 / 1080)}px;background:rgba(255,255,255,.78);box-shadow:0 ${px(width * 6 / 1080)}px ${px(width * 18 / 1080)}px rgba(35,48,70,.12);backdrop-filter:blur(${px(width * 12 / 1080)}px)}
    .stats-line{display:grid;flex:1;grid-template-columns:${px(width * 52 / 1080)}px repeat(4,minmax(0,1fr));align-items:center;color:#374151;font:800 ${px(width * 15 / 1080)}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}
    .stats-line span{display:flex;align-items:center;justify-content:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .stats-line+.stats-line{border-top:1px solid rgba(148,163,184,.35)}
    .stats-head{color:#6B7280;font:800 ${px(width * 13 / 1080)}px/1 system-ui,sans-serif;letter-spacing:.08em}
    .app-page-marker-row{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset + headerHeight}px;display:flex;width:${headerWidth}px;height:${markerRowHeight}px;align-items:center;justify-content:flex-end}
    .page-marker{display:flex;height:${px(width * 28 / 1080)}px;align-items:center;justify-content:center;padding:0 ${px(width * 12 / 1080)}px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.72);color:#4B5563;font:700 ${px(width * 13 / 1080)}px/1 system-ui,sans-serif}
    .scores-content{position:absolute;z-index:1;left:${pageInset}px;right:${pageInset}px;top:${scoresTop}px;padding-bottom:${pageInset}px}
    .score-section+.score-section{margin-top:${px(width * 26 / 1080)}px}
    .section-divider{display:flex;align-items:center;gap:${px(width * 13 / 1080)}px;margin:0 0 ${px(width * 14 / 1080)}px;color:rgba(22,29,43,.78);font:800 ${px(width * 20 / 1080)}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:${Math.max(1, px(width * 0.8 / 1080))}px;white-space:nowrap}
    .section-divider::before,.section-divider::after{content:"";height:${Math.max(1, px(width * 1.2 / 1080))}px;flex:1;background:linear-gradient(90deg,transparent,rgba(28,38,57,.55))}
    .section-divider::after{background:linear-gradient(90deg,rgba(28,38,57,.55),transparent)}
    .section-divider-note{margin-left:${px(width * 6 / 1080)}px;font-size:${px(width * 14 / 1080)}px;font-weight:600;letter-spacing:0;opacity:.72}
    .score-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:${gridGap}px}
    .score-card{position:relative;display:flex;min-width:0;flex-direction:column;overflow:hidden;padding:${scoreCardPadding}px;border:1px solid rgba(255,255,255,.35);border-radius:${px(width * 14 / 1080)}px;background:var(--card-bg);box-shadow:0 ${px(width * 5 / 1080)}px ${px(width * 15 / 1080)}px rgba(25,38,60,.28);color:var(--card-fg);isolation:isolate}
    .card-art{position:absolute;z-index:0;inset:0}
    .card-art-image{display:block;width:100%;height:100%;object-fit:cover;filter:blur(${px(width * 5 / 1080)}px);transform:scale(1.05)}
    .card-art-veil{position:absolute;inset:0;background:var(--card-bg);opacity:.8;-webkit-backdrop-filter:blur(${px(width * 6 / 1080)}px);backdrop-filter:blur(${px(width * 6 / 1080)}px)}
    .score-card-head{position:relative;z-index:1;display:flex;min-width:0;height:${jacketSize}px;align-items:stretch;gap:${px(width * 10 / 1080)}px}
    .jacket-shell{position:relative;width:${jacketSize}px;height:${jacketSize}px;flex:0 0 ${jacketSize}px;overflow:hidden;border:${Math.max(2, px(width * 3 / 1080))}px solid rgba(255,255,255,.85);border-radius:${px(width * 10 / 1080)}px;background:rgba(0,0,0,.18)}
    .song-jacket{position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;object-fit:cover}
    .jacket-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.62);font:700 ${px(width * 30 / 1080)}px/1 system-ui,sans-serif}
    .song-copy{position:relative;display:flex;min-width:0;height:100%;min-height:0;flex:1;flex-direction:column;justify-content:center;gap:${px(width * 6 / 1080)}px;overflow:hidden;padding:${px(width * 2 / 1080)}px 0}
    .song-rank{overflow:hidden;color:rgba(255,255,255,.6);font:800 ${px(width * 14 / 1080)}px/1 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .song-title{display:-webkit-box;overflow:hidden;color:#FFFFFF;font:800 ${px(width * 18 / 1080)}px/1.18 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal}
    .score-separator{position:relative;z-index:1;height:1px;margin:${px(width * 7 / 1080)}px 0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)}
    .achievement-row{position:relative;z-index:1;display:flex;min-width:0;align-items:center;gap:${px(width * 6 / 1080)}px}
    .achievement-with-rate{display:flex;min-width:0;align-items:center;gap:${px(width * 6 / 1080)}px}
    .achievement{min-width:0;overflow:hidden;color:#FFFFFF;font:900 ${px(width * 19 / 1080)}px/1.06 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
    .rate-badge{display:inline-flex;min-width:${px(width * 24 / 1080)}px;height:${px(width * 18 / 1080)}px;flex:0 0 auto;align-items:center;justify-content:center;padding:0 ${px(width * 6 / 1080)}px;border-radius:${px(width * 6 / 1080)}px;background:var(--rate-bg);color:var(--rate-fg);font:900 ${px(width * 12 / 1080)}px/1 system-ui,sans-serif;white-space:nowrap}
    .acc-value{margin-left:auto;flex:0 0 auto;color:rgba(255,255,255,.78);font:800 ${px(width * 14 / 1080)}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
    .rating-row{position:relative;z-index:1;display:flex;min-width:0;align-items:center;justify-content:space-between;gap:${px(width * 6 / 1080)}px;margin-top:${px(width * 8 / 1080)}px;color:rgba(255,255,255,.88);font:700 ${px(width * 14 / 1080)}px/1.15 system-ui,sans-serif;white-space:nowrap}
    .song-rating{min-width:0;overflow:hidden;font-weight:900;font-variant-numeric:tabular-nums;text-overflow:ellipsis}
    .suggest{flex:0 0 auto;color:#A5E3FF;font-weight:800;font-variant-numeric:tabular-nums}
    .suggest-empty{color:rgba(255,255,255,.55)}
    .empty-section{grid-column:1/-1;display:flex;min-height:${px(width * 80 / 1080)}px;align-items:center;justify-content:center;color:#697586;font:700 ${px(width * 14 / 1080)}px/1.4 system-ui,sans-serif}
    .empty-scores{display:flex;min-height:${px(width * 150 / 1080)}px;align-items:center;justify-content:center;border:1px dashed rgba(91,105,126,.45);border-radius:${px(width * 14 / 1080)}px;background:rgba(255,255,255,.64);color:#697586;font:700 ${px(width * 14 / 1080)}px/1.4 system-ui,sans-serif}
    .image-footer{margin-top:${px(width * 44 / 1080)}px;text-align:center;color:rgba(60,70,90,.85);font-weight:600;font-size:${px(width * 14 / 1080)}px;line-height:1.5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .image-footer>div{white-space:nowrap}
  </style>
</head>
<body>
  <div class="preview-stage">
    <main class="canvas" data-image-type="${input.type}" data-rating-style="app" aria-label="成绩图片预览">
      <div class="canvas-background">${backgroundMarkup}<div class="background-veil"></div></div>
      <header class="app-header" data-layout-content aria-label="玩家资料">
        <div class="header-left">
          <div class="identity-row">
            <div class="avatar-shell">${avatarMarkup}</div>
            <div class="name-card">${escapePhigrosBestImageHtml(name)}</div>
          </div>
          <div class="rating-card" style="--rating-border:${escapePhigrosBestImageHtml(challengeBorder)};--rating-fill:${escapePhigrosBestImageHtml(challengeFill)};--rating-text:${challengeTheme.textColor}">
            <div class="rating-card-inner">
              <div class="rating-copy">
                <div class="rating-label">RKS</div>
                <div class="rating-value">${escapePhigrosBestImageHtml(input.rks)}</div>
                <div class="rating-meta">${escapePhigrosBestImageHtml(input.dataAmount)}</div>
              </div>
              <div class="rating-badge">
                <div class="badge-title">课题模式</div>
                <div class="badge-value">${escapePhigrosBestImageHtml(input.challenge)}</div>
              </div>
            </div>
          </div>
        </div>
        ${stats(input)}
      </header>
      ${pageMarker}
      <div class="scores-content" data-layout-content aria-label="成绩列表">${scoreContent}${imageFooter}</div>
    </main>
  </div>
  <script>
    (() => {
      const OUTPUT_WIDTH = ${width};
      const MINIMUM_HEIGHT = ${minimumHeight};
      const canvas = document.querySelector('.canvas');
      let lastHeight = 0;
      let pending = false;
      let readySent = false;

      const postToNative = (message) => {
        const bridge = window.ReactNativeWebView;
        if (!bridge || typeof bridge.postMessage !== 'function') return false;
        bridge.postMessage(JSON.stringify(message));
        return true;
      };

      const runtimeMessage = {
        type: 'best-image-runtime',
        width: OUTPUT_WIDTH,
        userAgent: window.navigator && typeof window.navigator.userAgent === 'string'
          ? window.navigator.userAgent
          : '',
      };
      postToNative(runtimeMessage);
      window.setTimeout(() => postToNative(runtimeMessage), 250);

      const measureAndFit = () => {
        pending = false;
        const layoutChildren = Array.from(canvas.children).filter((child) => child.hasAttribute('data-layout-content'));
        const contentHeight = layoutChildren.reduce((maximum, child) => Math.max(maximum, child.offsetTop + child.scrollHeight), 0);
        const logicalHeight = Math.max(MINIMUM_HEIGHT, Math.ceil(contentHeight));
        const nextHeight = logicalHeight + 'px';
        if (canvas.style.height !== nextHeight) canvas.style.height = nextHeight;

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || OUTPUT_WIDTH;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || MINIMUM_HEIGHT;
        const exportViewport = Math.abs(viewportWidth - OUTPUT_WIDTH) < 2
          && viewportHeight + 2 >= Math.min(logicalHeight, MINIMUM_HEIGHT);
        if (exportViewport) {
          canvas.style.left = '0px';
          canvas.style.top = '0px';
          canvas.style.transform = 'scale(1)';
        } else {
          const scale = Math.min(viewportWidth / OUTPUT_WIDTH, viewportHeight / logicalHeight);
          canvas.style.left = Math.max(0, (viewportWidth - OUTPUT_WIDTH * scale) / 2) + 'px';
          canvas.style.top = Math.max(0, (viewportHeight - logicalHeight * scale) / 2) + 'px';
          canvas.style.transform = 'scale(' + scale + ')';
        }

        if (logicalHeight !== lastHeight) {
          lastHeight = logicalHeight;
          postToNative({ type: 'best-image-height', width: OUTPUT_WIDTH, height: logicalHeight });
        }
      };
      const schedule = () => {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(measureAndFit);
      };
      let resizeObserver = null;
      if (typeof window.ResizeObserver === 'function') {
        resizeObserver = new window.ResizeObserver(schedule);
        resizeObserver.observe(canvas);
        Array.from(canvas.children)
          .filter((child) => child.hasAttribute('data-layout-content'))
          .forEach((child) => resizeObserver.observe(child));
      }
      new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach((node) => {
          if (resizeObserver && node instanceof Element && node.hasAttribute('data-layout-content')) resizeObserver.observe(node);
        }));
        schedule();
      }).observe(canvas, { childList: true, subtree: true });
      window.addEventListener('resize', schedule);
      window.addEventListener('load', schedule);
      schedule();

      const imageReady = Array.from(document.images).map((image) => image.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            const settle = () => {
              image.removeEventListener('load', settle);
              image.removeEventListener('error', settle);
              resolve();
            };
            image.addEventListener('load', settle);
            image.addEventListener('error', settle);
          }));
      const assetTimeout = new Promise((resolve) => window.setTimeout(resolve, 5000));
      Promise.race([Promise.all(imageReady), assetTimeout]).then(() => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          measureAndFit();
          if (!readySent) {
            readySent = true;
            const readyMessage = { type: 'best-image-ready', width: OUTPUT_WIDTH, height: lastHeight || MINIMUM_HEIGHT };
            postToNative(readyMessage);
            window.setTimeout(() => postToNative(readyMessage), 250);
          }
        }));
      });
    })();
  </script>
</body>
</html>`;
}
