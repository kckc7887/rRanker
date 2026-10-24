import { bestImageBrandFooter } from '@/features/best-image/build-best-image-html';
import { bestImageBridgeRuntimeScript, bestImageBridgeMeasureScript, bestImageBridgeReadyScript } from '@/features/best-image/best-image-bridge-script';
import { preparePhigrosBestImageCards, ratingName, suggestion } from './phigros-best-image';
import { escapePhigrosBestImageHtml as escape, type PhigrosBestImageHtmlInput } from './build-phigros-best-image-html';

export type PhigrosAppImageInput = Omit<PhigrosBestImageHtmlInput, 'templateAssets' | 'syncedAt' | 'progress' | 'accAverages'> & {
  cardBackgroundUrls: Readonly<Record<string, string>>;
  fontCss: string;
  fontFamilies: string;
  hideAvatar: boolean;
};

const COLORS = ['#409872', '#2184b4', '#c33854', '#353b45'] as const;
const image = (url: string, x: number, y: number, width: number, height: number, attributes = '') => `<image href="${escape(url)}" x="${x}" y="${y}" width="${width}" height="${height}" ${attributes}/>`;

export function buildPhigrosAppCardBackground(jacket: string | null, card: string, mask: string, level: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="756" height="320" viewBox="0 0 756 320"><defs><mask id="card" maskUnits="userSpaceOnUse" x="0" y="0" width="756" height="320">${image(mask, 0, 0, 756, 320)}</mask></defs><g mask="url(#card)">${jacket ? image(jacket, 0, 0, 550, 320, 'preserveAspectRatio="xMidYMid slice"') : `<rect width="756" height="320" fill="${COLORS[level]}"/>`}${image(card, 0, 0, 756, 320)}</g></svg>`;
}


function profile(input: PhigrosAppImageInput): string {
  const tier = Math.min(5, Math.max(0, Math.floor(input.challengeModeRank / 100)));
  return `<svg viewBox="0 0 552 96" fill="white"><defs><mask id="avatar-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="116" height="96">${image('app/header/avatar-outline.svg', 0, 0, 116, 96)}</mask></defs>
    ${image('app/header/outline.svg', 0, 0, 552, 96)}
    ${!input.hideAvatar && input.avatarDataUri ? image(input.avatarDataUri, 0, 0, 116, 96, 'preserveAspectRatio="xMidYMid slice" mask="url(#avatar-mask)"') : ''}
    <text x="132" y="41" font-size="27" data-fit-width="242">${escape(input.playerName)}</text>
    <text x="510" y="41" font-size="29" text-anchor="end" data-fit-width="128">${escape(input.rks)}</text>
    ${image('app/data.png', 132, 64, 12, 12)}<text x="152" y="76" font-size="13" fill="#e0e7ee" data-fit-width="242">${escape(input.dataAmount)}</text>
    ${image(`app/challenge/outline/${tier}.svg`, 423, 57, 87, 29)}<text x="466.5" y="79" font-size="22" text-anchor="middle" fill="#fff6b2" data-fit-width="65">${escape(input.challenge)}</text>
  </svg>`;
}

function scoreCard(input: PhigrosAppImageInput, card: ReturnType<typeof preparePhigrosBestImageCards>[number]['cards'][number]): string {
  const { record, rank, isPhi, referenceRks, allowPerfect } = card;
  const score = Math.round(record.dxScore ?? 0);
  const grade = ratingName(score, record.fc);
  const title = input.titles[record.songId] ?? record.title ?? record.songId;
  const push = isPhi || record.achievements >= 100 ? '无法推分' : suggestion(record.difficultyConstant, referenceRks, Number(input.rks), allowPerfect).label;
  const ink = grade === 'phi' ? '#fff0ad' : grade === 'FC' ? '#b0edff' : '#fff';
  return `<article class="score-card"><svg viewBox="0 0 756 320" fill="white">
    ${image(input.cardBackgroundUrls[`${record.songId}:${record.levelIndex}`]!, 0, 0, 756, 320)}
    <text class="song-title" data-title="${escape(title)}" x="734" y="57" text-anchor="end" font-size="34">${escape(title)}</text>
    <text x="733" y="167" text-anchor="end" font-size="86" letter-spacing="-3" fill="${ink}" data-fit-width="445">${score.toLocaleString('en-US')}</text>
    <text x="387" y="214" text-anchor="end" font-size="25">${escape(rank)}</text>
    <text x="731" y="214" text-anchor="end" font-size="28">${record.difficultyConstant.toFixed(1)} → ${record.rating.toFixed(3)}</text>
    ${grade === 'NEW' ? image('app/NEW.svg', 346, 257, 117, 40) : image(`app/${grade}.svg`, 410, 250, 53, 53)}
    <text x="475" y="288" font-size="35">${record.achievements.toFixed(2)}<tspan font-size="23">%</tspan></text>
    <text x="731" y="288" text-anchor="end" font-size="22" opacity=".78">${escape(push)}</text>
  </svg></article>`;
}

export function buildPhigrosBestImageAppHtml(input: PhigrosAppImageInput): string {
  const width = input.width, unit = (n: number) => n * width / 1200;
  const sections = preparePhigrosBestImageCards(input.type, input.page).map(({ section, cards }) => `<section class="score-section"><div class="section-divider"><span>${escape(section.title)}${section.titleNote ? `<small>（${escape(section.titleNote)}）</small>` : ''}</span></div><div class="score-grid">${cards.map(card => scoreCard(input, card)).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no"><style>
    @font-face{font-family:PhigrosSans;src:url("app/SourceHanSansCN-Bold.otf") format("opentype");font-weight:700;font-display:block}
    ${input.fontCss}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#e3e7ef}body{font-family:PhigrosSans,${input.fontFamilies};font-weight:700;-webkit-font-smoothing:antialiased}
    .canvas{position:absolute;width:${width}px;min-height:${Math.ceil(width * .75)}px;overflow:hidden;transform-origin:top left;background:#dce4ed}
    .canvas-background{position:absolute;inset:-${unit(60)}px;filter:blur(${unit(30)}px)}.canvas-background img{width:100%;height:100%;object-fit:cover}.canvas-tone{position:absolute;inset:0;background:linear-gradient(#e8edf46b,#e4ebf377)}
    .profile{position:relative;padding:${unit(28)}px ${unit(18)}px ${unit(22)}px}.profile svg{width:${unit(552)}px}svg{display:block;width:100%;height:auto;font-family:inherit;font-weight:700}
    .scores-content{position:relative;padding:0 ${unit(18)}px ${unit(40)}px}.score-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:${unit(9)}px ${unit(14)}px}.score-card{min-width:0;aspect-ratio:756/320}.score-section{margin-bottom:${unit(26)}px}
    .section-divider{display:flex;align-items:center;gap:${unit(15)}px;margin:${unit(4)}px 0 ${unit(17)}px;color:#25364a;font-size:${unit(22)}px;letter-spacing:${unit(1)}px}.section-divider:before,.section-divider:after{content:'';height:${unit(1)}px;flex:1;background:url('app/header/divider.svg') center/100% 100%}.section-divider:after{transform:rotate(180deg)}.section-divider small{font-size:.65em;letter-spacing:0}
    .empty{text-align:center;padding:${unit(40)}px;color:#33465a}.image-footer{text-align:center;font-size:${unit(13)}px;line-height:1.6;color:#33465a;margin-top:${unit(32)}px}
    .canvas{display:flex;flex-direction:column}.profile{flex-shrink:0}
    .scores-content{flex:1;display:flex;flex-direction:column}.scores-content>section{flex-shrink:0}
    .image-footer{margin-top:auto;padding-top:${unit(32)}px;flex-shrink:0}
  </style></head><body><main class="canvas">
    ${input.backgroundDataUri ? `<div class="canvas-background"><img src="${escape(input.backgroundDataUri)}"></div>` : ''}<div class="canvas-tone"></div>
    <header class="profile" data-layout-content>${profile(input)}</header>
    <div class="scores-content" data-layout-content>${sections || '<div class="empty">暂无可用于图片的成绩</div>'}<footer class="image-footer"><div>Designed by 颍川埃. Data from ${escape(input.dataSource ?? '')}.</div>${bestImageBrandFooter(width)}${input.page.pageCount > 1 ? `<div>第 ${input.page.pageIndex + 1} / ${input.page.pageCount} 页</div>` : ''}</footer></div>
  </main><script>(()=>{
    const OUTPUT_WIDTH=${width},MINIMUM_HEIGHT=${Math.ceil(width * .75)},canvas=document.querySelector('.canvas');let lastHeight=0,pending=false,assetsReady=false;
    ${bestImageBridgeRuntimeScript()}
    ${bestImageBridgeMeasureScript({ layoutCall: '' })}
    const fitText=()=>{
      const context=document.createElement('canvas').getContext('2d');
      document.querySelectorAll('.song-title').forEach(node=>{
        const family=getComputedStyle(node).fontFamily;
        const measure=(text,size)=>{context.font='700 '+size+'px '+family;return context.measureText(text).width;};
        const value=node.dataset.title;let lines=[value];
        if(measure(value,34)>448){
          const tokens=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter('zh',{granularity:'word'}).segment(value),part=>part.segment):value.match(/[A-Za-z0-9]+|[^A-Za-z0-9]/gu)||[];let best=Infinity;
          for(let i=1;i<tokens.length;i++){
            const pair=[tokens.slice(0,i).join('').trim(),tokens.slice(i).join('').trim()];
            if(!pair[0]||!pair[1]||/^[!！?？、。，．)）ー]/u.test(pair[1])||/[(（]$/u.test(pair[0]))continue;
            const lengths=pair.map(text=>measure(text,29));const cost=Math.max(...lengths)+Math.abs(lengths[0]-lengths[1])*.18;
            if(cost<best){best=cost;lines=pair;}
          }
        }
        node.setAttribute('font-size',Math.min(lines.length===1?34:29,448/Math.max(...lines.map(text=>measure(text,1)))));
        node.replaceChildren(...lines.map((line,i)=>{const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x','734');span.setAttribute('y',lines.length===1?'57':String(34+i*35));span.textContent=line;return span;}));
      });
      document.querySelectorAll('[data-fit-width]').forEach(node=>{const limit=Number(node.dataset.fitWidth),length=node.getComputedTextLength();if(length>limit)node.setAttribute('font-size',Number(node.getAttribute('font-size'))*limit/length);});
    };
    const fontReady=document.fonts.load('700 30px PhigrosSans').then(()=>document.fonts.ready);
    schedule();
    ${bestImageBridgeReadyScript({ assetReadyExpression: 'Promise.all([fontReady,...imageReady]).then(fitText)' })}
  })();</script></body></html>`;
}
