# WebUI 代理 Demo Spec

## Why
现有 `wechat-crawl.py` 是命令行版，需要用户手动复制 OAuth 链接、手动以管理员身份运行、手动等待。要发给朋友验证时门槛太高。需要一个双击即用的 exe，带 webUI 引导操作，核心自动化点在于代理的自动开启与关闭。

## What Changes
- 新增 `webui-proxy-demo/` 目录，独立于现有 demo
- 用 Python 标准库 `http.server` 起本地 webUI（零额外 web 框架依赖）
- webUI 提供一个「开始」按钮，点击后由后端自动：启动 mitmdump → 设置 Windows 系统代理 → 生成 OAuth 链接 → 前端展示链接与操作引导
- mitmproxy 拦截到 OAuth 回调后自动爬取成绩，结果以列表形式展示在 webUI 上
- 爬取完成或用户中止时自动恢复系统代理设置并终止 mitmdump
- 用 PyInstaller 打包成单 exe，把 mitmproxy / maimai_py 及其数据文件全部内嵌
- **BREAKING**：无（新 demo，不改动现有代码）

## Impact
- Affected specs: 无（独立 demo）
- Affected code: 新增文件，不修改 `wechat-crawler-demo/` 任何内容
- 复用：`wechat_addon.py` 的拦截逻辑会被移植进新 demo 的 addon 模块

## 技术选型
- **后端**：Python 标准库 `http.server` + `threading`，不引入 Flask/FastAPI
- **代理**：mitmproxy（mitmdump subprocess），regular 模式（非 WFP），通过 Windows 注册表 + WinINet API 自动设置/取消系统代理，避免管理员权限要求
- **爬取**：maimai_py（复用现有 wechat_addon 逻辑）
- **前端**：单个 `index.html`，原生 HTML/CSS/JS，无构建步骤
- **打包**：PyInstaller `--onefile`，`--collect-all mitmproxy --collect-all maimai_py` 确保数据文件齐全
- **理由**：Python 复用现有代码最舒服；标准库 http.server 零额外依赖；regular 模式免管理员权限，朋友双击即用

## ADDED Requirements

### Requirement: 一键启动 webUI
系统 SHALL 在 exe 启动时自动开启本地 HTTP 服务并打开默认浏览器访问 webUI。

#### Scenario: 正常启动
- **WHEN** 用户双击 exe
- **THEN** 本地 HTTP 服务在随机可用端口启动
- **AND** 默认浏览器自动打开 `http://127.0.0.1:<port>/`
- **AND** webUI 显示一个「开始」按钮和简短说明

### Requirement: 自动开关代理
系统 SHALL 在用户点击「开始」后自动开启系统代理，并在爬取完成或异常退出时自动恢复原代理设置。

#### Scenario: 开启代理
- **WHEN** 用户点击「开始」按钮
- **THEN** 后端启动 mitmdump 监听本地端口
- **AND** 通过修改注册表 `HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 设置 `ProxyEnable=1` 和 `ProxyServer=127.0.0.1:<port>`
- **AND** 调用 `InternetSetOption` 通知系统刷新代理设置
- **AND** 前端进入「等待 OAuth」状态

#### Scenario: 关闭代理（正常完成）
- **WHEN** mitmproxy 拦截到 OAuth 回调并完成爬取
- **THEN** 后端终止 mitmdump 进程
- **AND** 恢复用户原始的 `ProxyEnable` 和 `ProxyServer` 值
- **AND** 调用 `InternetSetOption` 刷新
- **AND** 前端展示成绩列表

#### Scenario: 关闭代理（异常或中止）
- **WHEN** 爬取失败、mitmdump 崩溃、或用户关闭 exe
- **THEN** 系统同样恢复原始代理设置
- **AND** 确保不留残余代理配置导致用户断网

### Requirement: OAuth 链接生成与引导
系统 SHALL 在代理开启后生成 OAuth 链接并在 webUI 上展示使用步骤。

#### Scenario: 展示链接
- **WHEN** 代理开启成功
- **THEN** 后端调用 `maimai_py.MaimaiClient.wechat()` 生成 OAuth URL
- **AND** 前端显示该链接（可复制）和操作步骤：「在 PC 微信内打开此链接」
- **AND** 前端显示等待状态指示器

### Requirement: 成绩列表展示
系统 SHALL 在爬取完成后将成绩以列表形式展示在 webUI 上。

#### Scenario: 成功爬取
- **WHEN** mitmproxy 完成五难度并行爬取
- **THEN** 后端将 `maimai_scores.json` 的内容通过 API 返回给前端
- **AND** 前端渲染成绩列表（曲名、难度、达成率、DX 分、fc/fs/rate）
- **AND** 前端显示玩家信息（名称、Rating、牌子）

### Requirement: 状态机
系统 SHALL 通过一个状态 API 让前端轮询当前进度。

#### Scenario: 状态流转
- **WHEN** 前端每秒轮询 `/api/status`
- **THEN** 后端返回当前状态：`idle` / `proxy_starting` / `waiting_oauth` / `crawling` / `done` / `error`
- **AND** 在 `done` 状态时附带成绩数据
- **AND** 在 `error` 状态时附带错误信息

### Requirement: 打包为单 exe
系统 SHALL 通过 PyInstaller 打包成单个 exe 文件，内含所有运行时依赖。

#### Scenario: 零安装运行
- **WHEN** 用户在没有 Python 环境的 Windows 机器上双击 exe
- **THEN** 程序正常运行，无需安装任何依赖
- **AND** mitmproxy / maimai_py 及其 CA 证书数据文件全部从 exe 内加载

## MODIFIED Requirements
无（全新 demo）。

## REMOVED Requirements
无。

## 约束与边界
- 仅支持 Windows（朋友验证场景，不跨平台）
- regular 模式不需要管理员权限；若用户微信不走系统代理则无法拦截，需在前端明确提示
- 不处理 mitmproxy CA 证书安装问题——首次使用需用户手动信任（在 webUI 上说明）
- exe 体积预计 80-150MB（mitmproxy 依赖较大），可接受
