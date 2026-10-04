import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  applyChartPreviewHostCommand,
  chartPreviewHostCommandScript,
  type ChartPreviewHostCommand,
  parseChartPreviewBridgeMessage,
  parseChartPreviewHostCommand,
  type ChartPreviewPlayerHandlers,
} from '@/features/chart-preview-shared/chart-preview-bridge';

describe('谱面确认宿主命令', () => {
  it('将宿主命令交给播放器并拒绝未知消息', () => {
    const handlers: ChartPreviewPlayerHandlers = {
      pause: vi.fn(), exitFullscreen: vi.fn(), dispose: vi.fn(), confirm: vi.fn(),
    };
    const send = (command: ChartPreviewHostCommand) => runInNewContext(chartPreviewHostCommandScript(command), {
      window: { postMessage: (message: unknown) => applyChartPreviewHostCommand(message, handlers) },
    });
    send({ type: 'pause', cause: 'manual' });
    expect(handlers.pause).toHaveBeenCalledWith('manual');
    send({ type: 'exit-fullscreen' });
    expect(handlers.exitFullscreen).toHaveBeenCalled();
    send({ type: 'dispose' });
    expect(handlers.dispose).toHaveBeenCalled();
    send({ type: 'background-video-confirmation-result', accepted: false });
    expect(handlers.confirm).toHaveBeenCalledWith(false);
    expect(applyChartPreviewHostCommand({ type: 'play' }, handlers)).toBe(false);
  });
  it('解析宿主命令：暂停原因、退出全屏、释放与确认事件各自判别', () => {
    expect(parseChartPreviewHostCommand({ type: 'pause', cause: 'lifecycle' }))
      .toEqual({ type: 'pause', cause: 'lifecycle' });
    expect(parseChartPreviewHostCommand({ type: 'pause', cause: 'manual' }))
      .toEqual({ type: 'pause', cause: 'manual' });
    expect(parseChartPreviewHostCommand('stop')).toBeNull();
    expect(parseChartPreviewHostCommand(JSON.stringify({ type: 'stop' }))).toBeNull();
    expect(parseChartPreviewHostCommand(JSON.stringify({ type: 'exit-fullscreen' })))
      .toEqual({ type: 'exit-fullscreen' });
    expect(parseChartPreviewHostCommand({ type: 'dispose' })).toEqual({ type: 'dispose' });
    expect(parseChartPreviewHostCommand({ type: 'background-video-confirmation-result', accepted: false }))
      .toEqual({ type: 'background-video-confirmation-result', accepted: false });
  });

  it('拒绝未在合同中声明的命令与不合规载荷，不猜测缺省值', () => {
    expect(parseChartPreviewHostCommand({ type: 'pause' })).toBeNull();
    expect(parseChartPreviewHostCommand({ type: 'pause', cause: 'user' })).toBeNull();
    expect(parseChartPreviewHostCommand({ type: 'play' })).toBeNull();
    expect(parseChartPreviewHostCommand({ type: 'background-video-confirmation-result' })).toBeNull();
    expect(parseChartPreviewHostCommand({ type: 'background-video-confirmation-result', accepted: 'yes' })).toBeNull();
    expect(parseChartPreviewHostCommand('pause')).toBeNull();
    expect(parseChartPreviewHostCommand(null)).toBeNull();
    expect(parseChartPreviewHostCommand(7)).toBeNull();
  });

  it('播放器事件载荷显式类型化：宿主读取声明字段，不再解释任意顶层键', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseChartPreviewBridgeMessage('{"type":"fullscreen","active":true}'))
      .toEqual({ type: 'fullscreen', active: true });
    expect(parseChartPreviewBridgeMessage('{"type":"progress","label":"正在准备播放器…","value":0.5}'))
      .toEqual({ type: 'progress', label: '正在准备播放器…', value: 0.5 });
    expect(parseChartPreviewBridgeMessage('{"type":"progress","label":7,"value":"x"}'))
      .toEqual({ type: 'progress' });
    expect(parseChartPreviewBridgeMessage('{"type":"error","message":"播放失败","diagnostic":"stack"}'))
      .toEqual({ type: 'error', message: '播放失败', diagnostic: 'stack' });
    expect(parseChartPreviewBridgeMessage(
      '{"type":"background-video","result":"error","status":4,"errorCode":"no_data"}',
    )).toEqual({ type: 'background-video', result: 'error', status: 4, errorCode: 'no_data' });
    expect(parseChartPreviewBridgeMessage('{"type":"background-video","result":"unknown"}')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{"type":"background-video-confirmation"}'))
      .toEqual({ type: 'background-video-confirmation' });
  });

  it('设置事件只接受 settings 信封', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"settings","settings":{"hiSpeed":7.5,"backgroundMode":"video"}}'))
      .toEqual({ type: 'settings', settings: { hiSpeed: 7.5, backgroundMode: 'video' } });
    expect(parseChartPreviewBridgeMessage('{"type":"settings","hiSpeed":7.5,"active":false,"message":"ignored"}')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{"type":"settings","settings":"broken"}')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{"type":"settings","settings":null}')).toBeNull();
  });

  it('未声明的消息与非法载荷返回 null', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"confirmation","result":"ok"}')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{"result":"ok"}')).toBeNull();
    expect(parseChartPreviewBridgeMessage('"fullscreen"')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{')).toBeNull();
  });
});
