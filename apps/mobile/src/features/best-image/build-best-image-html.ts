import type { Player } from '@/domain/models';
import { DX_RATING_TIER_MINS } from '@/domain/dx-rating-theme';

export type BestImageType = 'best50' | 'custom';

export type BestImageHtmlInput = {
  type: BestImageType;
  width: number;
  player: Pick<Player, 'displayName' | 'presentation'>;
  rating: number;
  fontUrl: string;
  ratingFrameUrl: string;
};

const LXNS_ASSET_ROOT = 'https://assets2.lxns.net/maimai';
export function minimumBestImageHeight(width: number): number {
  return Math.ceil(width * 4 / 3);
}

export function ratingFrameIndex(rating: number): number {
  const value = Number.isFinite(rating) ? Math.max(0, Math.floor(rating)) : 0;
  let index = 0;
  for (let cursor = 0; cursor < DX_RATING_TIER_MINS.length; cursor += 1) {
    if (value >= DX_RATING_TIER_MINS[cursor]!) index = cursor;
  }
  return index;
}

export function parseBestImageHeightMessage(data: string, expectedWidth: number): number | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object') return null;
    const message = value as { type?: unknown; width?: unknown; height?: unknown };
    if (message.type !== 'best-image-height' || message.width !== expectedWidth) return null;
    if (typeof message.height !== 'number' || !Number.isFinite(message.height)) return null;
    return Math.max(minimumBestImageHeight(expectedWidth), Math.round(message.height));
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeCssUrl(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/[\r\n]/gu, '');
}

function collectionAssetUrl(kind: 'icon' | 'plate' | 'frame', id: number | undefined): string | null {
  if (!Number.isSafeInteger(id) || (id ?? -1) < 0) return null;
  return `${LXNS_ASSET_ROOT}/${kind}/${id}.png`;
}

function trophyToneClass(color: string | null | undefined): string {
  const tone = (color ?? 'normal').toLowerCase();
  return ['bronze', 'silver', 'gold', 'rainbow'].includes(tone) ? tone : 'normal';
}

function px(value: number): number {
  return Math.max(1, Math.round(value));
}

