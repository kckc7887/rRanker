import { createLatestFrameScheduler } from './frame-scheduler';
import { PlayerEventScope } from './event-scope';

export type WheelControl = {
  getValue: () => number;
  setValue: (value: number, notify?: boolean) => void;
  flush: () => void;
  dispose: () => void;
};

let activePopupClose: (() => void) | null = null;
const inlineControls = new Set<() => void>();

export function closeActiveWheelPopup(): void {
  activePopupClose?.();
  for (const close of inlineControls) close();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const WHEEL_ITEM_HEIGHT = 28;

function buildWheelValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let index = 0; min + index * step <= max + 1e-9; index += 1) {
    values.push(Number((min + index * step).toFixed(8)));
  }
  return values;
}

export function createWheel(
  viewport: HTMLElement,
  list: HTMLElement,
  onPreview: (value: number) => void,
  onCommit: (value: number) => void,
  min: number,
  max: number,
  step: number,
  initial: number,
  labels?: readonly string[],
  format?: (value: number) => string,
): WheelControl {
  const values = buildWheelValues(min, max, step);
  let current = values.includes(initial) ? initial : values[0] ?? min;
  let settleTimer = 0;
  let selectedItem: HTMLElement | null = null;
  let pendingCommit = false;
  let disposed = false;
  const previewScheduler = createLatestFrameScheduler(
    requestAnimationFrame,
    cancelAnimationFrame,
    onPreview,
  );

  const itemLabel = (v: number) => {
    if (labels) {
      const i = values.indexOf(v);
      return labels[i] ?? String(v);
    }
    return format ? format(v) : v.toFixed(1);
  };

  const refreshList = () => {
    const items = values.map((value) => {
        const item = document.createElement('div');
        item.className = 'wheel-item';
        item.dataset.value = String(value);
        item.textContent = itemLabel(value);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', value === current ? 'true' : 'false');
        if (value === current) selectedItem = item;
        return item;
      });
    list.replaceChildren(...items);
  };

  refreshList();

  const indexOf = (value: number) =>
    Math.max(0, values.findIndex((item) => Math.abs(item - value) < 1e-9));

  const applySelection = (value: number, notify: boolean) => {
    current = value;
    selectedItem?.setAttribute('aria-selected', 'false');
    selectedItem = list.children[indexOf(value)] as HTMLElement | null;
    selectedItem?.setAttribute('aria-selected', 'true');
    if (notify) { pendingCommit = true; previewScheduler.schedule(value); }
  };

  const scrollToValue = (value: number, behavior: ScrollBehavior = 'auto') => {
    const index = indexOf(value);
    viewport.scrollTo({ top: index * WHEEL_ITEM_HEIGHT, behavior });
  };

  const valueFromScroll = () => {
    const index = clamp(Math.round(viewport.scrollTop / WHEEL_ITEM_HEIGHT), 0, values.length - 1);
    return values[index]!;
  };

  const setValue = (value: number, notify = false) => {
    if (disposed) return;
    const next = values[indexOf(value)] ?? values[0] ?? min;
    applySelection(next, notify);
    scrollToValue(next);
  };

  const flush = () => {
    if (disposed) return;
    window.clearTimeout(settleTimer);
    previewScheduler.flush();
    if (pendingCommit) { pendingCommit = false; onCommit(current); }
  };
  const onScroll = () => {
    if (disposed) return;
    const next = valueFromScroll();
    if (Math.abs(next - current) > 1e-9) applySelection(next, true);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      const settled = valueFromScroll();
      scrollToValue(settled, 'smooth');
      flush();
    }, 120);
  };
  viewport.addEventListener('scroll', onScroll, { passive: true });

  scrollToValue(current);
  applySelection(current, false);

  return {
    getValue: () => current, setValue, flush,
    dispose() {
      disposed = true;
      previewScheduler.cancel();
      window.clearTimeout(settleTimer);
      viewport.removeEventListener('scroll', onScroll);
    },
  };
}

