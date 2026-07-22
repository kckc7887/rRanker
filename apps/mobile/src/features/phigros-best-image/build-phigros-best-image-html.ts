/*
 * This renderer adapts the visual structure of phi-plugin's resources/html/b19
 * templates. Those resource templates are licensed under Apache-2.0. This file
 * has been modified for rRanker's data model, embedded assets and WebView export
 * protocol. See THIRD_PARTY_NOTICES.md for attribution and license information.
 */
import { formatPhigrosSongRks } from '@/domain/phigros';
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
};

const BASE_WIDTH = 1200;
const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;
const LEVEL_COLORS = ['#92d050', '#00b0f0', '#ff0000', '#6e6e6e'] as const;

export function escapePhigrosBestImageHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]!));
}

function rateLabel(value: string): string {
  return value === 'phi' ? 'φ' : value.toUpperCase();
}

function challengeTone(challengeModeRank: number): string {
  const level = Math.min(5, Math.max(0, Math.floor(challengeModeRank / 100)));
  return [
    '#e8edf2', '#70a97a', '#5c9ce6', '#d56b72', '#e7cf54',
    'linear-gradient(90deg,#ee7c8c,#e8b866,#d9d86d,#78c79a,#67b9dd,#8a91db,#c27bd4)',
  ][level]!;
}

function scoreCards(input: PhigrosBestImageHtmlInput): string {
  let pageOffset = input.page.pageIndex * 30;
  return input.page.sections.map((section) => {
    const isPhiSection = input.type === 'best30' && section.id.toLowerCase().includes('phi');
    const cards = section.records.map((record, sectionIndex) => {
      const rank = isPhiSection ? `P${sectionIndex + 1}` : `#${input.type === 'best30' ? sectionIndex + 1 : pageOffset + sectionIndex + 1}`;
      const title = input.titles[record.songId] ?? record.title ?? record.songId;
      const illustration = input.illustrations[record.songId];
      const level = LEVELS[record.levelIndex] ?? record.level;
      const levelColor = LEVEL_COLORS[record.levelIndex] ?? '#8b8b8b';
      const score = Math.round(record.dxScore ?? 0).toLocaleString('en-US');
      const songRks = formatPhigrosSongRks(record.rating);
      return `<article class="song ${isPhiSection ? 'phi_song' : 'b_song'}">
        <div class="ill-box">
          <div class="num clip-box"><p>${rank}</p></div>
          <div class="ill clip-box">${illustration ? `<img src="${escapePhigrosBestImageHtml(illustration)}" alt="">` : '<div class="cover-fallback"></div>'}</div>
          <div class="rank-block clip-box" style="--rank-color:${levelColor}"><div class="org"><p>${escapePhigrosBestImageHtml(level)}&ensp;${record.difficultyConstant.toFixed(1)}</p></div><div class="rel"><p>${songRks}</p></div></div>
        </div>
        <div class="song-info" style="--rank-color:${levelColor}">
          <div class="songname"><p>${escapePhigrosBestImageHtml(title)}</p></div>
          <div class="songinfo">
            <div class="rating rating-${escapePhigrosBestImageHtml(record.rate)}">${rateLabel(record.rate)}</div>
            <div class="achievement"><div class="score"><p>${score}</p></div><div class="line"></div><div class="acc"><p>${record.achievements.toFixed(2)}%</p></div></div>
            ${record.fc ? '<div class="fc-mark">FC</div>' : ''}
          </div>
          <div class="suggest clip-box"><p>RKS ${songRks}</p></div>
        </div>
      </article>`;
    }).join('');
    pageOffset += section.records.length;
    return cards;
  }).join('');
}

function stats(input: PhigrosBestImageHtmlInput): string {
  return LEVELS.map((level, index) => `<div class="row"><div class="poz"><p style="color:${LEVEL_COLORS[index]}">${level}</p></div><div class="poz"><p>${input.progress.cleared[index] ?? 0}</p></div><div class="poz"><p>${input.progress.fullCombo[index] ?? 0}</p></div><div class="poz"><p>${input.progress.phi[index] ?? 0}</p></div></div>`).join('');
}

