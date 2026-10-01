import type { ReactElement } from 'react';
import { jest } from '@jest/globals';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { QueryStateView } from '@/components/QueryStateView';
import { BestImageEntryButton } from '@/components/BestImageEntryButton';
import { createAppTheme } from '@/theme/theme-tokens';

let mockTheme = createAppTheme('light', '#FFFFFF');
jest.mock('@/theme/app-theme', () => ({ useAppTheme: () => mockTheme }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('QueryStateView five states', () => {
  const renderData = (): ReactElement => <Text>data-content</Text>;

  it.each(['#FFFFFF', '#000000'])('keeps shared accent actions readable on %s', async accent => {
    mockTheme = createAppTheme('light', accent);
    const screen = await render(<>
      <QueryStateView isLoading={false} isError isEmpty={false} data={undefined} onRetry={() => {}} renderData={renderData} />
      <BestImageEntryButton label="生成成绩图" />
    </>);
    expect(screen.getByText('重试')).toHaveStyle({ color: mockTheme.onAccent });
    expect(screen.getByText('生成成绩图')).toHaveStyle({ color: mockTheme.onAccent });
  });

  it('shows the loading indicator when isLoading and no data', async () => {
    const { queryByText } = await render(
      <QueryStateView
        isLoading
        isError={false}
        isEmpty={false}
        data={undefined}
        renderData={renderData}
      />,
    );
    expect(queryByText('加载失败，请重试')).toBeNull();
  });

  it('shows the error text when isError and no data', async () => {
    const { getByText } = await render(
      <QueryStateView
        isLoading={false}
        isError
        isEmpty={false}
        data={undefined}
        renderData={renderData}
      />,
    );
    expect(getByText('加载失败，请重试')).toBeTruthy();
  });

  it('shows the empty text when isEmpty and no data', async () => {
    const { getByText } = await render(
      <QueryStateView
        isLoading={false}
        isError={false}
        isEmpty
        data={undefined}
        renderData={renderData}
      />,
    );
    expect(getByText('暂无数据')).toBeTruthy();
  });

  it('shows a clear action on an empty filtered result', async () => {
    let calls = 0;
    const { getByLabelText } = await render(
      <QueryStateView
        isLoading={false}
        isError={false}
        isEmpty
        data={undefined}
        emptyText="没有符合条件的成绩"
        emptyActionLabel="清除筛选"
        onEmptyAction={() => { calls += 1; }}
        renderData={renderData}
      />,
    );
    await fireEvent.press(getByLabelText('清除筛选'));
    expect(calls).toBe(1);
  });

  it('renders data when present', async () => {
    const { getByText, queryByText } = await render(
      <QueryStateView
        isLoading={false}
        isError={false}
        isEmpty={false}
        data={[1]}
        renderData={renderData}
      />,
    );
    expect(getByText('data-content')).toBeTruthy();
    expect(queryByText('当前显示缓存数据')).toBeNull();
  });
});
