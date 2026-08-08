/*
 * Phigros 成绩图「应用风格」模板。
 * 自绘 HTML（参考舞萌应用风格 banner 与中二节奏 profile 卡），不依赖 phi-plugin 模板 CSS，
 * 字体使用系统栈；素材（头像/背景/挑战/数据图标）为 data URI，可完全自包含。
 * 导出协议（best-image-runtime/height/ready + data-layout-content）与游戏风格保持一致。
 */
import { formatPhigrosSongRks } from '@/domain/phigros';
import { minimumBestImageHeight } from '@/features/best-image/build-best-image-html';
import {
  escapePhigrosBestImageHtml,
  ratingName,
  suggestion,
  type PhigrosBestImageHtmlInput,
} from './build-phigros-best-image-html';
import {
  phigrosAccAverageKey,
  type PhigrosAccAverage,
} from './load-phigros-acc-averages';
import type { PhigrosBestImagePage } from './phigros-best-image';

const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;

const LEVEL_COLORS: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#E6F5ED', fg: '#3E9D6B' },
  1: { bg: '#E8F0FE', fg: '#3B82F6' },
  2: { bg: '#FDE8EC', fg: '#D84B68' },
  3: { bg: '#F3F4F6', fg: '#374151' },
};

const RATE_COLORS: Record<string, { bg: string; fg: string }> = {
  f: { bg: '#F3F4F6', fg: '#6B7280' },
  c: { bg: '#F3F4F6', fg: '#6B7280' },
  b: { bg: '#F3F4F6', fg: '#6B7280' },
  a: { bg: '#F3F4F6', fg: '#6B7280' },
  s: { bg: '#FDF2F8', fg: '#DB2777' },
  v: { bg: '#4B5563', fg: '#FFFFFF' },
  vFc: { bg: '#E0F2FE', fg: '#0EA5E9' },
  phi: { bg: '#FFF7E6', fg: '#B8860B' },
  FC: { bg: '#ECFDF5', fg: '#059669' },
  NEW: { bg: '#F3F4F6', fg: '#9CA3AF' },
};

const RATE_LABELS: Record<string, string> = {
  f: 'F', c: 'C', b: 'B', a: 'A', s: 'S', v: 'V', vFc: 'V', phi: 'φ', FC: 'FC', NEW: 'NEW',
};

function px(value: number): number {
  return Math.max(1, Math.round(value));
}

