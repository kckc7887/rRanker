/**
 * 谱面确认 RN 壳与 WebView 播放器之间的桥接合同（纯函数，不拉取 react-native、不触碰 DOM）：
 * 宿主命令与播放器事件各自是小型判别联合，载荷显式类型化，宿主不猜任意顶层字段。
 * 四套播放器（舞萌、Phigros、osu!、Rizline）实现同一份宿主合同：
 * 暂停（手动按钮或宿主生命周期）只停播并释放临时媒体、不改变全屏；
 * 退出全屏只由显式命令或播放器自己的按钮驱动；释放停播并退出全屏、幂等；
 * 确认事件只回执给发起过询问的播放器。渲染器与引擎差异留在各自播放器内。
 * 播放器与本壳一起构建，不做版本协商：旧 `ready` 无需载荷，旧扁平 `settings` 按下面的
 * 规则归一化成同一份 `settings` 载荷。
 */

/** 暂停原因：手动（播放器自身按钮）与生命周期（宿主 inactive）都只停播，不改变全屏。 */
export type ChartPreviewPauseCause = 'manual' | 'lifecycle';

/** 宿主（RN 公共壳与游戏屏幕）发给播放器的命令。 */
export type ChartPreviewHostCommand =
  /** 暂停：停播并释放临时媒体，保持当前全屏状态。 */
  | { type: 'pause'; cause: ChartPreviewPauseCause }
  /** 设置全屏：宿主显式要求退出全屏；进入全屏只由播放器自己的按钮发起。 */
  | { type: 'exit-fullscreen' }
  /** 释放：停播、退出全屏、回收资源，幂等；此后播放器不再改动界面或回报状态。 */
  | { type: 'dispose' }
  /** 确认事件回执：宿主对播放器询问的回答（目前只有视频背景确认）。 */
  | { type: 'background-video-confirmation-result'; accepted: boolean };

export type ChartPreviewBackgroundVideoErrorCode = 'network' | 'no_data' | 'cancelled' | 'unknown';

/** 播放器（WebView）发给宿主的事件。 */
export type ChartPreviewPlayerEvent =
  | { type: 'progress'; label?: string; value?: number }
  | { type: 'ready' }
  | { type: 'fullscreen'; active: boolean }
  | { type: 'settings'; settings: Record<string, unknown> }
  | {
      type: 'background-video';
      result: 'success' | 'error';
      status?: number;
      errorCode?: ChartPreviewBackgroundVideoErrorCode;
    }
  | { type: 'background-video-confirmation' }
  | { type: 'error'; message?: string; diagnostic?: string };

/** 未在公共合同中声明、由游戏侧自行解释的消息：公共壳只透传给游戏钩子。 */
export type ChartPreviewExtensionMessage = { type: string; [key: string]: unknown };

export type ChartPreviewBridgeMessage = ChartPreviewPlayerEvent | ChartPreviewExtensionMessage;

/** 播放器侧生命周期实现：合同动作由公共层派生，具体回收动作留在各自引擎。 */
export type ChartPreviewPlayerHandlers = {
  /** 暂停：只停播并释放临时媒体，不得改变全屏状态。 */
  pause: (cause: ChartPreviewPauseCause) => void;
  /** 退出全屏。 */
  exitFullscreen: () => void;
  /** 释放：停播、退出全屏、回收资源，幂等。 */
  dispose: () => void;
  /** 只有发起过确认询问的播放器需要实现（目前是视频背景确认）。 */
  confirm?: (accepted: boolean) => void;
};

