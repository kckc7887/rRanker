export type ChartPreviewPauseCause = 'manual' | 'lifecycle';

export type ChartPreviewHostCommand =
  | { type: 'pause'; cause: ChartPreviewPauseCause }
  | { type: 'exit-fullscreen' }
  | { type: 'dispose' }
  | { type: 'background-video-confirmation-result'; accepted: boolean };

export type ChartPreviewBackgroundVideoErrorCode = 'network' | 'no_data' | 'cancelled' | 'unknown';

export type ChartPreviewPlayerEvent =
  | { type: 'progress'; label?: string; value?: number }
  | { type: 'ready' }
  | { type: 'fullscreen'; active: boolean }
  | { type: 'settings'; settings: Record<string, unknown>; committed?: boolean }
  | {
      type: 'background-video';
      result: 'success' | 'error';
      status?: number;
      errorCode?: ChartPreviewBackgroundVideoErrorCode;
    }
  | { type: 'background-video-confirmation' }
  | { type: 'error'; message?: string; diagnostic?: string };

export type ChartPreviewPlayerHandlers = {
  pause: (cause: ChartPreviewPauseCause) => void;
  exitFullscreen: () => void;
  dispose: () => void;
  confirm?: (accepted: boolean) => void;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBackgroundVideoErrorCode(value: unknown): value is ChartPreviewBackgroundVideoErrorCode {
  return value === 'network' || value === 'no_data' || value === 'cancelled' || value === 'unknown';
}

function readSettingsEvent(message: Record<string, unknown>): ChartPreviewPlayerEvent | null {
  if (!isPlainObject(message.settings) || ('committed' in message && typeof message.committed !== 'boolean')) return null;
  return { type: 'settings', settings: message.settings,
    ...(typeof message.committed === 'boolean' ? { committed: message.committed } : {}) };
}

function readBackgroundVideoEvent(message: Record<string, unknown>): ChartPreviewPlayerEvent | null {
  const result = message.result;
  if (result !== 'success' && result !== 'error') return null;
  const status = typeof message.status === 'number' && Number.isInteger(message.status)
    && message.status >= 0 && message.status <= 4 ? message.status : undefined;
  const errorCode = isBackgroundVideoErrorCode(message.errorCode) ? message.errorCode : undefined;
  return {
    type: 'background-video',
    result,
    ...(status === undefined ? {} : { status }),
    ...(errorCode === undefined ? {} : { errorCode }),
  };
}

function readPlayerEvent(parsed: unknown): ChartPreviewPlayerEvent | null {
  if (!isPlainObject(parsed)) return null;
  const type = parsed.type;
  switch (type) {
    case 'progress':
      return {
        type,
        ...(typeof parsed.label === 'string' ? { label: parsed.label } : {}),
        ...(typeof parsed.value === 'number' && Number.isFinite(parsed.value) ? { value: parsed.value } : {}),
      };
    case 'ready':
      return { type };
    case 'fullscreen':
      return typeof parsed.active === 'boolean' ? { type, active: parsed.active } : null;
    case 'settings':
      return readSettingsEvent(parsed);
    case 'background-video':
      return readBackgroundVideoEvent(parsed);
    case 'background-video-confirmation':
      return { type };
    case 'error':
      return {
        type,
        ...(typeof parsed.message === 'string' ? { message: parsed.message } : {}),
        ...(typeof parsed.diagnostic === 'string' ? { diagnostic: parsed.diagnostic } : {}),
      };
    default:
      return null;
  }
}

export function parseChartPreviewBridgeMessage(raw: string): ChartPreviewPlayerEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return readPlayerEvent(parsed);
}

function readMessageObject(raw: unknown): Record<string, unknown> | null {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseChartPreviewHostCommand(raw: unknown): ChartPreviewHostCommand | null {
  const message = readMessageObject(raw);
  if (!message) return null;
  switch (message.type) {
    case 'pause': {
      const cause = message.cause;
      return cause === 'manual' || cause === 'lifecycle' ? { type: 'pause', cause } : null;
    }
    case 'exit-fullscreen':
      return { type: 'exit-fullscreen' };
    case 'dispose':
      return { type: 'dispose' };
    case 'background-video-confirmation-result': {
      const accepted = message.accepted;
      return typeof accepted === 'boolean' ? { type: 'background-video-confirmation-result', accepted } : null;
    }
    default:
      return null;
  }
}

export function applyChartPreviewHostCommand(raw: unknown, player: ChartPreviewPlayerHandlers): boolean {
  const command = parseChartPreviewHostCommand(raw);
  if (command === null) return false;
  switch (command.type) {
    case 'pause':
      player.pause(command.cause);
      return true;
    case 'exit-fullscreen':
      player.exitFullscreen();
      return true;
    case 'dispose':
      player.dispose();
      return true;
    case 'background-video-confirmation-result':
      player.confirm?.(command.accepted);
      return true;
  }
}

export function chartPreviewHostCommandScript(command: ChartPreviewHostCommand): string {
  return `window.postMessage(${JSON.stringify(command)}, '*');true;`;
}
