# Phigros 云存档 UI 更新时间改为本地同步时刻

## 改动原因

总览「TapTap云存档」时间此前取 LeanCloud 存档的 `updatedAt`（游戏内上传时间）。用户点击「同步数据」后 App 已重新拉取，但云端时间未变则 UI 不动，与「同步成功应刷新顶部时间」的预期不符。

## 具体实现

1. **`phigros-score-provider.ts`**：新增 `lastFetchedAt`，在实际请求云存档元数据成功时写入；`source.updatedAt` / `getSyncedAt()` 用该值。LeanCloud `updatedAt` 仍由 `getSaveUpdatedAt()` 提供，仅用于下载缓存穿透。
2. **`use-game-data.ts`**：总览成绩来源时间改为 `getSyncedAt()`；查询版本升至 15。

## 期望输出

点击「同步数据」成功后，顶部 TapTap 云存档时间更新为本次拉取时刻；游戏资源时间仍仅在真正拉 OSS 时变化。

## 实际输出

同步成功后顶部时间随本地拉取时刻刷新；云端存档未变也不再挡住 UI 更新。
