# score-hub 好友码拉成绩本地 Demo

## 改动原因

用户只要好友码验证 score-hub 链路：提示加好友 → 轮询登录 → 单次拉成绩 JSON；要求少打公网、不做查分器导出。

## 具体实现

- 新增 `demo/score-hub-friendcode-demo/fetch_scores.py`（标准库）：`bot_sends_request` 登录、慢轮询、一次 `update_score`、写 `out/latest_sync.json`。
- 更新 `demo/README.md` 归档表。

## 期望输出

用户在舞萌 NET 接受 Bot 后，本地得到成绩 JSON；无 prober 导出请求。

## 实际输出

Demo 已落盘；需用户在运行时完成加好友后验证端到端。
