import type { Player, ScoreRecord } from '@/domain/models';
import { resolveDxRatingTheme } from '@/domain/dx-rating-theme';
import type { BestImageRatingStyle } from './best-image-style-preferences';
import {
  formatAchievement,
  isNearMissAchievement,
  scoreRateEffect,
} from '@/domain/score-presentation';
import {
  BEST_IMAGE_RAINBOW_TEXT,
  layeredBadgeCssBackground,
  normalizeTrophyTone,
  STATUS_BADGE_THEMES,
  TROPHY_BADGE_THEMES,
  type StatusBadgeTone,
} from './best-image-badge-theme';

export type BestImageType = 'best50' | 'custom';

export type BestImageScoreSection = {
  id: string;
  title: string;
  records: readonly ScoreRecord[];
  rankOffset?: number;
};

export type BestImageHiddenStyle = 'icon' | 'plate' | 'trophy' | 'frame';

export type BestImageHtmlInput = {
  type: BestImageType;
  width: number;
  player: Pick<Player, 'displayName' | 'presentation'>;
  rating: number;
  ratingStyle?: BestImageRatingStyle;
  scoreSections: readonly BestImageScoreSection[];
  coverUrls?: Readonly<Record<string, string | null>>;
  hiddenStyles?: readonly BestImageHiddenStyle[];
  fontUrl: string;
  ratingFrameUrl: string;
  pageIndex?: number;
  pageCount?: number;
};

const LXNS_ASSET_ROOT = 'https://assets2.lxns.net/maimai';
const DIFFICULTY_COLORS: Record<ScoreRecord['difficulty'], string> = {
  basic: '#3E9D6B',
  advanced: '#E39124',
  expert: '#D84B68',
  master: '#7137C8',
  remaster: '#A65DB9',
  unknown: '#6B7280',
};
const RATE_LABELS: Record<string, string> = {
  d: 'D', c: 'C', b: 'B', bb: 'BB', bbb: 'BBB', a: 'A', aa: 'AA', aaa: 'AAA',
  s: 'S', sp: 'S+', ss: 'SS', ssp: 'SS+', sss: 'SSS', sssp: 'SSS+',
};
const FC_LABELS: Record<string, string> = { fc: 'FC', fcp: 'FC+', ap: 'AP', app: 'AP+' };
const FS_LABELS: Record<string, string> = {
  sync: 'SYNC', fs: 'FS', fsp: 'FS+', fsd: 'FDX', fsdp: 'FDX+', fdx: 'FDX', fdxp: 'FDX+',
};
export function minimumBestImageHeight(width: number): number {
  return Math.ceil(width * 4 / 3);
}

export function ratingFrameIndex(rating: number): number {
  const value = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 0;
  let index = 0;
  for (let cursor = 0; cursor < BEST_IMAGE_RATING_FRAME_MINS.length; cursor += 1) {
    if (value >= BEST_IMAGE_RATING_FRAME_MINS[cursor]!) index = cursor;
  }
  return index;
}

/** 导出图的 11 张原始 Rating 框边界；与应用内渐变主题独立。 */
export const BEST_IMAGE_RATING_FRAME_MINS = [
  0, 1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 14500, 15000,
] as const;

export function parseBestImageHeightMessage(data: string, expectedWidth: number): number | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const message = value as { type?: unknown; width?: unknown; height?: unknown };
    if (message.type !== 'best-image-height' || message.width !== expectedWidth) return null;
    if (typeof message.height !== 'number' || !Number.isFinite(message.height)) return null;
    return Math.max(minimumBestImageHeight(expectedWidth), Math.round(message.height));
  } catch {
    return null;
  }
}

export function parseBestImageReadyMessage(data: string, expectedWidth: number): number | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const message = value as { type?: unknown; width?: unknown; height?: unknown };
    if (message.type !== 'best-image-ready' || message.width !== expectedWidth) return null;
    if (typeof message.height !== 'number' || !Number.isFinite(message.height)) return null;
    return Math.max(minimumBestImageHeight(expectedWidth), Math.round(message.height));
  } catch {
    return null;
  }
}

export type BestImageRuntimeMessage = {
  userAgent: string;
  version: string | null;
};

export function bestImageWebViewVersion(userAgent: string): string | null {
  const chromeVersion = /(?:Chrome|CriOS)\/([\d.]+)/u.exec(userAgent)?.[1];
  if (chromeVersion) return chromeVersion;
  return /AppleWebKit\/([\d.]+)/u.exec(userAgent)?.[1] ?? null;
}

export function parseBestImageRuntimeMessage(data: string, expectedWidth: number): BestImageRuntimeMessage | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const message = value as { type?: unknown; width?: unknown; userAgent?: unknown };
    if (message.type !== 'best-image-runtime' || message.width !== expectedWidth) return null;
    if (typeof message.userAgent !== 'string') return null;
    return {
      userAgent: message.userAgent,
      version: bestImageWebViewVersion(message.userAgent),
    };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeCssUrl(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/[\r\n]/gu, '');
}

function statusLabel(value: string | null, labels: Record<string, string>): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return labels[normalized] ?? value.trim().toUpperCase() ?? null;
}

function rateBadgeTone(value: string | null): StatusBadgeTone {
  const effect = scoreRateEffect(value ?? '');
  if (effect === 'rainbow' || effect === 'flowing-rainbow') return 'rainbow';
  if (effect === 'gold' || effect === 'flowing-gold') return 'gold';
  return 'normal';
}

function fcBadgeTone(value: string | null): StatusBadgeTone {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'fc' || normalized === 'fcp') return 'green';
  return normalized ? 'gold' : 'normal';
}

function fsBadgeTone(value: string | null): StatusBadgeTone {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'sync' || normalized === 'fs' || normalized === 'fsp') return 'blue';
  return normalized ? 'gold' : 'normal';
}

function renderScoreBadge(kind: string, label: string | null, tone: StatusBadgeTone): string {
  return label ? `<span class="score-badge ${kind} tone-${tone}">${escapeHtml(label)}</span>` : '';
}

