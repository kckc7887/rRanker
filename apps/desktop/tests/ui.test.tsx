import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import {
  AppRuntimeContext,
  type AppRuntimeValue,
} from '../src/app/runtime';
import { desktopSnapshot } from './fixtures';

async function renderApp(
  initialEntry: string,
  overrides: Partial<AppRuntimeValue> = {},
) {
  const snapshot = await desktopSnapshot();
  const value: AppRuntimeValue = {
    phase: 'ready',
    account: {
      id: 'maimai:test',
      gameId: 'maimai',
      providerId: 'maimai-test',
      displayName: '示例账号',
    },
    snapshot,
    isRefreshing: false,
    error: null,
    refresh: vi.fn(async () => undefined),
    removeDemo: vi.fn(async () => undefined),
    restoreDemo: vi.fn(async () => undefined),
    ...overrides,
  };
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppRuntimeContext.Provider value={value}>
        <App />
      </AppRuntimeContext.Provider>
    </MemoryRouter>,
  );
  return value;
}

describe('桌面端核心闭环', () => {
  it('总览显示示例账号、Rating 和 B35/B15', async () => {
    await renderApp('/');
    expect(screen.getAllByText('示例账号')).not.toHaveLength(0);
    expect(screen.getByText('DX RATING')).toBeInTheDocument();
    expect(screen.getByText('旧曲与新曲分区')).toBeInTheDocument();
  });

  it('最佳页可在 B35 与 B15 间切换', async () => {
    await renderApp('/best');
    expect(screen.getByText('Alpha Song')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /B15/ }));
    expect(screen.getByText('Beta Song')).toBeInTheDocument();
  });

  it('空账号状态提供重新添加入口', async () => {
    const runtime = await renderApp('/', {
      phase: 'empty',
      account: null,
      snapshot: null,
    });
    fireEvent.click(screen.getByRole('button', { name: '添加示例账号' }));
    expect(runtime.restoreDemo).toHaveBeenCalledOnce();
  });

  it('缓存刷新失败时保留页面并显示警告', async () => {
    await renderApp('/', {
      error: new Error('请求过于频繁，请稍后重试'),
    });
    expect(screen.getByText('刷新失败，正在使用本机缓存。')).toBeInTheDocument();
    expect(screen.getByText('请求过于频繁，请稍后重试')).toBeInTheDocument();
  });
});
