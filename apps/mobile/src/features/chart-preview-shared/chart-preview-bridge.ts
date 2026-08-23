/**
 * 谱面确认 RN 壳与 WebView 播放器之间的桥接公共层（纯函数，不拉取 react-native）：
 * 桥接消息只约定跨游戏稳定的 type / message / active 语义，其余键为各游戏
 * 播放器设置键值；游戏专属设置字段由游戏侧在各自桥接类型上扩展。
 */

export type ChartPreviewBridgeMessage = {
  type?: string;
  message?: string;
  active?: boolean;
  [key: string]: unknown;
};

export function parseChartPreviewBridgeMessage(raw: string): ChartPreviewBridgeMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object'
      ? parsed as ChartPreviewBridgeMessage
      : null;
  } catch {
    return null;
  }
}

export function chartPreviewStopScript(): string {
  return `window.postMessage({type:'stop'}, '*');true;`;
}

export function chartPreviewExitFullscreenScript(): string {
  return `window.postMessage({type:'exit-fullscreen'}, '*');true;`;
}

export function chartPreviewPlayerMessageScript(message: Record<string, unknown>): string {
  const serialized = JSON.stringify(message).replace(/</g, '\\u003c');
  return `window.postMessage(${serialized}, '*');true;`;
}
