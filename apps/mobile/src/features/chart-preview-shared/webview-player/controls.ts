import { PlayerEventScope } from './event-scope';
import { PREVIEW_CONTROLS_STYLE } from './controls-style';

export interface PreviewControlsOptions {
  measureNavigation?: boolean;
  details?: readonly HTMLElement[];
  sections: readonly string[];
  stageAspectRatio?: number;
}

export function setPreviewFullscreen(active: boolean): void {
  const scroll = document.querySelector<HTMLElement>('.preview-scroll');
  if (active && scroll) scroll.dataset.windowScroll = String(scroll.scrollTop);
  document.body.classList.toggle('fullscreen', active);
  if (!active && scroll) scroll.scrollTop = Number(scroll.dataset.windowScroll ?? 0);
}

export function installPreviewControls(options: PreviewControlsOptions): () => void {
  const controls = document.getElementById('controls')!;
  const events = new PlayerEventScope(() => false);

  const style = document.createElement('style');
  style.textContent = PREVIEW_CONTROLS_STYLE;
  document.head.append(style);
  document.body.classList.add('preview-controls');

  const rows = Array.from(controls.children) as HTMLElement[];
  const time = document.getElementById('time-label')!.closest<HTMLElement>('.row')!;
  const timeline = document.getElementById('timeline-host')!.closest<HTMLElement>('.row')!;
  const transport = controls.querySelector<HTMLElement>('.transport-group')!;
  let loop = controls.querySelector<HTMLElement>('.loop-row');
  if (!loop) {
    loop = document.createElement('div');
    loop.className = 'row loop-row';
    for (const endpoint of ['a', 'b']) {
      const button = document.createElement('button');
      button.id = `btn-loop-${endpoint}`;
      button.type = 'button';
      button.className = 'loop-btn';
      button.textContent = `${endpoint.toUpperCase()} —`;
      loop.append(button);
    }
  }
  time.classList.add('preview-time-row');
  timeline.classList.add('preview-timeline-row');
  transport.classList.add('preview-transport');
  transport.classList.toggle('has-measures', !!options.measureNavigation);
  const heading = document.createElement('div');
  heading.className = 'preview-time-heading';
  const label = document.createElement('span');
  label.className = 'preview-position-label';
  label.textContent = '播放详情';
  heading.append(label);
  time.prepend(heading);
  if (options.measureNavigation) {
    const measure = document.createElement('span');
    measure.className = 'preview-measure';
    measure.textContent = '小节 ';
    measure.append(document.getElementById('timeline-badge')!);
    heading.append(measure);
  }
  controls.append(time);
  if (options.details?.length) {
    const details = document.createElement('div');
    details.className = 'preview-details';
    details.setAttribute('aria-label', '谱面实时信息');
    details.append(...options.details);
    controls.append(details);
  }
  controls.append(timeline, transport);
  if (loop) controls.append(loop);
  const labels: Record<string, string> = {
    'btn-restart': options.measureNavigation ? '本节重播' : '重播',
    'btn-prev-measure': '上一节', 'btn-next-measure': '下一节',
    'btn-step-back': options.measureNavigation ? '退一拍' : '退 5 秒',
    'btn-step-forward': options.measureNavigation ? '进一拍' : '进 5 秒',
    'btn-fullscreen': '全屏',
  };
  for (const [id, text] of Object.entries(labels)) {
    const button = document.getElementById(id);
    if (button) button.dataset.controlLabel = text;
  }
  const settings = document.createElement('section');
  settings.className = 'preview-settings controls-settings';
  settings.setAttribute('aria-label', '参数与效果');
  const title = document.createElement('h2');
  title.textContent = '参数与效果';
  settings.append(title);
  rows.filter(row => ![time, timeline, transport, loop].includes(row)).forEach((row, index) => {
    const section = document.createElement('section');
    section.className = 'preview-section';
    const name = document.createElement('h3');
    name.textContent = options.sections[index] ?? '其他设置';
    section.append(name, row);
    settings.append(section);
  });
  controls.append(settings);
  for (const trigger of settings.querySelectorAll<HTMLElement>('.wheel-trigger')) trigger.dataset.presentation = 'inline';
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
  const scroll = document.createElement('div');
  scroll.className = 'preview-scroll';
  controls.before(scroll);
  scroll.append(controls);
  const resize = () => {
    if (document.body.classList.contains('fullscreen')) return;
    const remaining = Math.max(0, app.clientHeight - header.offsetHeight - 32);
    const ratio = options.stageAspectRatio ?? 16 / 9;
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
  events.own(() => fullscreenObserver.disconnect());
  resize();
  return () => events.dispose();
}
