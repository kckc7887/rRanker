import type { ChunithmLevelIndex } from '@/domain/chunithm';
import type { ChunithmPlayer } from '@/domain/chunithm-personal';
import { resolveChunithmPossessionTheme } from '@/domain/chunithm-rating-theme';
import {
  chunithmAchievementBadges,
  chunithmRankUsesGradient,
  formatChunithmRating,
  formatChunithmScore,
  type ChunithmAchievementTone,
  type ChunithmScoreCardData,
} from '@/domain/chunithm-score-presentation';
import {
  BEST_IMAGE_RAINBOW_TEXT,
  layeredBadgeCssBackground,
  STATUS_BADGE_THEMES,
} from '@/features/best-image/best-image-badge-theme';
import { minimumBestImageHeight } from '@/features/best-image/build-best-image-html';
import { chunithmBestImageJacketUrl } from './load-chunithm-best-image-jackets';
import type { ChunithmBestImagePage, ChunithmBestImageType } from './chunithm-best-image';

export type ChunithmBestImageHtmlInput = {
  type: ChunithmBestImageType;
  width: number;
  player: ChunithmPlayer | null;
  ratingDisplay: string;
  page: ChunithmBestImagePage;
  coverUrls?: Readonly<Record<string, string | null>>;
  /** jacketId keyed by score card key */
  jacketIds?: Readonly<Record<string, string>>;
  iconDataUri?: string | null;
};

