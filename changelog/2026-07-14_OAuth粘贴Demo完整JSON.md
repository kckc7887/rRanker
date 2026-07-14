# OAuth 粘贴 Demo 输出完整解析 JSON

## 改动原因
用户在 App 换取会话出现 404，要求先改 Python Demo：把回调 URL 完整解析成 JSON 以便核对。

## 具体实现
- `oauth_paste_gui.py`：`parse_callback_to_json` 输出 raw、URL 结构、全部 query、四参数、`exchange_url`、warnings。
- 增加「解析为 JSON / 复制 JSON / 保存 JSON」；解析后写入同目录 `last_callback_parse.json`。

## 期望输出
粘贴最终链接后可见完整 JSON，并可复制/落盘。

## 实际输出
Demo 已更新；未改 App 上传逻辑。
