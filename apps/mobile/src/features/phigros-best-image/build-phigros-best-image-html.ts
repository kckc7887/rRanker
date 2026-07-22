import { formatPhigrosSongRks } from '@/domain/phigros';
import type { PhigrosBestImagePage, PhigrosBestImageType } from './phigros-best-image';

export type PhigrosBestImageHtmlInput = {
  type: PhigrosBestImageType;
  width: 1080 | 1440 | 2160;
  page: PhigrosBestImagePage;
  playerName: string;
  rks: string;
  challenge: string;
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

const LEVELS = ['EZ', 'HD', 'IN', 'AT'] as const;
const LEVEL_COLORS = ['#55D7A0', '#56A9F7', '#EF5B80', '#B889F4'] as const;

export function escapePhigrosBestImageHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]!));
}

function rateLabel(value: string): string {
  return value === 'phi' ? 'φ' : value.toUpperCase();
}

function scoreCards(input: PhigrosBestImageHtmlInput): string {
  return input.page.sections.map((section) => {
    const cards = section.records.map((record, sectionIndex) => {
      const rank = input.type === 'best30'
        ? sectionIndex + 1
        : input.page.pageIndex * 30 + sectionIndex + 1;
      const title = input.titles[record.songId] ?? record.title ?? record.songId;
      const illustration = input.illustrations[record.songId];
      const level = LEVELS[record.levelIndex] ?? record.level;
      const color = LEVEL_COLORS[record.levelIndex] ?? '#8EA0B8';
      return `<article class="score-card">
        <div class="cover">${illustration ? `<img src="${escapePhigrosBestImageHtml(illustration)}" alt="">` : '<div class="cover-fallback"></div>'}<span class="rank">#${rank}</span></div>
        <div class="score-copy">
          <div class="song-title" title="${escapePhigrosBestImageHtml(title)}">${escapePhigrosBestImageHtml(title)}</div>
          <div class="chart-line"><span class="difficulty" style="--level:${color}">${escapePhigrosBestImageHtml(level)} ${record.difficultyConstant.toFixed(1)}</span><span class="rate">${rateLabel(record.rate)}</span>${record.fc ? '<span class="fc">FC</span>' : ''}</div>
          <div class="numbers"><strong>${Math.round(record.dxScore ?? 0).toLocaleString('en-US')}</strong><span>${record.achievements.toFixed(2)}%</span></div>
          <div class="song-rks">单曲 RKS <strong>${formatPhigrosSongRks(record.rating)}</strong></div>
        </div>
      </article>`;
    }).join('');
    return `<section class="score-section" data-layout-content><div class="section-heading"><h2>${escapePhigrosBestImageHtml(section.title)}</h2><span>${section.records.length} 张谱面</span></div><div class="score-grid">${cards}</div></section>`;
  }).join('');
}

function stats(input: PhigrosBestImageHtmlInput): string {
  return LEVELS.map((level, index) => `<div class="stat-row"><strong style="color:${LEVEL_COLORS[index]}">${level}</strong><span>${input.progress.cleared[index] ?? 0}</span><span>${input.progress.fullCombo[index] ?? 0}</span><span>${input.progress.phi[index] ?? 0}</span></div>`).join('');
}

