import { EmptyScoreProvider } from '@/providers/empty-provider';

describe('empty test game providers', () => {
  it('exposes the default empty player and records', async () => {
    const provider = new EmptyScoreProvider();
    expect(await provider.getPlayer()).toMatchObject({ displayName: '测试游戏', rating: 0 });
    expect(await provider.getRecords()).toEqual([]);
  });
});
