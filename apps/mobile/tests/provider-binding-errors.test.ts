import { describe, expect, it } from 'vitest';
import { SessionPersistenceError } from '@/domain/session-vault';
import { ProviderError, providerErrorToUserMessage, runProviderOperation } from '@/providers/errors';

describe('公共账号错误阶段', () => {
  it('取消不转换成授权或存储失败', async () => {
    const abort = new DOMException('cancelled', 'AbortError');
    await expect(runProviderOperation('verification', () => { throw abort; })).rejects.toBe(abort);
  });
  it.each(['authorization_prepare', 'authorization_open', 'authorization_callback', 'verification', 'local_commit'] as const)
  ('按当前阶段分类原生异常且不展示其凭据正文：%s', async code => {
    const native = new Error('Authorization: Bearer private-token');
    const result = runProviderOperation(code, () => { throw native; });
    await expect(result).rejects.toMatchObject({ code, cause: native });
    const error = await result.catch(error => error);
    const copy = providerErrorToUserMessage(error, 'fallback');
    expect(copy).not.toBe('fallback');
    expect(copy).not.toContain('private-token');
  });

  it.each(['credential_storage', 'local_commit'] as const)('保留真实持久化阶段而不替换成远端验证：%s', async code => {
    const error = new SessionPersistenceError(code, { cause: new Error('native secret failure') });
    await expect(runProviderOperation('verification', () => { throw error; })).rejects.toBe(error);
    expect(providerErrorToUserMessage(error, '验证失败')).not.toBe('验证失败');
    expect(providerErrorToUserMessage(error, '验证失败')).not.toContain('native secret');
  });

  it('保留真实远端拒绝与网络错误，不把它们分类为本机提交', async () => {
    const denied = new ProviderError('authentication', 'raw server message', false);
    await expect(runProviderOperation('local_commit', () => { throw denied; })).rejects.toBe(denied);
    expect(providerErrorToUserMessage(denied, 'fallback', { authentication: '远端账号验证未通过，请重新授权。' }))
      .toBe('远端账号验证未通过，请重新授权。');
  });
});