export function buildPhigrosBestImageHtml(input: PhigrosBestImageHtmlInput): string {
  const recordCount = input.page.sections.reduce((sum, section) => sum + section.records.length, 0);
  const layoutScale = input.width / 1080;
  const estimatedContentHeight = 54 + 200 + input.page.sections.length * 72
    + Math.ceil(recordCount / 3) * 192 + 96;
  const minimumHeight = Math.max(
    Math.ceil(input.width * 0.75),
    Math.ceil(estimatedContentHeight * layoutScale),
  );
  const background = input.backgroundDataUri
    ? `url('${escapePhigrosBestImageHtml(input.backgroundDataUri)}') center / cover fixed`
    : 'linear-gradient(135deg,#121B2B 0%,#19384A 48%,#332A50 100%)';
  const avatar = input.avatarDataUri
    ? `<img src="${escapePhigrosBestImageHtml(input.avatarDataUri)}" alt="">`
    : `<span>${escapePhigrosBestImageHtml(input.playerName.trim().slice(0, 1) || 'P')}</span>`;
  const subtitle = input.type === 'best30' ? 'PHI3 + BEST27' : 'CUSTOM RECORDS';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
.content{width:1080px;zoom:${input.width / 1080}}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#0f1724;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif;color:#fff}.canvas{position:absolute;width:${input.width}px;min-height:${minimumHeight}px;transform-origin:top left;overflow:hidden;background:${background}}.veil{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,14,25,.35),rgba(8,14,25,.88) 42%,rgba(8,14,25,.96));backdrop-filter:blur(10px)}.content{position:relative;padding:54px 56px 48px}.hero{display:grid;grid-template-columns:140px 1fr 360px;gap:28px;align-items:center;padding:30px;border:1px solid rgba(255,255,255,.18);border-radius:28px;background:rgba(13,22,36,.72);box-shadow:0 22px 70px rgba(0,0,0,.3)}.avatar{width:132px;height:132px;border-radius:22px;overflow:hidden;background:linear-gradient(135deg,#42d8cc,#5967e8);display:grid;place-items:center;border:3px solid rgba(255,255,255,.7)}.avatar img{width:100%;height:100%;object-fit:cover}.avatar span{font-size:64px;font-weight:900}.eyebrow{font-size:18px;letter-spacing:5px;color:#8ce8e3;font-weight:800}.player{font-size:44px;line-height:1.18;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:8px 0}.meta{display:flex;gap:16px;color:#b7c2d1;font-size:17px}.badges{display:flex;gap:10px;margin-top:16px}.badge{padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.1);font-weight:800}.rks strong{font-size:25px;color:#93ece7}.challenge strong{font-size:22px;color:#ffd688}.stats{display:grid;gap:8px;font-size:15px}.stat-head,.stat-row{display:grid;grid-template-columns:1fr repeat(3,62px);align-items:center;text-align:center}.stat-head{color:#8292a8;font-size:12px;letter-spacing:1px}.stat-row{padding:7px 0;border-top:1px solid rgba(255,255,255,.09);font-variant-numeric:tabular-nums}.score-section{margin-top:32px}.section-heading{display:flex;align-items:baseline;justify-content:space-between;margin:0 4px 14px}.section-heading h2{font-size:27px;letter-spacing:2px;margin:0}.section-heading span{color:#a5b1c1}.score-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.score-card{height:178px;display:grid;grid-template-columns:145px 1fr;border:1px solid rgba(255,255,255,.14);border-radius:18px;overflow:hidden;background:rgba(13,22,36,.78);box-shadow:0 10px 25px rgba(0,0,0,.18)}.cover{position:relative;overflow:hidden;background:#26354a}.cover img,.cover-fallback{width:100%;height:100%;object-fit:cover}.cover-fallback{background:linear-gradient(135deg,#33465f,#172235)}.rank{position:absolute;left:8px;top:8px;background:rgba(7,12,20,.8);padding:5px 8px;border-radius:8px;font-weight:900}.score-copy{padding:14px 15px;min-width:0}.song-title{height:42px;font-size:17px;line-height:21px;font-weight:800;overflow:hidden}.chart-line{display:flex;align-items:center;gap:7px;margin:8px 0}.difficulty{border-left:5px solid var(--level);padding-left:7px;font-weight:900}.rate,.fc{padding:3px 7px;border-radius:6px;background:rgba(255,255,255,.11);font-size:12px;font-weight:900}.fc{color:#8ce8e3}.numbers{display:flex;justify-content:space-between;align-items:baseline;font-variant-numeric:tabular-nums}.numbers strong{font-size:19px}.numbers span{font-size:14px;color:#c6d1df}.song-rks{margin-top:8px;color:#8e9caf;font-size:12px}.song-rks strong{color:#fff;font-size:16px}.footer{display:flex;justify-content:space-between;margin-top:28px;color:#8492a5;font-size:14px}.footer strong{color:#d5dde8}
</style></head><body><main class="canvas" id="canvas"><div class="veil"></div><div class="content"><header class="hero" data-layout-content><div class="avatar">${avatar}</div><div><div class="eyebrow">RRANKER · ${subtitle}</div><div class="player">${escapePhigrosBestImageHtml(input.playerName)}</div><div class="meta"><span>同步于 ${escapePhigrosBestImageHtml(input.syncedAt)}</span></div><div class="badges"><span class="badge rks">RKS <strong>${escapePhigrosBestImageHtml(input.rks)}</strong></span><span class="badge challenge">课题模式 <strong>${escapePhigrosBestImageHtml(input.challenge)}</strong></span></div></div><div class="stats"><div class="stat-head"><span>难度</span><span>Clear</span><span>FC</span><span>φ</span></div>${stats(input)}</div></header>${scoreCards(input)}<footer class="footer" data-layout-content><strong>rRanker · Phigros</strong><span>第 ${input.page.pageIndex + 1} / ${input.page.pageCount} 页</span></footer></div></main><script>(()=>{const W=${input.width},MIN=${minimumHeight},canvas=document.getElementById('canvas'),post=m=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));let last=MIN;post({type:'best-image-runtime',width:W,userAgent:navigator.userAgent||''});const fit=()=>{const content=canvas.querySelector('.content');last=Math.max(MIN,Math.ceil(content.scrollHeight));canvas.style.height=last+'px';const vw=innerWidth||W,vh=innerHeight||MIN,exportView=Math.abs(vw-W)<2&&vh+2>=Math.min(last,MIN);const scale=exportView?1:Math.min(vw/W,vh/last);canvas.style.left=exportView?'0px':Math.max(0,(vw-W*scale)/2)+'px';canvas.style.top=exportView?'0px':Math.max(0,(vh-last*scale)/2)+'px';canvas.style.transform='scale('+scale+')';post({type:'best-image-height',width:W,height:last})};addEventListener('resize',fit);const images=[...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}));Promise.race([Promise.all([document.fonts?document.fonts.ready:Promise.resolve(),...images]),new Promise(r=>setTimeout(r,5000))]).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{fit();const m={type:'best-image-ready',width:W,height:last};post(m);setTimeout(()=>post(m),250)})));fit()})();</script></body></html>`;
}
