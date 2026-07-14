# 粘贴 Demo 改为走 maimai_py（对齐代理 Demo）

## 改动原因
用户反馈连接一直被关闭。对照代理/本地服务 Demo：拿到回调后并不是 urllib 重放链接，而是 `maimai_py.wechat(**params)` 直连换 cookie 再爬成绩。

## 具体实现
- 重写 `oauth_paste_gui.py`：解析四参数 → `MaimaiClient.wechat` / `scores` / `players`
- 设置与 `webui-proxy-demo` 相同的 `NO_PROXY` 华立域名
- 移除自造 urllib/curl 回调请求路径

## 期望输出
粘贴新鲜最终链接后，能像代理 Demo 一样产出完整 `last_scores.json`。

## 实际输出
Demo 已对齐 `maimai_py` 链路；需用户用新 code 复测。
