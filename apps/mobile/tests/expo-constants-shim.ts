/**
 * Vitest 用 expo-constants 替身：Node 环境没有原生层，expoConfig 恒为空。
 * 需要构建配置的测试直接改 process.env 或模块级注入，不经过此替身。
 */
const Constants = {
  expoConfig: undefined as { extra?: Record<string, unknown> } | undefined,
};

export default Constants;
