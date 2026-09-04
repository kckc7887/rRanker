<div align="center">

![banner](./assets/images/rRanker%20banner.svg "rRanker")

# rRanker

[![license](https://img.shields.io/badge/license-AGPL--3.0-blue?style=flat-square)](LICENSE)
[![platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS-green?style=flat-square)]()
[![release](https://img.shields.io/github/v/release/kckc7887/rRanker?style=flat-square)](https://github.com/kckc7887/rRanker/releases)
[![last-commit](https://img.shields.io/github/last-commit/kckc7887/rRanker?style=flat-square)](https://github.com/kckc7887/rRanker/commits)
[![tech](https://img.shields.io/badge/React%20Native-Expo%20SDK%2054%20%7C%20TypeScript-blue?style=flat-square)]()

</div>
rRanker 是一个多音游数据管理应用。你可以在一个应用中查看不同游戏和账号的玩家数据、最佳成绩、完整成绩、曲库与歌曲详情，并使用针对各游戏提供的实用工具。

## 主要功能

- **数据查询**：查看玩家总览、最佳成绩、完整成绩、曲库和歌曲详情，并按游戏支持的条件搜索、筛选和排序。
- **账号管理**：按游戏支持的数据来源绑定多个账号，在不同游戏、账号和 osu! 模式之间快速切换。
- **个人曲库**：收藏歌曲、标记练习谱面，并为歌曲和谱面添加本地标签。
- **成绩图片**：为舞萌 DX、中二节奏和 Phigros 生成并导出预设或自定义成绩图片。
- **谱面功能**：查看舞萌 DX、Phigros 和 Phira 的谱面确认；下载舞萌 DX、Phigros、Phira 和 osu! 的谱面文件。
- **游戏工具**：提供随机歌曲、附近机厅查找，以及 Rating 计算、推分计算、实力分析、牌子与收藏品进度、版本对照、模组百科等游戏专属工具。
- **个性化与存储**：切换深浅色模式和主题色，调整成绩卡片曲绘效果，并查看或清理应用内存储。

## 支持游戏

| 游戏 | 支持范围 | 数据接入 |
| --- | --- | --- |
| [舞萌 DX](https://wc.wahlap.net/maidx/play/) | 玩家数据、曲库、谱面确认与下载、成绩图片、二维码同步及专属工具 | 水鱼查分器、落雪查分器、本地查分器、示例账号 |
| [中二节奏](https://wc.wahlap.net/chunithm/play/) | 玩家数据、曲库、成绩图片、Rating / OVER POWER 计算与收藏品进度 | 落雪查分器、示例账号 |
| [Phigros](https://www.taptap.cn/app/165287) | 玩家数据、曲库、谱面确认与下载、成绩图片、推分计算与实力分析 | TapTap 云存档、示例账号 |
| [Phira](https://phira.moe/) | 玩家数据、曲库、谱面确认与下载 | 公开玩家 ID 或用户名 |
| [osu!](https://osu.ppy.sh/) | osu!standard、osu!mania、osu!catch、osu!taiko；玩家数据、曲库、谱面下载与模组百科 | osu! 账号授权 |
| [喵斯快跑](https://musedash.peropero.net/) | 玩家数据、曲库与随机歌曲 | MuseDash.moe、示例账号 |
| [冰与火之舞](https://store.steampowered.com/app/977950/_A_Dance_of_Fire_and_Ice/) | 玩家数据、曲库与随机关卡 | TUF 社区公开玩家 |

## 🚀 快速开始

```bash
cd apps/mobile
npm install
npm start
```

## 🛠️ 技术栈

Expo SDK 54 · Expo Router · React Native 0.81 · React 19 · TypeScript strict · Zustand · TanStack Query · Expo SQLite · Expo SecureStore

## 🙏 致谢
- [Score Hub](https://github.com/bakapiano/maimai-score-hub)
- [水鱼查分器](https://maimai.diving-fish.com)
- [落雪咖啡屋](https://maimai.lxns.net/)
- [Phi-plugin](https://github.com/Catrong/phi-plugin)
- [maimai-prober-frontend](https://github.com/Lxns-Network/maimai-prober-frontend)
- [nonebot-plugin-maimaidx](https://github.com/Yuri-YuzuChaN/nonebot-plugin-maimaidx)
- [maimaiDX](https://github.com/Yuri-YuzuChaN/maimaiDX)
- [DXRating](https://github.com/gekichumai/dxrating)
- [nearcade](https://nearcade.phizone.cn/)
- [PhiZone Player](https://github.com/PhiZone/player)
- [phira](https://github.com/TeamFlos/phira)

第三方组件许可证与来源声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## ⚠️ 声明

本项目仅提供数据管理功能，本项目与相关的任何游戏官方没有任何关系。

## 📜 许可证

本项目采用 [GNU Affero General Public License v3.0](LICENSE)（SPDX：`AGPL-3.0-only`），Copyright (c) 2026 尘言 潁川ホコリ。
