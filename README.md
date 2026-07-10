# rRanker

音游数据查分器。r = rhythm game, ranker = 冲击 ranking 的玩家。

首个游戏：舞萌DX。

## 功能

- **查分**：从水鱼/落雪查分器拉取成绩、曲库、B50
- **同步**：拦截华立微信公众号 OAuth，爬取完整成绩（含 fc/fs/rate），上传至水鱼和落雪
- **工具箱**：歌曲搜索、成绩筛选、Rating 计算、牌子进度、容错计算、收藏夹

## 技术栈

React Native（移动端）

详细的产品阶段、实现优先级与建议技术栈见 [ROADMAP.md](ROADMAP.md)。静态产品概念页见 [demo/index.html](demo/index.html)。

## 目录

```
/changelog          # 变更记录，每次改动一份 YYYY-MM-DD_主题.md
/docs               # 开发文档、API 协议
/demo               # 概念验证
/src                # 源码
wechat-crawler-demo/ # 微信公众号爬虫 Python 概念验证
```

## Agent 协作

见 [AGENTS.md](AGENTS.md)