function renderRateBadge(record: ScoreRecord): string {
  return renderScoreBadge('rate', statusLabel(record.rate, RATE_LABELS), rateBadgeTone(record.rate));
}

function renderStatusBadges(record: ScoreRecord): string {
  const badges = [
    { kind: 'near', label: isNearMissAchievement(record.achievements) ? '寸' : null, tone: 'neutral' },
    { kind: 'fc', label: statusLabel(record.fc, FC_LABELS), tone: fcBadgeTone(record.fc) },
    { kind: 'fs', label: statusLabel(record.fs, FS_LABELS), tone: fsBadgeTone(record.fs) },
  ];
  return badges
    .filter((badge): badge is { kind: string; label: string; tone: StatusBadgeTone } => !!badge.label)
    .map((badge) => renderScoreBadge(badge.kind, badge.label, badge.tone))
    .join('');
}

function renderScoreCard(
  record: ScoreRecord,
  rank: number,
  coverUrls: Readonly<Record<string, string | null>> | undefined,
): string {
  const hasPreparedJacket = coverUrls && Object.hasOwn(coverUrls, record.songId);
  const jacketUrl = hasPreparedJacket
    ? coverUrls[record.songId]
    : `${LXNS_ASSET_ROOT}/jacket/${encodeURIComponent(record.songId)}.png`;
  const theoreticalDxScore = record.notes ? record.notes.total * 3 : null;
  const actualDxScore = record.dxScore === null ? '—' : String(record.dxScore);
  const maximumDxScore = theoreticalDxScore === null ? '—' : String(theoreticalDxScore);
  const difficultyColor = DIFFICULTY_COLORS[record.difficulty];
  const isRemaster = record.difficulty === 'remaster';
  const cardClass = isRemaster ? 'difficulty-remaster' : 'difficulty-solid';
  const cardBackground = isRemaster ? '#F3E8FE' : difficultyColor;
  return `<article class="score-card ${cardClass}" style="--difficulty-color:${difficultyColor};--card-background:${cardBackground}" aria-label="第 ${rank} 名 ${escapeHtml(record.title)}">
    <div class="score-card-head">
      <div class="jacket-shell">
        <span class="jacket-fallback">♪</span>
        ${jacketUrl ? `<img class="song-jacket" alt="" src="${escapeHtml(jacketUrl)}" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="song-copy">
        <span class="song-id">ID${escapeHtml(record.songId)}</span>
        <strong class="song-title">${escapeHtml(record.title)}</strong>
        <span class="chart-type type-${record.type.toLowerCase()}"><span>${escapeHtml(record.type)}</span></span>
      </div>
    </div>
    <div class="score-separator"></div>
    <div class="achievement-row"><span class="achievement-with-rate"><strong class="achievement">${formatAchievement(record.achievements)}</strong>${renderRateBadge(record)}</span><span class="rank">#${rank}</span></div>
    <div class="rating-row">
      <span class="song-rating"><span>${record.difficultyConstant.toFixed(1)}</span><span class="rating-arrow">→</span><strong>${record.rating}</strong></span>
      <strong class="dx-score-value" aria-label="DXScore 实际 ${actualDxScore}，理论 ${maximumDxScore}"><span class="dx-score-actual">${actualDxScore}</span><span class="dx-score-slash">/</span><span class="dx-score-maximum">${maximumDxScore}</span></strong>
    </div>
    <div class="score-card-foot"><span class="score-badges">${renderStatusBadges(record)}</span></div>
  </article>`;
}

function renderScoreSection(
  section: BestImageScoreSection,
  coverUrls: Readonly<Record<string, string | null>> | undefined,
): string {
  const divider = `<div class="section-divider"><span>${escapeHtml(section.title)}</span></div>`;
  const cards = section.records.map((record, index) => renderScoreCard(record, (section.rankOffset ?? 0) + index + 1, coverUrls)).join('');
  const content = cards || '<div class="empty-section">暂无符合条件的成绩</div>';
  return `<section class="score-section" aria-label="${escapeHtml(section.title)}">${divider}<div class="score-grid">${content}</div></section>`;
}

function collectionAssetUrl(kind: 'icon' | 'plate' | 'frame', id: number | undefined): string | null {
  if (!Number.isSafeInteger(id) || (id ?? -1) < 0) return null;
  return `${LXNS_ASSET_ROOT}/${kind}/${id}.png`;
}

function cssLinearGradient(colors: readonly string[], locations: readonly number[]): string {
  const stops = colors.map((color, index) => `${color} ${Math.round((locations[index] ?? index / Math.max(1, colors.length - 1)) * 100)}%`);
  return `linear-gradient(90deg,${stops.join(',')})`;
}

function trophyToneClass(color: string | null | undefined): string {
  return normalizeTrophyTone(color);
}

function px(value: number): number {
  return Math.max(1, Math.round(value));
}

export function buildBestImageHtml(input: BestImageHtmlInput): string {
  const width = Math.max(1, Math.round(input.width));
  const minimumHeight = minimumBestImageHeight(width);
  const rating = Math.min(99999, Math.max(0, Math.floor(Number.isFinite(input.rating) ? input.rating : 0)));
  const ratingStyle = input.ratingStyle ?? 'game';
  const isAppStyle = ratingStyle === 'app';
  const appRatingTheme = resolveDxRatingTheme(rating);
  const digits = String(rating).padStart(5, '0').split('');
  const name = input.player.displayName.trim() || '未读取玩家资料';
  const presentation = input.player.presentation;
  const hiddenStyles = new Set(input.hiddenStyles ?? []);
  const hideIcon = hiddenStyles.has('icon');
  const hidePlate = hiddenStyles.has('plate');
  const hideTrophy = hiddenStyles.has('trophy');
  const plateUrl = hidePlate ? null : collectionAssetUrl('plate', presentation?.namePlateId);
  const iconUrl = hideIcon ? null : collectionAssetUrl('icon', presentation?.iconId);
  const frameUrl = hiddenStyles.has('frame') ? null : collectionAssetUrl('frame', presentation?.frameId);
  const trophyName = presentation?.trophyName?.trim() || '称号未同步';
  const initial = Array.from(name)[0] ?? '?';
  const pageCount = Math.max(1, Math.floor(input.pageCount ?? 1));
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(input.pageIndex ?? 0)));

  const bannerWidth = px(width * 0.5);
  const bannerHeight = px(bannerWidth * 116 / 720);
  const pageInset = px(width * 0.04);
  const avatarInset = px(bannerHeight * 0.055);
  const avatarSize = px(bannerHeight * 0.89);
  const identityLeft = hideIcon ? avatarInset : avatarInset + avatarSize + px(bannerWidth * 0.019);
  const identityRight = px(bannerWidth * 0.038);
  const ratingWidth = px(bannerWidth * 0.21);
  const ratingHeight = px(ratingWidth / 4.4);
  const ratingFontSize = px(ratingHeight * 0.48);
  const playerNameSize = px(bannerWidth * 0.035);
  const trophySize = px(bannerWidth * 0.017);
  const radius = px(bannerWidth * 0.013);
  const stroke = Math.max(1, px(bannerWidth / 720));
  const appProfileWidth = width - pageInset * 2;
  const appBannerHeight = px(appProfileWidth * 116 / 720);
  const appBannerRadius = px(width * 28 / 1080);
  const appBannerPaddingX = px(width * 22 / 1080);
  const appBannerPaddingY = px(width * 16 / 1080);
  const appAvatarSize = px(width * 130 / 1080);
  const appIdentityGap = px(width * 22 / 1080);
  const appIdentityHeight = px(width * 124 / 1080);
  const appIdentityMinWidth = px(width * 280 / 1080);
  const appIdentityMaxWidth = appProfileWidth - appBannerPaddingX * 2
    - (hideIcon ? 0 : appAvatarSize + appIdentityGap);
  const appIdentityRadius = px(width * 22 / 1080);
  const appGlassBleed = px(width * 26 / 1080);
  const appNameFontSize = px(width * 42 / 1080);
  const appNameMinimumFontSize = px(width * 22 / 1080);
  const appRatingLabelSize = px(width * 17 / 1080);
  const appRatingValueSize = px(width * 24 / 1080);
  const appTrophyRowHeight = hideTrophy ? 0 : px(width * 70 / 1080);
  const appPageMarkerRowHeight = pageCount > 1 ? px(width * 42 / 1080) : 0;
  const appScoresGap = px(width * 14 / 1080);
  const appProfileHeight = appBannerHeight + appTrophyRowHeight + appPageMarkerRowHeight;
  const backgroundBlur = px(width * 0.02);
  const scoresTop = isAppStyle
    ? pageInset + appProfileHeight + appScoresGap
    : pageInset + bannerHeight + px(width * 0.035);
  const gridGap = px(width * 0.009);
  const scoreCardPadding = px(width * 0.0065);
  const jacketSize = px(width * 0.058);
  const scoreSections = input.scoreSections
    .map((section) => renderScoreSection(section, input.coverUrls))
    .join('');
  const scoreContent = scoreSections || '<div class="empty-scores">暂无可用于图片的成绩</div>';
  const nameplate = hidePlate
    ? ''
    : plateUrl
    ? `<img class="nameplate-image" alt="" src="${escapeHtml(plateUrl)}">`
    : '<div class="nameplate-fallback"></div>';
  const avatar = hideIcon
    ? ''
    : iconUrl
    ? `<img class="avatar-image" alt="" src="${escapeHtml(iconUrl)}">`
    : `<div class="avatar-fallback">${escapeHtml(initial)}</div>`;
  const trophy = hideTrophy
    ? ''
    : `<div class="trophy ${trophyToneClass(presentation?.trophyColor)}">${escapeHtml(trophyName)}</div>`;
  const ratingDigits = digits.map((digit) => `<span>${digit}</span>`).join('');
  const ratingMarkup = `<div class="rating rating-game" aria-label="Rating ${rating}"><img class="rating-frame" alt="" src="${escapeHtml(input.ratingFrameUrl)}"><div class="rating-digits">${ratingDigits}</div></div>`;
  const canvasBackground = frameUrl
    ? `<div class="canvas-background" style="background-image:url(&quot;${escapeHtml(frameUrl)}&quot;)"></div>`
    : '<div class="canvas-background canvas-background-fallback"></div>';
  const rainbowLayeredBackground = layeredBadgeCssBackground('rainbow');
  const goldLayeredBackground = layeredBadgeCssBackground('gold');
  const pageMarkerLabel = `第 ${pageIndex + 1} / ${pageCount} 页`;
  const gamePageMarker = pageCount > 1 ? `<div class="page-marker page-marker-game">${pageMarkerLabel}</div>` : '';
  const appPageMarker = pageCount > 1 ? `<div class="app-page-marker-row"><div class="page-marker app-page-marker">${pageMarkerLabel}</div></div>` : '';
  const normalTrophy = TROPHY_BADGE_THEMES.normal;
  const bronzeTrophy = TROPHY_BADGE_THEMES.bronze;
  const silverTrophy = TROPHY_BADGE_THEMES.silver;
  const goldTrophy = TROPHY_BADGE_THEMES.gold;
  const normalStatus = STATUS_BADGE_THEMES.normal;
  const goldStatus = STATUS_BADGE_THEMES.gold;
  const greenStatus = STATUS_BADGE_THEMES.green;
  const blueStatus = STATUS_BADGE_THEMES.blue;
  const neutralStatus = STATUS_BADGE_THEMES.neutral;
  const appRatingFill = cssLinearGradient(appRatingTheme.fillColors, appRatingTheme.fillLocations);
  const appRatingBorder = cssLinearGradient(appRatingTheme.borderColors, appRatingTheme.borderLocations);
  const appIdentityStyle = [
    `--tag-fill:${appRatingFill}`,
    `--tag-border:${appRatingBorder}`,
    `--tag-overlay:${appRatingTheme.overlayColor}`,
    `--tag-text:${appRatingTheme.textColor}`,
    `--tag-star:${appRatingTheme.starColor}`,
  ].join(';');
  const gameProfileMarkup = `<section class="profile-banner-game${hidePlate ? ' no-plate' : ''}" data-layout-content aria-label="玩家资料">
        ${nameplate}
        ${hideIcon ? '' : `<div class="avatar">${avatar}</div>`}
        <div class="identity">
          ${ratingMarkup}
          <div class="player-name">${escapeHtml(name)}</div>
          ${trophy}
        </div>
      </section>`;
  const appProfileMarkup = `<div class="profile-app" data-layout-content aria-label="玩家资料">
        <section class="profile-banner-app${hidePlate ? ' no-plate' : ''}" id="profile-banner">
          ${nameplate}
          <div class="profile-glass" aria-hidden="true">
            <span class="glass-layer glass-blur-strong"></span>
            <span class="glass-layer glass-blur-medium"></span>
            <span class="glass-layer glass-blur-soft"></span>
            <span class="glass-layer glass-tint"></span>
          </div>
          ${hideIcon ? '' : `<div class="avatar">${avatar}</div>`}
          <div class="identity-card theme-${appRatingTheme.id}" id="rating-box" data-star-count="${appRatingTheme.starCount}" style="${escapeHtml(appIdentityStyle)}" aria-label="玩家 ${escapeHtml(name)}，${escapeHtml(appRatingTheme.label)}，Rating ${rating}">
            <div class="app-player-name" id="player-name">${escapeHtml(name)}</div>
            <div class="identity-rating"><span>Rating</span><strong>${rating}</strong></div>
            <svg class="rating-star-track" id="rating-star-track" aria-hidden="true"><g id="rating-stars"></g></svg>
          </div>
        </section>
        ${hideTrophy ? '' : `<div class="trophy-row">${trophy}</div>`}
        ${appPageMarker}
      </div>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    @font-face{font-family:RatingNumbers;src:url("${escapeCssUrl(input.fontUrl)}") format("truetype");font-display:block}
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#DDE3EC}
    body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
    .preview-stage{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;overflow:hidden;background:#DDE3EC}
    .canvas{position:absolute;left:0;top:0;width:${width}px;min-height:${minimumHeight}px;overflow:hidden;transform-origin:top left;background:#E7EDF5}
    .canvas-background{position:absolute;top:-${backgroundBlur * 2}px;right:-${backgroundBlur * 2}px;bottom:-${backgroundBlur * 2}px;left:-${backgroundBlur * 2}px;inset:-${backgroundBlur * 2}px;background-position:center;background-size:cover;filter:blur(${backgroundBlur}px);transform:scale(1.08)}
    .canvas-background-fallback{top:0;right:0;bottom:0;left:0;inset:0;background:linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%);filter:none;transform:none}
    .canvas-tone{position:absolute;top:0;right:0;bottom:0;left:0;inset:0;background:rgba(238,242,248,.18)}
    .profile-banner-game{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset}px;width:${bannerWidth}px;height:${bannerHeight}px;border-radius:${radius}px;filter:drop-shadow(0 ${px(bannerWidth * 0.008)}px ${px(bannerWidth * 0.018)}px rgba(35,53,82,.22))}
    .profile-banner-game.no-plate{border:1px solid rgba(255,255,255,.78);background:rgba(240,244,250,.78)}
    .profile-banner-game .nameplate-image,.profile-banner-game .nameplate-fallback{position:absolute;inset:0;display:block;width:100%;height:100%;border-radius:${radius}px}
    .profile-banner-game .nameplate-image{object-fit:contain}
    .profile-banner-game .nameplate-fallback{border:${Math.max(1, px(bannerWidth * 0.002))}px solid rgba(255,255,255,.8);background:linear-gradient(100deg,#9EB5D8 0%,#E8EDF6 38%,#F5D9B4 70%,#D99591 100%)}
    .profile-banner-game .avatar{position:absolute;left:${avatarInset}px;top:${avatarInset}px;width:${avatarSize}px;height:${avatarSize}px;overflow:hidden;border-radius:${px(bannerWidth * 0.01)}px;border:${Math.max(2, px(bannerWidth * 0.004))}px solid rgba(255,255,255,.9);background:#DDE5F0;box-shadow:0 ${px(bannerWidth * 0.004)}px ${px(bannerWidth * 0.01)}px rgba(27,41,68,.28)}
    .profile-banner-game .avatar-image{display:block;width:100%;height:100%;object-fit:cover}
    .profile-banner-game .avatar-fallback{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:900 ${px(bannerWidth * 0.065)}px/1 system-ui,sans-serif;color:#52647F;background:linear-gradient(145deg,#F8FBFF,#C7D5EA)}
    .profile-banner-game .identity{position:absolute;left:${identityLeft}px;right:${identityRight}px;top:${avatarInset}px;bottom:${avatarInset}px;display:flex;min-width:0;flex-direction:column;align-items:flex-start;justify-content:center;gap:${px(bannerWidth * 0.004)}px;transform:translateY(-${px(bannerWidth * 0.004)}px)}
    .rating{position:relative}
    .rating-game{width:${ratingWidth}px;height:${ratingHeight}px;flex:0 0 ${ratingHeight}px}
    .rating-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
    .rating-digits{position:absolute;left:48.3%;top:17%;display:grid;grid-template-columns:repeat(5,1fr);align-items:center;width:43.8%;height:61%;font-family:RatingNumbers,"Arial Black",sans-serif;font-size:${ratingFontSize}px;font-weight:900;line-height:1;color:#FFD83D;-webkit-text-stroke:${stroke}px #090909;text-shadow:0 ${Math.max(1, stroke)}px 0 #090909;font-variant-numeric:tabular-nums}
    .rating-digits span{display:flex;align-items:center;justify-content:center;height:100%}
    .profile-banner-game .player-name{display:inline-flex;width:fit-content;max-width:100%;min-height:${px(playerNameSize * 1.35)}px;align-items:center;overflow:hidden;padding:0 ${px(bannerWidth * 0.011)}px;border:${Math.max(1, px(bannerWidth * 0.0015))}px solid rgba(96,87,72,.45);border-radius:${px(bannerWidth * 0.006)}px;background:rgba(255,255,255,.9);color:#171717;font:900 ${playerNameSize}px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .profile-banner-game .trophy{display:flex;width:fit-content;max-width:100%;height:${px(bannerWidth * 0.029)}px;align-items:center;justify-content:center;overflow:hidden;padding:0 ${px(bannerWidth * 0.009)}px;border:${Math.max(1, px(bannerWidth * 0.0015))}px solid ${normalTrophy.border};border-radius:999px;background:${normalTrophy.background};color:${normalTrophy.text};font:400 ${trophySize}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;text-overflow:ellipsis;white-space:nowrap}
    .profile-app{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset}px;width:${appProfileWidth}px;height:${appProfileHeight}px}
    .profile-banner-app{--glass-opacity:0;--glass-blur-strong:6px;--glass-blur-medium:4px;--glass-blur-soft:2.3px;position:relative;display:flex;width:100%;height:${appBannerHeight}px;align-items:center;gap:${appIdentityGap}px;overflow:hidden;padding:${appBannerPaddingY}px ${appBannerPaddingX}px;border:1px solid rgba(255,255,255,.84);border-radius:${appBannerRadius}px;background:linear-gradient(100deg,#7497D8,#EEB4D4 54%,#FFE0A7);box-shadow:0 ${px(width * 18 / 1080)}px ${px(width * 44 / 1080)}px rgba(46,63,96,.24),inset 0 1px rgba(255,255,255,.72);isolation:isolate}
    .profile-banner-app.no-plate{background:linear-gradient(100deg,#9EB5D8 0%,#E8EDF6 38%,#F5D9B4 70%,#D99591 100%)}
    .profile-banner-app .nameplate-image,.profile-banner-app .nameplate-fallback{position:absolute;z-index:-2;inset:0;display:block;width:100%;height:100%;border-radius:0;transform:none}
    .profile-banner-app .nameplate-image{object-fit:contain;filter:saturate(1.08)}
    .profile-banner-app .nameplate-fallback{border:1px solid rgba(255,255,255,.8);background:linear-gradient(100deg,#9EB5D8 0%,#E8EDF6 38%,#F5D9B4 70%,#D99591 100%)}
    .profile-glass{position:absolute;z-index:0;left:0;top:0;bottom:0;width:var(--glass-physical-width,60%);overflow:hidden;pointer-events:none}
    .glass-layer{position:absolute;top:-${appGlassBleed}px;right:0;bottom:-${appGlassBleed}px;left:-${appGlassBleed}px;background:rgba(255,255,255,.001);pointer-events:none}
    .glass-blur-strong{-webkit-backdrop-filter:blur(var(--glass-blur-strong)) saturate(110%);backdrop-filter:blur(var(--glass-blur-strong)) saturate(110%);-webkit-mask-image:linear-gradient(90deg,#000 0%,#000 var(--glass-local-start,60%),transparent var(--glass-local-step-1,74%),transparent 100%);mask-image:linear-gradient(90deg,#000 0%,#000 var(--glass-local-start,60%),transparent var(--glass-local-step-1,74%),transparent 100%)}
    .glass-blur-medium{-webkit-backdrop-filter:blur(var(--glass-blur-medium)) saturate(108%);backdrop-filter:blur(var(--glass-blur-medium)) saturate(108%);-webkit-mask-image:linear-gradient(90deg,#000 0%,#000 var(--glass-local-start,60%),transparent var(--glass-local-step-2,86%),transparent 100%);mask-image:linear-gradient(90deg,#000 0%,#000 var(--glass-local-start,60%),transparent var(--glass-local-step-2,86%),transparent 100%)}
    .glass-blur-soft{-webkit-backdrop-filter:blur(var(--glass-blur-soft)) saturate(106%);backdrop-filter:blur(var(--glass-blur-soft)) saturate(106%);-webkit-mask-image:linear-gradient(90deg,#000 0%,#000 var(--glass-local-start,60%),transparent 100%);mask-image:linear-gradient(90deg,#000 0%,#000 var(--glass-local-start,60%),transparent 100%)}
    .glass-tint{inset:0;background:linear-gradient(90deg,rgba(242,247,255,var(--glass-opacity)) 0%,rgba(242,247,255,var(--glass-opacity)) var(--glass-local-start,60%),rgba(242,247,255,0) 100%)}
    .profile-banner-app .avatar{position:relative;z-index:1;width:${appAvatarSize}px;height:${appAvatarSize}px;flex:0 0 ${appAvatarSize}px;overflow:visible;border:0;background:transparent}
    .profile-banner-app .avatar-image{display:block;width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 ${px(width * 10 / 1080)}px ${px(width * 12 / 1080)}px rgba(31,44,75,.3))}
    .profile-banner-app .avatar-fallback{display:flex;width:100%;height:100%;align-items:center;justify-content:center;overflow:hidden;border:${Math.max(2, px(width * 4 / 1080))}px solid rgba(255,255,255,.92);border-radius:${px(width * 20 / 1080)}px;background:linear-gradient(145deg,#F8FBFF,#C7D5EA);box-shadow:0 ${px(width * 10 / 1080)}px ${px(width * 24 / 1080)}px rgba(31,44,75,.3),inset 0 1px rgba(255,255,255,.9);color:#52647F;font:950 ${px(width * 56 / 1080)}px/1 system-ui,sans-serif}
    .identity-card{position:relative;z-index:1;display:flex;width:max-content;min-width:${appIdentityMinWidth}px;max-width:${appIdentityMaxWidth}px;height:${appIdentityHeight}px;flex:0 0 auto;flex-direction:column;justify-content:center;align-items:flex-start;overflow:visible;padding:${px(width * 14 / 1080)}px ${px(width * 36 / 1080)}px ${px(width * 13 / 1080)}px ${px(width * 24 / 1080)}px;border:${Math.max(2, px(width * 3 / 1080))}px solid transparent;border-radius:${appIdentityRadius}px;background:linear-gradient(var(--tag-overlay),var(--tag-overlay)) padding-box,var(--tag-fill) padding-box,var(--tag-border) border-box;box-shadow:0 1px 0 rgba(255,255,255,.52) inset,0 -1px 0 rgba(35,38,45,.1) inset,0 ${px(width * 10 / 1080)}px ${px(width * 28 / 1080)}px rgba(42,55,82,.17);color:var(--tag-text);user-select:none}
    .identity-card.theme-extreme{box-shadow:0 1px 0 rgba(255,255,255,.75) inset,0 -1px 0 rgba(35,38,45,.08) inset,0 0 0 1px rgba(255,255,255,.34) inset,0 ${px(width * 10 / 1080)}px ${px(width * 28 / 1080)}px rgba(42,55,82,.17)}
    .app-player-name{width:max-content;max-width:100%;overflow:visible;color:var(--tag-text);font:950 ${appNameFontSize}px/1.02 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.035em;transform-origin:left center;white-space:nowrap}
    .identity-rating{display:flex;align-items:center;gap:${px(width * 10 / 1080)}px;margin-top:${px(width * 11 / 1080)}px;color:var(--tag-text);font:720 ${appRatingLabelSize}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.06em;white-space:nowrap}
    .identity-rating strong{font-size:${appRatingValueSize}px;font-weight:800;letter-spacing:${px(width * 2 / 1080)}px;line-height:1}
    .rating-star-track{position:absolute;z-index:2;left:0;top:0;display:block;overflow:visible;pointer-events:none}
    .rating-star-track polygon{fill:var(--tag-star);filter:drop-shadow(0 1px 0 rgba(255,255,255,.42))}
    .trophy-row{display:flex;width:100%;height:${appTrophyRowHeight}px;align-items:center;justify-content:center}
    .profile-app .trophy{display:flex;width:100%;max-width:none;align-items:center;justify-content:center;overflow:hidden;padding:${px(width * 8 / 1080)}px ${px(width * 22 / 1080)}px;border:1px solid ${normalTrophy.border};border-radius:999px;background:${normalTrophy.background};box-shadow:0 ${px(width * 8 / 1080)}px ${px(width * 22 / 1080)}px rgba(52,63,89,.11),inset 0 1px rgba(255,255,255,.7);color:${normalTrophy.text};font:800 ${px(width * 0.016)}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;text-overflow:ellipsis;white-space:nowrap;-webkit-backdrop-filter:blur(${px(width * 16 / 1080)}px);backdrop-filter:blur(${px(width * 16 / 1080)}px)}
    .trophy.bronze{border-color:${bronzeTrophy.border};background:${bronzeTrophy.background};color:${bronzeTrophy.text}}.trophy.silver{border-color:${silverTrophy.border};background:${silverTrophy.background};color:${silverTrophy.text}}.trophy.gold{border-color:${goldTrophy.border};background:${goldTrophy.background};color:${goldTrophy.text}}.trophy.rainbow{border-color:transparent;background:${rainbowLayeredBackground};color:${BEST_IMAGE_RAINBOW_TEXT};text-shadow:none}
    .page-marker{z-index:2;display:flex;height:${px(width * 0.025)}px;align-items:center;justify-content:center;padding:0 ${px(width * 0.01)}px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.72);color:#4B5563;font:700 ${px(width * 0.009)}px/1 system-ui,sans-serif}
    .page-marker-game{position:absolute;right:${pageInset}px;top:${pageInset}px}
    .app-page-marker-row{display:flex;width:100%;height:${appPageMarkerRowHeight}px;align-items:center;justify-content:flex-end}
    .app-page-marker{position:static}
    .scores-content{position:absolute;z-index:1;left:${pageInset}px;right:${pageInset}px;top:${scoresTop}px;padding-bottom:${pageInset}px}
    .score-section+.score-section{margin-top:${px(width * 0.024)}px}
    .section-divider{display:flex;align-items:center;gap:${px(width * 0.012)}px;margin:0 0 ${px(width * 0.012)}px;color:rgba(22,29,43,.78);font:800 ${px(width * 0.016)}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:${Math.max(1, px(width * 0.0008))}px;white-space:nowrap}
    .section-divider::before,.section-divider::after{content:"";height:${Math.max(1, px(width * 0.0012))}px;flex:1;background:linear-gradient(90deg,transparent,rgba(28,38,57,.55))}
    .section-divider::after{background:linear-gradient(90deg,rgba(28,38,57,.55),transparent)}
    .score-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:${gridGap}px}
    .score-card{--card-foreground:#FFFFFF;--card-muted:rgba(255,255,255,.78);--separator-color:rgba(255,255,255,.72);display:flex;min-width:0;flex-direction:column;overflow:hidden;padding:${scoreCardPadding}px;border:1px solid rgba(255,255,255,.82);border-radius:${px(width * 0.012)}px;background:var(--card-background);box-shadow:0 ${px(width * 0.004)}px ${px(width * 0.014)}px rgba(25,38,60,.22);color:var(--card-foreground)}
    .score-card.difficulty-remaster{--card-foreground:#5F2C78;--card-muted:#8B5AA2;--separator-color:rgba(166,93,185,.52);border-color:rgba(166,93,185,.42)}
    .score-card-head{display:flex;min-width:0;height:${jacketSize}px;align-items:stretch;gap:${px(width * 0.006)}px}
    .jacket-shell{position:relative;width:${jacketSize}px;height:${jacketSize}px;flex:0 0 ${jacketSize}px;overflow:hidden;border:${Math.max(2, px(width * 0.003))}px solid #FFFFFF;border-radius:${px(width * 0.007)}px;background:rgba(255,255,255,.24)}
    .score-card.difficulty-remaster .jacket-shell{border-color:var(--difficulty-color);background:rgba(166,93,185,.12)}
    .song-jacket{position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;object-fit:cover}
    .jacket-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--card-muted);font:700 ${px(width * 0.022)}px/1 system-ui,sans-serif}
    .song-copy{position:relative;display:flex;min-width:0;height:100%;min-height:0;flex:1;flex-direction:column;gap:${px(width * 0.004)}px;overflow:hidden;padding:${px(width * 0.002)}px 0}
    .song-id{overflow:hidden;padding-right:${px(width * 0.029)}px;color:var(--card-muted);font:700 ${px(width * 0.008)}px/1 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .song-title{display:-webkit-box;overflow:hidden;color:var(--card-foreground);font:800 ${px(width * 0.011)}px/1.18 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:3;white-space:normal}
    .chart-type{position:absolute;z-index:2;right:0;top:0;display:inline-flex;min-width:${px(width * 0.023)}px;height:${px(width * 0.014)}px;align-items:center;justify-content:center;overflow:hidden;padding:0 ${px(width * 0.0035)}px;border:1px solid transparent;border-radius:${px(width * 0.005)}px;background-clip:border-box;font:900 ${px(width * 0.0065)}px/1 system-ui,sans-serif;letter-spacing:${Math.max(1, px(width * 0.0004))}px;text-align:center;white-space:nowrap}.chart-type>span{display:flex;width:100%;height:100%;align-items:center;justify-content:center;line-height:1}.chart-type.type-sd{border-color:#3286E6;background-color:#3286E6;color:#FFFFFF}.chart-type.type-dx{border-color:#F2C36C;background-color:#FFFFFF;color:#FF8A00}.chart-type.type-dx>span{color:#FF8A00;background:linear-gradient(90deg,#FF8A00,#FFD84A);background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .score-separator{height:1px;margin:${px(width * 0.006)}px 0;background:linear-gradient(90deg,transparent,var(--separator-color),transparent)}
    .achievement-row{display:flex;min-width:0;align-items:center;gap:${px(width * 0.004)}px}
    .achievement-with-rate{display:flex;min-width:0;align-items:center;gap:${px(width * 0.003)}px}
    .achievement{min-width:0;overflow:hidden;color:var(--card-foreground);font:900 ${px(width * 0.018)}px/1.06 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:${-px(width * 0.0004)}px;text-overflow:ellipsis;white-space:nowrap}
    .rank{margin-left:auto;flex:0 0 auto;color:var(--card-muted);font:800 ${px(width * 0.009)}px/1 system-ui,sans-serif}
    .rating-row{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:${px(width * 0.003)}px;margin-top:${px(width * 0.003)}px;color:var(--card-muted);font:700 ${px(width * 0.009)}px/1.15 system-ui,sans-serif}
    .song-rating{display:inline-flex;min-width:0;align-items:center;gap:${px(width * 0.003)}px;white-space:nowrap}.song-rating strong{color:var(--card-foreground);font-weight:900}.rating-arrow{color:var(--card-muted)}
    .dx-score-value{display:inline-flex;flex:0 0 auto;align-items:baseline;gap:${px(width * 0.002)}px;color:var(--card-foreground);font-size:${px(width * 0.008)}px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}.dx-score-slash{color:var(--card-muted);font-weight:700}
    .score-card-foot{display:flex;min-width:0;align-items:center;justify-content:flex-end;margin-top:0;padding-top:${px(width * 0.004)}px}
    .score-badges{display:flex;min-width:0;align-items:center;justify-content:flex-end;gap:${px(width * 0.002)}px}
    .score-badge{display:inline-flex;min-width:${px(width * 0.02)}px;height:${px(width * 0.015)}px;align-items:center;justify-content:center;padding:0 ${px(width * 0.0035)}px;border:1px solid ${normalStatus.border};border-radius:999px;background:${normalStatus.background};color:${normalStatus.text};font:900 ${px(width * 0.0075)}px/1 system-ui,sans-serif;text-align:center;white-space:nowrap}.score-badge.rate.tone-rainbow{border:${Math.max(1, px(width * 0.0015))}px solid transparent;background:${rainbowLayeredBackground};color:${BEST_IMAGE_RAINBOW_TEXT};text-shadow:none}.score-badge.rate.tone-gold{border:${Math.max(1, px(width * 0.0015))}px solid transparent;background:${goldLayeredBackground};color:${BEST_IMAGE_RAINBOW_TEXT}}.score-badge.tone-gold{border-color:${goldStatus.border};background:${goldStatus.background};color:${goldStatus.text}}.score-badge.tone-green{border-color:${greenStatus.border};background:${greenStatus.background};color:${greenStatus.text}}.score-badge.tone-blue{border-color:${blueStatus.border};background:${blueStatus.background};color:${blueStatus.text}}.score-badge.tone-neutral{border-color:${neutralStatus.border};background:${neutralStatus.background};color:${neutralStatus.text};text-shadow:0 1px 1px rgba(31,41,55,.48)}
    .empty-section{grid-column:1/-1;display:flex;min-height:${px(width * 0.08)}px;align-items:center;justify-content:center;color:#697586;font:700 ${px(width * 0.012)}px/1.4 system-ui,sans-serif}
    .empty-scores{display:flex;min-height:${px(width * 0.15)}px;align-items:center;justify-content:center;border:1px dashed rgba(91,105,126,.45);border-radius:${px(width * 0.012)}px;background:rgba(255,255,255,.64);color:#697586;font:700 ${px(width * 0.013)}px/1.4 system-ui,sans-serif}
  </style>
</head>
<body>
  <div class="preview-stage">
    <main class="canvas" data-image-type="${input.type}" aria-label="成绩图片预览">
      ${canvasBackground}<div class="canvas-tone"></div>${isAppStyle ? '' : gamePageMarker}
      ${isAppStyle ? appProfileMarkup : gameProfileMarkup}
      <div class="scores-content" data-layout-content aria-label="成绩列表">${scoreContent}</div>
    </main>
  </div>
  <script>
    (() => {
      const OUTPUT_WIDTH = ${width};
      const MINIMUM_HEIGHT = ${minimumHeight};
      const APP_PROFILE_SCALE = ${Number((width / 1080).toFixed(6))};
      const APP_NAME_MAX_SIZE = ${appNameFontSize};
      const APP_NAME_MIN_SIZE = ${appNameMinimumFontSize};
      const APP_GLASS_BLEED = ${appGlassBleed};
      const canvas = document.querySelector('.canvas');
      let lastHeight = 0;
      let pending = false;
      let readySent = false;
      let activeStarRightOffset = 0;

      const fitAppPlayerName = () => {
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

      const starPoints = (size) => {
        const outerRadius = size / 2;
        const innerRadius = outerRadius * 0.43;
        return Array.from({ length: 10 }, (_, index) => {
          const radius = index % 2 === 0 ? outerRadius : innerRadius;
          const angle = -Math.PI / 2 + index * Math.PI / 5;
          return (Math.cos(angle) * radius).toFixed(2) + ',' + (Math.sin(angle) * radius).toFixed(2);
        }).join(' ');
      };

      const starTrackPoint = (progress, boxWidth, boxHeight) => {
        const radius = 22 * APP_PROFILE_SCALE;
        const outerRadius = radius + 9 * APP_PROFILE_SCALE;
        const centerX = boxWidth - radius;
        const topCenterY = radius;
        const bottomCenterY = boxHeight - radius;
        const arcLength = Math.PI * outerRadius / 2;
        const straightLength = Math.max(0, boxHeight - radius * 2);
        const distance = Math.max(0, Math.min(1, progress)) * (arcLength * 2 + straightLength);
        if (distance <= arcLength) {
          const angle = -Math.PI / 2 + distance / outerRadius;
          return [centerX + Math.cos(angle) * outerRadius, topCenterY + Math.sin(angle) * outerRadius];
        }
        if (distance <= arcLength + straightLength) return [centerX + outerRadius, topCenterY + distance - arcLength];
        const angle = (distance - arcLength - straightLength) / outerRadius;
        return [centerX + Math.cos(angle) * outerRadius, bottomCenterY + Math.sin(angle) * outerRadius];
      };

      const layoutAppRatingStars = () => {
        const identity = document.getElementById('rating-box');
        const track = document.getElementById('rating-star-track');
        const stars = document.getElementById('rating-stars');
        if (!identity || !track || !stars) return;
        const starCount = Math.max(0, Number(identity.getAttribute('data-star-count')) || 0);
        const boxWidth = identity.offsetWidth;
        const boxHeight = identity.offsetHeight;
        const layoutKey = boxWidth + ':' + boxHeight + ':' + starCount;
        if (track.getAttribute('data-layout-key') === layoutKey) return;
        track.setAttribute('data-layout-key', layoutKey);
        const trackTop = 16 * APP_PROFILE_SCALE;
        const trackExtra = 45 * APP_PROFILE_SCALE;
        track.setAttribute('viewBox', '0 -' + trackTop + ' ' + (boxWidth + trackExtra) + ' ' + (boxHeight + trackTop * 2));
        track.style.width = (boxWidth + trackExtra) + 'px';
        track.style.height = (boxHeight + trackTop * 2) + 'px';
        track.style.top = '-' + trackTop + 'px';
        activeStarRightOffset = boxWidth;
        while (stars.firstChild) stars.removeChild(stars.firstChild);
        const starSize = 11 * APP_PROFILE_SCALE;
        for (let index = 0; index < starCount; index += 1) {
          const point = starTrackPoint((index + 1) / (starCount + 1), boxWidth, boxHeight);
          activeStarRightOffset = Math.max(activeStarRightOffset, point[0] + starSize / 2);
          const star = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
          star.setAttribute('points', starPoints(starSize));
          star.setAttribute('transform', 'translate(' + point[0].toFixed(2) + ' ' + point[1].toFixed(2) + ')');
          stars.appendChild(star);
        }
      };

      const updateAppGlassFade = () => {
        const banner = document.getElementById('profile-banner');
        const identity = document.getElementById('rating-box');
        if (!banner || !identity || !banner.clientWidth) return;
        const starRight = identity.offsetLeft + activeStarRightOffset;
        const startPx = Math.max(banner.clientWidth * 0.3, Math.min(banner.clientWidth * 0.62, starRight));
        const endPx = Math.min(banner.clientWidth * 0.8, Math.max(startPx + banner.clientWidth * 0.14, banner.clientWidth * 0.58));
        const stepOnePx = startPx + (endPx - startPx) * 0.34;
        const stepTwoPx = startPx + (endPx - startPx) * 0.68;
        const expandedLayerWidth = endPx + APP_GLASS_BLEED;
        const localStart = (startPx + APP_GLASS_BLEED) / expandedLayerWidth * 100;
        const localStepOne = (stepOnePx + APP_GLASS_BLEED) / expandedLayerWidth * 100;
        const localStepTwo = (stepTwoPx + APP_GLASS_BLEED) / expandedLayerWidth * 100;
        banner.style.setProperty('--glass-physical-width', (endPx / banner.clientWidth * 100).toFixed(1) + '%');
        banner.style.setProperty('--glass-local-start', localStart.toFixed(1) + '%');
        banner.style.setProperty('--glass-local-step-1', localStepOne.toFixed(1) + '%');
        banner.style.setProperty('--glass-local-step-2', localStepTwo.toFixed(1) + '%');
      };

      const layoutAppProfile = () => {
        if (!document.getElementById('profile-banner')) return;
        fitAppPlayerName();
        layoutAppRatingStars();
        updateAppGlassFade();
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
        layoutAppProfile();
        const layoutChildren = Array.from(canvas.children).filter((child) => child.hasAttribute('data-layout-content'));
        const contentHeight = layoutChildren.reduce((maximum, child) => Math.max(maximum, child.offsetTop + child.scrollHeight), 0);
        const logicalHeight = Math.max(MINIMUM_HEIGHT, Math.ceil(contentHeight));
        const nextHeight = logicalHeight + 'px';
        if (canvas.style.height !== nextHeight) canvas.style.height = nextHeight;

        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || OUTPUT_WIDTH;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || MINIMUM_HEIGHT;
        // Export WebView is sized to OUTPUT_WIDTH x logicalHeight. Force 1:1 layout so capture
        // never letterboxes while the native container is still catching up between pages.
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
      const fontReady = document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(() => undefined)
        : Promise.resolve();
      fontReady.then(schedule);
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
      const assetReady = Promise.all([fontReady, ...imageReady]);
      const assetTimeout = new Promise((resolve) => window.setTimeout(resolve, 5000));
      Promise.race([assetReady, assetTimeout]).then(() => {
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
