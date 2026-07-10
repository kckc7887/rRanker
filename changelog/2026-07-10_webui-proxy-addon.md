# 2026-07-10 webui-proxy-demo addon 移植

## 改动原因
webui-proxy-demo 需要一个能被主进程观测的 mitmproxy 插件，原 wechat-crawler-demo 仅依赖 ctx.log 终端输出，主进程难以稳定解析状态。改为通过文件（state.json / result.json）通信。

## 具体实现
- 新建 `webui-proxy-demo/addon.py`
- 从 `wechat-crawler-demo/wechat_addon.py` 移植拦截与爬取逻辑，保持不变：
  - 拦截 `wahlap` 域名下 `/wc_auth/oauth/callback/maimai-dx`
  - 提取 r/t/code/state 四个 query 参数
  - `MaimaiClient.wechat()` 换 cookies
  - `maimai.scores()` / `maimai.players()` 爬取
- 输出目录由环境变量 `RRANKER_OUTPUT_DIR` 决定，默认 `Path.cwd()`
- 新增 `state.json`：开始写 `{"status":"crawling"}`，完成写 `{"status":"done","count":N}`，失败写 `{"status":"error","message":"..."}`
- 新增 `result.json`：内容与 `maimai_scores.json` 完全一致（player + scores 结构）
- 保留 `maimai_scores.json` 写入以兼容旧消费者
- OAuth 捕获后输出 `OAUTH_CAPTURED` 标记行，便于主进程解析
- 完成或失败后仍调用 `ctx.master.shutdown()` 关闭 mitmproxy
- 关键步骤保留 `ctx.log.info` 日志

## 期望输出
- 拦截 OAuth 回调后产出三个文件：`state.json`、`result.json`、`maimai_scores.json`
- `state.json` 最终状态为 `done` 或 `error`

## 实际输出
文件已创建。尚未运行验证（需 mitmproxy + 微信环境），结构对照原 wechat_addon.py 一致，仅增量文件通信逻辑。