function averageRibbon(average: PhigrosAccAverage | undefined): string {
  if (!average) return '';
  return `<div class="avg-ribbon"><span>Avg</span><strong>${average.value.toFixed(4)}%</strong></div>`;
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
  const level = LEVELS[levelIndex] ?? record.level;
  const score = Math.round(record.dxScore ?? 0);
  const title = input.titles[record.songId] ?? record.title ?? record.songId;
  const illustration = input.illustrations[record.songId];
  const rate = ratingName(score, record.fc);
  const rateKey = rate === 'v' && record.fc ? 'vFc' : rate;
  const rateColors = RATE_COLORS[rateKey] ?? RATE_COLORS.f!;
  const levelColors = LEVEL_COLORS[levelIndex] ?? LEVEL_COLORS[3]!;
  const push = isPhi || record.achievements >= 100 ? { label: '无法推分', type: null } : suggestion(
    record.difficultyConstant,
    referenceRks,
    Number(input.rks),
    allowPerfectFallback,
  );
  const average = isPhi ? undefined : input.accAverages?.[phigrosAccAverageKey(record)];
  return `<article class="score-card" aria-label="第 ${escapePhigrosBestImageHtml(rank)} 名 ${escapePhigrosBestImageHtml(title)}">
    <div class="score-card-head">
      <div class="jacket-shell">
        <span class="jacket-fallback">♪</span>
        ${illustration ? `<img class="song-jacket" alt="" src="${escapePhigrosBestImageHtml(illustration)}">` : ''}
      </div>
      <div class="song-copy">
        <span class="song-rank">${escapePhigrosBestImageHtml(rank)}</span>
        <strong class="song-title">${escapePhigrosBestImageHtml(title)}</strong>
        <span class="level-badge" style="--level-bg:${levelColors.bg};--level-fg:${levelColors.fg}">${escapePhigrosBestImageHtml(level)}&ensp;${record.difficultyConstant.toFixed(1)}</span>
      </div>
    </div>
    <div class="score-separator"></div>
    <div class="achievement-row">
      <span class="achievement-with-rate"><strong class="achievement">${score}</strong><span class="rate-badge" style="--rate-bg:${rateColors.bg};--rate-fg:${rateColors.fg}">${escapePhigrosBestImageHtml(RATE_LABELS[rateKey] ?? rate)}</span></span>
      <span class="acc-value">${record.achievements.toFixed(2)}%</span>
    </div>
    <div class="rating-row">
      <span class="song-rating"><span>RKS</span><strong>${formatPhigrosSongRks(record.rating)}</strong></span>
      <span class="suggest${push.type === null ? ' suggest-empty' : ''}">${escapePhigrosBestImageHtml(push.label)}</span>
    </div>
    ${averageRibbon(average)}
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
  return `<div class="stats-row" data-layout-content><div class="stats-card">${head}${body}</div></div>`;
}

export function buildPhigrosBestImageAppHtml(input: PhigrosBestImageHtmlInput): string {
  const width = Math.max(1, Math.round(input.width));
  const minimumHeight = minimumBestImageHeight(width);
  const pageCount = Math.max(1, Math.floor(input.page.pageCount));
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(input.page.pageIndex)));
  const name = input.playerName.trim() || '未读取玩家资料';
  const initial = Array.from(name)[0] ?? '?';
  const challengeLevel = Math.min(5, Math.max(0, Math.floor(input.challengeModeRank / 100)));
  const challengeUrl = input.templateAssets.challengeIconUrls[challengeLevel] ?? input.templateAssets.challengeIconUrls[0];
  const backgroundUrl = input.backgroundDataUri ?? null;
  const avatarUrl = input.avatarDataUri ?? null;

  const pageInset = px(width * 0.04);
  const bannerWidth = width - pageInset * 2;
  const bannerPaddingY = px(width * 23 / 1080);
  const avatarSize = px(width * 130 / 1080);
  const bannerHeight = avatarSize + bannerPaddingY * 2;
  const bannerRadius = px(width * 20 / 1080);
  const identityGap = px(width * 22 / 1080);
  const identityHeight = px(width * 124 / 1080);
  const identityPaddingX = px(width * 30 / 1080);
  const nameFontSize = px(width * 42 / 1080);
  const nameMinimumFontSize = px(width * 24 / 1080);
  const ratingLabelSize = px(width * 17 / 1080);
  const ratingValueSize = px(width * 32 / 1080);
  const metaGap = px(width * 14 / 1080);
  const metaFontSize = px(width * 17 / 1080);
  const challengeIconSize = px(width * 34 / 1080);
  const markerRowHeight = pageCount > 1 ? px(width * 44 / 1080) : 0;
  const statsGap = px(width * 14 / 1080);
  const statsHeight = px(width * 150 / 1080);
  const scoresGap = px(width * 16 / 1080);
  const scoresTop = pageInset + bannerHeight + markerRowHeight + statsGap + statsHeight + scoresGap;
  const gridGap = px(width * 10 / 1080);
  const scoreCardPadding = px(width * 7 / 1080);
  const jacketSize = px(width * 63 / 1080);

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
    .profile-banner{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset}px;display:flex;width:${bannerWidth}px;height:${bannerHeight}px;align-items:center;gap:${identityGap}px;padding:${bannerPaddingY}px ${px(width * 30 / 1080)}px;border:1px solid rgba(255,255,255,.84);border-radius:${bannerRadius}px;background:linear-gradient(100deg,#9EB5D8 0%,#E8EDF6 38%,#F5D9B4 70%,#D99591 100%);box-shadow:0 ${px(width * 16 / 1080)}px ${px(width * 40 / 1080)}px rgba(46,63,96,.24),inset 0 1px rgba(255,255,255,.72);isolation:isolate}
    .profile-banner .avatar{position:relative;z-index:1;width:${avatarSize}px;height:${avatarSize}px;flex:0 0 ${avatarSize}px;overflow:hidden;border:${Math.max(2, px(width * 4 / 1080))}px solid rgba(255,255,255,.92);border-radius:${px(width * 20 / 1080)}px;background:#DDE5F0;box-shadow:0 ${px(width * 10 / 1080)}px ${px(width * 22 / 1080)}px rgba(31,44,75,.3)}
    .avatar-image{display:block;width:100%;height:100%;object-fit:contain;object-position:center}
    .avatar-fallback{display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#52647F;font:950 ${px(width * 56 / 1080)}px/1 system-ui,sans-serif;background:linear-gradient(145deg,#F8FBFF,#C7D5EA)}
    .identity-card{position:relative;z-index:1;display:flex;min-width:0;height:${identityHeight}px;flex-direction:column;justify-content:center;overflow:hidden;padding:${px(width * 14 / 1080)}px ${identityPaddingX}px;border:1px solid rgba(255,255,255,.85);border-radius:${px(width * 20 / 1080)}px;background:rgba(255,255,255,.88);box-shadow:0 ${px(width * 8 / 1080)}px ${px(width * 22 / 1080)}px rgba(42,55,82,.16),inset 0 1px rgba(255,255,255,.8)}
    .app-player-name{width:max-content;max-width:100%;overflow:visible;color:#1F2937;font:950 ${nameFontSize}px/1.02 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.035em;transform-origin:left center;white-space:nowrap}
    .identity-rating{display:flex;align-items:baseline;gap:${px(width * 10 / 1080)}px;margin-top:${px(width * 12 / 1080)}px;color:#4B5563;font:800 ${ratingLabelSize}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.1em;white-space:nowrap}
    .identity-rating strong{color:#111827;font-size:${ratingValueSize}px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:.02em}
    .profile-meta{position:relative;z-index:1;display:flex;min-width:0;margin-left:auto;flex-direction:column;align-items:flex-end;gap:${metaGap}px;color:rgba(31,41,55,.85);font:700 ${metaFontSize}px/1 system-ui,sans-serif;white-space:nowrap}
    .meta-row{display:flex;align-items:center;gap:${px(width * 8 / 1080)}px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
    .meta-row img{width:${challengeIconSize}px;height:${challengeIconSize}px;object-fit:contain}
    .meta-row.meta-dim{opacity:.66}
    .app-page-marker-row{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset + bannerHeight}px;display:flex;width:${bannerWidth}px;height:${markerRowHeight}px;align-items:center;justify-content:flex-end}
    .page-marker{display:flex;height:${px(width * 28 / 1080)}px;align-items:center;justify-content:center;padding:0 ${px(width * 12 / 1080)}px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.72);color:#4B5563;font:700 ${px(width * 13 / 1080)}px/1 system-ui,sans-serif}
    .stats-row{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset + bannerHeight + markerRowHeight + statsGap}px;width:${bannerWidth}px;height:${statsHeight}px}
    .stats-card{display:flex;width:100%;height:100%;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.82);border-radius:${px(width * 14 / 1080)}px;background:rgba(255,255,255,.78);box-shadow:0 ${px(width * 6 / 1080)}px ${px(width * 18 / 1080)}px rgba(35,48,70,.12);backdrop-filter:blur(${px(width * 12 / 1080)}px)}
    .stats-line{display:grid;flex:1;grid-template-columns:${px(width * 110 / 1080)}px repeat(4,minmax(0,1fr));align-items:center;color:#374151;font:800 ${px(width * 18 / 1080)}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}
    .stats-line span{display:flex;align-items:center;justify-content:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .stats-line+.stats-line{border-top:1px solid rgba(148,163,184,.35)}
    .stats-head{color:#6B7280;font:800 ${px(width * 15 / 1080)}px/1 system-ui,sans-serif;letter-spacing:.08em}
    .scores-content{position:absolute;z-index:1;left:${pageInset}px;right:${pageInset}px;top:${scoresTop}px;padding-bottom:${pageInset}px}
    .score-section+.score-section{margin-top:${px(width * 26 / 1080)}px}
    .section-divider{display:flex;align-items:center;gap:${px(width * 13 / 1080)}px;margin:0 0 ${px(width * 14 / 1080)}px;color:rgba(22,29,43,.78);font:800 ${px(width * 20 / 1080)}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:${Math.max(1, px(width * 0.8 / 1080))}px;white-space:nowrap}
    .section-divider::before,.section-divider::after{content:"";height:${Math.max(1, px(width * 1.2 / 1080))}px;flex:1;background:linear-gradient(90deg,transparent,rgba(28,38,57,.55))}
    .section-divider::after{background:linear-gradient(90deg,rgba(28,38,57,.55),transparent)}
    .section-divider-note{margin-left:${px(width * 6 / 1080)}px;font-size:${px(width * 14 / 1080)}px;font-weight:600;letter-spacing:0;opacity:.72}
    .score-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:${gridGap}px}
    .score-card{display:flex;min-width:0;flex-direction:column;overflow:hidden;padding:${scoreCardPadding}px;border:1px solid rgba(255,255,255,.82);border-radius:${px(width * 13 / 1080)}px;background:rgba(255,255,255,.86);box-shadow:0 ${px(width * 5 / 1080)}px ${px(width * 15 / 1080)}px rgba(25,38,60,.2);color:#1F2937}
    .score-card-head{display:flex;min-width:0;height:${jacketSize}px;align-items:stretch;gap:${px(width * 7 / 1080)}px}
    .jacket-shell{position:relative;width:${jacketSize}px;height:${jacketSize}px;flex:0 0 ${jacketSize}px;overflow:hidden;border:${Math.max(2, px(width * 3 / 1080))}px solid #FFFFFF;border-radius:${px(width * 8 / 1080)}px;background:rgba(148,163,184,.18)}
    .song-jacket{position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;object-fit:cover}
    .jacket-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font:700 ${px(width * 24 / 1080)}px/1 system-ui,sans-serif}
    .song-copy{position:relative;display:flex;min-width:0;height:100%;min-height:0;flex:1;flex-direction:column;justify-content:center;gap:${px(width * 5 / 1080)}px;overflow:hidden;padding:${px(width * 2 / 1080)}px 0}
    .song-rank{overflow:hidden;color:#9CA3AF;font:800 ${px(width * 13 / 1080)}px/1 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .song-title{display:-webkit-box;overflow:hidden;color:#1F2937;font:800 ${px(width * 15 / 1080)}px/1.18 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal}
    .level-badge{display:inline-flex;width:max-content;max-width:100%;align-items:center;justify-content:center;overflow:hidden;padding:${px(width * 2 / 1080)}px ${px(width * 7 / 1080)}px;border-radius:999px;background:var(--level-bg);color:var(--level-fg);font:900 ${px(width * 11 / 1080)}px/1 system-ui,sans-serif;white-space:nowrap}
    .score-separator{height:1px;margin:${px(width * 6 / 1080)}px 0;background:linear-gradient(90deg,transparent,rgba(107,114,128,.5),transparent)}
    .achievement-row{display:flex;min-width:0;align-items:center;gap:${px(width * 5 / 1080)}px}
    .achievement-with-rate{display:flex;min-width:0;align-items:center;gap:${px(width * 5 / 1080)}px}
    .achievement{min-width:0;overflow:hidden;color:#111827;font:900 ${px(width * 17 / 1080)}px/1.06 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
    .rate-badge{display:inline-flex;min-width:${px(width * 22 / 1080)}px;height:${px(width * 16 / 1080)}px;flex:0 0 auto;align-items:center;justify-content:center;padding:0 ${px(width * 5 / 1080)}px;border-radius:${px(width * 6 / 1080)}px;background:var(--rate-bg);color:var(--rate-fg);font:900 ${px(width * 11 / 1080)}px/1 system-ui,sans-serif;white-space:nowrap}
    .acc-value{margin-left:auto;flex:0 0 auto;color:#6B7280;font:800 ${px(width * 12 / 1080)}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
    .rating-row{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:${px(width * 4 / 1080)}px;margin-top:${px(width * 6 / 1080)}px;color:#6B7280;font:700 ${px(width * 12 / 1080)}px/1.15 system-ui,sans-serif;white-space:nowrap}
    .song-rating{display:inline-flex;min-width:0;align-items:baseline;gap:${px(width * 5 / 1080)}px}.song-rating strong{color:#111827;font-weight:900;font-variant-numeric:tabular-nums}
    .suggest{flex:0 0 auto;color:#0EA5E9;font-weight:800;font-variant-numeric:tabular-nums}
    .suggest-empty{color:#9CA3AF}
    .avg-ribbon{display:flex;align-items:center;gap:${px(width * 6 / 1080)}px;margin-top:${px(width * 6 / 1080)}px;padding:${px(width * 4 / 1080)}px ${px(width * 8 / 1080)}px;border-radius:999px;background:linear-gradient(90deg,rgba(224,242,254,.9),rgba(254,243,199,.9));color:#475569;font:800 ${px(width * 12 / 1080)}px/1 system-ui,sans-serif;white-space:nowrap}
    .avg-ribbon span{opacity:.75}.avg-ribbon strong{color:#1D4ED8;font-weight:900;font-variant-numeric:tabular-nums}
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
      <section class="profile-banner" data-layout-content aria-label="玩家资料">
        <div class="avatar">${avatarMarkup}</div>
        <div class="identity-card" id="identity-card">
          <div class="app-player-name" id="player-name">${escapePhigrosBestImageHtml(name)}</div>
          <div class="identity-rating"><span>RKS</span><strong>${escapePhigrosBestImageHtml(input.rks)}</strong></div>
        </div>
        <div class="profile-meta">
          <div class="meta-row"><img alt="" src="${escapePhigrosBestImageHtml(challengeUrl)}"><span>${escapePhigrosBestImageHtml(input.challenge)}</span></div>
          <div class="meta-row meta-dim">${escapePhigrosBestImageHtml(input.syncedAt)}</div>
          <div class="meta-row meta-dim"><img alt="" src="${escapePhigrosBestImageHtml(input.templateAssets.dataIconUrl)}"><span>${escapePhigrosBestImageHtml(input.dataAmount)}</span></div>
        </div>
      </section>
      ${pageMarker}
      ${stats(input)}
      <div class="scores-content" data-layout-content aria-label="成绩列表">${scoreContent}${imageFooter}</div>
    </main>
  </div>
  <script>
    (() => {
      const OUTPUT_WIDTH = ${width};
      const MINIMUM_HEIGHT = ${minimumHeight};
      const APP_NAME_MAX_SIZE = ${nameFontSize};
      const APP_NAME_MIN_SIZE = ${nameMinimumFontSize};
      const canvas = document.querySelector('.canvas');
      let lastHeight = 0;
      let pending = false;
      let readySent = false;

      const fitPlayerName = () => {
        const card = document.getElementById('identity-card');
        const playerName = document.getElementById('player-name');
        if (!card || !playerName) return;
        playerName.style.fontSize = APP_NAME_MAX_SIZE + 'px';
        playerName.style.transform = 'none';
        const availableWidth = Math.max(1, card.clientWidth - 1);
        const naturalWidth = playerName.scrollWidth;
        if (naturalWidth <= availableWidth) return;
        const fittedSize = Math.max(APP_NAME_MIN_SIZE, Math.floor(APP_NAME_MAX_SIZE * availableWidth / naturalWidth));
        playerName.style.fontSize = fittedSize + 'px';
        const fittedWidth = playerName.scrollWidth;
        if (fittedWidth > availableWidth) {
          playerName.style.transform = 'scaleX(' + (availableWidth / fittedWidth).toFixed(4) + ')';
        }
      };

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
        fitPlayerName();
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
