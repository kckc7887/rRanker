import type { BestSectionPresentation, ScoreCardPresentation } from '@/features/game-content/presentation';

export type FixedBestImageTheme = {
  accent: string;
  accentSoft: string;
  secondaryAccent?: string;
};

export type FixedBestImageInput = {
  width: number;
  title: string;
  playerName: string;
  ratingLabel: string;
  ratingDisplay: string;
  avatarUrl?: string | null;
  avatarFallbackUrl?: string | null;
  sections: readonly BestSectionPresentation[];
  theme: FixedBestImageTheme;
  dataSource: string;
};

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

function badgeHtml(label: string, value: string | undefined, tone: string): string {
  return `<span class="badge" data-tone="${escapeHtml(tone)}">${escapeHtml(label)}${value ? ` <b>${escapeHtml(value)}</b>` : ''}</span>`;
}

function metricHtml(label: string | undefined, text: string): string {
  return `<span class="metric">${label ? `<small>${escapeHtml(label)}</small>` : ''}<b>${escapeHtml(text)}</b></span>`;
}

function cardHtml(card: ScoreCardPresentation): string {
  const secondary = card.secondaryMetrics.map((metric) => metricHtml(metric.label, metric.text)).join('');
  const achievements = card.achievementRows.flat().map((badge) => badgeHtml(badge.label, badge.value, badge.tone)).join('');
  return `<article class="score-card">
    <div class="card-title"><span>${card.position ? `${card.position}. ` : ''}${escapeHtml(card.title)}</span></div>
    <div class="primary"><small>${escapeHtml(card.primaryMetric.label ?? '')}</small><strong>${escapeHtml(card.primaryMetric.text)}</strong></div>
    <div class="metrics">${secondary}</div>
    <div class="badges">${badgeHtml(card.difficulty.label, card.difficulty.value, card.difficulty.tone)}${card.grade ? badgeHtml(card.grade.label, card.grade.value, card.grade.tone) : ''}${achievements}</div>
    ${card.supportingText ? `<div class="supporting">${escapeHtml(card.supportingText)}</div>` : ''}
  </article>`;
}

