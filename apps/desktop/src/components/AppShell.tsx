import {
  BarChart3,
  ChevronDown,
  Database,
  LayoutDashboard,
  RefreshCw,
  Trash2,
  Trophy,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { formatDateTime } from '../app/format';
import { useAppRuntime } from '../app/runtime';

const NAV_ITEMS = [
  { to: '/', label: '总览', icon: LayoutDashboard, end: true },
  { to: '/best', label: '最佳', icon: Trophy, end: false },
  { to: '/records', label: '成绩', icon: BarChart3, end: false },
] as const;

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/brand.svg" alt="" />
        <div>
          <strong>rRanker</strong>
          <span>Desktop</span>
        </div>
      </div>
      <nav aria-label="主导航">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `nav-item${isActive ? ' nav-item-active' : ''}`
            }
          >
            <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-spacer" />
      <div className="desktop-badge">
        <span className="desktop-badge-dot" />
        <div>
          <strong>舞萌 DX 首版</strong>
          <span>本机数据工作台</span>
        </div>
      </div>
    </aside>
  );
}

function TopBar() {
  const {
    account,
    snapshot,
    isRefreshing,
    error,
    refresh,
    removeDemo,
  } = useAppRuntime();
  const source = snapshot?.source;

  const remove = async () => {
    if (
      window.confirm(
        '确定移除示例账号吗？账号不会在下次启动时自动恢复，可随时从空状态重新添加。',
      )
    ) {
      await removeDemo();
    }
  };

  return (
    <>
      <header className="topbar">
        <details className="account-menu">
          <summary>
            <img src="/brand.svg" alt="" />
            <span>
              <strong>{account?.displayName ?? '暂无账号'}</strong>
              <small>示例查分器</small>
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </summary>
          <div className="account-menu-popover">
            <div className="account-menu-heading">当前账号</div>
            <div className="account-menu-account">
              <img src="/brand.svg" alt="" />
              <span>
                <strong>{account?.displayName}</strong>
                <small>全曲全谱面满成绩</small>
              </span>
            </div>
            <button className="menu-danger" type="button" onClick={() => void remove()}>
              <Trash2 size={15} aria-hidden="true" />
              删除示例账号
            </button>
          </div>
        </details>

        <div className="topbar-source">
          <Database size={16} aria-hidden="true" />
          <span>
            <strong>{source?.isStale ? '缓存数据' : '在线数据'}</strong>
            <small>
              {source ? `${source.label} · ${formatDateTime(source.updatedAt)}` : '等待数据'}
            </small>
          </span>
        </div>

        <button
          className="button button-primary"
          type="button"
          disabled={!account || isRefreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw
            size={16}
            className={isRefreshing ? 'spin' : undefined}
            aria-hidden="true"
          />
          {isRefreshing ? '刷新中' : '刷新数据'}
        </button>
      </header>
      {error && snapshot ? (
        <div className="inline-warning" role="status">
          <strong>刷新失败，正在使用本机缓存。</strong>
          <span>{error.message}</span>
        </div>
      ) : null}
    </>
  );
}

export function AppShell() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="workspace">
        <TopBar />
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