export function buildBestImageHtml(input: BestImageHtmlInput): string {
  const width = Math.max(1, Math.round(input.width));
  const minimumHeight = minimumBestImageHeight(width);
  const rating = Math.min(99999, Math.max(0, Math.floor(Number.isFinite(input.rating) ? input.rating : 0)));
  const digits = String(rating).padStart(5, '0').split('');
  const name = input.player.displayName.trim() || '未读取玩家资料';
  const presentation = input.player.presentation;
  const plateUrl = collectionAssetUrl('plate', presentation?.namePlateId);
  const iconUrl = collectionAssetUrl('icon', presentation?.iconId);
  const frameUrl = collectionAssetUrl('frame', presentation?.frameId);
  const trophyName = presentation?.trophyName?.trim() || '称号未同步';
  const initial = Array.from(name)[0] ?? '?';

  const bannerWidth = px(width * 0.5);
  const bannerHeight = px(bannerWidth * 116 / 720);
  const pageInset = px(width * 0.04);
  const avatarInset = px(bannerHeight * 0.055);
  const avatarSize = px(bannerHeight * 0.89);
  const identityLeft = avatarInset + avatarSize + px(bannerWidth * 0.019);
  const identityRight = px(bannerWidth * 0.038);
  const ratingWidth = px(bannerWidth * 0.267);
  const ratingHeight = px(ratingWidth / 4.4);
  const ratingFontSize = px(ratingHeight * 0.48);
  const playerNameSize = px(bannerWidth * 0.035);
  const trophySize = px(bannerWidth * 0.02);
  const radius = px(bannerWidth * 0.013);
  const stroke = Math.max(1, px(bannerWidth / 720));
  const backgroundBlur = px(width * 0.02);
  const nameplate = plateUrl
    ? `<img class="nameplate-image" alt="" src="${escapeHtml(plateUrl)}">`
    : '<div class="nameplate-fallback"></div>';
  const avatar = iconUrl
    ? `<img class="avatar-image" alt="" src="${escapeHtml(iconUrl)}">`
    : `<div class="avatar-fallback">${escapeHtml(initial)}</div>`;
  const ratingDigits = digits.map((digit) => `<span>${digit}</span>`).join('');
  const canvasBackground = frameUrl
    ? `<div class="canvas-background" style="background-image:url(&quot;${escapeHtml(frameUrl)}&quot;)"></div>`
    : '<div class="canvas-background canvas-background-fallback"></div>';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${width}, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>
    @font-face{font-family:RatingNumbers;src:url("${escapeCssUrl(input.fontUrl)}") format("truetype");font-display:block}
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#DDE3EC}
    body{-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
    .preview-stage{position:fixed;inset:0;overflow:hidden;background:#DDE3EC}
    .canvas{position:absolute;left:0;top:0;width:${width}px;min-height:${minimumHeight}px;overflow:hidden;transform-origin:top left;background:#E7EDF5}
    .canvas-background{position:absolute;inset:-${backgroundBlur * 2}px;background-position:center;background-size:cover;filter:blur(${backgroundBlur}px);transform:scale(1.08)}
    .canvas-background-fallback{inset:0;background:linear-gradient(145deg,#EEF2F8 0%,#E7EDF5 52%,#F5F7FA 100%);filter:none;transform:none}
    .canvas-tone{position:absolute;inset:0;background:rgba(238,242,248,.18)}
    .profile-banner{position:absolute;z-index:1;left:${pageInset}px;top:${pageInset}px;width:${bannerWidth}px;height:${bannerHeight}px;border-radius:${radius}px;filter:drop-shadow(0 ${px(bannerWidth * 0.008)}px ${px(bannerWidth * 0.018)}px rgba(35,53,82,.22))}
    .nameplate-image,.nameplate-fallback{position:absolute;inset:0;display:block;width:100%;height:100%;border-radius:${radius}px}
    .nameplate-image{object-fit:contain}
    .nameplate-fallback{border:${Math.max(1, px(bannerWidth * 0.002))}px solid rgba(255,255,255,.8);background:linear-gradient(100deg,#9EB5D8 0%,#E8EDF6 38%,#F5D9B4 70%,#D99591 100%)}
    .avatar{position:absolute;left:${avatarInset}px;top:${avatarInset}px;width:${avatarSize}px;height:${avatarSize}px;overflow:hidden;border-radius:${px(bannerWidth * 0.01)}px;border:${Math.max(2, px(bannerWidth * 0.004))}px solid rgba(255,255,255,.9);background:#DDE5F0;box-shadow:0 ${px(bannerWidth * 0.004)}px ${px(bannerWidth * 0.01)}px rgba(27,41,68,.28)}
    .avatar-image{display:block;width:100%;height:100%;object-fit:cover}
    .avatar-fallback{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font:900 ${px(bannerWidth * 0.065)}px/1 system-ui,sans-serif;color:#52647F;background:linear-gradient(145deg,#F8FBFF,#C7D5EA)}
    .identity{position:absolute;left:${identityLeft}px;right:${identityRight}px;top:${avatarInset}px;bottom:${avatarInset}px;display:flex;min-width:0;flex-direction:column;align-items:flex-start;justify-content:center;gap:${px(bannerWidth * 0.004)}px}
    .rating{position:relative;width:${ratingWidth}px;height:${ratingHeight}px;flex:0 0 ${ratingHeight}px}
    .rating-frame{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
    .rating-digits{position:absolute;left:48.3%;top:17%;display:grid;grid-template-columns:repeat(5,1fr);align-items:center;width:43.8%;height:61%;font-family:RatingNumbers,"Arial Black",sans-serif;font-size:${ratingFontSize}px;font-weight:900;line-height:1;color:#FFD83D;-webkit-text-stroke:${stroke}px #090909;text-shadow:0 ${Math.max(1, stroke)}px 0 #090909;font-variant-numeric:tabular-nums}
    .rating-digits span{display:flex;align-items:center;justify-content:center;height:100%}
    .player-name{display:block;width:fit-content;max-width:100%;overflow:hidden;padding:${px(bannerWidth * 0.003)}px ${px(bannerWidth * 0.011)}px;border:${Math.max(1, px(bannerWidth * 0.0015))}px solid rgba(96,87,72,.45);border-radius:${px(bannerWidth * 0.006)}px;background:rgba(255,255,255,.9);color:#171717;font:900 ${playerNameSize}px/1.1 system-ui,-apple-system,"Segoe UI",sans-serif;text-overflow:ellipsis;white-space:nowrap}
    .trophy{display:flex;width:fit-content;max-width:100%;min-height:${px(bannerWidth * 0.032)}px;align-items:center;justify-content:center;overflow:hidden;padding:${px(bannerWidth * 0.0025)}px ${px(bannerWidth * 0.009)}px;border:${Math.max(1, px(bannerWidth * 0.0015))}px solid #9CA3AF;border-radius:999px;background:rgba(243,244,246,.94);color:#6B7280;font:400 ${trophySize}px/1 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;text-overflow:ellipsis;white-space:nowrap}
    .trophy.bronze{border-color:#B87333;background:#FBF3EA;color:#8B5A1A}.trophy.silver{border-color:#9CA3AF;background:#F3F4F6;color:#4B5563}.trophy.gold{border-color:#D4A017;background:#FFF8E6;color:#92650A}.trophy.rainbow{border-color:transparent;background:linear-gradient(#F5F3FF,#F5F3FF) padding-box,linear-gradient(90deg,#F87171,#FBBF24,#34D399,#60A5FA,#A78BFA) border-box;color:#5B21B6}
  </style>
</head>
<body>
  <div class="preview-stage">
    <main class="canvas" data-image-type="${input.type}" aria-label="成绩图片预览">
      ${canvasBackground}<div class="canvas-tone"></div>
      <section class="profile-banner" data-layout-content aria-label="玩家资料">
        ${nameplate}
        <div class="avatar">${avatar}</div>
        <div class="identity">
          <div class="rating" aria-label="Rating ${rating}"><img class="rating-frame" alt="" src="${escapeHtml(input.ratingFrameUrl)}"><div class="rating-digits">${ratingDigits}</div></div>
          <div class="player-name">${escapeHtml(name)}</div>
          <div class="trophy ${trophyToneClass(presentation?.trophyColor)}">${escapeHtml(trophyName)}</div>
        </div>
      </section>
    </main>
  </div>
  <script>
    (() => {
      const OUTPUT_WIDTH = ${width};
      const MINIMUM_HEIGHT = ${minimumHeight};
      const canvas = document.querySelector('.canvas');
      let lastHeight = 0;
      let pending = false;

      const measureAndFit = () => {
        pending = false;
        const layoutChildren = Array.from(canvas.children).filter((child) => child.hasAttribute('data-layout-content'));
        const contentHeight = layoutChildren.reduce((maximum, child) => Math.max(maximum, child.offsetTop + child.scrollHeight), 0);
        const logicalHeight = Math.max(MINIMUM_HEIGHT, Math.ceil(contentHeight));
        const nextHeight = logicalHeight + 'px';
        if (canvas.style.height !== nextHeight) canvas.style.height = nextHeight;

        const scale = Math.min(window.innerWidth / OUTPUT_WIDTH, window.innerHeight / logicalHeight);
        canvas.style.left = Math.max(0, (window.innerWidth - OUTPUT_WIDTH * scale) / 2) + 'px';
        canvas.style.top = Math.max(0, (window.innerHeight - logicalHeight * scale) / 2) + 'px';
        canvas.style.transform = 'scale(' + scale + ')';

        if (logicalHeight !== lastHeight) {
          lastHeight = logicalHeight;
          window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'best-image-height', width: OUTPUT_WIDTH, height: logicalHeight }));
        }
      };
      const schedule = () => {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(measureAndFit);
      };
      const resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(canvas);
      Array.from(canvas.children)
        .filter((child) => child.hasAttribute('data-layout-content'))
        .forEach((child) => resizeObserver.observe(child));
      new MutationObserver((records) => {
        records.forEach((record) => record.addedNodes.forEach((node) => {
          if (node instanceof Element && node.hasAttribute('data-layout-content')) resizeObserver.observe(node);
        }));
        schedule();
      }).observe(canvas, { childList: true, subtree: true });
      window.addEventListener('resize', schedule);
      window.addEventListener('load', schedule);
      document.fonts?.ready.then(schedule);
      schedule();
    })();
  </script>
</body>
</html>`;
}
