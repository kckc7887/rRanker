import type { BoundAccount } from '@/domain/bound-account';
import {
  releaseResolvedProviders,
  resolveSessionProviders,
  type LxnsTokenRotation,
  type SessionCredentialRef,
  type SessionProfiles,
} from '@/state/session-provider-resolver';

/** Store 交给运行时的解析输入：账号 + 当前引用的凭据版本。 */
export type SessionRuntimeRequest = {
  account: BoundAccount | null;
  credentials: SessionCredentialRef;
};

/**
 * 会话运行时端口：Store 只表达「需要 Provider」，实例由解析器按
 * 「账号 + 凭据版本」缓存；缓存失效经 release 显式声明。
 * Store 不 import 任何具体 Provider 构造路径，也不直接访问 SecureStore。
 */
export interface SessionRuntime {
  resolve(request: SessionRuntimeRequest): { providers: SessionProfiles; cacheKey: string };
  release(accountIds: readonly string[]): void;
}

/** 解析器持有的落雪轮换回调；Coordinator 装配前它不产生提交。 */
let lxnsTokenRotation: LxnsTokenRotation = () => undefined;

const DEFAULT_RUNTIME: SessionRuntime = {
  resolve: (request) => resolveSessionProviders(
    request.account,
    request.credentials,
    (accountId, update) => lxnsTokenRotation(accountId, update),
  ),
  release: (accountIds) => releaseResolvedProviders(accountIds),
};

let currentRuntime: SessionRuntime = DEFAULT_RUNTIME;

export function sessionRuntime(): SessionRuntime {
  return currentRuntime;
}

/** 凭据提交协调器装配后接管落雪轮换的提交入口。 */
export function setLxnsTokenRotation(rotation: LxnsTokenRotation): void {
  lxnsTokenRotation = rotation;
}

/** 测试用：替换整个运行时端口。 */
export function setSessionRuntime(runtime: SessionRuntime): void {
  currentRuntime = runtime;
}

/** 测试用：端口与轮换回调回到默认实现。 */
export function resetSessionRuntimeForTests(): void {
  currentRuntime = DEFAULT_RUNTIME;
  lxnsTokenRotation = () => undefined;
}