const SETTINGS_RESERVED_KEYS = new Set(['type', 'message', 'active']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBackgroundVideoErrorCode(value: unknown): value is ChartPreviewBackgroundVideoErrorCode {
  return value === 'network' || value === 'no_data' || value === 'cancelled' || value === 'unknown';
}

/** 旧播放器把设置键平铺在顶层：去掉桥接保留键后作为设置载荷；新播放器使用 `settings` 信封。 */
function readSettingsEvent(message: Record<string, unknown>): ChartPreviewPlayerEvent | null {
  if ('settings' in message) {
    return isPlainObject(message.settings) ? { type: 'settings', settings: message.settings } : null;
  }
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(message)) {
    if (SETTINGS_RESERVED_KEYS.has(key)) continue;
    settings[key] = value;
  }
  return { type: 'settings', settings };
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

function readPlayerEvent(parsed: unknown): ChartPreviewBridgeMessage | null {
  if (!isPlainObject(parsed)) return null;
  const type = parsed.type;
  if (typeof type !== 'string' || type.length === 0) return null;
  switch (type) {
    case 'progress':
      return {
        type,
        ...(typeof parsed.label === 'string' ? { label: parsed.label } : {}),
        ...(typeof parsed.value === 'number' && Number.isFinite(parsed.value) ? { value: parsed.value } : {}),
      };
    case 'ready':
      // 旧 ready 不带任何载荷，不需要版本协商；就绪等待仍由壳的超时约束。
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
      return { ...parsed, type };
  }
}

export function parseChartPreviewBridgeMessage(raw: string): ChartPreviewBridgeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return readPlayerEvent(parsed);
}

/** 判别联合守卫：声明过的类型一定携带该事件的载荷，扩展消息按游戏侧解释。 */
export function isChartPreviewPlayerEvent<K extends ChartPreviewPlayerEvent['type']>(
  message: ChartPreviewBridgeMessage,
  type: K,
): message is Extract<ChartPreviewPlayerEvent, { type: K }> {
  return message.type === type;
}

function readMessageObject(raw: unknown): Record<string, unknown> | null {
  if (isPlainObject(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    // 旧播放器也曾发送裸类型名（'stop' / 'exit-fullscreen'）。
    return null;
  }
}

/** 解析宿主命令：只接受合同声明的类型与载荷，缺省的判别字段不会被猜测。 */
export function parseChartPreviewHostCommand(raw: unknown): ChartPreviewHostCommand | null {
  const literal = typeof raw === 'string' && (raw === 'stop' || raw === 'exit-fullscreen') ? raw : null;
  const message = readMessageObject(raw);
  const type = literal ?? (message === null ? null : message.type);
  switch (type) {
    case 'pause': {
      const cause = message?.cause;
      return cause === 'manual' || cause === 'lifecycle' ? { type: 'pause', cause } : null;
    }
    // 旧命令别名：语义与生命周期暂停一致（浏览器检查脚本仍在使用）。
    case 'stop':
      return { type: 'pause', cause: 'lifecycle' };
    case 'exit-fullscreen':
      return { type: 'exit-fullscreen' };
    case 'dispose':
      return { type: 'dispose' };
    case 'background-video-confirmation-result': {
      const accepted = message?.accepted;
      return typeof accepted === 'boolean' ? { type, accepted } : null;
    }
    default:
      return null;
  }
}

/**
 * 按同一份合同分派宿主命令：四套播放器只提供各自的实现，命令序列由公共层决定。
 * 返回是否识别该消息。
 */
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

export function chartPreviewPlayerMessageScript(message: Record<string, unknown>): string {
  const serialized = JSON.stringify(message).replace(/</g, '\\u003c');
  return `window.postMessage(${serialized}, '*');true;`;
}

export function chartPreviewExitFullscreenScript(): string {
  return `window.postMessage({type:'exit-fullscreen'}, '*');true;`;
}

/** 旧命令脚本：解析层等价于生命周期暂停，保留给既有导出链与浏览器检查脚本。 */
export function chartPreviewStopScript(): string {
  return `window.postMessage({type:'stop'}, '*');true;`;
}

/** 宿主命令的唯一序列化入口；退出全屏沿用既有单引号线格式。 */
export function chartPreviewHostCommandScript(command: ChartPreviewHostCommand): string {
  switch (command.type) {
    case 'exit-fullscreen':
      return chartPreviewExitFullscreenScript();
    case 'pause':
      return chartPreviewPlayerMessageScript({ type: 'pause', cause: command.cause });
    case 'dispose':
      return chartPreviewPlayerMessageScript({ type: 'dispose' });
    case 'background-video-confirmation-result':
      return chartPreviewPlayerMessageScript({ type: 'background-video-confirmation-result', accepted: command.accepted });
  }
}
