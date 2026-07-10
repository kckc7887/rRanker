# 2026-07-10 server.py 证书前置 + 曲库端点 + 临时目录清理 + reset

## 改动原因
1. 证书原先在 `/api/start` 时才安装，首次安装后爬取必报错、需重试。改为启动时即检测安装。
2. 需要提供落雪曲库 `/api/songs` 端点供前端展示曲目信息。
3. `_start_mitm` 创建的临时目录从不清理，存在泄漏。
4. 缺少重置状态回到 idle 的端点。

## 具体实现
文件：`webui-proxy-demo/server.py`

- 导入新增 `shutil`、`urllib.request`。
- 新增模块级变量 `_lxns_songs`（dict: song_id → {title, artist}）。
- 新增 `_fetch_lxns_songs()`：urllib 请求 `https://maimai.lxns.net/api/v0/maimai/song/list`，解析 songs 数组构建映射，失败置空 dict。
- 新增 `_is_cert_installed()`：PowerShell 查询 `Cert:\CurrentUser\Root` 是否含 mitmproxy 证书。
- 新增 `_ensure_cert_ready()`：检测 → 生成(`_ensure_mitm_cert`) → 安装(`_install_mitm_cert`) → 重新检测确认。
- `_start_mitm()`：删除其中证书生成/安装调用（已前置），保留函数定义。
- 新增 `_cleanup_tempdir()`：`shutil.rmtree` 删除 `_output_dir` 并置 None。
- `_finish_crawl()` 末尾调用 `_cleanup_tempdir()`（result 已读入内存）。
- `_cleanup()`（atexit）末尾调用 `_cleanup_tempdir()`。
- `_handle_stop()`：回 idle（无结果）时清理临时目录；回 done（有结果）保留。
- 新增 `GET /api/songs` 路由 + `_handle_songs()`：返回 `{"songs": _lxns_songs or {}}`。
- 新增 `POST /api/reset` 路由 + `_handle_reset()`：停 mitm、关代理、清临时目录、状态置 idle。
- `main()`：HTTP 服务启动前调用 `_ensure_cert_ready()`（失败仅警告不阻止启动）；后台线程启动 `_fetch_lxns_songs()`。

## 期望输出
- 启动时证书已就绪，首次 `/api/start` 爬取不再因证书报错。
- `/api/songs` 返回曲库映射，加载中返回空对象。
- 爬取完成/中止/重置后临时目录被清理，不再泄漏。
- `/api/reset` 将状态清回 idle。
- `python -m py_compile` 通过。

## 实际输出
- `python -m py_compile webui-proxy-demo/server.py` 退出码 0，语法校验通过。
- 落雪 API 实际返回结构经网络验证为 `{"songs":[{"id":int,"title":str,"artist":str,...}]}`，无 envelope 包裹，解析逻辑与之匹配。
- 运行时行为待集成验证。
