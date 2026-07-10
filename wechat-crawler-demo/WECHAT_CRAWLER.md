# 舞萌DX 微信公众号爬取方案

## 原理

华立科技为舞萌DX国服提供微信公众号「舞萌DX」，玩家可以在其中查看自己的游戏成绩。公众号网页展示了完整的数据：曲名、难度、达成率、DX分数、FC/FS状态、评级。

本方案通过 mitmproxy 拦截微信 OAuth 认证回调，获取会话 cookies，再利用 cookies 并行爬取五个难度级别的成绩页面，以 lxml HTML 解析提取结构化数据。

## 数据完整度对比

| 字段 | 机台QR码 | 微信公众号爬虫 |
|------|---------|-------------|
| musicId | ✓ | ✓ |
| title | ✓ | ✓ |
| type (DX/SD) | ✓ | ✓ |
| level | ✓ | ✓ |
| level_index | ✓ | ✓ |
| achievements | ✓ | ✓ |
| dx_score | ✓ | ✓ |
| dx_rating | (计算得出) | (计算得出) |
| **fc** | ✗ | ✓ |
| **fs** | ✗ | ✓ |
| **rate** | ✗ | ✓ |
| play_time | ✗ | ✗ |

> 机台QR码在1.53更新后仅返回四个基本字段。

## 依赖

```
pip install maimai-py mitmproxy
```

Windows 上 mitmproxy 首次使用需安装 CA 证书：

```powershell
certutil -addstore Root ~\.mitmproxy\mitmproxy-ca-cert.pem
```

## 使用方式

以**管理员身份**运行：

```bash
python wechat_crawl.py
```

1. 脚本启动 mitmproxy，通过 WFP 驱动层拦截所有 TCP:80/443 流量
2. 终端打印 OAuth 认证链接
3. 在 PC 微信内打开该链接
4. 微信浏览器完成 OAuth 跳转时，mitmproxy 拦截回调 URL 提取参数
5. 自动换取 cookies → 爬取五个难度成绩页面 → 保存为 `maimai_scores.json`
6. 代理自动关闭，流量恢复

## 架构

```
wechat_crawl.py          -- 启动 mitmproxy + 管理生命周期
wechat_addon.py          -- mitmproxy 插件，拦截 OAuth + 触发爬虫
maimai_py (WechatProvider) -- cookies 换取 + HTML 爬取 + 数据解析
maimai_scores.json       -- 输出文件
```

### 爬取流程

```
微信OAuth跳转
  GET tgk-wcaime.wahlap.com/wc_auth/oauth/callback/maimai-dx
      ?r=xxx&t=xxx&code=xxx&state=xxx
               │
               ▼ mitmproxy 拦截
      提取 r, t, code, state
               │
               ▼ maimai_py.wechat()
      换取 cookies (_t + userId)
               │
               ▼ 并行 GET (5 难度)
      /record/musicGenre/search/?genre=99&diff=0  (Basic)
      /record/musicGenre/search/?genre=99&diff=1  (Advanced)
      /record/musicGenre/search/?genre=99&diff=2  (Expert)
      /record/musicGenre/search/?genre=99&diff=3  (Master)
      /record/musicGenre/search/?genre=99&diff=4  (Re:Master)
               │
               ▼ lxml XPath 解析
      提取 曲名/难度/达成率/DX分/fc/fs/rate/type
               │
               ▼ 保存 JSON
```

### OAuth 参数说明

| 参数 | 说明 |
|------|------|
| `r` | OAuth 重定向标识 |
| `t` | 时间戳 |
| `code` | 授权码（一次性） |
| `state` | CSRF 防护令牌 |

四者缺一不可，由 mitmproxy 在 HTTPS 层拦截获取。

## 已知限制

1. **需要管理员权限**：mitmproxy 的 WFP 模式需管理员运行
2. **微信显示 502**：非目标域名的请求被 mitmproxy 丢弃，微信内置浏览器会显示错误页面（实际数据已在后台成功抓取）
3. **play_time 缺失**：genre 搜索页面不包含游玩时间，可单独爬 `/maimai-mobile/record/` 获取
4. **WiinError 121**：WFP 模式下偶发的超时警告，不影响爬取结果

## 后续改进方向

- 拦截到 OAuth 回调后，返回自定义 HTML 页面（如进度提示），避免微信端 502
- 增加 play_time 字段（单独请求 record 页）
- 封装为 rRanker 内部模块
