# rRanker

音游数据查分器。r = rhythm game, ranker = 冲击 ranking 的玩家。

首个游戏：舞萌DX。

## 功能

- **查分**：从水鱼/落雪查分器拉取成绩、曲库、B50
- **同步**：移动端数据接入方式待 Android/iOS 真机验证；现有电脑端爬虫仅为概念验证
- **工具箱**：歌曲搜索、成绩筛选、Rating 计算、牌子进度、容错计算、收藏夹

## 技术栈

React Native（移动端）

详细的产品阶段、实现优先级与建议技术栈见 [ROADMAP.md](ROADMAP.md)，双端验证方案见 [docs/mobile-testing.md](docs/mobile-testing.md)。

## 目录

```
/changelog          # 变更记录，每次改动一份 YYYY-MM-DD_主题.md
/docs               # 开发文档、API 协议
/src                # 源码
wechat-crawler-demo/ # 电脑端微信公众号爬虫概念验证，不作为正式客户端
```

## Agent 协作

见 [AGENTS.md](AGENTS.md)
