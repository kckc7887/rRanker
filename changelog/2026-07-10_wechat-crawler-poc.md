# 2026-07-10 微信公众号爬虫概念验证

## 改动原因
需要验证从华立公众号爬取舞萌DX成绩的可行性，作为 rRanker 同步服务的核心能力。

## 具体实现
- `wechat_crawl.py`: 主入口，启动 mitmproxy + 生成 OAuth URL + 等待拦截完成
- `wechat_addon.py`: mitmproxy 插件，拦截 `tgk-wcaime.wahlap.com` 的 OAuth 回调 URL
- 拦截到 `r/t/code/state` 后通过 `maimai_py` 的 `WechatProvider` 换取 cookies
- 并行爬取 5 个难度级别的成绩 HTML（genre=99&diff=0..4）
- `maimai_py` 的 `page_parser` 用 lxml XPath 解析 HTML，提取：
  - 曲名、难度、达成率、DX分
  - FC/FS 状态（从图片 src 推断）
  - 评级（rate）、谱面类型（SD/DX）
- 输出 `maimai_scores.json`（697 条成绩）

## 调试过程
- PC 微信内置浏览器不走系统代理 → 改用 mitmproxy `--mode local`（WFP 驱动层拦截）
- `--set block_global=false` 导致所有连接 502 → 移除，WFP 全量拦截
- 非 wahlap 请求被丢弃导致微信端显示 502 → 核心数据不受影响，UI 优化留后
- mitmproxy 日志含非 ASCII 字符 → GBK 编码报错 → 全部英文日志
- WinError 121 偶发 → WFP 模式下的已知副作用，不影响结果

## 期望输出
爬取完整成绩数据，包含 fc/fs/rate 字段。

## 实际输出
```
Player: Ｃｈｎｙｎｎｙａ  Rating: 14525
Scores: 697 条
fc 有值:  213/697
fs 有值:  578/697
rate 有值: 697/697
play_time: 0/697
```

fc/fs/rate 完整，play_time 未提取（genre 搜索页不含此字段，需单独请求 record 页）。
