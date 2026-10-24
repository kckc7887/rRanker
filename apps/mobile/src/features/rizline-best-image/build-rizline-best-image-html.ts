import { formatRizlineAccuracy, formatRizlineConstant, formatRizlineRks, rizlineRecordStatus, type RizlinePlayer, type RizlineRecord } from '@/domain/rizline';
import { bestImageBridgeMeasureScript, bestImageBridgeReadyScript, bestImageBridgeRuntimeScript } from '@/features/best-image/best-image-bridge-script';
import type { RizlineImagePage } from './rizline-best-image';

const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const image = (url: string | null | undefined, width: number, height: number, extra = '') => url ? `<image href="${escape(url)}" width="${width}" height="${height}" ${extra}/>` : '';
const mask = (id: string, url: string, width: number, height: number) => `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}" style="mask-type:alpha">${image(url, width, height)}</mask>`;

export function buildRizlineCardBackground(sources: readonly string[]): string {
  const [base, shape, clear, soft, glow, art] = sources;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="562" height="238" viewBox="0 0 562 238"><defs>
    ${mask('shape', shape!, 562, 238)}${mask('clear', clear!, 238, 238)}${mask('soft', soft!, 238, 238)}${mask('glow', glow!, 562, 238)}
    <filter id="blur" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="42"/></filter>
    <filter id="blur-soft" x="-100%" y="-100%" width="300%" height="300%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="12"/></filter>
    </defs><g mask="url(#shape)">${image(base, 562, 238)}${art ? `<g mask="url(#glow)">${image(art, 238, 238, 'filter="url(#blur)"')}<g mask="url(#soft)">${image(art, 238, 238, 'filter="url(#blur-soft)"')}</g></g><g mask="url(#clear)">${image(art, 238, 238)}</g>` : ''}</g></svg>`;
}

export function buildRizlineHeader(sources: readonly string[], base: string, layoutIndex: number, avatarIndex: number): string {
  const [shape, avatarMask, avatarFrame, rks] = sources;
  const baseUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(base)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1168" height="288" viewBox="0 0 1168 288"><defs>
    ${mask('profile', shape!, 1168, 288)}${mask('avatar', avatarMask!, 270, 270)}</defs>
    <g mask="url(#profile)">${image(sources[layoutIndex], 1150, 270, 'x="9" y="9" preserveAspectRatio="xMidYMid slice"')}</g>
    ${image(baseUrl, 1168, 288)}${image(rks, 1168, 288)}
    <g transform="translate(9 9)"><g mask="url(#avatar)">${image(sources[avatarIndex], 260, 260, 'x="5" y="5" preserveAspectRatio="xMidYMid slice"')}</g>${image(avatarFrame, 270, 270)}</g></svg>`;
}

export type RizlineImageHtmlInput = {
  width: number; page: RizlineImagePage; player: RizlinePlayer; signature: string; signatureColor: string;
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
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>
    @font-face{font-family:Han;src:url('fonts/SourceHanSansCN-Bold.otf') format('opentype');font-weight:700;font-display:block}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:Han,sans-serif;font-weight:700}
    #canvas{position:absolute;transform-origin:top left;width:${width}px}#content{position:relative}
    .sheet{width:2966px;zoom:${width / 2966};padding:32px 36px 44px;position:relative;isolation:isolate;overflow:hidden;color:white;background:url('background/base.svg') center/100% 100%;}
    .ambient{position:absolute;inset:-70px;z-index:-2;filter:blur(44px);background:center/cover}
    .sheet:before{content:'';position:absolute;inset:0;z-index:-1;background:url('background/tone.svg') center/100% 100%}
    .profile{width:1160px;height:280px;position:relative;margin-bottom:42px}.profile>img{position:absolute;left:-4px;top:-4px;width:1168px;height:288px}
    .name{position:absolute;left:305px;top:5px;width:780px;height:180px;display:flex;align-items:center;margin:0;font:700 72px/1.2 Han;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .bio{position:absolute;left:305px;bottom:30px;width:440px;margin:0;font:700 38px/1.2 Han;white-space:nowrap;overflow:hidden;color:${escape(input.signatureColor)}}
    .total{position:absolute;right:105px;bottom:20px;margin:0;font:700 68px/1 Han;letter-spacing:-1px}
    .group{margin-top:30px}.group+.group{margin-top:82px}.heading{display:flex;align-items:center;gap:36px;margin:0 0 36px;font:700 47px/1.2 Han;letter-spacing:2.4px;white-space:nowrap}
    .heading:before,.heading:after{content:'';height:3.5px;flex:1;background:url('divider.svg') center/100% 100%}.heading:after{transform:rotate(180deg)}
    .grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:18px 21px}
    .card{height:238px;position:relative;min-width:0}.card-base,.mark{position:absolute;inset:0;width:100%;height:100%}.info{position:absolute;inset:12px 20px 12px 214px;display:grid;grid-template-rows:76px 94px 32px;row-gap:6px;align-content:center;min-width:0;text-align:right}
    h3{font:700 34px/1.1 Han;height:76px;margin:0;display:flex;align-items:center;justify-content:flex-end;text-align:right;overflow:hidden;overflow-wrap:anywhere}
    .accuracy{align-self:center;white-space:nowrap;font:700 64px/1.2 Han;letter-spacing:-2px}.accuracy small{font:700 26px Han;letter-spacing:0;margin-left:3px}.ap .accuracy{color:#fff1bb}.ah .accuracy{color:#c4f5f4}
    .detail{display:flex;align-items:center;justify-content:flex-end;gap:8px;white-space:nowrap;font:700 24px Han;color:#ffffffde}.rank{flex:0 0 72px;margin-right:auto;text-align:right;font:700 22px/32px Han}.arrow{opacity:.7}
    footer{text-align:center;font:700 36px/1.5 Han;color:#dae3ec;margin-top:120px}
    </style></head><body><div id="canvas"><div id="content" data-layout-content><main class="sheet">
    <div class="ambient" ${input.background ? `style="background-image:url('${escape(input.background)}')"` : ''}></div>
    <header class="profile"><img src="${escape(urls.header)}"><h1 class="name">${escape(player.username)}</h1><p class="bio">${escape(signature)}</p><p class="total">${escape(formatRizlineRks(player.totalRks))}</p></header>
    ${page.sections.filter(section => section.records.length).map(section => `<section class="group"><h2 class="heading">${escape(section.title)}</h2><div class="grid">${section.records.map((record, index) => card(record, section.rankOffset + index + 1, urls)).join('')}</div></section>`).join('')}
    <footer><div>Designed by 颍川埃. Data from ${escape(input.dataSource)}.</div><div>Generated by rRanker</div></footer></main></div></div>
    <script>const OUTPUT_WIDTH=${width};const MINIMUM_HEIGHT=1;const canvas=document.getElementById('canvas');let pending=false,lastHeight=0,assetsReady=false;
    ${bestImageBridgeRuntimeScript()}
    function fitText(){if(!assetsReady)return;document.querySelectorAll('h3').forEach(el=>{let size=34;el.style.fontSize=size+'px';while(el.scrollHeight>el.clientHeight+1&&size>13)el.style.fontSize=(--size)+'px';});
    for(const [selector,start,min] of [['.name',72,20],['.bio',38,10]]){const el=document.querySelector(selector);let size=start;el.style.fontSize=size+'px';while(el.scrollWidth>el.clientWidth+1&&size>min)el.style.fontSize=(--size)+'px';}}
    ${bestImageBridgeMeasureScript({ layoutCall: 'fitText();' })}
    ${bestImageBridgeReadyScript()}
    schedule();</script></body></html>`;
}
