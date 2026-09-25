/**
 * 谱面确认宿主命令合同（四套播放器共用）：
 * 同一组宿主命令在舞萌、Phigros、osu! 与 Rizline 上必须产生同一份约定的命令序列——
 * 暂停（手动或生命周期）只停播、不改变全屏；退出全屏由显式命令驱动；
 * 释放停播并退出全屏且幂等；确认事件只回执给发起过询问的播放器。
 * 桥接载荷显式类型化：宿主不再猜任意顶层字段，旧 ready/settings 有明确定义的处理。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  applyChartPreviewHostCommand,
  chartPreviewExitFullscreenScript,
  chartPreviewHostCommandScript,
  chartPreviewPlayerMessageScript,
  isChartPreviewPlayerEvent,
  parseChartPreviewBridgeMessage,
  parseChartPreviewHostCommand,
  type ChartPreviewPlayerHandlers,
} from '@/features/chart-preview-shared/chart-preview-bridge';

const ADAPTER_FILES = {
  simai: 'src/features/simai-chart-preview/webview-player/main.ts',
  phigros: 'src/features/phigros-chart-preview/webview-player/main.ts',
  osu: 'src/features/osu-chart-preview/webview-player/main.ts',
  rizline: 'src/features/rizline-chart-preview/webview-player/main.ts',
} as const;
type AdapterId = keyof typeof ADAPTER_FILES;

function adapterSource(id: AdapterId): string {
  return readFileSync(resolve(process.cwd(), ADAPTER_FILES[id]), 'utf8');
}

/** 取出函数体（`function name(...) {}` 或 `const name = (...) => {}`），用于核对生命周期实现。 */
function functionBody(source: string, name: string): string {
  const start = Math.max(
    source.indexOf(`function ${name}(`),
    source.indexOf(`const ${name} = (`),
    source.indexOf(`const ${name} = ()`),
  );
  expect(start, `未找到 ${name}`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`${name} 函数体未闭合`);
}

/**
 * 四套播放器共用的生命周期实现形状：合同动作与引擎差异分开记录，
 * 因此可以比较四套 adapter 的合同命令序列是否一致。
 */
function createAdapter(id: AdapterId) {
  const actions: string[] = [];
  const engineActions: string[] = [];
  const events: unknown[] = [];
  const state = { playing: true, fullscreen: true, disposed: false, confirmed: null as boolean | null };
  const exitFullscreen = () => {
    actions.push('exit-fullscreen');
    if (!state.fullscreen) return;
    state.fullscreen = false;
    events.push({ type: 'fullscreen', active: false });
  };
  const applyPause = (cause: string) => {
    actions.push(`pause:${cause}`);
    state.playing = false;
    if (id === 'simai') engineActions.push('release-background-video');
  };
  const handlers: ChartPreviewPlayerHandlers = {
    pause: (cause) => applyPause(cause),
    exitFullscreen,
    dispose: () => {
      if (state.disposed) return;
      applyPause('dispose');
      exitFullscreen();
      actions.push('dispose');
      state.disposed = true;
    },
    ...(id === 'simai'
      ? { confirm: (accepted: boolean) => { actions.push(`confirm:${accepted}`); state.confirmed = accepted; } }
      : {}),
  };
  return { actions, engineActions, events, state, handlers };
}

const ADAPTER_IDS = Object.keys(ADAPTER_FILES) as AdapterId[];

const COMMAND_SEQUENCES: readonly {
  label: string;
  command: unknown;
  actions: string[];
  state: { playing: boolean; fullscreen: boolean; disposed: boolean };
}[] = [
  {
    label: '生命周期暂停',
    command: { type: 'pause', cause: 'lifecycle' },
    actions: ['pause:lifecycle'],
    state: { playing: false, fullscreen: true, disposed: false },
  },
  {
    label: '手动暂停',
    command: { type: 'pause', cause: 'manual' },
    actions: ['pause:manual'],
    state: { playing: false, fullscreen: true, disposed: false },
  },
  {
    label: '旧 stop 命令（生命周期暂停别名）',
    command: { type: 'stop' },
    actions: ['pause:lifecycle'],
    state: { playing: false, fullscreen: true, disposed: false },
  },
  {
    label: '设置全屏为 false',
    command: { type: 'exit-fullscreen' },
    actions: ['exit-fullscreen'],
    state: { playing: true, fullscreen: false, disposed: false },
  },
  {
    label: '释放',
    command: { type: 'dispose' },
    actions: ['pause:dispose', 'exit-fullscreen', 'dispose'],
    state: { playing: false, fullscreen: false, disposed: true },
  },
];

