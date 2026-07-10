# webui-proxy-demo index.html 前端页面

## 改动原因
`webui-proxy-demo/` 缺少前端页面。Spec（add-webui-proxy-demo）要求单文件原生 HTML 作为 webUI，用户双击 exe 后浏览器打开此页，配合后端 `GET/POST /api/*` 完成代理启动、OAuth 引导、成绩展示的状态机交互。

## 具体实现
- 新增 `webui-proxy-demo/index.html`（单文件，内联 CSS/JS，无任何外部依赖）。
- 页面结构：标题区 / 操作区（start-btn + stop-btn）/ 状态显示区（status-area）/ 成绩区（scores-area，默认隐藏）。
- 状态机 UI 覆盖六态：
  - `idle`：开始按钮可用，提示「点击开始按钮启动」。
  - `proxy_starting`：禁用开始按钮 + CSS 旋转 loading。
  - `waiting_oauth`：渲染 oauth_url 超链接 + 只读文本框 + 复制按钮（navigator.clipboard 带 execCommand fallback）+ 三步操作引导 + CA 证书红色提示框；显示停止按钮。
  - `crawling`：隐藏操作区 + loading。
  - `done`：隐藏操作区与状态区，渲染玩家卡片（名称/Rating/牌子/好友码）+ 成绩表格；停止轮询。
  - `error`：显示后端 error 字段 + 重试按钮（复用 startFlow）；停止轮询。
- API 交互：`POST /api/start` 后每秒 `GET /api/status` 轮询；`POST /api/stop` 后继续轮询回到 idle；done/error 停止轮询。
- 成绩表格：8 列（曲名/类型/难度/达成率/DX分/FC/FS/Rate），表头 sticky，max-height 60vh 滚动，斑马纹（奇数行 `rgba(255,255,255,0.03)`），hover 高亮。
- 字段映射依据 `webui-proxy-demo/addon.py` 与 `wechat-crawler-demo/maimai_scores.json` 实际结构：
  - type: `dx`→DX / `standard`→STD（彩色 tag）
  - level_index 0-4 → BAS/ADV/EXP/MAS/Re:MAS（游戏标准配色）
  - achievements: `toFixed(4)`
  - fc/fs/rate: `toUpperCase()`，null 显示 `-`
- 样式：深色主题 `#1a1a2e` 背景 + 紫色系强调（`#7b2ff7`/`#9d4edd`），系统默认 sans-serif，卡片圆角 8px，按钮 hover 上移 + 阴影，CSS @keyframes 旋转 loading，响应式 max-width 900px 居中，600px 断点适配。

## 期望输出
- 双击 exe（或 `python server.py`）后浏览器打开页面，初始为 idle 态。
- 点击开始后能按后端状态正确切换 UI，done 时展示玩家信息与成绩表格。
- 无外部网络请求，单文件可独立运行。

## 实际输出
- 已写入 `webui-proxy-demo/index.html`（633 行）。
- 未运行后端验证（server.py 尚未实现，本任务仅前端页面）。字段映射已对照 addon.py 输出结构与示例 JSON 确认一致。
- 后端 `GET /api/status` 在 done 态需返回 `{status, player, scores}`，waiting_oauth 态需返回 `{status, oauth_url}`，error 态需返回 `{status, error}`——前端按此契约消费。
