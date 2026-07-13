import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { QueryStateView } from '@/components/QueryStateView';

describe('QueryStateView five states', () => {
  const renderData = (): ReactElement => <Text>data-content</Text>;

  it('shows the loading indicator when isLoading and no data', async () => {
    const { queryByText } = await render(
      <QueryStateView
        isLoading
        isError={false}
        isEmpty={false}
        isStale={false}
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
        isStale={false}
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
        isStale={false}
        data={undefined}
        renderData={renderData}
      />,
    );
    expect(getByText('暂无数据')).toBeTruthy();
  });

  it('renders data without the stale banner when data is present and not stale', async () => {
    const { getByText, queryByText } = await render(
      <QueryStateView
        isLoading={false}
        isError={false}
        isEmpty={false}
        isStale={false}
        data={[1]}
        renderData={renderData}
      />,
    );
    expect(getByText('data-content')).toBeTruthy();
    expect(queryByText('当前显示缓存数据')).toBeNull();
  });

  it('shows the stale banner and data when data is present and stale', async () => {
    const { getByText } = await render(
      <QueryStateView
        isLoading={false}
        isError={false}
        isEmpty={false}
        isStale
        data={[1]}
        renderData={renderData}
      />,
    );
    expect(getByText('当前显示缓存数据')).toBeTruthy();
    expect(getByText('data-content')).toBeTruthy();
  });
});
