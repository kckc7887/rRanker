import type { Player, ScoreRecord } from '@/domain/models';
import { resolveMaimaiCourseRank } from '@/domain/maimai-course-rank';
import type { BestImageRatingStyle } from '@/features/best-image/best-image-style-preferences';
import { formatAchievement } from '@/domain/score-presentation';
import { normalizeTrophyTone } from '@/features/best-image/best-image-badge-theme';
import {
  bestImageBridgeMeasureScript,
  bestImageBridgeReadyScript,
  bestImageBridgeRuntimeScript,
} from '@/features/best-image/best-image-bridge-script';
import { minimumBestImageHeight } from '@/features/best-image/best-image-messages';

export type BestImageType = 'best50' | 'custom';

export type BestImageScoreSection = {
  id: string;
  title: string;

  subtitle?: string;
  records: readonly ScoreRecord[];
  rankOffset?: number;
};

export type BestImageHiddenStyle = 'icon' | 'plate' | 'trophy' | 'frame';

export type BestImageHtmlInput = {
  type: BestImageType;
  width: number;
  player: Pick<Player, 'displayName' | 'presentation' | 'extension'>;
  rating: number;
  ratingStyle?: BestImageRatingStyle;
  scoreSections: readonly BestImageScoreSection[];
  coverUrls?: Readonly<Record<string, string | null>>;
  hiddenStyles?: readonly BestImageHiddenStyle[];
  collectionUrls?: Partial<Record<'icon' | 'plate' | 'frame', string | null>>;
  fontUrl: string;
  ratingFrameUrl: string;

  cnFontUrl?: string;

  dataSource?: string;
  pageIndex?: number;
  pageCount?: number;
};

const LXNS_ASSET_ROOT = 'https://assets2.lxns.net/maimai';
const DIFFICULTY_COLORS: Record<ScoreRecord['difficulty'], string> = {
  basic: '#81D955', advanced: '#F8B709', expert: '#FF818D', master: '#9F51DC',
  remaster: '#BB57C5', utage: '#FF6FFD', unknown: '#6B7280',
};

/** 布局参考 nonebot-plugin-maimaidx。 */
const GAME_DIFF_TEXT_COLOR = ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#8A00E2'];
const GAME_ID_TEXT_COLOR = ['#81D955', '#F5BD15', '#FF818D', '#9F51DC', '#8A00E2'];
const GAME_DIFF_BG = ['basic', 'advanced', 'expert', 'master', 'remaster'];
const GAME_RANK_MAP: Record<string, string> = {
  d: 'D', c: 'C', b: 'B', bb: 'BB', bbb: 'BBB', a: 'A', aa: 'AA', aaa: 'AAA',
  s: 'S', sp: 'Sp', ss: 'SS', ssp: 'SSp', sss: 'SSS', sssp: 'SSSp',
};
const GAME_COMBO_MAP: Record<string, string> = { fc: 'FC', fcp: 'FCp', ap: 'AP', app: 'APp' };
const GAME_SYNC_MAP: Record<string, string> = {
  fs: 'FS', fsp: 'FSp', fsd: 'FSD', fdx: 'FSD', fsdp: 'FSDp', fdxp: 'FSDp', sync: 'Sync',
};
const GAME_TROPHY_FILE: Record<string, string> = {
  normal: 'Normal', bronze: 'Bronze', silver: 'Silver', gold: 'Gold', rainbow: 'Rainbow',
};

export function ratingFrameIndex(rating: number): number {
  const value = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 0;
  let index = 0;
  for (let cursor = 0; cursor < BEST_IMAGE_RATING_FRAME_MINS.length; cursor += 1) {
    if (value >= BEST_IMAGE_RATING_FRAME_MINS[cursor]!) index = cursor;
  }
  return index;
}

/** 使用导出图原始 Rating 框的 11 档阈值。 */
export const BEST_IMAGE_RATING_FRAME_MINS = [
  0, 1000, 2000, 4000, 7000, 10000, 12000, 13000, 14000, 14500, 15000,
] as const;

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

