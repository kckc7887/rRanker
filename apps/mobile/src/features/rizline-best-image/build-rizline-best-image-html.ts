import { bestImageBrandFooter } from '@/features/best-image/build-best-image-html';
import { formatRizlineAccuracy, formatRizlineConstant, formatRizlineRks, rizlineRecordStatus, type RizlinePlayer, type RizlineRecord } from '@/domain/rizline';
import { bestImageBridgeMeasureScript, bestImageBridgeReadyScript, bestImageBridgeRuntimeScript } from '@/features/best-image/best-image-bridge-script';
import type { RizlineImagePage } from './rizline-best-image';

const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const image = (url: string | null | undefined, width: number, height: number, extra = '') => url ? `<image href="${escape(url)}" width="${width}" height="${height}" ${extra}/>` : '';
const mask = (id: string, url: string, width: number, height: number) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:alpha">${image(url, width, height)}</mask>`;

export function buildRizlineCardBackground(sources: readonly string[]): string {
  const [base, art] = sources;
  const fade = (id: string, width: number, stops: readonly (readonly [number, number])[]) => `<linearGradient id="${id}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${width}" y2="0">${stops.map(([x, opacity]) => `<stop offset="${x / width}" stop-color="white" stop-opacity="${opacity}"/>`).join('')}</linearGradient><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="238"><rect width="${width}" height="238" fill="url(#${id}-fade)"/></mask>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="562" height="238" viewBox="0 0 562 238"><defs>
    <clipPath id="shape"><path d="M119 0H544Q562 0 562 18V220Q562 238 544 238H119A119 119 0 0 1 119 0Z"/></clipPath>
    ${fade('clear', 238, [[0, 1], [24, 1], [48, 1], [72, 14 / 15], [103, 11 / 15], [138, 7 / 15], [173, 3 / 15], [204, 1 / 15], [238, 0]])}
    ${fade('soft', 238, [[0, 1], [70, 1], [105, 14 / 15], [145, 10 / 15], [190, 5 / 15], [235, 1 / 15], [280, 0]])}
    ${fade('glow', 562, [[0, 1], [80, 1], [120, 1], [170, 13 / 15], [220, 9 / 15], [275, 4 / 15], [330, 1 / 15], [380, 0], [562, 0]])}
    <filter id="blur" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="42"/></filter>
    <filter id="blur-soft" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="12"/></filter>
    </defs><g clip-path="url(#shape)">${image(base, 562, 238)}${art ? `<g mask="url(#glow)">${image(art, 238, 238, 'preserveAspectRatio="xMidYMid slice" filter="url(#blur)"')}<g mask="url(#soft)">${image(art, 238, 238, 'preserveAspectRatio="xMidYMid slice" filter="url(#blur-soft)"')}</g></g><g mask="url(#clear)">${image(art, 238, 238, 'preserveAspectRatio="xMidYMid slice"')}</g>` : ''}</g></svg>`;
}

