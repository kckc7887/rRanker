# 2026-07-12 AGENTS.md 调整为中文撰写并去除 Agent 标识

## 改动原因

用户要求 changelog 与 commit message 必须使用中文撰写，且 commit 不再附加 Agent 标识。原 AGENTS.md 第 3、4 条未强制语言，并要求末附 Agent 标识，与新规范不一致。

## 具体实现

- 第 3 条补充“使用中文撰写”约束，适用于 `changelog/` 下所有 `YYYY-MM-DD_主题.md`。
- 第 4 条由“commit message 末附 Agent 标识”改为“commit message 使用中文撰写，不再附加 Agent 标识”。

## 期望输出

- 后续所有 changelog 文件均以中文撰写。
- 后续所有 commit message 均以中文撰写，且不携带 Agent 标识。

## 实际输出

- AGENTS.md 第 3、4 条已更新。
- 本 changelog 即按新规范以中文撰写。
