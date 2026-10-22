import type { ChunithmPlayer } from '@/domain/chunithm-personal';
import { normalizeChunithmPossession, resolveChunithmRatingTier } from '@/domain/chunithm-rating-theme';
import { formatChunithmRating, formatChunithmScore, type ChunithmScoreCardData } from '@/domain/chunithm-score-presentation';
import { minimumBestImageHeight } from '@/features/best-image/best-image-messages';
import { bestImageBridgeMeasureScript, bestImageBridgeReadyScript, bestImageBridgeRuntimeScript } from '@/features/best-image/best-image-bridge-script';
import type { ChunithmBestImagePage, ChunithmBestImageType } from './chunithm-best-image';

export type ChunithmBestImageHtmlInput = {
  type: ChunithmBestImageType;
  width: number;
  player: ChunithmPlayer | null;
  ratingDisplay: string;
  page: ChunithmBestImagePage;
  cardBackgroundUrls?: Readonly<Record<string, string>>;
  jacketIds?: Readonly<Record<string, string>>;
  characterDataUri?: string | null;
  plateDataUri?: string | null;
  trophyDataUri?: string | null;
  backgroundDataUri?: string | null;
  hideCharacter?: boolean;
  hideTrophy?: boolean;
  dataSource?: string;
};

const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const image = (url: string | null | undefined, x: number, y: number, width: number, height: number, extra = '') => url ? `<image href="${escape(url)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" ${extra}/>` : '';
const gradient = (id: string, colors: readonly string[]) => `<linearGradient id="${id}" x2="1" y2=".6">${colors.map((color, i) => `<stop offset="${i / Math.max(1, colors.length - 1)}" stop-color="${color}"/>`).join('')}</linearGradient>`;
const text = (value: unknown, x: number, y: number, size: number, width: number, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" data-fit-width="${width}" ${extra}>${escape(value)}</text>`;
const ratingColors = {
  green: ['#267B56', '#58AA67'], orange: ['#C77026', '#EBA558'], red: ['#B5374C', '#E66B72'],
  purple: ['#843FA7', '#AF70D0'], bronze: ['#A35934', '#D4945F'], silver: ['#66778D', '#A4B2C5'],
  gold: ['#A57418', '#DBAB42'], platinum: ['#E5CE8C', '#FFFDDD', '#DEC27B'],
  rainbow: ['#CA368A', '#C48A30', '#40986B', '#348FA4', '#7565B6', '#B04E99'],
};
function scoreColors(rank: ChunithmScoreCardData['rank']): string[] {
  if (rank === 'D') return ['#C9CED1', '#E4E7E9'];
  if (rank === 'C') return ['#FF9829', '#FFC45B'];
  if (rank.startsWith('B')) return ['#7DE9EF', '#C0F9FA'];
  if (rank.startsWith('A')) return ['#FFD65A', '#FFF0A1'];
  return rank === 'SSS+' ? ['#9CE6F9', '#BFD2FF', '#E5BEF0', '#F8EFB2', '#B6EFCB'] : ['#9BEAE9', '#C9B6F1', '#F4B8D0', '#F9E88F', '#BFEACB'];
}
function achievement(record: ChunithmScoreCardData): string | null {
  if (record.fullCombo === 'alljusticecritical') return 'AJC';
  if (record.fullCombo === 'alljustice') return 'AJ';
  if (record.clear === 'catastrophy') return 'CATASTROPHY';
  if (record.clear === 'absolute') return 'ABSOLUTE';
  if (record.clear === 'brave') return 'BRAVE';
  if (record.clear === 'hard') return 'HARD';
  if (record.fullCombo === 'fullcombo') return 'FC';
  return record.clear === 'clear' ? 'CLEAR' : null;
}

export function buildChunithmBestImageCardBackground(jacket: string | null, card: string): string {
  const id = 'card';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="756" height="320" viewBox="0 0 756 320">
    <defs>
      <clipPath id="${id}-clip"><rect width="756" height="320" rx="10"/></clipPath>
      ${jacket ? `<image id="${id}-art" href="${escape(jacket)}" width="320" height="320" preserveAspectRatio="xMidYMid slice"/>` : ''}
      <g id="${id}-wide"><use href="#${id}-art"/><use href="#${id}-art" transform="translate(640 0) scale(-1 1)"/></g>
      <filter id="${id}-soft" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="${id}-blur" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="23"/></filter>
      <linearGradient id="${id}-clear"><stop stop-color="white"/><stop offset=".36" stop-color="white"/><stop offset=".76" stop-color="white" stop-opacity=".55"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-fade"><stop stop-color="white"/><stop offset=".5" stop-color="white" stop-opacity=".8"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
      <mask id="${id}-clear-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="320"><rect width="320" height="320" fill="url(#${id}-clear)"/></mask>
      <mask id="${id}-soft-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="390" height="320"><rect width="390" height="320" fill="url(#${id}-fade)"/></mask>
      <mask id="${id}-blur-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="465" height="320"><rect width="465" height="320" fill="url(#${id}-fade)"/></mask>
    </defs>
    <g clip-path="url(#${id}-clip)">
      ${image(card, 0, 0, 756, 320)}
      ${jacket ? `<g mask="url(#${id}-blur-mask)"><use href="#${id}-wide" filter="url(#${id}-blur)" opacity=".7"/></g><g mask="url(#${id}-soft-mask)"><use href="#${id}-wide" filter="url(#${id}-soft)"/></g><use href="#${id}-art" mask="url(#${id}-clear-mask)"/>` : ''}
    </g>
  </svg>`;
}

function renderCard(record: ChunithmScoreCardData, index: number, id: string, input: ChunithmBestImageHtmlInput): string {
  const jacketId = input.jacketIds?.[record.key] ?? record.songId;
  const backgroundUrl = input.cardBackgroundUrls?.[`${jacketId}:${record.levelIndex}`];
  const attained = achievement(record);
  const constant = record.difficultyConstant?.toFixed(1) ?? record.level ?? '—';
  const detail = record.levelIndex === 5 ? escape(record.worldsEndLabel ?? '—') : `${escape(constant)}<tspan dx="13" font-size="27">→</tspan><tspan dx="13">${escape(formatChunithmRating(record.rating))}</tspan>`;
  return `<article class="score-card"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 756 320">
    <defs>
      <clipPath id="${id}-clip"><rect width="756" height="320" rx="10"/></clipPath>
      ${gradient(id + '-score', scoreColors(record.rank))}
    </defs>
    ${image(backgroundUrl, 0, 0, 756, 320)}
    <g clip-path="url(#${id}-clip)">
      <text class="song-title" x="730" y="74" font-size="46" text-anchor="end" fill="white" data-title="${escape(record.title)}">${escape(record.title)}</text>
      ${text(formatChunithmScore(record.score), 732, 192, 96, 440, `class="score" letter-spacing="-2.8" fill="url(#${id}-score)" text-anchor="end"`)}
      <text x="414" y="241" font-size="29" fill="white" text-anchor="end" class="rank">#${index}</text>
      <text x="732" y="241" font-size="32" fill="white" text-anchor="end" data-fit-width="292" class="detail">${detail}</text>
      ${attained ? image('achievement/' + attained + '.svg', 320, 272, 244, 34, 'data-achievement="' + attained + '"') : ''}
      ${image('grade/' + record.rank.replace('+', 'plus') + '.svg', 578, 272, 154, 34, 'data-grade="' + record.rank + '"')}
    </g>
  </svg></article>`;
}

function renderProfile(input: ChunithmBestImageHtmlInput): string {
  const player = input.player;
  const tier = resolveChunithmRatingTier(player?.rating ?? 0).id;
  const possession = normalizeChunithmPossession(player?.rating_possession);
  const trophy = player?.trophy;
  const tone = trophy?.color === 'platinum' ? 'platina' : trophy?.color ?? 'normal';
  const trophyTone = ['normal', 'silver', 'gold', 'platina', 'rainbow', 'ultima'].includes(tone) ? tone : 'normal';
  const base = player?.class_emblem.base ?? 0, medal = player?.class_emblem.medal ?? 0;
  const star = player?.reborn_count ?? 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 240"><g transform="translate(14 8)" fill="#26323C">
    <defs>${gradient('player-rating', ratingColors[tier])}<clipPath id="character-clip"><rect x="470" y="90" width="86" height="86" rx="4"/></clipPath></defs>
    ${input.plateDataUri ? image(input.plateDataUri, 0, 0, 576, 228, 'class="name-plate"') : '<rect x="70" y="2" width="486" height="174" fill="#F5F6F7" stroke="#D5DADF"/>'}
    ${input.hideTrophy ? '' : tone === 'image' && input.trophyDataUri ? image(input.trophyDataUri, 143, 48, 413, 34) : image('trophy/' + trophyTone + '.svg', 143, 48, 413, 34) + text(trophy?.name ?? '', 349.5, 72, 18, 391, `text-anchor="middle" fill="${tone === 'ultima' ? '#FFF' : '#29333A'}"`)}
    ${image('field/' + possession + '.svg', 143, 90, 323, 86)}
    <rect x="470" y="90" width="86" height="86" rx="4" fill="white"/>
    ${input.hideCharacter ? '' : image(input.characterDataUri, 470, 90, 86, 86, 'clip-path="url(#character-clip)"')}
    ${star ? image('star/reborn.svg', 147, 93, 25, 25) + text(star, 159.5, 109, 9, 14, 'text-anchor="middle" fill="#6D5319"') : ''}
    <text x="151" y="130" font-size="17" fill="#59636B">Lv.</text>
    ${text(player?.level ?? '—', 179, 130, 23, 39)}
    ${text(player?.name?.trim() || '未读取玩家资料', 225, 130, 30, 222, 'class="player-name"')}
    ${image('rating/wordmark.svg', 152, 154.3, 51, 10)}
    ${text(input.ratingDisplay, 209, 168, 24, 78, `fill="url(#player-rating)" stroke="${tier === 'platinum' ? '#927329' : '#FFF'}" stroke-width=".65" paint-order="stroke fill" class="player-rating"`)}
    <g transform="translate(365 159) scale(.8)">
      ${base >= 1 && base <= 6 ? image('class/base-' + base + '.svg', -43, -13, 86, 26) : ''}
      ${medal >= 1 && medal <= 6 ? `<g transform="scale(.85)">${image('class/medal-' + medal + '.svg', -35, -25, 70, 50)}</g>` : ''}
    </g>
  </g></svg>`;
}

export function buildChunithmBestImageHtml(input: ChunithmBestImageHtmlInput): string {
  const width = Math.max(1, Math.round(input.width));
  const unit = (n: number) => n * width / 1080;
  const minimumHeight = minimumBestImageHeight(width);
  const sections = input.page.sections.map((section, group) => `<section class="score-section"><div class="section-divider"><span>${escape(section.title)}</span></div>${section.subtitle ? `<div class="section-subtitle">${escape(section.subtitle)}</div>` : ''}<div class="score-grid">${section.records.map((record, i) => renderCard(record, i + 1, 'card-' + group + '-' + i, input)).join('') || '<div class="empty-section">暂无符合条件的成绩</div>'}</div></section>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no"><style>
    @font-face{font-family:ChuniSans;src:url("fonts/SourceHanSansCN-Bold.otf") format("opentype");font-weight:100 900;font-display:block}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#DDE3EC}body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision;font-family:ChuniSans,sans-serif;font-weight:700}
    .preview-stage{position:fixed;inset:0;overflow:hidden}.canvas{position:absolute;left:0;top:0;width:${width}px;min-height:${minimumHeight}px;overflow:hidden;transform-origin:top left;background:#E7EDF5}
    .canvas-background{position:absolute;inset:-${width * .04}px;filter:blur(${width * .02}px);transform:scale(1.08)}.background-image{width:100%;height:100%;object-fit:cover;object-position:center}.canvas-background-fallback{position:absolute;inset:0;background:linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%)}.canvas-tone{position:absolute;inset:0;background:rgba(238,242,248,.18)}
    .profile{position:relative;width:100%}svg{display:block;width:100%;height:auto;font-family:ChuniSans,sans-serif;font-weight:700}.scores-content{position:relative;padding-top:${unit(16)}px;padding-bottom:${unit(20)}px}
    .score-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:${unit(5)}px ${unit(12)}px;padding:0 ${unit(16)}px}.score-card{min-width:0;aspect-ratio:756/320}.score-section+.score-section{margin-top:${unit(30)}px}
    .section-divider{display:flex;align-items:center;gap:${width * .012}px;margin:0 0 ${width * .012}px;color:rgba(22,29,43,.78);font-size:${width * .016}px;line-height:1.2;letter-spacing:${Math.max(1, width * .0008)}px;white-space:nowrap}
    .section-divider::before,.section-divider::after{content:"";height:${Math.max(1, width * .0012)}px;flex:1;background:linear-gradient(90deg,transparent,rgba(28,38,57,.55))}.section-divider::after{background:linear-gradient(90deg,rgba(28,38,57,.55),transparent)}
    .section-subtitle{text-align:center;margin:0 0 ${width * .012}px;color:#59636B;font-size:${width * .0105}px}.empty-section{grid-column:1/-1;text-align:center;padding:${unit(40)}px;color:#697586}.image-footer{margin-top:${unit(44)}px;text-align:center;color:rgba(60,70,90,.85);font-size:${unit(13)}px;line-height:1.5}.image-footer>div{white-space:nowrap}
  </style></head><body><div class="preview-stage"><main class="canvas" data-image-type="${input.type}">
    ${input.backgroundDataUri ? `<div class="canvas-background"><img class="background-image" src="${escape(input.backgroundDataUri)}"></div>` : '<div class="canvas-background-fallback"></div>'}<div class="canvas-tone"></div>
    <div class="profile" data-layout-content>${renderProfile(input)}</div>
    <div class="scores-content" data-layout-content>${sections || '<div class="empty-section">暂无可用于图片的成绩</div>'}<footer class="image-footer"><div>Designed by 颍川埃. Data from ${escape(input.dataSource ?? '')}.</div><div>Generated by rRanker</div>${input.page.pageCount > 1 ? `<div>第 ${input.page.pageIndex + 1} / ${input.page.pageCount} 页</div>` : ''}</footer></div>
  </main></div><script>(()=>{
    const OUTPUT_WIDTH=${width}, MINIMUM_HEIGHT=${minimumHeight};
    const canvas=document.querySelector('.canvas');let lastHeight=0,pending=false,assetsReady=false;
    ${bestImageBridgeRuntimeScript()}
    ${bestImageBridgeMeasureScript({ layoutCall: '' })}
    const fitText=()=>{
      const context=document.createElement('canvas').getContext('2d');
      const measure=(value,size)=>{context.font='700 '+size+'px ChuniSans';return context.measureText(value).width;};
      document.querySelectorAll('.song-title').forEach(node=>{
        const value=node.dataset.title;let lines=[value];
        if(measure(value,38)>446){
          const tokens=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('ja',{granularity:'word'}).segment(value),p=>p.segment):value.match(/[A-Za-z0-9]+|[^A-Za-z0-9]/gu)||[];
          let best=Infinity;
          for(let split=1;split<tokens.length;split++){
            const pair=[tokens.slice(0,split).join('').trim(),tokens.slice(split).join('').trim()];
            if(!pair[0]||!pair[1]||/^[!！?？、。，．)）ー]/u.test(pair[1])||/[(（]$/u.test(pair[0]))continue;
            const lengths=pair.map(v=>measure(v,37));const cost=Math.max(...lengths)+Math.abs(lengths[0]-lengths[1])*.18;
            if(cost<best){best=cost;lines=pair;}
          }
        }
        const size=Math.min(lines.length===1?46:37,446/Math.max(...lines.map(v=>measure(v,1))));
        node.setAttribute('font-size',size);
        node.replaceChildren(...lines.map((line,index)=>{const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x','730');span.setAttribute('y',lines.length===1?'74':String(48+index*44));span.textContent=line;return span;}));
      });
      document.querySelectorAll('[data-fit-width]').forEach(node=>{const limit=Number(node.dataset.fitWidth);if(node.getComputedTextLength()>limit){node.setAttribute('textLength',limit);node.setAttribute('lengthAdjust','spacingAndGlyphs');}});
    };
    const fontReady=document.fonts.load('700 30px ChuniSans').then(()=>document.fonts.ready);
    schedule();
    ${bestImageBridgeReadyScript({ assetReadyExpression: 'Promise.all([fontReady, ...imageReady]).then(fitText)' })}
  })();</script></body></html>`;
}
