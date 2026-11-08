import type { PlayerEventScope } from './event-scope';

export function bindFullscreenControls(events: PlayerEventScope, options: {
  active(): boolean;
  render(visible: boolean): void;
}) {
  let visible = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pointers = new Set<number>();
  let backgroundPress: { id: number; x: number; y: number } | null = null;
  const hide = () => { clearTimeout(timer); visible = false; options.render(false); };
  const show = () => {
    clearTimeout(timer);
    visible = true;
    options.render(true);
    if (options.active() && pointers.size === 0) timer = setTimeout(hide, 5000);
  };
  const isControl = (target: EventTarget | null) => target instanceof Element
    && !!target.closest('#controls,#fs-overlay,#fs-lock,button,input,[role="slider"],[tabindex]');
  events.listen(document, 'pointerdown', event => {
    if (!options.active()) return;
    pointers.add(event.pointerId);
    clearTimeout(timer);
    backgroundPress = pointers.size > 1 || isControl(event.target) ? null : { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, true);
  events.listen(document, 'pointermove', event => {
    if (backgroundPress?.id === event.pointerId
      && Math.hypot(event.clientX - backgroundPress.x, event.clientY - backgroundPress.y) >= 8) backgroundPress = null;
  }, true);
  events.listen(document, 'pointerup', event => {
    pointers.delete(event.pointerId);
    if (!options.active()) return;
    const press = backgroundPress;
    backgroundPress = null;
    if (press?.id === event.pointerId && !isControl(event.target)
      && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 8) {
      if (visible) hide(); else show();
    } else if (visible) show();
  }, true);
  events.listen(document, 'pointercancel', event => {
    pointers.delete(event.pointerId);
    backgroundPress = null;
    if (visible) show();
  }, true);
  events.listen(document, 'keydown', event => {
    if (options.active() && isControl(event.target)) show();
  });
  events.own(() => clearTimeout(timer));
  return { show, hide };
}
