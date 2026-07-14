# OAuth 粘贴 Demo 抓取五难度完整 JSON

## 改动原因
用户需要的不是仅解析四参数，而是换 cookie 后抓完五个难度，输出完整成绩 JSON。

## 具体实现
- `oauth_paste_gui.py`：粘贴最终链接 → `exchange_session`（优先原始 URL）→ 并行抓 diff 0–4 → `last_scores.json`
- GUI 主按钮改为「抓取五难度 JSON」；保留「仅解析参数」
- 纯标准库，不依赖 mitmproxy / maimai_py

## 期望输出
成功后得到含 `player`、`per_diff_counts`、全部 `scores` 的 JSON 文件。

## 实际输出
Demo 已升级为完整抓取链路；需用户用新鲜最终链接实测验收。