export function buildPhigrosBestImageHtml(input: PhigrosBestImageHtmlInput): string {
  const recordCount = input.page.sections.reduce((sum, section) => sum + section.records.length, 0);
  const scale = input.width / BASE_WIDTH;
  const baseHeight = Math.max(900, 230 + Math.ceil(recordCount / 3) * 122 + 120);
  const minimumHeight = Math.ceil(baseHeight * scale);
  const background = input.backgroundDataUri
    ? `<img src="${escapePhigrosBestImageHtml(input.backgroundDataUri)}" alt="">`
    : '<div class="background-fallback"></div>';
  const avatar = input.avatarDataUri
    ? `<img src="${escapePhigrosBestImageHtml(input.avatarDataUri)}" alt="">`
    : `<span>${escapePhigrosBestImageHtml(input.playerName.trim().slice(0, 1) || 'P')}</span>`;
  const subtitle = input.type === 'best30' ? 'Best30' : 'Custom';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111;font-family:"Aldrich","Noto Sans SC","Segoe UI",sans-serif}p{margin:0;color:#fff}.canvas{position:absolute;width:${input.width}px;min-height:${minimumHeight}px;overflow:hidden;background:#111}.sheet-root{position:relative;width:${BASE_WIDTH}px;min-height:${baseHeight}px;zoom:${scale};overflow:hidden}.background{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;overflow:hidden}.background img{width:100%;height:100%;object-fit:cover;transform:scale(1.14);filter:blur(20px) brightness(50%)}.background-fallback{position:absolute;inset:-40px;background:linear-gradient(135deg,#121B2B 0%,#19384A 48%,#332A50 100%);filter:blur(18px) brightness(65%)}.clip-box{clip-path:polygon(22px 0,100% 0,calc(100% - 22px) 100%,0 100%);overflow:hidden}.title{position:relative;z-index:2;width:100%;height:112px;margin:32px 0;display:flex;align-items:center}.playerInfo{position:absolute;left:7%;width:50%;height:80px;display:flex;align-items:center}.blackBlock{position:absolute;right:0;width:98%;height:73px;background:rgba(0,0,0,.5);backdrop-filter:blur(5px)}.avatar{position:relative;z-index:2;width:104px;height:80px;display:grid;place-items:center;background:linear-gradient(135deg,#4ac6ce,#5369dc)}.avatar img{width:100%;height:100%;object-fit:cover}.avatar span{font-size:46px;font-weight:900;color:#fff}.playerId{position:absolute;right:6%;width:51%;height:80%;display:flex;align-items:center;justify-content:center}.playerId p{max-width:100%;font-size:32px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rks{position:absolute;left:139px;bottom:10px;z-index:3;height:24px;padding:0 12px;background:#fff;display:flex;align-items:center}.rks p{font-size:20px;color:#000}.clgBox{position:absolute;left:160px;top:5px;width:78px;height:22px;display:flex;align-items:center;justify-content:center;background:var(--challenge);clip-path:polygon(9px 0,100% 0,calc(100% - 9px) 100%,0 100%)}.clgBox p{font-size:18px;font-weight:800;text-shadow:0 1px 2px #000}.date{position:absolute;right:-6px;top:-20px}.date p,.dataBox p{font-size:14px}.dataBox{position:absolute;left:-7px;bottom:-25px;height:20px;padding:0 12px;background:rgba(0,0,0,.5);display:flex;align-items:center}.recordInfo{position:absolute;right:12%;width:22%;height:112px;padding-left:52px;background:rgba(0,0,0,.5);backdrop-filter:blur(5px)}.whiteLine{position:absolute;left:0;width:37px;height:112px;background:#fff;clip-path:polygon(100% 0,46% 100%,0 100%,54% 0)}.record-head{position:absolute;top:-20px;left:36px;width:230px;display:grid;grid-template-columns:48px repeat(3,48px);font-size:12px;color:#ddd;text-align:center}.recordInfo .sheet{height:100%;padding-top:8px}.row{position:relative;height:25%;display:flex;align-items:center}.row:nth-child(1){left:10.5%}.row:nth-child(2){left:7%}.row:nth-child(3){left:3.5%}.poz{position:absolute;width:48px;text-align:center}.poz:nth-child(2){left:48px}.poz:nth-child(3){left:96px}.poz:nth-child(4){left:144px}.poz p{font-size:16px}.b19{position:relative;z-index:5;display:flex;flex-wrap:wrap;padding:0 42px 8px;gap:22px 18px}.song{position:relative;width:360px;height:100px;background:rgba(0,0,0,.45);box-shadow:0 0 12px #fff}.phi_song{box-shadow:0 0 16px #fff700}.ill-box{position:absolute;left:0;width:190px;height:100%}.ill{position:absolute;left:0;width:190px;height:100%;clip-path:polygon(0 0,100% 0,78% 100%,0 100%);background:#2a2a2a}.ill img,.cover-fallback{width:100%;height:100%;object-fit:cover}.cover-fallback{background:linear-gradient(135deg,#3d526b,#182230)}.num{position:absolute;z-index:4;left:-5px;top:-8px;width:54px;height:26px;background:#fff;display:flex;align-items:center;justify-content:center}.num p{color:#111;font-size:14px;font-weight:900}.rank-block{position:absolute;z-index:3;left:-4px;bottom:-6px;width:126px;height:31px;background:var(--rank-color);display:flex;align-items:center}.rank-block .org{width:73px;text-align:center}.rank-block .org p{font-size:13px;font-weight:700}.rank-block .rel{width:50px;text-align:center;background:rgba(0,0,0,.32);height:100%;display:flex;align-items:center;justify-content:center}.rank-block .rel p{font-size:15px;font-weight:800}.song-info{position:absolute;right:0;width:205px;height:100%;padding:8px 9px 6px 30px;background:color-mix(in srgb,var(--rank-color) 43%,transparent);clip-path:polygon(22px 0,100% 0,100% 100%,0 100%);backdrop-filter:blur(4px)}.songname{height:24px;display:flex;align-items:center;overflow:hidden}.songname p{max-width:100%;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px #000}.songinfo{position:relative;height:53px;display:flex;align-items:center}.rating{width:38px;height:38px;display:flex;align-items:center;justify-content:center;transform:skewX(-12deg);border:2px solid #fff;background:rgba(0,0,0,.66);font-size:18px;font-weight:900;text-shadow:0 0 7px #fff}.rating-phi{color:#fff700;border-color:#fff700}.rating-v,.rating-s{color:#00f0d1;border-color:#00f0d1}.achievement{flex:1;margin-left:7px;font-variant-numeric:tabular-nums}.score p{font-size:18px;font-weight:800;letter-spacing:.5px}.achievement .line{height:1px;background:rgba(255,255,255,.75)}.acc p{font-size:13px;text-align:right}.fc-mark{position:absolute;right:-2px;top:1px;color:#00f0d1;font-size:10px;font-weight:900}.suggest{position:absolute;right:2px;bottom:3px;height:18px;padding:0 9px;background:rgba(255,255,255,.82);display:flex;align-items:center}.suggest p{font-size:10px;color:#222;font-weight:800}.createdbox{position:relative;z-index:6;height:76px;display:flex;align-items:center;justify-content:center;gap:22px}.createdbox p{font-family:"Aldrich",sans-serif}.brand{font-size:36px;text-shadow:0 0 15px #00baff}.version{font-size:20px;text-shadow:0 0 15px #fff700}.page-no{position:absolute;right:42px;bottom:22px;font-size:13px;color:#ddd}
</style></head><body><main class="canvas" id="canvas"><div class="sheet-root"><div class="background">${background}</div><header class="title" data-layout-content><div class="playerInfo"><div class="blackBlock clip-box"></div><div class="avatar clip-box">${avatar}</div><div class="playerId"><p>${escapePhigrosBestImageHtml(input.playerName)}</p></div><div class="rks clip-box"><p>RKS ${escapePhigrosBestImageHtml(input.rks)}</p></div><div class="clgBox" style="--challenge:${challengeTone(input.challengeModeRank)}"><p>${escapePhigrosBestImageHtml(input.challenge)}</p></div><div class="date"><p>${escapePhigrosBestImageHtml(input.syncedAt)}</p></div><div class="dataBox clip-box"><p>Phigros · ${subtitle}</p></div></div><div class="recordInfo"><div class="whiteLine"></div><div class="record-head"><span></span><span>Clear</span><span>FC</span><span>φ</span></div><div class="sheet">${stats(input)}</div></div></header><section class="b19" data-layout-content>${scoreCards(input)}</section><footer class="createdbox" data-layout-content><p class="brand">rRanker</p><p class="version">Phigros ${subtitle}</p><p class="page-no">${input.page.pageIndex + 1} / ${input.page.pageCount}</p></footer></div></main><script>(()=>{const W=${input.width},MIN=${minimumHeight},canvas=document.getElementById('canvas'),post=m=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));let last=MIN;post({type:'best-image-runtime',width:W,userAgent:navigator.userAgent||''});const fit=()=>{last=Math.max(MIN,Math.ceil(canvas.querySelector('.sheet-root').getBoundingClientRect().height));canvas.style.height=last+'px';const vw=innerWidth||W,vh=innerHeight||MIN,exportView=Math.abs(vw-W)<2&&vh+2>=Math.min(last,MIN);const viewScale=exportView?1:Math.min(vw/W,vh/last);canvas.style.left=exportView?'0px':Math.max(0,(vw-W*viewScale)/2)+'px';canvas.style.top=exportView?'0px':Math.max(0,(vh-last*viewScale)/2)+'px';canvas.style.transform='scale('+viewScale+')';canvas.style.transformOrigin='top left';post({type:'best-image-height',width:W,height:last})};addEventListener('resize',fit);const images=[...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}));Promise.race([Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),...images]),new Promise(r=>setTimeout(r,5000))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{fit();const m={type:'best-image-ready',width:W,height:last};post(m);setTimeout(()=>post(m),250)})));fit()})();</script></body></html>`;
}