const DIFFICULTY_COLORS: Record<ChunithmLevelIndex, string> = {
  0: '#4AA58A',
  1: '#E27A24',
  2: '#D6403A',
  3: '#7526CF',
  4: '#17171A',
  5: '#7B61FF',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function badgeToneClass(tone: ChunithmAchievementTone): string {
  if (tone === 'rainbow') return 'tone-rainbow';
  if (tone === 'platinum') return 'tone-platinum';
  if (tone === 'gold') return 'tone-gold';
  return 'tone-neutral';
}

function renderScoreCard(
  record: ChunithmScoreCardData,
  rank: number,
  coverUrls: Readonly<Record<string, string | null>> | undefined,
  jacketIds: Readonly<Record<string, string>> | undefined,
): string {
  const jacketId = jacketIds?.[record.key] ?? record.songId;
  const hasPreparedJacket = coverUrls && Object.hasOwn(coverUrls, jacketId);
  const jacketUrl = hasPreparedJacket
    ? coverUrls[jacketId]
    : chunithmBestImageJacketUrl(jacketId);
  const difficultyColor = DIFFICULTY_COLORS[record.levelIndex];
  const isUltima = record.levelIndex === 4;
  const isWorldsEnd = record.levelIndex === 5;
  const cardClass = isWorldsEnd
    ? 'difficulty-worlds-end'
    : isUltima
      ? 'difficulty-ultima'
      : 'difficulty-solid';
  const cardBackground = isUltima
    ? '#2A2A2E'
    : isWorldsEnd
      ? '#F3E8FE'
      : difficultyColor;
  const constantLabel = isWorldsEnd
    ? (record.worldsEndLabel ?? '—')
    : record.difficultyConstant !== undefined
      ? record.difficultyConstant.toFixed(1)
      : (record.level ?? '—');
  const rankClass = chunithmRankUsesGradient(record.rank) ? 'rank-gradient' : 'rank-solid';
  const badges = chunithmAchievementBadges(record)
    .map((badge) => (
      `<span class="score-badge ${badgeToneClass(badge.tone)}">${escapeHtml(badge.label)}</span>`
    ))
    .join('');

  return `<article class="score-card ${cardClass}" style="--difficulty-color:${difficultyColor};--card-background:${cardBackground}" aria-label="第 ${rank} 名 ${escapeHtml(record.title)}">
    <div class="score-card-head">
      <div class="jacket-shell">
        <span class="jacket-fallback">♪</span>
        ${jacketUrl ? `<img class="song-jacket" alt="" src="${escapeHtml(jacketUrl)}" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="song-copy">
        <span class="song-id">ID${escapeHtml(record.songId)}</span>
        <strong class="song-title">${escapeHtml(record.title)}</strong>
      </div>
    </div>
    <div class="score-separator"></div>
    <div class="achievement-row">
      <span class="achievement-with-rate">
        <strong class="achievement">${escapeHtml(formatChunithmScore(record.score))}</strong>
        <span class="rank-badge ${rankClass}">${escapeHtml(record.rank)}</span>
      </span>
      <span class="rank">#${rank}</span>
    </div>
    <div class="rating-row">
      <span class="song-rating"><span>${escapeHtml(constantLabel)}</span><span class="rating-arrow">→</span><strong>${escapeHtml(formatChunithmRating(record.rating))}</strong></span>
    </div>
    <div class="score-card-foot"><span class="score-badges">${badges}</span></div>
  </article>`;
}

function renderScoreSection(
  title: string,
  records: readonly ChunithmScoreCardData[],
  coverUrls: Readonly<Record<string, string | null>> | undefined,
  jacketIds: Readonly<Record<string, string>> | undefined,
): string {
  const divider = `<div class="section-divider"><span>${escapeHtml(title)}</span></div>`;
  const cards = records.map((record, index) => renderScoreCard(record, index + 1, coverUrls, jacketIds)).join('');
  const content = cards || '<div class="empty-section">暂无符合条件的成绩</div>';
  return `<section class="score-section" aria-label="${escapeHtml(title)}">${divider}<div class="score-grid">${content}</div></section>`;
}

export function buildChunithmBestImageHtml(input: ChunithmBestImageHtmlInput): string {
  const width = Math.max(1, Math.round(input.width));
  const minimumHeight = minimumBestImageHeight(width);
  const player = input.player;
  const name = player?.name?.trim() || '未读取玩家资料';
  const initial = Array.from(name)[0] ?? '?';
  const possessionTheme = resolveChunithmPossessionTheme(player?.rating_possession);
  const pageCount = Math.max(1, Math.floor(input.page.pageCount));
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(input.page.pageIndex)));

  const pageInset = px(width * 0.04);
  const profileWidth = width - pageInset * 2;
  const bannerHeight = px(profileWidth * 116 / 720);
  const bannerRadius = px(profileWidth * 0.013);
  const bannerPaddingX = px(width * 22 / 1080);
  const avatarSize = px(width * 130 / 1080);
  const identityGap = px(width * 22 / 1080);
  const identityHeight = px(width * 124 / 1080);
  const identityMinWidth = px(width * 280 / 1080);
  const identityMaxWidth = profileWidth - bannerPaddingX * 2 - avatarSize - identityGap;
  const identityRadius = px(width * 22 / 1080);
  const nameFontSize = px(width * 42 / 1080);
  const nameMinimumFontSize = px(width * 22 / 1080);
  const ratingLabelSize = px(width * 17 / 1080);
  const ratingValueSize = px(width * 24 / 1080);
  const metaRowHeight = px(width * 42 / 1080);
  const pageMarkerRowHeight = pageCount > 1 ? px(width * 42 / 1080) : 0;
  const scoresGap = px(width * 14 / 1080);
  const profileHeight = bannerHeight + metaRowHeight + pageMarkerRowHeight;
  const scoresTop = pageInset + profileHeight + scoresGap;
  const gridGap = px(width * 0.009);
  const scoreCardPadding = px(width * 0.0065);
  const jacketSize = px(width * 0.058);

  const fill = cssLinearGradient(possessionTheme.fillColors, possessionTheme.fillLocations);
  const border = cssLinearGradient(possessionTheme.borderColors, possessionTheme.borderLocations);
  const identityStyle = [
    `--tag-fill:${fill}`,
    `--tag-border:${border}`,
    `--tag-overlay:${possessionTheme.overlayColor}`,
    `--tag-text:${possessionTheme.textColor}`,
  ].join(';');

  const iconMarkup = input.iconDataUri
    ? `<img class="avatar-image" alt="" src="${escapeHtml(input.iconDataUri)}">`
    : `<div class="avatar-fallback">${escapeHtml(initial)}</div>`;

  const levelLabel = player ? `Lv.${player.level}` : 'Lv.—';
  const rebornLabel = player && player.reborn_count > 0 ? ` · 转生 ${player.reborn_count}` : '';
  const pageMarkerLabel = `第 ${pageIndex + 1} / ${pageCount} 页`;
  const pageMarker = pageCount > 1
    ? `<div class="app-page-marker-row"><div class="page-marker">${pageMarkerLabel}</div></div>`
    : '';

  const scoreSections = input.page.sections
    .map((section) => renderScoreSection(section.title, section.records, input.coverUrls, input.jacketIds))
    .join('');
  const scoreContent = scoreSections || '<div class="empty-scores">暂无可用于图片的成绩</div>';

  const rainbowLayeredBackground = layeredBadgeCssBackground('rainbow');
  const goldStatus = STATUS_BADGE_THEMES.gold;
  const neutralStatus = STATUS_BADGE_THEMES.neutral;
  const platinumBorder = '#7D8795';
  const platinumBackground = 'linear-gradient(90deg,#DCE3EC,#FFFFFF,#C8D1DD,#FFFFFF)';

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
    .canvas-background{position:absolute;inset:0;background:linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%)}
    .profile-app{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset}px;width:${profileWidth}px}
    .profile-banner{position:relative;display:flex;width:100%;height:${bannerHeight}px;align-items:center;gap:${identityGap}px;overflow:hidden;padding:0 ${bannerPaddingX}px;border-radius:${bannerRadius}px;background:rgba(240,244,250,.92);border:1px solid rgba(255,255,255,.78);box-shadow:0 ${px(width * 8 / 1080)}px ${px(width * 22 / 1080)}px rgba(35,53,82,.16)}
    .avatar{width:${avatarSize}px;height:${avatarSize}px;flex:0 0 ${avatarSize}px;overflow:hidden;border-radius:${px(width * 20 / 1080)}px;border:${Math.max(2, px(width * 4 / 1080))}px solid rgba(255,255,255,.92);background:#DDE5F0}
    .avatar-image{display:block;width:100%;height:100%;object-fit:cover}
    .avatar-fallback{display:flex;width:100%;height:100%;align-items:center;justify-content:center;color:#52647F;font:950 ${px(width * 56 / 1080)}px/1 system-ui,sans-serif}
    .identity-card{display:flex;width:max-content;min-width:${identityMinWidth}px;max-width:${identityMaxWidth}px;height:${identityHeight}px;flex-direction:column;justify-content:center;overflow:hidden;padding:${px(width * 14 / 1080)}px ${px(width * 36 / 1080)}px ${px(width * 13 / 1080)}px ${px(width * 24 / 1080)}px;border:${Math.max(2, px(width * 3 / 1080))}px solid transparent;border-radius:${identityRadius}px;background:linear-gradient(var(--tag-overlay),var(--tag-overlay)) padding-box,var(--tag-fill) padding-box,var(--tag-border) border-box;color:var(--tag-text);box-shadow:0 1px 0 rgba(255,255,255,.52) inset,0 ${px(width * 10 / 1080)}px ${px(width * 28 / 1080)}px rgba(42,55,82,.17)}
    .player-name{width:max-content;max-width:100%;overflow:hidden;font:950 ${nameFontSize}px/1.02 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.035em;white-space:nowrap;transform-origin:left center}
    .identity-rating{display:flex;align-items:center;gap:${px(width * 10 / 1080)}px;margin-top:${px(width * 11 / 1080)}px;font:720 ${ratingLabelSize}px/1 system-ui,sans-serif;letter-spacing:.06em;white-space:nowrap}
    .identity-rating strong{font-size:${ratingValueSize}px;font-weight:800;font-variant-numeric:tabular-nums}
    .meta-row{display:flex;width:100%;height:${metaRowHeight}px;align-items:center;justify-content:flex-start;color:#4B5563;font:700 ${px(width * 0.013)}px/1 system-ui,sans-serif}
    .page-marker{display:flex;height:${px(width * 0.025)}px;align-items:center;justify-content:center;padding:0 ${px(width * 0.01)}px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.72);color:#4B5563;font:700 ${px(width * 0.009)}px/1 system-ui,sans-serif}
    .app-page-marker-row{display:flex;width:100%;height:${pageMarkerRowHeight}px;align-items:center;justify-content:flex-end}
    .scores-content{position:absolute;z-index:1;left:${pageInset}px;right:${pageInset}px;top:${scoresTop}px;padding-bottom:${pageInset}px}
    .score-section+.score-section{margin-top:${px(width * 0.024)}px}
    .section-divider{display:flex;align-items:center;gap:${px(width * 0.012)}px;margin:0 0 ${px(width * 0.012)}px;color:rgba(22,29,43,.78);font:800 ${px(width * 0.016)}px/1.2 system-ui,sans-serif;letter-spacing:${Math.max(1, px(width * 0.0008))}px;white-space:nowrap}
    .section-divider::before,.section-divider::after{content:"";height:${Math.max(1, px(width * 0.0012))}px;flex:1;background:linear-gradient(90deg,transparent,rgba(28,38,57,.55))}
    .section-divider::after{background:linear-gradient(90deg,rgba(28,38,57,.55),transparent)}
    .score-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:${gridGap}px}
    .score-card{--card-foreground:#FFFFFF;--card-muted:rgba(255,255,255,.78);--separator-color:rgba(255,255,255,.72);display:flex;min-width:0;flex-direction:column;overflow:hidden;padding:${scoreCardPadding}px;border:1px solid rgba(255,255,255,.82);border-radius:${px(width * 0.012)}px;background:var(--card-background);box-shadow:0 ${px(width * 0.004)}px ${px(width * 0.014)}px rgba(25,38,60,.22);color:var(--card-foreground)}
    .score-card.difficulty-ultima{--card-foreground:#F8FAFC;--card-muted:rgba(248,250,252,.78);border-color:rgba(232,58,88,.55)}
    .score-card.difficulty-worlds-end{--card-foreground:#5F2C78;--card-muted:#8B5AA2;--separator-color:rgba(166,93,185,.52);border-color:rgba(166,93,185,.42)}
    .score-card-head{display:flex;min-width:0;height:${jacketSize}px;align-items:stretch;gap:${px(width * 0.006)}px}
    .jacket-shell{position:relative;width:${jacketSize}px;height:${jacketSize}px;flex:0 0 ${jacketSize}px;overflow:hidden;border:${Math.max(2, px(width * 0.003))}px solid #FFFFFF;border-radius:${px(width * 0.007)}px;background:rgba(255,255,255,.24)}
    .song-jacket{position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;object-fit:cover}
    .jacket-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--card-muted);font:700 ${px(width * 0.022)}px/1 system-ui,sans-serif}
    .song-copy{position:relative;display:flex;min-width:0;height:100%;flex:1;flex-direction:column;gap:${px(width * 0.004)}px;overflow:hidden;padding:${px(width * 0.002)}px 0}
    .song-id{overflow:hidden;color:var(--card-muted);font:700 ${px(width * 0.008)}px/1 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .song-title{display:-webkit-box;overflow:hidden;color:var(--card-foreground);font:800 ${px(width * 0.011)}px/1.18 system-ui,sans-serif;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:3}
    .score-separator{height:1px;margin:${px(width * 0.006)}px 0;background:linear-gradient(90deg,transparent,var(--separator-color),transparent)}
    .achievement-row{display:flex;min-width:0;align-items:center;gap:${px(width * 0.004)}px}
    .achievement-with-rate{display:flex;min-width:0;align-items:center;gap:${px(width * 0.003)}px}
    .achievement{min-width:0;overflow:hidden;color:var(--card-foreground);font:900 ${px(width * 0.015)}px/1.06 system-ui,sans-serif;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}
    .rank-badge{display:inline-flex;min-width:${px(width * 0.022)}px;height:${px(width * 0.015)}px;align-items:center;justify-content:center;padding:0 ${px(width * 0.0035)}px;border-radius:999px;font:900 ${px(width * 0.0075)}px/1 system-ui,sans-serif;white-space:nowrap}
    .rank-badge.rank-solid{border:1px solid rgba(255,255,255,.55);background:rgba(255,255,255,.22);color:var(--card-foreground)}
    .rank-badge.rank-gradient{border:1px solid rgba(40,125,168,.45);background:linear-gradient(90deg,#73CFFF,#EFCB63,#FF8EC8,#73CFFF);color:#303136}
    .rank{margin-left:auto;flex:0 0 auto;color:var(--card-muted);font:800 ${px(width * 0.009)}px/1 system-ui,sans-serif}
    .rating-row{display:flex;min-width:0;align-items:center;margin-top:${px(width * 0.003)}px;color:var(--card-muted);font:700 ${px(width * 0.009)}px/1.15 system-ui,sans-serif}
    .song-rating{display:inline-flex;min-width:0;align-items:center;gap:${px(width * 0.003)}px;white-space:nowrap}.song-rating strong{color:var(--card-foreground);font-weight:900}.rating-arrow{color:var(--card-muted)}
    .score-card-foot{display:flex;min-width:0;align-items:center;justify-content:flex-start;padding-top:${px(width * 0.004)}px}
    .score-badges{display:flex;min-width:0;align-items:center;justify-content:flex-start;gap:${px(width * 0.002)}px;flex-wrap:wrap}
    .score-badge{display:inline-flex;min-width:${px(width * 0.02)}px;height:${px(width * 0.015)}px;align-items:center;justify-content:center;padding:0 ${px(width * 0.0035)}px;border:1px solid ${goldStatus.border};border-radius:999px;background:${goldStatus.background};color:${goldStatus.text};font:900 ${px(width * 0.0065)}px/1 system-ui,sans-serif;white-space:nowrap}
    .score-badge.tone-rainbow{border:${Math.max(1, px(width * 0.0015))}px solid transparent;background:${rainbowLayeredBackground};color:${BEST_IMAGE_RAINBOW_TEXT}}
    .score-badge.tone-platinum{border-color:${platinumBorder};background:${platinumBackground};color:#394454}
    .score-badge.tone-gold{border-color:${goldStatus.border};background:${goldStatus.background};color:${goldStatus.text}}
    .score-badge.tone-neutral{border-color:${neutralStatus.border};background:${neutralStatus.background};color:${neutralStatus.text}}
    .empty-section{grid-column:1/-1;display:flex;min-height:${px(width * 0.08)}px;align-items:center;justify-content:center;color:#697586;font:700 ${px(width * 0.012)}px/1.4 system-ui,sans-serif}
    .empty-scores{display:flex;min-height:${px(width * 0.15)}px;align-items:center;justify-content:center;border:1px dashed rgba(91,105,126,.45);border-radius:${px(width * 0.012)}px;background:rgba(255,255,255,.64);color:#697586;font:700 ${px(width * 0.013)}px/1.4 system-ui,sans-serif}
  </style>
</head>
<body>
  <div class="preview-stage">
    <main class="canvas" data-image-type="${input.type}" aria-label="成绩图片预览">
      <div class="canvas-background"></div>
      <div class="profile-app" data-layout-content aria-label="玩家资料">
        <section class="profile-banner">
          <div class="avatar">${iconMarkup}</div>
          <div class="identity-card" id="rating-box" style="${escapeHtml(identityStyle)}" aria-label="玩家 ${escapeHtml(name)}，${escapeHtml(possessionTheme.label)}，Rating ${escapeHtml(input.ratingDisplay)}">
            <div class="player-name" id="player-name">${escapeHtml(name)}</div>
            <div class="identity-rating"><span>Rating</span><strong>${escapeHtml(input.ratingDisplay)}</strong></div>
          </div>
        </section>
        <div class="meta-row"><span>${escapeHtml(levelLabel)}${escapeHtml(rebornLabel)}</span></div>
        ${pageMarker}
      </div>
      <div class="scores-content" data-layout-content aria-label="成绩列表">${scoreContent}</div>
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
        const identity = document.getElementById('rating-box');
        const playerName = document.getElementById('player-name');
        if (!identity || !playerName) return;
        playerName.style.fontSize = APP_NAME_MAX_SIZE + 'px';
        playerName.style.transform = 'none';
        const style = window.getComputedStyle(identity);
        const horizontalInset = parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0')
          + parseFloat(style.borderLeftWidth || '0') + parseFloat(style.borderRightWidth || '0');
        const availableWidth = Math.max(1, identity.clientWidth - horizontalInset);
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
