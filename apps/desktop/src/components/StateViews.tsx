import { AlertTriangle, Plus, RefreshCw, WifiOff } from 'lucide-react';
import { useAppRuntime } from '../app/runtime';

export function LoadingView({ title = '正在准备示例账号' }: { title?: string }) {
  return (
    <div className="center-state">
      <div className="state-icon state-icon-loading">
        <RefreshCw className="spin" size={28} aria-hidden="true" />
      </div>
      <h1>{title}</h1>
      <p>正在读取本机缓存并连接 LXNS 详细曲库。</p>
    </div>
  );
}

export function EmptyAccountView() {
  const { restoreDemo, isRefreshing } = useAppRuntime();
  return (
    <div className="center-state">
      <div className="state-icon">
        <Plus size={30} aria-hidden="true" />
      </div>
      <span className="eyebrow">舞萌 DX</span>
      <h1>还没有可查看的账号</h1>
      <p>重新添加示例账号即可恢复总览、最佳成绩和成绩表格。</p>
      <button
        className="button button-primary button-large"
        type="button"
        disabled={isRefreshing}
        onClick={() => void restoreDemo()}
      >
        <Plus size={17} aria-hidden="true" />
        添加示例账号
      </button>
    </div>
  );
}

export function ErrorView() {
  const { error, account, refresh } = useAppRuntime();
  const isNetwork =
    error && 'code' in error && ['network', 'timeout', 'rate_limit'].includes(String(error.code));
  return (
    <div className="center-state">
      <div className="state-icon state-icon-error">
        {isNetwork ? <WifiOff size={30} /> : <AlertTriangle size={30} />}
      </div>
      <span className="eyebrow">数据暂不可用</span>
      <h1>{isNetwork ? '无法读取舞萌曲库' : '桌面端初始化失败'}</h1>
      <p>{error?.message ?? '发生了未知错误，请重试。'}</p>
      <button
        className="button button-primary button-large"
        type="button"
        onClick={() => (account ? void refresh() : window.location.reload())}
      >
        <RefreshCw size={17} aria-hidden="true" />
        重试
      </button>
    </div>
  );
}