export function setupWheelPopup(
  trigger: HTMLElement,
  popup: HTMLElement,
  viewport: HTMLElement,
  list: HTMLElement,
  valSpan: HTMLElement,
  onPreview: (value: number) => void,
  onCommit: (value: number) => void,
  min: number,
  max: number,
  step: number,
  initial: number,
  labels?: readonly string[],
  format?: (value: number) => string,
): WheelControl {
  if (trigger.dataset.presentation === 'inline') {
    popup.hidden = true;
    return setupInlineParameter(trigger, valSpan, onPreview, onCommit, min, max, step, initial, labels, format);
  }
  const wheel = createWheel(viewport, list, (value) => {
    valSpan.textContent = labels ? (labels[value] ?? String(value)) : format ? format(value) : value.toFixed(1);
    onPreview(value);
  }, onCommit, min, max, step, initial, labels, format);

  let open = false;

  const openPopup = () => {
    activePopupClose?.();
    open = true;
    popup.style.visibility = '';
    popup.style.pointerEvents = '';
    const triggerRect = trigger.getBoundingClientRect();
    popup.style.bottom = `${window.innerHeight - triggerRect.top + 4}px`;
    popup.style.left = `${triggerRect.left + triggerRect.width / 2}px`;
    popup.style.transform = 'translateX(-50%)';
    wheel.setValue(wheel.getValue());
    activePopupClose = closePopup;
  };

  const closePopup = () => {
    wheel.flush();
    open = false;
    popup.style.visibility = 'hidden';
    popup.style.pointerEvents = 'none';
    if (activePopupClose === closePopup) activePopupClose = null;
  };

  const onTriggerClick = (event: Event) => {
    event.stopPropagation();
    if (open) closePopup();
    else openPopup();
  };
  const onDocumentClick = () => { if (open) closePopup(); };
  const stopPropagation = (event: Event) => event.stopPropagation();
  trigger.addEventListener('click', onTriggerClick);
  document.addEventListener('click', onDocumentClick);
  popup.addEventListener('click', stopPropagation);
  popup.addEventListener('touchstart', stopPropagation);

  valSpan.textContent = labels ? (labels[Math.round(initial)] ?? String(initial)) : format ? format(initial) : initial.toFixed(1);

  return {
    getValue: wheel.getValue,
    flush: wheel.flush,
    setValue: (value, notify = false) => {
      valSpan.textContent = labels ? (labels[Math.round(value)] ?? String(value)) : format ? format(value) : value.toFixed(1);
      wheel.setValue(value, notify);
    },
    dispose() {
      wheel.dispose();
      closePopup();
      trigger.removeEventListener('click', onTriggerClick);
      document.removeEventListener('click', onDocumentClick);
      popup.removeEventListener('click', stopPropagation);
      popup.removeEventListener('touchstart', stopPropagation);
    },
  };
}

