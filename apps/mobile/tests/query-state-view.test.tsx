import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { QueryStateView } from '@/components/QueryStateView';

// 该文件被 describe.skip 跳过，原因：
// 当前 vitest 配置 environment: 'node'，且未配置 jest-preset-react-native /
// react-native 测试环境与 native 模块 mock。直接 import 'react-native' /
// '@testing-library/react-native' 在 node 环境下会因缺少 native 模块而失败。
// 待后续引入 RN 测试 preset（或在 vitest 中配置 RN renderer 环境）后，
// 移除下方 .skip 即可启用 QueryStateView 五态断言。
describe.skip('QueryStateView five states', () => {
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
    expect(queryByText('数据可能过期，下拉刷新')).toBeNull();
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
    expect(getByText('数据可能过期，下拉刷新')).toBeTruthy();
    expect(getByText('data-content')).toBeTruthy();
  });
});
