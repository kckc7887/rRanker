export type ApplicationBestImagePalette = {
  background: string;
  border: string;
  text: string;
  mutedText?: string;
  metricText?: string;
  faintText?: string;
  suggestMutedText?: string;
  separator?: string;
  jacketBorder?: string;
};

export type ApplicationBestImageBadgePresentation = {
  key: string;
  label: string;
  variant?: 'rate' | 'status';
  background: string;
  border?: string;
  text: string;
};

export type ApplicationBestImageIconPresentation = {
  key: string;
  label: string;
  source: string;
};

export type ApplicationBestImageCardPresentation = {
  key: string;
  accessibilityLabel: string;
  identifier: string;
  title: string;
  coverUri: string | null;
  palette: ApplicationBestImagePalette;
  primary: {
    label?: string;
    text: string;
    textBackground?: string;
    badge?: ApplicationBestImageBadgePresentation;
    trailing?: string;
  };
  relation?: {
    text: string;
    trailing?: string;
    trailingMuted?: boolean;
  };
  iconRow?: readonly ApplicationBestImageIconPresentation[];
  badgeRows?: readonly (readonly ApplicationBestImageBadgePresentation[])[];
};

export function escapeApplicationBestImageHtml(value: string | number): string {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&#39;');
}

function renderBadge(badge: ApplicationBestImageBadgePresentation): string {
  if (badge.variant === 'rate') {
    return `<span class="rate-badge" style="--rate-bg:${escapeApplicationBestImageHtml(badge.background)};--rate-fg:${escapeApplicationBestImageHtml(badge.text)}">${escapeApplicationBestImageHtml(badge.label)}</span>`;
  }
  return `<span class="score-badge" style="--badge-bg:${escapeApplicationBestImageHtml(badge.background)};--badge-border:${escapeApplicationBestImageHtml(badge.border ?? badge.background)};--badge-fg:${escapeApplicationBestImageHtml(badge.text)}">${escapeApplicationBestImageHtml(badge.label)}</span>`;
}

export function renderApplicationBestImageCard(card: ApplicationBestImageCardPresentation): string {
  const cover = card.coverUri
    ? `<img class="song-jacket" alt="" src="${escapeApplicationBestImageHtml(card.coverUri)}">`
    : '';
  const art = card.coverUri
    ? `<div class="card-art" aria-hidden="true"><img class="card-art-image" alt="" src="${escapeApplicationBestImageHtml(card.coverUri)}"><div class="card-art-veil"></div></div>`
    : '';
  const primaryStyle = card.primary.textBackground
    ? ` style="background:${escapeApplicationBestImageHtml(card.primary.textBackground)};background-clip:text;-webkit-background-clip:text;-webkit-text-fill-color:transparent"`
    : '';
  const primaryBadge = card.primary.badge ? renderBadge(card.primary.badge) : '';
  const iconRow = card.iconRow?.length
    ? `<div class="tag-row icon-row">${card.iconRow.map((icon) => `<img class="tag-icon" alt="${escapeApplicationBestImageHtml(icon.label)}" src="${escapeApplicationBestImageHtml(icon.source)}">`).join('')}</div>`
    : '';
  const badgeRows = card.badgeRows?.filter((row) => row.length > 0)
    .map((row) => `<div class="tag-row">${row.map(renderBadge).join('')}</div>`).join('') ?? '';
  return `<article class="score-card" style="--card-bg:${escapeApplicationBestImageHtml(card.palette.background)};--card-fg:${escapeApplicationBestImageHtml(card.palette.text)};--card-border:${escapeApplicationBestImageHtml(card.palette.border)};--card-muted:${escapeApplicationBestImageHtml(card.palette.mutedText ?? 'rgba(255,255,255,.88)')};--card-metric:${escapeApplicationBestImageHtml(card.palette.metricText ?? 'rgba(255,255,255,.78)')};--card-faint:${escapeApplicationBestImageHtml(card.palette.faintText ?? 'rgba(255,255,255,.6)')};--suggest-muted:${escapeApplicationBestImageHtml(card.palette.suggestMutedText ?? 'rgba(255,255,255,.55)')};--separator-color:${escapeApplicationBestImageHtml(card.palette.separator ?? 'rgba(255,255,255,.55)')};--jacket-border:${escapeApplicationBestImageHtml(card.palette.jacketBorder ?? 'rgba(255,255,255,.85)')}" aria-label="${escapeApplicationBestImageHtml(card.accessibilityLabel)}">
    ${art}
    <div class="score-card-head">
      <div class="jacket-shell"><span class="jacket-fallback">♪</span>${cover}</div>
      <div class="song-copy"><span class="song-rank">${escapeApplicationBestImageHtml(card.identifier)}</span><strong class="song-title">${escapeApplicationBestImageHtml(card.title)}</strong></div>
    </div>
    <div class="score-separator"></div>
    <div class="achievement-row"><span class="achievement-with-rate">${card.primary.label ? `<span class="primary-label">${escapeApplicationBestImageHtml(card.primary.label)}</span>` : ''}<strong class="achievement"${primaryStyle}>${escapeApplicationBestImageHtml(card.primary.text)}</strong>${primaryBadge}</span>${card.primary.trailing ? `<span class="acc-value">${escapeApplicationBestImageHtml(card.primary.trailing)}</span>` : ''}</div>
    ${card.relation ? `<div class="rating-row"><span class="song-rating">${escapeApplicationBestImageHtml(card.relation.text)}</span>${card.relation.trailing ? `<span class="suggest${card.relation.trailingMuted ? ' suggest-empty' : ''}">${escapeApplicationBestImageHtml(card.relation.trailing)}</span>` : ''}</div>` : ''}
    ${iconRow || badgeRows ? `<div class="tag-rows">${iconRow}${badgeRows}</div>` : ''}
  </article>`;
}

