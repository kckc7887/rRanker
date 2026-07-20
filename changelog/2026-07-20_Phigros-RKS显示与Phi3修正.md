# Phigros RKS 显示与 Phi3 修正

## 改动原因

用户游戏内 RKS 为 **16.17**（保留两位），应用显示 **15.6494**。

反推：`15.6494 × 30 ≈ 469.5`，恰好等于 **仅 Best27 成绩定数之和、Phi3 贡献为 0** 的结果；与正确值差约 `0.52 ≈ 15.6/30`，对应 **一整条 Phi3 谱面定数未被计入**。

根因：
1. 总览误用本地 `computeB30().rks`，在 Phi3 漏算时与游戏不一致
2. Phi3 用四舍五入后的 `acc >= 100` 判断，存档浮点 `99.996` 等会被判成 `99.99` 而排除
3. 定数表固定拉 OSS `current`，未按存档 `summary.gameVersion` 匹配

## 具体实现

1. **总览 RKS**：改回云存档 `summary.rankingScore`（与游戏内一致）
2. **`isAcc100Percent`**：`rawAcc >= 99.995` 视为 100%，Phi3 用未舍入的 `rawAcc`
3. **`parseGameRecord`**：保留 `rawAcc`；成绩定数用 `rawAcc` 计算
4. **`PhigrosScoreProvider`**：单次 `getGameSave` 缓存 summary + zip；定数表按 `gameVersion` 拉取

## 期望输出

- 总览 RKS 与游戏内一致（如 `16.17xx`，展示 4 位小数）
- Best/Phi3 列表与本地重算更接近

## 实际输出

- `phigros-save.test.ts` 9 项通过
