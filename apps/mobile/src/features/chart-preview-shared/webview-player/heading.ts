export type PreviewDifficulty = {
  label: string;
  value: string;
  background: string;
  text: string;
  border?: string;
  identity?: string;
};

export function renderPreviewHeading(title: string, difficulty?: PreviewDifficulty): void {
  const titleElement = document.getElementById('title')!;
  titleElement.textContent = title;
  titleElement.title = title;
  document.querySelector('.preview-heading-badges')?.remove();
  const row = document.createElement('div');
  row.className = 'preview-heading-badges';
  const badge = document.createElement('span');
  badge.className = 'preview-difficulty';
  if (difficulty) {
    const label = document.createElement('span');
    label.className = 'preview-difficulty-label';
    label.textContent = difficulty.label;
    const value = document.createElement('span');
    value.className = 'preview-difficulty-value';
    value.textContent = difficulty.value;
    badge.append(label, ' ', value);
  } else badge.textContent = '—';
  badge.title = badge.textContent;
  if (difficulty) {
    badge.style.backgroundColor = difficulty.background;
    badge.style.color = difficulty.text;
    badge.style.borderColor = difficulty.border ?? difficulty.background;
  }
  row.append(badge);
  if (difficulty?.identity) {
    const identity = document.createElement('span');
    identity.className = 'preview-identity';
    identity.textContent = difficulty.identity;
    identity.title = difficulty.identity;
    row.append(identity);
  }
  titleElement.after(row);
}
