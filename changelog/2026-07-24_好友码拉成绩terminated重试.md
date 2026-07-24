# 好友码拉成绩 terminated 断连重试

## 改动原因

安卓端好友码同步时，难度尚未全部获取完就提示 `terminated` 并整段失败。根因是 score-hub 轮询里**任意一次** HTTP 请求断连（原生 fetch 常抛 `terminated` / `fetch failed`）会直接抛出，尽管服务端 `update_score` 任务仍在继续抓取。

## 具体实现

- `score-hub-client`：将 `terminated`、超时、网络类错误标为可重试；`pollUpdateScoreUntilDone` / `pollLoginUntilToken` 捕获后继续轮询至总时限
- 瞬时断连时向 UI 上报「网络连接中断，正在重试…」，避免只看到硬失败
- `UploadDataSheet`：上传进行中不再因 accounts/session 变化重置表单与阶段
- 新增 `score-hub-poll-retry` 单元测试

## 期望输出

- 单次 poll 出现 `terminated` 时同步不中断，继续等到 job `completed` 或总超时
- 相关单测通过

## 实际输出

- `vitest run`：77 个文件、388 项测试全部通过