export function renderApplicationBestImageSection(
  title: string,
  cards: readonly ApplicationBestImageCardPresentation[],
): string {
  const escapedTitle = escapeApplicationBestImageHtml(title);
  const content = cards.map(renderApplicationBestImageCard).join('')
    || '<div class="empty-section">暂无符合条件的成绩</div>';
  return `<section class="score-section" aria-label="${escapedTitle}"><div class="section-divider"><span>${escapedTitle}</span></div><div class="score-grid">${content}</div></section>`;
}

export function applicationBestImageCardCss({
  width,
  gridGap,
  scoreCardPadding,
  jacketSize,
}: {
  width: number;
  gridGap: number;
  scoreCardPadding: number;
  jacketSize: number;
}): string {
  const px = (value: number) => Math.max(1, Math.round(value));
  return `
    .score-section+.score-section{margin-top:${px(width * 26 / 1080)}px}
    .section-divider{display:flex;align-items:center;gap:${px(width * 13 / 1080)}px;margin:0 0 ${px(width * 14 / 1080)}px;color:rgba(22,29,43,.78);font:800 ${px(width * 20 / 1080)}px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:${Math.max(1, px(width * .8 / 1080))}px;white-space:nowrap}
    .section-divider::before,.section-divider::after{content:"";height:${Math.max(1, px(width * 1.2 / 1080))}px;flex:1;background:linear-gradient(90deg,transparent,rgba(28,38,57,.55))}
    .section-divider::after{background:linear-gradient(90deg,rgba(28,38,57,.55),transparent)}
    .section-divider-note{margin-left:${px(width * 6 / 1080)}px;font-size:${px(width * 14 / 1080)}px;font-weight:600;letter-spacing:0;opacity:.72}
    .score-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:${gridGap}px}
    .score-card{position:relative;display:flex;min-width:0;flex-direction:column;overflow:hidden;padding:${scoreCardPadding}px;border:1px solid var(--card-border,rgba(255,255,255,.35));border-radius:${px(width * 14 / 1080)}px;background:var(--card-bg);box-shadow:0 ${px(width * 5 / 1080)}px ${px(width * 15 / 1080)}px rgba(25,38,60,.28);color:var(--card-fg);isolation:isolate}
    .card-art{position:absolute;z-index:0;inset:0}.card-art-image{display:block;width:100%;height:100%;object-fit:cover;filter:blur(${px(width * 5 / 1080)}px);transform:scale(1.05)}.card-art-veil{position:absolute;inset:0;background:var(--card-bg);opacity:.8;-webkit-backdrop-filter:blur(${px(width * 6 / 1080)}px);backdrop-filter:blur(${px(width * 6 / 1080)}px)}
    .score-card-head{position:relative;z-index:1;display:flex;min-width:0;height:${jacketSize}px;align-items:stretch;gap:${px(width * 10 / 1080)}px}.jacket-shell{position:relative;width:${jacketSize}px;height:${jacketSize}px;flex:0 0 ${jacketSize}px;overflow:hidden;border:${Math.max(2, px(width * 3 / 1080))}px solid var(--jacket-border);border-radius:${px(width * 10 / 1080)}px;background:rgba(0,0,0,.18)}.song-jacket{position:absolute;inset:0;z-index:1;display:block;width:100%;height:100%;object-fit:cover}.jacket-fallback{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--card-faint);font:700 ${px(width * 30 / 1080)}px/1 system-ui,sans-serif}
    .song-copy{position:relative;display:flex;min-width:0;height:100%;min-height:0;flex:1;flex-direction:column;justify-content:center;gap:${px(width * 6 / 1080)}px;overflow:hidden;padding:${px(width * 2 / 1080)}px 0}.song-rank{overflow:hidden;color:var(--card-faint);font:800 ${px(width * 14 / 1080)}px/1 system-ui,sans-serif;text-overflow:ellipsis;white-space:nowrap}.song-title{display:-webkit-box;overflow:hidden;color:var(--card-fg);font:800 ${px(width * 18 / 1080)}px/1.18 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal}
    .score-separator{position:relative;z-index:1;height:1px;margin:${px(width * 7 / 1080)}px 0;background:linear-gradient(90deg,transparent,var(--separator-color),transparent)}.achievement-row{position:relative;z-index:1;display:flex;min-width:0;align-items:center;gap:${px(width * 6 / 1080)}px}.achievement-with-rate{display:flex;min-width:0;align-items:center;gap:${px(width * 6 / 1080)}px}.primary-label{color:var(--card-muted);font:800 ${px(width * 12 / 1080)}px/1 system-ui,sans-serif}.achievement{min-width:0;overflow:hidden;color:var(--card-fg);font:900 ${px(width * 19 / 1080)}px/1.06 system-ui,-apple-system,"Segoe UI",sans-serif;font-variant-numeric:tabular-nums;text-overflow:ellipsis;white-space:nowrap}.rate-badge{display:inline-flex;min-width:${px(width * 24 / 1080)}px;height:${px(width * 18 / 1080)}px;flex:0 0 auto;align-items:center;justify-content:center;padding:0 ${px(width * 6 / 1080)}px;border-radius:${px(width * 6 / 1080)}px;background:var(--rate-bg);color:var(--rate-fg);font:900 ${px(width * 12 / 1080)}px/1 system-ui,sans-serif;white-space:nowrap}.acc-value{margin-left:auto;flex:0 0 auto;color:var(--card-metric);font:800 ${px(width * 14 / 1080)}px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap}
    .rating-row{position:relative;z-index:1;display:flex;min-width:0;align-items:center;justify-content:space-between;gap:${px(width * 6 / 1080)}px;margin-top:${px(width * 8 / 1080)}px;color:var(--card-muted);font:700 ${px(width * 14 / 1080)}px/1.15 system-ui,sans-serif;white-space:nowrap}.song-rating{min-width:0;overflow:hidden;font-weight:900;font-variant-numeric:tabular-nums;text-overflow:ellipsis}.suggest{flex:0 0 auto;color:#A5E3FF;font-weight:800;font-variant-numeric:tabular-nums}.suggest-empty{color:var(--suggest-muted)}
    .tag-rows{position:relative;z-index:1;display:flex;flex-direction:column;gap:${px(width * 5 / 1080)}px;margin-top:${px(width * 8 / 1080)}px}.tag-row{display:flex;min-height:${px(width * 24 / 1080)}px;align-items:center;flex-wrap:wrap;gap:${px(width * 6 / 1080)}px}.icon-row{min-height:${px(width * 18 / 1080)}px}.tag-icon{display:block;width:${px(width * 18 / 1080)}px;height:${px(width * 18 / 1080)}px;object-fit:contain}.score-badge{display:inline-flex;min-width:${px(width * 32 / 1080)}px;height:${px(width * 24 / 1080)}px;align-items:center;justify-content:center;padding:0 ${px(width * 8 / 1080)}px;border:1px solid var(--badge-border);border-radius:999px;background:var(--badge-bg);color:var(--badge-fg);font:900 ${px(width * 10 / 1080)}px/1 system-ui,sans-serif;letter-spacing:.035em;white-space:nowrap}
    .empty-section{grid-column:1/-1;display:flex;min-height:${px(width * 80 / 1080)}px;align-items:center;justify-content:center;color:#697586;font:700 ${px(width * 14 / 1080)}px/1.4 system-ui,sans-serif}`;
}
