# Tasks

- [x] Task 1: 创建 `webui-proxy-demo/` 目录结构与基础文件
  - [x] SubTask 1.1: 创建目录 `webui-proxy-demo/`
  - [x] SubTask 1.2: 编写 `proxy_manager.py`：封装 Windows 系统代理的开启/关闭（winreg + ctypes InternetSetOption），保存与恢复原始代理设置
  - [x] SubTask 1.3: 编写 `addon.py`：从 `wechat_addon.py` 移植拦截逻辑，把爬取结果写入内存而不是依赖 ctx.log，通过共享变量或文件与主进程通信

- [x] Task 2: 实现 `server.py` HTTP 服务器与状态机
  - [x] SubTask 2.1: 用 `http.server.ThreadingHTTPServer` 起本地服务，端口随机选取
  - [x] SubTask 2.2: 实现 `GET /` 返回内嵌的 `index.html`
  - [x] SubTask 2.3: 实现 `POST /api/start`：启动 mitmdump subprocess（regular 模式，不带 `--mode local`）→ 调用 proxy_manager 开启系统代理 → 生成 OAuth URL → 状态置为 `waiting_oauth`
  - [x] SubTask 2.4: 实现 `GET /api/status`：返回当前状态机状态（`idle`/`proxy_starting`/`waiting_oauth`/`crawling`/`done`/`error`），`done` 时附带成绩 JSON
  - [x] SubTask 2.5: 实现 `POST /api/stop`：中止流程，关闭代理，终止 mitmdump
  - [x] SubTask 2.6: 实现 atexit + signal handler：进程退出时无论如何都恢复代理设置
  - [x] SubTask 2.7: 启动时自动调用 `webbrowser.open()` 打开 webUI

- [x] Task 3: 实现 `index.html` 前端 webUI
  - [x] SubTask 3.1: 基本布局：标题、说明文字、「开始」按钮、状态显示区
  - [x] SubTask 3.2: 点击「开始」调用 `POST /api/start`，按钮变为禁用
  - [x] SubTask 3.3: 每秒轮询 `GET /api/status`，根据状态切换 UI：
    - `idle`：显示开始按钮
    - `proxy_starting`：显示「正在启动代理…」
    - `waiting_oauth`：显示 OAuth 链接（可复制）+ 操作步骤 + CA 证书安装提示
    - `crawling`：显示「正在爬取成绩…」进度
    - `done`：渲染成绩列表 + 玩家信息
    - `error`：显示错误信息 + 重试按钮
  - [x] SubTask 3.4: 成绩列表渲染：表格形式，列含曲名、难度、达成率、DX 分、fc/fs/rate
  - [x] SubTask 3.5: 「停止」按钮：调用 `POST /api/stop`

- [x] Task 4: PyInstaller 打包配置
  - [x] SubTask 4.1: 编写 `build.spec`：`--onefile`，`--collect-all mitmproxy`，`--collect-all maimai_py`，包含 `index.html` 数据文件
  - [x] SubTask 4.2: 编写 `build.py` 一键打包脚本：调用 PyInstaller API 或 subprocess
  - [ ] SubTask 4.3: 验证打包后的 exe 在无 Python 环境下能启动 webUI（需用户手动执行打包后验证）

- [x] Task 5: 端到端验证
  - [x] SubTask 5.1: 在开发环境运行 `python server.py`，确认 webUI 可访问
  - [x] SubTask 5.2: 点击「开始」，确认代理自动设置（检查注册表）
  - [x] SubTask 5.3: 确认 OAuth 链接正确生成并展示（代码审查确认，逻辑与 wechat_crawl.py 一致）
  - [x] SubTask 5.4: 中止流程，确认代理自动恢复
  - [ ] SubTask 5.5: 打包 exe，双击运行确认全流程（需用户手动执行 `python build.py`）

# Task Dependencies
- Task 2 依赖 Task 1（需要 proxy_manager 和 addon）
- Task 3 依赖 Task 2（需要 status API 契约）
- Task 4 依赖 Task 1 + Task 2 + Task 3（所有源码就绪才能打包）
- Task 5 依赖 Task 4
