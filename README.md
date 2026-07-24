<div align="center">

![banner](./assets/images/rRanker%20banner.svg "rRanker")

# rRanker

</div>
rRanker 是一个聚合了多家音乐游戏数据的数据管理应用，提供基本的玩家数据查询与其他便利功能。目前已经支持了以下游戏：

- 舞萌DX [[网站]](https://wc.wahlap.net/maidx/play/)
- Phigros [[Apple Store]](https://apps.apple.com/cn/app/phigros/id1454809109) [[TapTap]](https://www.taptap.cn/app/165287?os=android) [[Google Play]](https://play.google.com/store/apps/details?id=com.PigeonGames.Phigros)

## 主要功能

1. 登录玩家账号。
1. 从游戏获取玩家数据。
1. 上传玩家数据至查分器。
1. 生成成绩图片：B50，B30或更多自定义选项。
1. 查询已经同步的玩家数据、游戏数据。
1. 收藏歌曲、谱面，为歌曲、谱面打标签。
1. 切换主题色，深浅色模式，快捷清理缓存。
1. 随机歌曲推荐。

## 各游戏部分的功能

- 舞萌DX
  - 使用[Score Hub](https://github.com/bakapiano/maimai-score-hub)相关服务，通过好友VS功能获取玩家数据，支持绑定多个好友码快捷切换，绑定神秘二维码后支持应用内实现同步，无需转至NET（功能偶尔不稳定，支持上传页实时显示服务状态）。
  - 查询玩家成绩，游戏曲库。
    - 查询谱面物量表，快捷计算达成率与容错。
    - 查询歌曲Rating，快速计算达成率-Rating。
  - 将玩家数据同步至查分器，支持[水鱼查分器](https://maimai.diving-fish.com)、[落雪咖啡屋](https://maimai.lxns.net/)，支持批量上传。
  - 歌曲详情页快捷跳转B站搜索谱面确认。
  - 查看歌曲可获得的的收藏品。
  - 牌子进度查询，可以固定到主页快捷查看追踪。
  - 查询国服日服版本名与代号对照，总结各版本游玩情况。
  - 生成成绩图片，快捷生成B50，支持更多自定义选项：
    - 玩家信息卡样式选择：游戏样式与应用样式，游戏样式时采用原版游戏风格。
    - 收藏品自定义：头像、姓名框、称号、背景。
    - 自定义数量。
    - 分辨率选择：1080p、1440p、2160p。
    - 自定义BestN。
    - 筛选当前版本或过往版本。
    - 限定达成率、成就（FC（单人成就）/FS（SYNC成就））、寸歌。
  - 曲库与成绩界面支持丰富的自定义筛选条件。

- Phigros
  - 通过TapTap登录玩家账号获取玩家数据。
  - 查询玩家成绩，游戏曲库。
    - 查询谱面物量表。
    - 查询歌曲RKS。
  - 推分歌曲推荐，根据玩家的期望加值（单位：总RKS）与期望成本（单位：首歌）列出可推歌曲，可筛选φ条件。
  - 生成成绩图片，快捷生成B30，支持更多自定义选项：
    - 选择OVER FLOW数量，0，3，6，9，对应0-3行。
    - 自定义收藏品：头像、背景。
    - 自定义数量。
    - 分辨率选择：1080p、1440p、2160p。
    - 筛选难度、评价、性歌（支持性GOOD与性MISS，应用内显示为XING-GOOD/XING-MISS）。
    - 限定分数与Acc范围。
## 待办事项
| 功能 | 状态 |
| --- | --- |
|基础框架搭建|✅|
|舞萌DX部分·基础功能实现|✅|
|Phigros素材分发用的对象存储搭建|✅|
|Phigros部分·基础功能实现|✅|
|存储管理与缓存清理|✅|
|深色模式适配与主题色切换|✅|
|撰写一份完整的`README.md`|✅|
|收藏系统|✅|
|中二节奏部分·基础功能实现|🚧|
|喵斯快跑部分·基础功能实现|🚧|

##  快速开始
```bash
cd apps\mobile
npm install
npm start   
```
## 技术栈

Expo SDK 54 · Expo Router · React Native 0.81 · React 19 · TypeScript strict · Zustand · TanStack Query · Expo SQLite · Expo SecureStore

## 致谢
- [Score Hub](https://github.com/bakapiano/maimai-score-hub)
- [水鱼查分器](https://maimai.diving-fish.com)
- [落雪咖啡屋](https://maimai.lxns.net/)
- [Phi-plugin](https://github.com/Catrong/phi-plugin)

## 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)（SPDX：`AGPL-3.0-only`），Copyright (c) 2026 Chnynnya。
