# 2026-07-10 HTTP API 服务器实现

## 改动原因
需要为 rRanker demo 构建统一的 HTTP API 服务器，集成 LXNS 曲库代理、水鱼成绩代理、微信公众号爬虫控制等能力，替代之前的 `proxy.py`。

## 具体实现
- 新建 `demo/src/server.py`，纯标准库实现（不含 Flask/FastAPI）
- `start_server(host, port)` 兼容 `main.py` 的调用签名
- HTTP 路由：
  - `GET /` → 静态文件托管（FRONTEND/）
  - `GET /api/lxns/songs` → 代理落雪曲库，带内存缓存
  - `GET /api/df/scores?token=` → 代理水鱼成绩
  - `POST /api/crawl/start` → 生成 OAuth URL + 启动 mitmdump
  - `GET /api/crawl/status` → 实时爬取状态（步骤+日志）
  - `POST /api/crawl/cancel` → 终止爬虫
  - `GET /api/crawl/result` → 返回已爬取成绩
  - `POST /api/shutdown` → 安全关闭服务器
- 全响应 CORS (`Access-Control-Allow-Origin: *`)
- 爬取步骤检测：解析 mitmdump stdout 中的关键字推断当前阶段
- 子进程管理：非阻塞 stdout 线程读取 + kill 清理

## 期望输出
- 所有 API 端点正确响应，CORS 头部完整
- 爬虫启动/状态/取消/关闭流程正常运作
- `main.py` 可正常导入 `start_server` 并启动服务

## 实际输出
待验证。
