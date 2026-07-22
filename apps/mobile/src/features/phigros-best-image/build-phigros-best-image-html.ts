/*
 * DOM and CSS contract copied from phi-plugin resources/html/b19 under
 * Apache-2.0, then wired to rRanker's data and WebView export protocol.
 * See THIRD_PARTY_NOTICES.md.
 */
import { formatPhigrosSongRks } from '@/domain/phigros';
import type { PhigrosReferenceTemplateAssets } from './load-phigros-reference-template-assets';
import type { PhigrosBestImagePage, PhigrosBestImageType } from './phigros-best-image';

export type PhigrosBestImageHtmlInput = {
  type: PhigrosBestImageType;
  width: 1080 | 1440 | 2160;
  page: PhigrosBestImagePage;
  playerName: string;
  rks: string;
  challenge: string;
  challengeModeRank: number;
  syncedAt: string;
  progress: {
    cleared: readonly number[];
    fullCombo: readonly number[];
    phi: readonly number[];
  };
  titles: Readonly<Record<string, string>>;
  illustrations: Readonly<Record<string, string | null>>;
  avatarDataUri?: string | null;
  backgroundDataUri?: string | null;
  templateAssets: PhigrosReferenceTemplateAssets;
};

const BASE_WIDTH = 1200;
const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;

export function escapePhigrosBestImageHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]!));
}

