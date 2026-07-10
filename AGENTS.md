# AGENTS.md

每次执行变更必须：

1. 读取本文件最新版本
2. 执行变更
3. 在 `changelog/` 下新建 `YYYY-MM-DD_主题.md`，包含：改动原因、具体实现、期望输出、实际输出
4. 提交时在 commit message 末附 Agent 标识

不要：假定依赖存在、猜测 API 行为、跳过验证。