export function buildFixedBestImageHtml(input: FixedBestImageInput): string {
  const sections = input.sections.map((section) => `<section>
    <div class="section-heading"><h2>${escapeHtml(section.title)}</h2><span>${section.items.length} 条</span></div>
    <div class="grid">${section.items.map(cardHtml).join('')}</div>
  </section>`).join('');
  const avatarSource = input.avatarUrl || input.avatarFallbackUrl;
  const avatar = avatarSource ? `<img class="avatar" src="${escapeHtml(avatarSource)}" data-fallback="${escapeHtml(input.avatarFallbackUrl ?? '')}" alt="" />` : '';
  const secondaryLine = input.theme.secondaryAccent
    ? `<i style="background:${escapeHtml(input.theme.secondaryAccent)}"></i>` : '';
  return `<!doctype html><html><head><meta charset="utf-8" />
  <meta name="viewport" content="width=${input.width}, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <style>
    *{box-sizing:border-box}html,body{margin:0;width:${input.width}px;min-height:${Math.ceil(input.width * 0.75)}px;background:#F3F6FA;color:#172033;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",sans-serif}
    body{padding:54px 58px 42px}.accent-lines{display:flex;gap:10px;height:7px;margin-bottom:28px}.accent-lines i{display:block;flex:1;border-radius:99px;background:${escapeHtml(input.theme.accent)}}
    header{display:flex;align-items:center;justify-content:space-between;gap:28px;margin-bottom:34px}.identity{display:flex;align-items:center;gap:18px;min-width:0}.avatar{width:86px;height:86px;border-radius:24px;object-fit:cover;background:#E6EBF2;border:3px solid #FFF;box-shadow:0 8px 24px rgba(31,41,55,.14)}
    .player{min-width:0}.player-name{max-width:620px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:34px;line-height:1.2;font-weight:850}.rating{display:inline-flex;align-items:center;gap:12px;margin-top:10px;padding:8px 14px;border-radius:999px;background:${escapeHtml(input.theme.accentSoft)};color:${escapeHtml(input.theme.accent)};font-size:18px;font-weight:800}.rating b{font-size:22px;font-variant-numeric:tabular-nums}
    .document-title{text-align:right}.document-title h1{margin:0;font-size:42px;line-height:1;font-weight:900}.document-title p{margin:10px 0 0;color:#768195;font-size:16px;font-weight:700}
    section+section{margin-top:30px}.section-heading{display:flex;align-items:end;justify-content:space-between;margin:0 2px 15px}.section-heading h2{margin:0;font-size:24px;font-weight:850}.section-heading span{color:#8993A4;font-size:15px;font-weight:750}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .score-card{position:relative;min-height:214px;padding:19px;border:1px solid #DEE4EC;border-radius:22px;background:#FFF;box-shadow:0 7px 22px rgba(31,41,55,.07);overflow:hidden}.score-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:5px;background:${escapeHtml(input.theme.accent)}}
    .card-title{height:44px;font-size:19px;line-height:24px;font-weight:850;overflow:hidden}.card-title span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.primary{display:flex;align-items:baseline;gap:8px;margin-top:10px}.primary small,.metric small{color:#7B8596;font-size:11px;font-weight:800;letter-spacing:.3px}.primary strong{font-size:25px;line-height:30px;font-weight:900;font-variant-numeric:tabular-nums}.metrics{display:flex;flex-wrap:wrap;gap:7px 13px;margin-top:8px}.metric{display:inline-flex;align-items:baseline;gap:5px}.metric b{font-size:13px;font-weight:850;font-variant-numeric:tabular-nums}.badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:13px}.badge{display:inline-flex;align-items:center;gap:3px;min-height:25px;padding:4px 8px;border-radius:999px;background:#EEF1F5;color:#4B5565;font-size:10px;line-height:14px;font-weight:850}.badge[data-tone*="world"],.badge[data-tone*="personal"],.badge[data-tone*="achievement"]{background:#FFF1BE;color:#8A5B00}.badge[data-tone="0"]{background:#DFF5E6;color:#257247}.badge[data-tone="1"]{background:#E0EEFF;color:#265EA6}.badge[data-tone="2"]{background:#FFE2F0;color:#A02E65}.badge[data-tone="3"]{background:#292D36;color:#FFF}.badge[data-tone="4"]{background:#FFF;border:1px solid #BBC2CC;color:#252B35}.badge[data-tone*="acc-gold"]{background:#FFF0B8;color:#8A6200}.supporting{margin-top:9px;color:#98A1AF;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    footer{display:flex;justify-content:space-between;margin-top:28px;color:#929BA9;font-size:13px;font-weight:650}.signature{color:${escapeHtml(input.theme.accent)};font-weight:850}
  </style></head><body>
    <div class="accent-lines"><i></i>${secondaryLine}</div>
    <header><div class="identity">${avatar}<div class="player"><div class="player-name">${escapeHtml(input.playerName)}</div><div class="rating"><span>${escapeHtml(input.ratingLabel)}</span><b>${escapeHtml(input.ratingDisplay)}</b></div></div></div><div class="document-title"><h1>${escapeHtml(input.title)}</h1><p>rRanker 成绩图片</p></div></header>
    ${sections}
    <footer><span>${escapeHtml(input.dataSource)}</span><span class="signature">Generated by rRanker</span></footer>
    <script>(function(){
      var bridge=window.ReactNativeWebView;function post(value){if(bridge&&bridge.postMessage)bridge.postMessage(JSON.stringify(value))}
      function height(){return Math.max(document.body.scrollHeight,document.documentElement.scrollHeight,${Math.ceil(input.width * 0.75)})}
      post({type:'best-image-runtime',width:${input.width},userAgent:navigator.userAgent||''});
      document.querySelectorAll('img.avatar').forEach(function(image){image.addEventListener('error',function(){var fallback=image.dataset.fallback;if(fallback&&image.src!==fallback){image.src=fallback}else{image.style.display='none'}})});
      Promise.all([document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve(),Promise.all(Array.from(document.images).map(function(image){return image.complete?Promise.resolve():new Promise(function(resolve){image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true})})}))]).then(function(){requestAnimationFrame(function(){requestAnimationFrame(function(){var measured=height();post({type:'best-image-height',width:${input.width},height:measured});post({type:'best-image-ready',width:${input.width},height:measured})})})});
    })();</script>
  </body></html>`;
}