export function buildRizlineHeader(sources: readonly string[], base: string, backgroundIndex: number, avatarIndex: number): string {
  const [shape, avatarMask, avatarFrame, rks] = sources;
  const baseUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(base)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1168" height="288" viewBox="0 0 1168 288"><defs>
    ${mask('profile', shape!, 1168, 288)}<clipPath id="background"><rect x="9" y="9" width="1150" height="180"/></clipPath>${mask('avatar', avatarMask!, 270, 270)}</defs>
    <g mask="url(#profile)" clip-path="url(#background)">${image(sources[backgroundIndex], 1150, 180, 'x="9" y="9" preserveAspectRatio="xMidYMid slice"')}</g>
    ${image(baseUrl, 1168, 288)}${image(rks, 1168, 288)}
    <g transform="translate(9 9)"><g mask="url(#avatar)">${image(sources[avatarIndex], 260, 260, 'x="5" y="5" preserveAspectRatio="xMidYMid slice"')}</g>${image(avatarFrame, 270, 270)}</g></svg>`;
}

export type RizlineImageHtmlInput = {
  width: number; page: RizlineImagePage; player: RizlinePlayer; signature: string;
  background: string | null; urls: Readonly<Record<string, string>>; dataSource: string;
};
function card(record: RizlineRecord, rank: number, urls: Readonly<Record<string, string>>) {
  const status = rizlineRecordStatus(record);
  const accuracy = formatRizlineAccuracy(record.achievements);
  return `<article class="card ${status}"><img class="card-base" src="${escape(urls[record.chartId])}">
    ${status === 'normal' ? '' : `<img class="mark" src="mark/${status.toUpperCase()}.svg">`}
    <div class="info"><h3>${escape(record.title)}</h3><div class="accuracy">${escape(accuracy.replace('%', ''))}${accuracy.includes('%') ? '<small>%</small>' : ''}</div>
    <div class="detail"><span class="rank">#${rank}</span><span>${escape(formatRizlineConstant(record.chart?.constant))}</span><span class="arrow">→</span><span>${escape(formatRizlineRks(record.rks))}</span></div></div></article>`;
}
export function buildRizlineBestImageHtml(input: RizlineImageHtmlInput): string {
  const { width, page, player, signature, urls } = input;
  const unit = (value: number) => value * width / 2966;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no"><style>
    @font-face{font-family:Han;src:url('fonts/SourceHanSansCN-Bold.otf') format('opentype');font-weight:700;font-display:block}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:Han,sans-serif;font-weight:700;-webkit-text-size-adjust:none;text-size-adjust:none}
    .preview-stage{position:fixed;inset:0;overflow:hidden}#canvas{position:absolute;transform-origin:top left;width:${width}px}#content{position:relative}
    .sheet{width:${width}px;padding:${unit(32)}px ${unit(36)}px ${unit(44)}px;position:relative;isolation:isolate;overflow:hidden;color:white;background:url('background/base.svg') center/100% 100%;}
    .ambient{position:absolute;inset:${unit(-70)}px;z-index:-2;filter:blur(${unit(44)}px);background:center/cover}
    .sheet:before{content:'';position:absolute;inset:0;z-index:-1;background:url('background/tone.svg') center/100% 100%}
    .profile{width:${unit(1160)}px;height:${unit(280)}px;position:relative;margin-bottom:${unit(42)}px}.profile>img{position:absolute;left:${unit(-4)}px;top:${unit(-4)}px;width:${unit(1168)}px;height:${unit(288)}px}
    .name{position:absolute;left:${unit(305)}px;top:${unit(5)}px;width:${unit(780)}px;height:${unit(180)}px;display:flex;align-items:center;margin:0;font:700 ${unit(72)}px/1.2 Han;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bio{position:absolute;left:${unit(305)}px;bottom:${unit(30)}px;width:${unit(440)}px;margin:0;font:700 ${unit(38)}px/1.2 Han;white-space:nowrap;overflow:hidden;color:#fff}
    .total{position:absolute;right:${unit(105)}px;bottom:${unit(20)}px;margin:0;font:700 ${unit(68)}px/1 Han;letter-spacing:${unit(-1)}px}
    .group{margin-top:${unit(30)}px}.group+.group{margin-top:${unit(82)}px}.heading{display:flex;align-items:center;gap:${unit(36)}px;margin:0 0 ${unit(36)}px;font:700 ${unit(47)}px/1.2 Han;letter-spacing:${unit(2.4)}px;white-space:nowrap}
    .heading:before,.heading:after{content:'';height:${unit(3.5)}px;flex:1;background:url('divider.svg') center/100% 100%}.heading:after{transform:rotate(180deg)}
    .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:${unit(18)}px ${unit(21)}px}
    .card{height:${unit(238)}px;position:relative;min-width:0}.card-base,.mark{position:absolute;inset:0;width:100%;height:100%}.info{position:absolute;inset:${unit(12)}px ${unit(20)}px ${unit(12)}px ${unit(214)}px;display:grid;grid-template-rows:${unit(76)}px ${unit(94)}px ${unit(32)}px;row-gap:${unit(6)}px;align-content:center;min-width:0;text-align:right}
    h3{font:700 ${unit(34)}px/1.1 Han;height:${unit(76)}px;margin:0;display:flex;align-items:center;justify-content:flex-end;text-align:right;overflow:hidden;overflow-wrap:anywhere}
    .accuracy{align-self:center;white-space:nowrap;font:700 ${unit(64)}px/1.2 Han;letter-spacing:${unit(-2)}px}.accuracy small{font:700 ${unit(26)}px Han;letter-spacing:0;margin-left:${unit(3)}px}.ap .accuracy{color:#fff1bb}.ah .accuracy{color:#c4f5f4}
    .detail{display:flex;align-items:center;justify-content:flex-end;gap:${unit(8)}px;white-space:nowrap;font:700 ${unit(24)}px Han;color:#ffffffde}.rank{flex:0 0 ${unit(72)}px;margin-right:auto;text-align:right;font:700 ${unit(22)}px/${unit(32)}px Han}.arrow{opacity:.7}
    footer{text-align:center;font:700 ${unit(36)}px/${unit(54)}px Han;color:#dae3ec;margin-top:${unit(100)}px;display:flex;flex-direction:column;gap:${unit(8)}px}footer>div{min-height:${unit(54)}px;overflow-wrap:anywhere}
    </style></head><body><div class="preview-stage"><div id="canvas"><div id="content" data-layout-content><main class="sheet">
    <div class="ambient" ${input.background ? `style="background-image:url('${escape(input.background)}')"` : ''}></div>
    <header class="profile"><img src="${escape(urls.header)}"><h1 class="name">${escape(player.username)}</h1><p class="bio">${escape(signature)}</p><p class="total">${escape(formatRizlineRks(player.totalRks))}</p></header>
    ${page.sections.filter(section => section.records.length).map(section => `<section class="group"><h2 class="heading">${escape(section.title)}</h2><div class="grid">${section.records.map((record, index) => card(record, section.rankOffset + index + 1, urls)).join('')}</div></section>`).join('')}
    <footer><div>Designed by 颍川埃. Data from ${escape(input.dataSource)}.</div>${bestImageBrandFooter(width)}</footer></main></div></div></div>
    <script>const OUTPUT_WIDTH=${width};const MINIMUM_HEIGHT=1;const canvas=document.getElementById('canvas');let pending=false,lastHeight=0,assetsReady=false;
    ${bestImageBridgeRuntimeScript()}
    function fitText(){if(!assetsReady)return;document.querySelectorAll('h3').forEach(el=>{let size=${unit(34)};el.style.fontSize=size+'px';while(el.scrollHeight>el.clientHeight+1&&size>${unit(13)})el.style.fontSize=(size-=${unit(1)})+'px';});
    for(const [selector,start,min] of [['.name',${unit(72)},${unit(20)}],['.bio',${unit(38)},${unit(10)}]]){const el=document.querySelector(selector);let size=start;el.style.fontSize=size+'px';while(el.scrollWidth>el.clientWidth+1&&size>min)el.style.fontSize=(size-=${unit(1)})+'px';}}
    ${bestImageBridgeMeasureScript({ layoutCall: 'fitText();' })}
    ${bestImageBridgeReadyScript()}
    schedule();</script></body></html>`;
}
