import { createLatestFrameScheduler } from './frame-scheduler';

export type WheelControl = {
  getValue: () => number;
  setValue: (value: number, notify?: boolean) => void;
  dispose: () => void;
};

let activePopupClose: (() => void) | null = null;

export function closeActiveWheelPopup(): void { activePopupClose?.(); }

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const WHEEL_ITEM_HEIGHT = 28;

function buildWheelValues(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let value = min; value <= max + 1e-9; value += step) {
    values.push(Math.round(value * 10) / 10);
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
    if (notify) previewScheduler.schedule(value);
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
    const next = values[indexOf(value)] ?? values[0] ?? min;
    applySelection(next, notify);
    scrollToValue(next);
  };

  const onScroll = () => {
    const next = valueFromScroll();
    if (Math.abs(next - current) > 1e-9) applySelection(next, true);
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      const settled = valueFromScroll();
      previewScheduler.flush();
      scrollToValue(settled, 'smooth');
      onCommit(settled);
    }, 120);
  };
  viewport.addEventListener('scroll', onScroll, { passive: true });

  scrollToValue(current);
  applySelection(current, false);

  return {
    getValue: () => current, setValue,
    dispose() {
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
    setValue: (value, notify = false) => {
      valSpan.textContent = labels ? (labels[Math.round(value)] ?? String(value)) : format ? format(value) : value.toFixed(1);
      wheel.setValue(value, notify);
    },
    dispose() {
      closePopup();
      wheel.dispose();
      trigger.removeEventListener('click', onTriggerClick);
      document.removeEventListener('click', onDocumentClick);
      popup.removeEventListener('click', stopPropagation);
      popup.removeEventListener('touchstart', stopPropagation);
    },
  };
}

