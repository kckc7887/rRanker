# AGENTS.md

## 项目概述

rRanker — 音游数据查分器。首个游戏：舞萌DX。

- 查分：从水鱼/落雪拉取成绩、曲库
- 同步：拦截华立微信公众号 OAuth → 爬取完整成绩 → 上传水鱼/落雪

**技术栈**：React Native (移动端), Python (PC 同步), maimai_py (爬虫核心)

## 目录结构

```
/data                # 静态数据、API 协议文档
/docs                # 开发文档
/demo                # 概念验证/参考实现
/src                 # 主应用源码

wechat-crawler-demo/ # 微信公众号爬虫 Python 实现 (参考实现)
```

## CHANGELOG 规范

每次修改必须更新此表格。按时间倒序。

```
| 日期 | 文件 | 变更摘要 | Agent |
```

多人协作时每个 Agent 在执行变更前必须：
1. 读取此文件最新版本
2. 执行变更
3. 在此表格顶部追加记录
4. 提交时附上 Agent 标识

| 日期 | 文件 | 变更摘要 | Agent |
|------|------|---------|-------|
| 2026-07-10 | * | 项目初始化，清理旧文件，建立仓库 | init |
| 2026-07-10 | wechat-crawler-demo/ | 完成微信公众号爬虫概念验证：mitmproxy WFP拦截 + maimai_py 解析 → JSON | init |
| 2026-07-10 | docs/153.md (已删) | 确认华立1.53安全更新：机台QR码只返回 achievement+dxScore，无fc/fs | init |

## API 协议

### 水鱼 (DivingFish)
- 基础: `https://www.diving-fish.com/api/maimaidxprober/`
- 曲库: `GET /music_data`
- 查分: `GET /player/records` (header: `Import-Token` 或 cookie `jwt_token`)
- 上传: `POST /player/update_records` (header: `import-token`)
- B50: `POST /query/player` (body: `{username, qqid, b50:true}`)
- 登录: `POST /login`

### 落雪 (LXNS)
- 基础: `https://maimai.lxns.net/api/v0/`
- 曲库: `GET /maimai/song/list?notes=true`
- 查分: `GET /user/maimai/player/scores` (header: `Authorization: Bearer {token}`)
- 上传: `POST /user/maimai/player/scores`
- B50: `GET /user/maimai/player/bests`
- OAuth: `/oauth/authorize` → `/api/v0/oauth/token`

### 华立公众号爬虫
- OAuth: `GET https://tgk-wcaime.wahlap.com/wc_auth/oauth/authorize/maimai-dx` (微信 UA)
- 回调: `/wc_auth/oauth/callback/maimai-dx?r=&t=&code=&state=`
- 成绩: `GET maimai.wahlap.com/maimai-mobile/record/musicGenre/search/?genre=99&diff={0-4}`
- 玩家信息: `GET maimai.wahlap.com/maimai-mobile/friend/userFriendCode/`

### 数据格式差异
- 水鱼 musicId: NET原始ID (DX歌>10000不取模)
- 落雪 songId: NET原始ID % 10000 (DX歌减10000)
- 机台 achievement: 整数×10000，爬虫 achievement: 浮点百分比

## 代码约定

- 所有常量大写蛇形命名
- 函数小写驼峰
- 缩进 2 空格
- 提交信息格式：`[模块] 简述`