describe('谱面确认宿主命令合同', () => {
  it('解析宿主命令：暂停原因、退出全屏、释放与确认事件各自判别', () => {
    expect(parseChartPreviewHostCommand({ type: 'pause', cause: 'lifecycle' }))
      .toEqual({ type: 'pause', cause: 'lifecycle' });
    expect(parseChartPreviewHostCommand({ type: 'pause', cause: 'manual' }))
      .toEqual({ type: 'pause', cause: 'manual' });
    expect(parseChartPreviewHostCommand('stop')).toEqual({ type: 'pause', cause: 'lifecycle' });
    expect(parseChartPreviewHostCommand(JSON.stringify({ type: 'stop' })))
      .toEqual({ type: 'pause', cause: 'lifecycle' });
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

  it('命令脚本从同一个判别联合序列化，退出全屏仍保留既有线格式', () => {
    expect(chartPreviewHostCommandScript({ type: 'pause', cause: 'lifecycle' }))
      .toBe(chartPreviewPlayerMessageScript({ type: 'pause', cause: 'lifecycle' }));
    expect(chartPreviewHostCommandScript({ type: 'pause', cause: 'lifecycle' }))
      .toContain('"type":"pause","cause":"lifecycle"');
    expect(chartPreviewHostCommandScript({ type: 'dispose' })).toContain('"type":"dispose"');
    expect(chartPreviewHostCommandScript({ type: 'exit-fullscreen' })).toBe(chartPreviewExitFullscreenScript());
    expect(chartPreviewHostCommandScript({ type: 'background-video-confirmation-result', accepted: true }))
      .toContain('"accepted":true');
  });

  it.each(ADAPTER_IDS)('%s 对同一组宿主命令产生约定的命令序列与状态', (id) => {
    for (const scenario of COMMAND_SEQUENCES) {
      const adapter = createAdapter(id);
      expect(applyChartPreviewHostCommand(scenario.command, adapter.handlers), scenario.label).toBe(true);
      expect(adapter.actions, scenario.label).toEqual(scenario.actions);
      expect({
        playing: adapter.state.playing,
        fullscreen: adapter.state.fullscreen,
        disposed: adapter.state.disposed,
      }, scenario.label).toEqual(scenario.state);
      for (const event of adapter.events) {
        // 播放器回传的事件必须是宿主能解析的合同事件。
        expect(parseChartPreviewBridgeMessage(JSON.stringify(event)), scenario.label)
          .toEqual(event);
      }
    }
  });

  it.each(ADAPTER_IDS)('%s 的暂停不改变全屏，释放幂等且确认事件只回执发起者', (id) => {
    const adapter = createAdapter(id);
    expect(applyChartPreviewHostCommand({ type: 'pause', cause: 'lifecycle' }, adapter.handlers)).toBe(true);
    expect(adapter.state.fullscreen).toBe(true);
    expect(applyChartPreviewHostCommand({ type: 'background-video-confirmation-result', accepted: true }, adapter.handlers)).toBe(true);
    expect(adapter.state.confirmed).toBe(id === 'simai' ? true : null);

    const disposing = createAdapter(id);
    applyChartPreviewHostCommand({ type: 'dispose' }, disposing.handlers);
    const afterFirst = [...disposing.actions];
    applyChartPreviewHostCommand({ type: 'dispose' }, disposing.handlers);
    expect(disposing.actions).toEqual(afterFirst);
  });

  it.each(ADAPTER_IDS)('%s 未声明的宿主消息不产生任何动作', (id) => {
    const adapter = createAdapter(id);
    for (const message of [{ type: 'play' }, { type: 'pause' }, 'stop-all', null, 3]) {
      expect(applyChartPreviewHostCommand(message, adapter.handlers)).toBe(false);
    }
    expect(adapter.actions).toEqual([]);
  });

  it('舞萌暂停时释放背景视频：引擎差异与合同动作分开记录', () => {
    const simai = createAdapter('simai');
    applyChartPreviewHostCommand({ type: 'pause', cause: 'lifecycle' }, simai.handlers);
    expect(simai.actions).toEqual(['pause:lifecycle']);
    expect(simai.engineActions).toEqual(['release-background-video']);
    for (const id of ADAPTER_IDS.filter((adapter) => adapter !== 'simai')) {
      const other = createAdapter(id);
      applyChartPreviewHostCommand({ type: 'pause', cause: 'lifecycle' }, other.handlers);
      expect(other.engineActions).toEqual([]);
    }
  });

  it('播放器事件载荷显式类型化：宿主读取声明字段，不再解释任意顶层键', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"ready"}')).toEqual({ type: 'ready' });
    expect(parseChartPreviewBridgeMessage('{"type":"ready","protocolVersion":9}')).toEqual({ type: 'ready' });
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

  it('设置事件使用 settings 信封，旧扁平 settings 归一化为同一载荷', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"settings","settings":{"hiSpeed":7.5,"backgroundMode":"video"}}'))
      .toEqual({ type: 'settings', settings: { hiSpeed: 7.5, backgroundMode: 'video' } });
    expect(parseChartPreviewBridgeMessage('{"type":"settings","hiSpeed":7.5,"active":false,"message":"ignored"}'))
      .toEqual({ type: 'settings', settings: { hiSpeed: 7.5 } });
    expect(parseChartPreviewBridgeMessage('{"type":"settings","settings":"broken"}')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{"type":"settings","settings":null}')).toBeNull();
  });

  it('未声明的游戏扩展消息按原样透传，非法载荷返回 null', () => {
    expect(parseChartPreviewBridgeMessage('{"type":"confirmation","result":"ok"}'))
      .toEqual({ type: 'confirmation', result: 'ok' });
    expect(parseChartPreviewBridgeMessage('{"result":"ok"}')).toBeNull();
    expect(parseChartPreviewBridgeMessage('"fullscreen"')).toBeNull();
    expect(parseChartPreviewBridgeMessage('{')).toBeNull();
  });

  it('判别联合守卫只放行合同声明的事件', () => {
    const fullscreen = parseChartPreviewBridgeMessage('{"type":"fullscreen","active":true}');
    expect(fullscreen).not.toBeNull();
    expect(isChartPreviewPlayerEvent(fullscreen!, 'fullscreen')).toBe(true);
    expect(isChartPreviewPlayerEvent(fullscreen!, 'settings')).toBe(false);
  });

  it.each(ADAPTER_IDS)('%s 经同一份共享合同分派宿主命令', (id) => {
    const source = adapterSource(id);
    expect(source).toContain('applyChartPreviewHostCommand');
    expect(source).toContain("from '../../chart-preview-shared/chart-preview-bridge'");
    expect(source).toMatch(/post(?:Status)?\('settings', \{ settings: /);
  });

  it.each(ADAPTER_IDS)('%s 的生命周期暂停不退出全屏，释放退出全屏', (id) => {
    const source = adapterSource(id);
    const pause = functionBody(source, 'pauseForLifecycle');
    expect(pause).not.toMatch(/Fullscreen\s*\(/);
    expect(pause).not.toMatch(/disposePlayer\(\)|dispose\(\)/);
    const dispose = functionBody(source, id === 'osu' || id === 'rizline' ? 'dispose' : 'disposePlayer');
    expect(dispose).toMatch(/Fullscreen\s*\(/);
    expect(dispose).toMatch(/disposed = true/);
  });

  it('返回键与释放命令仍走既有脚本写法，浏览器检查脚本的旧命令保持可用', () => {
    expect(chartPreviewExitFullscreenScript()).toContain("type:'exit-fullscreen'");
    expect(chartPreviewHostCommandScript({ type: 'exit-fullscreen' })).toContain("type:'exit-fullscreen'");
    expect(parseChartPreviewHostCommand('exit-fullscreen')).toEqual({ type: 'exit-fullscreen' });
    // 舞萌与 osu! 的浏览器检查脚本直接发送旧命令。
    expect(applyChartPreviewHostCommand(JSON.stringify({ type: 'stop' }), createAdapter('osu').handlers)).toBe(true);
  });
});
