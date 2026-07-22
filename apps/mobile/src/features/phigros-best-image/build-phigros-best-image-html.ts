/*
 * DOM 与 CSS 契约直接对齐 phi-plugin resources/html/b19/b19.art。
 * 这里只负责将 rRanker 数据注入原模板并接入 WebView 导出协议。
 */
import { formatPhigrosSongRks } from '@/domain/phigros';
import {
  phigrosAccAverageKey,
  type PhigrosAccAverage,
} from './load-phigros-acc-averages';
import type { PhigrosReferenceTemplateAssets } from './load-phigros-reference-template-assets';
import type { PhigrosBestImagePage, PhigrosBestImageType } from './phigros-best-image';

export type PhigrosBestImageHtmlInput = {
  type: PhigrosBestImageType;
  width: 1080 | 1440 | 2160;
  page: PhigrosBestImagePage;
  playerName: string;
  rks: string;
  dataAmount: string;
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
  accAverages?: Readonly<Record<string, PhigrosAccAverage>>;
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

function ratingName(score: number, fc: unknown): string {
  if (score >= 1_000_000) return 'phi';
  if (fc) return 'FC';
  if (!score) return 'NEW';
  if (score < 700_000) return 'F';
  if (score < 820_000) return 'C';
  if (score < 880_000) return 'B';
  if (score < 920_000) return 'A';
  if (score < 960_000) return 'S';
  return 'V';
}

function suggestion(
  difficulty: number,
  referenceRks: number,
  playerRks: number,
  allowPerfectFallback: boolean,
): { label: string; type: number | null } {
  if (difficulty <= 0 || referenceRks <= 0) return { label: '无法推分', type: null };
  let minimumIncrease = Math.floor(playerRks * 100) / 100 + 0.005 - playerRks;
  if (minimumIncrease < 0) minimumIncrease += 0.01;
  const acc = 45 * Math.sqrt((referenceRks + minimumIncrease * 30) / difficulty) + 55;
  if (!Number.isFinite(acc) || acc >= 100) {
    return allowPerfectFallback ? { label: '100.00%', type: 5 } : { label: '无法推分', type: null };
  }
  const type = acc < 98.5 ? 0 : acc < 99 ? 1 : acc < 99.5 ? 2 : acc < 99.7 ? 3 : acc < 99.85 ? 4 : 5;
  return { label: `${acc.toFixed(2)}%`, type };
}

const UP_SVG = '<svg viewBox="0 0 1024 1024"><path d="M564.8 465.184l4.192 3.904 274.72 274.752a32 32 0 0 1 0 45.248l-22.624 22.624a32 32 0 0 1-45.248 0l-263.456-263.392-263.424 263.392a32 32 0 0 1-42.24 2.656l-3.008-2.656-22.624-22.624a32 32 0 0 1 0-45.248l274.784-274.752a80 80 0 0 1 108.96-3.904z m0-256l4.192 3.904 274.72 274.752a32 32 0 0 1 0 45.248l-22.624 22.624a32 32 0 0 1-45.248 0l-263.456-263.392-263.424 263.392a32 32 0 0 1-42.24 2.656l-3.008-2.656-22.624-22.624a32 32 0 0 1 0-45.248l274.784-274.752a80 80 0 0 1 108.96-3.904z" fill="#333333"></path></svg>';
const FINISHED_SVG = '<svg viewBox="0 0 1024 1024"><path d="M892.064 261.888a31.936 31.936 0 0 0-45.216 1.472L421.664 717.248l-220.448-185.216a32 32 0 1 0-41.152 48.992l243.648 204.704a31.872 31.872 0 0 0 20.576 7.488 31.808 31.808 0 0 0 23.36-10.112L893.536 307.136a32 32 0 0 0-1.472-45.248z"></path></svg>';

function averageRibbon(average: PhigrosAccAverage | undefined): string {
  if (!average) return '';
  return `<div class="accAvg acc${average.kind} clip-box"><div class="accAvgLine clip-box"></div>${average.kind === 'Finished' ? FINISHED_SVG : UP_SVG}<p>Avg: ${average.value.toFixed(4)}%</p></div>`;
}

function scoreCard(
  input: PhigrosBestImageHtmlInput,
  record: PhigrosBestImagePage['sections'][number]['records'][number],
  rank: string,
  isPhi: boolean,
  isBest: boolean,
  referenceRks: number,
  allowPerfectFallback: boolean,
): string {
  const level = LEVELS[record.levelIndex] ?? record.level;
  const score = Math.round(record.dxScore ?? 0);
  const title = input.titles[record.songId] ?? record.title ?? record.songId;
  const illustration = input.illustrations[record.songId];
  const rating = ratingName(score, record.fc);
  const ratingUrl = input.templateAssets.ratingIconUrls[rating] ?? input.templateAssets.ratingIconUrls.F;
  const push = isPhi || record.achievements >= 100 ? { label: '无法推分', type: null } : suggestion(
    record.difficultyConstant,
    referenceRks,
    Number(input.rks),
    allowPerfectFallback,
  );
  const average = isPhi ? undefined : input.accAverages?.[phigrosAccAverageKey(record)];
  return `<div class="song ${isPhi ? 'phi_song' : isBest ? 'b_song' : ''}">
    <div class="ill-box">
      <div class="num clip-box"><p name="pvis">${escapePhigrosBestImageHtml(rank)}</p></div>
      <div class="ill clip-box">${illustration ? `<img src="${escapePhigrosBestImageHtml(illustration)}" alt="ill">` : `<img src="${escapePhigrosBestImageHtml(input.templateAssets.fallbackBackgroundUrl)}" alt="ill">`}</div>
      <div class="rank-${escapePhigrosBestImageHtml(level)} clip-box"><div class="org"><p>${escapePhigrosBestImageHtml(level)}&ensp;${record.difficultyConstant.toFixed(1)}</p></div><div class="rel"><p>${formatPhigrosSongRks(record.rating)}</p></div></div>
    </div>
    <div class="info-${escapePhigrosBestImageHtml(level)}">
      <div class="songname"><p name="pvis">${escapePhigrosBestImageHtml(title)}</p></div>
      <div class="songinfo"><div class="Rating"><img src="${escapePhigrosBestImageHtml(ratingUrl)}" alt="${rating}"></div><div class="chengji"><div class="score"><p>${score}</p></div><div class="line"></div><div class="acc-box"><div class="acc"><p>${record.achievements.toFixed(2)}%</p></div><div class="suggest${push.type === null ? '' : ` suggest-kind-${push.type}`}"><div class="suggest-tip"></div><p>${push.label}</p></div></div></div></div>
    </div>${averageRibbon(average)}
  </div>`;
}

function overflowDivider(): string {
  const lines = '<div class="flow_line"></div>'.repeat(6);
  return `<div class="over_flow"><div class="flow_line_box_l">${lines}</div><p><i>OVER FLOW</i></p><div class="flow_line_box_r">${lines}</div></div>`;
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
  const phiHtml = phiRecords.map((record, index) => scoreCard(input, record, `P${index + 1}`, true, false, cutoffRks, false)).join('');
  const pageOffset = input.type === 'custom' ? input.page.pageIndex * 30 : 0;
  const bestLimit = input.type === 'best30' ? 27 : 30;
  const bestHtml = bestRecords.map((record, index) => `${index === bestLimit ? overflowDivider() : ''}${scoreCard(
    input,
    record,
    `#${pageOffset + index + 1}`,
    false,
    index < bestLimit,
    index < cutoffIndex ? record.rating : cutoffRks,
    !lowestPhiRks || record.rating > lowestPhiRks,
  )}`).join('');
  return `${phiHtml}${bestHtml}`;
}

function stats(input: PhigrosBestImageHtmlInput): string {
  const order = [
    { label: 'EZ', index: 0 }, { label: 'HD', index: 1 },
    { label: 'IN', index: 2 }, { label: 'AT', index: 3 },
  ] as const;
  const rows: [string, readonly (string | number)[]][] = [
    ['\\', order.map(({ label }) => label)],
    ['C', order.map(({ index }) => input.progress.cleared[index] ?? 0)],
    ['FC', order.map(({ index }) => input.progress.fullCombo[index] ?? 0)],
    ['Phi', order.map(({ index }) => input.progress.phi[index] ?? 0)],
  ];
  return rows.map(([label, values]) => `<div class="row"><div class="poz"><p>${label}</p></div>${values.map((value) => `<div class="poz"><p>${escapePhigrosBestImageHtml(value)}</p></div>`).join('')}</div>`).join('');
}

export function buildPhigrosBestImageHtml(input: PhigrosBestImageHtmlInput): string {
  const recordCount = input.page.sections.reduce((sum, section) => sum + section.records.length, 0);
  const scale = input.width / BASE_WIDTH;
  const baseHeight = Math.max(900, 285 + Math.ceil(recordCount / 3) * 125 + 130);
  const fallbackHeight = Math.ceil(baseHeight * scale);
  const challengeLevel = Math.min(5, Math.max(0, Math.floor(input.challengeModeRank / 100)));
  const challengeUrl = input.templateAssets.challengeIconUrls[challengeLevel] ?? input.templateAssets.challengeIconUrls[0];
  const backgroundUrl = input.backgroundDataUri ?? input.templateAssets.fallbackBackgroundUrl;
  const avatarUrl = input.avatarDataUri ?? input.templateAssets.fallbackAvatarUrl;
  const templateCss = input.templateAssets.css.replace(/<\/style/giu, '<\\/style');
  return `<!doctype html><html lang="zh-cn"><head><meta charset="utf-8"><meta name="viewport" content="width=${input.width}, initial-scale=1, maximum-scale=1, user-scalable=no"><title>phi-plugin</title><style>
${templateCss}
html{margin:0;width:${input.width}px;overflow:hidden;background:#111}body{zoom:${scale};overflow:hidden}
</style></head><body id="canvas" class="elem-hydro default-mode"><div class="background"><img src="${escapePhigrosBestImageHtml(backgroundUrl)}" alt="曲绘-模糊"></div>
<div class="title"><div class="playerInfo"><div class="blackBlock clip-box"></div><div class="avatar clip-box"><img src="${escapePhigrosBestImageHtml(avatarUrl)}" alt="avatar"></div><div class="playerId"><p name="pvis">${escapePhigrosBestImageHtml(input.playerName)}</p></div><div class="rks clip-box"><p>${escapePhigrosBestImageHtml(input.rks)}</p></div><div class="clgBox"><div class="Challenge"><img src="${escapePhigrosBestImageHtml(challengeUrl)}" alt="Challenge"><p>${escapePhigrosBestImageHtml(input.challenge)}</p></div></div><div class="date"><p>${escapePhigrosBestImageHtml(input.syncedAt)}</p></div><div class="dataBox clip-box"><img src="${escapePhigrosBestImageHtml(input.templateAssets.dataIconUrl)}" alt="data"><p>${escapePhigrosBestImageHtml(input.dataAmount)}</p></div></div><div class="recordInfo clip-box"><div class="whiteLine clip-box"></div><div class="sheet">${stats(input)}</div></div></div>
<div class="b19">${scoreCards(input)}</div><div class="createdbox"><div class="phi-plugin"><p>rRanker</p></div></div>
<script>(()=>{
const W=${input.width},FALLBACK=${fallbackHeight},canvas=document.getElementById('canvas'),post=m=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));
let last=FALLBACK;
function adjustFontSize(){document.getElementsByName('pvis').forEach(node=>{const parent=node.parentElement;if(!parent)return;node.style.fontSize='';let size=parseFloat(getComputedStyle(node).fontSize)||16;if(node.scrollWidth<=parent.offsetWidth&&node.scrollHeight<=parent.offsetHeight)return;let low=0,high=Math.floor(size);while(low<high){const mid=Math.floor((low+high+1)/2);node.style.fontSize=mid+'px';if(node.scrollWidth>parent.offsetWidth||node.scrollHeight>parent.offsetHeight)high=mid-1;else low=mid}node.style.fontSize=low+'px'})}
const measureHeight=()=>{canvas.style.transform='none';const rect=canvas.getBoundingClientRect(),bottom=[canvas,...canvas.querySelectorAll('*')].reduce((maximum,node)=>Math.max(maximum,node.getBoundingClientRect().bottom-rect.top),rect.height);return Math.max(1,Math.ceil(bottom))};
const fit=()=>{last=measureHeight();const vw=innerWidth||document.documentElement.clientWidth||W,vh=innerHeight||document.documentElement.clientHeight||FALLBACK,exportView=Math.abs(vw-W)<2&&Math.abs(vh-last)<3,viewScale=exportView?1:Math.min(vw/W,vh/last);canvas.style.left=exportView?'0px':Math.max(0,(vw-W*viewScale)/2)+'px';canvas.style.top=exportView?'0px':Math.max(0,(vh-last*viewScale)/2)+'px';canvas.style.transform='scale('+viewScale+')';post({type:'best-image-height',width:W,height:last})};
post({type:'best-image-runtime',width:W,userAgent:navigator.userAgent||''});
addEventListener('resize',()=>{adjustFontSize();fit()});
const images=[...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}));
Promise.race([Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),...images]),new Promise(r=>setTimeout(r,12000))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{adjustFontSize();fit();const m={type:'best-image-ready',width:W,height:last};post(m);setTimeout(()=>post(m),250)})));
fit()})();</script></body></html>`;
}
