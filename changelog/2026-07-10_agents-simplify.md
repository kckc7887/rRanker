# 2026-07-10 AGENTS精简与文档拆分

## 改动原因
AGENTS.md 内容过于冗杂——包含了 API 协议、代码约定等不属于 Agent 行为约束的内容。

## 具体实现
- AGENTS.md 精简为 8 行纯行为约束：读取文件 → 执行变更 → 写 changelog → 提交附 Agent 标识
- API 协议独立为 `docs/api-protocol.md`
- 项目概述、目录结构、技术栈移至顶层自述（待建）

## 期望输出
AGENTS.md 只包含 Agent 行为规则，其余文档分散在各处。

## 实际输出
```
rRanker/
├── AGENTS.md              # 8行纯行为约束
├── docs/
│   └── api-protocol.md    # API协议完整文档
├── changelog/
│   └── ...
└── wechat-crawler-demo/
```
