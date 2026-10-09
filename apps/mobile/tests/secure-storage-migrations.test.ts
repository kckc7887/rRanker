import { LargeSecureValueStore } from '@/storage/large-secure-value-store';

const secure = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secure.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => { secure.values.set(key, value); }),
  deleteItemAsync: vi.fn(async (key: string) => { secure.values.delete(key); }),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { ScoreHubAccountStore } from '@/storage/score-hub-account-store';
// eslint-disable-next-line import/first -- 原生模块 mock 必须先于被测模块注册
import { UploadPrefsStore } from '@/storage/upload-prefs-store';

function createKvStore() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { values.delete(key); }),
  };
}

describe('账号凭据与上传偏好持久化', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    secure.values.clear();
    vi.clearAllMocks();
  });

  it('分别保存长 JWT 并恢复两个账号', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    const tokenA = `header.${'a'.repeat(4200)}.signature`;
    const tokenB = `头😀.${'b'.repeat(4300)}.签名`;
    await store.upsert({ friendCode: '10001', token: tokenA, hasCabinetBound: true });
    await store.upsert({ friendCode: '10002', token: tokenB, hasCabinetBound: false });
    const restored = await new ScoreHubAccountStore(kv).loadAll();
    expect(restored.accounts['10001']?.token).toBe(tokenA);
    expect(restored.accounts['10002']?.token).toBe(tokenB);
    const secureStore = await import('expo-secure-store');
    expect(vi.mocked(secureStore.setItemAsync).mock.calls.every(([, value]) => Buffer.byteLength(value, 'utf8') < 2048)).toBe(true);
  });

  it('ScoreHub 更新和删除只替换目标账号的安全引用', async () => {
    const kv = createKvStore();
    const store = new ScoreHubAccountStore(kv);
    await store.upsert({ friendCode: '10001', token: 'token-a', hasCabinetBound: true });
    await store.upsert({ friendCode: '10002', token: 'token-b', hasCabinetBound: false });
    const before = JSON.parse(kv.values.get('rranker.scorehub.accounts.v3')!) as {
      accounts: Record<string, { tokenRef: string }>;
    };

    await store.upsert({ friendCode: '10001', token: 'token-a-next' });
    const afterUpdate = JSON.parse(kv.values.get('rranker.scorehub.accounts.v3')!) as {
      accounts: Record<string, { tokenRef: string }>;
    };
    expect(afterUpdate.accounts['10001']?.tokenRef).not.toBe(before.accounts['10001']?.tokenRef);
    expect(afterUpdate.accounts['10002']?.tokenRef).toBe(before.accounts['10002']?.tokenRef);
    expect(await store.getByFriendCode('10001')).toMatchObject({ token: 'token-a-next' });

    const removedRef = afterUpdate.accounts['10001']!.tokenRef;
    await store.remove('10001');
    expect(await store.getByFriendCode('10001')).toBeNull();
    expect([...secure.values.keys()].some((key) => key.startsWith(removedRef))).toBe(false);
  });

  it('ScoreHub 凭据读取 I/O 失败时原地重试保留账号', async () => {
    const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
    await store.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    await store.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: true });
    const before = kv.values.get('rranker.scorehub.accounts.v3');
    const secretKeys = [...secure.values.keys()];
    const read = vi.spyOn(secrets, 'read');
    read.mockRejectedValueOnce(new Error('temporary secret read failure'));
    await expect(store.select('A')).rejects.toMatchObject({ code: 'credential_storage' });
    expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(before);
    expect([...secure.values.keys()]).toEqual(secretKeys);
    await expect(store.select('A')).resolves.toMatchObject({ friendCode: 'A', token: 'a' });
    expect(Object.keys((await store.loadAll()).accounts)).toEqual(['A', 'B']);
  });

  it.each(['missing-chunk', 'invalid-manifest'] as const)(
    'ScoreHub 隔离 %s 对应账号并保留健康账号和重新绑定能力', async damage => {
      const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
      await store.upsert({ friendCode: 'A', token: 'a'.repeat(3000), hasCabinetBound: true });
      await store.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: true });
      await store.select('A');
      const index = JSON.parse(kv.values.get('rranker.scorehub.accounts.v3')!) as { accounts: Record<string, { tokenRef: string }> };
      const reference = index.accounts.A!.tokenRef;
      if (damage === 'missing-chunk') {
        secure.values.delete([...secure.values.keys()].find(key => key.startsWith(reference + '.chunk.'))!);
      } else {
        secure.values.set(reference + '.manifest', '{}');
      }
      await expect(store.load()).resolves.toMatchObject({ friendCode: 'B', token: 'b' });
      await expect(store.getByFriendCode('A')).resolves.toBeNull();
      expect(Object.keys((await store.loadAll()).accounts)).toEqual(['B']);
      await expect(store.listWithToken()).resolves.toEqual([expect.objectContaining({ friendCode: 'B', token: 'b' })]);
      await store.upsert({ friendCode: 'A', token: 'new-a' });
      await expect(new ScoreHubAccountStore(kv, secrets).load()).resolves.toMatchObject({ friendCode: 'A', token: 'new-a' });
    },
  );

  it('ScoreHub 扫描失效令牌后遇到 I/O 失败不提交部分目录', async () => {
    const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
    await store.upsert({ friendCode: 'A', token: 'a' });
    await store.upsert({ friendCode: 'B', token: 'b' });
    const before = kv.values.get('rranker.scorehub.accounts.v3');
    const keys = [...secure.values.keys()];
    vi.spyOn(secrets, 'read').mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('locked'));
    await expect(store.loadAll()).rejects.toMatchObject({ code: 'credential_storage' });
    expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(before);
    expect([...secure.values.keys()]).toEqual(keys);
  });

  it('ScoreHub 隔离失效账号时先提交索引，提交失败保留凭据供重试', async () => {
    const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
    await store.upsert({ friendCode: 'A', token: 'a' });
    await store.upsert({ friendCode: 'B', token: 'b' });
    const before = kv.values.get('rranker.scorehub.accounts.v3');
    const keys = [...secure.values.keys()];
    vi.spyOn(secrets, 'read').mockResolvedValueOnce(null);
    kv.setItem.mockRejectedValueOnce(new Error('write failed'));
    await expect(store.loadAll()).rejects.toMatchObject({ code: 'local_commit' });
    expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(before);
    expect([...secure.values.keys()]).toEqual(keys);
    expect(Object.keys((await store.loadAll()).accounts)).toEqual(['A', 'B']);
  });

  it.each(['remove', 'clear'] as const)('ScoreHub %s 依据有效索引删除，无需读取损坏密钥', async operation => {
    const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
    await store.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    const read = vi.spyOn(secrets, 'read').mockRejectedValue(new Error('damaged credential'));
    await (operation === 'remove' ? store.remove('A') : store.clear());
    expect(read).not.toHaveBeenCalled();
    expect(await new ScoreHubAccountStore(kv).loadAll()).toEqual({ activeFriendCode: '', accounts: {} });
    expect(secure.values.size).toBe(0);
  });

  it('上传偏好读取失败与缺失区分，失败不写入或删除', async () => {
    const kv = createKvStore(), store = new UploadPrefsStore(kv);
    const failure = new Error('read unavailable');
    kv.getItem.mockRejectedValueOnce(failure);
    await expect(store.load()).rejects.toBe(failure);
    expect(kv.setItem).not.toHaveBeenCalled();
    expect(kv.removeItem).not.toHaveBeenCalled();
    await expect(store.load()).resolves.toMatchObject({ friendCode: '' });
  });

  it.each(['{', JSON.stringify({ version: 4, accounts: {} }), JSON.stringify({ version: 3, accounts: { A: {} } })])(
    'ScoreHub 重建不支持的索引 %s', async raw => {
      const kv = createKvStore();
      kv.values.set('rranker.scorehub.accounts.v3', raw);
      const store = new ScoreHubAccountStore(kv);
      kv.values.set('other-setting', 'untouched');
      await expect(store.loadAll()).resolves.toEqual({ activeFriendCode: '', accounts: {} });
      expect(JSON.parse(kv.values.get('rranker.scorehub.accounts.v3')!)).toEqual({ version: 3, activeFriendCode: '', accounts: {} });
      expect(kv.values.get('other-setting')).toBe('untouched');
      await store.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: false });
      await expect(store.load()).resolves.toMatchObject({ friendCode: 'A', token: 'a' });
    },
  );

  it('ScoreHub 跨实例并发保存保留全部账号且最后一次成功选择成为活动账号', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    await first.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: false });
    await Promise.all([first.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: false }), second.upsert({ friendCode: 'C', token: 'c', hasCabinetBound: true })]);
    const restored = await new ScoreHubAccountStore(kv).loadAll();
    expect(Object.keys(restored.accounts)).toEqual(['A', 'B', 'C']);
    expect(restored.activeFriendCode).toBe('C');
  });

  it('ScoreHub 并发保存、删除和更新保留目标账号', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    await first.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: false });
    await Promise.all([first.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: false }), second.remove('A'), first.upsert({ friendCode: 'B', hasCabinetBound: true })]);
    expect(await first.loadAll()).toMatchObject({ activeFriendCode: 'B', accounts: { B: { token: 'b', hasCabinetBound: true } } });
    expect(Object.keys((await first.loadAll()).accounts)).toEqual(['B']);
  });

  it('ScoreHub 清除与保存串行', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    await first.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    await Promise.all([first.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: false }), second.clear()]);
    expect(await first.loadAll()).toEqual({ activeFriendCode: '', accounts: {} });
    await Promise.all([first.clear(), second.upsert({ friendCode: 'C', token: 'c', hasCabinetBound: false })]);
    expect(Object.keys((await first.loadAll()).accounts)).toEqual(['C']);
  });

  it('ScoreHub 一次提交失败不阻塞后续排队的保存', async () => {
    const kv = createKvStore(), first = new ScoreHubAccountStore(kv), second = new ScoreHubAccountStore(kv);
    kv.setItem.mockRejectedValueOnce(new Error('index unavailable'));
    const failed = first.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: false });
    const next = second.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: true });
    await expect(failed).rejects.toMatchObject({ code: 'local_commit' });
    await next;
    expect(Object.keys((await first.loadAll()).accounts)).toEqual(['B']);
  });

  it('ScoreHub 索引实际提交后报错时不删除已被引用的新凭据', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    await store.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    kv.setItem.mockImplementationOnce(async (key, value) => { kv.values.set(key, value); throw new Error('write completed but rejected'); });
    await expect(store.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: false })).rejects.toMatchObject({ code: 'local_commit' });
    await expect(store.getByFriendCode('B')).resolves.toMatchObject({ token: 'b' });
    await expect(store.getByFriendCode('A')).resolves.toMatchObject({ token: 'a' });
  });

  it('ScoreHub 提交报错且读回不可用时保留可能被引用的凭据', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    await store.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    kv.setItem.mockImplementationOnce(async (key, value) => {
      kv.values.set(key, value);
      kv.getItem.mockRejectedValueOnce(new Error('readback unavailable'));
      throw new Error('write completion uncertain');
    });
    await expect(store.upsert({ friendCode: 'B', token: 'b', hasCabinetBound: false })).rejects.toMatchObject({ code: 'local_commit' });
    await expect(store.getByFriendCode('B')).resolves.toMatchObject({ token: 'b' });
    await expect(store.getByFriendCode('A')).resolves.toMatchObject({ token: 'a' });
  });

  it('ScoreHub 新凭据写入成功时不受后续读取暂时不可用影响', async () => {
    const kv = createKvStore(), secrets = new LargeSecureValueStore(), store = new ScoreHubAccountStore(kv, secrets);
    const read = vi.spyOn(secrets, 'read').mockRejectedValue(new Error('temporarily locked'));
    await expect(store.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: false })).resolves.toMatchObject({ friendCode: 'A', token: 'a' });
    read.mockRestore();
    await expect(store.load()).resolves.toMatchObject({ friendCode: 'A', token: 'a' });
  });

  it('ScoreHub 清除索引失败不会提前删除原凭据并可重试', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    await store.upsert({ friendCode: 'A', token: 'a', hasCabinetBound: true });
    const index = kv.values.get('rranker.scorehub.accounts.v3'), keys = [...secure.values.keys()];
    kv.setItem.mockRejectedValueOnce(new Error('clear unavailable'));
    await expect(store.clear()).rejects.toMatchObject({ code: 'local_commit' });
    expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe(index);
    expect([...secure.values.keys()]).toEqual(keys);
    await store.clear();
    expect(await store.loadAll()).toEqual({ activeFriendCode: '', accounts: {} });
  });

  it('多个上传偏好实例的并发保存和删除不丢失其它好友码的选择', async () => {
    const kv = createKvStore();
    const first = new UploadPrefsStore(kv), second = new UploadPrefsStore(kv);
    await Promise.all([
      first.save({ friendCode: '10001', selectedAccountIds: ['a'] }),
      second.save({ friendCode: '10002', selectedAccountIds: ['b'] }),
    ]);
    expect((await first.load()).selectionsByFriendCode).toEqual({ 10001: ['a'], 10002: ['b'] });
    await Promise.all([
      first.save({ friendCode: '10001', selectedAccountIds: ['a2'] }),
      second.removeSelection('10002'),
    ]);
    expect((await second.load()).selectionsByFriendCode).toEqual({ 10001: ['a2'] });
    await Promise.all([
      first.save({ friendCode: '10003', selectedAccountIds: ['c'] }),
      second.clear(),
    ]);
    expect((await first.load()).selectionsByFriendCode).toEqual({});
  });

  it.each(['{', '', 'null', '{}', '{"friendCode":"A","selectedAccountIds":["a"]}'])(
    '上传偏好重建不支持的结构 %s', async raw => {
      const kv = createKvStore(), store = new UploadPrefsStore(kv);
      kv.values.set('rranker.upload.prefs.v3', raw);
      kv.values.set('other-setting', 'untouched');
      await expect(store.load()).resolves.toEqual({ friendCode: '', selectedAccountIds: [], selectionsByFriendCode: {} });
      expect(JSON.parse(kv.values.get('rranker.upload.prefs.v3')!)).toEqual({ friendCode: '', selectionsByFriendCode: {} });
      expect(kv.values.get('other-setting')).toBe('untouched');
      await store.save({ friendCode: 'B', selectedAccountIds: ['b'] });
      expect(await store.load()).toEqual({ friendCode: 'B', selectedAccountIds: ['b'], selectionsByFriendCode: { B: ['b'] } });
    },
  );

  it('重建上传偏好时写入失败保留原数据并抛错', async () => {
    const kv = createKvStore(), store = new UploadPrefsStore(kv);
    kv.values.set('rranker.upload.prefs.v3', '{');
    kv.setItem.mockRejectedValueOnce(new Error('write unavailable'));
    await expect(store.load()).rejects.toThrow('write unavailable');
    expect(kv.values.get('rranker.upload.prefs.v3')).toBe('{');
    expect(kv.removeItem).not.toHaveBeenCalled();
  });

  it('ScoreHub 索引读取或重建写入失败不清空数据', async () => {
    const kv = createKvStore(), store = new ScoreHubAccountStore(kv);
    kv.values.set('rranker.scorehub.accounts.v3', '{');
    kv.getItem.mockRejectedValueOnce(new Error('read unavailable'));
    await expect(store.loadAll()).rejects.toMatchObject({ code: 'local_commit' });
    expect(kv.setItem).not.toHaveBeenCalled();
    kv.setItem.mockRejectedValueOnce(new Error('write unavailable'));
    await expect(store.loadAll()).rejects.toMatchObject({ code: 'local_commit' });
    expect(kv.values.get('rranker.scorehub.accounts.v3')).toBe('{');
    expect(kv.removeItem).not.toHaveBeenCalled();
  });

});
