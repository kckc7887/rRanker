# Demo 网络层加固：避免 Remote end closed

## 改动原因
用户抓取时出现 `Remote end closed connection without response`，华立/CDN 常掐断 Python urllib 长连接或并发请求。

## 具体实现
- 请求改用 `Connection: close`，失败重试
- 五难度改为串行抓取
- 优先使用系统 `curl --http1.1`，并共用 cookie 文件
- 对 callback 尝试 http/https 变体；错误提示要求立刻用新鲜 code

## 期望输出
同样粘贴流程下连接更稳定，能写出 `last_scores.json`。

## 实际输出
Demo 已更新；需用户用新授权链接复测。
