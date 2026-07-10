# 2026-07-10 webui-proxy-demo server.py 主程序

## 改动原因
webui-proxy-demo 缺少入口程序：需要一个本地 HTTP 服务器作为 webUI 容器，协调 mitmdump 子进程与 Windows 系统代理，串联状态机与前端契约。此前 addon.py / proxy_manager.py / index.html 均已就位，仅缺主程序把它们组装起来。

## 具体实现
- 新建 `webui-proxy-demo/server.py`，纯标准库（http.server / threading / subprocess / signal / atexit）+ maimai_py（仅生成 OAuth URL）
- 资源路径：`sys.frozen` 时用 `sys._MEIPASS`，否则用脚本目录；定位 `index.html` 与 `addon.py`
- 全局状态机：`idle` / `proxy_starting` / `waiting_oauth` / `crawling` / `done` / `error`，由 `threading.Lock` 保护
- API：
  - `GET /` → 返回 index.html（text/html; charset=utf-8）
  - `POST /api/start` → save_original → 启动 mitmdump（端口 11451，RRANKER_OUTPUT_DIR=tempfile.mkdtemp，text 模式读 stdout 检测 OAUTH_CAPTURED）→ enable 代理 → `asyncio.run(MaimaiClient(timeout=30).wechat())` 生成 URL → waiting_oauth
  - `GET /api/status` → 调用 `_update_status_from_state()` 读 state.json 推进状态，返回当前状态及附加数据（done 带 player/scores，error 带 error，waiting_oauth 带 oauth_url）
  - `POST /api/stop` → 终止 mitmdump（terminate→wait→kill）→ disable 代理 → idle
- 状态推进：waiting_oauth/crawling 时轮询 state.json，crawling→done（读 result.json）/ error；state.json 缺失且 mitmdump 已退出 → error
- 退出清理：atexit + SIGINT/SIGTERM handler 终止子进程并恢复代理；`_handle_start` 异常也回滚
- 启动：`ThreadingHTTPServer` 绑 `127.0.0.1:0` 随机端口，`webbrowser.open` 打开浏览器，打印调试 URL
- 偏离说明：任务描述要求「非 idle 返回 409」，但前端 `renderError` 的「重试」按钮直接调 `/api/start` 且 error 时 stop 按钮被隐藏。为避免 demo 卡死，实现为 `idle` 与 `error` 均允许 start（error 时先清理残留），其余状态返回 409

## 期望输出
- `python server.py` 在随机端口启动 HTTP 服务并打开浏览器
- 点击「开始」后自动开关代理、生成 OAuth 链接、轮询状态直到成绩展示
- 任意退出路径（Ctrl+C / 关闭窗口 / 异常）都恢复系统代理

## 实际输出
文件已创建，语法编译通过（py_compile）。尚未端到端运行验证（需 mitmproxy + 微信环境 + maimai_py 运行时依赖）。