function renderAppScoreCard(
  record: ScoreRecord, rank: number, coverUrls: BestImageHtmlInput['coverUrls'], id: string,
): string {
  const jacket = coverUrls && Object.hasOwn(coverUrls, record.songId)
    ? coverUrls[record.songId] : `${LXNS_ASSET_ROOT}/jacket/${encodeURIComponent(record.songId)}.png`;
  const color = DIFFICULTY_COLORS[record.difficulty];
  const remaster = record.difficulty === 'remaster';
  const background = remaster ? `url(#${id}-theme)` : color;
  const achievement = record.achievements;
  const [integer, fraction] = achievement.toFixed(4).split('.');
  const colors = achievement >= 100 ? ['#FFF0B0', '#C8FFF0', '#FBD9EC']
    : achievement >= 99 ? ['#FFF5C6', '#FFE17D', '#FFE9A5'] : ['#FFFFFF', '#FFFFFF', '#FFFFFF'];
  const grade = GAME_RANK_MAP[record.rate?.trim().toLowerCase() ?? ''];
  const combo = GAME_COMBO_MAP[record.fc?.trim().toLowerCase() ?? ''];
  const sync = GAME_SYNC_MAP[record.fs?.trim().toLowerCase() ?? ''];
  const star = gameDxStar(record);
  const gradeWidths: Record<string, number> = { SSSp: 154, SSS: 131, SSp: 113, SS: 90, Sp: 72, S: 49, AAA: 131, AA: 90, A: 49, BBB: 131, BB: 90, B: 49, C: 49, D: 49 };
  const starWidths = [0, 50, 100, 60, 76.67, 90];
  const icon = (file: string | undefined, x: number, y: number, w: number, h: number) => file
    ? `<image x="${x}" y="${y}" width="${w}" height="${h}" href="ui/card/${file}.svg"/>` : '';
  const maximum = record.notes?.total == null ? '—' : (record.notes.total * 3).toLocaleString('en-US');
  const actual = record.dxScore == null ? '—' : record.dxScore.toLocaleString('en-US');
  const fades = [
    ['clear', 132, 224, true], ['soft', 150, 282, true],
    ['medium', 196, 370, true], ['panel', 108, 382, false],
  ] as const;
  return `<article class="app-score-card" data-rank="${rank}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 756 360" class="app-card-art" fill="white">
    <defs>
      <clipPath id="${id}-clip"><rect width="756" height="360" rx="26"/></clipPath>
      <linearGradient id="${id}-theme" gradientUnits="userSpaceOnUse" x1="174" y1="0" x2="756" y2="360"><stop stop-color="#9B50D1"/><stop offset=".5" stop-color="#BB57C5"/><stop offset="1" stop-color="#DD63A9"/></linearGradient>
      <linearGradient id="${id}-number" x1="0" x2="1" y1=".15" y2=".9"><stop stop-color="${colors[0]}"/><stop offset=".52" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient>
      <linearGradient id="${id}-footer" x1="0" y1="0" x2="0" y2="1"><stop stop-color="white" stop-opacity="0"/><stop offset=".35" stop-color="white" stop-opacity=".96"/><stop offset="1" stop-color="white"/></linearGradient>
      <mask id="${id}-footer-mask" maskUnits="userSpaceOnUse" x="0" y="254" width="756" height="106"><rect y="254" width="756" height="106" fill="url(#${id}-footer)"/></mask>
      ${jacket ? `<image id="${id}-jacket" width="286" height="286" preserveAspectRatio="xMidYMid slice" href="${escapeHtml(jacket)}"/><g id="${id}-art"><use href="#${id}-jacket"/><use href="#${id}-jacket" transform="translate(572 0) scale(-1 1)"/></g>` : ''}
      ${[['soft', 8.1], ['medium', 22.5], ['heavy', 45]].map(([name, radius]) => `<filter id="${id}-${name}" filterUnits="userSpaceOnUse" x="-100" y="-100" width="956" height="560" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${radius}"/></filter>`).join('')}
      <filter id="${id}-ink" x="-8%" y="-8%" width="116%" height="120%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="2.2" stdDeviation="1.1" flood-color="#4A285F" flood-opacity=".6"/></filter>
      ${fades.map(([name, start, end, reverse]) => `<linearGradient id="${id}-${name}-fade" gradientUnits="userSpaceOnUse" x1="${start}" y1="0" x2="${end}" y2="0">${Array.from({ length: 17 }, (_, i) => {
        const opacity = (1 - Math.cos(i / 16 * Math.PI)) / 2;
        return `<stop offset="${i / 16}" stop-color="white" stop-opacity="${reverse ? 1 - opacity : opacity}"/>`;
      }).join('')}</linearGradient><mask id="${id}-${name}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="756" height="360"><rect width="756" height="360" fill="url(#${id}-${name}-fade)"/></mask>`).join('')}
    </defs>
    <g clip-path="url(#${id}-clip)">
      <rect width="756" height="360" fill="${background}"/>
      ${jacket ? `<use href="#${id}-art" filter="url(#${id}-heavy)"/><g mask="url(#${id}-medium-mask)"><use href="#${id}-art" filter="url(#${id}-medium)"/></g><g mask="url(#${id}-soft-mask)"><use href="#${id}-art" filter="url(#${id}-soft)"/></g><use href="#${id}-jacket" mask="url(#${id}-clear-mask)"/>` : ''}
      <rect width="756" height="360" fill="${background}" mask="url(#${id}-panel-mask)"/>
      <rect y="254" width="756" height="106" fill="${background}" mask="url(#${id}-footer-mask)"/>
      <path d="M24 284H732" stroke="white" stroke-opacity=".26"/>
      <g filter="url(#${id}-ink)">
        ${icon(record.type === 'DX' ? 'DX' : 'SD', 18, 224, 108, 40)}
        <text class="app-song-title" data-title="${escapeHtml(record.title)}" text-anchor="end" font-size="52" font-weight="800" x="732" y="72">${escapeHtml(record.title)}</text>
        <text class="app-achievement" x="732" y="208" fill="url(#${id}-number)" font-weight="900" letter-spacing="-2.2" text-anchor="end"><tspan font-size="104">${integer}.</tspan><tspan font-size="88">${fraction}</tspan><tspan dx="4" font-size="36">%</tspan></text>
        <text x="452" y="264" font-size="42" font-weight="800" text-anchor="end">#${rank}</text>
        <text class="app-ds-rating" x="732" y="264" font-size="44" font-weight="800" text-anchor="end">${record.difficultyConstant.toFixed(1)}<tspan dx="11" font-size="36">→</tspan><tspan dx="11">${record.rating}</tspan></text>
        ${icon(grade ? `Rank_${grade}` : undefined, 24, 299, (gradeWidths[grade ?? ''] ?? 49) * 46 / 60, 46)}
        ${icon(star ? `Star_0${star}` : undefined, 250 - starWidths[star]! / 2, 296, starWidths[star]!, 50)}
        <text class="app-dxscore" x="320" y="335" font-size="32" font-weight="800">${actual}<tspan dx="5" font-size="26" fill="#E6EBF7" font-weight="600">/ ${maximum}</tspan></text>
      </g>
      ${icon(combo ? `Icon_${combo}` : undefined, 570, 282, 70, 70)}
      ${icon(sync ? `Icon_${sync}` : undefined, 656, 282, 70, 70)}
      <rect x=".6" y=".6" width="754.8" height="358.8" rx="25.4" fill="none" stroke="white" stroke-opacity=".3" stroke-width="1.2"/>
    </g>
  </svg></article>`;
}

function renderAppScoreSection(section: BestImageScoreSection, coverUrls: BestImageHtmlInput['coverUrls'], sectionIndex: number): string {
  const cards = section.records.map((record, index) => renderAppScoreCard(record, (section.rankOffset ?? 0) + index + 1, coverUrls, `app-${sectionIndex}-${index}`)).join('');
  return `<section class="app-score-section"><div class="section-divider"><span>${escapeHtml(section.title)}</span></div>${section.subtitle ? `<div class="section-subtitle">${escapeHtml(section.subtitle)}</div>` : ''}<div class="app-score-grid">${cards || '<div class="empty-section">暂无符合条件的成绩</div>'}</div></section>`;
}

function gameDxStar(record: ScoreRecord): number {
  const theoretical = record.notes && typeof record.notes.total === 'number' ? record.notes.total * 3 : null;
  if (theoretical === null || theoretical <= 0 || record.dxScore === null || !Number.isFinite(record.dxScore)) return 0;
  const ratio = record.dxScore / theoretical;
  if (ratio >= 1) return 5;
  if (ratio >= 0.9) return 4;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.7) return 2;
  return 1;
}

function renderGameScoreCard(
  record: ScoreRecord,
  rank: number,
  coverUrls: Readonly<Record<string, string | null>> | undefined,
  u: (value: number) => number,
  left = 0,
  top = 0,
): string {
  const hasPreparedJacket = coverUrls && Object.hasOwn(coverUrls, record.songId);
  const preparedJacket = hasPreparedJacket ? coverUrls![record.songId] : undefined;
  const jacketUrl = preparedJacket === undefined
    ? `${LXNS_ASSET_ROOT}/jacket/${encodeURIComponent(record.songId)}.png`
    : preparedJacket;
  const levelIndex = Math.max(0, Math.min(4, record.levelIndex));
  const diffTextColor = GAME_DIFF_TEXT_COLOR[levelIndex]!;
  const idTextColor = GAME_ID_TEXT_COLOR[levelIndex]!;
  const rankFile = GAME_RANK_MAP[record.rate?.trim().toLowerCase() ?? ''] ?? '';
  const fcFile = GAME_COMBO_MAP[record.fc?.trim().toLowerCase() ?? ''] ?? '';
  const fsFile = GAME_SYNC_MAP[record.fs?.trim().toLowerCase() ?? ''] ?? '';
  const star = gameDxStar(record);
  const theoretical = record.notes && typeof record.notes.total === 'number' ? record.notes.total * 3 : null;
  const actualDxScore = record.dxScore === null ? '—' : String(record.dxScore);
  const maximumDxScore = theoretical === null ? '—' : String(theoretical);
  const position = (left: number, top: number, width: number, height: number) =>
    `left:${u(left)}px;top:${u(top)}px;width:${u(width)}px;height:${u(height)}px`;
  const textPosition = (left: number, top: number, size: number) =>
    `left:${u(left)}px;top:${u(top)}px;font-size:${u(size)}px`;
  return `<article class="game-card" style="left:${u(left)}px;top:${u(top)}px;width:${u(264)}px;height:${u(109)}px" aria-label="第 ${rank} 名 ${escapeHtml(record.title)}">
    <img class="game-card-bg" alt="" style="${position(0, 0, 264, 109)}" src="ui/b50_score_${GAME_DIFF_BG[levelIndex]}.png">
    ${jacketUrl ? `<img class="game-cover" alt="" style="${position(12, 12, 75, 75)}" src="${escapeHtml(jacketUrl)}">` : ''}
    <img class="game-type" alt="" style="${position(51, 91, 37, 14)}" src="ui/${record.type === 'DX' ? 'DX' : 'SD'}.png">
    ${rankFile ? `<img class="game-rank" alt="" style="${position(92, 78, 63, 28)}" src="ui/Rank_${rankFile}.png">` : ''}
    ${fcFile ? `<img class="game-fc" alt="" style="${position(154, 77, 34, 34)}" src="ui/Icon_${fcFile}.png">` : ''}
    ${fsFile ? `<img class="game-fs" alt="" style="${position(185, 77, 34, 34)}" src="ui/Icon_${fsFile}.png">` : ''}
    ${star > 0 ? `<img class="game-star" alt="" style="${position(217, 80, 47, 26)}" src="ui/Star_0${star}.png">` : ''}
    <div class="game-id" style="${textPosition(26, 98, 13)};color:${idTextColor}">${escapeHtml(record.songId)}</div>
    <div class="game-title" style="${textPosition(93, 6, 14)};max-width:${u(160)}px;color:${diffTextColor}">${escapeHtml(record.title)}</div>
    <div class="game-achievement" style="${textPosition(93, 48, 26)};color:${diffTextColor}">${formatAchievement(record.achievements)}</div>
    <div class="game-dxscore" style="${textPosition(219, 68, 15)};color:${diffTextColor}">${actualDxScore}/${maximumDxScore}</div>
    <div class="game-ds-rating" style="${textPosition(93, 68, 15)};color:${diffTextColor}">${record.difficultyConstant.toFixed(1)} -> ${record.rating}</div>
  </article>`;
}

function renderGameScoreSection(
  section: BestImageScoreSection,
  coverUrls: Readonly<Record<string, string | null>> | undefined,
  u: (value: number) => number,
): string {
  const divider = `<div class="section-divider"><span>${escapeHtml(section.title)}</span></div>`;
  const subtitle = section.subtitle
    ? `<div class="section-subtitle">${escapeHtml(section.subtitle)}</div>`
    : '';
  const rows = Math.ceil(section.records.length / 5);
  const gridHeight = rows > 0 ? u((rows - 1) * 114 + 109) : u(109);
  const cards = section.records.map((record, index) => {
    const col = index % 5;
    const row = Math.floor(index / 5);
    return renderGameScoreCard(record, (section.rankOffset ?? 0) + index + 1, coverUrls, u, 16 + col * 276, row * 114);
  }).join('');
  const emptyMarkup = cards ? '' : `<div class="game-empty" style="font-size:${u(13)}px">暂无符合条件的成绩</div>`;
  return `<section class="game-section" aria-label="${escapeHtml(section.title)}">${divider}${subtitle}<div class="game-grid" style="height:${gridHeight}px">${cards}${emptyMarkup}</div></section>`;
}

function collectionAssetUrl(kind: 'icon' | 'plate' | 'frame', id: number | undefined): string | null {
  if (!Number.isSafeInteger(id) || (id ?? -1) < 0) return null;
  return `${LXNS_ASSET_ROOT}/${kind}/${id}.png`;
}

/** 全角按 1em、半角按 0.55em 估算称号宽度。 */
function estimateTextWidth(text: string, fontSize: number): number {
  let fullWidthCount = 0;
  let halfWidthCount = 0;
  for (const char of Array.from(text)) {
    const code = char.codePointAt(0)!;
    if ((code >= 0x3000 && code <= 0xFF60) || code >= 0xFFE0) fullWidthCount += 1;
    else halfWidthCount += 1;
  }
  return (fullWidthCount + halfWidthCount * 0.55) * fontSize;
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

  const useCnFont = !!input.cnFontUrl;
  const fontPath = isAppStyle ? 'fonts/SourceHanSansCN-Bold.otf' : input.cnFontUrl;
  /** 以 1400px 为基准缩放，坐标 0 不抬至 1px。 */
  const u = (value: number) => value === 0 ? 0 : px(value * width / 1400);
  const digits = String(rating).padStart(5, '0').split('');
  const name = input.player.displayName.trim() || '未读取玩家资料';
  const presentation = input.player.presentation;
  const hiddenStyles = new Set(input.hiddenStyles ?? []);
  const hideIcon = hiddenStyles.has('icon');
  const hidePlate = hiddenStyles.has('plate');
  const hideTrophy = hiddenStyles.has('trophy');
  const plateUrl = hidePlate ? null : (input.collectionUrls && Object.hasOwn(input.collectionUrls, 'plate') ? input.collectionUrls.plate : collectionAssetUrl('plate', presentation?.namePlateId));
  const iconUrl = hideIcon ? null : (input.collectionUrls && Object.hasOwn(input.collectionUrls, 'icon') ? input.collectionUrls.icon : collectionAssetUrl('icon', presentation?.iconId));
  const frameUrl = hiddenStyles.has('frame') ? null : (input.collectionUrls && Object.hasOwn(input.collectionUrls, 'frame') ? input.collectionUrls.frame : collectionAssetUrl('frame', presentation?.frameId));
  const trophyName = presentation?.trophyName?.trim() || '称号未同步';
  const trophyTextFontSizeBase = u(14);
  const trophyTextAvailableWidth = u(270 - 24);
  const trophyTextMinFontSize = u(9);
  const trophyEstimatedWidth = estimateTextWidth(trophyName, trophyTextFontSizeBase);
  const trophyTextCompressed = !hideTrophy && trophyEstimatedWidth > trophyTextAvailableWidth;

  const trophyTextFontSize = trophyTextCompressed
    ? Math.max(trophyTextMinFontSize, Math.floor(trophyTextFontSizeBase * trophyTextAvailableWidth / trophyEstimatedWidth))
    : trophyTextFontSizeBase;
  const initial = Array.from(name)[0] ?? '?';
  const pageCount = Math.max(1, Math.floor(input.pageCount ?? 1));
  const pageIndex = Math.min(pageCount - 1, Math.max(0, Math.floor(input.pageIndex ?? 0)));

  const courseRank = resolveMaimaiCourseRank(input.player);
  const backgroundBlur = px(width * 0.02);
  const scoreSections = input.scoreSections
    .map((section, index) => isAppStyle ? renderAppScoreSection(section, input.coverUrls, index) : renderGameScoreSection(section, input.coverUrls, u))
    .join('');
  const scoreContent = scoreSections || '<div class="empty-scores">暂无可用于图片的成绩</div>';
  const canvasBackground = frameUrl
    ? `<div class="canvas-background" style="background-image:url(&quot;${escapeHtml(frameUrl)}&quot;)"></div>`
    : '<div class="canvas-background canvas-background-fallback"></div>';
  const pageMarkerLabel = `第 ${pageIndex + 1} / ${pageCount} 页`;
  const gamePageMarker = pageCount > 1 ? `<div class="page-marker page-marker-game">${pageMarkerLabel}</div>` : '';
  const daniNum = courseRank?.assetIndex ?? 0;
  const daniFile = `DaniPlate_${String(daniNum).padStart(2, '0')}`;
  const dxRatingFile = `DXRating_${String(ratingFrameIndex(rating) + 1).padStart(2, '0')}`;
  const trophyFile = GAME_TROPHY_FILE[normalizeTrophyTone(presentation?.trophyColor)] ?? 'Normal';
  const gameHeadMarkup = `<section class="game-head" data-layout-content aria-label="玩家资料" style="height:${u(190)}px">
        ${hidePlate ? '' : plateUrl
          ? `<img class="game-plate" alt="" style="left:${u(14)}px;top:${u(60)}px;width:${u(800)}px;height:${u(130)}px" src="${escapeHtml(plateUrl)}">`
          : `<div class="game-plate-fallback" style="left:${u(14)}px;top:${u(60)}px;width:${u(800)}px;height:${u(130)}px"></div>`}
        ${hideIcon ? '' : iconUrl
          ? `<img class="game-icon" alt="" style="left:${u(19)}px;top:${u(65)}px;width:${u(120)}px;height:${u(120)}px" src="${escapeHtml(iconUrl)}">`
          : `<div class="game-icon-fallback" style="left:${u(19)}px;top:${u(65)}px;width:${u(120)}px;height:${u(120)}px">${escapeHtml(initial)}</div>`}
        <img class="game-dxrating" alt="" style="left:${u(149)}px;top:${u(72)}px;width:${u(186)}px;height:${u(35)}px" src="ui/${dxRatingFile}.png">
        ${digits.map((digit, index) => `<img class="game-digit" alt="" style="left:${u(234 + 15 * index)}px;top:${u(80)}px;width:${u(17)}px;height:${u(20)}px" src="ui/Drating_${digit}.png">`).join('')}
        <img class="game-name-bg" alt="" style="left:${u(149)}px;top:${u(115)}px;width:${u(272)}px;height:${u(42)}px" src="ui/Name.png">
        <img class="game-dani" alt="" style="left:${u(339)}px;top:${u(120)}px;width:${u(80)}px;height:${u(32)}px" src="ui/${daniFile}.png">
        ${hideTrophy ? '' : `<img class="game-shougou" alt="" style="left:${u(149)}px;top:${u(160)}px;width:${u(270)}px;height:${u(27)}px" src="ui/Shougou_${trophyFile}.png">`}
        <div class="game-player-name" style="left:${u(159)}px;top:${u(135)}px;font-size:${u(20)}px">${escapeHtml(name)}</div>
        ${hideTrophy ? '' : `<div class="game-trophy-text${trophyTextCompressed ? ' game-trophy-text-compressed' : ''}" style="left:${u(284)}px;top:${u(172)}px;font-size:${trophyTextFontSize}px">${escapeHtml(trophyName)}</div>`}
      </section>`;
  const gameProfileMarkup = gameHeadMarkup;

  const appProfileMarkup = `<section class="app-head" data-layout-content><svg viewBox="0 0 1400 190" xmlns="http://www.w3.org/2000/svg" fill="#35404F" font-weight="700">
    ${hidePlate ? '' : plateUrl ? `<image x="14" y="60" width="800" height="130" href="${escapeHtml(plateUrl)}"/>` : '<rect x="14" y="60" width="800" height="130" rx="8" fill="#D9E5EF"/>'}
    ${hideIcon ? '' : iconUrl ? `<image x="19" y="65" width="120" height="120" href="${escapeHtml(iconUrl)}"/>` : `<rect x="19" y="65" width="120" height="120" rx="12" fill="#E8EFF7"/><text x="79" y="143" font-size="44" text-anchor="middle">${escapeHtml(initial)}</text>`}
    <image x="149" y="72" width="186" height="35" href="ui/header/${dxRatingFile}.svg"/>
    ${digits.map((digit, index) => `<text x="${149 + 186 * (333 + 52 * index) / 664}" y="96.9" font-size="20" font-weight="900" text-anchor="middle" fill="#FFF1B0">${digit}</text>`).join('')}
    <image x="149" y="115" width="272" height="42" href="ui/header/Name.svg"/>
    <image x="339" y="120" width="80" height="32" href="ui/header/${daniFile}.svg"/>
    <text class="app-profile-text" data-width="172" data-size="20" data-x="159" data-center-y="136" x="159" y="143.66" font-size="20">${escapeHtml(name)}</text>
    ${hideTrophy ? '' : `<image x="149" y="160" width="270" height="27" href="ui/header/Shougou_${trophyFile}.svg"/><text class="app-profile-text" data-width="246" data-size="14" data-x="284" data-center-y="173.5" x="284" y="178.86" font-size="14" text-anchor="middle">${escapeHtml(trophyName)}</text>`}
  </svg></section>`;

  const imageFooter = isAppStyle ? `<div class="image-footer" aria-label="图片署名">
        <div>Designed by 颍川埃. Data from ${escapeHtml(input.dataSource?.trim() || '')}.</div>
        <div>Generated by rRanker</div>
      </div>` : !useCnFont ? '' : `<div class="image-footer" aria-label="图片署名">
        <div>Designed by Yuri-YuzuChaN &amp; BlueDeer233. Data from ${escapeHtml(input.dataSource?.trim() || '')}.</div>
        <div>Generated by rRanker</div>
      </div>`;

  const gameCss = [
    '.game-head{position:relative;z-index:1;width:100%}',
    '.game-head img,.game-head div{position:absolute}',
    '.game-plate-fallback{border:' + u(2) + 'px solid rgba(255,255,255,.8);background:linear-gradient(100deg,#9EB5D8 0%,#E8EDF6 38%,#F5D9B4 70%,#D99591 100%)}',
    '.game-icon-fallback{display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:' + u(12) + 'px;background:linear-gradient(145deg,#F8FBFF,#C7D5EA);color:#52647F;font-weight:900;font-family:system-ui,sans-serif}',
    '.game-player-name{white-space:nowrap;color:#000;font-weight:700;font-family:system-ui,sans-serif;line-height:1;transform:translateY(-50%)}',
    '.game-trophy-text{white-space:nowrap;color:#000;font-weight:700;font-family:system-ui,sans-serif;line-height:1;transform:translate(-50%,-50%)}',
    '.game-trophy-text-compressed{max-width:' + trophyTextAvailableWidth + 'px;overflow:hidden;text-overflow:ellipsis;font-weight:400}',
    '.game-card{position:absolute;z-index:1}',
    '.game-card img{position:absolute;display:block}',
    '.game-id,.game-title,.game-achievement,.game-dxscore,.game-ds-rating{position:absolute}',
    '.game-id{white-space:nowrap;color:#fff;font-weight:700;font-family:system-ui,sans-serif;line-height:1;text-align:center;transform:translate(-50%,-50%)}',
    '.game-title{position:absolute;white-space:nowrap;overflow:hidden;font-weight:700;font-family:system-ui,sans-serif;line-height:1.06}',
    '.game-achievement{white-space:nowrap;font-weight:700;font-family:system-ui,sans-serif;line-height:1;font-variant-numeric:tabular-nums;transform:translateY(-50%)}',
    '.game-dxscore{white-space:nowrap;overflow:hidden;font-weight:700;font-family:system-ui,sans-serif;line-height:1;font-variant-numeric:tabular-nums;transform:translate(-50%,-50%)}',
    '.game-ds-rating{white-space:nowrap;overflow:hidden;font-weight:700;font-family:system-ui,sans-serif;line-height:1;font-variant-numeric:tabular-nums;transform:translateY(-50%)}',
    '.game-section+.game-section{margin-top:' + u(30) + 'px}',
    '.game-grid{position:relative}',
    '.game-empty{display:flex;min-height:' + u(80) + 'px;align-items:center;justify-content:center;color:#697586;font-weight:700;font-family:system-ui,sans-serif}',
    '[data-rating-style="game"] .scores-content{position:relative;left:auto;right:auto;top:auto;padding:' + u(16) + 'px 0 0}',
    '[data-rating-style="game"] .section-divider{margin:0 0 ' + u(12) + 'px}',
    ...(useCnFont ? [
      '[data-rating-style="game"] .game-id,[data-rating-style="game"] .game-title,[data-rating-style="game"] .game-achievement,[data-rating-style="game"] .game-dxscore,[data-rating-style="game"] .game-ds-rating,[data-rating-style="game"] .game-player-name,[data-rating-style="game"] .game-trophy-text,[data-rating-style="game"] .game-icon-fallback,[data-rating-style="game"] .game-empty,[data-rating-style="game"] .section-divider,[data-rating-style="game"] .section-subtitle,[data-rating-style="game"] .page-marker,[data-rating-style="game"] .image-footer{font-family:MaiCN,"Noto Sans CJK SC",system-ui,sans-serif}',
      '[data-rating-style="game"] .game-title{display:block;white-space:nowrap;overflow:hidden}',
      '[data-rating-style="game"] .image-footer{margin-top:' + u(44) + 'px;text-align:center;color:rgba(60,70,90,.85);font-weight:600;font-size:' + u(13) + 'px;line-height:1.5;font-family:MaiCN,"Noto Sans CJK SC",system-ui,sans-serif}',
      '[data-rating-style="game"] .image-footer>div{white-space:nowrap}',
    ] : []),
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    @font-face{font-family:RatingNumbers;src:url("${escapeCssUrl(input.fontUrl)}") format("truetype");font-display:block}
    ${fontPath ? `@font-face{font-family:MaiCN;src:url("${escapeCssUrl(fontPath)}") format("${isAppStyle ? 'opentype' : 'truetype'}");font-weight:100 900;font-display:block}` : ''}
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#DDE3EC}
    body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
    .preview-stage{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;overflow:hidden;background:#DDE3EC}
    .canvas{position:absolute;left:0;top:0;width:${width}px;min-height:${minimumHeight}px;overflow:hidden;transform-origin:top left;background:#E7EDF5}
    .canvas-background{position:absolute;top:-${backgroundBlur * 2}px;right:-${backgroundBlur * 2}px;bottom:-${backgroundBlur * 2}px;left:-${backgroundBlur * 2}px;inset:-${backgroundBlur * 2}px;background-position:center;background-size:cover;filter:blur(${backgroundBlur}px);transform:scale(1.08)}
    .canvas-background-fallback{top:0;right:0;bottom:0;left:0;inset:0;background:linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%);filter:none;transform:none}
    .canvas-tone{position:absolute;top:0;right:0;bottom:0;left:0;inset:0;background:rgba(238,242,248,.18)}
    ${gameCss.join('\n    ')}
    .page-marker{z-index:2;display:flex;height:${px(width * 0.025)}px;align-items:center;justify-content:center;padding:0 ${px(width * 0.01)}px;border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.72);color:#4B5563;font:700 ${px(width * 0.009)}px/1 system-ui,sans-serif}
    .page-marker-game{position:absolute;right:${px(width * 0.04)}px;top:${px(width * 0.04)}px}
    .app-head{position:relative;z-index:1;width:100%;font-family:MaiCN,sans-serif}
    .app-head svg{display:block;width:100%;height:auto}
    .app-score-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:${u(5)}px ${u(12)}px;padding:0 ${u(16)}px}
    .app-score-section+.app-score-section{margin-top:${u(30)}px}
    .app-score-card{min-width:0;aspect-ratio:21/10}
    .app-card-art{display:block;width:100%;height:auto;font-family:MaiCN,sans-serif}
    [data-rating-style="app"] .scores-content{position:relative;padding-top:${u(16)}px}
    [data-rating-style="app"] .image-footer{margin-top:${u(44)}px;text-align:center;color:rgba(60,70,90,.85);font:700 ${u(13)}px/1.5 MaiCN,sans-serif}
    [data-rating-style="app"] .section-divider,[data-rating-style="app"] .section-subtitle,[data-rating-style="app"] .page-marker{font-family:MaiCN,sans-serif}
    .section-divider{display:flex;align-items:center;gap:${px(width * 0.012)}px;margin:0 0 ${px(width * 0.012)}px;color:rgba(22,29,43,.78);font:800 ${px(width * 0.016)}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:${Math.max(1, px(width * 0.0008))}px;white-space:nowrap}
    .section-divider::before,.section-divider::after{content:"";height:${Math.max(1, px(width * 0.0012))}px;flex:1;background:linear-gradient(90deg,transparent,rgba(28,38,57,.55))}
    .section-divider::after{background:linear-gradient(90deg,rgba(28,38,57,.55),transparent)}
    .section-subtitle{margin:-${px(width * 0.004)}px 0 ${px(width * 0.012)}px;text-align:center;color:rgba(22,29,43,.55);font:600 ${px(width * 0.0105)}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:${Math.max(1, px(width * 0.0006))}px;white-space:nowrap}
    .empty-section{grid-column:1/-1;display:flex;min-height:${px(width * 0.08)}px;align-items:center;justify-content:center;color:#697586;font:700 ${px(width * 0.012)}px/1.4 system-ui,sans-serif}
    .empty-scores{display:flex;min-height:${px(width * 0.15)}px;align-items:center;justify-content:center;border:1px dashed rgba(91,105,126,.45);border-radius:${px(width * 0.012)}px;background:rgba(255,255,255,.64);color:#697586;font:700 ${px(width * 0.013)}px/1.4 system-ui,sans-serif}
  </style>
</head>
<body>
  <div class="preview-stage">
    <main class="canvas" data-image-type="${input.type}" data-rating-style="${ratingStyle}" aria-label="成绩图片预览">
      ${canvasBackground}<div class="canvas-tone"></div>${gamePageMarker}
      ${isAppStyle ? appProfileMarkup : gameProfileMarkup}
      <div class="scores-content" data-layout-content aria-label="成绩列表">${scoreContent}${imageFooter}</div>
    </main>
  </div>
  <script>
    (() => {
      const OUTPUT_WIDTH = ${width};
      const MINIMUM_HEIGHT = ${minimumHeight};
      ${useCnFont ? 'const RATING_STYLE = ' + JSON.stringify(ratingStyle) + ';' : ''}
      const canvas = document.querySelector('.canvas');
      let lastHeight = 0;
      let pending = false;
      let readySent = false;
${bestImageBridgeRuntimeScript()}

${bestImageBridgeMeasureScript({
        layoutCall: '',
      })}
      const fontReady = document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(() => undefined)
        : Promise.resolve();
      ${useCnFont ? `
      /** 定数与 DXScore 共用压缩比例，避免相互重叠或超出卡片。 */
      const fitTitleSizes = () => {
        if (RATING_STYLE !== 'game') return;
        document.querySelectorAll('.game-card').forEach((card) => {
          const ds = card.querySelector('.game-ds-rating');
          const dx = card.querySelector('.game-dxscore');
          if (ds && dx) {
            /** offset 相对卡片，不受画布缩放影响。 */
            const dsLeft = ds.offsetLeft;
            const dxCenter = dx.offsetLeft;
            const cardRight = card.offsetWidth;
            const dsW = ds.scrollWidth;
            const dxW = dx.scrollWidth;
            const gap = 4;
            const scale = Math.max(0.1, Math.min(
              1,
              (dxCenter - dsLeft - gap) / (dsW + dxW / 2),
              (2 * (cardRight - dxCenter)) / dxW,
            ));
            if (scale >= 1) {
              ds.style.maxWidth = Math.max(40, dxCenter - dsLeft - gap) + 'px';
              return;
            }
            ds.style.maxWidth = '';
            const squeeze = 'scaleX(' + scale.toFixed(4) + ')';
            ds.style.transformOrigin = 'left center';
            ds.style.transform = 'translateY(-50%) ' + squeeze;
            ds.style.fontWeight = '400';
            dx.style.transformOrigin = 'center center';
            dx.style.transform = 'translate(-50%,-50%) ' + squeeze;
            dx.style.fontWeight = '400';
            return;
          }
          const title = card.querySelector('.game-title');
          if (title && title.scrollWidth > title.clientWidth) {
            title.style.transformOrigin = 'left center';
            title.style.transform = 'scaleX(' + (title.clientWidth / title.scrollWidth).toFixed(4) + ')';
            title.style.fontWeight = '400';
          }
        });
      };
      fitTitleSizes();
      fontReady.then(fitTitleSizes);
` : ''}
      ${isAppStyle ? `
      const svgNamespace = 'http://www.w3.org/2000/svg';
      const fitAppTitles = () => {
        const context = document.createElement('canvas').getContext('2d');
        if (!context) return;
        const measure = (value, size, weight) => {
          context.font = weight + ' ' + size + 'px MaiCN';
          return context.measureText(value).width;
        };
        document.querySelectorAll('.app-song-title').forEach((node) => {
          const value = node.dataset.title || '';
          let size = 52, weight = 800, lines = [value];
          let naturalWidth = measure(value, size, weight);
          if (naturalWidth > 520) {
            weight = 700;
            size = Math.max(46, Math.min(52, 52 * 520 / (measure(value, 52, weight) * .86)));
            naturalWidth = measure(value, size, weight);
          }
          if (naturalWidth * .86 > 520) {
            size = 44;
            const tokens = typeof Intl.Segmenter === 'function'
              ? Array.from(new Intl.Segmenter('ja', { granularity: 'word' }).segment(value), part => part.segment)
              : value.match(/[A-Za-z0-9]+|[^A-Za-z0-9]/gu) || [];
            let best = Infinity;
            for (let split = 1; split < tokens.length; split += 1) {
              const pair = [tokens.slice(0, split).join('').trim(), tokens.slice(split).join('').trim()];
              if (!pair[0] || !pair[1] || /^[!！?？、。，．)）ー]/u.test(pair[1]) || /[(（]$/u.test(pair[0])) continue;
              const widths = pair.map(line => measure(line, size, weight));
              const cost = Math.max(...widths) + Math.abs(widths[0] - widths[1]) * .2 + (/^[一-龥]$/u.test(tokens[split - 1]) ? 132 : 0);
              if (cost < best) { lines = pair; best = cost; }
            }
          }
          /** 极端长标题保留字形宽度，末尾省略以守住卡片边界。 */
          lines = lines.map(line => {
            if (measure(line, size, weight) * .86 <= 520) return line;
            const chars = Array.from(line);
            while (chars.length && measure(chars.join('') + '…', size, weight) * .86 > 520) chars.pop();
            return chars.join('') + '…';
          });
          const scale = Math.max(.86, Math.min(1, 520 / Math.max(...lines.map(line => measure(line, size, weight)))));
          node.setAttribute('x', '0'); node.setAttribute('y', '0');
          node.setAttribute('font-size', String(size)); node.setAttribute('font-weight', String(weight));
          node.setAttribute('transform', 'translate(732 0) scale(' + scale + ' 1)');
          node.replaceChildren(...lines.map((line, index) => {
            const span = document.createElementNS(svgNamespace, 'tspan');
            span.setAttribute('x', '0');
            span.setAttribute('y', String(lines.length === 1 ? 52 + size * .383 : 55 + index * 52));
            span.textContent = line;
            return span;
          }));
        });
        document.querySelectorAll('.app-profile-text').forEach(node => {
          const size = Number(node.dataset.size), x = Number(node.dataset.x), center = Number(node.dataset.centerY);
          node.removeAttribute('transform'); node.setAttribute('x', '0'); node.setAttribute('y', '0');
          const bounds = node.getBBox();
          const scale = Math.min(1, Number(node.dataset.width) / Math.max(1, bounds.width));
          node.setAttribute('transform', 'translate(' + x + ' ' + (center - bounds.y - bounds.height / 2) + ') scale(' + scale + ' 1)');
          node.setAttribute('font-size', String(size));
        });
      };
      const svgImageReady = Array.from(new Set(Array.from(document.querySelectorAll('svg image')).map(node => node.getAttribute('href')).concat(${JSON.stringify(frameUrl ? [frameUrl] : [])}).filter(Boolean))).map(url => new Promise(resolve => {
        const image = new Image();
        image.onload = image.onerror = resolve;
        image.src = url;
        if (image.complete) resolve();
      }));
      const appLayoutReady = Promise.all([fontReady, ...svgImageReady]).then(fitAppTitles);
      appLayoutReady.then(schedule);
      ` : ''}
      fontReady.then(schedule);
      schedule();

${bestImageBridgeReadyScript({ assetReadyExpression: isAppStyle ? 'Promise.all([appLayoutReady, ...imageReady])' : 'Promise.all([fontReady, ...imageReady])', waitForAssets: isAppStyle })}
    })();
  </script>
</body>
</html>`;
}