function escapeCssUrl(value: string): string {
  return value.replace(/['\\\r\n]/gu, (character) => `\\${character}`);
}

function ratingName(score: number, fc: unknown): string {
  if (score >= 1_000_000) return 'phi';
  if (fc) return 'FC';
  if (!score || score < 700_000) return 'F';
  if (score < 820_000) return 'C';
  if (score < 880_000) return 'B';
  if (score < 920_000) return 'A';
  if (score < 960_000) return 'S';
  return 'V';
}

function suggestion(difficulty: number, cutoffRks: number): { label: string; type: number } {
  if (difficulty <= 0 || cutoffRks <= 0) return { label: '无法推分', type: 5 };
  const acc = 45 * Math.sqrt(cutoffRks / difficulty) + 55;
  if (!Number.isFinite(acc) || acc >= 100) return { label: '无法推分', type: 5 };
  const type = acc < 98.5 ? 0 : acc < 99 ? 1 : acc < 99.5 ? 2 : acc < 99.7 ? 3 : acc < 99.85 ? 4 : 5;
  return { label: `${acc.toFixed(2)}%`, type };
}

function scoreCard(
  input: PhigrosBestImageHtmlInput,
  record: PhigrosBestImagePage['sections'][number]['records'][number],
  rank: string,
  isPhi: boolean,
  cutoffRks: number,
): string {
  const level = LEVELS[record.levelIndex] ?? record.level;
  const score = Math.round(record.dxScore ?? 0);
  const title = input.titles[record.songId] ?? record.title ?? record.songId;
  const illustration = input.illustrations[record.songId];
  const rating = ratingName(score, record.fc);
  const ratingUrl = input.templateAssets.ratingIconUrls[rating] ?? input.templateAssets.ratingIconUrls.F;
  const push = isPhi ? { label: '无法推分', type: 5 } : suggestion(record.difficultyConstant, cutoffRks);
  return `<div class="song ${isPhi ? 'phi_song' : 'b_song'}">
    <div class="ill-box">
      <div class="num clip-box"><p name="pvis">${escapePhigrosBestImageHtml(rank)}</p></div>
      <div class="ill clip-box">${illustration ? `<img src="${escapePhigrosBestImageHtml(illustration)}" alt="ill">` : '<div class="reference-cover-fallback"></div>'}</div>
      <div class="rank-${escapePhigrosBestImageHtml(level)} clip-box"><div class="org"><p>${escapePhigrosBestImageHtml(level)}&ensp;${record.difficultyConstant.toFixed(1)}</p></div><div class="rel"><p>${formatPhigrosSongRks(record.rating)}</p></div></div>
    </div>
    <div class="info-${escapePhigrosBestImageHtml(level)}">
      <div class="songname"><p name="pvis">${escapePhigrosBestImageHtml(title)}</p></div>
      <div class="songinfo"><div class="Rating"><img src="${escapePhigrosBestImageHtml(ratingUrl)}" alt="${rating}"></div><div class="chengji"><div class="score"><p>${score}</p></div><div class="line"></div><div class="acc-box"><div class="acc"><p>${record.achievements.toFixed(2)}%</p></div><div class="suggest suggest-kind-${push.type}"><div class="suggest-tip"></div><p>${push.label}</p></div></div></div></div>
    </div>
  </div>`;
}

function scoreCards(input: PhigrosBestImageHtmlInput): string {
  const allRecords = input.page.sections.flatMap((section) => section.records);
  const nonPhiRecords = input.type === 'best30'
    ? input.page.sections.filter((section) => !section.id.toLowerCase().includes('phi')).flatMap((section) => section.records)
    : allRecords;
  const cutoffRks = nonPhiRecords[Math.min(26, nonPhiRecords.length - 1)]?.rating ?? nonPhiRecords.at(-1)?.rating ?? 0;
  let customOffset = input.page.pageIndex * 30;
  return input.page.sections.map((section) => {
    const isPhiSection = input.type === 'best30' && section.id.toLowerCase().includes('phi');
    const cards = section.records.map((record, index) => scoreCard(
      input,
      record,
      isPhiSection ? `P${index + 1}` : `#${input.type === 'best30' ? index + 1 : customOffset + index + 1}`,
      isPhiSection,
      cutoffRks,
    )).join('');
    customOffset += section.records.length;
    return cards;
  }).join('');
}

function stats(input: PhigrosBestImageHtmlInput): string {
  const order = [
    { label: 'AT', index: 3 }, { label: 'IN', index: 2 },
    { label: 'HD', index: 1 }, { label: 'EZ', index: 0 },
  ] as const;
  const rows: [string, readonly (string | number)[]][] = [
    ['\\', order.map(({ label }) => label)],
    ['C', order.map(({ index }) => input.progress.cleared[index] ?? 0)],
    ['FC', order.map(({ index }) => input.progress.fullCombo[index] ?? 0)],
    ['Phi', order.map(({ index }) => input.progress.phi[index] ?? 0)],
  ];
  return rows.map(([label, values]) => `<div class="row"><div class="poz"><p>${label}</p></div>${LEVELS.map((_, index) => `<div class="poz"><p>${escapePhigrosBestImageHtml(values[index] ?? 0)}</p></div>`).join('')}</div>`).join('');
}

export function buildPhigrosBestImageHtml(input: PhigrosBestImageHtmlInput): string {
  const recordCount = input.page.sections.reduce((sum, section) => sum + section.records.length, 0);
  const scale = input.width / BASE_WIDTH;
  const baseHeight = Math.max(900, 285 + Math.ceil(recordCount / 3) * 108 + 130);
  const minimumHeight = Math.ceil(baseHeight * scale);
  const challengeLevel = Math.min(5, Math.max(0, Math.floor(input.challengeModeRank / 100)));
  const challengeUrl = input.templateAssets.challengeIconUrls[challengeLevel] ?? input.templateAssets.challengeIconUrls[0];
  const backgroundUrl = input.backgroundDataUri ?? input.templateAssets.fallbackBackgroundUrl;
  const avatar = input.avatarDataUri
    ? `<img src="${escapePhigrosBestImageHtml(input.avatarDataUri)}" alt="avatar">`
    : '';
  const templateCss = input.templateAssets.css.replace(/<\/style/giu, '<\\/style');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
${templateCss}
html{margin:0;width:${input.width}px;min-height:${minimumHeight}px;overflow:hidden;background:#111}body{min-height:${baseHeight}px;zoom:${scale};overflow:hidden}.reference-cover-fallback{width:100%;height:94.92px;background:url('${escapeCssUrl(input.templateAssets.fallbackBackgroundUrl)}') center/cover}.reference-page{position:absolute;right:34px;bottom:20px;color:#fff;font-family:"Aldrich","PHI"}
</style></head><body id="canvas"><div class="background"><img src="${escapePhigrosBestImageHtml(backgroundUrl)}" alt="background"></div>
<div class="title"><div class="playerInfo"><div class="blackBlock clip-box"></div><div class="avatar clip-box">${avatar}</div><div class="playerId"><p name="pvis">${escapePhigrosBestImageHtml(input.playerName)}</p></div><div class="rks clip-box"><p>${escapePhigrosBestImageHtml(input.rks)}</p></div><div class="clgBox"><div class="Challenge"><img src="${escapePhigrosBestImageHtml(challengeUrl)}" alt="Challenge"><p>${escapePhigrosBestImageHtml(input.challenge)}</p></div></div><div class="date"><p>${escapePhigrosBestImageHtml(input.syncedAt)}</p></div><div class="dataBox clip-box"><img src="${escapePhigrosBestImageHtml(input.templateAssets.dataIconUrl)}" alt="data"><p>Phigros</p></div></div><div class="recordInfo clip-box"><div class="whiteLine clip-box"></div><div class="sheet">${stats(input)}</div></div></div>
<div class="b19">${scoreCards(input)}</div><div class="createdbox"><div class="phi-plugin"><p>rRanker</p></div><div class="ver"><p>Phigros ${input.type === 'best30' ? 'Best30' : 'Custom'}</p></div></div><p class="reference-page">${input.page.pageIndex + 1} / ${input.page.pageCount}</p>
<script>(()=>{const W=${input.width},MIN=${minimumHeight},canvas=document.getElementById('canvas'),post=m=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));let last=MIN;post({type:'best-image-runtime',width:W,userAgent:navigator.userAgent||''});const fit=()=>{canvas.style.transform='none';last=Math.max(MIN,Math.ceil(canvas.getBoundingClientRect().height));const vw=innerWidth||W,vh=innerHeight||MIN,exportView=Math.abs(vw-W)<2&&vh+2>=Math.min(last,MIN),viewScale=exportView?1:Math.min(vw/W,vh/last);canvas.style.left=exportView?'0px':Math.max(0,(vw-W*viewScale)/2)+'px';canvas.style.top=exportView?'0px':Math.max(0,(vh-last*viewScale)/2)+'px';canvas.style.transform='scale('+viewScale+')';post({type:'best-image-height',width:W,height:last})};addEventListener('resize',fit);const images=[...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}));Promise.race([Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),...images]),new Promise(r=>setTimeout(r,12000))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{fit();const m={type:'best-image-ready',width:W,height:last};post(m);setTimeout(()=>post(m),250)})));fit()})();</script></body></html>`;
}
