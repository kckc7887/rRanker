import { PlayerEventScope } from './event-scope';

export function setPreviewPlayButton(button: HTMLElement, playing: boolean): void {
  const label = playing ? '暂停' : '播放';
  if (button.getAttribute('aria-label') === label) return;
  button.setAttribute('aria-label', label);
}

export function setPreviewFullscreen(active: boolean): void {
  const scroll = document.querySelector<HTMLElement>('.preview-scroll');
  if (active && scroll) scroll.dataset.windowScroll = String(scroll.scrollTop);
  document.body.classList.toggle('fullscreen', active);
  if (!active && scroll) scroll.scrollTop = Number(scroll.dataset.windowScroll ?? 0);
}

export function installPreviewControls(stageAspectRatio = 16 / 9): () => void {
  const controls = document.getElementById('controls')!;
  const events = new PlayerEventScope(() => false);

  const settings = controls.querySelector<HTMLElement>('.preview-settings')!;
  const syncSections = () => {
    for (const section of settings.querySelectorAll<HTMLElement>('.preview-section')) {
      const items = Array.from(section.querySelectorAll<HTMLElement>('.field,.toggle'));
      const hidden = items.length > 0 && items.every(item => item.hidden);
      if (section.hidden !== hidden) section.hidden = hidden;
    }
  };
  const observer = new MutationObserver(syncSections);
  observer.observe(settings, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  events.own(() => observer.disconnect());
  syncSections();

  const app = document.getElementById('app')!;
  const header = document.getElementById('header')!;
  const stage = document.getElementById('stage-wrap') ?? document.getElementById('canvas-wrap')!;
  const resize = () => {
    if (document.body.classList.contains('fullscreen')) return;
    const title = document.getElementById('title')!;
    const text = title.firstElementChild as HTMLElement | null;
    const overflow = Math.max(0, (text?.scrollWidth ?? 0) - title.clientWidth);
    title.style.setProperty('--title-offset', `${-overflow}px`);
    title.style.setProperty('--title-duration', `${Math.max(6, overflow / 28 + 3)}s`);
    title.classList.toggle('is-scrolling', overflow > 0);
    const remaining = Math.max(0, app.clientHeight - header.offsetHeight - 32);
    const ratio = stageAspectRatio;
    const height = Math.min(stage.clientWidth / ratio, remaining * 0.55);
    stage.style.setProperty('--preview-stage-height', `${Math.max(1, height)}px`);
    stage.style.setProperty('--preview-stage-width', `${Math.max(1, height * ratio)}px`);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(app);
  resizeObserver.observe(header);
  events.own(() => resizeObserver.disconnect());
  const fullscreenObserver = new MutationObserver(resize);
  fullscreenObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  fullscreenObserver.observe(document.getElementById('title')!, { childList: true, subtree: true });
  events.own(() => fullscreenObserver.disconnect());
  resize();
  return () => events.dispose();
}