function setupInlineParameter(
  trigger: HTMLElement, valueLabel: HTMLElement,
  onPreview: (value: number) => void, onCommit: (value: number) => void,
  min: number, max: number, step: number, initial: number,
  labels?: readonly string[], format?: (value: number) => string,
): WheelControl {
  const values = buildWheelValues(min, max, step);
  const indexOf = (value: number) => clamp(Math.round((value - min) / step), 0, values.length - 1);
  let current = indexOf(initial);
  let disposed = false;
  let pending = false;
  let timer = 0;
  const events = new PlayerEventScope(() => disposed);
  const scheduler = createLatestFrameScheduler(requestAnimationFrame, cancelAnimationFrame, onPreview);
  const field = trigger.closest<HTMLElement>('.field');
  const labelNodes = field ? Array.from(field.childNodes).filter(node =>
    node.nodeType === 3 || (node instanceof HTMLElement && node.tagName === 'SPAN')) : [];
  const label = labelNodes.map(node => node.textContent?.trim()).filter(Boolean).join(' ')
    || trigger.getAttribute('aria-label') || '参数';
  const hiddenLabel = document.createElement('span');
  hiddenLabel.hidden = true;
  hiddenLabel.append(...labelNodes);
  field?.append(hiddenLabel);
  trigger.classList.add('parameter-control');
  trigger.dataset.enum = String(!!labels);
  trigger.setAttribute('role', 'slider');
  trigger.setAttribute('aria-label', label);
  trigger.setAttribute('aria-orientation', 'horizontal');
  trigger.setAttribute('aria-valuemin', String(min));
  trigger.setAttribute('aria-valuemax', String(max));
  const head = document.createElement('span');
  head.className = 'parameter-head';
  const name = document.createElement('span');
  name.className = 'parameter-label';
  name.textContent = label;
  valueLabel.classList.add('parameter-value');
  head.append(name, valueLabel);
  const rail = document.createElement('span');
  rail.className = 'parameter-rail';
  rail.setAttribute('aria-hidden', 'true');
  const options = document.createElement('span');
  options.className = 'parameter-options';
  if (labels) {
    for (const [index, text] of labels.entries()) {
      const option = document.createElement('span');
      option.dataset.index = String(index);
      option.textContent = text;
      options.append(option);
    }
    rail.append(options);
  } else {
    for (const className of ['parameter-ticks', 'parameter-cursor']) {
      const part = document.createElement('span');
      part.className = className;
      rail.append(part);
    }
  }
  trigger.replaceChildren(head, rail);
  const refresh = () => {
    const value = values[current]!;
    const text = labels?.[current] ?? (format ? format(value) : value.toFixed(1));
    valueLabel.textContent = text;
    trigger.setAttribute('aria-valuenow', String(value));
    trigger.setAttribute('aria-valuetext', text);
    trigger.style.setProperty('--parameter-position', `${values.length > 1 ? current / (values.length - 1) * 100 : 0}%`);
    Array.from(options.children).forEach((option, index) => option.classList.toggle('selected', index === current));
  };
  const flush = () => {
    if (disposed) return;
    window.clearTimeout(timer);
    scheduler.flush();
    if (pending) { pending = false; onCommit(values[current]!); }
  };
  const setValue = (value: number, notify = false) => {
    if (disposed || !Number.isFinite(value)) return;
    current = indexOf(value);
    refresh();
    if (notify) {
      pending = true;
      scheduler.schedule(values[current]!);
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 120);
    }
  };
  const enabled = () => !(trigger instanceof HTMLButtonElement && trigger.disabled) && !field?.hidden;
  const choose = (index: number) => {
    const next = clamp(Math.round(index), 0, values.length - 1);
    if (enabled() && current !== next) setValue(values[next]!, true);
  };
  type Gesture = { id: number; x: number; y: number; index: number; axis: 'pending' | 'horizontal' | 'vertical'; rail: boolean; option?: number };
  let gesture: Gesture | null = null;
  const endGesture = () => {
    const id = gesture?.id;
    gesture = null;
    trigger.classList.remove('is-dragging');
    if (id !== undefined && trigger.hasPointerCapture?.(id)) trigger.releasePointerCapture(id);
  };
  events.listen(trigger, 'keydown', event => {
    if (!enabled() || event.altKey || event.ctrlKey || event.metaKey) return;
    const jump = labels ? 1 : Math.max(1, Math.round((values.length - 1) / 10));
    const targets: Record<string, number> = {
      ArrowRight: current + 1, ArrowUp: current + 1, ArrowLeft: current - 1, ArrowDown: current - 1,
      Home: 0, End: values.length - 1, PageUp: current + jump, PageDown: current - jump,
    };
    if (event.key in targets) {
      event.preventDefault(); event.stopPropagation(); choose(targets[event.key]!);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
    }
  });
  events.listen(trigger, 'pointerdown', event => {
    if (!enabled() || event.isPrimary === false || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const option = target?.closest<HTMLElement>('[data-index]');
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, index: current, axis: 'pending',
      rail: !!target?.closest('.parameter-rail'), ...(option ? { option: Number(option.dataset.index) } : {}) };
    trigger.focus({ preventScroll: true });
    if (event.pointerType !== 'touch') event.preventDefault();
  });
  events.listen(window, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (gesture.axis === 'pending') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) { gesture.axis = 'vertical'; return; }
      gesture.axis = 'horizontal';
      trigger.classList.add('is-dragging');
      trigger.setPointerCapture?.(event.pointerId);
    }
    if (gesture.axis !== 'horizontal') return;
    if (event.cancelable) event.preventDefault();
    const pixels = labels ? Math.max(28, rail.getBoundingClientRect().width / Math.max(2, values.length)) : 4;
    choose(gesture.index + Math.round(dx / pixels));
  }, { passive: false });
  events.listen(window, 'pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (gesture.axis === 'pending' && gesture.rail) {
      const rect = rail.getBoundingClientRect();
      choose(gesture.option ?? (event.clientX - rect.left) / Math.max(1, rect.width) * (values.length - 1));
    }
    endGesture();
    flush();
  });
  events.listen(window, 'pointercancel', event => {
    if (gesture?.id === event.pointerId) { endGesture(); flush(); }
  });
  events.listen(trigger, 'lostpointercapture', endGesture);
  const close = () => { endGesture(); flush(); };
  inlineControls.add(close);
  refresh();
  return {
    getValue: () => values[current]!, setValue, flush,
    dispose() {
      endGesture();
      disposed = true;
      inlineControls.delete(close);
      events.dispose();
      window.clearTimeout(timer);
      scheduler.cancel();
    },
  };
}
