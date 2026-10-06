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
  const text = document.createElement('span');
  text.textContent = title;
  titleElement.replaceChildren(text);
  titleElement.title = title;
  document.querySelector('.preview-heading-badges')?.remove();
  const row = document.createElement('div');
  row.className = 'preview-heading-badges';
  const badge = document.createElement('span');
  badge.className = 'preview-difficulty';
  const value = document.createElement('span');
  value.className = 'preview-difficulty-value';
  value.textContent = difficulty?.value || '—';
  badge.append(value);
  badge.title = badge.textContent;
  if (difficulty) {
    badge.style.backgroundColor = difficulty.background;
    badge.style.color = difficulty.text;
    badge.style.borderColor = difficulty.border ?? difficulty.background;
  }
  row.append(badge);
  titleElement.after(row);
}
