import type { Player, ScoreRecord } from '@/domain/models';
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
  const backgroundBlur = px(width * 0.02);
  const scoresTop = pageInset + bannerHeight + px(width * 0.035);
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
  const canvasBackground = frameUrl
    ? `<div class="canvas-background" style="background-image:url(&quot;${escapeHtml(frameUrl)}&quot;)"></div>`
    : '<div class="canvas-background canvas-background-fallback"></div>';
  const rainbowLayeredBackground = layeredBadgeCssBackground('rainbow');
  const goldLayeredBackground = layeredBadgeCssBackground('gold');
  const pageCount = Math.max(1, Math.floor(input.pageCount ?? 1));
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(input.pageIndex ?? 0)));
  const pageMarker = pageCount > 1 ? `<div class="page-marker">第 ${pageIndex + 1} / ${pageCount} 页</div>` : '';
  const normalTrophy = TROPHY_BADGE_THEMES.normal;
  const bronzeTrophy = TROPHY_BADGE_THEMES.bronze;
  const silverTrophy = TROPHY_BADGE_THEMES.silver;
  const goldTrophy = TROPHY_BADGE_THEMES.gold;
  const normalStatus = STATUS_BADGE_THEMES.normal;
  const goldStatus = STATUS_BADGE_THEMES.gold;
  const greenStatus = STATUS_BADGE_THEMES.green;
  const blueStatus = STATUS_BADGE_THEMES.blue;
  const neutralStatus = STATUS_BADGE_THEMES.neutral;

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
    .profile-banner{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset}px;width:${bannerWidth}px;height:${bannerHeight}px;border-radius:${radius}px;filter:drop-shadow(0 ${px(bannerWidth * 0.008)}px ${px(bannerWidth * 0.018)}px rgba(35,53,82,.22))}
    .profile-banner.no-plate{border:1px solid rgba(255,255,255,.78);background:rgba(240,244,250,.78)}
    .nameplate-image,.nameplate-fallback{position:absolute;inset:0;display:block;width:100%;height:100%;border-radius:${radius}px}
    .nameplate-image{object-fit:contain}
    .nameplate-fallback{border:${Math.max(1, px(bannerWidth * 0.002))}px solid rgba(255,255,255,.8);background:linear-gradient(100deg,#9EB5D8 0%,#E8EDF6 38%,#F5D9B4 70%,#D99591 100%)}
    .avatar{position:absolute;left:${avatarInset}px;top:${avatarInset}px;width:${avatarSize}px;height:${avatarSize}px;overflow:hidden;border-radius:${px(bannerWidth * 0.01)}px;border:${Math.max(2, px(bannerWidth * 0.004))}px solid rgba(255,255,255,.9);background:#DDE5F0;box-shadow:0 ${px(bannerWidth * 0.004)}px ${px(bannerWidth * 0.01)}px rgba(27,41,68,.28)}
    .avatar-image{display:block;width:100%;height:100%;object-fit:cover}
    .avatar-fallback{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:900 ${px(bannerWidth * 0.065)}px/1 system-ui,sans-serif;color:#52647F;background:linear-gradient(145deg,#F8FBFF,#C7D5EA)}
    .identity{position:absolute;left:${identityLeft}px;right:${identityRight}px;top:${avatarInset}px;bottom:${avatarInset}px;display:flex;min-width:0;flex-direction:column;align-items:flex-start;justify-content:center;gap:${px(bannerWidth * 0.004)}px;transform:translateY(-${px(bannerWidth * 0.004)}px)}
    .rating{position:relative;width:${ratingWidth}px;height:${ratingHeight}px;flex:0 0 ${ratingHeight}px}
    .rating-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
    .rating-digits{position:absolute;left:48.3%;top:17%;display:grid;grid-template-columns:repeat(5,1fr);align-items:center;width:43.8%;height:61%;font-family:RatingNumbers,"Arial Black",sans-serif;font-size:${ratingFontSize}px;font-weight:900;line-height:1;color:#FFD83D;-webkit-text-stroke:${stroke}px #090909;text-shadow:0 ${Math.max(1, stroke)}px 0 #090909;font-variant-numeric:tabular-nums}
    .rating-digits span{display:flex;align-items:center;justify-content:center;height:100%}
    .player-name{display:inline-flex;width:fit-content;max-width:100%;min-height:${px(playerNameSize * 1.35)}px;align-items:center;overflow:hidden;padding:0 ${px(bannerWidth * 0.011)}px;border:${Math.max(1, px(bannerWidth * 0.0015))}px solid rgba(96,87,72,.45);border-radius:${px(bannerWidth * 0.006)}px;background:rgba(255,255,255,.9);color:#171717;font:900 ${playerNameSize}px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .trophy{display:flex;width:fit-content;max-width:100%;height:${px(bannerWidth * 0.029)}px;align-items:center;justify-content:center;overflow:hidden;padding:0 ${px(bannerWidth * 0.009)}px;border:${Math.max(1, px(bannerWidth * 0.0015))}px solid ${normalTrophy.border};border-radius:999px;background:${normalTrophy.background};color:${normalTrophy.text};font:400 ${trophySize}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;text-overflow:ellipsis;white-space:nowrap}.trophy.bronze{border-color:${bronzeTrophy.border};background:${bronzeTrophy.background};color:${bronzeTrophy.text}}.trophy.silver{border-color:${silverTrophy.border};background:${silverTrophy.background};color:${silverTrophy.text}}.trophy.gold{border-color:${goldTrophy.border};background:${goldTrophy.background};color:${goldTrophy.text}}.trophy.rainbow{border-color:transparent;background:${rainbowLayeredBackground};color:${BEST_IMAGE_RAINBOW_TEXT};text-shadow:none}
    .page-marker{position:absolute;z-index:2;right:${pageInset}px;top:${pageInset}px;display:flex;height:${px(width * 0.025)}px;align-items:center;justify-content:center;padding:0 ${px(width * 0.01)}px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.72);color:#4B5563;font:700 ${px(width * 0.009)}px/1 system-ui,sans-serif}
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
      ${canvasBackground}<div class="canvas-tone"></div>${pageMarker}
      <section class="profile-banner${hidePlate ? ' no-plate' : ''}" data-layout-content aria-label="玩家资料">
        ${nameplate}
        ${hideIcon ? '' : `<div class="avatar">${avatar}</div>`}
        <div class="identity">
          <div class="rating" aria-label="Rating ${rating}"><img class="rating-frame" alt="" src="${escapeHtml(input.ratingFrameUrl)}"><div class="rating-digits">${ratingDigits}</div></div>
          <div class="player-name">${escapeHtml(name)}</div>
          ${trophy}
        </div>
      </section>
      <div class="scores-content" data-layout-content aria-label="成绩列表">${scoreContent}</div>
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
        const scale = Math.min(viewportWidth / OUTPUT_WIDTH, viewportHeight / logicalHeight);
        canvas.style.left = Math.max(0, (viewportWidth - OUTPUT_WIDTH * scale) / 2) + 'px';
        canvas.style.top = Math.max(0, (viewportHeight - logicalHeight * scale) / 2) + 'px';
        canvas.style.transform = 'scale(' + scale + ')';

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
