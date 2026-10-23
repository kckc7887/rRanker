import { preparePhigrosBestImageCards, ratingName, suggestion } from './phigros-best-image';
import { bestImageAssetsReadyScript } from '@/features/best-image/best-image-bridge-script';
/** 模板来源 phi-plugin resources/html/b19/b19.art。 */
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
  dataSource?: string;
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

function averageRibbon(average: PhigrosAccAverage | undefined): string {
  if (!average) return '';
  return `<div class="accAvg acc${average.kind} clip-box"><div class="accAvgLine clip-box"></div><img src="game/svg/average-${average.kind.toLowerCase()}-icon.svg" alt=""><p>Avg: ${average.value.toFixed(4)}%</p></div>`;
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

function sectionDivider(title: string, titleNote?: string): string {
  const note = titleNote
    ? `<small class="section-divider-note">（${escapePhigrosBestImageHtml(titleNote)}）</small>`
    : '';
  return `<div class="section-divider"><span>${escapePhigrosBestImageHtml(title)}${note}</span></div>`;
}

function scoreCards(input: PhigrosBestImageHtmlInput): string {
  return preparePhigrosBestImageCards(input.type, input.page).map(({ section, cards: prepared }) => {
    const cards = prepared.map(({ record, rank, isPhi, inBest, referenceRks, allowPerfect }) => scoreCard(
      input, record, rank, isPhi, inBest, referenceRks, allowPerfect,
    )).join('');
    return `${sectionDivider(section.title, section.titleNote)}${cards}`;
  }).join('');
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
  const sectionCount = input.page.sections.filter((section) => section.records.length > 0).length;
  const scale = input.width / BASE_WIDTH;
  const baseHeight = Math.max(900, 285 + Math.ceil(recordCount / 3) * 125 + 130 + sectionCount * 40);
  const fallbackHeight = Math.ceil(baseHeight * scale);
  const challengeLevel = Math.min(5, Math.max(0, Math.floor(input.challengeModeRank / 100)));
  const challengeUrl = input.templateAssets.challengeIconUrls[challengeLevel] ?? input.templateAssets.challengeIconUrls[0];
  const backgroundUrl = input.backgroundDataUri ?? input.templateAssets.fallbackBackgroundUrl;
  const avatarUrl = input.avatarDataUri ?? input.templateAssets.fallbackAvatarUrl;
  const templateCss = input.templateAssets.css.replace(/<\/style/giu, '<\\/style');
  return `<!doctype html><html lang="zh-cn"><head><meta charset="utf-8"><meta name="viewport" content="width=${input.width}, initial-scale=1, maximum-scale=1, user-scalable=no"><title>phi-plugin</title><style>
${templateCss}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111}body{display:block;position:fixed;inset:0;background:#111}#canvas{isolation:isolate;display:flex;position:absolute;width:${BASE_WIDTH}px;height:fit-content;flex-direction:column;margin:0;background:#111;transform-origin:top left}
.section-divider{display:flex;width:100%;flex-basis:100%;box-sizing:border-box;align-items:center;gap:14px;margin:14px 0 20px;color:rgba(255,255,255,.88);font:800 22px/1.2 Aldrich,PHI,system-ui,sans-serif;letter-spacing:1px;white-space:nowrap}
.section-divider::before,.section-divider::after{content:"";height:1px;flex:1;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55))}
.section-divider::after{background:linear-gradient(90deg,rgba(255,255,255,.55),transparent)}
.section-divider span{flex:0 0 auto}
.section-divider-note{margin-left:6px;font-size:14px;font-weight:600;letter-spacing:0;opacity:.72}
.phi-plugin{flex-direction:column;align-items:center}
.phi-plugin p{font-size:30px;line-height:1.45}
</style></head><body><main id="canvas" class="elem-hydro default-mode"><div class="background"><img src="${escapePhigrosBestImageHtml(backgroundUrl)}" alt="曲绘-模糊"></div>
<div class="title" data-layout-content><div class="playerInfo"><div class="blackBlock clip-box"></div><div class="avatar clip-box"><img src="${escapePhigrosBestImageHtml(avatarUrl)}" alt="avatar"></div><div class="playerId"><p name="pvis">${escapePhigrosBestImageHtml(input.playerName)}</p></div><div class="rks clip-box"><p>${escapePhigrosBestImageHtml(input.rks)}</p></div><div class="clgBox"><div class="Challenge"><img src="${escapePhigrosBestImageHtml(challengeUrl)}" alt="Challenge"><p>${escapePhigrosBestImageHtml(input.challenge)}</p></div></div><div class="date"><p>${escapePhigrosBestImageHtml(input.syncedAt)}</p></div><div class="dataBox clip-box"><img src="${escapePhigrosBestImageHtml(input.templateAssets.dataIconUrl)}" alt="data"><p>${escapePhigrosBestImageHtml(input.dataAmount)}</p></div></div><div class="recordInfo clip-box"><div class="whiteLine clip-box"></div><div class="sheet">${stats(input)}</div></div></div>
<div class="b19" data-layout-content>${scoreCards(input)}</div><div class="createdbox" data-layout-content><div class="phi-plugin"><p>Designed by Phi-Plugin. Data from ${escapePhigrosBestImageHtml(input.dataSource?.trim() || '')}.</p><p>Generated by rRanker</p></div></div></main>
<script>(()=>{
const W=${input.width},S=${scale},FALLBACK=${fallbackHeight},canvas=document.getElementById('canvas'),post=m=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));
let last=FALLBACK,assetsReady=false,pending=false;
function adjustFontSize(){document.getElementsByName('pvis').forEach(node=>{const parent=node.parentElement;if(!parent)return;node.style.fontSize='';let size=parseFloat(getComputedStyle(node).fontSize)||16;if(node.scrollWidth<=parent.offsetWidth&&node.scrollHeight<=parent.offsetHeight)return;let low=0,high=Math.floor(size);while(low<high){const mid=Math.floor((low+high+1)/2);node.style.fontSize=mid+'px';if(node.scrollWidth>parent.offsetWidth||node.scrollHeight>parent.offsetHeight)high=mid-1;else low=mid}node.style.fontSize=low+'px'})}
const measureHeight=()=>{canvas.style.height='auto';const children=[...canvas.children].filter(node=>node.hasAttribute('data-layout-content')),bottom=children.reduce((maximum,node)=>{const style=getComputedStyle(node),marginBottom=parseFloat(style.marginBottom)||0;return Math.max(maximum,node.offsetTop+node.offsetHeight+marginBottom)},0);canvas.style.height=Math.max(1,Math.ceil(bottom))+'px';return Math.max(1,Math.ceil(bottom*S))};
const fit=()=>{last=measureHeight();const vw=innerWidth||document.documentElement.clientWidth||W,vh=innerHeight||document.documentElement.clientHeight||FALLBACK,exportView=Math.abs(vw-W)<2&&Math.abs(vh-last)<3,viewScale=exportView?1:Math.min(vw/W,vh/last),renderScale=S*viewScale;canvas.style.left=exportView?'0px':Math.max(0,(vw-W*viewScale)/2)+'px';canvas.style.top=exportView?'0px':Math.max(0,(vh-last*viewScale)/2)+'px';canvas.style.transform='scale('+renderScale+')';post({type:'best-image-height',width:W,height:last});if(assetsReady)requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!pending)post({type:'best-image-ready',width:W,height:last})}))};
const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;adjustFontSize();fit()})};
post({type:'best-image-runtime',width:W,userAgent:navigator.userAgent||''});
addEventListener('resize',schedule);
${bestImageAssetsReadyScript()}.then(()=>{assetsReady=true;schedule()}).catch(()=>post({type:'best-image-error',width:W,message:'图片资源加载失败，请重试。'}));
fit()})();</script></body></html>`;
}
