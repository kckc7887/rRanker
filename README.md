# rRanker

音游数据查分器。r = rhythm game, ranker = 冲击 ranking 的玩家。

首个游戏：舞萌DX。

## 功能

- **查分**：从水鱼/落雪查分器拉取成绩、曲库、B50
- **数据接入**：主应用只从水鱼等 provider 读取；爬虫与成绩上传在其他非上传功能完成后再做
- **工具箱**：歌曲搜索、成绩筛选、Rating 计算、牌子进度、容错计算、收藏夹
- **未来同步**：爬虫只负责把成绩上传到水鱼/落雪；水鱼优先，落雪等待 API 申请

## 技术栈

React Native（移动端）

详细的产品阶段、实现优先级与建议技术栈见 [ROADMAP.md](ROADMAP.md)，双端验证方案见 [docs/mobile-testing.md](docs/mobile-testing.md)。

历史概念验证统一归档在本地 `demo/`，目录内容默认忽略，仅跟踪 [Demo 经验总结](demo/README.md)。

## 目录

```
/changelog          # 变更记录，每次改动一份 YYYY-MM-DD_主题.md
/docs               # 开发文档、API 协议
/demo               # 本地概念验证（Git 忽略代码与输出，仅保留 README）
/src                # 源码
```

## Agent 协作

见 [AGENTS.md](AGENTS.md)
